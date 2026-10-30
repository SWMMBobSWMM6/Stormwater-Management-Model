"""Quantify native-vs-wasm .out differences: max |diff| of link flow and node depth,
relative to that variable's peak magnitude in the native run; plus the share of
float32 values that differ at all."""
import sys, os, struct, numpy as np
sys.path.insert(0, '/home/claude/fvlink/scripts')
from outread import read_out
def rawvals(p):
    d = open(p,'rb').read()
    out_pos, nper = struct.unpack('2i', d[-4*4:-4*2])
    return np.frombuffer(d[out_pos:len(d)-24], dtype=np.uint8)
res=[]
for line in open(sys.argv[1]):
    tag, key = line.split()[:2]
    if tag != 'DIFFERENT': continue
    n = os.path.join(sys.argv[2], key + '.n.out'); w = os.path.join(sys.argv[2], key + '.w.out')
    if not (os.path.getsize(n) and os.path.getsize(w)):
        print(f"{key}: no .out (n={os.path.getsize(n)} w={os.path.getsize(w)})"); continue
    a, b = read_out(n), read_out(w)
    if a['link'].shape != b['link'].shape: print(key, 'SHAPE'); continue
    q = np.abs(a['link'][:,:,0]-b['link'][:,:,0]).max(); qmax = np.abs(a['link'][:,:,0]).max()
    h = np.abs(a['node'][:,:,0]-b['node'][:,:,0]).max(); hmax = np.abs(a['node'][:,:,0]).max()
    allv_a = np.concatenate([a['node'].ravel(), a['link'].ravel(), a['sys'].ravel()])
    allv_b = np.concatenate([b['node'].ravel(), b['link'].ravel(), b['sys'].ravel()])
    frac = np.mean(allv_a != allv_b)
    print(f"{key}: maxdQ={q:.3g} cfs ({q/max(qmax,1e-12):.2e} of peak {qmax:.4g}); maxdY={h:.3g} ft ({h/max(hmax,1e-12):.2e}); values differing {frac*100:.2f}%")
