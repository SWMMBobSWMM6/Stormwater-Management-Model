import subprocess, json, re, os, sys, time
B='/home/claude/build'; OD='/mnt/skills/plugins/corinne-testing/scripts/out-diff.js'
src=open('gv.inp',errors='replace').read()
def variant(tag, step=None, var=None, extra=None):
    t=src
    if step is not None:
        t=re.sub(r'(?m)^ROUTING_STEP\s+\S+.*$', f'ROUTING_STEP         {step}', t)
    if var is not None:
        t=re.sub(r'(?m)^VARIABLE_STEP\s+\S+.*$', f'VARIABLE_STEP        {var}', t)
    for k,v in (extra or {}).items():
        t,n=re.subn(rf'(?m)^{k}\s+\S+.*$', f'{k}  {v}', t)
        if n==0: t=t.replace('[OPTIONS]\n', f'[OPTIONS]\n{k}  {v}\n',1)
    fn=f'gv_{tag}.inp'; open(fn,'w',encoding='latin-1',errors='replace').write(t); return fn
def run(exe, inp, tag, env=None):
    e=dict(os.environ); e.update(env or {})
    t0=time.time()
    try: p=subprocess.run([exe, inp, tag+'.rpt', tag+'.out'], capture_output=True, text=True, timeout=600, env=e)
    except subprocess.TimeoutExpired: return dict(fail='TIMEOUT')
    wall=time.time()-t0
    rpt=open(tag+'.rpt',errors='replace').read()
    m=re.findall(r'Continuity Error \(%\) \.+\s+(-?[\d.]+)', rpt)
    nc=re.search(r'% of Steps Not Converging\s+:\s+([\d.]+)', rpt)
    it=re.search(r'Average Iterations per Step\s*:\s+([\d.]+)', rpt)
    err=re.search(r'ERROR \d+.*', rpt)
    fl=re.search(r'Flooding Loss \.+\s+([\d.]+)\s+([\d.]+)', rpt)
    eo=re.search(r'External Outflow \.+\s+([\d.]+)\s+([\d.]+)', rpt)
    return dict(cont=float(m[2]) if len(m)>2 else float('nan'), nonconv=float(nc.group(1)) if nc else float('nan'),
                iters=float(it.group(1)) if it else float('nan'), wall=wall, err=err.group(0) if err else '', line=p.stdout.strip().splitlines()[-1] if p.stdout.strip() else '',
                flood=float(fl.group(2)) if fl else float('nan'), outflow=float(eo.group(2)) if eo else float('nan'))
def diff(a,b):
    p=subprocess.run(['node',OD,a,b,'--json'],capture_output=True,text=True)
    try: return json.loads(p.stdout)
    except Exception: return None
def fmt(r, j):
    if 'fail' in r: return r['fail']
    s=f"cont {r['cont']:+7.2f}%  outflow {r['outflow']:7.3f}  flood {r['flood']:6.3f} Mgal  nonconv {r['nonconv']:5.1f}%  it/step {r['iters']:5.2f}  wall {r['wall']:5.1f}s"
    if j and j['links']['peakChange']['median'] is not None:
        L,N=j['links'],j['nodes']
        s+=(f"\n        links n={L['peakChange']['n']}: |peak| med {100*L['peakChange']['median']:.1f}% p90 {100*L['peakChange']['p90']:.1f}% max {100*L['peakChange']['max']:.0f}% (>10%: {100*L['peakChange']['gt10']:.0f}% of links)"
            f" | worst-instant med {100*L['worstInstant']['median']:.1f}% p90 {100*L['worstInstant']['p90']:.0f}%"
            f"\n        nodes n={N['peakChange']['n']}: |peak| med {100*N['peakChange']['median']:.1f}% p90 {100*N['peakChange']['p90']:.1f}% max {100*N['peakChange']['max']:.0f}% (>10%: {100*N['peakChange']['gt10']:.0f}% of nodes)"
            f" | worst-instant med {100*N['worstInstant']['median']:.1f}% p90 {100*N['worstInstant']['p90']:.0f}%")
    if r['err']: s+='\n        '+r['err']
    return s
res={}
ref=run(B+'/stock', variant('ref1',1,0), 'ref1') if not os.path.exists('ref1.out') else dict(cont=2.04,outflow=4.997,flood=0.925,nonconv=92.7,iters=7.65,wall=13.1,err=''); print('REFERENCE stock fixed 1 s:\n   ', fmt(ref,None)); res['ref1']=ref
r=(run(B+'/stock', variant('ref05','0.5',0), 'ref05') if not os.path.exists('ref05.out') else dict(cont=2.50,outflow=4.817,flood=0.998,nonconv=92.6,iters=7.64,wall=25.9,err='')); j=diff('ref1.out','ref05.out'); print('stock fixed 0.5 s vs the 1 s reference (how settled the reference is):\n   ', fmt(r,j)); res['ref05']=(r,j)
print('\nNATIVE SETTINGS (variable step, 10 s cap), each against the 1 s reference')
for name,exe,env in (('stock',B+'/stock',None),('sgi',B+'/sgiswmm',{'SGI':'1'})):
    r=run(exe,'gv.inp','nat_'+name,env); j=diff('ref1.out','nat_'+name+'.out'); print(f'  {name}:', fmt(r,j)); res['nat_'+name]=(r,j)
    if env: print('        ', r.get('line',''))
print('\nFIXED STEP, each against the 1 s reference')
for dt in (5,10,30,60):
    fn=variant(f'f{dt}',dt,0)
    for name,exe,env in (('stock',B+'/stock',None),('sgi',B+'/sgiswmm',{'SGI':'1'})):
        tag=f'f{dt}_{name}'; r=run(exe,fn,tag,env); j=diff('ref1.out',tag+'.out') if 'fail' not in r else None
        print(f'  {dt:>3} s {name}:', fmt(r,j)); res[tag]=(r,j)
        if env and 'fail' not in r: print('        ', r.get('line',''))
json.dump(res,open('gsweep.json','w'),default=str)
