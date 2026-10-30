// Figures for the Doc tab (and, rasterised, for the .docx). Every figure is
// inline SVG styled only through classes, so the page's theme tokens colour it
// in both themes and nothing here carries a colour literal.
// Charts read figdata.json (results files of the final build); diagrams say
// they are diagrams; the two illustrations say so in their captions.
const fs = require("fs");
const path = require("path");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "figdata.json"), "utf8"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f1 = (x, d = 1) => (Number(x) + (x >= 0 ? 1e-9 : -1e-9)).toFixed(d);
const r2 = (x) => Math.round(x * 100) / 100;

function svgOpen(W, H, label, p) {
  return `<svg class="fx" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><marker id="${p}-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" class="mk"/></marker>` +
    `<marker id="${p}-af" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" class="mk-fv"/></marker></defs>`;
}
const T = (x, y, s, cls = "t-ink", extra = "") => `<text x="${r2(x)}" y="${r2(y)}" class="${cls}" ${extra}>${s}</text>`;
const line = (x1, y1, x2, y2, cls, extra = "") => `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" class="${cls}" ${extra}/>`;
const rect = (x, y, w, h, cls, extra = "") => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(Math.max(w, 0))}" height="${r2(Math.max(h, 0))}" class="${cls}" ${extra}/>`;
const circ = (x, y, r, cls) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" class="${cls}"/>`;
const pathD = (pts) => pts.map((p, i) => (i ? "L" : "M") + r2(p[0]) + "," + r2(p[1])).join("");

// --- scales and axes --------------------------------------------------------
function scale(a) { // {min,max,log,sym} -> f(v) in [0,1]
  if (a.log) { const l0 = Math.log10(a.min), l1 = Math.log10(a.max); return (v) => (Math.log10(v) - l0) / (l1 - l0); }
  if (a.sym) { const g = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v)); const g0 = g(a.min), g1 = g(a.max); return (v) => (g(v) - g0) / (g1 - g0); }
  return (v) => (v - a.min) / (a.max - a.min);
}
function niceTicks(min, max, n = 5) {
  const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5);
  const out = []; for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9 * span; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : v);
  return out;
}
function fmtLog(v) {
  const e = Math.round(Math.log10(v));
  if (e >= 0 && e <= 4) return Math.round(v).toLocaleString("en-US");
  if (e === -1) return "0.1"; if (e === -2) return "0.01";
  return "1e" + e;
}
function plot(o) {
  // o: {W,H,m:{l,r,t,b}, x:{min,max,log,sym,ticks,fmt,label}, y:{...}, body(sx,sy,box), p, label, gridX}
  const { W, H, m } = o, x0 = m.l, y0 = m.t, w = W - m.l - m.r, h = H - m.t - m.b;
  const fx = scale(o.x), fy = scale(o.y);
  const sx = (v) => x0 + fx(v) * w, sy = (v) => y0 + h - fy(v) * h;
  let s = rect(x0, y0, w, h, "g-face");
  const yt = o.y.ticks || (o.y.log ? [] : niceTicks(o.y.min, o.y.max));
  const xt = o.x.ticks || (o.x.log ? [] : niceTicks(o.x.min, o.x.max));
  for (const v of yt) { const yy = sy(v); s += line(x0, yy, x0 + w, yy, "g-grid") + T(x0 - 7, yy + 4, (o.y.fmt || String)(v), "t-tick", 'text-anchor="end"'); }
  for (const v of xt) { const xx = sx(v); if (o.gridX !== false) s += line(xx, y0, xx, y0 + h, "g-grid"); s += T(xx, y0 + h + 17, (o.x.fmt || String)(v), "t-tick", 'text-anchor="middle"'); }
  s += rect(x0, y0, w, h, "g-frame");
  s += o.body(sx, sy, { x0, y0, w, h });
  if (o.x.label) s += T(x0 + w / 2, H - 6, o.x.label, "t-axis", 'text-anchor="middle"');
  if (o.y.label) s += T(14, y0 + h / 2, o.y.label, "t-axis", `text-anchor="middle" transform="rotate(-90 14 ${r2(y0 + h / 2)})"`);
  return s;
}
function legend(items, x, y, gap = 22) { // items: [{cls,label,kind}]
  let s = "";
  items.forEach((it, i) => {
    const yy = y + i * gap;
    if (it.kind === "box") s += rect(x, yy - 9, 16, 12, it.cls);
    else if (it.kind === "dot") s += circ(x + 8, yy - 3, 5, it.cls);
    else s += line(x, yy - 3, x + 22, yy - 3, it.cls);
    s += T(x + 30, yy + 1, it.label, "t-leg");
  });
  return s;
}
function legendRow(items, x, y) {
  let s = "", xx = x;
  for (const it of items) {
    if (it.kind === "box") s += rect(xx, y - 9, 16, 12, it.cls);
    else if (it.kind === "dot") s += circ(xx + 8, y - 3, 5, it.cls);
    else s += line(xx, y - 3, xx + 22, y - 3, it.cls);
    s += T(xx + 28, y + 1, it.label, "t-leg");
    xx += 34 + it.label.length * 6.9;
  }
  return s;
}

// --- the figures ------------------------------------------------------------
const F = {};

