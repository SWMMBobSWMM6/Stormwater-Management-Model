import re,subprocess,os
B='/home/claude/build'; src=open('gv.inp',errors='replace').read()
def mk(tag,opts):
    t=src
    for k,v in opts.items():
        t,n=re.subn(rf'(?m)^{k}\s+\S+.*$', f'{k}  {v}', t)
        if n==0: t=t.replace('[OPTIONS]\n', f'[OPTIONS]\n{k}  {v}\n',1)
    fn=f'dg_{tag}.inp'; open(fn,'w',encoding='latin-1',errors='replace').write(t); return fn
def run(exe,fn,tag,env=None):
    e=dict(os.environ); e.update(env or {})
    subprocess.run([exe,fn,tag+'.rpt',tag+'.out'],capture_output=True,text=True,env=e,timeout=300)
    r=open(tag+'.rpt',errors='replace').read()
    c=re.findall(r'Continuity Error \(%\) \.+\s+(-?[\d.]+)',r); fl=re.search(r'Flooding Loss \.+\s+([\d.]+)\s+([\d.]+)',r); nc=re.search(r'% of Steps Not Converging\s+:\s+([\d.]+)',r)
    return f"cont {float(c[2]):+7.2f}%  flood {float(fl.group(2)):6.3f} Mgal  nonconv {nc.group(1)}%"
base={'ROUTING_STEP':30,'VARIABLE_STEP':0}
cases=[('as-is (damping NONE, tol 0.0001, lengthen 10)',{}),('INERTIAL_DAMPING PARTIAL',{'INERTIAL_DAMPING':'PARTIAL'}),('INERTIAL_DAMPING FULL',{'INERTIAL_DAMPING':'FULL'}),
       ('HEAD_TOLERANCE 0.005',{'HEAD_TOLERANCE':'0.005'}),('FULL + tol 0.005',{'INERTIAL_DAMPING':'FULL','HEAD_TOLERANCE':'0.005'}),
       ('NORMAL_FLOW_LIMITED FROUDE',{'NORMAL_FLOW_LIMITED':'FROUDE'}),('LENGTHENING_STEP 0',{'LENGTHENING_STEP':'0'})]
print('Greenville, fixed 30 s step')
for i,(name,o) in enumerate(cases):
    d=dict(base); d.update(o); fn=mk(f'c{i}',d)
    print(f'  {name:<46} stock: {run(B+"/stock",fn,f"dg_c{i}_st")}\n  {"":<46} sgi:   {run(B+"/sgiswmm",fn,f"dg_c{i}_sg",{"SGI":"1"})}')
