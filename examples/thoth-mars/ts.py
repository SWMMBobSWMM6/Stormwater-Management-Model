import os
HERE = os.path.dirname(os.path.abspath(__file__))
import sys; sys.path.insert(0, HERE)
from outread import read_out, series
import numpy as np
def summ(f, links=('LT6','LT7','THROAT','SILL'), nodes=('L6','LOCK','BASIN')):
    r=read_out(f); t=np.arange(1,r['periods']+1)*r['report_step']/3600
    out={}
    for l in links:
        q=series(r,'link',l,0); dq=np.abs(np.diff(q))
        out[l]=(round(q.max(),1), round(q.min(),1), round(dq.sum()), int((np.diff(np.sign(np.diff(q)))!=0).sum()))
    for n in nodes:
        d=series(r,'node',n,0); out[n]=(round(d.max(),3), round(d.min(),3))
    return r,t,out
if __name__=='__main__':
    for f in sys.argv[1:]:
        r,t,o=summ(f); print(f, o)