F.twoways = (p) => {
  const W = 680, H = 270;
  let s = svgOpen(W, H, "Whole-model finite volume versus one listed conduit", p);
  const nodes = [[0, 1], [1.4, 1], [2.8, 1], [4.2, 1], [1.4, 2.1], [2.8, 0], [4.2, 2.1]];
  const links = [[0, 1], [1, 2], [2, 3], [4, 1], [2, 5], [6, 3]];
  const panel = (ox, title, fvset, tag) => {
    let g = T(ox, 22, title, "t-title");
    const X = (v) => ox + 20 + v * 66, Y = (v) => 205 - v * 66;
    links.forEach(([a, b], k) => {
      const [x1, y1] = nodes[a], [x2, y2] = nodes[b];
      if (fvset.has(k)) {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n;
          g += line(X(x1 + (x2 - x1) * t0), Y(y1 + (y2 - y1) * t0), X(x1 + (x2 - x1) * t1), Y(y1 + (y2 - y1) * t1), i % 2 ? "l-fv2-thick" : "l-fv-thick");
        }
      } else g += line(X(x1), Y(y1), X(x2), Y(y2), "l-dw-mid");
    });
    nodes.forEach(([x, y]) => { g += circ(X(x), Y(y), 7, "f-node"); });
    if (tag) g += T(X(3.5), Y(1) + 22, tag, "t-ink", 'text-anchor="middle"');
    return g;
  };
  s += panel(10, "OpenSWMM: FLOW_ROUTING FV", new Set([0, 1, 2, 3, 4, 5]), "");
  s += panel(350, "This branch: [FV_LINKS] C3", new Set([2]), "C3");
  s += legendRow([{ cls: "l-dw-mid", label: "one flow per conduit (dynamic wave)" }, { cls: "l-fv-thick", label: "conduit cut into cells (finite volume)" }], 24, 258);
  return s + "</svg>";
};

F.courant = (p) => {
  const c = D.courant, W = 680, H = 330;
  let s = svgOpen(W, H, "Each conduit's tightest Courant time in the 400-pipe tree", p);
  s += plot({ W, H, m: { l: 64, r: 16, t: 14, b: 46 }, p,
    x: { min: -5, max: c.n + 5, ticks: [0, 100, 200, 300, 400], label: "the 400 conduits, sorted" },
    y: { min: 0.3, max: 300, log: true, ticks: [1, 10, 100], fmt: fmtLog, label: "shortest Courant time (s)" },
    body: (sx, sy) => {
      let b = line(sx(-5), sy(10), sx(c.n + 5), sy(10), "l-ref-dash");
      b += T(sx(250), sy(10) - 7, "largest step the model allows, 10 s", "t-dim");
      c.t.forEach((v, i) => { if (c.ids[i] !== "CT21") b += circ(sx(i), sy(v), 2.2, "f-dw"); });
      b += circ(sx(0), sy(c.ct21), 6.5, "f-fv halo");
      b += line(sx(0) + 8, sy(c.ct21) + 2, sx(40), sy(0.42), "g-lead") + T(sx(42), sy(0.42) + 4, `CT21, 10 ft long: ${f1(c.ct21, 2)} s`, "t-ink");
      b += T(sx(120), sy(2.2), `every other conduit: ${f1(c.t[1], 1)} s or more`, "t-dim");
      return b;
    } });
  return s + "</svg>";
};

F.stepfreq = (p) => {
  const sf = D.stepfreq, W = 680, H = 320;
  const runs = [["tree_dw", "f-dw", `stock, with CT21 (average ${f1(sf.tree_dw.avg, 2)} s)`],
    ["tree_fv", "f-fv", `CT21 as an FV link (average ${f1(sf.tree_fv.avg, 2)} s)`],
    ["tree_noshort_dw", "f-aux", `stock, CT21 removed (average ${f1(sf.tree_noshort_dw.avg, 2)} s)`]];
  const bins = sf.tree_dw.freq.map((b) => `${f1(b[1], 1)} to ${f1(b[0], 1)} s`);
  let s = svgOpen(W, H, "Routing step frequencies for the tree, three runs", p);
  s += plot({ W, H, m: { l: 58, r: 16, t: 14, b: 46 }, p, gridX: false,
    x: { min: -0.5, max: 4.5, ticks: [], label: "routing step length, SWMM's own bins" },
    y: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], label: "% of routing steps" },
    body: (sx, sy, bx) => {
      let b = "";
      const bw = 0.26;
      runs.forEach(([k, cls], j) => sf[k].freq.forEach((f, i) => {
        const x = sx(i + (j - 1) * bw - bw / 2 + 0.015), x2 = sx(i + (j - 1) * bw + bw / 2 - 0.015);
        b += rect(x, sy(f[2]), x2 - x, sy(0) - sy(f[2]), cls);
      }));
      bins.forEach((lab, i) => { b += T(sx(i), bx.y0 + bx.h + 17, lab, "t-tick", 'text-anchor="middle"'); });
      b += rect(bx.x0 + 300, bx.y0 + 8, 300, 74, "g-legbg");
      b += legend(runs.map(([, cls, lab]) => ({ cls, label: lab, kind: "box" })), bx.x0 + 312, bx.y0 + 28);
      return b;
    } });
  return s + "</svg>";
};

