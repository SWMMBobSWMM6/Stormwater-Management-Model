"""Correctness gates for the swmm524-fvlink branch.

  1. lake at rest      -- still water over sloped, offset, multi-barrel and
                          surcharged FV links must stay still
  2. noise-floor control -- stock dynamic wave seeded with a 1e-7 ft
                          perturbation, to show what "still" means for DW
  3. resonator         -- a 0.05 ft disturbance in a dead-end manhole on a
                          surcharged FV pipe must decay, not grow
  4. input gates       -- stock rejects [FV_LINKS]; bad entries are errors
  5. determinism       -- the same FV run twice gives the same .out bytes

usage: python3 scripts/gates.py <stock_exe> <fv_exe> <models_dir> <runs_dir> <out_txt>
"""
import os
import re
import shutil
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import gen                      # noqa: E402
from outread import read_out    # noqa: E402

STOCK, FV, MODELS, RUNS, OUT = sys.argv[1:6]
os.makedirs(os.path.join(MODELS, "gates"), exist_ok=True)
os.makedirs(RUNS, exist_ok=True)
lines = []


def say(s=""):
    print(s)
    lines.append(s)


def run(exe, inp, tag):
    rpt = os.path.join(RUNS, tag + ".rpt")
    out = os.path.join(RUNS, tag + ".out")
    if os.path.exists(out):
        os.remove(out)
    subprocess.run([exe, inp, rpt, out], stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, check=False)
    return rpt, out


G = os.path.join(MODELS, "gates")

# --- 1 & 2. lake at rest -------------------------------------------------
say("1. LAKE AT REST  (uniform head 105 ft; outfall FIXED at 105 ft; 2 h)")
say("   C1 3-ft circular, C2 rect. open with 0.5 ft inlet offset,")
say("   C3 2 x 6-ft circular surcharged, C4 trapezoid into the outfall")
variants = [("lake_dw", None, STOCK), ("lake_all_fv", ["C1", "C2", "C3", "C4"], FV),
            ("lake_C1", ["C1"], FV), ("lake_C2", ["C2"], FV),
            ("lake_C3", ["C3"], FV), ("lake_C4", ["C4"], FV),
            ("lake_C2C3", ["C2", "C3"], FV)]
for tag, fv, exe in variants:
    inp = os.path.join(G, tag + ".inp")
    open(inp, "w").write(gen.lake(fv=fv))
    _, out = run(exe, inp, tag)
    r = read_out(out)
    q = np.abs(r["link"][:, :, 0]).max()
    h = r["node"][:, :, 1]
    say("   %-12s engine %-6s max|Q| %.2e cfs   max head drift %.2e ft" %
        (tag, "stock" if exe == STOCK else "fv", q, np.abs(h - h[0]).max()))
inp = os.path.join(G, "lake_dw_seeded.inp")
txt = gen.lake().replace("J1           100.000  12.00  5.000",
                         "J1           100.000  12.00  5.0000001")
assert "5.0000001" in txt
open(inp, "w").write(txt)
_, out = run(STOCK, inp, "lake_dw_seeded")
r = read_out(out)
say("2. NOISE-FLOOR CONTROL\n   %-12s engine stock  max|Q| %.2e cfs   (J1 seeded +1e-7 ft, all dynamic wave)" %
    ("lake_dw_seed", np.abs(r["link"][:, :, 0]).max()))
say()

# --- 3. resonator ----------------------------------------------------------
say("3. RESONATOR  (dead-end manhole + surcharged 300-ft FV pipe + FIXED")
say("   outfall; J1 starts 0.05 ft above the outfall stage; 6 h)")
src = os.path.join(MODELS, "gates", "resonator.inp")
_, out = run(FV, src, "resonator")
r = read_out(out)
h = r["node"][:, 0, 1] - 105.0
per = int(1800 / r["report_step"])
say("   max |J1 head - 105| per 30 min: " +
    " ".join("%.1e" % np.abs(h[i:i + per]).max() for i in range(0, len(h), per)))
say()

# --- 4. input gates ---------------------------------------------------------
say("4. INPUT GATES")
base = gen.chain(qpeak=30, fv=["C4"])
inp = os.path.join(G, "chain_fv.inp")
open(inp, "w").write(base)
rpt, out = run(STOCK, inp, "stock_reads_fv")
err = re.findall(r"ERROR \d+: [^\n]*", open(rpt, encoding="latin-1").read())
say("   stock 5.2.4 on a file with [FV_LINKS]: %s; .out written: %s" %
    (err[0].strip() if err else "no error", os.path.exists(out) and os.path.getsize(out) > 0))
