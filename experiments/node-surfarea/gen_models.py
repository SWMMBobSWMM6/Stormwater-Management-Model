#!/usr/bin/env python3
"""Generate the ten synthetic SWMM5 DYNWAVE test networks (US units) for the
node-surface-area experiment. Each model isolates one feature.

    python3 gen_models.py models/synthetic
"""
import os, sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def options(route="0:00:05", var="0.75", lengthen="0", rpt="00:00:30"):
    return f"""[TITLE]
node-area experiment

[OPTIONS]
FLOW_UNITS           CFS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE
START_DATE           01/01/2026
START_TIME           00:00:00
REPORT_START_DATE    01/01/2026
REPORT_START_TIME    00:00:00
END_DATE             01/01/2026
END_TIME             06:00:00
DRY_STEP             01:00:00
WET_STEP             00:05:00
REPORT_STEP          {rpt}
ROUTING_STEP         {route}
ALLOW_PONDING        NO
INERTIAL_DAMPING     PARTIAL
VARIABLE_STEP        {var}
LENGTHENING_STEP     {lengthen}
MIN_SURFAREA         0
NORMAL_FLOW_LIMITED  BOTH
SKIP_STEADY_STATE    NO
FORCE_MAIN_EQUATION  H-W
LINK_OFFSETS         DEPTH
MIN_SLOPE            0
MAX_TRIALS           8
HEAD_TOLERANCE       0.005
SYS_FLOW_TOL         5
LAT_FLOW_TOL         5
MINIMUM_STEP         0.5
THREADS              1
SURCHARGE_METHOD     EXTRAN

[REPORT]
INPUT      NO
CONTROLS   NO
NODES      ALL
LINKS      ALL
"""

def tree(levels, diam_by_level, L, S, qleaf, drop=0.0, mhdepth=10.0):
    """Binary tree; level 0 is the root junction feeding the outfall."""
    nodes, links, inflows = [], [], []
    # build node ids per level
    lvl_nodes = []
    k = 0
    for lv in range(levels):
        ids = [f"J{lv}_{i}" for i in range(2**lv)]
        lvl_nodes.append(ids)
    # inverts: root invert 100, each level up adds S*L + drop
    inv = {}
    for lv, ids in enumerate(lvl_nodes):
        for i, n in enumerate(ids):
            inv[n] = 100.0 + lv * (S * L + drop)
    nodes = [(n, inv[n], mhdepth) for ids in lvl_nodes for n in ids]
    # links child -> parent
    for lv in range(1, levels):
        for i, n in enumerate(lvl_nodes[lv]):
            parent = lvl_nodes[lv - 1][i // 2]
            d = diam_by_level[lv]
            links.append((f"C{n}", n, parent, L, d, 0.0, drop))
    # outfall
    links.append(("CROOT", lvl_nodes[0][0], "OUT1", L, diam_by_level[0], 0.0, 0.0))
    inflows = [(n, qleaf) for n in lvl_nodes[-1]]
    return nodes, links, inflows, 100.0 - S * L

def chain(n, diam, L, S, qtop, mhdepth=12.0):
    nodes, links = [], []
    for i in range(n):
        nodes.append((f"N{i}", 100.0 + (n - 1 - i) * S * L, mhdepth))
    for i in range(n - 1):
        links.append((f"P{i}", f"N{i}", f"N{i+1}", L, diam, 0.0, 0.0))
    links.append(("POUT", f"N{n-1}", "OUT1", L, diam, 0.0, 0.0))
    return nodes, links, [("N0", qtop)], 100.0 - S * L

def write(name, opts, nodes, links, inflows, outinv, n=0.013):
    s = [opts]
    s.append("[JUNCTIONS]\n;;Name  Elev  MaxDepth  InitDepth  SurDepth  Aponded")
    for nm, inv, md in nodes:
        s.append(f"{nm}  {inv:.3f}  {md}  0  0  0")
    s.append("\n[OUTFALLS]\n;;Name  Elev  Type  Stage  Gated")
    s.append(f"OUT1  {outinv:.3f}  FREE  NO")
    s.append("\n[CONDUITS]\n;;Name  From  To  Length  Roughness  InOffset  OutOffset  InitFlow  MaxFlow")
    for nm, a, b, L, d, o1, o2 in links:
        s.append(f"{nm}  {a}  {b}  {L}  {n}  {o1}  {o2}  0  0")
    s.append("\n[XSECTIONS]\n;;Link  Shape  Geom1  Geom2  Geom3  Geom4  Barrels")
    for nm, a, b, L, d, o1, o2 in links:
        s.append(f"{nm}  CIRCULAR  {d}  0  0  0  1")
    s.append("\n[INFLOWS]\n;;Node  Constituent  TimeSeries  Type  Mfactor  Sfactor  Baseline  Pattern")
    for nm, q in inflows:
        s.append(f"{nm}  FLOW  HYD  FLOW  1.0  {q}")
    s.append("\n[TIMESERIES]\n;;Name  Time  Value")
    for t, v in [(0, 0.05), (0.5, 0.2), (1.0, 1.0), (1.5, 0.6), (2.0, 0.3), (3.0, 0.1), (4.0, 0.05), (6.0, 0.05)]:
        s.append(f"HYD  {t}  {v}")
    s.append("")
    open(os.path.join(OUT, name + ".inp"), "w").write("\n".join(s))

# M1 small sewer, 31 junctions, 8-18 in pipes, light load
small = {0: 1.5, 1: 1.25, 2: 1.0, 3: 0.83, 4: 0.67}
write("M1_small_sewer", options(), *tree(5, small, 300, 0.005, 0.25))
# M2 same network with 1.5 ft drop into every downstream manhole
write("M2_drop_manholes", options(), *tree(5, small, 300, 0.005, 0.25, drop=1.5))
# M3 undersized tree that surcharges (EXTRAN)
write("M3_surcharge", options(), *tree(5, small, 300, 0.005, 1.6))
# M4 large trunk chain, 60 in, 1000 ft reaches
write("M4_trunk", options(), *chain(12, 5.0, 1000, 0.001, 150.0))
# M5 short links, Courant lengthening on, fixed step
write("M5_short_lengthened", options(route="0:00:05", var="0", lengthen="10"),
      *chain(20, 2.0, 40, 0.004, 12.0))
# M6 small sewer at a coarse fixed step (stability stress)
write("M6_small_coarse_step", options(route="0:00:15", var="0"), *tree(5, small, 300, 0.005, 0.25))
# M7 trickle flows in small pipes (manhole floor dominates)
write("M7_trickle", options(), *tree(5, small, 300, 0.005, 0.02))
# M8 steep small pipes with drops (supercritical / critical ends)
write("M8_steep_drops", options(), *tree(5, small, 300, 0.04, 0.4, drop=1.0))
# M9 coarse fixed step with lengthening
write("M9_coarse_lengthened", options(route="0:00:20", var="0", lengthen="20"), *tree(5, small, 150, 0.005, 0.4))
# M10 surcharge under SLOT method
write("M10_surcharge_slot", options().replace("SURCHARGE_METHOD     EXTRAN","SURCHARGE_METHOD     SLOT"), *tree(5, small, 300, 0.005, 1.6))
print("wrote", sorted(os.listdir(OUT)))