F.mech = (p) => {
  const W = 680, H = 370;
  let s = svgOpen(W, H, "Mechanism: an FV conduit cut into cells between two dynamic wave nodes", p);
  const bed = (x) => 272 + (x - 94) * 8 / 492, crown = (x) => bed(x) - 150;
  s += rect(24, 60, 70, 230, "f-node") + rect(24, 150, 70, 140, "f-water") + line(24, 150, 94, 150, "l-dw");
  s += rect(586, 60, 70, 230, "f-node") + rect(586, 188, 70, 102, "f-water") + line(586, 188, 656, 188, "l-dw");
  s += T(59, 52, "node J1", "t-ink", 'text-anchor="middle"') + T(621, 52, "node J2", "t-ink", 'text-anchor="middle"');
  const nc = 6, cw = (536 - 144) / nc;
  const surf = [152, 158, 164, 170, 176, 182, 187];
  for (let i = 0; i < nc; i++) {
    const xa = 144 + i * cw, xb = xa + cw, ys = (surf[i] + surf[i + 1]) / 2;
    s += `<path d="${pathD([[xa, ys], [xb, ys], [xb, bed(xb)], [xa, bed(xa)]])}z" class="f-cell"/>`;
    s += T((xa + xb) / 2, bed((xa + xb) / 2) - 12, `cell ${i + 1}`, "t-small", 'text-anchor="middle"');
  }
  s += `<path d="${pathD([[96, 150], [142, 150], [142, bed(142)], [96, bed(96)]])}z" class="g-ghost"/>`;
  s += `<path d="${pathD([[538, 187], [584, 187], [584, bed(584)], [538, bed(538)]])}z" class="g-ghost"/>`;
  s += T(119, bed(119) - 12, "ghost", "t-small", 'text-anchor="middle"') + T(561, bed(561) - 12, "ghost", "t-small", 'text-anchor="middle"');
  s += line(94, bed(94), 586, bed(586), "s-pipe") + line(94, crown(94), 586, crown(586), "s-pipe");
  for (let i = 0; i <= nc; i++) {
    const xf = 144 + i * cw, end = i === 0 || i === nc;
    s += line(xf, crown(xf) + 2, xf, bed(xf) - 1, end ? "g-face-fv" : "g-grid");
    s += line(xf - 15, crown(xf) - 14, xf + 15, crown(xf) - 14, end ? "l-fv" : "l-axis", `marker-end="url(#${p}-${end ? "af" : "a"})"`);
    s += T(xf, crown(xf) - 22, `F${"₀₁₂₃₄₅₆"[i]}`, "t-ink", 'text-anchor="middle"');
  }
  s += `<path d="M132,${crown(144) - 40} C116,${crown(144) - 62} 88,${crown(144) - 62} 72,${crown(144) - 40}" class="l-fv-thin" marker-end="url(#${p}-af)"/>`;
  s += T(170, 30, "the volume through each end face is booked into its node,", "t-small") + T(170, 46, "substep by substep", "t-small");
  s += T(24, 318, "Ghosts (dashed): water surface = the node's head, velocity = the adjacent cell's.", "t-small");
  s += T(24, 337, "Substeps: the fastest signal may cross at most half a cell; many substeps per routing step.", "t-small");
  s += T(24, 356, "A junction or storage node keeps its own books during the subcycle; an outfall follows dynamic wave.", "t-small");
  return s + "</svg>";
};

F.path = (p) => {
  const W = 680, H = 470;
  let s = svgOpen(W, H, "Data path from the input file to the report", p);
  const box = (x, y, w, h, l1, l2, cls = "f-box") => rect(x, y, w, h, cls, 'rx="8"') + T(x + 10, y + 20, l1, "t-mono") + (l2 ? T(x + 10, y + 38, l2, "t-small") : "");
  const arr = (x1, y1, x2, y2) => line(x1, y1, x2, y2, "l-axis", `marker-end="url(#${p}-a)"`);
  s += T(16, 22, "Once, before routing", "t-title") + T(360, 22, "Every routing step (dynwave.c)", "t-title");
  s += box(16, 36, 300, 50, "model.inp  [FV_LINKS]  C4  12", "your input: link names and optional cell counts");
  s += box(16, 112, 300, 50, "input.c → fvlink_readParams()", "ERROR 209 bad link name, 211 bad cell count");
  s += box(16, 188, 300, 50, "project.c → fvlink_validate()", "ERROR 116 if the conduit cannot be an FV link");
  s += box(16, 264, 300, 50, "flowrout.c → fvlink_init()", "256-depth table from xsect_getAofY, cells, state");
  s += arr(166, 86, 166, 110) + arr(166, 162, 166, 186) + arr(166, 238, 166, 262);
  s += rect(352, 36, 312, 300, "g-loop", 'rx="12"');
  s += box(366, 50, 284, 50, "trial: dynamic wave links", "momentum for every non-FV conduit");
  s += box(366, 124, 284, 50, "fvlink_findFlows()", "subcycle each FV link against node heads", "f-box2");
  s += box(366, 198, 284, 50, "setNodeDepth()", "node volume from fvlink_getNodeVolume()");
  s += box(366, 272, 284, 50, "converged?  no: next trial", "yes: next routing step (FV state saved)");
  s += arr(508, 100, 508, 122) + arr(508, 174, 508, 196) + arr(508, 248, 508, 270);
  s += `<path d="M366,297 C330,297 330,75 364,75" class="l-axis" fill="none" marker-end="url(#${p}-a)"/>`;
  s += arr(316, 289, 350, 289);
  s += box(16, 372, 648, 50, "stats.c → fvlink_report()   and   output.c", "Finite-Volume Link Summary in the .rpt; each FV link's delivered flow in the .out like any other link");
  s += arr(508, 336, 508, 370);
  s += T(16, 450, "With no [FV_LINKS] section every hook returns at once, and the output is stock 5.2.4's, byte for byte.", "t-dim");
  return s + "</svg>";
};

F.ledger = (p) => {
  const W = 680, H = 330;
  let s = svgOpen(W, H, "The ledger: each face's flux leaves one cell and enters the next", p);
  const n = 5, x0 = 70, cw = 108;
  for (let i = 0; i < n; i++) {
    s += rect(x0 + i * cw, 70, cw, 62, "f-cell") + rect(x0 + i * cw, 70, cw, 62, "s-pipe-box");
    s += T(x0 + i * cw + cw / 2, 106, `cell ${i + 1}: A${"₁₂₃₄₅"[i]}`, "t-ink", 'text-anchor="middle"');
  }
  for (let i = 0; i <= n; i++) {
    const xf = x0 + i * cw, end = i === 0 || i === n;
    s += line(xf - 18, 50, xf + 18, 50, end ? "l-fv" : "l-axis", `marker-end="url(#${p}-${end ? "af" : "a"})"`);
    s += T(xf, 38, `F${"₀₁₂₃₄₅"[i]}`, "t-ink", 'text-anchor="middle"');
  }
  const e0 = 24, e1 = 104;
  s += T(e0, 168, "one cell:", "t-dim") + T(e1, 168, "Δx·(A_new − A_old) = Δt·(Fₖ₋₁ − Fₖ)", "t-eq");
  s += T(e0, 196, "the pipe:", "t-dim") + T(e1, 196, "Δx·ΣΔA = Δt·[(F₀−F₁) + (F₁−F₂) + … + (F₄−F₅)] = Δt·(F₀−F₅)", "t-eq");
  s += T(e0, 236, "each face:", "t-dim") + T(e1, 236, "F = [s_R·f(U_L) − s_L·f(U_R) + s_L·s_R·(U_R − U_L)] / (s_R − s_L)", "t-eq");
  s += T(e1, 258, "HLL: U_L, U_R are the states (A, Q) either side; s_L, s_R the fastest waves (Davis 1988)", "t-small");
  s += T(e0, 292, "A: water area in a cell (ft²)   Δx: cell length (ft)   F: water crossing a face (ft³/s)   Δt: substep (s)", "t-small");
  s += T(e0, 312, "Interior faces cancel in pairs, so the stored volume changes by exactly what crossed the two ends.", "t-small");
  return s + "</svg>";
};

