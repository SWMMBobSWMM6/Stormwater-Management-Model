"""Test-network generator for the swmm524-fvlink branch (US units, CFS).

Each builder returns .inp text. FV links are listed in [FV_LINKS] only when
`fv` is given, so the same builder makes the dynamic wave baseline and the
FV variant from identical input.
"""
import os

HEADER = """[TITLE]
{title}

[OPTIONS]
FLOW_UNITS           CFS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE
LINK_OFFSETS         DEPTH
START_DATE           01/01/2026
START_TIME           00:00:00
REPORT_START_DATE    01/01/2026
REPORT_START_TIME    00:00:00
END_DATE             01/01/2026
END_TIME             {end}
DRY_DAYS             0
REPORT_STEP          {rstep}
WET_STEP             00:05:00
DRY_STEP             00:05:00
ROUTING_STEP         {route}
VARIABLE_STEP        {vstep}
LENGTHENING_STEP     0
MIN_SURFAREA         12.566
SURCHARGE_METHOD     {sur}
INERTIAL_DAMPING     PARTIAL
NORMAL_FLOW_LIMITED  BOTH
ALLOW_PONDING        NO
HEAD_TOLERANCE       0.005
MAX_TRIALS           8
THREADS              1
"""


def hydrograph(name, qbase, qpeak, t0=0.25, rise=0.5, fall=1.0, end=6.0):
    """Triangular hydrograph on a base flow, times in decimal hours."""
    pts = [(0.0, qbase), (t0, qbase), (t0 + rise, qpeak),
           (t0 + rise + fall, qbase), (end, qbase)]
    return [f"{name:<16} {t:8.4f} {q:10.3f}" for t, q in pts]


def write(title, junctions, outfalls, conduits, xsects, inflows=(),
          tseries=(), storage=(), fv=None, end="06:00:00", rstep="00:00:30",
          route=5, vstep=0.75, sur="SLOT", extra=""):
    s = HEADER.format(title=title, end=end, rstep=rstep, route=route,
                      vstep=vstep, sur=sur)
    s += "\n[JUNCTIONS]\n;;Name Elev MaxDepth InitDepth SurDepth Aponded\n"
    for j in junctions:
        s += "{:<10} {:9.3f} {:6.2f} {:6.3f} {:6.2f} 0\n".format(*j)
    s += "\n[OUTFALLS]\n;;Name Elev Type StageData Gated\n"
    for o in outfalls:
        s += " ".join(str(x) for x in o) + "\n"
    if storage:
        s += "\n[STORAGE]\n;;Name Elev MaxD InitD Shape Params...\n"
        for st in storage:
            s += " ".join(str(x) for x in st) + "\n"
    s += "\n[CONDUITS]\n;;Name From To Length n InOff OutOff InitFlow MaxFlow\n"
    for c in conduits:
        s += "{:<8} {:<8} {:<8} {:8.2f} {:6.4f} {:6.3f} {:6.3f} 0 0\n".format(*c)
    s += "\n[XSECTIONS]\n;;Link Shape G1 G2 G3 G4 Barrels\n"
    for x in xsects:
        s += " ".join(str(v) for v in x) + "\n"
    if inflows:
        s += "\n[INFLOWS]\n;;Node Constituent TimeSeries Type Mfactor Sfactor Baseline Pattern\n"
        for nd, ts in inflows:
            s += f"{nd} FLOW {ts} FLOW 1.0 1.0\n"
    if tseries:
        s += "\n[TIMESERIES]\n" + "\n".join(tseries) + "\n"
    s += extra
    s += "\n[REPORT]\nINPUT NO\nCONTROLS NO\nNODES ALL\nLINKS ALL\n"
    if fv:
        s += "\n[FV_LINKS]\n;;Link Cells\n"
        for item in fv:
            if isinstance(item, tuple):
                s += f"{item[0]} {item[1]}\n"
            else:
                s += f"{item}\n"
    return s


