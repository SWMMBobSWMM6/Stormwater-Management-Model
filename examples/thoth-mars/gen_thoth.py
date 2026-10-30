"""The Thoth Canal model for 'Thaw on the Thoth' (US units, CFS).

Headworks -> Upper Thoth (8 one-mile trapezoidal reaches, the 10-ft Causeway
Culvert at mile 4) -> the Chute (400 ft, 20-ft drop) -> Lower Thoth (6 reaches)
-> the last 600 ft into Colony Basin (storage, levee crest 14.5 ft) -> overflow
sill (weir) -> Outlet Canal -> the Sink.  With --lock: the Lock and a 10-ft open
gate throat into the basin (the Company's version).  The town intake: an intake
channel to the intake bay and a pump to the town.  The Old Canal gate (a side
orifice at lower mile 6) spills to the dry Old Canal when a control rule opens it.

usage: gen_thoth.py OUT.inp [--n 0.015] [--cw 3.33] [--lock] [--spill HOURS]
       [--close HOURS] [--spill-setting 1.0] [--fv C1,C2] [--cells N,N]
       [--pump-at-basin] [--peak 4200] [--rstep 00:05:00] [--days 4]
Mars model: --n 0.02437 --cw 2.050, run on an engine built with GRAVITY 12.2.
"""
import argparse, math

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--n", type=float, default=0.015)        # Manning n of the lined canal
ap.add_argument("--cw", type=float, default=3.33)        # overflow sill weir coefficient
ap.add_argument("--spill", type=float, default=None)     # hour the Old Canal gate opens
ap.add_argument("--spill-setting", type=float, default=1.0)
ap.add_argument("--close", type=float, default=None)     # hour the Old Canal gate closes
ap.add_argument("--fv", default="")                       # links listed in [FV_LINKS]
ap.add_argument("--cells", default="")                    # cells for each FV link, comma list
ap.add_argument("--pump-at-basin", action="store_true")   # the company's lumped intake
ap.add_argument("--peak", type=float, default=4200.0)     # melt peak at the headworks (cfs)
ap.add_argument("--rstep", default="00:05:00")
ap.add_argument("--days", type=int, default=4)
ap.add_argument("--lock", action="store_true")         # the company's lock node and 10-ft gate throat
a = ap.parse_args()

MILE = 5280.0
S = 0.0003
L = []
J = []
X = {}
# --- Upper Thoth
z = 200.0
J.append(("HW", z, 14.0)); X["HW"] = (0, 0)
prev = "HW"
for i in range(1, 9):
    z -= MILE * S
    nm = f"U{i}"
    J.append((nm, round(z, 3), 14.0)); X[nm] = (i * 1.0, 0)
    L.append((f"UT{i}", prev, nm, MILE, "TRAPEZOIDAL", 14, 40, 2, 2, 1, a.n)); prev = nm
    if i == 4:
        # --- the Causeway Culvert: a 10-ft opening under the colony causeway
        z -= 0.003
        J.append(("U4X", round(z, 3), 14.0)); X["U4X"] = (4.08, 0)
        L.append(("CULVERT", "U4", "U4X", 10.0, "RECT_OPEN", 14, 40, 0, 0, 1, 0.014)); prev = "U4X"
# --- the Chute: 400 ft, 20 ft drop, rectangular open channel
z -= 20.0
J.append(("CB", round(z, 3), 14.0)); X["CB"] = (8.6, -0.6)
L.append(("CHUTE", "U8", "CB", 400.0, "RECT_OPEN", 10, 40, 0, 0, 1, 0.014))
prev = "CB"
for i in range(1, 7):
    z -= MILE * S
    nm = f"L{i}"
    J.append((nm, round(z, 3), 14.0)); X[nm] = (8.6 + i, -1.2)
    L.append((f"LT{i}", prev, nm, MILE, "TRAPEZOIDAL", 14, 40, 2, 2, 1, a.n)); prev = nm