F.slot = (p) => {
  const W = 680, H = 320, ws = D.wavespeed;
  let s = svgOpen(W, H, "Preissmann slot and the wave speed in the engine's own 3-ft table", p);
  s += circle_slot();
  function circle_slot() {
    let g = T(16, 22, "A full 3-ft pipe, with its slot", "t-title");
    g += circ(120, 175, 78, "f-water") + `<circle cx="120" cy="175" r="78" class="s-pipe-box" fill="none"/>`;
    g += rect(114, 60, 12, 40, "f-water") + rect(114, 60, 12, 40, "s-pipe-box");
    g += T(134, 72, "slot", "t-ink") + T(120, 180, "A = 7.07 ft²", "t-ink", 'text-anchor="middle"');
    g += T(24, 272, "slot drawn about 20× wider than scale;", "t-small") + T(24, 288, "true width 0.0228 ft, so that", "t-small") + T(24, 304, "c = √(g·A/T) = 100 ft/s", "t-small");
    return g;
  }
  const below = [], above = [];
  ws.yD.forEach((y, i) => (y <= 1.0 ? below : above).push([y, ws.c[i]]));
  s += `<g transform="translate(250,0)">` + plot({ W: 430, H: 300, m: { l: 56, r: 12, t: 14, b: 42 }, p,
    x: { min: 0, max: 1.25, ticks: [0, 0.25, 0.5, 0.75, 1, 1.25], label: "depth / diameter" },
    y: { min: 0, max: 115, ticks: [0, 25, 50, 75, 100], label: "wave speed c (ft/s)" },
    body: (sx, sy) => {
      let b = line(sx(1), sy(0), sx(1), sy(115), "l-ref-dash") + T(sx(1) + 4, sy(60), "crown", "t-dim");
      b += `<path d="${pathD(below.map(([x, y]) => [sx(x), sy(y)]))}" class="l-dw"/>`;
      b += `<path d="${pathD(above.map(([x, y]) => [sx(x), sy(y)]))}" class="l-fv"/>`;
      b += legend([{ cls: "l-dw", label: "open channel: √(g·A/T)" }, { cls: "l-fv", label: "above the crown: the slot" }], sx(0.06), sy(108));
      return b;
    } }) + "</g>";
  return s + "</svg>";
};

F.spring = (p) => {
  const W = 680, H = 300, G = 32.2, As = 12.566, Ap = Math.PI * 1.5 * 1.5, Lp = 300, dt = 0.2, n = 3000;
  const w2 = G * Ap / (Lp * As);
  let h = 0.05, q = 0, h2 = 0.05, q2 = 0; const A = [[0, h]], B = [[0, h2]];
  for (let k = 1; k <= n; k++) {
    const hn = h - dt * q / As, qn = q + dt * G * Ap / Lp * h; h = hn; q = qn;
    const hb = (h2 - dt * q2 / As) / (1 + dt * dt * w2); q2 = q2 + dt * G * Ap / Lp * hb; h2 = hb;
    if (k % 2 === 0) { A.push([k * dt / 60, h]); B.push([k * dt / 60, h2]); }
  }
  const ymax = Math.ceil(Math.max(...A.map((a) => Math.abs(a[1]))) * 10) / 10;
  let s = svgOpen(W, H, "Toy oscillator: forward Euler grows, backward Euler decays", p);
  s += plot({ W, H, m: { l: 60, r: 16, t: 14, b: 46 }, p,
    x: { min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10], label: "time (min)" },
    y: { min: -ymax, max: ymax, label: "manhole level above rest (ft)" },
    body: (sx, sy) => line(sx(0), sy(0), sx(10), sy(0), "g-zero") +
      `<path d="${pathD(A.map(([x, y]) => [sx(x), sy(y)]))}" class="l-fv-thin"/>` +
      `<path d="${pathD(B.map(([x, y]) => [sx(x), sy(y)]))}" class="l-dw"/>` +
      rect(sx(0.15), sy(ymax) + 6, 380, 50, "g-legbg") +
      legend([{ cls: "l-fv", label: "head fixed at the start of each step (forward Euler)" }, { cls: "l-dw", label: "head estimated ahead (backward Euler)" }], sx(0.3), sy(ymax) + 26) });
  return s + "</svg>";
};

