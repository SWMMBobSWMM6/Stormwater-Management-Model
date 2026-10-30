// Figures and illustrations for "Thaw on the Thoth". Charts read storydata.json
// (real runs of the Thoth model); diagrams and paintings say so in their captions.
const fs = require("fs");
const D = JSON.parse(fs.readFileSync(__dirname + "/storydata.json", "utf8"));
const OUT = __dirname + "/figs"; fs.mkdirSync(OUT, { recursive: true });

const C = { ink: "#1f2937", dim: "#4b5563", faint: "#6b7280", grid: "#e5e7eb", frame: "#cbd5e1", face: "#ffffff",
  earth: "#2563eb", mars: "#c2410c", green: "#15803d", violet: "#7c3aed", gray: "#6b7280",
  water: "#bfdbfe", water2: "#93c5fd", ground: "#e7c8a8", rust: "#b45309", levee: "#d6a77a", danger: "#b91c1c" };
const FONT = "font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif";
const r2 = (x) => Math.round(x * 100) / 100;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const T = (x, y, s, o = {}) => `<text x="${r2(x)}" y="${r2(y)}" font-size="${o.fs || 13}" fill="${o.fill || C.ink}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.weight ? ` font-weight="${o.weight}"` : ""}${o.italic ? ' font-style="italic"' : ""}${o.rot ? ` transform="rotate(${o.rot} ${r2(x)} ${r2(y)})"` : ""}>${s}</text>`;
const line = (x1, y1, x2, y2, st, w = 1, dash) => `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${st}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const rect = (x, y, w, h, fill, o = {}) => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(Math.max(0, w))}" height="${r2(Math.max(0, h))}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ""}${o.rx ? ` rx="${o.rx}"` : ""}${o.op ? ` opacity="${o.op}"` : ""}/>`;
const path = (pts, st, w = 2, fill = "none", dash) => `<path d="${pts.map((p, i) => (i ? "L" : "M") + r2(p[0]) + "," + r2(p[1])).join("")}" stroke="${st}" stroke-width="${w}" fill="${fill}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const circ = (x, y, r, fill, o = {}) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ""}/>`;
const svg = (W, H, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" style="${FONT}"><rect width="${W}" height="${H}" fill="${C.face}"/>${body}</svg>`;
const arrowDefs = (id, col) => `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${col}"/></marker></defs>`;

function scale(a) {
  if (a.log) { const l0 = Math.log10(a.min), l1 = Math.log10(a.max); return (v) => (Math.log10(v) - l0) / (l1 - l0); }
  return (v) => (v - a.min) / (a.max - a.min);
}
function nice(min, max, n = 5) {
  const span = max - min, s0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(s0)));
  const st = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5);
  const o = []; for (let v = Math.ceil(min / st - 1e-9) * st; v <= max + 1e-9 * span; v += st) o.push(Math.abs(v) < 1e-12 ? 0 : v); return o;
}
const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toString());
function plot(o) {
  const { W, H, m } = o, x0 = m.l, y0 = m.t, w = W - m.l - m.r, h = H - m.t - m.b;
  const fx = scale(o.x), fy = scale(o.y), sx = (v) => x0 + fx(v) * w, sy = (v) => y0 + h - fy(v) * h;
  let s = rect(x0, y0, w, h, "#fcfcfd");
  for (const v of o.y.ticks || nice(o.y.min, o.y.max)) s += line(x0, sy(v), x0 + w, sy(v), C.grid) + T(x0 - 7, sy(v) + 4, (o.y.fmt || fmt)(v), { fs: 12, fill: C.faint, anchor: "end" });
  for (const v of o.x.ticks || nice(o.x.min, o.x.max)) s += (o.gridX === false ? "" : line(sx(v), y0, sx(v), y0 + h, C.grid)) + T(sx(v), y0 + h + 17, (o.x.fmt || fmt)(v), { fs: 12, fill: C.faint, anchor: "middle" });
  s += rect(x0, y0, w, h, "none", { stroke: C.frame });
  s += o.body(sx, sy, { x0, y0, w, h });
  if (o.x.label) s += T(x0 + w / 2, y0 + h + 38, o.x.label, { fs: 13, fill: C.dim, anchor: "middle" });
  if (o.y.label) s += T(16, y0 + h / 2, o.y.label, { fs: 13, fill: C.dim, anchor: "middle", rot: -90 });
  return s;
}
const legend = (items, x, y, gap = 20) => items.map((it, i) => (it.box ? rect(x, y + i * gap - 10, 16, 12, it.col) : line(x, y + i * gap - 4, x + 24, y + i * gap - 4, it.col, it.w || 2.5, it.dash)) + T(x + 32, y + i * gap, it.label, { fs: 13 })).join("");
const title = (s, sub) => T(24, 30, s, { fs: 16, weight: 700 }) + (sub ? T(24, 50, sub, { fs: 13, fill: C.dim }) : "");

const F = {};