# --- the last 600 ft into Colony Basin
zl = z
zb = zl - 600.0 * S - 0.5
if a.lock:
    # --- the company's version: the Lock, then a 10-ft gate throat into the basin
    J.append(("LOCK", round(zl - 600.0 * S, 3), 20.0)); X["LOCK"] = (15.0, -1.2)
    L.append(("LT7", prev, "LOCK", 600.0, "TRAPEZOIDAL", 14, 40, 2, 2, 1, a.n))
    L.append(("THROAT", "LOCK", "BASIN", 10.0, "RECT_OPEN", 18, 40, 0, 0, 1, 0.014))
else:
    L.append(("LT7", prev, "BASIN", 600.0, "TRAPEZOIDAL", 14, 40, 2, 2, 1, a.n))
# --- Old Canal spill gate (orifice at L6) and the Old Canal
J.append(("OC1", round(zl - 6.0, 3), 12.0)); X["OC1"] = (14.6, -2.4)
OUT = [("OLDSINK", round(zl - 6.0 - 2.0, 3)), ("SINK", round(zb - 10.0, 3))]

src = []
w = src.append
w("[TITLE]\nThe Thoth Canal: headworks to Colony Basin (Thaw on the Thoth)\n")
w(f"""[OPTIONS]
FLOW_UNITS           CFS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE
LINK_OFFSETS         DEPTH
START_DATE           04/10/2097
START_TIME           00:00:00
REPORT_START_DATE    04/10/2097
REPORT_START_TIME    00:00:00
END_DATE             04/{10 + a.days:02d}/2097
END_TIME             00:00:00
SWEEP_START          01/01
SWEEP_END            12/31
DRY_DAYS             0
REPORT_STEP          {a.rstep}
WET_STEP             00:05:00
DRY_STEP             00:05:00
ROUTING_STEP         30
ALLOW_PONDING        NO
INERTIAL_DAMPING     PARTIAL
NORMAL_FLOW_LIMITED  BOTH
FORCE_MAIN_EQUATION  H-W
VARIABLE_STEP        0.75
LENGTHENING_STEP     0
MIN_SURFAREA         12.566
MAX_TRIALS           8
HEAD_TOLERANCE       0.005
SYS_FLOW_TOL         5
LAT_FLOW_TOL         5
MINIMUM_STEP         0.1
THREADS              1
""")
w("[JUNCTIONS]\n;;Name  Invert  MaxDepth  InitDepth  SurDepth  Aponded")
hb0 = zb + 8.3      # basin pool at the start, just over the sill crest
for nm, zz, md in J:
    init = 0.0 if nm == "OC1" else 2.6
    if nm.startswith("L"): init = max(2.6, hb0 - zz)
    w(f"{nm:8s} {zz:9.3f} {md:6.1f} {init:5.2f} 0 0")
w("\n[OUTFALLS]\n;;Name  Invert  Type")
for nm, zz in OUT:
    w(f"{nm:8s} {zz:9.3f} FREE NO")
w("TOWN     " + f"{zb + 30.0:9.3f}" + " FREE NO")
# Colony Basin: functional storage, area = 1.5e6 + 2.0e4*d ft2 (34 acres growing), levee crest 14.5 ft
w("\n[STORAGE]\n;;Name  Invert  MaxD  InitD  Shape  Coeff  Expon  Const  SurDepth  Fevap")
w(f"BASIN    {zb:9.3f} 14.5 8.3 FUNCTIONAL 20000 1 1500000 0 0")
w(f"BAY      {zb - 2.0:9.3f} 20.0 8.0 FUNCTIONAL 0 0 5000 0 0")
w("\n[CONDUITS]\n;;Name  From  To  Length  n  InOff  OutOff  InitFlow  MaxFlow")
for (nm, f, t, ln, sh, g1, g2, g3, g4, br, n) in L:
    w(f"{nm:8s} {f:6s} {t:6s} {ln:8.1f} {n:.4f} 0 0 0 0")
