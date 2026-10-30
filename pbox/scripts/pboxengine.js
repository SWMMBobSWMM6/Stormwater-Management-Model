/* Driver for EPA SWMM 5.2.4 + implicit box-scheme extension (pbox.c), wasm32-wasi reactor.
   One fresh instance per run; files live in an in-memory preopened directory. */
(function(root){
'use strict';
function PboxEngine(module){ this.module = module; }
PboxEngine.prototype.run = function(inpText, opts, onProgress, shouldStop){
  var S = root.WasiShim, mod = this.module, enc = new TextEncoder();
  opts = opts || {}; onProgress = onProgress || function(){}; shouldStop = shouldStop || function(){ return false; };
  var dir = new Map([['m.inp', new S.File(enc.encode(inpText))]]);
  var fds = [new S.OpenFile(new S.File([])), S.ConsoleStdout.lineBuffered(function(){}), S.ConsoleStdout.lineBuffered(function(){}), new S.PreopenDirectory('.', dir)];
  var wasi = new S.WASI([], [], fds, { debug: false });
  return WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport }).then(function(inst){
    wasi.initialize(inst);
    var ex = inst.exports, t0 = Date.now();
    function str(s){ var b = enc.encode(s + '\0'), p = ex.malloc(b.length); new Uint8Array(ex.memory.buffer, p, b.length).set(b); return p; }
    function read(name){ var f = dir.get(name); return f ? f.data : new Uint8Array(0); }
    ex.swmm_setPboxOptions(opts.mode ? 1 : 0, +opts.theta || 0, +opts.slot || 0, (opts.base === undefined || opts.base === null) ? -1 : +opts.base, +opts.spacing || 0);
    var pIn = str('m.inp'), pRpt = str('m.rpt'), pOut = str('m.out'), pEl = ex.malloc(16), pSt = ex.malloc(96);
    var rc = ex.swmm_open(pIn, pRpt, pOut), started = false, stopped = false, opened = (rc === 0);
    function finish(){
      var stats = null;
      try { if (opened) { ex.swmm_end(); ex.swmm_getPboxStats(pSt); stats = Array.from(new Float64Array(ex.memory.buffer, pSt, 10)); ex.swmm_report(); } } catch (e) {}
      try { ex.swmm_close(); } catch (e) {}
      return { rc:rc, stopped:stopped, rpt:new TextDecoder('latin1').decode(read('m.rpt')), out:read('m.out'), stats:stats, ms:Date.now() - t0 };
    }
    if (rc) return finish();
    rc = ex.swmm_start(1); started = !rc;
    if (rc) return finish();
    var totalDays = opts.totalDays || 0;
    return new Promise(function(resolve){
      function chunk(){
        var t1 = Date.now(), el = 1;
        try {
          while (Date.now() - t1 < 28) {
            rc = ex.swmm_step(pEl);
            el = new Float64Array(ex.memory.buffer, pEl, 1)[0];
            if (rc || el <= 0) break;
          }
        } catch (e) { rc = rc || -1; el = 0; }
        if (shouldStop()) { stopped = true; resolve(finish()); return; }
        if (el > 0 && !rc) { if (totalDays > 0) onProgress(Math.min(1, el / totalDays)); setTimeout(chunk, 0); return; }
        onProgress(1); resolve(finish());
      }
      chunk();
    });
  });
};
root.PboxEngine = PboxEngine;
})(typeof window !== 'undefined' ? window : globalThis);
