import subprocess, json, re, sys, os
B='/home/claude/build'; OD='/mnt/skills/plugins/corinne-testing/scripts/out-diff.js'
sys.path.insert(0,'.'); import gen
models = sys.argv[1].split(',') if len(sys.argv)>1 else list(gen.MODELS)
dts = [5,30,60,120,300]
thetas = [float(x) for x in (sys.argv[2].split(',') if len(sys.argv)>2 else ['1.0'])]
def run(exe, inp, tag, env=None):
    e=dict(os.environ); e.update(env or {})
    try:
        p=subprocess.run([exe, inp, tag+'.rpt', tag+'.out'], capture_output=True, text=True, timeout=180, env=e)
    except subprocess.TimeoutExpired:
        return None, 'TIMEOUT'
    rpt=open(tag+'.rpt', errors='replace').read()
    m=re.findall(r'Continuity Error \(%\) \.+\s+(-?[\d.]+)', rpt)
    cont=float(m[-1]) if m else float('nan')
    return cont, p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ''
def diff(a,b):
    p=subprocess.run(['node',OD,a,b,'--json'],capture_output=True,text=True)
    try: j=json.loads(p.stdout)
    except Exception: return None
    return j
rows=[]
for m in models:
    open(f'{m}_1.inp','w').write(gen.chain(m,1,**gen.MODELS[m]))
    c,_=run(B+'/stock', f'{m}_1.inp', f'ref_{m}')
    print(f'\n== {m}: reference = stock at 1 s, continuity {c:+.3f}%')
    print(f'{"dt":>4} {"engine":<10} {"cont%":>8} {"flow worst":>10} {"flow peak":>9} {"depth worst":>11} {"depth peak":>10}  notes')
    for dt in dts:
        open(f'{m}_{dt}.inp','w').write(gen.chain(m,dt,**gen.MODELS[m]))
        runs=[('stock', B+'/stock', None)]+[(f'sgi th{t:g}', B+'/sgiswmm', {'SGI':'1','SGI_THETA':str(t)}) for t in thetas]
        for name,exe,env in runs:
            tag=f'{name.replace(" ","")}_{m}_{dt}'
            c,line=run(exe, f'{m}_{dt}.inp', tag, env)
            if c is None: print(f'{dt:>4} {name:<10} TIMEOUT'); continue
            j=diff(f'ref_{m}.out', tag+'.out')
            note=''
            if env:
                mm=re.search(r'trials/step=([\d.]+).*nonConv=(\d+)', line); note=f'trials/step {mm.group(1)}, nonconv {mm.group(2)}' if mm else line
            if not j: print(f'{dt:>4} {name:<10} {c:>8.3f}  (no diff) {note}'); continue
            L,N=j['links'],j['nodes']
            print(f'{dt:>4} {name:<10} {c:>8.3f} {100*L["worstInstant"]["max"]:>9.1f}% {100*L["peakChange"]["max"]:>8.1f}% {100*N["worstInstant"]["max"]:>10.1f}% {100*N["peakChange"]["max"]:>9.1f}%  {note}')
            rows.append((m,dt,name,c,L["worstInstant"]["max"],L["peakChange"]["max"],N["worstInstant"]["max"],N["peakChange"]["max"],note))
json.dump(rows,open('sweep_'+'_'.join(models)[:40]+'.json','w'))