// ===================================================================== paintings (illustrations)
F.dawn = () => {
  const W = 760, H = 430;
  let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9c2a0"/><stop offset="0.55" stop-color="#f0cfae"/><stop offset="1" stop-color="#f6dcc0"/></linearGradient>
  <radialGradient id="sunglow" cx="0.18" cy="0.5" r="0.22"><stop offset="0" stop-color="#cfe3f5" stop-opacity="0.95"/><stop offset="0.5" stop-color="#b8d2ea" stop-opacity="0.45"/><stop offset="1" stop-color="#b8d2ea" stop-opacity="0"/></radialGradient>
  <linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a5e"/><stop offset="1" stop-color="#9e5a33"/></linearGradient>
  <linearGradient id="wat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ab7d4"/><stop offset="1" stop-color="#3f6a96"/></linearGradient></defs>`;
  s += rect(0, 0, W, H, "url(#sky)") + rect(0, 0, W, H, "url(#sunglow)");
  s += circ(140, 212, 16, "#eef6ff", {}) .replace("/>", ' opacity="0.55"/>') + circ(140, 212, 8, "#ffffff");                                   // the small sun, low
  s += `<path d="M560,70 q10,-7 18,-1 q6,6 -2,11 q-9,5 -16,-1 z" fill="#d9b9a0" stroke="#b98d70" stroke-width="1"/>`; // Phobos
  s += circ(468, 52, 1.8, "#efe2d4");                                  // Deimos, a bright point
  // mesas
  s += `<path d="M0,250 L60,242 L80,226 L150,226 L170,244 L260,246 L290,232 L340,232 L356,246 L470,248 L500,236 L560,236 L580,249 L760,250 L760,270 L0,270 z" fill="#b97a56" opacity="0.75"/>`;
  s += `<path d="M0,262 L120,258 L200,252 L240,240 L300,240 L330,256 L520,258 L600,246 L650,246 L690,258 L760,260 L760,282 L0,282 z" fill="#a8663f" opacity="0.85"/>`;
  s += rect(0, 268, W, H - 268, "url(#gnd)");
  // the canal running to the horizon, roofed: banks, water, roof ribs
  const vx = 352, vy = 262;
  s += `<path d="M${vx - 4},${vy} L${vx + 4},${vy} L470,${H} L196,${H} z" fill="#d9a678"/>`;            // embankments
  s += `<path d="M${vx - 2},${vy} L${vx + 2},${vy} L430,${H} L236,${H} z" fill="url(#wat)"/>`;          // water
  for (let k = 1; k <= 12; k++) { const f = Math.pow(k / 12, 2.2), y = vy + (H - vy) * f, hw = 4 + (117 * f); s += line(vx - hw - 6 * f, y, vx + hw + 6 * f, y, "#eef6ff", 0.6 + 1.6 * f) ; }
  s += line(vx, vy, 236, H, "#eef6ff", 1.2) + line(vx, vy, 430, H, "#eef6ff", 1.2);
  // the road causeway crossing the canal in the middle distance
  s += `<path d="M150,318 L560,312 L562,320 L150,327 z" fill="#8c5634"/>` + line(150, 318, 560, 312, "#e9cfb4", 1);
  // the colony at right: basin, domes, pump house, mast
  s += `<ellipse cx="610" cy="372" rx="128" ry="24" fill="url(#wat)" opacity="0.95"/>` + `<ellipse cx="610" cy="372" rx="128" ry="24" fill="none" stroke="#d9a678" stroke-width="5"/>`;
  for (const [x, y, r] of [[655, 336, 34], [706, 344, 24], [598, 342, 20], [742, 350, 16]]) {
    s += `<path d="M${x - r},${y} A${r},${r} 0 0 1 ${x + r},${y} z" fill="#e8eef3" stroke="#9fb3c4" stroke-width="1.5"/>`;
    s += line(x - r * 0.6, y - r * 0.55, x + r * 0.6, y - r * 0.55, "#b9cad8", 1) + line(x, y - r, x, y, "#b9cad8", 1);
  }
  s += rect(520, 338, 40, 22, "#7b4a2c") + rect(526, 343, 8, 6, "#ffd58a") + rect(540, 343, 8, 6, "#ffd58a");
  s += line(690, 300, 690, 336, "#5b3a26", 2) + line(682, 306, 698, 306, "#5b3a26", 1.5) + circ(690, 298, 2.5, "#ff6b4a");
  // foreground stones
  for (const [x, y, w] of [[60, 400, 26], [110, 412, 14], [520, 410, 20], [700, 414, 30]]) s += `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * 0.35}" fill="#7d4325" opacity="0.8"/>`;
  return svg(W, H, s, "Dawn over the Thoth Canal");
};

F.clerk = () => {
  const W = 760, H = 430;
  let s = `<defs><radialGradient id="lamp" cx="0.5" cy="0.15" r="0.75"><stop offset="0" stop-color="#3a3f4f"/><stop offset="1" stop-color="#14161d"/></radialGradient>
  <radialGradient id="crt" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#0f2e1c"/><stop offset="1" stop-color="#061409"/></radialGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#5cff9a" stop-opacity="0.25"/><stop offset="1" stop-color="#5cff9a" stop-opacity="0"/></radialGradient></defs>`;
  s += rect(0, 0, W, H, "url(#lamp)");
  s += rect(0, 330, W, 100, "#1b1d24");
  // cabinets
  for (let i = 0; i < 4; i++) {
    const x = 24 + i * 92;
    s += rect(x, 70, 80, 262, "#2a2e39", { stroke: "#3c4252" });
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
      const on = ((i * 7 + r * 3 + c * 5) % 4) === 0;
      s += rect(x + 10 + c * 13, 88 + r * 14, 6, 5, on ? (r % 3 ? "#ffb347" : "#7dff9e") : "#4a4f5e");
    }
    s += circ(x + 26, 250, 15, "#1d2029", { stroke: "#4a4f5e", sw: 2 }) + circ(x + 56, 250, 15, "#1d2029", { stroke: "#4a4f5e", sw: 2 });
    s += line(x + 26, 250, x + 36, 243, "#6a7183", 2) + line(x + 56, 250, x + 48, 258, "#6a7183", 2);
  }
  // the terminal
  s += rect(440, 150, 250, 180, "#30343f", { rx: 10 }) + rect(456, 164, 218, 140, "url(#crt)", { rx: 14 });
  s += `<ellipse cx="565" cy="234" rx="140" ry="100" fill="url(#glow)"/>`;
  const L = ["// consts.h", "#define GRAVITY  32.2", "#define PHI      1.486", "", "> RUN THOTH.INP", "  ROUTING STEP 0.27 SEC", "  ELAPSED  02:51:07 ..."];
  L.forEach((t, i) => { s += `<text x="468" y="${186 + i * 17}" font-size="12.5" font-family="ui-monospace,Menlo,Consolas,monospace" fill="${i === 1 ? "#d7ffe4" : "#5cff9a"}"${i === 1 ? ' font-weight="700"' : ""}>${esc(t)}</text>`; });
  s += rect(464, 190, 196, 18, "none", { stroke: "#ffd166", sw: 1.5 });
  s += rect(470, 330, 190, 14, "#3a3f4b", { rx: 3 });
  // two boys, silhouettes: one seated pointing, one standing with a slide rule
  s += `<path d="M560,430 L560,372 Q560,348 584,346 L606,346 Q628,348 630,372 L630,430 z" fill="#0b0c10"/>` + circ(595, 326, 19, "#0b0c10");
  s += `<path d="M598,352 L640,300 L648,306 L610,360 z" fill="#0b0c10"/>`;
  s += `<path d="M380,430 L384,350 Q388,322 414,320 L440,320 Q464,324 466,352 L470,430 z" fill="#0d0e13"/>` + circ(426, 298, 21, "#0d0e13");
  s += `<path d="M452,346 L506,360 L504,368 L450,356 z" fill="#0d0e13"/>` + rect(470, 352, 70, 7, "#c9b48a", { op: 0.85 });
  return svg(W, H, s, "Two boys at the colony computer, the Clerk");
};

