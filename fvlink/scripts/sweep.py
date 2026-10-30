"""Robustness sweep: every DYNWAVE model in EPA's swmm-nrtestsuite (v2.5.0-dev)
gets one conduit switched to finite volume -- the conduit with the largest
peak flow in the stock run that the FV validator accepts -- and the result is
compared with stock 5.2.4.

usage: python3 scripts/sweep.py <stock_exe> <fv_exe> <nrtest_root> <work_dir> <results_csv>
"""
import csv
import os
import re
import shutil
import subprocess
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from outread import read_out    # noqa: E402

STOCK, FV, ROOT, WORK, CSV = sys.argv[1:6]
os.makedirs(WORK, exist_ok=True)


def sections(path):
    sec, out = None, {}
    for line in open(path, encoding="latin-1"):
        s = line.split(";")[0].strip()
        if not s:
            continue
        if s.startswith("["):
            sec = s.upper()
            out.setdefault(sec, [])
            continue
        if sec:
            out[sec].append(s.split())
    return out


def run(exe, inp, rpt, out):
    t0 = time.perf_counter()
    subprocess.run([exe, os.path.basename(inp), rpt, out],
                   cwd=os.path.dirname(inp), stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, timeout=900, check=False)
    return time.perf_counter() - t0


def rpt_val(rpt, pat, last=True):
    txt = open(rpt, encoding="latin-1").read()
    m = re.findall(pat, txt)
    if not m:
        return None
    return m[-1] if last else m[0]


rows = []
for inp in sorted(p for p in (os.path.join(dp, f) for dp, _, fs in os.walk(ROOT)
                              for f in fs) if p.endswith(".inp")):
    name = os.path.splitext(os.path.basename(inp))[0]
    sec = sections(inp)
    opts = {r[0].upper(): r[1].upper() for r in sec.get("[OPTIONS]", []) if len(r) > 1}
    if opts.get("FLOW_ROUTING", "") not in ("DYNWAVE", "DYNAMIC_WAVE", "DW"):
        rows.append({"model": name, "routing": opts.get("FLOW_ROUTING", "?"),
                     "status": "skipped (not DYNWAVE)"})
        continue
    conduits = [r[0] for r in sec.get("[CONDUITS]", [])]
    shapes = {r[0]: r[1].upper() for r in sec.get("[XSECTIONS]", []) if len(r) > 1}
    a_rpt = os.path.join(WORK, name + ".dw.rpt")
    a_out = os.path.join(WORK, name + ".dw.out")
    wa = run(STOCK, inp, a_rpt, a_out)
    if not os.path.exists(a_out) or os.path.getsize(a_out) == 0:
        rows.append({"model": name, "routing": "DYNWAVE", "status": "stock run failed"})
        continue
    A = read_out(a_out)
    peaks = np.abs(A["link"][:, :, 0]).max(axis=0)
    order = [A["links"][i] for i in np.argsort(-peaks)]
    cands = [l for l in order if l in conduits and shapes.get(l, "DUMMY") != "DUMMY"]
    row = {"model": name, "routing": "DYNWAVE", "links": len(A["links"]),
           "nodes": len(A["nodes"]), "conduits": len(conduits)}
    chosen = None
    tried = 0
    for link in cands[:8]:
        tried += 1
        fv_inp = os.path.join(os.path.dirname(inp), name + "__fv.inp")
        shutil.copy(inp, fv_inp)
        with open(fv_inp, "a", encoding="latin-1") as fh:
            fh.write("\n\n[FV_LINKS]\n" + link + "\n")
        b_rpt = os.path.join(WORK, name + ".fv.rpt")
        b_out = os.path.join(WORK, name + ".fv.out")
        if os.path.exists(b_out):
            os.remove(b_out)
        wb = run(FV, fv_inp, b_rpt, b_out)
        os.remove(fv_inp)
        errs = re.findall(r"ERROR (\d+)", open(b_rpt, encoding="latin-1").read())
        if "116" in errs:
            continue
        chosen = link
        break
    row["tried"] = tried
    if chosen is None:
        row["status"] = ("no conduits in model" if not conduits
                         else "no eligible conduit")
        rows.append(row)
        continue
    row["fv_link"] = chosen
    row["fv_shape"] = shapes.get(chosen, "?")
    errs = re.findall(r"ERROR (\d+)", open(b_rpt, encoding="latin-1").read())
    if errs or not os.path.exists(b_out) or os.path.getsize(b_out) == 0:
        row["status"] = "FV run failed " + " ".join(errs)
        rows.append(row)
        continue
    B = read_out(b_out)
    j = A["links"].index(chosen)
    qa, qb = A["link"][:, j, 0], B["link"][:, j, 0]
    row["status"] = "ran"
    row["fv_link_peak_dw"] = float(np.abs(qa).max())
    row["fv_link_peak_pct"] = 100 * (np.abs(qb).max() - np.abs(qa).max()) / max(np.abs(qa).max(), 1e-9)
    # --- system outflow volume (sum over outfall total inflow is not in the
    #     .out for every model; use the system 'outflow' variable SYS_OUTFLOW, index 11)
    so_a, so_b = A["sys"][:, 11], B["sys"][:, 11]
    va, vb = so_a.sum(), so_b.sum()
    row["sys_outflow_vol_pct"] = 100 * (vb - va) / va if va > 0 else 0.0
    ya, yb = A["node"][:, :, 0], B["node"][:, :, 0]
    row["max_node_depth_diff_ft"] = float(np.abs(ya - yb).max())
    i_n = int(np.argmax(np.abs(ya - yb).max(axis=0)))
    row["worst_node"] = A["nodes"][i_n]
    cont = lambda r: rpt_val(r, r"Continuity Error \(%\) \.+\s+(-?[\d.]+)")
    row["dw_routing_cont"] = cont(a_rpt)
    row["fv_routing_cont"] = cont(b_rpt)
    row["dw_avg_step"] = rpt_val(a_rpt, r"Average Time Step\s+:\s+([\d.]+)")
    row["fv_avg_step"] = rpt_val(b_rpt, r"Average Time Step\s+:\s+([\d.]+)")
    row["dw_nonconv"] = rpt_val(a_rpt, r"% of Steps Not Converging\s+:\s+([\d.]+)")
    row["fv_nonconv"] = rpt_val(b_rpt, r"% of Steps Not Converging\s+:\s+([\d.]+)")
    m = re.search(r"^\s+" + re.escape(chosen) + r"\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+([\d.]+)\s+(-?[\d.]+e[+-]\d+)\s+(\d+)",
                  open(b_rpt, encoding="latin-1").read(), re.M)
    if m:
        row["fv_cells"] = m.group(1)
        row["fv_substeps_per_step"] = m.group(3)
        row["fv_vol_bal_pct"] = m.group(6)
        row["fv_floor_hits"] = m.group(7)
    row["dw_wall_s"] = round(wa, 3)
    row["fv_wall_s"] = round(wb, 3)
    rows.append(row)
    print(name, row["status"], chosen, row.get("fv_vol_bal_pct"))

keys = []
for r in rows:
    for k in r:
        if k not in keys:
            keys.append(k)
with open(CSV, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=keys)
    w.writeheader()
    w.writerows(rows)
print("wrote", CSV)
