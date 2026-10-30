"""Collect the numbers behind the Doc tab's charts (swmm524-fvlink app).

Every value comes from a results file or a run output of the swmm524-fvlink
build (final build, fvlink.c dated 10/17/26) or from the WebAssembly census
of 2026-10-21. Nothing here is invented; the two illustrations that are not
measurements (the spring toy and the booking sketch) are computed in the
figure code and say so in their captions.
usage: python3 figdata_app.py  ->  figdata.json next to this file
"""
import csv, json, math, os, re, sys
import numpy as np

FV = "/home/claude/fvlink"
APP = "/home/claude/fvapp"
sys.path.insert(0, FV + "/scripts")
from outread import read_out, series  # noqa: E402

R = FV + "/results/"
G = 32.2
out = {}


def sections(path):
    sec, res = None, {}
    for line in open(path, encoding="latin-1"):
        s = line.split(";")[0].strip()
        if not s:
            continue
        if s.startswith("["):
            sec = s.upper(); res.setdefault(sec, []); continue
        if sec:
            res[sec].append(s.split())
    return res


def circ_geom(D, y):
    y = min(max(y, 1e-9), D - 1e-9)
    th = 2 * math.acos(1 - 2 * y / D)
    return D * D / 8 * (th - math.sin(th)), D * math.sin(th / 2)


# --- 1. each tree conduit's tightest Courant time, stock getLinkStep() rules
s = sections(FV + "/models/tree_dw.inp")
L = {r[0]: float(r[3]) for r in s["[CONDUITS]"]}
D = {r[0]: float(r[2]) for r in s["[XSECTIONS]"]}
r = read_out(FV + "/runs/tree_dw.out")
dep, vel = r["link"][:, :, 1], r["link"][:, :, 2]
tmin = {}
for j, lid in enumerate(r["links"]):
    best = np.inf
    for p in range(dep.shape[0]):
        y, v = dep[p, j], abs(vel[p, j])
        if y <= 1e-4 or D[lid] - y <= 1e-4 or v <= 1e-4:
            continue
        a, t = circ_geom(D[lid], y)
        c = math.sqrt(G * a / t)
        if v / c <= 0.01:
            continue
        best = min(best, 0.75 * L[lid] / (v + c))
    tmin[lid] = best
vals = sorted(((k, v) for k, v in tmin.items() if np.isfinite(v)), key=lambda kv: kv[1])
out["courant"] = {"ids": [k for k, _ in vals], "t": [round(float(v), 4) for _, v in vals],
                  "ct21": round(float(tmin["CT21"]), 4), "n": len(vals)}


# --- 2. routing step frequencies, SWMM's own report
def step_freqs(rpt):
    t = open(rpt, encoding="latin-1").read()
    blk = t[t.index("Time Step Frequencies"):].splitlines()[1:6]
    res = []
    for ln in blk:
        m = re.match(r"\s*([\d.]+)\s*-\s*([\d.]+)\s*sec\s*:\s*([\d.]+)", ln)
        res.append([float(m.group(1)), float(m.group(2)), float(m.group(3))])
    return res


def avg_step(rpt):
    t = open(rpt, encoding="latin-1").read()
    return float(re.search(r"Average Time Step\s*:\s*([\d.]+)", t).group(1))


out["stepfreq"] = {k: {"freq": step_freqs(FV + "/runs/%s.rpt" % k), "avg": avg_step(FV + "/runs/%s.rpt" % k)}
                   for k in ("tree_dw", "tree_fv", "tree_noshort_dw")}

# --- 3. wave speed in the FV link's own table, 3-ft circle
d = np.loadtxt(FV + "/docwork/wavespeed_circ3.txt")
idx = sorted(set(list(range(0, len(d), 12)) + [len(d) - 1] + [i for i in range(len(d)) if 0.97 <= d[i, 0] / 3 <= 1.03]))
out["wavespeed"] = {"yD": [round(float(d[i, 0] / 3.0), 5) for i in idx], "c": [round(float(d[i, 3]), 3) for i in idx]}

# --- 4. lake at rest and noise-floor control
txt = open(R + "gates.txt").read()
lake = []
for lab, key in (("stock dynamic wave", "lake_dw"), ("all four conduits FV", "lake_all_fv"), ("C4 only FV", "lake_C4"),
                 ("C1 only FV", "lake_C1"), ("C2 only FV", "lake_C2"), ("C3 only FV", "lake_C3"),
                 ("C2 and C3 FV", "lake_C2C3"), ("control: stock, J1 seeded +1e-7 ft", "lake_dw_seed")):
    m = re.search(r"\b" + re.escape(key) + r"\s+engine \w+\s+max\|Q\|\s+([\d.e+-]+)", txt)
    lake.append([lab, float(m.group(1))])
out["lake"] = lake

