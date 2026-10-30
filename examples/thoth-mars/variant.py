import os
HERE = os.path.dirname(os.path.abspath(__file__))
import re,subprocess,sys
sys.path.insert(0, HERE); from ts import summ
def strip_gate(t): return re.sub(r'\nOLDGATE .*','',t).replace('RULE NOSPILL\nIF SIMULATION TIME > 0\nTHEN ORIFICE OLDGATE SETTING = 0\n','')
def run(name, txt, eng=os.environ.get('SWMM_STOCK', 'swmm5_stock'), links=('LT7','THROAT'), nodes=('LOCK','BASIN')):
    open(name+'.inp','w').write(txt); subprocess.run([eng,name+'.inp',name+'.rpt',name+'.out'],capture_output=True)
    rpt=open(name+'.rpt',encoding='latin-1').read(); err=re.findall(r'ERROR.*',rpt)[:2]; ce=re.findall(r'Continuity Error \(%\) \.+\s+(-?[\d.]+)',rpt); st=re.search(r'Average Time Step\s*:\s*([\d.]+)',rpt)
    if err: print(name, err); return None
    r,t,o=summ(name+'.out', links=links, nodes=nodes)
    print(name, 'cont',ce, 'avgstep', st and st.group(1), o); return o