F.resonator = (p) => {
  const v = D.resonator, W = 680, H = 300;
  let s = svgOpen(W, H, "Resonator: largest departure per 30 minutes, final build", p);
  s += plot({ W, H, m: { l: 64, r: 16, t: 14, b: 46 }, p, gridX: false,
    x: { min: -0.5, max: v.length - 0.5, ticks: [], label: "half-hour window (hours from start)" },
    y: { min: 1e-6, max: 10, log: true, ticks: [1e-6, 1e-5, 1e-4, 1e-3, 0.01, 0.1, 1, 10], fmt: fmtLog, label: "largest |head − 105 ft| (ft)" },
    body: (sx, sy, bx) => {
      let b = line(sx(-0.5), sy(2.1), sx(v.length - 0.5), sy(2.1), "l-fv-dash") + T(sx(5.3), sy(2.1) - 7, "first draft (FVL-2): grew to a ±2.1 ft limit cycle", "t-ink");
      v.forEach((x, i) => {
        const xa = sx(i - 0.33), xb = sx(i + 0.33);
        if (x > 0) b += rect(xa, sy(x), xb - xa, sy(1e-6) - sy(x), "f-dw");
        else b += T(sx(i), sy(1e-6) - 6, "0*", "t-dim", 'text-anchor="middle"');
        b += T(sx(i), bx.y0 + bx.h + 17, f1(i * 0.5, 1), "t-tick", 'text-anchor="middle"');
      });
      b += T(bx.x0 + bx.w - 8, sy(3e-5), "* below the .out file's resolution (7.6e-6 ft at 105 ft)", "t-dim", 'text-anchor="end"');
      return b;
    } });
  return s + "</svg>";
};

F.booking = (p) => {
  const W = 680, H = 270;
  let s = svgOpen(W, H, "Illustration: trapezoid booking versus substep booking", p);
  const panel = (ox, title, stepped) => {
    let g = T(ox, 22, title, "t-title");
    const x0 = ox + 10, y0 = 40, w = 300, h = 180;
    const sx = (t) => x0 + t * w, sy = (q) => y0 + h - q / 7.5 * h;
    g += rect(x0, y0, w, h, "g-face") + rect(x0, y0, w, h, "g-frame");
    if (!stepped) {
      g += `<path d="${pathD([[sx(0), sy(0)], [sx(0), sy(4)], [sx(1), sy(6.5)], [sx(1), sy(0)]])}z" class="f-dw-soft"/>`;
      g += line(sx(0), sy(4), sx(1), sy(6.5), "l-dw") + circ(sx(0), sy(4), 4, "f-dw") + circ(sx(1), sy(6.5), 4, "f-dw");
      g += T(sx(0.5), sy(1.6), "½·(Q_old + Q_new)·Δt", "t-ink", 'text-anchor="middle"');
    } else {
      const fv = (t) => 3.0 + 1.2 * Math.sin(5.5 * t + 0.4) + 0.8 * t; const N = 12; const pts = [[sx(0), sy(0)]];
      for (let k = 0; k < N; k++) { const q = fv(k / N); pts.push([sx(k / N), sy(q)], [sx((k + 1) / N), sy(q)]); }
      pts.push([sx(1), sy(0)]);
      g += `<path d="${pathD(pts)}z" class="f-fv-soft"/>` + `<path d="${pathD(pts.slice(1, -1))}" class="l-fv"/>`;
      g += line(sx(0), sy(fv(0)), sx(1), sy(fv(1)), "l-ref-dash");
      g += T(sx(0.5), sy(1.6), "the volume that crossed the end face", "t-ink", 'text-anchor="middle"');
      g += T(sx(0.98), sy(6.9), "the trapezoid would use the dashed line", "t-small", 'text-anchor="end"');
    }
    g += T(x0 + w / 2, y0 + h + 18, "time within one routing step", "t-axis", 'text-anchor="middle"');
    return g;
  };
  s += panel(14, "Other links at the node: trapezoid", false) + panel(350, "FV link ends: substep by substep", true);
  s += T(24, 262, "Illustration with made-up flows; the method, not a measurement.", "t-dim");
  return s + "</svg>";
};

F.lake = (p) => {
  const v = D.lake, W = 680, H = 320;
  let s = svgOpen(W, H, "Lake at rest: the largest flow anywhere in two hours", p);
  s += plot({ W, H, m: { l: 250, r: 20, t: 10, b: 44 }, p,
    x: { min: 1e-13, max: 1, log: true, ticks: [1e-12, 1e-9, 1e-6, 1e-3, 1], fmt: fmtLog, label: "largest |flow| anywhere in 2 h (cfs, log scale)" },
    y: { min: -0.5, max: v.length - 0.5, ticks: [] },
    body: (sx, sy) => {
      let b = "";
      v.forEach(([lab, x], i) => {
        const y = sy(v.length - 1 - i), cls = lab.startsWith("control") ? "f-aux" : lab.startsWith("stock") ? "f-dw" : "f-fv";
        b += T(242, y + 4, esc(lab), "t-tick", 'text-anchor="end"');
        if (x > 0) { b += rect(sx(1e-13), y - 9, sx(x) - sx(1e-13), 18, cls); b += T(sx(x) + 6, y + 4, x.toExponential(2).replace("e-", "e-") + " cfs", "t-ink"); }
        else b += T(sx(1e-13) + 6, y + 4, "exactly 0", "t-dim");
      });
      return b;
    } });
  return s + "</svg>";
};