def chain(n=8, length=300.0, slope=0.005, diam=3.0, rough=0.013, qpeak=30.0,
          qbase=1.0, z0=100.0, lengths=None, maxdepth=12.0, **kw):
    """Straight chain J1..Jn -> O1 of circular pipes with a triangular inflow."""
    lengths = lengths or [length] * n
    elev = [z0]
    for L in lengths:
        elev.append(elev[-1] - slope * L)
    junctions = [(f"J{i+1}", elev[i], maxdepth, 0.0, 0.0) for i in range(n)]
    outfalls = [("O1", f"{elev[n]:.3f}", "FREE", "", "NO")]
    conduits, xsects = [], []
    for i in range(n):
        to = f"J{i+2}" if i < n - 1 else "O1"
        conduits.append((f"C{i+1}", f"J{i+1}", to, lengths[i], rough, 0.0, 0.0))
        xsects.append((f"C{i+1}", "CIRCULAR", diam, 0, 0, 0, 1))
    ts = hydrograph("HYD", qbase, qpeak)
    return write("chain", junctions, outfalls, conduits, xsects,
                 inflows=[("J1", "HYD")], tseries=ts, **kw)


def lake(fv=None, stage=105.0, **kw):
    """Still water at a uniform head over pipes with slopes, offsets and a
    bed step; the outfall holds the same stage. Nothing should move."""
    junctions = [("J1", 100.0, 12.0, stage - 100.0, 0.0),
                 ("J2", 98.5, 12.0, stage - 98.5, 0.0),
                 ("J3", 97.0, 12.0, stage - 97.0, 0.0),
                 ("J4", 96.0, 12.0, stage - 96.0, 0.0)]
    outfalls = [("O1", "95.000", "FIXED", f"{stage:.3f}", "NO")]
    conduits = [("C1", "J1", "J2", 300.0, 0.013, 0.0, 0.0),
                ("C2", "J2", "J3", 300.0, 0.013, 0.5, 0.0),   # offset step
                ("C3", "J3", "J4", 200.0, 0.013, 0.0, 0.0),
                ("C4", "J4", "O1", 100.0, 0.013, 0.0, 0.0)]
    xsects = [("C1", "CIRCULAR", 3.0, 0, 0, 0, 1),
              ("C2", "RECT_OPEN", 4.0, 5.0, 0, 0, 1),
              ("C3", "CIRCULAR", 6.0, 0, 0, 0, 2),
              ("C4", "TRAPEZOIDAL", 6.0, 4.0, 1.0, 1.0, 1)]
    return write("lake at rest", junctions, outfalls, conduits, xsects,
                 fv=fv, end="02:00:00", **kw)


def channel(fv=None, q=60.0, n=0.015, slope=0.001, width=10.0, **kw):
    """Long rectangular channel in three reaches with constant inflow; the
    middle reach should sit at Manning normal depth."""
    L = [1000.0, 2000.0, 1000.0]
    z = [100.0]
    for x in L:
        z.append(z[-1] - slope * x)
    junctions = [(f"J{i+1}", z[i], 8.0, 0.0, 0.0) for i in range(3)]
    outfalls = [("O1", f"{z[3]:.3f}", "NORMAL", "", "NO")]
    conduits = [("C1", "J1", "J2", L[0], n, 0.0, 0.0),
                ("C2", "J2", "J3", L[1], n, 0.0, 0.0),
                ("C3", "J3", "O1", L[2], n, 0.0, 0.0)]
    xsects = [(c, "RECT_OPEN", 6.0, width, 0, 0, 1) for c in ("C1", "C2", "C3")]
    ts = [f"CONST 0.0 {q}", f"CONST 12.0 {q}"]
    return write("uniform channel", junctions, outfalls, conduits, xsects,
                 inflows=[("J1", "CONST")], tseries=ts, fv=fv,
                 end="12:00:00", rstep="00:05:00", **kw)


