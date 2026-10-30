import sys
OPT = """[TITLE]
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
REPORT_STEP          00:05:00
WET_STEP             00:05:00
DRY_STEP             01:00:00
ROUTING_STEP         {dt}
ALLOW_PONDING        NO
INERTIAL_DAMPING     PARTIAL
NORMAL_FLOW_LIMITED  BOTH
VARIABLE_STEP        0
LENGTHENING_STEP     0
MIN_SURFAREA         12.566
MAX_TRIALS           8
HEAD_TOLERANCE       0.005
SURCHARGE_METHOD     EXTRAN
THREADS              1
"""
def chain(name, dt, n=10, L=400.0, D=3.0, slope=0.005, maxd=25.0, peak=30.0, shape='tri',
          out='FREE', end='06:00:00', rough=0.013, pond=False):
    s = OPT.format(title=name, dt=dt, end=end)
    z0 = n*L*slope
    s += "\n[JUNCTIONS]\n"
    first = 1
    if pond:
        first = 1
    for i in range(1, n+1):
        s += f"J{i} {z0-(i-1)*L*slope:.4f} {maxd} 0 0 0\n"
    s += "\n[OUTFALLS]\n"
    s += f"O1 0 {out}\n"
    if pond:
        s += f"\n[STORAGE]\nS1 {z0+2:.4f} 12 0 FUNCTIONAL 0 0 5000 0 0\n"
    s += "\n[CONDUITS]\n"
    for i in range(1, n+1):
        dn = f"J{i+1}" if i < n else "O1"
        s += f"C{i} J{i} {dn} {L} {rough} 0 0 0 0\n"
    if pond:
        s += "\n[ORIFICES]\nOR1 S1 J1 SIDE 0 0.65 NO 0\n"
        s += "\n[WEIRS]\nW1 S1 J1 TRANSVERSE 8 3.33 NO 0 0\n"
    s += "\n[XSECTIONS]\n"
    for i in range(1, n+1):
        s += f"C{i} CIRCULAR {D} 0 0 0 1\n"
    if pond:
        s += "OR1 CIRCULAR 1.5 0 0 0\nW1 RECT_OPEN 4 6 0 0\n"
    src = "S1" if pond else "J1"
    s += f"\n[INFLOWS]\n{src} FLOW TS1 FLOW 1.0 1.0\n"
    s += "\n[TIMESERIES]\n"
    if shape == 'tri':
        s += f"TS1 0:00 0\nTS1 1:00 {peak}\nTS1 3:00 0\nTS1 6:00 0\n"
    else:
        s += f"TS1 0:00 {peak}\nTS1 3:00 {peak}\nTS1 3:01 0\nTS1 6:00 0\n"
    s += "\n[REPORT]\nNODES ALL\nLINKS ALL\nCONTINUITY YES\nFLOWSTATS YES\n"
    return s
MODELS = {
 'flat10': dict(n=10, L=100.0, D=4.0, slope=0.0, peak=100.0, shape='sq', maxd=30.0),
 'mild':   dict(n=10, L=400.0, D=3.0, slope=0.005, peak=30.0),
 'steep':  dict(n=10, L=400.0, D=2.0, slope=0.04, peak=20.0),
 'surch':  dict(n=10, L=400.0, D=2.0, slope=0.005, peak=30.0, maxd=40.0),
 'flood':  dict(n=10, L=400.0, D=2.0, slope=0.005, peak=30.0, maxd=6.0),
 'tail':   dict(n=10, L=400.0, D=3.0, slope=0.002, peak=30.0, out='FIXED 5.0'),
 'pond':   dict(n=6,  L=300.0, D=2.5, slope=0.004, peak=60.0, pond=True, end='12:00:00'),
}
if __name__ == '__main__':
    name, dt = sys.argv[1], sys.argv[2]
    open(f"{name}_{dt}.inp", 'w').write(chain(name, dt, **MODELS[name]))
