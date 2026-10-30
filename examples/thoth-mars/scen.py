import os
HERE = os.path.dirname(os.path.abspath(__file__))
import subprocess, re, sys, json
sys.path.insert(0, HERE)
from outread import read_out, series
import numpy as np
GEN=os.path.join(HERE, 'gen_thoth.py')
def scen(name, eng, args):
    subprocess.run(['python3',GEN,name+'.inp']+args,check=True)
    subprocess.run([eng,name+'.inp',name+'.rpt',name+'.out'],capture_output=True)
    rpt=open(name+'.rpt',encoding='latin-1').read()
    g=lambda pat: (re.search(pat,rpt) or [None,None])[1]
    r=read_out(name+'.out'); t=np.arange(1,r['periods']+1)*r['report_step']/3600
    yb=series(r,'node','BASIN',0); qs=series(r,'link','OLDGATE',0); y6=series(r,'node','L6',0); y1=series(r,'node','U1',0)
    spill=float(qs.sum()*r['report_step'])
    fl=re.search(r'\n\s+BASIN\s+([\d.]+)\s+([\d.]+)\s+\d+\s+[\d:]+\s+([\d.]+)', rpt[rpt.find('Node Flooding Summary'):])
    return dict(name=name, ybmax=float(yb.max()), tb=float(t[yb.argmax()]), y6max=float(y6.max()), y1max=float(y1.max()),
                spill_mft3=spill/1e6, spill_af=spill/43560, flood_hours=float(fl.group(1)) if fl else 0.0, flood_mgal=float(fl.group(3)) if fl else 0.0,
                cont=g(r'Flow Routing Continuity[\s\S]*?Continuity Error \(%\) \.+\s+(-?[\d.]+)'), avgstep=g(r'Average Time Step\s*:\s*([\d.]+)'))
if __name__=='__main__':
    MARS=['--n','0.02437','--cw','2.050']
    out=[]
    E=os.environ.get('SWMM_FV_MARS', 'swmm5_fvlink_mars')  # this branch built with mars_gravity.patch
    for T in [26,30,32,34,36,38]:
        out.append(scen(f'D{T}', E, MARS+['--fv','CULVERT','--spill',str(T)]))
        print(json.dumps(out[-1]))