def mixed(fv=None, qpeak=45.0, **kw):
    """A storage unit drains through a conduit into a chain with two
    consecutive conduits sharing a junction and a last conduit into the
    outfall, plus a side branch and an orifice."""
    junctions = [("J1", 98.0, 10.0, 0.0, 0.0), ("J2", 97.0, 10.0, 0.0, 0.0),
                 ("J3", 96.0, 10.0, 0.0, 0.0), ("J4", 95.0, 10.0, 0.0, 0.0),
                 ("B1", 99.0, 8.0, 0.0, 0.0)]
    storage = [("S1", "100.0", "10.0", "0.0", "FUNCTIONAL", "1000", "0", "0",
                "0", "0")]
    outfalls = [("O1", "94.0", "FREE", "", "NO")]
    conduits = [("C1", "S1", "J1", 200.0, 0.013, 0.0, 0.0),
                ("C2", "J1", "J2", 200.0, 0.013, 0.0, 0.0),
                ("C3", "J2", "J3", 200.0, 0.013, 0.0, 0.0),
                ("C4", "J3", "J4", 200.0, 0.013, 0.0, 0.0),
                ("C5", "J4", "O1", 200.0, 0.013, 0.0, 0.0),
                ("CB", "B1", "J2", 300.0, 0.013, 0.0, 0.5)]
    xsects = [("C1", "CIRCULAR", 2.5, 0, 0, 0, 1),
              ("C2", "CIRCULAR", 3.0, 0, 0, 0, 1),
              ("C3", "CIRCULAR", 3.5, 0, 0, 0, 1),
              ("C4", "RECT_CLOSED", 3.0, 4.0, 0, 0, 1),
              ("C5", "CIRCULAR", 4.0, 0, 0, 0, 1),
              ("CB", "CIRCULAR", 1.5, 0, 0, 0, 1)]
    ts = hydrograph("HYD", 1.0, qpeak) + hydrograph("SIDE", 0.2, 6.0, t0=0.5)
    return write("mixed", junctions, outfalls, conduits, xsects,
                 inflows=[("S1", "HYD"), ("B1", "SIDE")], tseries=ts,
                 storage=storage, fv=fv, **kw)


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "models"
    os.makedirs(out, exist_ok=True)
    print("ok")


def tree(n_trunk=40, n_lat=9, lat_len=300.0, trunk_len=300.0, short_at=20,
         short_len=10.0, qpeak=4.0, fv=None, **kw):
    """Trunk of n_trunk circular pipes with an n_lat-pipe lateral entering
    every trunk junction; one trunk pipe is short_len long. Each lateral head
    gets the same triangular inflow."""
    junctions, conduits, xsects, inflows = [], [], [], []
    z = 100.0
    tz = []
    for i in range(n_trunk):
        tz.append(z)
        L = short_len if i == short_at else trunk_len
        z -= 0.002 * L
    for i in range(n_trunk):
        junctions.append((f"T{i+1}", tz[i], 15.0, 0.0, 0.0))
    outfalls = [("O1", f"{z:.3f}", "FREE", "", "NO")]
    for i in range(n_trunk):
        to = f"T{i+2}" if i < n_trunk - 1 else "O1"
        L = short_len if i == short_at else trunk_len
        conduits.append((f"CT{i+1}", f"T{i+1}", to, L, 0.013, 0.0, 0.0))
        xsects.append((f"CT{i+1}", "CIRCULAR", 6.0, 0, 0, 0, 1))
        # lateral
        lz = tz[i] + 1.0 + 0.005 * lat_len * n_lat
        for k in range(n_lat):
            nm = f"L{i+1}_{k+1}"
            junctions.append((nm, lz, 8.0, 0.0, 0.0))
            to = f"L{i+1}_{k+2}" if k < n_lat - 1 else f"T{i+1}"
            off = 1.0 if k == n_lat - 1 else 0.0
            conduits.append((f"CL{i+1}_{k+1}", nm, to, lat_len, 0.013, 0.0, off))
            xsects.append((f"CL{i+1}_{k+1}", "CIRCULAR", 1.5, 0, 0, 0, 1))
            lz -= 0.005 * lat_len
        inflows.append((f"L{i+1}_1", "HYD"))
    ts = hydrograph("HYD", 0.1, qpeak)
    return write("tree", junctions, outfalls, conduits, xsects,
                 inflows=inflows, tseries=ts, fv=fv, **kw)