F.gate = () => {
  const W = 760, H = 430;
  let s = `<defs><linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0b1e"/><stop offset="1" stop-color="#2a1d3a"/></linearGradient>
  <linearGradient id="jet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fb6dc"/><stop offset="1" stop-color="#dff0ff"/></linearGradient>
  <radialGradient id="lant" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>`;
  s += rect(0, 0, W, H, "url(#night)");
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) { const x = rnd() * W, y = rnd() * 220; s += circ(x, y, rnd() < 0.15 ? 1.4 : 0.8, "#f1ecff"); }
  s += `<path d="M612,64 a22,22 0 1,0 16,38 a17,17 0 1,1 -16,-38 z" fill="#efe4d6"/>`;    // Phobos crescent
  s += circ(150, 54, 2.2, "#fff6e0");                                                  // Deimos
  s += `<path d="M0,250 L760,236 L760,430 L0,430 z" fill="#3a2433"/>`;
  // the canal coming in from the left
  s += `<path d="M0,268 L330,262 L330,318 L0,330 z" fill="#27476b"/>` + line(0, 268, 330, 262, "#6d8db0", 1.5);
  // the gate structure: piers and a lifted leaf
  s += rect(326, 200, 30, 140, "#6f6676") + rect(446, 200, 30, 140, "#6f6676") + rect(318, 194, 166, 16, "#8a8191");
  s += rect(360, 216, 82, 40, "#4d4655", { stroke: "#9a90a2" });                          // the raised leaf
  s += rect(398, 166, 6, 28, "#8a8191") + circ(401, 150, 20, "none", { stroke: "#c9bfd2", sw: 4 }) + line(401, 130, 401, 170, "#c9bfd2", 3) + line(381, 150, 421, 150, "#c9bfd2", 3);
  // the jet through the gate into the Old Canal
  s += `<path d="M356,262 C430,262 470,272 520,300 C560,322 600,346 760,352 L760,392 C600,384 560,366 510,340 C470,318 430,300 356,300 z" fill="url(#jet)" opacity="0.92"/>`;
  for (let i = 0; i < 9; i++) s += path([[380 + i * 40, 280 + i * 6], [400 + i * 40, 284 + i * 7]], "#ffffff", 1.4);
  // the dry old channel's stone walls
  s += path([[470, 280], [560, 302], [640, 326], [760, 338]], "#8d7b6c", 3) + path([[470, 330], [560, 366], [640, 386], [760, 404]], "#8d7b6c", 3);
  // three figures cranking, a lantern
  const fig = (x) => circ(x, 136, 8, "#09070f") + `<path d="M${x - 10},194 L${x - 8},150 Q${x},144 ${x + 8},150 L${x + 10},194 z" fill="#09070f"/>`;
  s += fig(356) + line(362, 156, 383, 142, "#09070f", 4) + line(362, 162, 382, 160, "#09070f", 4);
  s += fig(446) + line(440, 156, 419, 158, "#09070f", 4) + line(440, 162, 419, 142, "#09070f", 4);
  s += fig(486) + line(492, 160, 504, 172, "#09070f", 3);
  s += circ(506, 178, 42, "url(#lant)") + rect(501, 172, 10, 13, "#ffcf6e", { rx: 2 });
  return svg(W, H, s, "Night at the Old Canal gate");
};

