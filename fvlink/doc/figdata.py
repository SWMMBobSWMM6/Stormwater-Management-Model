"""Regenerates the engine data behind Figures 5, 6 and 9 from final-build runs.

  user2_5s.json   EPA user2 at a 5-s report step, stock and TW01290 as FV
  refine.json     J4 depth in the 30-cfs chain, stock and C4 FV at 1-48 cells
  resonator.json  J1 head minus 105 ft in the resonator gate model

usage: python3 doc/figdata.py <repo_root> <stock_exe> <fv_exe> <out_dir>
"""
import json, os, subprocess, sys
import numpy as np
ROOT, STOCK, FV, OUT = sys.argv[1:5]
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from outread import read_out, series   # noqa: E402

def run(exe, d, inp, tag):
    rpt, out = os.path.join(OUT, tag + ".rpt"), os.path.join(OUT, tag + ".out")
    subprocess.run([exe, inp, rpt, out], cwd=d, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return read_out(out)

os.makedirs(OUT, exist_ok=True)
# --- user2 at a 5-s report step
U = os.path.join(ROOT, "nrtest/public/user")
src = open(os.path.join(U, "user2.inp"), encoding="latin-1").read()
assert "REPORT_STEP           00:05:00" in src
dw_txt = src.replace("REPORT_STEP           00:05:00", "REPORT_STEP           00:00:05")
for tag, txt in (("u2_dw", dw_txt), ("u2_fv", dw_txt + "\n\n[FV_LINKS]\nTW01290\n")):
    open(os.path.join(U, "zz_" + tag + ".inp"), "w", encoding="latin-1").write(txt)
r_dw = run(STOCK, U, "zz_u2_dw.inp", "u2_dw"); r_fv = run(FV, U, "zz_u2_fv.inp", "u2_fv")
for tag in ("u2_dw", "u2_fv"): os.remove(os.path.join(U, "zz_" + tag + ".inp"))
d = {"dt": r_dw["report_step"]}
for L in ("TW01300", "TW01290", "TW01280"):
    d[L + "_dw"] = series(r_dw, "link", L, 0).tolist(); d[L + "_fv"] = series(r_fv, "link", L, 0).tolist()
json.dump(d, open(os.path.join(OUT, "user2_5s.json"), "w"))
# --- refinement: J4 depth
R = os.path.join(ROOT, "runs")
dw = series(read_out(os.path.join(R, "chain30_C4_c12_dw.out")), "node", "J4", 0)
r = {"dw_J4": float(dw.max()), "dw_J4_series": dw.tolist(), "dt": read_out(os.path.join(R, "chain30_C4_c12_dw.out"))["report_step"]}
for n in (1, 2, 4, 12, 48):
    s = series(read_out(os.path.join(R, "chain30_C4_c%d_fv.out" % n)), "node", "J4", 0)
    r["fv_J4_%d" % n] = float(s.max())
    if n in (1, 12, 48): r["fv_J4_series_%d" % n] = s.tolist()
json.dump(r, open(os.path.join(OUT, "refine.json"), "w"))
# --- resonator
g = read_out(os.path.join(R, "gates/resonator.out"))
json.dump({"dt": g["report_step"], "dev": (series(g, "node", "J1", 1) - 105.0).tolist()},
          open(os.path.join(OUT, "resonator.json"), "w"))
print("wrote", OUT)
