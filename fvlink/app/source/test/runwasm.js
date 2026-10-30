// node runwasm.js <engine.js> <exportName> <inp> <rpt> <out>
// Loads the web,worker single-file glue with new Function (skill recipe),
// copies the .inp's folder into MEMFS so relative data files resolve.
const fs = require('fs'), path = require('path');
const [,, eng, name, inp, rpt, out] = process.argv;
const src = fs.readFileSync(eng, 'utf8');
const factory = new Function(src + `\nreturn ${name};`)();
(async () => {
  const mod = await factory({ print: () => {}, printErr: () => {} });
  const dir = path.dirname(path.resolve(inp));
  mod.FS.mkdir('/w'); 
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    try { if (fs.statSync(p).isFile() && fs.statSync(p).size < 50e6) mod.FS.writeFile('/w/' + f, fs.readFileSync(p)); } catch (e) {}
  }
  mod.FS.chdir('/w');
  const b = path.basename(inp);
  const t0 = Date.now();
  let rc;
  try { rc = mod.ccall('swmm_run', 'number', ['string','string','string'], [b, '__x.rpt', '__x.out']); }
  catch (e) { rc = 'THROW ' + e; }
  const ms = Date.now() - t0;
  let r = new Uint8Array(0), o = new Uint8Array(0);
  try { r = mod.FS.readFile('/w/__x.rpt'); } catch (e) {}
  try { o = mod.FS.readFile('/w/__x.out'); } catch (e) {}
  fs.writeFileSync(rpt, r); fs.writeFileSync(out, o);
  console.log(JSON.stringify({ rc, ms, rpt: r.length, out: o.length }));
})();