F.user2 = (p) => {
  const u = D.user2, W = 680, H = 340, dt = u.dt / 3600;
  const ser = (k) => u[k].map((q, i) => [u.t0_h + i * dt, q]);
  const all = [].concat(u.TW01290_dw, u.TW01290_fv, u.TW01300_dw, u.TW01280_dw);
  const lo = Math.floor(Math.min(...all) / 500) * 500, hi = Math.ceil(Math.max(...all) / 500) * 500;
  const t1 = u.t0_h + (u.TW01290_dw.length - 1) * dt;
  let s = svgOpen(W, H + 56, "EPA user2 TW01290 flow every 5 seconds, stock versus FV", p);
  s += plot({ W, H, m: { l: 64, r: 16, t: 14, b: 46 }, p,
    x: { min: u.t0_h, max: t1, ticks: [12.4, 12.6, 12.8, 13.0], fmt: (v) => f1(v, 1), label: "time (h)" },
    y: { min: lo, max: hi, label: "flow (cfs)" },
    body: (sx, sy, bx) => {
      const P = (k, cls) => `<path d="${pathD(ser(k).map(([x, y]) => [sx(x), sy(y)]))}" class="${cls}"/>`;
      let b = line(sx(u.t0_h), sy(0), sx(t1), sy(0), "g-zero");
      b += P("TW01300_dw", "l-aux-thin") + P("TW01280_dw", "l-c4-thin") + P("TW01290_dw", "l-dw-thin") + P("TW01290_fv", "l-fv");
      return b;
    } });
  s += legendRow([{ cls: "l-dw", label: `TW01290, stock (peak ${Math.round(u.peak_dw).toLocaleString("en-US")} cfs)` }, { cls: "l-fv", label: `TW01290 as an FV link (peak ${Math.round(u.peak_fv)} cfs)` }], 64, H + 20);
  s += legendRow([{ cls: "l-aux", label: "TW01300 upstream, stock" }, { cls: "l-c4", label: "TW01280 downstream, stock" }], 64, H + 44);
  return s + "</svg>";
};

F.refine = (p) => {
  const v = D.refine, W = 680, H = 300;
  let s = svgOpen(W, H, "Extra peak depth at J4 shrinks as the cells get shorter", p);
  s += plot({ W, H, m: { l: 64, r: 24, t: 14, b: 46 }, p,
    x: { min: 0.8, max: 64, log: true, ticks: [1, 2, 4, 12, 48], label: "cells in the FV link (log scale)" },
    y: { min: 0, max: 0.5, ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5], fmt: (x) => f1(x, 1), label: "J4 peak depth above stock (ft)" },
    body: (sx, sy) => {
      let b = `<path d="${pathD(v.map(([c, d]) => [sx(c), sy(d)]))}" class="l-fv"/>`;
      v.forEach(([c, d]) => { b += circ(sx(c), sy(d), 5.5, "f-fv halo") + T(sx(c) + 9, sy(d) - 8, `${f1(d, 2)} ft`, "t-ink"); });
      b += T(sx(12), sy(0.465), "default mesh for this 300-ft pipe: 12 cells", "t-dim", 'text-anchor="middle"');
      return b;
    } });
  return s + "</svg>";
};

F.timing = (p) => {
  const t = D.timing, W = 680, H = 250;
  const rows = [["stock, with the 10-ft pipe", t.short.a, "f-dw"], ["CT21 as an FV link", t.short.b, "f-fv"], ["stock, a tree without the short pipe", t.noshort.a, "f-aux"]];
  let s = svgOpen(W, H + 10, "Wall time of the tree, medians of seven interleaved runs", p);
  s += plot({ W, H: 196, m: { l: 250, r: 70, t: 10, b: 44 }, p,
    x: { min: 0, max: 5.5, ticks: [0, 1, 2, 3, 4, 5], label: "wall time, median of 7 interleaved runs (s)" },
    y: { min: -0.5, max: 2.5, ticks: [] },
    body: (sx, sy) => {
      let b = "";
      rows.forEach(([lab, v, cls], i) => { const y = sy(2 - i); b += T(242, y + 4, lab, "t-tick", 'text-anchor="end"') + rect(sx(0), y - 13, sx(v) - sx(0), 26, cls) + T(sx(v) + 6, y + 4, `${f1(v, 3)} s`, "t-ink"); });
      return b;
    } });
  s += T(24, 228, `CT21 as FV / stock: ${f1(t.short.ratio, 2)}× (every interleaved pair ${f1(t.short.lo, 2)} to ${f1(t.short.hi, 2)})`, "t-ink");
  s += T(24, 250, `CT21 as FV / tree without the short pipe: ${f1(t.noshort.ratio, 2)}× (${f1(t.noshort.lo, 2)} to ${f1(t.noshort.hi, 2)}), two different networks`, "t-dim");
  return s + "</svg>";
};

F.treepeaks = (p) => {
  const tp = D.treepeaks, W = 680, H = 280;
  let s = svgOpen(W, H, "Tree: change in every conduit's peak flow and every node's peak depth", p);
  const hist = (ox, counts, title, cls) => {
    const ymax = Math.ceil(Math.max(...counts) / 50) * 50;
    return `<g transform="translate(${ox},0)">` + T(8, 18, title, "t-title") + plot({ W: 330, H: 270, m: { l: 50, r: 10, t: 30, b: 42 }, p, gridX: false,
      x: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: (x) => f1(x, 2), label: "|change| (%)" },
      y: { min: 0, max: ymax, label: "count" },
      body: (sx, sy) => counts.map((c, i) => c ? rect(sx(tp.bins[i]) + 1, sy(c), sx(tp.bins[i + 1]) - sx(tp.bins[i]) - 2, sy(0) - sy(c), cls) : "").join("") }) + "</g>";
  };
  s += hist(0, tp.links, `${tp.nlinks} conduits: peak flow (max ${tp.link_max} %)`, "f-dw");
  s += hist(345, tp.nodes, `${tp.nnodes} nodes: peak depth (max ${tp.node_max} %)`, "f-aux");
  return s + "</svg>";
};

F.sweep = (p) => {
  const v = D.sweep.map((r) => [r.m, r.peak]).sort((a, b) => a[1] - b[1]), W = 680, H = 330;
  let s = svgOpen(W, H, "EPA sweep: change in the flagged conduit's peak flow, 37 models", p);
  s += plot({ W, H, m: { l: 66, r: 16, t: 14, b: 30 }, p,
    x: { min: -1, max: v.length, ticks: [], label: "the 37 EPA dynamic wave models with conduits, sorted" },
    y: { min: -150, max: 60, sym: true, ticks: [-100, -10, -1, 0, 1, 10], fmt: (x) => (x > 0 ? "+" : "") + x, label: "change in peak flow (%)" },
    body: (sx, sy) => {
      let b = line(sx(-1), sy(0), sx(v.length), sy(0), "g-zero");
      v.forEach(([m, x], i) => {
        const big = Math.abs(x) > 5;
        b += circ(sx(i), sy(x), big ? 5.5 : 4, big ? "f-fv halo" : "f-dw halo");
        if (big) b += T(sx(i) + (x < 0 ? 10 : -10), sy(x) + 4, `${m} ${x > 0 ? "+" : ""}${Math.round(x)} %`, "t-ink", `text-anchor="${x < 0 ? "start" : "end"}"`);
      });
      b += T(sx(19), sy(-4), "median |change| 0.04 %", "t-dim");
      return b;
    } });
  return s + "</svg>";
};

