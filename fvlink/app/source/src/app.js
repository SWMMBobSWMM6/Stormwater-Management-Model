"use strict";
// FV Link Lab: run stock EPA SWMM 5.2.4 and swmm524-fvlink side by side in the browser.

// ---------------------------------------------------------------- theme engine
const CHART_THEME={
  light:{face:'#ffffff',frame:'#d1d5db',gridY:'#eef0f3',gridX:'#f6f7f9',
    tick:'#6b7280',axis:'#4b5563',stroke:'#ffffff',
    dw:'#2563eb',fv:'#c2410c',aux:'#15803d',c4:'#7c3aed',ref:'#6b7280',pipe:'#374151',
    mark:'#111827',
    pal:['#2563eb','#c2410c','#15803d','#7c3aed']},
  dark:{face:'#0f1a2c',frame:'#2a3752',gridY:'#1c2740',gridX:'#16223a',
    tick:'#94a3b8',axis:'#c3cee0',stroke:'#0f1a2c',
    dw:'#4a8af4',fv:'#e8692a',aux:'#23a455',c4:'#9061f0',ref:'#94a3b8',pipe:'#cbd5e1',
    mark:'#f8fafc',
    pal:['#4a8af4','#e8692a','#23a455','#9061f0']}
};
// Large recessive area fills of the diagrams (water, cells, node bodies, soft bar fills, the
// alternate FV stripe). Kept apart from the series table: they are grounds, not data marks.
const DIAGRAM_FILLS={
  light:{fv2:'#fdba8c',water:'#cfe3fb',cell:'#9cc3f0',nodefill:'#f3f4f6',dwsoft:'#dbe7fb',fvsoft:'#fbe1d3'},
  dark:{fv2:'#9a3412',water:'#1e3a5f',cell:'#2f5d8f',nodefill:'#1f2a40',dwsoft:'#1b2f4f',fvsoft:'#3a2216'}
};
let THEME='dark', THEME_PREF='dark';
function prefersDark(){ try{ return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }catch(e){ return true; } }
function TH(){ return CHART_THEME[THEME==='dark'?'dark':'light']; }
function applyTheme(pref){
  THEME_PREF=(pref==='light'||pref==='auto')?pref:'dark';
  THEME=THEME_PREF==='auto'?(prefersDark()?'dark':'light'):THEME_PREF;
  const root=document.documentElement; root.setAttribute('data-theme',THEME);
  const t=TH(), d=DIAGRAM_FILLS[THEME==='dark'?'dark':'light'];
  [['--ch-face',t.face],['--ch-frame',t.frame],['--ch-grid',t.gridY],['--ch-tick',t.tick],['--ch-axis',t.axis],
   ['--c-dw',t.dw],['--c-fv',t.fv],['--c-aux',t.aux],['--c-c4',t.c4],['--c-ref',t.ref],['--c-pipe',t.pipe],['--c-fv2',d.fv2],['--c-water',d.water],
   ['--c-cell',d.cell],['--c-nodefill',d.nodefill],['--c-dw-soft',d.dwsoft],['--c-fv-soft',d.fvsoft]]
   .forEach(([k,v])=>root.style.setProperty(k,v));
  document.querySelectorAll('#theme-toggle button').forEach(b=>b.classList.toggle('on',b.dataset.t===THEME_PREF));
  try{ localStorage.setItem('fvlinklab_theme',THEME_PREF); }catch(e){}
}

