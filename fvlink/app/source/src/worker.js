// Engine worker. The build prepends one engine's Emscripten glue (which
// defines createSwmm) to this file. One worker = one run = one fresh module,
// so a trap or a cancel is cured by worker.terminate() and MEMFS starts empty.
// The step loop mirrors swmm_run() in swmm5.c (open, start(TRUE), step until
// elapsed time returns to 0, end, close), so the files match a CLI run.
self.onmessage = async (ev) => {
  const { inp, files, days } = ev.data;
  const post = (m, t) => self.postMessage(m, t || []);
  try {
    const t0 = performance.now();
    const mod = await createSwmm({ print: () => {}, printErr: () => {} });
    const tLoad = performance.now() - t0;
    const FS = mod.FS;
    FS.mkdir("/w");
    for (const [name, bytes] of files || []) FS.writeFile("/w/" + name, bytes);
    FS.writeFile("/w/model.inp", inp);
    FS.chdir("/w");
    for (const f of ["model.rpt", "model.out"]) { try { FS.unlink("/w/" + f); } catch (e) {} }
    const open = mod.cwrap("swmm_open", "number", ["string", "string", "string"]);
    const start = mod.cwrap("swmm_start", "number", ["number"]);
    const step = mod.cwrap("swmm_step", "number", ["number"]);
    const end = mod.cwrap("swmm_end", "number", []);
    const close = mod.cwrap("swmm_close", "number", []);
    const getErr = mod.cwrap("swmm_getError", "number", ["number", "number"]);
    const version = mod._swmm_getVersion();
    const t1 = performance.now();
    let err = open("model.inp", "model.rpt", "model.out");
    let steps = 0;
    if (!err) {
      err = start(1);
      if (!err) {
        const p = mod._malloc(8);
        let last = 0, el = 0;
        do {
          err = step(p);
          el = mod.getValue(p, "double");
          steps++;
          const now = performance.now();
          if (now - last > 120) { last = now; post({ type: "progress", frac: days > 0 ? Math.min(1, el / days) : -1, el }); }
        } while (el > 0 && !err);
        mod._free(p);
      }
      const e2 = end();
      if (!err) err = e2;
    }
    close();
    const ms = performance.now() - t1;
    let msg = "";
    if (err) { const b = mod._malloc(1024); try { getErr(b, 1023); msg = mod.UTF8ToString(b); } catch (e) {} mod._free(b); }
    let rpt = new Uint8Array(0), out = new Uint8Array(0);
    try { rpt = FS.readFile("/w/model.rpt"); } catch (e) {}
    try { out = FS.readFile("/w/model.out"); } catch (e) {}
    post({ type: "done", err, msg, ms, tLoad, steps, version, rpt, out }, [rpt.buffer, out.buffer]);
  } catch (e) {
    // Emscripten's exit() throws; a wasm trap lands here too
    post({ type: "fail", error: String(e && e.message || e) });
  }
};