F.cost = (p) => {
  const v = D.sweep.map((r) => [r.m, r.sub]).sort((a, b) => a[1] - b[1]), W = 680, H = 300;
  let s = svgOpen(W, H, "FV substeps per routing step across the EPA sweep", p);
  s += plot({ W, H, m: { l: 64, r: 16, t: 14, b: 30 }, p, gridX: false,
    x: { min: -1, max: v.length + 1, ticks: [], label: "the 37 EPA models, sorted" },
    y: { min: 1, max: 10000, log: true, ticks: [1, 10, 100, 1000, 10000], fmt: fmtLog, label: "FV substeps per routing step" },
    body: (sx, sy) => {
      let b = "";
      v.forEach(([m, x], i) => {
        const hot = m === "user4" || m === "extran10";
        b += rect(sx(i) - 6, sy(x), 12, sy(1) - sy(x), hot ? "f-fv" : "f-dw");
        if (hot) b += T(sx(i) + 8, sy(x) - (m === "user4" ? 8 : 28), m === "user4" ? `user4, 0.47-ft cells: ${Math.round(x)}` : `extran10, a full 1,000-ft pipe: ${Math.round(x)}`, "t-ink", 'text-anchor="end"');
      });
      return b;
    } });
  return s + "</svg>";
};

F.limits = (p) => {
  const W = 680, H = 360;
  let s = svgOpen(W, H, "What an FV link can be, what stops the run, and what is not modeled", p);
  const col = (x, w, h, title, items, cls, icon, ink) => {
    let g = rect(x, 14, w, h, cls, 'rx="10"') + T(x + 14, 40, title, ink + " t-bold");
    items.forEach((it, i) => { g += T(x + 14, 68 + i * 22, `${icon}  ${it}`, ink); });
    return g;
  };
  s += col(14, 300, 200, "Runs as an FV link", ["a conduit, under DYNWAVE routing", "any built-in closed or open shape", "irregular and street transects", "custom shapes (closure test only)", "any number of barrels", "offsets, adverse slope, initial flow", "SLOT or EXTRAN surcharge"], "f-okbox", "✓", "t-ok");
  s += col(330, 336, 200, "Stops the run: ERROR 116", ["not a conduit, or a DUMMY conduit", "a force main", "a culvert code", "a flap gate", "an entry, exit or average loss", "seepage, a max. flow, a street inlet", "a pump or dummy conduit at an end node"], "f-warnbox", "✗", "t-warn");
  s += rect(14, 228, 652, 118, "f-box", 'rx="10"') + T(28, 254, "Runs, with these limits", "t-ink t-bold");
  ["no evaporation or seepage inside the link; one conservative pollutant tested",
    "hot start stores no cell state: the link restarts at uniform depth",
    "a node surcharged under EXTRAN does not book the FV volume exactly",
    "LENGTHENING_STEP does not apply; the link keeps its true length"].forEach((t, i) => { s += T(28, 280 + i * 20, `•  ${t}`, "t-ink"); });
  return s + "</svg>";
};

F.wasm = (p) => {
  const w = D.wasm, W = 680, H = 290;
  const rows = [["test set, FV engine", w.fv], ["EPA suite, stock engine", w.st_nr], ["EPA suite, FV engine", w.fv_nr]];
  const cats = [["A", "f-dw", ".out and .rpt identical"], ["B", "f-aux", ".out identical, .rpt round-off"], ["C", "f-fv", ".out values differ"], ["E", "f-c4", "same error, no .out"]];
  const val = (o, k) => (o[k] || 0) + (k === "E" ? (o["E*"] || 0) : 0);
  let s = svgOpen(W, H, "WebAssembly engines against the native builds", p);
  s += plot({ W, H: 200, m: { l: 190, r: 20, t: 10, b: 44 }, p,
    x: { min: 0, max: 75, ticks: [0, 15, 30, 45, 60, 75], label: "runs" },
    y: { min: -0.5, max: 2.5, ticks: [] },
    body: (sx, sy) => {
      let b = "";
      rows.forEach(([lab, o], i) => {
        const y = sy(2 - i); let acc = 0;
        const tot = cats.reduce((a, [k]) => a + val(o, k), 0);
        b += T(182, y + 4, `${lab} (${tot})`, "t-tick", 'text-anchor="end"');
        cats.forEach(([k, cls]) => { const n = val(o, k); if (!n) return; b += rect(sx(acc) + 1, y - 13, sx(acc + n) - sx(acc) - 2, 26, cls); if (n >= 3) b += T(sx(acc + n / 2), y + 5, n, "t-onbar", 'text-anchor="middle"'); acc += n; });
      });
      return b;
    } });
  s += legendRow(cats.slice(0, 2).map(([, cls, lab]) => ({ cls, label: lab, kind: "box" })), 24, 226);
  s += legendRow(cats.slice(2).map(([, cls, lab]) => ({ cls, label: lab, kind: "box" })), 24, 250);
  s += T(24, 278, "Inside the browser, the stock and FV engines agree byte for byte on all 73 EPA models.", "t-dim");
  return s + "</svg>";
};