// ===================================================================== diagrams
F.map = () => {
  const W = 760, H = 480;
  let s = title("The Thoth, from the Headworks to Colony Basin", "Schematic, not to scale. Mileposts from the Headworks.");
  s += rect(0, 64, W, H - 64, "#fbf6f0");
  const yU = 120, xU0 = 70, xU1 = 560, mile = (xU1 - xU0) / 8;
  s += line(xU0, yU, xU1, yU, C.earth, 9) + line(xU0, yU, xU1, yU, "#dbeafe", 3);
  s += circ(xU0, yU, 9, "#fff", { stroke: C.ink, sw: 2 }) + T(xU0 - 10, yU - 20, "Headworks", { fs: 13, weight: 600 }) + T(xU0, yU + 26, "thaw water in", { fs: 11.5, fill: C.dim, anchor: "middle" });
  for (let k = 1; k <= 8; k++) { s += line(xU0 + k * mile, yU - 8, xU0 + k * mile, yU + 8, C.ink, 1.2); if (k === 1 || k === 2 || k === 6) s += T(xU0 + k * mile, yU + 26, `mile ${k}`, { fs: 11.5, fill: C.faint, anchor: "middle" }); }
  s += T(xU0 + 2.5 * mile, yU - 16, "Upper Thoth, 8 miles", { fs: 12, fill: C.dim, anchor: "middle" });
  const xc = xU0 + 4 * mile;
  s += rect(xc - 4, yU - 26, 8, 52, "#8c5634") + T(xc + 12, yU - 32, "Causeway Culvert at mile 4", { fs: 13, weight: 600 }) + T(xc + 12, yU - 17, "10 ft long, under the road", { fs: 11.5, fill: C.dim });
  const cx1 = xU1 + 50, yL = 210;
  s += path([[xU1, yU], [cx1, yL]], C.earth, 9);
  s += T(cx1 + 14, yU + 38, "the Chute", { fs: 13, weight: 600 }) + T(cx1 + 14, yU + 53, "400 ft down the", { fs: 11.5, fill: C.dim }) + T(cx1 + 14, yU + 67, "escarpment, 20-ft drop", { fs: 11.5, fill: C.dim });
  const xL1 = 200, lm = (cx1 - xL1) / 6;
  s += line(cx1, yL, xL1, yL, C.earth, 9) + line(cx1, yL, xL1, yL, "#dbeafe", 3);
  for (let k = 1; k <= 6; k++) s += line(cx1 - k * lm, yL - 8, cx1 - k * lm, yL + 8, C.ink, 1.2);
  s += T((cx1 + xL1) / 2 + 30, yL - 16, "Lower Thoth: 6 miles", { fs: 12, fill: C.dim, anchor: "middle" });
  // Old Canal gate on the west bank at lower mile 6
  s += rect(xL1 - 22, yL - 8, 14, 16, C.mars);
  s += path([[xL1 - 22, yL], [120, yL + 34], [40, yL + 80]], C.mars, 5, "none", "8 6");
  s += T(24, yL + 104, "the Old Canal (dry),", { fs: 12, fill: C.mars }) + T(24, yL + 119, "west to the desert", { fs: 12, fill: C.mars });
  s += T(xL1 - 30, yL - 30, "Old Canal gate", { fs: 13, weight: 600, anchor: "end" }) + T(xL1 - 30, yL - 14, "8 x 20 ft, hand-cranked", { fs: 11.5, fill: C.dim, anchor: "end" });
  // last reach south into the basin, the Lock at its foot
  const bx = 360, by = 340;
  s += path([[xL1, yL], [xL1 + 40, yL + 40], [bx - 70, by - 46]], C.earth, 8);
  s += `<ellipse cx="${bx}" cy="${by}" rx="140" ry="50" fill="${C.water}" stroke="${C.levee}" stroke-width="8"/>`;
  s += rect(bx - 76, by - 52, 11, 11, C.violet) + T(bx - 58, by - 62, "the Lock and its 10-ft gate throat", { fs: 11.5, fill: C.dim });
  s += T(bx, by - 2, "Colony Basin", { fs: 14, weight: 700, anchor: "middle" }) + T(bx, by + 16, "34 acres, levee crest 14.5 ft", { fs: 12, fill: C.dim, anchor: "middle" });
  // town intake to the northeast, outlet to the east
  s += path([[bx + 120, by - 26], [560, 280], [700, 272]], C.green, 4) + T(740, 262, "town intake, 150 cfs, to Thoth Landing", { fs: 12, fill: C.green, anchor: "end" });
  s += path([[bx + 138, by + 8], [580, 372], [740, 378]], C.earth, 5) + T(740, 366, "Outlet Canal to the Sink", { fs: 12, fill: C.dim, anchor: "end" }) + T(520, 400, "overflow sill: 100 ft long, crest 8 ft", { fs: 11.5, fill: C.dim });
  for (let i = 0; i < 6; i++) s += `<path d="M${bx - 75 + i * 26},${by + 98} a11,11 0 0 1 22,0 z" fill="#e8eef3" stroke="#9fb3c4"/>`;
  s += T(bx, by + 118, "Lower Town greenhouses, below the levee", { fs: 12, fill: C.danger, anchor: "middle" });
  s += line(730, 130, 730, 92, C.ink, 2) + `<path d="M724,100 L730,86 L736,100 z" fill="${C.ink}"/>` + T(730, 146, "N", { fs: 13, weight: 700, anchor: "middle" });
  return svg(W, H, s, "Map of the Thoth canal system");
};

F.xsec = () => {
  const W = 760, H = 330;
  let s = title("Same canal, same flood, two answers", "The Upper Thoth at mile 1 at the crest of the thaw: 4,200 cfs.");
  const ox = 380, oy = 270, sc = 13; // 1 ft = 13 px vertically; horizontal compressed
  const hx = (ft) => ox + ft * 4.6, vy = (ft) => oy - ft * sc;
  const bed = 40, z = 2, bank = 14;
  const pts = [[hx(-bed / 2 - z * bank - 14), vy(bank)], [hx(-bed / 2 - z * bank), vy(bank)], [hx(-bed / 2), vy(0)], [hx(bed / 2), vy(0)], [hx(bed / 2 + z * bank), vy(bank)], [hx(bed / 2 + z * bank + 14), vy(bank)]];
  const wl = (y) => `<path d="M${r2(hx(-bed / 2 - z * y))},${r2(vy(y))} L${r2(hx(-bed / 2))},${r2(vy(0))} L${r2(hx(bed / 2))},${r2(vy(0))} L${r2(hx(bed / 2 + z * y))},${r2(vy(y))} z" fill="${C.water}"/>`;
  s += wl(D.u1.mars) + path([[hx(-bed / 2 - z * D.u1.company), vy(D.u1.company)], [hx(bed / 2 + z * D.u1.company), vy(D.u1.company)]], C.earth, 2.5);
  s += path([[hx(-bed / 2 - z * D.u1.mars), vy(D.u1.mars)], [hx(bed / 2 + z * D.u1.mars), vy(D.u1.mars)]], C.mars, 2.5);
  s += `<path d="${pts.map((p, i) => (i ? "L" : "M") + r2(p[0]) + "," + r2(p[1])).join("")} L${r2(pts[5][0])},${oy + 26} L${r2(pts[0][0])},${oy + 26} z" fill="${C.ground}" fill-opacity="0.65" stroke="${C.rust}" stroke-width="2"/>`;
  s += wl(0.001);
  s += T(hx(bed / 2 + z * bank) + 18, vy(bank) - 6, "bank top, 14.0 ft", { fs: 13, fill: C.ink });
  s += T(ox, vy(D.u1.mars) + 20, `Mars constants: ${D.u1.mars.toFixed(2)} ft, half a foot below the bank top`, { fs: 13, fill: C.mars, weight: 600, anchor: "middle" });
  s += T(ox, vy(D.u1.company) + 20, `Company model (Earth constants): ${D.u1.company.toFixed(2)} ft`, { fs: 13, fill: C.earth, weight: 600, anchor: "middle" });
  s += T(ox, oy + 18, "40-ft bed, sides 2 to 1, lined; slope 1.6 ft per mile", { fs: 12, fill: C.dim, anchor: "middle" });
  return svg(W, H, s, "Canal cross-section with two water levels");
};

