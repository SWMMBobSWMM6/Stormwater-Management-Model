"""Verification suite for the swmm524-fvlink branch.

Generates the test networks, runs stock 5.2.4 (dynamic wave baseline) and
the patched engine (same .inp plus [FV_LINKS]), and writes one CSV row per
case. Every number in the README comes from results/suite.csv or from the
other files in results/.

usage: python3 scripts/suite.py <stock_exe> <fv_exe> <models_dir> <runs_dir> <results_dir>
"""
import csv
import os
import re
import subprocess
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import gen                      # noqa: E402
from outread import read_out    # noqa: E402

STOCK, FV, MODELS, RUNS, RESULTS = sys.argv[1:6]
for d in (MODELS, RUNS, RESULTS):
    os.makedirs(d, exist_ok=True)


def run(exe, name):
    inp = os.path.join(MODELS, name + ".inp")
    rpt = os.path.join(RUNS, name + ".rpt")
    out = os.path.join(RUNS, name + ".out")
    t0 = time.perf_counter()
    subprocess.run([exe, inp, rpt, out], stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, check=False)
    wall = time.perf_counter() - t0
    return rpt, out, wall


def rpt_stats(rpt):
    txt = open(rpt, encoding="latin-1").read()
    st = {}
    m = re.findall(r"Continuity Error \(%\) \.+\s+(-?[\d.]+)", txt)
    st["continuity"] = float(m[-1]) if m else float("nan")
    m = re.search(r"Average Time Step\s+:\s+([\d.]+)", txt)
    st["avg_step"] = float(m.group(1)) if m else float("nan")
    m = re.search(r"Minimum Time Step\s+:\s+([\d.]+)", txt)
    st["min_step"] = float(m.group(1)) if m else float("nan")
    m = re.search(r"Average Iterations per Step\s+:\s+([\d.]+)", txt)
    st["avg_iter"] = float(m.group(1)) if m else float("nan")
    m = re.search(r"% of Steps Not Converging\s+:\s+([\d.]+)", txt)
    st["nonconv"] = float(m.group(1)) if m else float("nan")
    fv = re.findall(r"^\s+(\S+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+"
                    r"([\d.]+)\s+(-?[\d.]+e[+-]\d+)\s+(\d+)\s*$", txt, re.M)
    st["fv"] = fv
    st["errors"] = re.findall(r"ERROR \d+", txt)
    return st


def compare(out_a, out_b, links_skip=()):
    """Corinne #3: per-element differences normalised to the element's own
    peak in A, after a magnitude floor (1 L/s = 0.0353 cfs, 1 mm depth)."""
    a, b = read_out(out_a), read_out(out_b)
    assert a["links"] == b["links"] and a["periods"] == b["periods"]
    qa, qb = a["link"][:, :, 0], b["link"][:, :, 0]
    ya, yb = a["node"][:, :, 0], b["node"][:, :, 0]
    res = {}
    lk = [i for i, n in enumerate(a["links"]) if n not in links_skip]
    pk = np.abs(qa[:, lk]).max(axis=0)
    keep = pk > 0.0353
    dq = np.abs(qa[:, lk] - qb[:, lk])[:, keep] / pk[keep]
    res["link_worst_max"] = 100 * dq.max() if dq.size else 0.0
    res["link_mean_max"] = 100 * dq.mean(axis=0).max() if dq.size else 0.0
    pkb = np.abs(qb[:, lk]).max(axis=0)
    res["link_peak_max"] = 100 * np.max(np.abs(pkb[keep] - pk[keep]) / pk[keep]) if dq.size else 0.0
    pky = ya.max(axis=0)
    keepy = pky > 0.00328
    dy = np.abs(ya - yb)[:, keepy] / pky[keepy]
    res["node_worst_max"] = 100 * dy.max()
    res["node_peak_max"] = 100 * np.max(np.abs(yb.max(axis=0)[keepy] - pky[keepy]) / pky[keepy])
    res["node_max_abs_ft"] = float(np.abs(ya - yb).max())
    worst = int(np.argmax(np.abs(yb.max(axis=0) - pky)))
    res["node_worst_id"] = a["nodes"][worst]
    # --- outfall hydrograph (total inflow at outfall nodes)
    outf = [i for i, n in enumerate(a["nodes"]) if n.startswith("O")]
    qoa = a["node"][:, outf, 4].sum(axis=1)
    qob = b["node"][:, outf, 4].sum(axis=1)
    res["outfall_peak_a"] = float(qoa.max())
    res["outfall_peak_b"] = float(qob.max())
    res["outfall_peak_pct"] = 100 * (qob.max() - qoa.max()) / qoa.max()
    dt = a["report_step"]
    va, vb = qoa.sum() * dt, qob.sum() * dt
    res["outfall_vol_pct"] = 100 * (vb - va) / va if va > 0 else 0.0
    res["identical"] = open(out_a, "rb").read() == open(out_b, "rb").read()
    return res