F.defects = (p) => {
  const W = 680, H = 300;
  const Dl = [["1", "still-water ghost", "me"], ["2", "pumped node oscillation", "me"], ["3", "flow from cell momentum", "me"], ["4", "slot as conveyance", "me"],
    ["5", "half-scaled positivity", "me"], ["6", "pumps read wrong inflow", "review"], ["7", "gated outfall leaked", "review"], ["8", "quality storage twice", "review"],
    ["9", "long ID overflowed", "review"], ["10", "limiter missed outflows", "review"], ["11", "flat area, infinite speed", "me"], ["12", "report rule 2 columns off", "me"],
    ["13", "substep cut unrecorded", "check"], ["14", "lengthening ratio shown", "check"]];
  const cls = { me: "f-dw", review: "f-fv", check: "f-aux" };
  let s = svgOpen(W, H, "The defect register, FVL-1 to FVL-14, by who found each", p);
  Dl.forEach(([k, lab, who], i) => {
    const x = 10 + i * 44;
    s += rect(x, 150, 38, 38, cls[who], 'rx="6"') + T(x + 19, 175, k, "t-onbar", 'text-anchor="middle"');
    s += T(x + 14, 140, lab, "t-small", `transform="rotate(-60 ${x + 14} 140)"`);
  });
  s += T(18, 212, "FVL-1 to FVL-14, in the order found  →", "t-dim");
  s += legend([{ cls: "f-dw", label: "found while building, testing and writing (7)", kind: "box" }, { cls: "f-fv", label: "found by an independent review agent (5)", kind: "box" },
    { cls: "f-aux", label: "found by checking the written description (2)", kind: "box" }], 18, 238, 20);
  return s + "</svg>";
};

// --- order, titles and captions (shared by the tab and the .docx) ----------------------
const META = {
  twoways: ["Two ways to put finite volume in a sewer model", "OpenSWMM switches the whole network to finite volume; this branch switches only the conduits you list. Diagram."],
  courant: ["One conduit sets the pace", `Each of the tree's 400 conduits at its tightest moment, by stock SWMM's own rule: 0.75·L/(v + c), skipping empty, full and nearly still pipes. CT21 allows ${f1(D.courant.ct21, 2)} s; every other conduit allows ${f1(D.courant.t[1], 1)} s or more. From the stock run's .out file.`],
  stepfreq: ["The steps the model actually took", "From SWMM's Routing Time Step Summary for three runs of the tree. With CT21 handed to the FV solver, the network takes the steps it would take if the short pipe were not there."],
  mech: ["The mechanism", "The listed conduit is cut into cells. Each face between cells is solved as a small dam break; each end face sees a ghost built from the node's head and the adjacent cell's velocity. Diagram, not to scale."],
  path: ["Follow the data", "Every hook into stock SWMM is a call into fvlink.c, named here by the file that makes it. Diagram."],
  ledger: ["The ledger that makes the volume exact", "What one cell gains, its neighbor lost. Summed along the pipe, only the two end faces remain. The HLL formula sets each face's flux from the states on either side."],
  slot: ["Preissmann's slot", "A closed pipe that fills behaves as if it had a narrow slot in its crown, sized so the pressure wave travels at 100 ft/s. Right: the wave speed in the engine's own table for a 3-ft circle."],
  spring: ["A manhole on a pipe is a weight on a spring", "A toy model, not a SWMM run: a 12.566 ft² manhole on a 300-ft, 3-ft pipe, 0.2-s steps, started 0.05 ft high. Fixing the head at the start of each step adds energy every cycle; estimating it ahead takes a little away."],
  resonator: ["The real resonator, final build", "A dead-end manhole on a surcharged 300-ft FV pipe, started 0.05 ft high. Each bar is the largest departure in a half hour; it falls about 4.6 times per window. The first draft's explicit coupling grew instead."],
  booking: ["Booking the water", "Stock books each link's flow into a node by the trapezoid rule. The FV link books the volume that actually crossed its end face, substep by substep. Illustration."],
  lake: ["A lake at rest", "Head 105 ft everywhere, outfall fixed at 105 ft, two hours. With every conduit FV the water stays still to round-off. Mixed models sit at dynamic wave's own noise floor, which stock reaches from a 1e-7 ft seed."],
  user2: ["EPA user2, channel TW01290, every 5 seconds", `Stock dynamic wave peaks at ${Math.round(D.user2.peak_dw).toLocaleString("en-US")} cfs and runs backwards 83 times between 12.53 and 12.88 h, while its neighbors never carry more than 891 and 537 cfs. As an FV link it peaks at ${Math.round(D.user2.peak_fv)} cfs with no reversal; net volume agrees to 0.02 %.`],
  refine: ["The price at the joints", "The node upstream of the FV link in the 30 cfs chain peaks higher than in stock. The excess shrinks as the cells get shorter, so it is numerical, not an entrance loss."],
  timing: ["What it buys", "The 400-pipe tree, medians of seven interleaved runs on one machine. The third bar is a different network: the same tree with the short pipe removed."],
  treepeaks: ["What it costs in the answer", "Stock against CT21 as an FV link: the change in every conduit's peak flow and in every wet node's peak depth."],
  sweep: ["Everybody else's models", "One conduit flagged in each of EPA's 37 dynamic wave models with conduits: the change in that conduit's peak flow. Four moved more than 5 %; two of them are the oscillations this branch removes."],
  cost: ["Where the subcycle is expensive", "FV substeps per routing step for the flagged conduit in each EPA model. Short cells and full pipes cost the most."],
  limits: ["The specification", "What the engine accepts as an FV link, what stops the run, and what it does not model inside the link."],
  wasm: ["Calibrating the second instrument", "The WebAssembly engines in this app against the native builds that were tested, on every test, gate and probe model and all 73 EPA models (2026-10-21)."],
  defects: ["Fourteen defects, found and fixed", "The register keeps the code as it stood when each bug was live. Colour shows who found it."],
};
function render(id, p) { return F[id](p || id); }
module.exports = { render, META, ids: Object.keys(META) };