F.melt = () => {
  const W = 760, H = 320, m = D.melt.filter((p) => p[0] <= 96);
  let s = title("The thaw, as the Headworks reported it", "Flow entering the canal, cfs. Hour 0 is midnight, April 10, 2097, colony clock.");
  s += plot({ W, H, m: { l: 70, r: 24, t: 66, b: 52 },
    x: { min: 0, max: 96, ticks: [0, 12, 24, 36, 48, 60, 72, 84, 96], label: "hour" }, y: { min: 0, max: 4500, label: "flow (cfs)" },
    body: (sx, sy) => path(m.map(([h, q]) => [sx(h), sy(q)]), C.earth, 2.5) +
      line(sx(42), sy(0), sx(42), sy(4200), C.gray, 1, "4 4") + T(sx(42) + 8, sy(4200) - 6, "crest 4,200 cfs, hour 42", { fs: 13 }) +
      T(sx(4), sy(300) - 8, "base flow 300 cfs", { fs: 12, fill: C.dim }) });
  return svg(W, H, s, "Thaw hydrograph at the Headworks");
};

F.courant = () => {
  const W = 760, H = 400;
  const v = Object.entries(D.courant).sort((a, b) => a[1] - b[1]);
  const nm = { THROAT: "gate throat (10 ft)", CULVERT: "causeway culvert (10 ft)", INTAKE: "intake channel (300 ft)", CHUTE: "the Chute (400 ft)", LT7: "last reach to basin (600 ft)", OUTCAN: "outlet canal", OLDCAN: "Old Canal" };
  const rows = v.slice(0, 6).concat([["the other 14 reaches (1 mile)", Math.min(...v.filter(([k]) => /^(UT|LT)\d$/.test(k) && k !== "LT7").map(([, t]) => t))]]);
  let s = title("Two ten-foot openings set the clock for fifteen miles", "Each conduit's tightest Courant time in the Company model: 0.75 L / (v + c), seconds.");
  s += plot({ W, H, m: { l: 230, r: 60, t: 70, b: 74 }, gridX: true,
    x: { min: 0.1, max: 1000, log: true, ticks: [0.1, 1, 10, 100, 1000], fmt: (x) => x < 1 ? "0.1" : fmt(x), label: "seconds (log scale)" }, y: { min: 0, max: rows.length, ticks: [] },
    body: (sx, sy) => rows.map(([k, t], i) => { const y = sy(rows.length - i - 0.5), col = t < 1 ? C.mars : C.earth;
      return rect(sx(0.1), y - 11, sx(t) - sx(0.1), 22, col) + T(222, y + 4, nm[k] || k, { fs: 13, anchor: "end" }) + T(sx(t) + 6, y + 4, `${t < 1 ? t.toFixed(2) : t.toFixed(1)} s`, { fs: 13 }); }).join("") +
      line(sx(30), sy(rows.length), sx(30), sy(0), C.gray, 1.2, "5 4") + T(sx(30) + 6, sy(rows.length) + 14, "routing step allowed: 30 s", { fs: 12, fill: C.dim }) });
  s += T(230, H - 10, `Average step the Company run actually took: ${D.co_avgstep} s.`, { fs: 13, fill: C.ink });
  return svg(W, H, s, "Courant time of each conduit");
};

F.waves = () => {
  const W = 760, H = 330;
  const ys = []; for (let y = 0.25; y <= 14.01; y += 0.25) ys.push(y);
  const c = (g, y) => Math.sqrt(g * ((40 + 2 * y) * y) / (40 + 4 * y));
  let s = title("On Mars a wave in the canal travels 0.62 times as fast", "Gravity wave speed c = sqrt(g A / T) in the Thoth's section. Computed, not a run.");
  s += plot({ W, H, m: { l: 70, r: 24, t: 66, b: 52 }, x: { min: 0, max: 14, ticks: [0, 2, 4, 6, 8, 10, 12, 14], label: "depth (ft)" }, y: { min: 0, max: 20, label: "wave speed (ft/s)" },
    body: (sx, sy) => path(ys.map((y) => [sx(y), sy(c(32.2, y))]), C.earth, 2.5) + path(ys.map((y) => [sx(y), sy(c(12.2, y))]), C.mars, 2.5) +
      T(sx(1.2), sy(16.5), "Earth, g = 32.2 ft/s²: 15.5 ft/s at 10 ft deep", { fs: 13, fill: C.earth, weight: 600 }) +
      T(sx(6.5), sy(4.2), "Mars, g = 12.2 ft/s²: 9.6 ft/s at 10 ft deep", { fs: 13, fill: C.mars, weight: 600 }) });
  return svg(W, H, s, "Wave speed against depth under two gravities");
};

F.ring = () => {
  const W = 760, H = 370, b = D.ring_Bs.L6, cc = D.ring_Cs.L6;
  let s = title("Change gravity alone and the lower canal rings", "Depth at lower mile 6, just above the basin. Two runs of the stock engine built with Mars gravity.");
  s += plot({ W, H, m: { l: 70, r: 24, t: 66, b: 104 }, x: { min: 28, max: 52, ticks: [28, 32, 36, 40, 44, 48, 52], label: "hour" }, y: { min: 6, max: 15, label: "depth (ft)" },
    body: (sx, sy) => line(sx(28), sy(14), sx(52), sy(14), C.danger, 1.2, "5 4") + T(sx(28.4), sy(14) - 6, "bank top 14 ft", { fs: 12, fill: C.danger }) +
      path(b[0].map((t, i) => [sx(t), sy(b[1][i])]), C.violet, 1.8) + path(cc[0].map((t, i) => [sx(t), sy(cc[1][i])]), C.mars, 2.5) });
  s += legend([{ col: C.violet, label: "Mars gravity, Earth's n and weir coefficient: swings 7.5 to 14 ft, up to the bank top" }, { col: C.mars, label: "Mars gravity, n and weir coefficient corrected: smooth, and brimful with the gate shut" }], 74, H - 30, 20);
  return svg(W, H, s, "Lower canal depth: gravity alone vs fully corrected");
};

