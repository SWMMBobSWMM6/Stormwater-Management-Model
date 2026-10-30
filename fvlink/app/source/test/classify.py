"""Classify wasm-vs-native pairs. A: .out and .rpt identical (bar run stamps).
B: .out identical, .rpt differs. C: .out differs (quantified). E: neither wrote a .out
(model error) and the reports agree."""
import sys, os, re, subprocess, numpy as np
sys.path.insert(0, '/home/claude/fvlink/scripts')
from outread import read_out
D = sys.argv[2]; STAMP = re.compile(r'Analysis begun|Analysis ended|Total elapsed')
def rpt(p): return [l for l in open(p, encoding='latin-1') if not STAMP.search(l)] if os.path.exists(p) else []
def sz(p): return os.path.getsize(p) if os.path.exists(p) else 0
cnt = {}; rows = []
for line in open(sys.argv[1]):
    if not line.startswith(('IDENTICAL', 'DIFFERENT')): continue
    key = line.split()[1]
    n, w = f'{D}/{key}.n', f'{D}/{key}.w'
    rn, rw = rpt(n + '.rpt'), rpt(w + '.rpt')
    if sz(n + '.out') == 0 and sz(w + '.out') == 0:
        c = 'E' if rn == rw else 'E*'; detail = ''
    elif open(n + '.out', 'rb').read() == open(w + '.out', 'rb').read():
        c = 'A' if rn == rw else 'B'
        detail = '' if c == 'A' else f'{sum(1 for a, b in zip(rn, rw) if a != b)} rpt lines differ'
    else:
        c = 'C'; a, b = read_out(n + '.out'), read_out(w + '.out')
        def m(x, y):
            return (float(np.abs(x - y).max()), float(np.abs(x).max())) if x.size else (0.0, 0.0)
        dq, qm = m(a['link'][:, :, 0], b['link'][:, :, 0]); dy, ym = m(a['node'][:, :, 0], b['node'][:, :, 0])
        va = np.concatenate([a['node'].ravel(), a['link'].ravel(), a['sys'].ravel()])
        vb = np.concatenate([b['node'].ravel(), b['link'].ravel(), b['sys'].ravel()])
        detail = f'maxdQ={dq:.3g} cfs of peak {qm:.4g} ({dq/max(qm,1e-30):.1e}); maxdY={dy:.3g} ft of {ym:.4g}; {np.mean(va!=vb)*100:.2f}% of values differ'
    cnt[c] = cnt.get(c, 0) + 1; rows.append((c, key, detail))
for r in rows:
    if r[0] != 'A': print(*r)
print('COUNTS', cnt)