w(f"INTAKE   BASIN  BAY    300.0 0.0140 0 0 0 0" if not a.pump_at_basin else "")
w(f"OLDCAN   OC1    OLDSINK 2000.0 0.0300 0 0 0 0")
w(f"OUTCAN   OUTJ   SINK   4000.0 {a.n:.4f} 0 0 0 0")
w("\n[PUMPS]\n;;Name  From  To  Curve  Status  Startup  Shutoff")
w(f"INTAKEP  {'BASIN' if a.pump_at_basin else 'BAY':6s} TOWN   TOWNPUMP  ON  0  0")
w("\n[ORIFICES]\n;;Name  From  To  Type  Offset  Qcoeff  Gated  CloseTime")
w("OLDGATE  L6     OC1    SIDE  2.0  0.61  NO  0")
w("\n[WEIRS]\n;;Name  From  To  Type  CrestHt  Qcoeff  Gated  EndCon  EndCoeff  Surcharge")
w(f"SILL     BASIN  OUTJ   TRANSVERSE  8.0  {a.cw:.3f}  NO  0  0  YES")
w("\n[XSECTIONS]\n;;Link  Shape  Geom1  Geom2  Geom3  Geom4  Barrels  Culvert")
for (nm, f, t, ln, sh, g1, g2, g3, g4, br, n) in L:
    w(f"{nm:8s} {sh:12s} {g1} {g2} {g3} {g4} {br}")
if not a.pump_at_basin:
    w("INTAKE   RECT_OPEN    16 12 0 0 1")
w("OLDCAN   TRAPEZOIDAL  10 30 2 2 1")
w("OUTCAN   TRAPEZOIDAL  14 60 2 2 1")
w("OLDGATE  RECT_CLOSED  8 20 0 0")
w("SILL     RECT_OPEN    8 100 0 0")
# Outlet junction (added here so the [JUNCTIONS] block above stays tidy)
src.insert(src.index("\n[OUTFALLS]\n;;Name  Invert  Type"), f"OUTJ     {zb - 1.0:9.3f}  14.0  0.0 0 0")
w("\n[CURVES]\n;;the town intake: 150 cfs at any wet-well volume\nTOWNPUMP  PUMP1  0  150\nTOWNPUMP         1e9  150")
w("\n[INFLOWS]\n;;Node  Constituent  TimeSeries  Type  Mfactor  Sfactor  Baseline  Pattern")
w("HW  FLOW  MELT  FLOW  1.0  1.0")
w("\n[TIMESERIES]\n;;the melt hydrograph at the headworks (hours, cfs)")
# base 300 cfs; thaw from hour 24: a gamma-shaped surge peaking at hour 42
base, qp = 300.0, a.peak
pts = []
for h10 in range(0, a.days * 24 * 2 + 1):
    h = h10 / 2.0
    if h <= 24: q = base
    else:
        t = (h - 24.0) / 18.0
        q = base + (qp - base) * (t ** 3) * math.exp(3 * (1 - t))
    pts.append((h, q))
for h, q in pts:
    w(f"MELT  {h:6.1f}  {q:9.2f}")
w("\n[CONTROLS]")
w("RULE INTAKE\nIF SIMULATION TIME > 0\nTHEN PUMP INTAKEP STATUS = ON\n")
if a.spill is not None:
    cond = f"IF SIMULATION TIME >= {a.spill}" + (f"\nAND SIMULATION TIME < {a.close}" if a.close is not None else "")
    w(f"RULE SPILL\n{cond}\nTHEN ORIFICE OLDGATE SETTING = {a.spill_setting}\nELSE ORIFICE OLDGATE SETTING = 0\n")
else:
    w("RULE NOSPILL\nIF SIMULATION TIME > 0\nTHEN ORIFICE OLDGATE SETTING = 0\n")
w("[REPORT]\nINPUT NO\nCONTROLS NO\nNODES ALL\nLINKS ALL\n")
if a.fv:
    w("[FV_LINKS]\n;;Link  Cells")
    cells = a.cells.split(",") if a.cells else []
    for i, l in enumerate(a.fv.split(",")):
        w(f"{l}  {cells[i] if i < len(cells) and cells[i] else '*'}")
    w("")
w("[COORDINATES]")
for nm, (x, y) in X.items():
    w(f"{nm}  {x * 1000:.1f}  {y * 1000:.1f}")
w(f"BASIN  15400.0  -1200.0\nBAY  16400.0  -400.0\nTOWN  17200.0  -400.0\nOUTJ  17200.0  -1800.0\nSINK  18200.0  -1800.0\nOLDSINK  15400.0  -3400.0")
open(a.out, "w").write("\n".join(src) + "\n")