# --- 5. resonator, largest deviation per 30 min
m = re.search(r"per 30 min:\s*([\d.e+\- ]+)", txt)
out["resonator"] = [float(x) for x in m.group(1).split()]

# --- 6. user2 TW01290 at 5 s, window around the reversals
u = json.load(open(FV + "/docwork/user2_5s.json"))
dt = u["dt"]
i0, i1 = int(12.30 * 3600 / dt), int(13.10 * 3600 / dt)
out["user2"] = {"dt": dt, "t0_h": round(i0 * dt / 3600.0, 4),
                **{k: [round(float(x), 2) for x in u[k][i0:i1]] for k in ("TW01290_dw", "TW01290_fv", "TW01300_dw", "TW01280_dw")}}
qd, qf = np.array(u["TW01290_dw"]), np.array(u["TW01290_fv"])
out["user2"]["peak_dw"] = round(float(qd.max()), 1)
out["user2"]["peak_fv"] = round(float(qf.max()), 1)
out["user2"]["tv_dw"] = round(float(np.abs(np.diff(qd)).sum()))
out["user2"]["tv_fv"] = round(float(np.abs(np.diff(qf)).sum()))

# --- 7. mesh refinement: extra peak depth at J4 (suite.csv)
ref = []
for row in csv.DictReader(open(R + "suite.csv")):
    m = re.match(r"chain30_C4_c(\d+)$", row["case"])
    if m:
        ref.append([int(m.group(1)), round(float(row["node_max_abs_ft"]), 3)])
out["refine"] = sorted(ref)


# --- 8. timing (interleaved, n = 7)
def timing(path):
    t = open(path).read()
    med = [float(x) for x in re.findall(r"median ([\d.]+) s", t)]
    lo, hi = re.search(r"per-pair ratios ([\d.]+)[–-]([\d.]+)", t).groups()
    ratio = float(re.search(r"B/A: ([\d.]+)", t).group(1))
    return {"a": med[0], "b": med[1], "ratio": ratio, "lo": float(lo), "hi": float(hi)}


out["timing"] = {"short": timing(R + "timing_tree_short.txt"), "noshort": timing(R + "timing_tree_vs_noshort.txt")}

# --- 9. tree peaks, stock vs CT21 FV
a, b = read_out(FV + "/runs/tree_dw.out"), read_out(FV + "/runs/tree_fv.out")
pa = np.abs(a["link"][:, :, 0]).max(axis=0); pb = np.abs(b["link"][:, :, 0]).max(axis=0)
ch = 100 * np.abs(pb - pa) / pa
na = a["node"][:, :, 0].max(axis=0); nb = b["node"][:, :, 0].max(axis=0)
ok = na > 0.001
nch = 100 * np.abs(nb[ok] - na[ok]) / na[ok]
bins = np.linspace(0, 1.0, 21)
out["treepeaks"] = {"bins": [round(float(x), 3) for x in bins],
                    "links": np.histogram(ch, bins=bins)[0].tolist(), "nodes": np.histogram(nch, bins=bins)[0].tolist(),
                    "nlinks": int(len(ch)), "nnodes": int(ok.sum()),
                    "link_max": round(float(ch.max()), 2), "node_max": round(float(nch.max()), 2)}

# --- 10. the EPA sweep
rows = [r_ for r_ in csv.DictReader(open(R + "sweep.csv")) if r_["status"] == "ran"]
out["sweep"] = [{"m": r_["model"], "peak": round(float(r_["fv_link_peak_pct"]), 3),
                 "sub": float(r_["fv_substeps_per_step"]), "vb": float(r_["fv_vol_bal_pct"]),
                 "shape": r_["fv_shape"], "cells": int(r_["fv_cells"])} for r_ in rows]

# --- 11. WebAssembly census (2026-10-21)
w = open(APP + "/results/wasm_check.txt").read()
cen = {}
for blk in ("fv", "fv_nr", "st_nr"):
    m = re.search(r"## %s\n.*?COUNTS (\{.*?\})" % blk, w, re.S)
    cen[blk] = json.loads(m.group(1).replace("'", '"'))
out["wasm"] = cen

# --- 12. closure gate
clo = []
for ln in open(R + "closure.txt"):
    m = re.match(r"(\S+(?: \d)?)\s+round-trip ([\d.e+-]+) ft \| dA/dh vs W ([\d.e+-]+) \| dI1/dh vs A ([\d.e+-]+)", ln)
    if m:
        clo.append([m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4))])
out["closure"] = clo

json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "figdata.json"), "w"), separators=(",", ":"))
print({k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in out.items()})
print("courant CT21", out["courant"]["ct21"], "next", out["courant"]["t"][1], "refine", out["refine"],
      "timing", out["timing"], "lake", out["lake"], "wasm", out["wasm"], "closure n", len(clo))