CASES = []


def case(name, text_dw, text_fv, note, fv_links):
    CASES.append((name, text_dw, text_fv, note, fv_links))


# --- 1. part-full chain, mesh refinement on one link
dw = gen.chain(qpeak=30)
case("chain30_C4_c1", dw, gen.chain(qpeak=30, fv=[("C4", 1)]), "part-full, C4 FV 1 cell", ["C4"])
case("chain30_C4_c2", dw, gen.chain(qpeak=30, fv=[("C4", 2)]), "part-full, C4 FV 2 cells", ["C4"])
case("chain30_C4_c4", dw, gen.chain(qpeak=30, fv=[("C4", 4)]), "part-full, C4 FV 4 cells", ["C4"])
case("chain30_C4_c12", dw, gen.chain(qpeak=30, fv=["C4"]), "part-full, C4 FV default (12 cells)", ["C4"])
case("chain30_C4_c48", dw, gen.chain(qpeak=30, fv=[("C4", 48)]), "part-full, C4 FV 48 cells", ["C4"])
case("chain30_all", dw, gen.chain(qpeak=30, fv=[f"C{i}" for i in range(1, 9)]), "part-full, all 8 conduits FV", [])

# --- 2. surcharged chain (SLOT), one link and all links
dw = gen.chain(qpeak=70)
case("chain70_C4", dw, gen.chain(qpeak=70, fv=["C4"]), "surcharged (SLOT), C4 FV", ["C4"])
case("chain70_C6", dw, gen.chain(qpeak=70, fv=["C6"]), "surcharged (SLOT), C6 FV", ["C6"])
case("chain70_all", dw, gen.chain(qpeak=70, fv=[f"C{i}" for i in range(1, 9)]), "surcharged (SLOT), all FV", [])

# --- 3. EXTRAN surcharge method
dw = gen.chain(qpeak=70, sur="EXTRAN")
case("chain70x_C4", dw, gen.chain(qpeak=70, sur="EXTRAN", fv=["C4"]), "surcharged (EXTRAN), C4 FV", ["C4"])

# --- 4. a 10-ft link that binds the dynamic wave time step
L = [300, 300, 10, 300, 300, 300, 300, 300]
dw = gen.chain(qpeak=30, lengths=L, route=10)
case("short_C3", dw, gen.chain(qpeak=30, lengths=L, route=10, fv=["C3"]), "10-ft C3 FV, ROUTING_STEP 10 s", ["C3"])

# --- 5. long uniform channel (normal-depth check on the FV reach)
dw = gen.channel()
case("channel_C2", dw, gen.channel(fv=[("C2", 80)]), "rect. channel, C2 FV 80 cells", ["C2"])

# --- 6. storage outlet, two consecutive FV links, FV link into the outfall
dw = gen.mixed()
case("mixed_4fv", dw, gen.mixed(fv=["C1", "C3", "C4", "C5"]), "storage + shared junction + outfall link FV", ["C1", "C3", "C4", "C5"])
case("mixed_C1", dw, gen.mixed(fv=["C1"]), "storage outlet only FV", ["C1"])

rows = []
for name, tdw, tfv, note, fvl in CASES:
    open(os.path.join(MODELS, name + "_dw.inp"), "w").write(tdw)
    open(os.path.join(MODELS, name + "_fv.inp"), "w").write(tfv)
    ra, oa, wa = run(STOCK, name + "_dw")
    rb, ob, wb = run(FV, name + "_fv")
    sa, sb = rpt_stats(ra), rpt_stats(rb)
    row = {"case": name, "note": note, "errors": " ".join(sa["errors"] + sb["errors"])}
    if not sb["errors"]:
        row.update(compare(oa, ob))
        bal = [float(x[6]) for x in sb["fv"]]
        row["fv_links"] = len(sb["fv"])
        row["fv_vol_bal_max_pct"] = max(abs(x) for x in bal) if bal else float("nan")
        row["fv_substeps_per_step"] = max(float(x[3]) for x in sb["fv"]) if sb["fv"] else 0
        row["fv_floor_hits"] = sum(int(x[7]) for x in sb["fv"]) if sb["fv"] else 0
    for k in ("continuity", "avg_step", "min_step", "avg_iter", "nonconv"):
        row["dw_" + k] = sa[k]
        row["fv_" + k] = sb[k]
    row["dw_wall_s"] = round(wa, 3)
    row["fv_wall_s"] = round(wb, 3)
    rows.append(row)
    print(name, "ok" if not row["errors"] else row["errors"])

keys = []
for r in rows:
    for k in r:
        if k not in keys:
            keys.append(k)
with open(os.path.join(RESULTS, "suite.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=keys)
    w.writeheader()
    for r in rows:
        w.writerow(r)
print("wrote", os.path.join(RESULTS, "suite.csv"))