F.manning = () => {
  const W = 760, H = 360;
  const q = (y, n) => { const A = (40 + 2 * y) * y, P = 40 + 2 * y * Math.sqrt(5), R = A / P; return 1.486 / n * A * Math.pow(R, 2 / 3) * Math.sqrt(0.0003); };
  const ys = []; for (let y = 0.2; y <= 14.001; y += 0.2) ys.push(y);
  let s = title("Manning's n had Earth's gravity hidden inside it", "Normal-flow rating of the Upper Thoth, slope 0.0003. Computed from Manning's formula, not a run.");
  s += plot({ W, H, m: { l: 70, r: 30, t: 70, b: 52 }, x: { min: 0, max: 8000, ticks: [0, 2000, 4000, 6000, 8000], label: "flow (cfs)" }, y: { min: 0, max: 16, ticks: [0, 5, 10, 15], label: "depth (ft)" },
    body: (sx, sy) => line(sx(0), sy(14), sx(8000), sy(14), C.danger, 1.2, "5 4") + T(sx(150), sy(14) - 6, "bank top 14 ft", { fs: 12, fill: C.danger }) +
      line(sx(4200), sy(0), sx(4200), sy(15), C.gray, 1.2, "4 4") + T(sx(4200) + 6, sy(1.2), "thaw crest 4,200 cfs", { fs: 12, fill: C.dim }) +
      path(ys.map((y) => [sx(q(y, 0.015)), sy(y)]), C.earth, 2.5) + path(ys.map((y) => [sx(q(y, 0.02437)), sy(y)]), C.mars, 2.5) +
      circ(sx(7213), sy(14), 5, C.earth) + T(sx(7213) - 10, sy(14) - 10, "7,213 cfs bank-full", { fs: 12.5, fill: C.earth, anchor: "end", weight: 600 }) +
      circ(sx(4439), sy(14), 5, C.mars) + T(sx(4439) - 10, sy(14) - 10, "4,439 cfs bank-full", { fs: 12.5, fill: C.mars, weight: 600, anchor: "end" }) +
      T(sx(5600), sy(9.0), "n = 0.015, the handbook value", { fs: 13, fill: C.earth }) + T(sx(5600), sy(9.0) + 16, "(true only where g = 32.2)", { fs: 12, fill: C.dim }) +
      T(sx(1700), sy(11.6), "n = 0.0244 on Mars", { fs: 13, fill: C.mars, anchor: "middle" }) + T(sx(1700), sy(11.6) + 16, "(0.015 x 1.62)", { fs: 12, fill: C.dim, anchor: "middle" }) });
  return svg(W, H, s, "Rating curves with Earth and Mars Manning n");
};

F.uphill = () => {
  const W = 760, H = 450;
  const lh = D.uphill_lock_head, bh = D.uphill_basin_head;
  let s = arrowDefs("au", C.mars) + title("The model ran the water uphill", "Mars model with the gate throat as a finite-volume link (engine as built). Heads from the run's .out file.");
  const gx = (x) => 60 + x, gy = (z) => 300 - (z - 156) * 14;
  const lk = 158.28, bs = 165.95, crest = 171.64;
  // ground: lock floor, throat, basin floor, levee
  s += `<path d="M${gx(0)},${gy(157.64)} L${gx(250)},${gy(157.64)} L${gx(250)},${gy(157.14)} L${gx(600)},${gy(157.14)} L${gx(625)},${gy(crest)} L${gx(645)},${gy(crest)} L${gx(670)},${gy(156)} L${gx(0)},${gy(156)} z" fill="${C.ground}" stroke="${C.rust}" stroke-width="1.5"/>`;
  s += T(gx(635), gy(crest) - 8, "levee", { fs: 12, fill: C.dim, anchor: "middle" });
  s += rect(gx(0), gy(lk), 210, gy(157.64) - gy(lk), C.water2) + line(gx(0), gy(lk), gx(210), gy(lk), C.earth, 2);
  s += `<path d="M${gx(290)},${gy(bs)} L${gx(600 + 25 * (bs - 157.14) / (crest - 157.14))},${gy(bs)} L${gx(600)},${gy(157.14)} L${gx(290)},${gy(157.14)} z" fill="${C.water}"/>` + line(gx(290), gy(bs), gx(600 + 25 * (bs - 157.14) / (crest - 157.14)), gy(bs), C.earth, 2);
  s += rect(gx(210), gy(lk) + 1, 80, gy(157.14) - gy(lk) - 1, "#7fb2e5");
  s += T(gx(105), gy(lk) - 10, "the Lock: 0.63 ft deep", { fs: 13, weight: 600, anchor: "middle" });
  s += T(gx(445), gy(bs) - 10, "Colony Basin: 8.8 ft deep", { fs: 13, weight: 600, anchor: "middle" });
  s += T(gx(250), gy(156) + 18, "gate throat, 10 ft", { fs: 12, fill: C.dim, anchor: "middle" });
  // the lock level carried across, and the 7.7-ft rise
  s += line(gx(210), gy(lk), gx(560), gy(lk), C.gray, 1.2, "5 4");
  s += line(gx(540), gy(lk), gx(540), gy(bs), C.ink, 1.4) + line(gx(532), gy(lk), gx(548), gy(lk), C.ink, 1.4) + line(gx(532), gy(bs), gx(548), gy(bs), C.ink, 1.4);
  s += T(gx(532), (gy(lk) + gy(bs)) / 2 + 4, "7.7 ft uphill", { fs: 13, weight: 600, anchor: "end" });
  s += `<path d="M${gx(190)},${gy(lk) - 6} C${gx(240)},${gy(lk) - 40} ${gx(270)},${gy(bs) - 24} ${gx(330)},${gy(bs) + 18}" stroke="${C.mars}" stroke-width="3" fill="none" marker-end="url(#au)"/>`;
  s += T(gx(10), gy(lk) - 76, "the model pushed 300 cfs", { fs: 13, fill: C.mars, weight: 700 }) + T(gx(10), gy(lk) - 58, "uphill at 11.9 ft/s, hour 24", { fs: 13, fill: C.mars, weight: 700 });
  // inset: heads over the run
  const ix0 = 70, iy0 = 340, iw = 640, ih = 70;
  const tx = (t) => ix0 + t / 60 * iw, hy = (h) => iy0 + ih - (h - 156) / (174 - 156) * ih;
  s += rect(ix0, iy0, iw, ih, "#fcfcfd", { stroke: C.frame });
  s += path(bh[0].map((t, i) => [tx(t), hy(bh[1][i])]), C.earth, 2) + path(lh[0].map((t, i) => [tx(t), hy(lh[1][i])]), C.mars, 2);
  s += T(ix0 + 40, hy(166) - 6, "basin head", { fs: 12, fill: C.earth }) + T(ix0 + 40, hy(158.3) - 6, "lock head", { fs: 12, fill: C.mars });
  s += T(ix0 + iw, iy0 + ih + 18, "hours 0 to 60: the lock never rises to the basin, yet the throat runs toward the basin all along", { fs: 12, fill: C.dim, anchor: "end" });
  return svg(W, H, s, "Water running uphill through the gate throat");
};