cases = {
    "KINWAVE routing": base.replace("FLOW_ROUTING         DYNWAVE", "FLOW_ROUTING         KINWAVE"),
    "unknown link": base.replace("[FV_LINKS]\n;;Link Cells\nC4\n", "[FV_LINKS]\n;;Link Cells\nCX\n"),
    "cells = 0": base.replace("[FV_LINKS]\n;;Link Cells\nC4\n", "[FV_LINKS]\n;;Link Cells\nC4 0\n"),
    "cells = 2.5": base.replace("[FV_LINKS]\n;;Link Cells\nC4\n", "[FV_LINKS]\n;;Link Cells\nC4 2.5\n"),
    "flap gate": base + "\n[LOSSES]\nC4 0 0 0 YES 0\n",
    "entry loss": base + "\n[LOSSES]\nC4 0.5 0 0 NO 0\n",
    "cells = *": base.replace("[FV_LINKS]\n;;Link Cells\nC4\n", "[FV_LINKS]\n;;Link Cells\nC4 *\n"),
    "cells = 1": base.replace("[FV_LINKS]\n;;Link Cells\nC4\n", "[FV_LINKS]\n;;Link Cells\nC4 1\n"),
}
for k, txt in cases.items():
    assert txt != base or k == "", k
    p = os.path.join(G, "inputgate.inp")
    open(p, "w").write(txt)
    rpt, out = run(FV, p, "inputgate")
    e = re.findall(r"ERROR \d+: [^\n]*", open(rpt, encoding="latin-1").read())
    say("   %-16s -> %s" % (k, e[0].strip()[:90] if e else "runs (no error)"))
say()

# --- 5. determinism ---------------------------------------------------------
say("5. DETERMINISM")
for name in ("chain_fv",):
    p = os.path.join(G, name + ".inp")
    _, o1 = run(FV, p, name + "_run1")
    shutil.copy(o1, o1 + ".keep")
    _, o2 = run(FV, p, name + "_run2")
    same = open(o1 + ".keep", "rb").read() == open(o2, "rb").read()
    say("   %s run twice: .out byte-identical = %s" % (name, same))
open(OUT, "w").write("\n".join(lines) + "\n")

# --- 6. review probes (independent reviewer, 2026-10-13) -------------------
say()
say("6. REVIEW PROBES  (models/review; written by an independent reviewer)")
RV = os.path.join(MODELS, "review")
pairs = {}
for m in ("gate", "q", "rev", "ex"):
    _, oa = run(STOCK, os.path.join(RV, m + "_dw.inp"), "rv_" + m + "_dw")
    rb, ob = run(FV, os.path.join(RV, m + "_fv.inp"), "rv_" + m + "_fv")
    ra = os.path.join(RUNS, "rv_" + m + "_dw.rpt")
    pairs[m] = (ra, rb, oa, ob)


def conts(rpt):
    return re.findall(r"Continuity Error \(%\) \.+\s+(-?[\d.]+)",
                      open(rpt, encoding="latin-1").read())


ra, rb, oa, ob = pairs["gate"]
A, B = read_out(oa), read_out(ob)
qa = A["link"][:, A["links"].index("C1"), 0]
qb = B["link"][:, B["links"].index("C1"), 0]
say("   gated outfall (FIXED 104 ft, Gated YES, J1 invert 100 ft):")
say("     min C1 flow  stock %.3f  FV %.3f cfs   (negative = backflow through the gate)" % (qa.min(), qb.min()))
say("     routing continuity  stock %s  FV %s %%" % (conts(ra)[0], conts(rb)[0]))
ra, rb, oa, ob = pairs["q"]
say("   one pollutant (TSS), mixed network, C1 and C3 FV:")
say("     flow continuity  stock %s  FV %s %%;  quality continuity  stock %s  FV %s %%" %
    (conts(ra)[0], conts(rb)[0], conts(ra)[1], conts(rb)[1]))
A, B = read_out(oa), read_out(ob)
say("     max link TSS (mg/L) stock %s | FV %s" %
    (" ".join("%.1f" % x for x in A["link"][:, :, 5].max(0)),
     " ".join("%.1f" % x for x in B["link"][:, :, 5].max(0))))
ra, rb, oa, ob = pairs["rev"]
say("   reversed (adverse) 2-barrel FV conduit with a 1.0 ft offset: continuity stock %s  FV %s %%" %
    (conts(ra)[0], conts(rb)[0]))
for m in ("pump", "pump2", "pump3"):
    rb, _ = run(FV, os.path.join(RV, m + "_fv.inp"), "rv_" + m + "_fv")
    e = re.findall(r"ERROR \d+", open(rb, encoding="latin-1").read())
    say("   %-6s FV link feeding a pump wet well -> %s" % (m, e[0] if e else "runs"))
rb, ob = run(FV, os.path.join(RV, "longid.inp"), "rv_longid")
say("   180-character link ID in the FV report -> %s" %
    ("report written" if "Finite-Volume Link Summary" in open(rb, encoding="latin-1").read() else "FAILED"))
open(OUT, "w").write("\n".join(lines) + "\n")
