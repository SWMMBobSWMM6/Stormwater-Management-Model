#!/usr/bin/env node
// out-diff.js — measure how far two SWMM5 .out results files actually
// diverge, element by element, instead of trusting the continuity line.
//
//   node out-diff.js A.out B.out [--floor 1] [--node-floor 0.001]
//                                 [--all-links] [--csv per-element.csv] [--json]
//
// What it does (the recipe from Wiesner-Friedman, "Exact and user-defined
// cross-section geometry for SWMM", HydroCouple, Aug 2026):
//   * every reporting period, never a subsample
//   * per element, normalised to THAT element's own peak in A
//   * elements whose peak sits below a magnitude floor are dropped first,
//     so a tiny denominator cannot manufacture a 400% divergence
//   * two numbers per element: worst instant (max |A-B| / peakA) and
//     time-averaged (mean |A-B| / peakA)
//   * the change in the PEAK itself is reported separately, because a
//     shift in hydrograph timing/shape under an unchanged peak is a
//     different finding from a rescaled answer
//   * the distribution is reported (fraction > 1 / 10 / 25 %, median, p90),
//     never a single network-wide average
//   * conduits only by default: pumps, orifices, weirs and outlets follow
//     the conduits in link order and answer a different question
//
// Controls it runs before saying anything:
//   * byte-identical files → says so and stops (the null-effect control)
//   * mismatched element sets or period counts → refuses to compare
//
// Floor: --floor is in the file's own flow units; default is 1 L/s
// converted (CFS 0.0353147, GPM 15.8503, MGD 0.0228245, CMS 0.001, LPS 1,
// MLD 0.0864). --node-floor is a peak-depth floor in ft or m (default 0.001).
//
// Verified 2026-09-01 against EPA SWMM 5.2.4 built from source: Example1
// switched to DYNWAVE vs the same model with every conduit's n changed
// 0.010 → 0.013. Routing continuity moved −0.075% → −0.069% ("nothing
// happened"); this script reported 3 of 13 conduits diverging > 10% of own
// peak (max 22.3%, conduit 6) and 12 of 14 node depths > 10% (max 73.5%).
// Here the peak-change row equals the worst-instant row: a roughness change
// RESCALES the answer, which is the opposite signature from her geometry
// change, and the script tells the two apart. A vs a repeat run of A:
// byte-identical, reported as such.

'use strict';
const fs = require('fs');

const MAGIC = 516114522;
const FLOW_UNIT_NAMES = ['CFS', 'GPM', 'MGD', 'CMS', 'LPS', 'MLD'];
const ONE_LPS_IN = [0.0353147, 15.8503, 0.0228245, 0.001, 1, 0.0864];
const LINK_TYPES = ['CONDUIT', 'PUMP', 'ORIFICE', 'WEIR', 'OUTLET'];

function readOut(path) {
  const buf = fs.readFileSync(path);
  let p = 0;
  const i32 = () => { const v = buf.readInt32LE(p); p += 4; return v; };
  const f32 = () => { const v = buf.readFloatLE(p); p += 4; return v; };
  const f64 = () => { const v = buf.readDoubleLE(p); p += 8; return v; };
  const str = () => { const n = i32(); const s = buf.toString('latin1', p, p + n); p += n; return s; };

  const magic = i32();
  if (magic !== MAGIC) throw new Error(`${path}: not a SWMM .out file (magic ${magic})`);
  const version = i32();
  const flowUnits = i32();
  const nSub = i32(), nNode = i32(), nLink = i32(), nPoll = i32();

  const subIds = [], nodeIds = [], linkIds = [], pollIds = [];
  for (let i = 0; i < nSub; i++) subIds.push(str());
  for (let i = 0; i < nNode; i++) nodeIds.push(str());
  for (let i = 0; i < nLink; i++) linkIds.push(str());
  for (let i = 0; i < nPoll; i++) pollIds.push(str());
  for (let i = 0; i < nPoll; i++) i32();               // pollutant units

  // property tables
  const nSubProps = i32(); for (let i = 0; i < nSubProps; i++) i32();
  p += 4 * nSubProps * nSub;
  const nNodeProps = i32(); for (let i = 0; i < nNodeProps; i++) i32();
  const nodeType = new Array(nNode);
  for (let i = 0; i < nNode; i++) { nodeType[i] = f32(); p += 4 * (nNodeProps - 1); }
  const nLinkProps = i32(); for (let i = 0; i < nLinkProps; i++) i32();
  const linkType = new Array(nLink);
  for (let i = 0; i < nLink; i++) { linkType[i] = f32(); p += 4 * (nLinkProps - 1); }

  // variable counts (read them; do not assume 8/6/5/15)
  const nSubVars = i32(); p += 4 * nSubVars;
  const nNodeVars = i32(); p += 4 * nNodeVars;
  const nLinkVars = i32(); p += 4 * nLinkVars;
  const nSysVars = i32(); p += 4 * nSysVars;

  const startDate = f64();
  const reportStep = i32();

  // closing record
  const tail = buf.length - 24;
  const outputPos = buf.readInt32LE(tail + 8);
  const nPeriods = buf.readInt32LE(tail + 12);
  const errorCode = buf.readInt32LE(tail + 16);
  if (buf.readInt32LE(tail + 20) !== MAGIC) throw new Error(`${path}: closing magic missing`);

  const rec = 8 + 4 * (nSub * nSubVars + nNode * nNodeVars + nLink * nLinkVars + nSysVars);
  const nodeDepth = Array.from({ length: nNode }, () => new Float64Array(nPeriods));
  const linkFlow = Array.from({ length: nLink }, () => new Float64Array(nPeriods));
  for (let t = 0; t < nPeriods; t++) {
    let q = outputPos + t * rec + 8 + 4 * nSub * nSubVars;
    for (let i = 0; i < nNode; i++) { nodeDepth[i][t] = buf.readFloatLE(q); q += 4 * nNodeVars; }
    for (let i = 0; i < nLink; i++) { linkFlow[i][t] = buf.readFloatLE(q); q += 4 * nLinkVars; }
  }
  return { path, version, flowUnits, nSub, nNode, nLink, nPoll, subIds, nodeIds, linkIds,
           nodeType, linkType, nPeriods, reportStep, errorCode, nodeDepth, linkFlow, bytes: buf };
}

