// wasm engine vs native builds of the same source, extension off and on, byte for byte.
//   node wasm_check.js <build-dir> <wasm> <shim.js> model1.inp ...
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [B, W, SH, ...models] = process.argv.slice(2);
eval(fs.readFileSync(SH, 'utf8'));
require(path.join(__dirname, 'pboxengine.js'));
(async () => {
  const E = new PboxEngine(new WebAssembly.Module(fs.readFileSync(W)));
  const t = { off_musl: 0, on_musl: 0, off_glibc: 0, on_glibc: 0, n: 0 };
  for (const f of models) {
    t.n++;
    for (const mode of [0, 1]) {
      const r = await E.run(fs.readFileSync(f, 'utf8'), { mode });
      const w = Buffer.from(r.out);
      for (const lib of ['musl', 'glibc']) {
        const exe = path.join(B, lib === 'musl' ? 'pboxswmm-musl' : 'pboxswmm');
        try { execFileSync(exe, [f, '/tmp/wc.rpt', '/tmp/wc.out'], { env: { PBOX: String(mode) }, stdio: 'ignore' }); } catch (e) {}
        const same = Buffer.compare(w, fs.readFileSync('/tmp/wc.out')) === 0;
        if (same) t[(mode ? 'on_' : 'off_') + lib]++; else if (lib === 'musl') console.log('WASM != MUSL', path.basename(f), 'mode', mode);
      }
    }
  }
  console.log(`models ${t.n}: wasm vs native musl  off ${t.off_musl}/${t.n}  on ${t.on_musl}/${t.n};  wasm vs native glibc  off ${t.off_glibc}/${t.n}  on ${t.on_glibc}/${t.n}`);
})();
