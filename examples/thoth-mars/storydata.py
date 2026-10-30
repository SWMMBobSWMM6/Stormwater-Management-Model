import os
HERE = os.path.dirname(os.path.abspath(__file__))
"""Collect the numbers behind the story's charts from the Thoth runs (all real runs)."""
import sys, json, math, re
sys.path.insert(0, HERE)
from outread import read_out, series
import numpy as np
R = os.path.join(HERE, 'runs', '')  # .out files: rerun the .inp files (see RUNS.md)
D = {}
def ts(f, kind, name, var, t0=0, t1=96, step=1):
    r = read_out(R + f); t = np.arange(1, r['periods'] + 1) * r['report_step'] / 3600
    y = series(r, kind, name, var); m = (t >= t0) & (t <= t1)
    return [round(float(x), 3) for x in t[m][::step]], [round(float(v), 3) for v in y[m][::step]]
# melt hydrograph from the input file
pts = []
for ln in open(R + 'C_fv_c1.inp'):
    if ln.startswith('MELT '):
        a = ln.split(); pts.append([float(a[1]), float(a[2])])
D['melt'] = pts
# Courant clock in the company model (Earth, stock, lock + throat + culvert)
G = 32.2
sec = {}; cur = None
for ln in open(R + 'CO.inp'):
    s = ln.split(';')[0].strip()
    if not s: continue
    if s.startswith('['): cur = s; sec[cur] = []; continue
    sec[cur].append(s.split())
L = {r[0]: float(r[3]) for r in sec['[CONDUITS]']}
X = {r[0]: (r[1], float(r[2]), float(r[3]), float(r[4]) if len(r) > 4 else 0) for r in sec['[XSECTIONS]'] if r[0] in L}
r = read_out(R + 'CO.out'); dep = r['link'][:, :, 1]; vel = r['link'][:, :, 2]
cour = {}
for j, lid in enumerate(r['links']):
    if lid not in L: continue
    shp, g1, g2, g3 = X[lid]; best = math.inf
    for p in range(dep.shape[0]):
        y, v = float(dep[p, j]), abs(float(vel[p, j]))
        if y <= 1e-4 or g1 - y <= 1e-4 or v <= 1e-4: continue
        if shp == 'TRAPEZOIDAL': A = (g2 + g3 * y) * y; T = g2 + 2 * g3 * y
        else: A = g2 * y; T = g2
        c = math.sqrt(G * A / T)
        if v / c <= 0.01: continue
        best = min(best, 0.75 * L[lid] / (v + c))
    if math.isfinite(best): cour[lid] = round(best, 3)
D['courant'] = cour
D['co_avgstep'] = float(re.search(r'Average Time Step\s*:\s*([\d.]+)', open(R + 'CO.rpt', encoding='latin-1').read()).group(1))
# throat spikes in the company run
t, q = ts('CO.out', 'link', 'THROAT', 0)
D['co_throat_max'] = max(q); D['co_throat_min'] = min(q)
# the canal rings: gravity only (B) vs gravity + friction + weir (C, FV 4 cells)
for k, f in (('ring_B', 'B.out'), ('ring_C', 'C.out')):
    D[k] = {'L6': ts(f, 'node', 'L6', 0, 28, 52), 'LT7': ts(f, 'link', 'LT7', 0, 28, 52)}
# depth at U1 at the peak: Earth company vs Mars corrected
D['u1'] = {'company': max(ts('CO.out', 'node', 'U1', 0)[1]), 'mars': max(ts('F_nospill_fv1.out', 'node', 'U1', 0)[1])}
# the uphill throat (Mars, lock + throat as FV, original engine)
for k, (n, var) in {'lock_head': ('LOCK', 1), 'basin_head': ('BASIN', 1)}.items():
    D['uphill_' + k] = ts('CMl.out', 'node', n, var, 0, 60, 3)
D['uphill_q'] = ts('CMl.out', 'link', 'THROAT', 0, 0, 60, 3)
D['uphill_v'] = ts('CMl.out', 'link', 'THROAT', 2, 0, 60, 3)
# forecasts: basin depth
for k, f in (('company', 'CO.out'), ('mars_nospill', 'F_nospill_fv1.out'), ('plan_fv1', 'F_full38c52_fv1.out'),
             ('plan_stock', 'F_full38c52_stock.out'), ('half38', 'F_half38_fv1.out')):
    D['basin_' + k] = ts(f, 'node', 'BASIN', 0, 20, 72, 2)
D['scen'] = json.load(open(os.path.join(HERE, 'scenarios.json')))
D['timing'] = json.load(open(os.path.join(HERE, 'timing_C.json')))
json.dump(D, open(os.path.join(HERE, 'storydata.json'), 'w'))
print('courant', sorted(D['courant'].items(), key=lambda kv: kv[1])[:6], 'avgstep', D['co_avgstep'])
print('throat', D['co_throat_max'], D['co_throat_min'], 'u1', D['u1'])