function perElement(a, b, peakFloor) {
  const n = a.length;
  let peakA = 0, peakB = 0;
  for (let t = 0; t < n; t++) { peakA = Math.max(peakA, Math.abs(a[t])); peakB = Math.max(peakB, Math.abs(b[t])); }
  if (peakA < peakFloor) return null;
  let worst = 0, sum = 0, tWorst = -1;
  for (let t = 0; t < n; t++) {
    const d = Math.abs(a[t] - b[t]);
    sum += d;
    if (d > worst) { worst = d; tWorst = t; }
  }
  return { peakA, peakB, worstInstant: worst / peakA, timeAveraged: sum / n / peakA,
           peakChange: (peakB - peakA) / peakA, maxAbs: worst, tWorst };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function dist(vals) {
  const s = vals.slice().sort((x, y) => x - y);
  const frac = th => vals.filter(v => v > th).length / (vals.length || 1);
  return { n: vals.length, gt1: frac(0.01), gt10: frac(0.10), gt25: frac(0.25),
           median: quantile(s, 0.5), p90: quantile(s, 0.9), max: s[s.length - 1] };
}
const pct = v => (100 * v).toFixed(2) + '%';

function main() {
  const args = process.argv.slice(2);
  const files = args.filter(a => !a.startsWith('--') && !/^[0-9.]+$/.test(a) && !a.endsWith('.csv'));
  if (files.length !== 2) { console.error('usage: node out-diff.js A.out B.out [--floor F] [--node-floor D] [--all-links] [--csv file] [--json]'); process.exit(2); }
  const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
  const allLinks = args.includes('--all-links');
  const json = args.includes('--json');
  const csvPath = opt('--csv', null);

  const A = readOut(files[0]), B = readOut(files[1]);

  // control 1: null effect
  if (A.bytes.equals(B.bytes)) {
    console.log(`BYTE-IDENTICAL: ${files[0]} and ${files[1]} are the same ${A.bytes.length} bytes. Nothing to compare — this is what a null-effect control should print.`);
    process.exit(0);
  }
  // control 2: same question being asked
  const problems = [];
  if (A.nLink !== B.nLink || A.linkIds.some((id, i) => id !== B.linkIds[i])) problems.push('link sets differ');
  if (A.nNode !== B.nNode || A.nodeIds.some((id, i) => id !== B.nodeIds[i])) problems.push('node sets differ');
  if (A.nPeriods !== B.nPeriods) problems.push(`period counts differ (${A.nPeriods} vs ${B.nPeriods})`);
  if (A.reportStep !== B.reportStep) problems.push(`report steps differ (${A.reportStep}s vs ${B.reportStep}s)`);
  if (A.flowUnits !== B.flowUnits) problems.push(`flow units differ (${FLOW_UNIT_NAMES[A.flowUnits]} vs ${FLOW_UNIT_NAMES[B.flowUnits]})`);
  if (problems.length) { console.error('REFUSED: ' + problems.join('; ') + '. Fix the inputs so the two runs answer the same question.'); process.exit(1); }
  if (A.errorCode || B.errorCode) console.log(`WARNING: engine error code A=${A.errorCode} B=${B.errorCode}`);

  const floor = parseFloat(opt('--floor', ONE_LPS_IN[A.flowUnits]));
  const nodeFloor = parseFloat(opt('--node-floor', 0.001));
  const units = FLOW_UNIT_NAMES[A.flowUnits];

  const linkRows = [], nodeRows = [];
  let linksConsidered = 0, linksSkippedType = 0, linksBelowFloor = 0;
  for (let i = 0; i < A.nLink; i++) {
    const ty = Math.round(A.linkType[i]);
    if (!allLinks && ty !== 0) { linksSkippedType++; continue; }
    linksConsidered++;
    const r = perElement(A.linkFlow[i], B.linkFlow[i], floor);
    if (!r) { linksBelowFloor++; continue; }
    linkRows.push({ id: A.linkIds[i], type: LINK_TYPES[ty] || ty, ...r });
  }
  let nodesBelowFloor = 0;
  for (let i = 0; i < A.nNode; i++) {
    const r = perElement(A.nodeDepth[i], B.nodeDepth[i], nodeFloor);
    if (!r) { nodesBelowFloor++; continue; }
    nodeRows.push({ id: A.nodeIds[i], ...r });
  }

  const summary = {
    A: files[0], B: files[1], engineVersionA: A.version, engineVersionB: B.version,
    flowUnits: units, periods: A.nPeriods, reportStepSeconds: A.reportStep,
    links: {
      considered: linksConsidered, skippedNonConduit: linksSkippedType, belowFloor: linksBelowFloor,
      floor: `${floor} ${units}`,
      worstInstant: dist(linkRows.map(r => r.worstInstant)),
      timeAveraged: dist(linkRows.map(r => r.timeAveraged)),
      peakChange: dist(linkRows.map(r => Math.abs(r.peakChange))),
      maxAbsFlowDiff: Math.max(0, ...linkRows.map(r => r.maxAbs)),
    },
    nodes: {
      considered: A.nNode, belowFloor: nodesBelowFloor, floor: `${nodeFloor} depth units`,
      worstInstant: dist(nodeRows.map(r => r.worstInstant)),
      timeAveraged: dist(nodeRows.map(r => r.timeAveraged)),
      peakChange: dist(nodeRows.map(r => Math.abs(r.peakChange))),
      maxAbsDepthDiff: Math.max(0, ...nodeRows.map(r => r.maxAbs)),
    },
  };

  if (csvPath) {
    const lines = ['kind,id,type,peakA,peakB,worst_instant_frac,time_averaged_frac,peak_change_frac,max_abs_diff,period_of_worst'];
    for (const r of linkRows) lines.push(['link', r.id, r.type, r.peakA, r.peakB, r.worstInstant, r.timeAveraged, r.peakChange, r.maxAbs, r.tWorst].join(','));
    for (const r of nodeRows) lines.push(['node', r.id, 'depth', r.peakA, r.peakB, r.worstInstant, r.timeAveraged, r.peakChange, r.maxAbs, r.tWorst].join(','));
    fs.writeFileSync(csvPath, lines.join('\n') + '\n');
  }
  if (json) { console.log(JSON.stringify(summary, null, 2)); return; }

  const D = (label, d) => `  ${label.padEnd(14)} n=${d.n}  >1%: ${pct(d.gt1).padStart(7)}  >10%: ${pct(d.gt10).padStart(7)}  >25%: ${pct(d.gt25).padStart(7)}  median ${pct(d.median)}  p90 ${pct(d.p90)}  max ${pct(d.max)}`;
  console.log(`A: ${files[0]}   B: ${files[1]}`);
  console.log(`engine ${A.version} vs ${B.version} · ${units} · ${A.nPeriods} periods @ ${A.reportStep}s · every period compared, none subsampled`);
  console.log(`\nLINKS (conduits${allLinks ? ' + all other link types' : ''}; ${linksSkippedType} non-conduit skipped; ${linksBelowFloor} below peak floor ${floor} ${units})`);
  console.log(`  each value is |A−B| as a fraction of that element's own peak in A`);
  console.log(D('worst instant', summary.links.worstInstant));
  console.log(D('time-averaged', summary.links.timeAveraged));
  console.log(D('|peak change|', summary.links.peakChange));
  console.log(`  largest single flow difference anywhere: ${summary.links.maxAbsFlowDiff.toPrecision(4)} ${units}`);
  console.log(`\nNODES (depth; ${nodesBelowFloor} below peak-depth floor ${nodeFloor})`);
  console.log(D('worst instant', summary.nodes.worstInstant));
  console.log(D('time-averaged', summary.nodes.timeAveraged));
  console.log(D('|peak change|', summary.nodes.peakChange));
  console.log(`  largest single depth difference anywhere: ${summary.nodes.maxAbsDepthDiff.toPrecision(4)} depth units`);
  console.log(`\nRead it her way: if the peak-change row is small while the worst-instant row is large, the answer was not rescaled — its timing and shape moved under an almost unchanged peak, which the continuity line cannot see.`);
}

main();