F.runtime = () => {
  const W = 760, H = 330, t = D.timing;
  const rows = [["Company model (Earth, throat and culvert)", 13.84, C.gray], ["Mars model, stock dynamic wave", t.stock.median, C.earth],
    ["Mars model, culvert as FV, 4 cells", t.fv4.median, C.violet], ["Mars model, culvert as FV, 1 cell", t.fv1.median, C.mars]];
  const hm = (sec) => { const m = Math.round(sec * 1000 / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  let s = title("Nothing is free: four cells cost more than they saved", "Wall time of one 4-day run, median of interleaved runs on a modern machine. The Clerk was 1,000 times slower.");
  s += plot({ W, H, m: { l: 290, r: 150, t: 70, b: 52 }, x: { min: 0, max: 16, ticks: [0, 4, 8, 12, 16], label: "seconds on a modern machine" }, y: { min: 0, max: 4, ticks: [] },
    body: (sx, sy) => rows.map(([k, v, col], i) => { const y = sy(4 - i - 0.5);
      return rect(sx(0), y - 13, sx(v) - sx(0), 26, col) + T(282, y + 4, k, { fs: 13, anchor: "end" }) + T(sx(v) + 6, y + 4, `${v.toFixed(2)} s`, { fs: 13, weight: 600 }) + T(sx(v) + 64, y + 4, `Clerk: ${hm(v)}`, { fs: 12.5, fill: C.dim }); }).join("") });
  return svg(W, H, s, "Run times of the canal model");
};

F.forecast = () => {
  const W = 760, H = 410;
  const sr = (k) => D["basin_" + k];
  let s = title("The forecast at the levee", "Depth in Colony Basin. Levee crest 14.5 ft; above it, water spills into Lower Town.");
  s += plot({ W, H, m: { l: 70, r: 24, t: 66, b: 130 }, x: { min: 20, max: 72, ticks: [24, 36, 48, 60, 72], label: "hour (April 11 begins at hour 24)" }, y: { min: 8, max: 15, label: "basin depth (ft)" },
    body: (sx, sy) => rect(sx(38), sy(15), sx(52) - sx(38), sy(8) - sy(15), "#fde7d9", { op: 0.7 }) + T(sx(45), sy(8) - 10, "Old Canal gate open", { fs: 12, fill: C.mars, anchor: "middle" }) +
      line(sx(20), sy(14.5), sx(72), sy(14.5), C.danger, 1.6, "6 4") + T(sx(20.5), sy(14.5) - 6, "levee crest 14.5 ft", { fs: 12, fill: C.danger }) +
      path(sr("company")[0].map((t, i) => [sx(t), sy(sr("company")[1][i])]), C.earth, 2.2) +
      path(sr("mars_nospill")[0].map((t, i) => [sx(t), sy(sr("mars_nospill")[1][i])]), C.danger, 2.6) +
      path(sr("plan_stock")[0].map((t, i) => [sx(t), sy(sr("plan_stock")[1][i])]), C.gray, 4.5) +
      path(sr("plan_fv1")[0].map((t, i) => [sx(t), sy(sr("plan_fv1")[1][i])]), C.mars, 2.2) });
  s += legend([{ col: C.earth, label: "Company forecast (Earth constants): crest 13.3 ft at hour 44" },
    { col: C.danger, label: "Mars constants, gate shut: at the crest by hour 40.4; 134 million gallons over" },
    { col: C.mars, label: "Mars constants, gate open hours 38 to 52 (FV run): crest 13.98 ft at hour 54" },
    { col: C.gray, w: 4.5, label: "the same plan, stock dynamic wave: 13.99 ft (under the FV line)" }], 74, H - 64, 18);
  return svg(W, H, s, "Basin depth forecasts");
};

F.plans = () => {
  const W = 760, H = 380, S = D.scen;
  const plans = [["half38", "Half gate, 38 to 52", 853], ["full38c52", "Full gate, 38 to 52", 1443], ["full38", "Full gate, 38 to 56", 1830]];
  const cases = [["", "as forecast", C.earth], ["cw95", "sill 5 % weaker", C.violet], ["pk110", "thaw 10 % bigger", C.mars]];
  const val = (p, c) => c === "" ? S[`F_${p}_fv1`].ybmax : S[`H_${p}_${c}`].ybmax;
  let s = title("Margin is what you buy with water", "Basin crest for three gate plans, as forecast and under two doubts. Water spilled to the Old Canal in acre-feet.");
  s += plot({ W, H, m: { l: 70, r: 24, t: 70, b: 92 }, gridX: false, x: { min: -0.5, max: 2.5, ticks: [] }, y: { min: 13, max: 14.8, ticks: [13, 13.5, 14, 14.5], label: "basin crest (ft)" },
    body: (sx, sy, bx) => line(sx(-0.5), sy(14.5), sx(2.5), sy(14.5), C.danger, 1.6, "6 4") + T(sx(2.48), sy(14.5) - 6, "levee crest", { fs: 12, fill: C.danger, anchor: "end" }) +
      plans.map(([p, lab, af], i) => cases.map(([c, , col], j) => { const v = val(p, c), x = sx(i + (j - 1) * 0.26), w = (sx(1) - sx(0)) * 0.22;
        return rect(x - w / 2, sy(v), w, sy(13) - sy(v), col) + T(x, sy(v) - 5, v >= 14.5 ? "over" : v.toFixed(2), { fs: 12, anchor: "middle", weight: v >= 14.5 ? 700 : 400, fill: v >= 14.5 ? C.danger : C.ink }); }).join("") +
        T(sx(i), bx.y0 + bx.h + 18, lab, { fs: 13, anchor: "middle", weight: 600 }) + T(sx(i), bx.y0 + bx.h + 34, `${af.toLocaleString("en-US")} acre-ft spilled`, { fs: 12, anchor: "middle", fill: C.dim })).join("") });
  s += legend(cases.map(([, lab, col]) => ({ col, label: lab, box: true })), 80, H - 18, 0).replace(/x="(\d+(\.\d+)?)" y="(\d+(\.\d+)?)" width="16"/g, (m0) => m0);
  // spread the three legend items along one row
  return svg(W, H, s.replace(/<rect x="80" y="352" width="16" height="12" fill="#7c3aed"\/><text x="112" y="362"/, '<rect x="300" y="352" width="16" height="12" fill="#7c3aed"/><text x="332" y="362"').replace(/<rect x="80" y="352" width="16" height="12" fill="#c2410c"\/><text x="112" y="362"/, '<rect x="520" y="352" width="16" height="12" fill="#c2410c"/><text x="552" y="362"'), "Gate plans against uncertainty");
};

F.gateclock = () => {
  const W = 760, H = 330, S = D.scen;
  const rows = [37, 38, 39, 40, 41].map((h) => [h, S[h === 38 ? "F_full38_fv1" : `F_full${h}_fv1`].ybmax]);
  let s = title("The gate's deadline was hour 40", "Basin crest against the hour the Old Canal gate is fully open (full gate, closed at hour 56).");
  s += plot({ W, H, m: { l: 70, r: 24, t: 66, b: 52 }, x: { min: 36.5, max: 41.5, ticks: [37, 38, 39, 40, 41], label: "hour the gate is fully open" }, y: { min: 13.4, max: 14.7, ticks: [13.5, 14, 14.5], label: "basin crest (ft)" },
    body: (sx, sy) => line(sx(36.5), sy(14.5), sx(41.5), sy(14.5), C.danger, 1.6, "6 4") + T(sx(36.6), sy(14.5) - 6, "levee crest 14.5 ft", { fs: 12, fill: C.danger }) +
      path(rows.map(([h, v]) => [sx(h), sy(v)]), C.mars, 2.2) + rows.map(([h, v]) => circ(sx(h), sy(v), 6, v >= 14.5 ? C.danger : C.mars, { stroke: "#fff", sw: 2 }) + T(sx(h) + (h === 41 ? -10 : 10), sy(v) + (h === 41 ? -10 : 18), v >= 14.5 ? "over" : v.toFixed(2), { fs: 12.5, anchor: h === 41 ? "end" : "start", weight: 600 })).join("") });
  return svg(W, H, s, "Basin crest against gate opening hour");
};

F.fvcells = () => {
  const W = 760, H = 470;
  let s = arrowDefs("af", C.ink) + title("How the hybrid engine handles the culvert", "Diagram, not a run. Step sizes are the averages from the Mars runs.");
  // top: the stock engine
  s += T(24, 92, "Stock dynamic wave: one conduit, and its clock rules all fifteen miles", { fs: 14, weight: 700, fill: C.earth });
  const nd = (x, y, lab) => circ(x, y, 13, "#fff", { stroke: C.ink, sw: 2 }) + T(x, y + 32, lab, { fs: 12, fill: C.dim, anchor: "middle" });
  s += line(70, 140, 250, 140, C.earth, 8) + line(510, 140, 690, 140, C.earth, 8);
  s += rect(300, 122, 160, 36, C.water, { stroke: C.earth, sw: 2 }) + T(380, 145, "CULVERT, 10 ft", { fs: 12.5, anchor: "middle", weight: 600 });
  s += line(263, 140, 300, 140, C.earth, 4) + line(460, 140, 497, 140, C.earth, 4);
  s += nd(250, 140, "U4") + nd(510, 140, "U4X");
  s += T(70, 126, "a mile of canal", { fs: 12, fill: C.dim }) + T(690, 126, "a mile of canal", { fs: 12, fill: C.dim, anchor: "end" });
  s += T(380, 196, "Every node and conduit advances together: 0.59 s on average, set by the 10-ft culvert.", { fs: 13, anchor: "middle" });
  // bottom: the FV link
  s += line(24, 222, 736, 222, C.grid, 1);
  s += T(24, 254, "Hybrid: the culvert becomes cells with their own fast clock", { fs: 14, weight: 700, fill: C.mars });
  const y = 318, x0 = 300, cw = 40, n = 4;
  s += line(70, y, 250, y, C.earth, 8) + line(510, y, 690, y, C.earth, 8);
  s += line(263, y, x0 - 20, y, C.earth, 4) + line(x0 + n * cw + 20, y, 497, y, C.earth, 4);
  s += rect(x0 - 20, y - 18, 20, 36, "#fde7d9", { stroke: C.mars, sw: 1.5 }) + rect(x0 + n * cw, y - 18, 20, 36, "#fde7d9", { stroke: C.mars, sw: 1.5 });
  for (let i = 0; i < n; i++) s += rect(x0 + i * cw, y - 18, cw, 36, C.water, { stroke: C.mars, sw: 2 });
  for (let i = 0; i <= n; i++) s += line(x0 + i * cw, y - 30, x0 + i * cw, y - 20, C.mars, 2) ;
  s += nd(250, y, "U4") + nd(510, y, "U4X");
  s += T(380, y - 38, "faces: a Riemann flux at each", { fs: 12, fill: C.mars, anchor: "middle" });
  s += T(x0 - 10, y + 40, "ghost", { fs: 11.5, fill: C.mars, anchor: "middle" }) + T(x0 + n * cw + 10, y + 40, "ghost", { fs: 11.5, fill: C.mars, anchor: "middle" });
  s += T(380, y + 40, "cells (here 4)", { fs: 12, fill: C.dim, anchor: "middle" });
  s += T(380, 396, "The network steps 16.3 s on average. Inside each step the culvert runs 84 substeps with 1 cell,", { fs: 13, anchor: "middle" });
  s += T(380, 414, "or 335 with 4 (all solver passes counted), then hands its flow back to U4 and U4X.", { fs: 13, anchor: "middle" });
  s += T(380, 446, "A ghost cell borrows the node's water level. The engine as built also gave it the first cell's", { fs: 12.5, fill: C.dim, anchor: "middle" });
  s += T(380, 463, "velocity, and that pairing put energy into the water that was never there.", { fs: 12.5, fill: C.dim, anchor: "middle" });
  return svg(W, H, s, "Stock conduit versus finite-volume cells");
};

const ORDER = ["dawn", "map", "xsec", "melt", "courant", "clerk", "waves", "ring", "manning", "uphill", "fvcells", "runtime", "forecast", "plans", "gateclock", "gate"];
for (const id of ORDER) fs.writeFileSync(`${OUT}/${id}.svg`, F[id]());
console.log("wrote", ORDER.length, "svgs");
module.exports = { ORDER };