// ---------------------------------------------------------------- helpers
const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt=(x,d=2)=>(x==null||!isFinite(x))?'–':Number(x).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtG=(x)=>(x==null||!isFinite(x))?'–':(Math.abs(x)>=1e4||(Math.abs(x)<1e-3&&x!==0))?Number(x).toExponential(2):Number(x).toLocaleString('en-US',{maximumFractionDigits:4});
function download(name,data,mime){
  const blob=data instanceof Blob?data:new Blob([data],{type:mime||'text/plain'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},1500);
}
function csv(rows){ return rows.map(r=>r.map(v=>{const s=v==null?'':String(v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n')+'\n'; }
const latin1=new TextDecoder('latin1');
let tipEl=null;
function tip(html,x,y){ if(!tipEl) tipEl=$('#tip'); if(!html){tipEl.style.display='none';return;} tipEl.innerHTML=html; tipEl.style.display='block';
  const w=tipEl.offsetWidth,h=tipEl.offsetHeight; tipEl.style.left=Math.max(6,Math.min(x+14,innerWidth-w-6))+'px'; tipEl.style.top=Math.max(6,Math.min(y+14,innerHeight-h-6))+'px'; }

// ---------------------------------------------------------------- .inp parsing
function parseInp(text){
  const lines=text.split(/\r?\n/), sec={}, order=[]; let cur=null;
  lines.forEach((raw,i)=>{
    const s=raw.replace(/;.*$/,'').trim();
    const m=raw.trim().match(/^\[([^\]]+)\]/);
    if(m){ cur=m[1].toUpperCase(); if(!sec[cur]){sec[cur]=[];order.push(cur);} return; }
    if(!s||!cur) return;
    sec[cur].push(s.split(/\s+/));
  });
  const opt={}; (sec.OPTIONS||[]).forEach(t=>{ opt[t[0].toUpperCase()]=t.slice(1).join(' '); });
  const nodes=new Map();
  const addN=(k,type)=>(sec[k]||[]).forEach(t=>nodes.set(t[0],{id:t[0],type,invert:+t[1]}));
  addN('JUNCTIONS','JUNCTION'); addN('OUTFALLS','OUTFALL'); addN('STORAGE','STORAGE'); addN('DIVIDERS','DIVIDER');
  const links=new Map();
  (sec.CONDUITS||[]).forEach(t=>links.set(t[0],{id:t[0],type:'CONDUIT',n1:t[1],n2:t[2],len:+t[3],n:+t[4],init:+(t[7]||0),qmax:+(t[8]||0)}));
  for(const [k,type] of [['PUMPS','PUMP'],['ORIFICES','ORIFICE'],['WEIRS','WEIR'],['OUTLETS','OUTLET']])
    (sec[k]||[]).forEach(t=>links.set(t[0],{id:t[0],type,n1:t[1],n2:t[2]}));
  (sec.XSECTIONS||[]).forEach(t=>{ const L=links.get(t[0]); if(!L) return; const sh=(t[1]||'').toUpperCase(); L.shape=sh;
    if(sh==='IRREGULAR'){L.geom=t[2];L.barrels=1;} else if(sh==='STREET'){L.geom=t[2];L.barrels=+(t[3]||1);}
    else if(sh==='CUSTOM'){L.geom=t[2]+' ft, '+t[3];L.barrels=+(t[4]||1);}
    else {L.g1=+t[2];L.g2=+t[3];L.barrels=+(t[6]||1);L.culvert=+(t[7]||0);} });
  (sec.LOSSES||[]).forEach(t=>{ const L=links.get(t[0]); if(!L) return; L.kin=+t[1]||0;L.kout=+t[2]||0;L.kavg=+t[3]||0;L.flap=/^(YES|TRUE)$/i.test(t[4]||'');L.seep=+(t[5]||0); });
  (sec.INLET_USAGE||[]).forEach(t=>{ const L=links.get(t[0]); if(L) L.inlet=true; });
  const coords=new Map(); (sec.COORDINATES||[]).forEach(t=>coords.set(t[0],[+t[1],+t[2]]));
  const verts=new Map(); (sec.VERTICES||[]).forEach(t=>{ if(!verts.has(t[0])) verts.set(t[0],[]); verts.get(t[0]).push([+t[1],+t[2]]); });
  const fv=new Map(); (sec.FV_LINKS||[]).forEach(t=>fv.set(t[0],(t[1]&&t[1]!=='*')?t[1]:''));
  const units=(opt.FLOW_UNITS||'CFS').toUpperCase(); const si=['CMS','LPS','MLD'].includes(units);
  return {lines,sec,order,opt,nodes,links,coords,verts,fv,units,si,routing:(opt.FLOW_ROUTING||'KINWAVE').toUpperCase()};
}
function parseDate(d,t){ // MM/DD/YYYY + HH:MM[:SS] -> ms
  if(!d) return NaN; const m=d.match(/(\d+)\/(\d+)\/(\d+)/); if(!m) return NaN;
  const tt=(t||'0:00').split(':').map(Number); return Date.UTC(+m[3],+m[1]-1,+m[2],tt[0]||0,tt[1]||0,tt[2]||0);
}
function simDays(P){ const a=parseDate(P.opt.START_DATE,P.opt.START_TIME), b=parseDate(P.opt.END_DATE,P.opt.END_TIME); return (b-a)/864e5; }

// FV pre-check: mirrors fvlink_validate() in fvlink.c. The engine has the final word.
function fvReasons(P,L){
  const r=[];
  if(P.routing!=='DYNWAVE') r.push('routing is not DYNWAVE');
  if(L.type!=='CONDUIT') { r.push(L.type.toLowerCase()+', not a conduit'); return r; }
  if(L.shape==='DUMMY') r.push('dummy conduit');
  if(L.shape==='FORCE_MAIN') r.push('force main');
  if(L.culvert>0) r.push('culvert code');
  if(L.flap) r.push('flap gate');
  if(L.kin||L.kout||L.kavg) r.push('entry/exit/average loss');
  if(L.seep>0) r.push('seepage');
  if(L.qmax>0) r.push('max. flow');
  if(L.inlet) r.push('street inlet');
  for(const M of P.links.values()){
    if((M.type==='PUMP'||(M.type==='CONDUIT'&&M.shape==='DUMMY'))&&(M.n1===L.n1||M.n1===L.n2)){ r.push((M.type==='PUMP'?'pump ':'dummy conduit ')+M.id+' draws from an end node'); break; }
  }
  return r;
}
function lenFt(P,L){ return P.si?L.len/0.3048:L.len; }
function defaultCells(P,L){ if(L.shape==='IRREGULAR') return null; return Math.max(4,Math.ceil(lenFt(P,L)/25)); }

// Build the two input files. They differ only by the [FV_LINKS] section.
function buildInputs(P,sel,opts){
  const out=[]; let cur=null, sawReport=false, hasNodesAll=false, hasLinksAll=false;
  const rs=opts.reportStep;
  for(const raw of P.lines){
    const m=raw.trim().match(/^\[([^\]]+)\]/);
    if(m){ cur=m[1].toUpperCase(); if(cur==='FV_LINKS') continue; if(cur==='REPORT') sawReport=true; out.push(raw); continue; }
    if(cur==='FV_LINKS') continue;
    const s=raw.replace(/;.*$/,'').trim();
    if(cur==='OPTIONS'&&rs&&/^REPORT_STEP\b/i.test(s)){ out.push('REPORT_STEP          '+rs); continue; }
    if(cur==='REPORT'&&opts.reportAll){
      if(/^NODES\b/i.test(s)){ out.push('NODES ALL'); hasNodesAll=true; continue; }
      if(/^LINKS\b/i.test(s)){ out.push('LINKS ALL'); hasLinksAll=true; continue; }
    }
    out.push(raw);
  }
  if(opts.reportAll){
    const add=[]; if(!hasNodesAll) add.push('NODES ALL'); if(!hasLinksAll) add.push('LINKS ALL');
    if(add.length){ if(sawReport){ const i=out.findIndex(l=>/^\s*\[REPORT\]/i.test(l)); out.splice(i+1,0,...add);} else out.push('','[REPORT]',...add); }
  }
  if(rs&&!Object.keys(P.opt).includes('REPORT_STEP')){ const i=out.findIndex(l=>/^\s*\[OPTIONS\]/i.test(l)); if(i>=0) out.splice(i+1,0,'REPORT_STEP          '+rs); }
  const stock=out.join('\n')+'\n';
  const fvLines=['','[FV_LINKS]',';;Link            Cells'];
  for(const [id,c] of sel) fvLines.push(id.padEnd(18)+' '+(c?c:'*'));
  return {stock, fv:stock+fvLines.join('\n')+'\n'};
}

// ---------------------------------------------------------------- .rpt parsing
function rptTable(txt,title){
  const i=txt.indexOf(title); if(i<0) return [];
  const L=txt.slice(i).split(/\r?\n/); let k=0, dashes=0; const rows=[];
  for(k=1;k<L.length;k++){ if(/^\s*-{10,}/.test(L[k])){dashes++; if(dashes===2) break;} if(dashes===0&&/^\s*\*{5}/.test(L[k])&&k>3) return rows; }
  for(k=k+1;k<L.length;k++){ const s=L[k].trim(); if(!s||/^-{10,}/.test(s)) break; rows.push(s.split(/\s+/)); }
  return rows;
}
function parseRpt(txt){
  const R={txt};
  const v=txt.match(/VERSION\s+([\d.]+)\s*\(Build\s+([\d.]+)\)/); R.version=v?v[2]:'';
  R.errors=txt.split(/\r?\n/).filter(l=>/ERROR\s+\d+/.test(l)).map(l=>l.trim());
  R.warnings=txt.split(/\r?\n/).filter(l=>/WARNING\s+\d+/.test(l)).map(l=>l.trim());
  const fr=txt.indexOf('Flow Routing Continuity');
  if(fr>=0){ const m=txt.slice(fr).match(/Continuity Error \(%\)\s*\.+\s*(-?[\d.]+)/); R.routeCont=m?+m[1]:null; }
  const rr=txt.indexOf('Runoff Quantity Continuity');
  if(rr>=0){ const m=txt.slice(rr).match(/Continuity Error \(%\)\s*\.+\s*(-?[\d.]+)/); R.runoffCont=m?+m[1]:null; }
  const g=(re)=>{const m=txt.match(re); return m?+m[1]:null;};
  R.minStep=g(/Minimum Time Step\s*:\s*([\d.]+)/); R.avgStep=g(/Average Time Step\s*:\s*([\d.]+)/); R.maxStep=g(/Maximum Time Step\s*:\s*([\d.]+)/);
  R.avgIter=g(/Average Iterations per Step\s*:\s*([\d.]+)/); R.nonConv=g(/% of Steps Not Converging\s*:\s*([\d.]+)/);
  R.elapsed=(txt.match(/Total elapsed time:\s*([^\r\n]+)/)||[])[1]||'';
  // FV Link Summary
  R.fv=[]; const fi=txt.indexOf('Finite-Volume Link Summary');
  if(fi>=0){ const L=txt.slice(fi).split(/\r?\n/); let k=L.findIndex(l=>/^\s*-{20,}/.test(l));
    for(k=k+1;k<L.length;k++){ const s=L[k].trim(); if(!s) break; const t=s.split(/\s+/);
      R.fv.push({id:t[0],cells:+t[1],dx:+t[2],subPerStep:+t[3],maxPerSolve:+t[4],minSub:+t[5],volBal:+t[6],floor:+t[7]}); }
    const rep=txt.slice(fi).match(/repaired[^\n]*/i); R.fvNote=rep?rep[0]:''; }
  R.instab=[]; const ii=txt.indexOf('Highest Flow Instability Indexes');
  if(ii>=0){ const L=txt.slice(ii).split(/\r?\n/).slice(2); for(const l of L){ const s=l.trim(); if(!s) break; R.instab.push(s);} }
  R.nodes=new Map(); rptTable(txt,'Node Depth Summary').forEach(t=>{ if(t.length>=8) R.nodes.set(t[0],{type:t[1],avg:+t[2],max:+t[3],hgl:+t[4],when:t[5]+' '+t[6]}); });
  R.links=new Map(); rptTable(txt,'Link Flow Summary').forEach(t=>{ if(t.length>=5) R.links.set(t[0],{type:t[1],max:+t[2],when:t[3]+' '+t[4],vel:t[5]!=null?+t[5]:null}); });
  return R;
}

// ---------------------------------------------------------------- .out parsing
function parseOut(buf){
  if(!buf||buf.byteLength<64) return null;
  const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength), n=buf.byteLength;
  const I=(o)=>dv.getInt32(o,true);
  const MAGIC=516114522;
  if(I(0)!==MAGIC||I(n-4)!==MAGIC) return null;
  const idPos=I(n-24), propPos=I(n-20), outPos=I(n-16), nPer=I(n-12), err=I(n-8);
  const ver=I(4), fu=I(8), nSub=I(12), nNode=I(16), nLink=I(20), nPoll=I(24);
  let p=idPos; const ids=(k)=>{const a=[]; for(let i=0;i<k;i++){const L=I(p); p+=4; a.push(latin1.decode(buf.subarray(p,p+L))); p+=L;} return a;};
  const sub=ids(nSub), node=ids(nNode), link=ids(nLink); ids(nPoll);
  p=propPos; let k=I(p); p+=4+4*k+4*nSub*k; k=I(p); p+=4+4*k+4*nNode*k; k=I(p); p+=4+4*k+4*nLink*k;
  const cnt=[]; for(let j=0;j<4;j++){ const c=I(p); cnt.push(c); p+=4+4*c; }
  const start=dv.getFloat64(p,true), rstep=I(p+8);
  const [nsv,nnv,nlv,nsys]=cnt, per=8+4*(nSub*nsv+nNode*nnv+nLink*nlv+nsys);
  const nodeIdx=new Map(node.map((id,i)=>[id,i])), linkIdx=new Map(link.map((id,i)=>[id,i]));
  function series(kind,id,v){
    const idx=(kind==='node'?nodeIdx:linkIdx).get(id); if(idx==null) return null;
    const base=outPos+8+4*(kind==='node'?nSub*nsv+idx*nnv+v:nSub*nsv+nNode*nnv+idx*nlv+v);
    const a=new Float64Array(nPer); for(let i=0;i<nPer;i++) a[i]=dv.getFloat32(base+i*per,true); return a;
  }
  return {ver,fu,nSub,nNode,nLink,nPoll,nPer,err,rstep,start,node,link,nodeIdx,linkIdx,series,bytes:n};
}
const FLOW_UNITS=['CFS','GPM','MGD','CMS','LPS','MLD'];

// ---------------------------------------------------------------- engines
const ENG={};
function engineURL(which){
  if(ENG[which]) return ENG[which];
  const glue=$('#eng-'+which).textContent, w=$('#eng-worker').textContent;
  const name=which==='stock'?'createSwmmStock':'createSwmmFV';
  ENG[which]=URL.createObjectURL(new Blob([glue,'\nconst createSwmm = '+name+';\n',w],{type:'text/javascript'}));
  return ENG[which];
}
let RUNNING=null;
function runEngine(which,inp,files,days,onProgress){
  return new Promise((resolve)=>{
    const w=new Worker(engineURL(which));
    RUNNING={w,resolve};
    w.onmessage=(e)=>{ const m=e.data;
      if(m.type==='progress') onProgress&&onProgress(m.frac);
      else { w.terminate(); RUNNING=null; resolve(m); } };
    w.onerror=(e)=>{ w.terminate(); RUNNING=null; resolve({type:'fail',error:e.message||'worker error'}); };
    w.postMessage({inp,files,days});
  });
}
function cancelRun(){ if(RUNNING){ RUNNING.w.terminate(); const r=RUNNING.resolve; RUNNING=null; r({type:'fail',error:'cancelled'}); } }

// ---------------------------------------------------------------- state
const S={name:'',text:'',files:[],P:null,sel:new Map(),res:null,filter:'',chartKind:'link',chartId:'',chartVar:0,busy:false};

function loadModel(name,text,files,fvPreset){
  S.name=name; S.text=text; S.files=files||[]; S.P=parseInp(text); S.res=null;
  S.sel=new Map(fvPreset||S.P.fv);
  $('#model-name').textContent=name;
  const P=S.P, nC=[...P.links.values()].filter(l=>l.type==='CONDUIT').length;
  const days=simDays(P);
  $('#model-info').innerHTML=`${P.nodes.size} nodes, ${P.links.size} links (${nC} conduits) · ${esc(P.routing)} · ${esc(P.units)}`+
    (isFinite(days)?` · ${fmt(days*24,1)} h simulated`:'')+(P.si?' · <span class="pill bowl">SI model: values shown in the model\'s own units</span>':'');
  $('#routing-warn').style.display=P.routing==='DYNWAVE'?'none':'block';
  renderNetwork(); renderConduits(); renderSel(); renderResults();
  setCaption('Loaded '+name);
}

// ---------------------------------------------------------------- network view
function layout(P){
  const ids=[...P.nodes.keys()];
  if(ids.length&&ids.every(id=>P.coords.has(id))) return {pos:new Map(ids.map(id=>[id,P.coords.get(id)])),real:true};
  // schematic: hops upstream from the outfalls, leaves stacked in order
  const up=new Map(ids.map(id=>[id,[]])), down=new Map(ids.map(id=>[id,[]]));
  for(const L of P.links.values()){ if(up.has(L.n2)&&up.has(L.n1)){ up.get(L.n2).push(L.n1); down.get(L.n1).push(L.n2);} }
  let roots=ids.filter(id=>P.nodes.get(id).type==='OUTFALL'); if(!roots.length) roots=ids.filter(id=>!down.get(id).length); if(!roots.length) roots=ids.slice(0,1);
  const depth=new Map(), parent=new Map(), q=[...roots]; roots.forEach(r=>depth.set(r,0));
  while(q.length){ const a=q.shift(); for(const b of up.get(a).concat(down.get(a))){ if(!depth.has(b)){ depth.set(b,depth.get(a)+1); parent.set(b,a); q.push(b);} } }
  ids.forEach(id=>{ if(!depth.has(id)){ depth.set(id,0); roots.push(id);} });
  const kids=new Map(ids.map(id=>[id,[]])); for(const [b,a] of parent) kids.get(a).push(b);
  const y=new Map(); let leaf=0;
  const visit=(id)=>{ const k=kids.get(id); if(!k.length){ y.set(id,leaf++); return; } k.forEach(visit); y.set(id,k.reduce((s,c)=>s+y.get(c),0)/k.length); };
  roots.forEach(r=>{ visit(r); leaf+=0.5; });
  return {pos:new Map(ids.map(id=>[id,[-depth.get(id),-y.get(id)]])),real:false};
}
function renderNetwork(){
  const P=S.P, box=$('#net'); if(!P){box.innerHTML='';return;}
  const {pos,real}=layout(P); S.pos=pos;
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(const [x,y] of pos.values()){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  for(const v of P.verts.values()) for(const [x,y] of v){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(!isFinite(x0)){box.innerHTML='<p class="muted" style="padding:12px">No nodes to draw.</p>';return;}
  const W=900, dx=(x1-x0)||1, dy=(y1-y0)||1, pad=24;
  const sc=Math.min((W-2*pad)/dx, 1e9), H=Math.max(160,Math.min(620,dy*sc+2*pad));
  const s2=Math.min((W-2*pad)/dx,(H-2*pad)/dy);
  const X=x=>pad+(x-x0)*s2+((W-2*pad)-dx*s2)/2, Y=y=>H-pad-(y-y0)*s2-((H-2*pad)-dy*s2)/2;
  const nL=P.links.size, wl=nL>1500?1:nL>400?1.6:2.4, rn=P.nodes.size>1500?1.6:P.nodes.size>400?2.4:3.6;
  let s=`<svg class="fx" viewBox="0 0 ${W} ${Math.round(H)}" id="net-svg" role="img" aria-label="Network: click a conduit to list it as an FV link">`;
  s+=`<rect x="0" y="0" width="${W}" height="${Math.round(H)}" class="g-face"/>`;
  for(const L of P.links.values()){
    const a=pos.get(L.n1), b=pos.get(L.n2); if(!a||!b) continue;
    const pts=[a].concat(real?(P.verts.get(L.id)||[]):[]).concat([b]).map(([x,y])=>X(x).toFixed(1)+','+Y(y).toFixed(1)).join(' ');
    const fv=S.sel.has(L.id), cls=fv?'net-fv':L.type==='CONDUIT'?'net-dw':'net-other';
    s+=`<polyline points="${pts}" class="${cls}" style="stroke-width:${fv?wl*2.6:wl}px"/>`;
    s+=`<polyline points="${pts}" class="net-hit" data-l="${esc(L.id)}"/>`;
  }
  for(const [id,[x,y]] of pos){ const N=P.nodes.get(id), t=N.type;
    if(t==='OUTFALL') s+=`<path d="M${(X(x)-rn*1.4).toFixed(1)},${(Y(y)-rn*1.4).toFixed(1)}h${(rn*2.8).toFixed(1)}l${(-rn*1.4).toFixed(1)},${(rn*2.6).toFixed(1)}z" class="net-node" data-n="${esc(id)}"/>`;
    else if(t==='STORAGE') s+=`<rect x="${(X(x)-rn*1.3).toFixed(1)}" y="${(Y(y)-rn*1.3).toFixed(1)}" width="${(rn*2.6).toFixed(1)}" height="${(rn*2.6).toFixed(1)}" class="net-node" data-n="${esc(id)}"/>`;
    else s+=`<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="${rn}" class="net-node" data-n="${esc(id)}"/>`;
  }
  s+='</svg>';
  box.innerHTML=s;
  $('#net-note').textContent=real?'Plan view from [COORDINATES]. Click a conduit to list it as an FV link; click again to remove it.':'No [COORDINATES] in this file: schematic layout, outfall on the right, upstream to the left. Click a conduit to list it as an FV link.';
}
function linkTip(id){
  const P=S.P, L=P.links.get(id); if(!L) return '';
  const r=fvReasons(P,L), dc=L.type==='CONDUIT'?defaultCells(P,L):null, u=P.si?'m':'ft';
  return `<b>${esc(id)}</b> · ${L.type.toLowerCase()}<br>${esc(L.n1)} → ${esc(L.n2)}`+(L.type==='CONDUIT'?`<br>${fmt(L.len,1)} ${u}, ${esc(L.shape||'?')} ${L.g1?fmt(L.g1,2)+' '+u:esc(L.geom||'')}`+(dc?`<br>default mesh: ${dc} cells`:''):'')+
    (r.length?`<br><span style="color:var(--warn-ink)">✗ ${esc(r.join('; '))}</span>`:`<br><span style="color:var(--ok-ink)">✓ can be an FV link</span>`)+(S.sel.has(id)?'<br><b>listed in [FV_LINKS]</b>':'');
}
function toggleFv(id,on){
  const P=S.P, L=P.links.get(id); if(!L||L.type!=='CONDUIT') return;
  if(on==null) on=!S.sel.has(id);
  if(on) S.sel.set(id,S.sel.get(id)||''); else S.sel.delete(id);
  renderNetwork(); renderConduits(); renderSel();
  setCaption((on?'Listed ':'Removed ')+id+(on?' as an FV link':''));
}

// ---------------------------------------------------------------- conduit table
function renderConduits(){
  const P=S.P, tb=$('#cond-body'); if(!P){tb.innerHTML='';return;}
  const f=S.filter.toLowerCase(), u=P.si?'m':'ft';
  let rows=[...P.links.values()].filter(L=>L.type==='CONDUIT'&&(!f||L.id.toLowerCase().includes(f)||L.n1.toLowerCase().includes(f)||L.n2.toLowerCase().includes(f)));
  rows.sort((a,b)=>(S.sel.has(b.id)-S.sel.has(a.id))||0);
  const total=rows.length; rows=rows.slice(0,250);
  tb.innerHTML=rows.map(L=>{ const r=fvReasons(P,L), on=S.sel.has(L.id), dc=defaultCells(P,L);
    return `<tr><td><input type="checkbox" data-c="${esc(L.id)}" ${on?'checked':''} ${r.length&&!on?'disabled':''} aria-label="FV ${esc(L.id)}"></td>`+
      `<td class="mono">${esc(L.id)}</td><td class="mono">${esc(L.n1)} → ${esc(L.n2)}</td><td class="num">${fmt(L.len,1)}</td>`+
      `<td>${esc((L.shape||'').toLowerCase())}${L.g1?' '+fmt(L.g1,2):''}${L.barrels>1?' ×'+L.barrels:''}</td>`+
      `<td class="num">${dc==null?'*':dc}${dc?` <span class="faint">(${fmt(lenFt(P,L)/dc,1)} ft)</span>`:''}</td>`+
      `<td>${r.length?`<span class="pill warn">✗ ${esc(r[0])}</span>`:'<span class="pill ok">✓ eligible</span>'}</td></tr>`; }).join('');
  $('#cond-count').textContent=`${total} conduit${total===1?'':'s'}${total>250?', first 250 shown (filter to find others)':''} · lengths in ${u}`;
}
function renderSel(){
  const P=S.P, box=$('#sel-body'); if(!P){box.innerHTML='';return;}
  if(!S.sel.size){ box.innerHTML='<tr><td colspan="4" class="muted">No FV links yet. Click a conduit on the network or tick one in the table.</td></tr>'; }
  else box.innerHTML=[...S.sel].map(([id,c])=>{ const L=P.links.get(id), dc=L?defaultCells(P,L):null, r=L?fvReasons(P,L):['not in this model'];
    return `<tr><td class="mono">${esc(id)}</td><td><input type="text" inputmode="numeric" size="5" value="${esc(c)}" placeholder="${dc==null?'*':dc}" data-cells="${esc(id)}" aria-label="cells for ${esc(id)}"></td>`+
      `<td>${r.length?`<span class="pill warn">✗ ${esc(r.join('; '))}</span>`:'<span class="pill ok">✓</span>'}</td><td><button class="btn ghost" data-rm="${esc(id)}" style="padding:2px 8px">remove</button></td></tr>`; }).join('');
  const {fv}=S.P?buildInputs(S.P,S.sel,runOpts()):{fv:''};
  const sec=fv.slice(fv.lastIndexOf('[FV_LINKS]'));
  $('#fv-section').textContent=sec.trim();
  $('#run-btn').disabled=S.busy||!S.sel.size; $('#null-btn').disabled=S.busy;
}
function runOpts(){ return {reportAll:$('#opt-reportall').checked, reportStep:$('#opt-rstep').value}; }

// ---------------------------------------------------------------- runs
function setProg(which,frac,label){ const b=$('#prog-'+which); b.firstElementChild.style.width=(frac<0?100:Math.round(frac*100))+'%'; $('#prog-'+which+'-lab').textContent=label; }
async function runBoth(){
  if(S.busy||!S.P) return; S.busy=true; renderSel(); $('#cancel-btn').disabled=false;
  const P=S.P, {stock,fv}=buildInputs(P,S.sel,runOpts()), days=simDays(P);
  const files=S.files.map(([n,b])=>[n,b.slice()]);
  S.lastInputs={stock,fv};
  setCaption('Running stock SWMM 5.2.4');
  setProg('stock',0,'running…'); setProg('fv',0,'waiting');
  const a=await runEngine('stock',stock,files,days,f=>setProg('stock',f,f<0?'running…':Math.round(f*100)+'%'));
  setProg('stock',1,a.type==='done'?`done, ${fmt(a.ms/1000,2)} s`:'failed');
  let b={type:'fail',error:'cancelled'};
  if(a.type==='done'||a.error!=='cancelled'){
    setCaption('Running swmm524-fvlink with '+S.sel.size+' FV link'+(S.sel.size>1?'s':''));
    b=await runEngine('fv',fv,S.files.map(([n,x])=>[n,x.slice()]),days,f=>setProg('fv',f,f<0?'running…':Math.round(f*100)+'%'));
    setProg('fv',1,b.type==='done'?`done, ${fmt(b.ms/1000,2)} s`:'failed');
  }
  S.res={stock:wrap(a),fv:wrap(b)};
  S.busy=false; $('#cancel-btn').disabled=true; renderSel();
  pickDefaultChart(); renderResults();
  setCaption('Compared: stock vs FV');
}
function wrap(m){ if(m.type!=='done') return {fail:m.error||'failed'};
  const txt=latin1.decode(m.rpt); return {err:m.err,msg:m.msg,ms:m.ms,steps:m.steps,version:m.version,rptBytes:m.rpt,outBytes:m.out,rpt:parseRpt(txt),out:parseOut(m.out)}; }
async function nullCheck(){
  if(S.busy||!S.P) return; S.busy=true; renderSel(); $('#cancel-btn').disabled=false;
  const P=S.P, {stock}=buildInputs(P,new Map(),runOpts()), days=simDays(P);
  setCaption('Null check: both engines, no FV links');
  setProg('stock',0,'running…'); setProg('fv',0,'waiting');
  const a=await runEngine('stock',stock,S.files.map(([n,x])=>[n,x.slice()]),days,f=>setProg('stock',f,Math.round(Math.max(f,0)*100)+'%'));
  setProg('stock',1,a.type==='done'?'done':'failed');
  const b=await runEngine('fv',stock,S.files.map(([n,x])=>[n,x.slice()]),days,f=>setProg('fv',f,Math.round(Math.max(f,0)*100)+'%'));
  setProg('fv',1,b.type==='done'?'done':'failed');
  S.busy=false; $('#cancel-btn').disabled=true; renderSel();
  const el=$('#null-result');
  if(a.type!=='done'||b.type!=='done'){ el.innerHTML=`<div class="warn-box">A run failed: ${esc(a.error||b.error||'')}</div>`; return; }
  const same=(x,y)=>x.length===y.length&&x.every((v,i)=>v===y[i]);
  const strip=t=>latin1.decode(t).split(/\r?\n/).filter(l=>!/Analysis begun|Analysis ended|Total elapsed/.test(l)).join('\n');
  const outSame=same(a.out,b.out), rptSame=strip(a.rpt)===strip(b.rpt);
  el.innerHTML=(outSame&&rptSame)?`<div class="ok-box">✓ <b>Identical.</b> With no [FV_LINKS] section the patched engine wrote the same .out as stock, ${a.out.length.toLocaleString('en-US')} bytes, byte for byte, and the same .rpt apart from the run-time stamps.${a.out.length?'':' (Neither engine wrote a .out: '+esc(parseRpt(latin1.decode(a.rpt)).errors[0]||'see the report')+')'}</div>`
    :`<div class="warn-box">✗ <b>Different.</b> .out ${outSame?'identical':'differs'} (${a.out.length} vs ${b.out.length} bytes); .rpt ${rptSame?'identical':'differs'}. Please report this model.</div>`;
  setCaption(outSame&&rptSame?'Null check: byte-identical':'Null check: different');
}

// ---------------------------------------------------------------- results
function pickDefaultChart(){
  const r=S.res; if(!r||!r.fv.out) return;
  const first=[...S.sel.keys()].find(id=>r.fv.out.linkIdx.has(id));
  if(first){ S.chartKind='link'; S.chartId=first; S.chartVar=0; }
}
function metric(k,v,u){ return `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div><div class="u">${u||''}</div></div>`; }
function renderResults(){
  const box=$('#results'), r=S.res;
  if(!r){ box.innerHTML='<p class="muted">Run both engines to see the comparison here.</p>'; $('#res-actions').style.display='none'; return; }
  $('#res-actions').style.display='flex';
  const A=r.stock, B=r.fv; let h='';
  for(const [lab,X] of [['Stock 5.2.4',A],['swmm524-fvlink',B]]){
    if(X.fail) h+=`<div class="warn-box"><b>${lab}:</b> the run did not finish (${esc(X.fail)}).</div>`;
    else if(X.err) h+=`<div class="warn-box"><b>${lab}</b> stopped with error ${X.err}. ${esc(X.rpt.errors.slice(0,4).join(' | ')||X.msg)}</div>`;
  }
  const ok=A.rpt&&B.rpt&&!A.err&&!B.err;
  if(A.rpt&&B.rpt){
    const ratio=(A.ms&&B.ms)?B.ms/A.ms:null;
    h+=`<div class="metrics" style="margin:10px 0">`+
      metric('Wall time, stock',fmt(A.ms/1000,2)+' s','single run in this browser')+
      metric('Wall time, FV',fmt(B.ms/1000,2)+' s',ratio?`${fmt(ratio,2)}× stock (single runs, noisy)`:'')+
      metric('Average routing step',`${fmtG(A.rpt.avgStep)} → ${fmtG(B.rpt.avgStep)} s`,'stock → FV, from each report')+
      metric('Routing continuity',`${fmtG(A.rpt.routeCont)} → ${fmtG(B.rpt.routeCont)} %`,'stock → FV')+
      (B.rpt.fv.length?metric('FV volume balance (worst)',Math.max(...B.rpt.fv.map(f=>Math.abs(f.volBal))).toExponential(1)+' %','stored change vs end-face volumes'):'')+
      `</div>`;
    h+=`<div class="faint">Engines: ${esc(A.rpt.version||'?')} (stock) and ${esc(B.rpt.version||'?')} + [FV_LINKS] (patched), WebAssembly. Average iterations per step ${fmtG(A.rpt.avgIter)} → ${fmtG(B.rpt.avgIter)}; steps not converging ${fmtG(A.rpt.nonConv)} → ${fmtG(B.rpt.nonConv)} %.</div>`;
  }
  if(B.rpt&&B.rpt.fv.length){
    h+=`<h3>Finite-Volume Link Summary <span class="faint">(from the FV report)</span></h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Link</th><th class="num">Cells</th><th class="num">Cell length (ft)</th><th class="num">Substeps per step</th><th class="num">Max per solve</th><th class="num">Min substep (s)</th><th class="num">Volume balance (%)</th><th class="num">Floor hits</th></tr></thead><tbody>`+
      B.rpt.fv.map(f=>`<tr><td class="mono">${esc(f.id)}</td><td class="num">${f.cells}</td><td class="num">${fmt(f.dx,2)}</td><td class="num">${fmt(f.subPerStep,1)}</td><td class="num">${f.maxPerSolve}</td><td class="num">${fmtG(f.minSub)}</td><td class="num">${f.volBal.toExponential(1)}</td><td class="num">${f.floor}</td></tr>`).join('')+`</tbody></table></div>`+
      `<div class="eq" style="margin-top:8px">substep ≤ 0.5 · Δx / s_max  (and ≤ A_node / K at a LOCAL end node);  floor 0.001 s, counted as a floor hit</div>`;
  }
  if(B.rpt&&B.rpt.instab.length) h+=`<div class="faint" style="margin-top:6px">FV report, Highest Flow Instability Indexes: ${esc(B.rpt.instab.join('; '))}</div>`;
  box.innerHTML=h;
  renderChartControls(); renderChart(); renderPeaks();
}
const VARS={link:[['flow',0],['depth',1],['velocity',2],['volume',3],['capacity',4]],node:[['depth',0],['head',1],['volume',2],['lateral inflow',3],['total inflow',4],['flooding',5]]};
function unitsOf(kind,v,si,fu){ const q=FLOW_UNITS[fu]||'flow', L=si?'m':'ft';
  return kind==='link'?[q,L,L+'/s',L+'³','fraction full'][v]:[L,L,L+'³',q,q,q][v]; }
function renderChartControls(){
  const r=S.res, el=$('#chart-ctl'); if(!r||!r.fv.out||!r.stock.out){ el.innerHTML=''; $('#chart-card').style.display='none'; return; }
  $('#chart-card').style.display='block';
  const O=r.fv.out, ids=S.chartKind==='link'?O.link:O.node;
  if(!ids.includes(S.chartId)) S.chartId=ids[0]||'';
  const opts=ids.slice(0,5000).map(id=>`<option ${id===S.chartId?'selected':''}>${esc(id)}</option>`).join('');
  el.innerHTML=`<label>Element <select id="ch-kind"><option value="link" ${S.chartKind==='link'?'selected':''}>link</option><option value="node" ${S.chartKind==='node'?'selected':''}>node</option></select></label>`+
    `<label>ID <select id="ch-id">${opts}</select></label>`+
    `<label>Variable <select id="ch-var">${VARS[S.chartKind].map(([n,v])=>`<option value="${v}" ${v==S.chartVar?'selected':''}>${n}</option>`).join('')}</select></label>`;
  $('#ch-kind').onchange=e=>{S.chartKind=e.target.value;S.chartVar=0;S.chartId='';renderChartControls();renderChart();};
  $('#ch-id').onchange=e=>{S.chartId=e.target.value;renderChart();setCaption('Comparing '+S.chartId);};
  $('#ch-var').onchange=e=>{S.chartVar=+e.target.value;renderChart();};
}
function chartSeries(){
  const r=S.res; if(!r||!r.fv.out||!r.stock.out) return null;
  const a=r.stock.out.series(S.chartKind,S.chartId,S.chartVar), b=r.fv.out.series(S.chartKind,S.chartId,S.chartVar);
  if(!a||!b) return null;
  const O=r.fv.out, n=Math.min(a.length,b.length), t=new Float64Array(n);
  for(let i=0;i<n;i++) t[i]=(i+1)*O.rstep/3600;
  return {t,a:a.subarray(0,n),b:b.subarray(0,n),unit:unitsOf(S.chartKind,S.chartVar,S.P.si,O.fu)};
}
function lineChart(el,d,labels){
  const T=TH(), W=860, H=330, m={l:66,r:14,t:12,b:46}, w=W-m.l-m.r, h=H-m.t-m.b, n=d.t.length;
  if(!n){ el.innerHTML='<p class="muted">No reporting periods.</p>'; return; }
  let lo=Infinity,hi=-Infinity; for(const s of [d.a,d.b]) for(const v of s){ if(v<lo)lo=v; if(v>hi)hi=v; }
  if(lo===hi){ lo-=1; hi+=1; } const pad=(hi-lo)*0.06; lo-=pad; hi+=pad;
  const tx0=0, tx1=d.t[n-1]; const days=tx1>72;
  const sx=x=>m.l+(x-tx0)/(tx1-tx0||1)*w, sy=y=>m.t+h-(y-lo)/(hi-lo)*h;
  const nice=(a,b,k)=>{const sp=b-a,st0=sp/k,mg=Math.pow(10,Math.floor(Math.log10(st0))),st=[1,2,2.5,5,10].map(z=>z*mg).find(z=>sp/z<=k+.5);const o=[];for(let v=Math.ceil(a/st-1e-9)*st;v<=b+1e-9;v+=st)o.push(Math.abs(v)<1e-12?0:v);return o;};
  const step=Math.max(1,Math.floor(n/1600));
  const path=s=>{let p='';for(let i=0;i<n;i+=step){p+=(i?'L':'M')+sx(d.t[i]).toFixed(1)+','+sy(s[i]).toFixed(1);} return p;};
  let s=`<svg class="fx" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(labels.title)}">`;
  s+=`<rect x="${m.l}" y="${m.t}" width="${w}" height="${h}" class="g-face"/>`;
  for(const v of nice(lo,hi,5)) s+=`<line x1="${m.l}" x2="${m.l+w}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" class="g-grid"/><text x="${m.l-7}" y="${(sy(v)+4).toFixed(1)}" class="t-tick" text-anchor="end">${fmtG(v)}</text>`;
  const xt=days?nice(0,tx1/24,6).map(v=>v*24):nice(0,tx1,7);
  for(const v of xt) s+=`<text x="${sx(v).toFixed(1)}" y="${m.t+h+17}" class="t-tick" text-anchor="middle">${fmtG(days?v/24:v)}</text>`;
  if(lo<0&&hi>0) s+=`<line x1="${m.l}" x2="${m.l+w}" y1="${sy(0).toFixed(1)}" y2="${sy(0).toFixed(1)}" class="g-zero"/>`;
  s+=`<rect x="${m.l}" y="${m.t}" width="${w}" height="${h}" class="g-frame"/>`;
  s+=`<path d="${path(d.a)}" class="l-dw"/><path d="${path(d.b)}" class="l-fv"/>`;
  s+=`<line id="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t+h}" class="g-lead" style="display:none"/>`;
  s+=`<circle id="xh-a" r="4.5" class="f-dw halo" style="display:none"/><circle id="xh-b" r="4.5" class="f-fv halo" style="display:none"/>`;
  s+=`<text x="${m.l+w/2}" y="${H-6}" class="t-axis" text-anchor="middle">${days?'time (days)':'time (h)'}</text>`;
  s+=`<text x="14" y="${m.t+h/2}" class="t-axis" text-anchor="middle" transform="rotate(-90 14 ${m.t+h/2})">${esc(labels.y)}</text>`;
  s+=`<rect x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="transparent" id="xh-hit"/></svg>`;
  el.innerHTML=s;
  const svg=el.querySelector('svg'), hit=el.querySelector('#xh-hit'), xh=el.querySelector('#xh'), ca=el.querySelector('#xh-a'), cb=el.querySelector('#xh-b');
  const move=(ev)=>{ const pt=svg.createSVGPoint(); pt.x=ev.clientX; pt.y=ev.clientY; const p=pt.matrixTransform(svg.getScreenCTM().inverse());
    const tt=tx0+(p.x-m.l)/w*(tx1-tx0); let i=Math.round(tt/(d.t[1]-d.t[0]||1))-1; i=Math.max(0,Math.min(n-1,i));
    const X=sx(d.t[i]); xh.setAttribute('x1',X); xh.setAttribute('x2',X); xh.style.display='';
    ca.setAttribute('cx',X); ca.setAttribute('cy',sy(d.a[i])); cb.setAttribute('cx',X); cb.setAttribute('cy',sy(d.b[i])); ca.style.display=cb.style.display='';
    tip(`<b>${fmt(d.t[i],3)} h</b><br><span class="swatch sw-dw"></span>stock ${fmtG(d.a[i])} ${esc(d.unit)}<br><span class="swatch sw-fv"></span>FV ${fmtG(d.b[i])} ${esc(d.unit)}<br>Δ ${fmtG(d.b[i]-d.a[i])}`,ev.clientX,ev.clientY); };
  hit.addEventListener('pointermove',move); hit.addEventListener('pointerleave',()=>{tip(null);xh.style.display=ca.style.display=cb.style.display='none';});
}
function renderChart(){
  const el=$('#chart'), d=chartSeries(); if(!d){ el.innerHTML='<p class="muted">This element is not in the .out file.</p>'; $('#chart-stats').innerHTML=''; return; }
  const vn=VARS[S.chartKind].find(v=>v[1]==S.chartVar)[0];
  lineChart(el,d,{title:`${S.chartKind} ${S.chartId} ${vn}, stock vs FV`,y:`${vn} (${d.unit})`});
  let pa=-Infinity,pb=-Infinity,md=0,ia=0,ib=0; for(let i=0;i<d.a.length;i++){ if(Math.abs(d.a[i])>pa){pa=Math.abs(d.a[i]);ia=i;} if(Math.abs(d.b[i])>pb){pb=Math.abs(d.b[i]);ib=i;} md=Math.max(md,Math.abs(d.a[i]-d.b[i])); }
  const fvTag=S.sel.has(S.chartId)?' <span class="pill rate">FV link</span>':'';
  $('#chart-stats').innerHTML=`<span class="mono">${esc(S.chartId)}</span>${fvTag} · ${vn} at each reporting step: peak |value| stock ${fmtG(pa)} at ${fmt(d.t[ia],2)} h, FV ${fmtG(pb)} at ${fmt(d.t[ib],2)} h · largest |difference| ${fmtG(md)} ${esc(d.unit)}`;
}
function peakRows(kind){
  const r=S.res; if(!r||!r.stock.rpt||!r.fv.rpt) return [];
  const a=kind==='link'?r.stock.rpt.links:r.stock.rpt.nodes, b=kind==='link'?r.fv.rpt.links:r.fv.rpt.nodes;
  const rows=[]; for(const [id,x] of a){ const y=b.get(id); if(!y) continue; const d=y.max-x.max, pc=Math.abs(x.max)>1e-9?100*d/Math.abs(x.max):null; rows.push({id,type:x.type,a:x.max,b:y.max,d,pc,fv:S.sel.has(id)}); }
  rows.sort((p,q)=>(q.fv-p.fv)||Math.abs(q.pc||0)-Math.abs(p.pc||0)); return rows;
}
function renderPeaks(){
  const el=$('#peaks'); if(!S.res){el.innerHTML='';return;}
  const k=$('#peak-kind').value, rows=peakRows(k), u=S.P.si?'m':'ft', q=S.res.fv.out?FLOW_UNITS[S.res.fv.out.fu]:'flow';
  const col=k==='link'?`max |flow| (${q})`:`max depth (${u})`;
  el.innerHTML=`<div class="tbl-wrap" style="max-height:340px"><table class="t"><thead><tr><th>${k==='link'?'Link':'Node'}</th><th>Type</th><th class="num">Stock ${col}</th><th class="num">FV ${col}</th><th class="num">Δ</th><th class="num">Δ %</th></tr></thead><tbody>`+
    rows.slice(0,400).map(r=>`<tr data-pk="${esc(r.id)}" style="cursor:pointer"><td class="mono">${esc(r.id)}${r.fv?' <span class="pill rate">FV</span>':''}</td><td>${esc(r.type.toLowerCase())}</td><td class="num">${fmtG(r.a)}</td><td class="num">${fmtG(r.b)}</td><td class="num">${fmtG(r.d)}</td><td class="num">${r.pc==null?'–':fmt(r.pc,2)}</td></tr>`).join('')+
    `</tbody></table></div><div class="faint">From each report's ${k==='link'?'Link Flow':'Node Depth'} Summary (routing-step maxima). FV links first, then by |Δ %|; ${rows.length} rows${rows.length>400?', first 400 shown; CSV has all':''}. Click a row to chart it.</div>`;
}

// ---------------------------------------------------------------- samples and files
let SAMPLES=[];
function loadSample(i){ const s=SAMPLES[i]; loadModel(s.file,s.text,[],new Map(s.fv)); $('#sample-note').innerHTML=esc(s.note); }
async function openFiles(list){
  const files=[...list]; const inp=files.find(f=>/\.inp$/i.test(f.name)); if(!inp){ alert('Choose a .inp file (and any data files it reads).'); return; }
  const text=latin1.decode(new Uint8Array(await inp.arrayBuffer()));
  const extra=[]; for(const f of files) if(f!==inp) extra.push([f.name,new Uint8Array(await f.arrayBuffer())]);
  loadModel(inp.name,text,extra); $('#sample-note').textContent=extra.length?`${extra.length} data file${extra.length>1?'s':''} loaded beside it: ${extra.map(e=>e[0]).join(', ')}. Paths in the .inp should be plain file names.`:'Your model. If it reads rain or inflow files, open them together with the .inp.';
  $('#sample-select').value='';
}

// ---------------------------------------------------------------- tabs, onboarding, GIF
function showTab(id){ $$('.tab').forEach(t=>t.classList.toggle('on',t.id==='tab-'+id)); $$('nav.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===id)); setCaption('Tab: '+id); if(id==='doc') try{ history.replaceState(null,'','#doc'); }catch(e){} }
const Onboarding=(function(){
  let cfg=null, k=0;
  function seen(){ try{ return localStorage.getItem('fvlinklab_seen')==='1'; }catch(e){ return false; } }
  function mark(){ try{ localStorage.setItem('fvlinklab_seen','1'); }catch(e){} }
  function init(c){ cfg=c; if(!seen()) openModal(); }
  function openModal(){ closeAll(); const el=document.createElement('div'); el.className='ob-overlay'; el.id='ob-overlay';
    el.innerHTML=`<div class="ob-modal" role="dialog" aria-modal="true" aria-labelledby="ob-h"><h2 id="ob-h">${cfg.title}</h2>${cfg.html}<div class="ob-actions"><button class="btn ghost" id="ob-skip">Skip</button><button class="btn" id="ob-tour">Start tour</button></div></div>`;
    document.body.appendChild(el); $('#ob-skip').onclick=closeModal; $('#ob-tour').onclick=startTour; }
  function closeModal(){ mark(); const o=$('#ob-overlay'); if(o) o.remove(); }
  function startTour(){ closeModal(); k=0; showStep(); }
  function closeAll(){ ['#ob-tooltip','#ob-highlight','#ob-overlay'].forEach(s=>{const e=$(s); if(e) e.remove();}); }
  function showStep(){ ['#ob-tooltip','#ob-highlight'].forEach(s=>{const e=$(s); if(e) e.remove();});
    const st=cfg.steps[k]; if(st.tab) showTab(st.tab);
    const t=st.target?$(st.target):null; if(t) t.scrollIntoView({block:'center',behavior:'instant'});
    const r=t?t.getBoundingClientRect():{top:innerHeight/2-20,left:innerWidth/2-150,width:300,height:40};
    if(t){ const hi=document.createElement('div'); hi.id='ob-highlight'; hi.className='ob-highlight'; Object.assign(hi.style,{top:(r.top-4)+'px',left:(r.left-4)+'px',width:(r.width+8)+'px',height:(r.height+8)+'px'}); document.body.appendChild(hi); }
    const tp=document.createElement('div'); tp.id='ob-tooltip'; tp.className='ob-tooltip';
    const last=k===cfg.steps.length-1;
    tp.innerHTML=`<h3>${st.title}</h3><p>${st.body}${last?' Reopen this help and the tour any time with the ? button.':''}</p><div class="ob-tooltip-nav"><span class="ob-step">${k+1} / ${cfg.steps.length}</span><div class="btns">${k>0?'<button class="btn ghost" id="ob-back">Back</button>':''}<button class="btn" id="ob-next">${last?'Done':'Next'}</button></div></div>`;
    document.body.appendChild(tp);
    const below=r.top+r.height+12, top=below+tp.offsetHeight<innerHeight?below:Math.max(8,r.top-tp.offsetHeight-12);
    tp.style.top=top+'px'; tp.style.left=Math.max(8,Math.min(r.left,innerWidth-tp.offsetWidth-8))+'px';
    $('#ob-next').onclick=()=>{ if(last) closeAll(); else { k++; showStep(); } }; const bk=$('#ob-back'); if(bk) bk.onclick=()=>{k--;showStep();}; }
  return {init,openModal,startTour,closeAll};
})();
let CAPTION='';
function setCaption(t){ CAPTION=t; }
const GifRec=(function(){
  let frames=[], timer=null, busy=false, t0=0, recording=false;
  let times=[];
  async function grab(){
    if(busy) return; busy=true;
    try{ const bg=getComputedStyle(document.body).backgroundColor;
      const c=await html2canvas(document.body,{backgroundColor:bg,logging:false,scale:1,x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,windowWidth:innerWidth,windowHeight:innerHeight,
        ignoreElements:el=>el.tagName==='SCRIPT'||(el.classList&&el.classList.contains('tab')&&!el.classList.contains('on'))||el.id==='gif-btn'});
      const ctx=c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); const bar=30; ctx.fillStyle=THEME==='dark'?'rgba(2,6,15,.82)':'rgba(15,23,42,.82)'; ctx.fillRect(0,c.height-bar,c.width,bar);
      ctx.fillStyle=THEME==='dark'?TH().mark:TH().face; ctx.font='15px system-ui,sans-serif'; ctx.fillText('FV Link Lab · '+CAPTION,10,c.height-10);
      frames.push(c); times.push(Date.now()); }catch(e){ console.warn('frame skipped',e); }
    busy=false; }
  async function start(){
    if(typeof html2canvas==='undefined'){ alert('The recorder needs html2canvas from cdnjs; this page could not load it.'); return false; }
    frames=[]; times=[]; t0=Date.now(); recording=true; await grab(); timer=setInterval(()=>{ if(Date.now()-t0>30000) stop(); else grab(); },600); return true; }
  async function stop(){
    if(!recording) return; recording=false; clearInterval(timer); updateBtn('Encoding…');
    while(busy) await new Promise(r=>setTimeout(r,50));
    if(!frames.length){ updateBtn(); return; }
    let res=null;
    try{ res=await encodeGif(); }catch(e){ console.warn('GIF failed, using WebM',e); try{ res=await encodeWebm(); }catch(e2){ console.warn(e2); } }
    updateBtn(); if(res){ const a=document.createElement('a'); a.href=res.url; a.download='fv-link-lab-demo.'+res.ext; document.body.appendChild(a); a.click(); a.remove(); } }
  async function encodeGif(){
    if(typeof GIF==='undefined') throw new Error('gif.js not loaded');
    const wurl=await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js').then(r=>{ if(!r.ok) throw new Error('worker fetch'); return r.blob(); }).then(b=>URL.createObjectURL(b));
    const sc=Math.min(1,800/frames[0].width), W=Math.round(frames[0].width*sc), H=Math.round(frames[0].height*sc);
    return new Promise((res,rej)=>{ const g=new GIF({workers:2,quality:12,workerScript:wurl,width:W,height:H});
      frames.forEach((f,i)=>{ const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(f,0,0,W,H); g.addFrame(c,{delay:i<frames.length-1?Math.min(3000,Math.max(300,times[i+1]-times[i])):2000}); });
      g.on('finished',b=>res({url:URL.createObjectURL(b),ext:'gif'})); g.on('abort',()=>rej(new Error('abort'))); g.render(); }); }
  async function encodeWebm(){
    const c=document.createElement('canvas'); c.width=frames[0].width; c.height=frames[0].height; const ctx=c.getContext('2d');
    const rec=new MediaRecorder(c.captureStream(10),{mimeType:'video/webm'}), ch=[]; rec.ondataavailable=e=>ch.push(e.data);
    return new Promise(res=>{ rec.onstop=()=>res({url:URL.createObjectURL(new Blob(ch,{type:'video/webm'})),ext:'webm'}); rec.start(); let i=0;
      const nx=()=>{ if(i>=frames.length){ rec.stop(); return; } ctx.drawImage(frames[i],0,0); const d=i<frames.length-1?Math.min(3000,Math.max(300,times[i+1]-times[i])):2000; i++; setTimeout(nx,d); }; nx(); }); }
  function updateBtn(t){ const b=$('#gif-btn'); b.innerHTML=t?t:recording?'<span class="rec-dot"></span>Recording… stop':'Make a GIF'; }
  async function toggle(){ if(recording){ await stop(); } else { setCaption('Recording a walkthrough'); if(await start()) updateBtn(); } }
  return {toggle};
})();

// ---------------------------------------------------------------- boot
function boot(){
  document.querySelectorAll('#theme-toggle button').forEach(b=>b.addEventListener('click',()=>{ applyTheme(b.dataset.t); setCaption('Theme: '+b.dataset.t); }));
  try{ const mq=window.matchMedia('(prefers-color-scheme: dark)'); const on=()=>{ if(THEME_PREF==='auto') applyTheme('auto'); }; mq.addEventListener?mq.addEventListener('change',on):mq.addListener(on); }catch(e){}
  $$('nav.tabs button').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
  SAMPLES=JSON.parse($('#samples').textContent);
  $('#sample-select').innerHTML='<option value="">Choose a sample…</option>'+SAMPLES.map((s,i)=>`<option value="${i}">${esc(s.title)}</option>`).join('');
  $('#sample-select').onchange=e=>{ if(e.target.value!=='') loadSample(+e.target.value); };
  $('#file-in').onchange=e=>openFiles(e.target.files);
  $('#net').addEventListener('click',e=>{ const id=e.target.getAttribute&&e.target.getAttribute('data-l'); if(id) toggleFv(id); });
  $('#net').addEventListener('pointermove',e=>{ const l=e.target.getAttribute&&e.target.getAttribute('data-l'), n=e.target.getAttribute&&e.target.getAttribute('data-n');
    if(l) tip(linkTip(l),e.clientX,e.clientY); else if(n){ const N=S.P.nodes.get(n); tip(`<b>${esc(n)}</b> · ${N.type.toLowerCase()}`,e.clientX,e.clientY);} else tip(null); });
  $('#net').addEventListener('pointerleave',()=>tip(null));
  $('#cond-filter').oninput=e=>{ S.filter=e.target.value; renderConduits(); };
  $('#cond-body').addEventListener('change',e=>{ const id=e.target.getAttribute('data-c'); if(id) toggleFv(id,e.target.checked); });
  $('#sel-body').addEventListener('click',e=>{ const id=e.target.getAttribute('data-rm'); if(id) toggleFv(id,false); });
  $('#sel-body').addEventListener('change',e=>{ const id=e.target.getAttribute('data-cells'); if(!id) return; const v=e.target.value.trim();
    if(v&&!(/^\d+$/.test(v)&&+v>=1&&+v<=100000)){ e.target.value=''; alert('Cells must be a whole number from 1 to 100,000, or blank for the default.'); return; } S.sel.set(id,v); renderSel(); });
  $('#opt-reportall').onchange=renderSel; $('#opt-rstep').onchange=renderSel;
  $('#run-btn').onclick=runBoth; $('#null-btn').onclick=nullCheck; $('#cancel-btn').onclick=cancelRun;
  $('#peak-kind').onchange=renderPeaks;
  $('#peaks').addEventListener('click',e=>{ const tr=e.target.closest('tr[data-pk]'); if(!tr) return; S.chartKind=$('#peak-kind').value; S.chartId=tr.getAttribute('data-pk'); S.chartVar=0; renderChartControls(); renderChart(); $('#chart-card').scrollIntoView({behavior:'smooth',block:'start'}); });
  $('#dl-inp').onclick=()=>{ const {fv}=buildInputs(S.P,S.sel,runOpts()); download(S.name.replace(/\.inp$/i,'')+'_fv.inp',fv); };
  $('#dl-files').onchange=e=>{ const v=e.target.value; e.target.value=''; const r=S.res; if(!r) return; const base=S.name.replace(/\.inp$/i,'');
    const X=v.startsWith('stock')?r.stock:r.fv; if(!X||!X.rptBytes) return;
    if(v.endsWith('rpt')) download(base+'_'+v.split('-')[0]+'.rpt',new Blob([X.rptBytes],{type:'text/plain'}));
    else download(base+'_'+v.split('-')[0]+'.out',new Blob([X.outBytes],{type:'application/octet-stream'})); };
  $('#dl-peaks').onclick=()=>{ const out=[['kind','id','type','stock_max','fv_max','delta','delta_pct','fv_link']];
    for(const k of ['link','node']) for(const r of peakRows(k)) out.push([k,r.id,r.type,r.a,r.b,r.d,r.pc==null?'':r.pc.toFixed(4),r.fv?1:0]);
    download(S.name.replace(/\.inp$/i,'')+'_peaks.csv',csv(out),'text/csv'); };
  $('#dl-series').onclick=()=>{ const d=chartSeries(); if(!d) return; const vn=VARS[S.chartKind].find(v=>v[1]==S.chartVar)[0];
    const out=[['hours',`stock_${vn}_${d.unit}`,`fv_${vn}_${d.unit}`]]; for(let i=0;i<d.t.length;i++) out.push([d.t[i].toFixed(6),d.a[i],d.b[i]]);
    download(`${S.chartKind}_${S.chartId}_${vn}.csv`,csv(out),'text/csv'); };
  $('#dl-fvsum').onclick=()=>{ const r=S.res; if(!r||!r.fv.rpt) return; const out=[['link','cells','cell_length_ft','substeps_per_step','max_per_solve','min_substep_s','volume_balance_pct','floor_hits']];
    r.fv.rpt.fv.forEach(f=>out.push([f.id,f.cells,f.dx,f.subPerStep,f.maxPerSolve,f.minSub,f.volBal,f.floor])); download('fv_link_summary.csv',csv(out),'text/csv'); };
  $('#help-btn').onclick=()=>Onboarding.openModal();
  $('#gif-btn').onclick=()=>GifRec.toggle();
  $$('[data-goto]').forEach(a=>a.addEventListener('click',e=>{ e.preventDefault(); showTab(a.getAttribute('data-goto')); }));
  $$('.toc a').forEach(a=>a.addEventListener('click',()=>{ const d=document.getElementById(a.getAttribute('href').slice(1)); if(d&&d.tagName==='DETAILS') d.open=true; }));
  const narrow=()=>matchMedia('(max-width:700px)').matches; if(narrow()) $$('details.dsec').forEach((d,i)=>{ if(i>1) d.open=false; });
  loadSample(0);
  if(location.hash==='#doc') showTab('doc');
  Onboarding.init({title:'FV Link Lab',
    html:`<p>Two real engines run here, compiled to WebAssembly: <b>stock EPA SWMM 5.2.4</b>, and <b>swmm524-fvlink</b>, the same code with an <code>[FV_LINKS]</code> section that solves the conduits you list by finite volume while dynamic wave runs the rest.</p><p>Pick a model, click the conduits you want as FV links, run both, and compare. Nothing leaves your browser.</p>`,
    steps:[
      {tab:'run',target:'#model-card',title:'Pick a model',body:'Start with a sample, or open your own .inp (with any rain or inflow files it reads).'},
      {tab:'run',target:'#net',title:'Choose the FV links',body:'Click a conduit on the network or tick it in the table. The pre-check marks conduits the engine will reject and says why.'},
      {tab:'run',target:'#run-card',title:'Run both engines',body:'Run both runs stock 5.2.4 without the FV section, then the patched engine with it, one after the other.'},
      {tab:'run',target:'#results-card',title:'Read the comparison',body:'Cards, the FV Link Summary, a hydrograph for any link or node, and a peak table you can export.'},
      {tab:'run',target:'#null-btn',title:'Check the null effect',body:'Null check runs the patched engine with no FV links and compares its .out with stock\'s, byte for byte, on your model.'},
      {tab:'doc',target:'#doc-top',title:'Read how it works',body:'The Doc tab explains the method, the checks and the limits, with the figures; the same text ships as a Word file.'},
      {tab:'run',target:'#help-btn',title:'Help is here',body:'This button reopens the welcome note and the tour.'}]});
}
(function initTheme(){ let pref='dark'; try{ const v=localStorage.getItem('fvlinklab_theme'); if(v==='light'||v==='auto'||v==='dark') pref=v; }catch(e){} applyTheme(pref); })();
document.addEventListener('DOMContentLoaded',boot);
