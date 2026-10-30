// Builds "swmm524-fvlink: how it works" as a Word document.
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow,
  TableCell, WidthType, ShadingType, ImageRun, Footer, Header, PageNumber, LevelFormat,
  BorderStyle, PageBreak,
} = require("docx");

const FIG = "/home/claude/fvlink/docwork/";
const OUT = "/home/claude/fvlink/docwork/swmm524-fvlink-how-it-works.docx";
const BODY = "Arial", MONO = "Courier New", MATH = "Times New Roman";
const ACCENT = "1F4E8C", INK2 = "52514E";
const CONTENT_W = 9360;      // 6.5 in in DXA
let figNo = 0, tabNo = 0;

// ---------------------------------------------------------------- inline text
function runs(text, base = {}) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter((s) => s.length);
  return parts.map((p) => {
    if (p.startsWith("`")) return new TextRun({ text: p.slice(1, -1), font: MONO, size: 18, ...base });
    if (p.startsWith("**")) return new TextRun({ text: p.slice(2, -2), bold: true, ...base });
    return new TextRun({ text: p, ...base });
  });
}
const P = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120, line: 276 }, ...opts });
const BREAK_BEFORE = new Set(["1  What it does", "Appendix A  Defect register, with the code as it was", "Appendix B  Function reference for fvlink.c"]);
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)],
  pageBreakBefore: BREAK_BEFORE.has(text), spacing: { before: BREAK_BEFORE.has(text) ? 120 : 480, after: 200 } });
const H1n = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
const B = (text, level = 0) => new Paragraph({ numbering: { reference: "bullets", level }, children: runs(text), spacing: { after: 60, line: 264 } });
const N = (text, ref = "steps") => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(text), spacing: { after: 60, line: 264 } });
const EQ = (text, keep = false) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 120 }, keepNext: keep,
  children: [new TextRun({ text, font: MATH, italics: true, size: 22 })] });
const NOTE = (text) => new Paragraph({ children: runs(text, { color: INK2, size: 18 }), spacing: { after: 120 } });

function CODE(text) {
  const lines = text.replace(/\n$/, "").split("\n");
  return lines.map((ln, i) => new Paragraph({
    keepNext: i < lines.length - 1, keepLines: true,
    shading: { type: ShadingType.CLEAR, fill: "F3F3F1", color: "auto" },
    spacing: { before: i === 0 ? 80 : 0, after: i === lines.length - 1 ? 140 : 0, line: 240 },
    indent: { left: 144, right: 144 },
    children: [new TextRun({ text: ln.length ? ln : " ", font: MONO, size: 16 })],
  }));
}

function FIGURE(file, ratio, caption, widthPx = 600) {
  figNo += 1;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(FIG + file),
        transformation: { width: widthPx, height: Math.round(widthPx * ratio) } })] }),
    new Paragraph({ spacing: { after: 200 }, children: runs(`**Figure ${figNo}.** ${caption}`, { size: 18, color: INK2 }) }),
  ];
}

function TABLE(headers, rows, widths, caption) {
  tabNo += 1;
  const border = { style: BorderStyle.SINGLE, size: 4, color: "C9C8C3" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const mk = (txt, w, head) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders,
    shading: head ? { type: ShadingType.CLEAR, fill: "E8EEF6", color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: String(txt).split("\n").map((line) => new Paragraph({ spacing: { after: 0, line: 252 },
      children: runs(line, { size: 17, bold: head ? true : undefined }) })),
  });
  const out = [];
  if (caption) out.push(new Paragraph({ keepNext: true, spacing: { before: 120, after: 60 },
    children: runs(`**Table ${tabNo}.** ${caption}`, { size: 18, color: INK2 }) }));
  out.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => mk(h, widths[i], true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => mk(c, widths[i], false)) }))],
  }));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  return out;
}

// ---------------------------------------------------------------- content
const C = [];
const add = (...xs) => xs.forEach((x) => (Array.isArray(x) ? C.push(...x) : C.push(x)));

// ---- title page
add(
  new Paragraph({ spacing: { before: 2400, after: 120 }, children: [new TextRun({ text: "swmm524-fvlink", font: BODY, size: 56, bold: true, color: ACCENT })] }),
  new Paragraph({ spacing: { after: 360 }, children: [new TextRun({ text: "Finite-volume links inside SWMM5 dynamic wave routing: how it works", size: 30, color: "333333" })] }),
  new Paragraph({ spacing: { after: 80 }, children: runs("EPA SWMM 5.2.4 (tag `v5.2.4`, commit `7952ca8`) with `swmm524-fvlink.patch`", { size: 20 }) }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "Technical description  ·  SWMM Enablement  ·  October 2026", size: 20, color: INK2 })] }),
  new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: "US customary units throughout. Built and tested October 13–17, 2026.", size: 20, color: INK2 })] }),
  P("This document describes, from the input line to the report line, how the swmm524-fvlink branch of EPA SWMM 5.2.4 solves chosen conduits with an explicit finite-volume scheme while every other link and node stays on stock dynamic wave. It covers the input format, the code layout, the numerical scheme, the coupling at shared nodes, what the rest of SWMM sees, how mass and water quality close, the verification record, the defects found during the build, and what has not been shown. Section 14 states how AI was used to make the software and this document."),
);
add(new Paragraph({ spacing: { before: 360, after: 120 }, children: [new TextRun({ text: "Contents", bold: true, size: 24, color: ACCENT })] }));
[
  "1  What it does", "2  Why one link at a time", "3  Using it", "4  Architecture", "5  The finite-volume link",
  "6  Coupling to dynamic wave", "7  Starting and ending a run", "8  Mass balance and water quality",
  "9  Verification", "10  Defects found during the build", "11  Limits and open questions",
  "12  Fixed parameters", "13  Building it and the delivered files", "14  Use of AI",
  "Appendix A  Defect register, with the code as it was", "Appendix B  Function reference for fvlink.c",
].forEach((s) => add(new Paragraph({ spacing: { after: 40 }, indent: { left: 360 }, children: [new TextRun({ text: s, size: 20 })] })));

// ---- 1
add(H1("1  What it does"));
add(P("Stock SWMM5 dynamic wave routing carries one flow per conduit, computed from the heads at its two end nodes. The swmm524-fvlink branch lets a modeler pick individual conduits and solve them differently: each picked conduit is cut into cells, and the shallow water equations are marched across those cells with a shock-capturing finite-volume scheme. Nothing else in the network changes. Junctions, storage units, outfalls, pumps, weirs, orifices, outlets and all other conduits are computed exactly as in stock 5.2.4. Figure 1 shows the arrangement."));
add(P("The two methods meet at the nodes the FV link shares with the rest of the network. Each end of an FV link sees its node as a boundary state: the node's water surface and the adjacent cell's velocity. The volume of water that crosses each end of the link during a routing step is added to that node's continuity equation exactly, so the hand-off between the methods creates or loses no water. The one exception is a node surcharged under the EXTRAN method, whose head stock SWMM sets from the net flow rather than the volume (Section 6.6)."));
add(...FIGURE("fig1_profile.png", 0.5012, "An FV link between two dynamic wave nodes. The link's end faces treat J4 and J5 as ghost states, and the water through each end face is booked into that node's continuity."));
add(P("A modeler turns it on with one new input section:"));
add(CODE("[FV_LINKS]\n;;Link        Cells\nTW01290       40\nC4                  ; default: 25-ft cells, at least 4"));
add(TABLE(["What was measured", "Result"], [
  ["No [FV_LINKS] section: EPA's 73 regression models", "72 .out files byte-identical to stock; the 73rd stops with the same error in both engines"],
  ["Water stored in each FV link vs. water through its two ends", "agree to 2.7e-12 % or better in all 51 test runs"],
  ["Still pond, every conduit FV (slopes, an offset, 2 barrels, surcharge)", "largest flow 1.2e-11 cfs; no head drift at the .out file's precision"],
  ["Uniform 10-ft channel, 60 cfs, n 0.015, S 0.001", "FV reach 1.6592 ft vs Manning normal depth 1.6559 ft (+0.20 %)"],
  ["400-pipe tree whose 10-ft pipe pins the step at 1.14 s; that pipe FV", "about 0.18× stock wall time (0.17× to 0.19× across two timing sessions); dynamic wave step 9.89 s; every conduit's peak flow within 0.53 % and every node's peak depth within 0.80 %"],
  ["EPA user2, channel TW01290 FV", "stock swings to 1,921 cfs and −935 cfs; FV peaks at 449 cfs and never reverses; same net volume (+0.02 %)"],
], [4200, 5160], "Headline results. Section 9 gives the controls and the full record."));
add(P("The main limitation: the node at the upstream end of an FV link sits higher than in stock, by 0.12 ft to 0.40 ft in the test chain depending on the cell count. That excess is numerical and shrinks as cells are added (Section 9.5). Section 11 lists the rest."));

// ---- 2
add(H1("2  Why one link at a time"));
add(P("Dynamic wave routing in SWMM5 solves a momentum equation for each conduit using one flow and the two end heads. Two practical problems follow from that structure."));
add(B("**A short conduit sets the time step for the whole network.** With a variable step, the Courant condition is checked for every conduit that is carrying flow, and the shortest, fastest link wins. In the 400-pipe test tree, a single 10-ft pipe holds the average step at 1.14 s; without it the network runs at 9.87 s."));
add(B("**A conduit between two large surface areas can slosh.** With one flow and two heads, water can run back and forth from end to end, and the reported flow oscillates while continuity looks fine. EPA's user2 regression model shows this in channel TW01290 (Section 9.6)."));
add(P("A finite-volume conduit addresses both. It carries its own storage in its cells, takes as many internal substeps as it needs, and exchanges water with its end nodes through face fluxes. It costs more per conduit, however, so applying it to every conduit is expensive."));
add(P("OpenSWMM 6 offers finite volume as a global choice (`FLOW_ROUTING FV`). In the engine's develop branch (HydroCouple/openswmm.engine, commit `8dd7387`, still the head of develop on October 17, 2026), the option sets one routing model for the whole project, and the mesh builder meshes every conduit and stops the run if any conduit lacks real geometry. This branch makes the opposite choice: dynamic wave stays the routing model, and finite volume is applied only where a modeler asks for it, typically a few short links or a few links that misbehave."));

// ---- 3
add(H1("3  Using it"));
add(H2("3.1  The [FV_LINKS] section"));
add(P("Each line names one conduit and, optionally, its cell count:"));
add(CODE("[FV_LINKS]\n;;Link        Cells\nLinkID        <n>     ; n cells, a whole number from 1 to 100000\nLinkID                ; default mesh\nLinkID        *       ; default mesh"));
add(P("The default mesh is `ceil(L / 25 ft)` cells, never fewer than 4, where L is the length `link_getLength()` returns: the conduit's length, divided by the transect's meander factor for an irregular channel. Conduit lengthening (`LENGTHENING_STEP`) does not apply to an FV link, which keeps its true length and roughness, and the report's Adjusted/Actual Length column shows 1.00 for it (FVL-14). The 25-ft target is internal; in an SI project it is 7.62 m. The section may appear anywhere in the file. Listing the same link twice keeps the last line."));
add(H2("3.2  What can be an FV link"));
add(P("Validation runs with SWMM's other input checks, before the simulation starts. A rejected link stops the run with an error in the report, the same way any other input error does."));
add(TABLE(["Condition", "Error"], [
  ["Name is not a link in the model", "ERROR 209: undefined object"],
  ["Cell count is not a whole number from 1 to 100000 (or *)", "ERROR 211: invalid number"],
  ["Routing is not DYNWAVE", "ERROR 116"],
  ["Link is not a conduit, or is a DUMMY conduit", "ERROR 116"],
  ["Force main section, or a culvert code", "ERROR 116"],
  ["Flap gate on the conduit (a gated outfall is supported)", "ERROR 116"],
  ["Any entry, exit or average loss coefficient", "ERROR 116"],
  ["Seepage rate, max. flow limit, or a street inlet", "ERROR 116"],
  ["A pump or dummy conduit draws from either end node", "ERROR 116"],
], [6200, 3160], "Input checks for FV links."));
add(P("The ERROR 116 message reads: `FV link <ID> must be a non-dummy conduit under DYNWAVE routing, with no force main, culvert code, flap gate, losses, seepage, max. flow or street inlet, and no pump or dummy conduit drawing from its end nodes.`"));
add(P("The pump and dummy-conduit rule exists because those links take their flow from the node's total inflow, and dynamic wave totals that before the FV links are solved. Section 10 (FVL-6) explains how this was found."));
add(H2("3.3  Old engines and other programs"));
add(P("A file with an `[FV_LINKS]` section is not readable by stock SWMM 5.2.4: the unknown section header stops the run with ERROR 205 (`invalid keyword`) and no `.out` is written. That is the safe failure: an old engine cannot silently run the model without the FV links. The reverse also holds: any file stock 5.2.4 accepts should run on this branch with no change in results. On 72 of EPA's 73 regression models the `.out` file is byte-identical, and the 73rd stops with the same error in both engines. How the EPA SWMM GUI and third-party tools treat the section (keep it, drop it, or refuse the file) was not tested."));
add(H2("3.4  What the report adds"));
add(P("When at least one FV link exists, a table follows the Routing Time Step Summary. This one is from the 8-pipe test chain with conduit C4 flagged (`results/report_excerpts.txt`):"));
add(CODE(
"  **************************\n  Finite-Volume Link Summary\n  **************************\n\n" +
"                              Cell  Substeps  Substeps     Min   Volume      Floor\n" +
"                             Length   per      per Solve  Substep  Balance     Hits\n" +
"  Link               Cells    ft     Step       Max      sec     Err %\n" +
"  ---------------------------------------------------------------------------------\n" +
"  C4                    12    25.00       5.4         6   0.9084  3.1e-13        0"));
add(TABLE(["Column", "Meaning"], [
  ["Cells, Cell Length", "the mesh; length in project units"],
  ["Substeps per Step", "explicit substeps per dynamic wave routing step, summed over every Picard iteration that re-solved the link"],
  ["Substeps per Solve Max", "the most substeps any single solve needed"],
  ["Min Substep sec", "the smallest stability-limited substep seen; a substep cut short only to end exactly at the end of a routing step does not count"],
  ["Volume Balance Err %", "change in the link's stored volume minus the net volume that crossed its two end faces, as a percent of the larger of the inflow volume, initial volume and final volume"],
  ["Floor Hits", "substeps raised above their stability limit to the 0.001-s floor, or to the time left in the routing step when that is shorter; anything other than 0 deserves a look"],
], [2600, 6760], "Columns of the Finite-Volume Link Summary."));
add(P("If SWMM's own area function for a link's cross-section fell as depth rose (it can, for some irregular transects; see S5-DW4 in Section 10), a line after the table names the link and says how many of its 256 table depths were bridged."));

// ---- 4
add(H1("4  Architecture"));
add(H2("4.1  Where the code lives"));
add(P("All of the method is in one new file, `src/solver/fvlink.c` (1,403 lines). Eleven existing files receive short hooks. With no FV links each hook either is never reached or tests a flag that is false, so the stock code path runs unchanged."));
add(TABLE(["File", "Change"], [
  ["fvlink.c (new)", "input reader, validation, mesh and geometry builder, the subcycled solver, node coupling, result publishing, the report table"],
  ["dynwave.c", "skip FV links in the conduit momentum loop and its node bookkeeping; call fvlink_findFlows() after all other links; add the FV dQ/dH to sumdqdh; book the FV share of the node's volume change in setNodeDepth(); leave FV links out of the Courant step; call fvlink_initStep() and fvlink_endStep()"],
  ["flowrout.c", "call fvlink_init() after initLinks() under dynamic wave; call fvlink_close() on close"],
  ["project.c", "call fvlink_validate() during project validation; call fvlink_delete() on project close"],
  ["input.c", "send [FV_LINKS] lines to fvlink_readParams()"],
  ["stats.c", "call fvlink_report() after the routing time-step summary"],
  ["enums.h, keywords.c, text.h", "the new section name [FV_LINKS]"],
  ["error.h, error.txt", "ERROR 116 and its message"],
  ["funcs.h", "prototypes for the fvlink_ functions"],
], [2400, 6960], "Files changed by the patch."));
add(H2("4.2  The life of a run"));
[
  "**Input, pass 1.** The section header is recognized; `[FV_LINKS]` creates no objects.",
  "**Input, pass 2.** `fvlink_readParams()` records a cell count for each listed link (−1 for the default mesh). Links are already counted, so names resolve.",
  "**Validation.** `fvlink_validate()` applies the checks in Table 2 after SWMM has validated links and nodes, so offsets, slopes and reversed conduits are final.",
  "**Routing start.** `flowrout_init()` sets up dynamic wave as usual (node and link depths, volumes, initial flows) and then calls `fvlink_init()`, which builds every FV link's geometry table, mesh and initial state (Section 7).",
  "**Each routing step.** `dynwave_execute()` runs as in stock, with the hooks shown in Figure 2.",
  "**Report.** `fvlink_report()` writes the Finite-Volume Link Summary.",
  "**Close.** `fvlink_close()` frees the run-time arrays; `fvlink_delete()` frees the input table when the project closes, so repeated open and close cycles in one process start clean.",
].forEach((s) => add(N(s, "life")));
add(H2("4.3  One routing step"));
add(P("Figure 2 shows where the new code runs inside one dynamic wave step. The order matters: FV links are solved after every other link has added its flow to the nodes, because the FV solve needs each end node's inflow from everything else."));
add(FIGURE("fig2_step.png", 0.9235, "One dynamic wave routing step with the FV hooks. Blue boxes are new code; gray boxes are stock 5.2.4.", 560));

// ---- 5
add(H1("5  The finite-volume link"));
add(H2("5.1  Mesh"));
add(P("An FV link of length L with n cells has cells of length Δx = L / n. Each cell carries a flow area A and a flow Q per barrel; a multi-barrel conduit is solved once and its fluxes multiplied by the barrel count where they meet a node. The invert elevations at the two ends include the link offsets, and each cell's bed is the straight-line elevation at the cell center, constant across the cell. A conduit SWMM reversed because of adverse slope arrives already reversed, so the mesh runs in SWMM's own upstream-to-downstream order."));
add(H2("5.2  Equations solved"));
add(P("The scheme marches the section-averaged shallow water equations for a prismatic channel in conservation form:", { keepNext: true }));
add(EQ("∂A/∂t + ∂Q/∂x = 0", true));
add(EQ("∂Q/∂t + ∂(Q²/A + g·I₁(h))/∂x = − g·A·∂z/∂x − g·A·S_f"));
add(P("Here h is depth, z the bed elevation, g = 32.2 ft/s², I₁(h) the first moment of the flow area about the water surface (the integral of A from 0 to h), and S_f the Manning friction slope, S_f = n²·Q·|Q| / (1.486²·A²·R^(4/3)). The bed slope term is not discretized directly; it enters through the hydrostatic reconstruction at each face (Section 5.4), which is what keeps still water still."));
add(H2("5.3  Geometry closure"));
add(P("Every FV link builds its own table from SWMM's cross-section functions, so it works for every shape SWMM has, including irregular transects and street sections:"));
add(B("Area A(y) is taken from `xsect_getAofY()` at 256 equally spaced depths from 0 to full depth, and joined by straight lines."));
add(B("Width is the slope of that line in each segment, so width is exactly dA/dy everywhere."));
add(B("I₁ is integrated exactly from the straight-line area: within segment k, I₁ = I₁(y_k) + A_k·e + ½·W_k·e², with e the depth above y_k."));
add(B("Depth from area uses a binary search on the table and the exact linear inverse, so depth(area(h)) = h to round-off."));
add(B("Hydraulic radius is SWMM's `xsect_getRofY()` at the same depths, interpolated linearly."));
add(P("Above full depth the table continues with a constant width. For a closed shape that is a Preissmann slot of width T_s = g·A_full / c², with c = 100 ft/s, capped at 5 % of the section's maximum width; a surcharged FV pipe therefore carries pressure waves at 100 ft/s. For a 3-ft circular pipe the slot is 0.0228 ft wide. For an open shape the walls simply continue vertically at the top width. The FV link uses its own slot whatever `SURCHARGE_METHOD` says; that option still governs the dynamic wave part of the network."));
add(P("SWMM's area function is not always monotone in depth. For the first two of the 50 intervals in its 51-entry transect table, `lookup()` in xsect.c adds a quadratic correction, and on a transect that widens sharply near its invert the area can fall as depth rises (S5-DW4, Figure 3). A falling area would mean a negative width and an infinite wave speed. The table therefore keeps SWMM's value at every depth where the area reaches a new maximum and joins those depths with straight lines. No built-in shape needed this. Of the 37 conduits flagged in EPA's test set (Section 9.8), one did: 3 of 256 depths for transect 179 in model user5. The report names any link where it happened."));
add(...FIGURE("fig7_transect.png", 0.566, "SWMM 5.2.4's area for transect 179 (EPA user5) against the exact geometry of the transect and the FV link's table. The dots are the table depths, 0.0586 ft apart. Between 0.29 and 0.47 ft SWMM's area jumps between two interpolants; the table bridges those depths."));
add(H2("5.4  Face fluxes"));
add(P("Each face between two cells, and each end face, gets a flux of mass (Q) and momentum (Q²/A + g·I₁). The face computation has two parts."));
add(P("**Hydrostatic reconstruction** (Audusse et al. 2004). The two sides of the face are re-cut at the higher of the two beds, z* = max(z_L, z_R), keeping each side's water surface: h*_L = max(0, η_L − z*) and h*_R = max(0, η_R − z*). When the two water surfaces are equal the reconstructed depths are equal, the flux has no mass part, and the pressure parts cancel. The pressure each side loses by the re-cut, g·[I₁(h) − I₁(h*)], is added back to that side's own cell. Figure 4 shows the idea."));
add(...FIGURE("fig4_recon.png", 0.4583, "Hydrostatic reconstruction at a face with a bed step. Both sides are re-cut at z*, so a level water surface produces no flow; each cell gets back the pressure its own side lost.", 520));
add(P("**HLL flux** (Harten, Lax and van Leer) on the reconstructed states, with Davis wave-speed estimates. With c = √(g·A/T) on each side:"));
add(EQ("s_L = min(u_L − c_L, u_R − c_R),     s_R = max(u_L + c_L, u_R + c_R)", true));
add(EQ("F = [ s_R·F_L − s_L·F_R + s_L·s_R·(U_R − U_L) ] / (s_R − s_L)"));
add(P("with U = (A, Q). If s_L ≥ 0 the left flux is used whole, and if s_R ≤ 0 the right one. Where one side is dry the speeds come from the dry-bed rarefaction: s_L = u_R − 2c_R, s_R = u_R + c_R for a dry left side, and the mirror for a dry right side. A cell counts as dry below 1e-8 of the full area, and cell velocities are capped at 50 ft/s. The cell update then reads:"));
add(EQ("A_c ← A_c − (Δt/Δx)·(F_m,c+1 − F_m,c)", true));
add(EQ("Q_c ← Q_c − (Δt/Δx)·[ (F_q,c+1 + corrL_c+1) − (F_q,c + corrR_c) ]"));
add(P("where the corrections are the pressures given back by the reconstruction, each attached to the cell on its own side of the face. Getting that attachment backwards still conserves mass perfectly, but a still pond starts to move, which is why the lake-at-rest test exists (Section 9.3)."));
add(H2("5.5  Friction"));
add(P("Manning friction is applied after the flux update, semi-implicitly, which is stable for any substep:"));
add(EQ("Q ← Q / [ 1 + Δt·(g·n²/1.486²)·|Q| / (A_f·R^(4/3)) ]"));
add(P("The roughness is the conduit's own Manning n (for irregular sections, scaled by the square root of the transect's meander factor, as SWMM does). A_f is the cell area, but for a closed shape it never exceeds the full area: slot area is storage that sets the wave speed, not conveyance. R is the table's hydraulic radius at the cell depth, which stays at the full-pipe value above the crown."));
add(H2("5.6  Positivity"));
add(P("An explicit scheme can try to take more water out of a cell than it holds. Before the update, each cell's outflow over the substep (through either face) is compared with its volume A·Δx; if the outflow is larger, every face the cell drains through is scaled by the ratio. The factor is computed for all cells first, from the unscaled fluxes, so a cell that drains through both faces is limited once (FVL-5). The same rule protects each LOCAL end node (Section 6.2): its FV links cannot take more than the water above its invert plus the net flow from everything else over the substep, counting outflows as well as inflows (FVL-10). Outfalls and EXTRAN-surcharged nodes follow dynamic wave's head and are not limited this way."));
add(H2("5.7  Substep size"));
add(P("The FV links advance with their own substeps inside each dynamic wave step. The substep is the smallest of:"));
add(B("the Courant limit 0.5·Δx / s_max over every face of every FV link, where s_max is the fastest wave speed at the face;"));
add(B("the node limit A_node / K_node at every end node that tracks its own continuity, where K_node is the sum over its FV end faces of √(g·A·T) times the barrel count;"));
add(B("the time left in the dynamic wave step."));
add(P("After the node update (Section 6.3) the end faces are solved again at the estimated node heads. If those faces now carry faster waves, the substep is shrunk and the node estimate made again, up to four estimates in all. If the fourth still asks for a shorter substep, the substep is shortened once more and the fourth estimate is kept; in the EPA sweep this happened for 18 of 17.9 million substeps, all in model test5, and each cut was less than 2 parts in 10⁸ (FVL-13). No substep is shorter than 0.001 s unless less time than that is left in the routing step. A substep raised above its stability limit to that floor (or to the time left, when that is shorter) is counted as a Floor Hit in the report. All FV links share one substep at a time, so a single demanding link sets the pace for all of them; in the test runs this cost was small next to the gain in the dynamic wave step."));
add(P("Removing the node limit was tried and rejected: in a build with the limit switched off (October 13 code, `results/sweep_no_node_limit.csv`), the user2 oscillation came back, and the largest node depth difference from stock rose from 1.31 ft to 7.05 ft."));
add(...FIGURE("fig3_substep.png", 0.9659, "One FV solve (solveSystem), run once per Picard iteration. Steps 1 to 7 repeat until the substeps fill the dynamic wave step.", 560));

// ---- 6
add(H1("6  Coupling to dynamic wave"));
add(H2("6.1  End faces and ghost states"));
add(P("The first and last faces of an FV link sit at its end nodes (Figure 1). On the node side of each, the face sees a ghost state built from two values: the water surface is the node's head at that moment, and the velocity is the adjacent cell's. The ghost depth is that head minus the link's invert at that end (zero if the head is below it). Giving the ghost the cell's velocity lets water leave the pipe freely; an early version gave it zero velocity, which made the node look like a still pond and backed water up the pipe (FVL-1). OpenSWMM's finite-volume solver makes the same choice at its nodes in general: the node ghost takes its depth from the node head over the conduit invert and its velocity from the interior cell (`ExplicitFvSolver.cpp`, commit `8dd7387`). At a junction joining exactly two conduits that it treats as pass-through, it instead presents the far cell's own state; its code comment gives the reason, that presenting the node head loses about 1 mm of head per junction to the Riemann solver's dissipation, 0.23 m (0.75 ft) over a 199-junction chain. This branch has no pass-through treatment (Section 9.5)."));
add(H2("6.2  Interface nodes"));
add(P("Every node at the end of an FV link is an interface node. Inside each FV solve it is treated in one of two ways."));
add(P("**LOCAL** nodes (every node that is not an outfall, so junctions, storage units and dividers, unless surcharged under EXTRAN) track their own continuity during the subcycle. The flow from everything that is not an FV link is assumed to change linearly over the step, from its value at the end of the last step (Q_e0) to its value in the current Picard iteration (Q_e1). The node's depth at time t into the step is:"));
add(EQ("y(t) = y_old + [ Q_e0·t + ½·(Q_e1 − Q_e0)·t²/Δt + V_FV(t) ] / A_node"));
add(P("where V_FV(t) is the net volume the FV links have delivered to the node so far, and A_node is the surface area dynamic wave uses for the node in this iteration (never less than `MIN_SURFAREA`). FV links add no surface area of their own to their end nodes; their storage is in their cells. The depth is kept between zero and the node's maximum depth (unlimited when the node can pond)."));
add(P("**PRESCRIBED** nodes (outfalls, and any node surcharged under EXTRAN, which dynamic wave solves by a different rule) follow dynamic wave's head: the head moves linearly from its old value to the current Picard iterate across the step."));
add(H2("6.3  Semi-implicit node update"));
add(P("A small manhole on a pipe is an oscillator: the manhole's surface rises, pushes water into the pipe, the pipe pushes back. An explicit update, in which the head at the start of a substep fixes the fluxes and the fluxes then move the head, adds energy to that oscillation every substep; in testing, a 0.05-ft disturbance grew into a ±2.1-ft limit cycle (FVL-2). The fix treats the node's response implicitly. For a LOCAL node, the head change over the substep is estimated from the FV end-face flows at the start of the substep, the other flows at its midpoint (from the linear Q_e0 to Q_e1 change of Section 6.2), and the end faces' sensitivity to head:"));
add(EQ("ΔH = Δt·(Q_other + Q_FV) / (A_node + Δt·K_node)"));
add(P("The end faces are then solved again with the node at H + ΔH, and those are the fluxes both the node and the cells use. Because the node and the pipe read the same face fluxes, mass stays exact; because the node's response is implicit, the oscillation is damped. Figure 6 in Section 9.4 shows the same 0.05-ft disturbance decaying to zero."));
add(H2("6.4  Closed links and gated outfalls"));
add(P("A control rule can close a conduit (setting 0). A closed FV link turns both end faces into walls: no mass flux, and the momentum flux is the pressure of the water in the end cell. Water inside the link can still move between cells."));
add(P("An outfall with a flap gate (`Gated YES`) lets no water into the pipe, the same rule as `link_setFlapGate()` in stock SWMM. If the computed flux at the end face would carry water from a gated outfall into the link, that face becomes a wall for the substep; flow out of the link into the outfall is unaffected (FVL-7)."));
add(H2("6.5  Picard iterations"));
add(P("Dynamic wave repeats each step until the node heads converge. At the start of the step every FV link's cells are saved (`fvlink_initStep()`), and every Picard iteration restarts the FV solve from that saved state, using that iteration's node inflows, areas and, for PRESCRIBED nodes, heads. From the third iteration on, if every interface node converged in the previous iteration, the previous FV result is reused instead of solved again."));
add(P("Each FV link also contributes a flow-to-head sensitivity to its end nodes, dQ/dH = g·Δt·Ā/L times the barrel count, with Ā the mean cell area. Dynamic wave uses that sum only for nodes surcharged under EXTRAN."));
add(H2("6.6  Booking into node continuity"));
add(P("In stock SWMM, `setNodeDepth()` takes a node's volume change over the step as the average of its old and new net inflow times the step. At an interface node the patched code splits that net inflow into the FV part and the rest:"));
add(EQ("ΔV = ½·[ (Q_old − Q_FV,old) + (Q_new − Q_FV,new) ]·Δt + Q_FV,new·Δt"));
add(P("Q_FV,new is the volume that actually crossed the FV end faces during the step, divided by the step. The FV share is therefore booked exactly, and every other flow keeps dynamic wave's trapezoidal rule. This holds wherever stock updates the node from its volume change: a node that is not surcharged (always the case under SLOT) and a node that floods. A node surcharged under EXTRAN is the exception: stock sets its head from the net flow and the summed dQ/dH instead, so ΔV is not used and the FV volume is not booked exactly there, unless the node floods, when stock's overflow is computed from ΔV again. For the FV link a surcharged EXTRAN node is PRESCRIBED (Section 6.2). Q_FV,old is carried from step to step by `fvlink_endStep()`; at the first step it equals the links' initial flows, which `initNodes()` had already added to the nodes."));
add(H2("6.7  What the rest of SWMM sees"));
add(P("After each solve `setLinkResults()` writes the FV link's state into the same Link and Conduit fields dynamic wave fills, so statistics, the report, the binary output, mass balance and water quality all read an FV link like any other conduit:"));
add(TABLE(["Field", "Value for an FV link"], [
  ["Link.newFlow, Conduit.q1, q2", "the flow the link delivers, averaged over the step: out of the downstream face, or out of the upstream face when the net movement is upstream"],
  ["Link.newVolume", "the water stored in the cells, all barrels (exact)"],
  ["Link.newDepth", "mean cell depth, capped at full depth"],
  ["Conduit.a1", "mean cell area"],
  ["Link.froude, flowClass", "from the delivered flow over the mean cell area, and the mean cell depth; SUBCRITICAL, SUPCRITICAL or DRY"],
  ["Conduit.fullState", "from the first and last cells"],
  ["Link.dqdh", "g·Δt·Ā/L times barrels"],
  ["evaporation and seepage rates", "zero"],
], [3000, 6360], "How an FV link is published to the rest of SWMM."));
add(P("The reported flow is defined as the delivered flow because of water quality (Section 8). In steady flow it equals the flow everywhere in the link; during a rising or falling limb it is the flow at the link's outlet."));
add(P("FV links are left out of dynamic wave's Courant step (`getLinkStep()`), which is how a short FV link stops limiting the network. The node part of the variable step (`getNodeStep()`) is unchanged and treats an FV end node like any other node (stock skips outfalls, dry nodes and nodes at or above their crown)."));

// ---- 7
add(H1("7  Starting and ending a run"));
add(P("`fvlink_init()` runs after dynamic wave has set every node and link depth, volume and initial flow. For each FV link it builds the geometry table, the mesh and the initial cell state:"));
add(B("**No hot start and no initial flow:** the water surface is a straight line between the two end nodes' heads (each at least its end invert), and every cell starts at rest. A pond that starts level stays level."));
add(B("**An initial flow (InitFlow) or a hot start file:** every cell starts at the depth dynamic wave assigned the conduit (normal depth of the initial flow, or the hot start depth) and carries the conduit's flow."));
add(P("Hot start files are unchanged and store no cell state, so a run restarted from one begins each FV link at uniform depth. The link's initial volume is recorded for the volume balance in the report. At the end of the run `fvlink_close()` frees every run-time array, and `fvlink_delete()` frees the input table when the project closes. During the independent review (on the build before its fixes), repeated open, run and close cycles in one process ran under valgrind with no errors and identical outputs. The final build was run under AddressSanitizer, UndefinedBehaviorSanitizer and leak detection on 13 models (11 test networks plus EPA user2 and user5 with one link flagged) with no reports (`results/asan.txt`)."));

// ---- 8
add(H1("8  Mass balance and water quality"));
add(P("Three levels of mass accounting apply."));
add(B("**Inside each FV link,** the conservative update means the change in stored water equals what crossed the two end faces. The report's Volume Balance Err column checks this every run; the largest value in all testing was 2.7e-12 %."));
add(B("**At each interface node,** the FV volume is booked exactly, except at a node surcharged under EXTRAN (Section 6.6). The node's own continuity otherwise follows dynamic wave."));
add(B("**For the whole model,** SWMM's routing continuity error is still dynamic wave's, because every other link and node is dynamic wave. An FV link does not make the whole model exact; it removes the FV link's own contribution to the error."));
add(P("Water quality needed one deliberate choice. SWMM's quality routing treats a conduit as a single flow plus a change in storage: in `qualrout.c` the inflow to a conduit is taken as |q1| plus the change in its volume over the step, and the mass leaving it goes to the downstream node at `Link.newFlow`. With the reported flow defined as the delivered flow, both identities hold exactly for an FV link. An earlier definition (the link's inflow in q1, a length-averaged flow in newFlow) counted the storage change twice and produced a quality continuity error of −38,402 % (FVL-8). With the fix, one conservative pollutant through two FV links gives 0.093 % against stock's −0.036 %, with concentrations within 0.1 mg/L of stock."));
add(P("One case remains approximate: when water enters an FV link from both ends at once (or leaves from both), the single-flow quality model cannot represent it, just as it cannot for a stock conduit."));

// ---- 9
add(H1("9  Verification"));
add(P("Every comparison runs one `.inp` file on stock 5.2.4 and on the patched engine, both built from the same tag with the same compiler and flags (gcc 13.3, `-O2 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0`). Stock dynamic wave is the reference, not the truth: no observed data were used. The full record, with every number traced to a results file, is `VERIFICATION.md` in the delivered package."));
add(H2("9.1  Controls"));
add(B("**Null effect.** With no `[FV_LINKS]` section, all 73 models of EPA's regression suite (swmm-nrtestsuite v2.5.0-dev) were run on both engines: 72 `.out` files are byte-identical, and the 73rd (ncdc_format) stops with the same error in both."));
add(B("**Determinism.** The same FV run twice gives byte-identical `.out` files."));
add(B("**Patch reproduction.** The patch applied to a fresh clone of v5.2.4 builds a binary byte-identical to the one tested. An OpenMP build of the same patch, run with `THREADS 2` on 13 FV models (six of them large enough for SWMM to use both threads), writes `.out` files byte-identical to the serial build's (`results/omp_check.txt`)."));
add(B("**Memory checks.** The final build ran 13 models under AddressSanitizer, UndefinedBehaviorSanitizer and leak detection with no reports."));
add(B("**Provenance.** Every results file and every figure's data was regenerated on the final build (fvlink.c dated October 17, 2026), except `sweep_no_node_limit.csv`, an October 13 experiment with the node limit switched off (Section 5.7), and the two timing files kept from the October 13 session. Apart from wall times, the suite, sweep, gate, closure and out-diff results match the October 13 runs field for field. Every model with FV links that runs to completion writes a `.out` byte-identical to the build before the last two fixes; three probe models stop with the same input error on both builds (`results/prev_build_cmp.txt`)."));
add(H2("9.2  Geometry closure"));
add(P("A test program links the engine's own `fvlink.c` and builds the table for eleven SWMM shapes (circular, closed and open rectangular, trapezoidal, horseshoe, semicircular, egg, catenary, triangular, rectangular-round, gothic). For every shape: depth(area(h)) returns h to 3.4e-14 ft or better; the finite-difference slope of the area matches the stored width to 7.9e-9 and the slope of I₁ matches the area to 3.4e-10 (both limited by the difference step); the table equals SWMM's area exactly at the table depths and to 7.6e-4 of full area between them; no depth needed bridging."));
add(H2("9.3  Still water"));
add(...TABLE(["Run", "Largest |Q| (cfs)", "Largest head drift (ft)"], [
  ["stock dynamic wave", "0", "0"],
  ["all four conduits FV", "1.22e-11", "0"],
  ["C4 only FV", "0", "0"],
  ["C1 only FV", "4.46e-3", "7.6e-5"],
  ["C2 only FV", "3.65e-3", "3.4e-4"],
  ["C3 only FV", "3.37e-3", "3.4e-4"],
  ["C2 and C3 FV", "1.19e-3", "4.1e-4"],
  ["control: stock, J1 seeded +1e-7 ft", "4.16e-3", "n/a"],
], [4560, 2400, 2400], "Lake at rest: head 105 ft everywhere, outfall FIXED at 105 ft, 2 h. C1 3-ft circle; C2 open rectangle with a 0.5-ft inlet offset; C3 two barrels of 6-ft circle, surcharged; C4 trapezoid into the outfall. Heads are read from the .out file, whose single-precision values resolve about 7.6e-6 ft at 105 ft, so a drift of 0 means none at that resolution."));
add(P("With every conduit on FV the pond stays still to round-off. A mixed model does not stay exactly still: the FV links' round-off seeds the dynamic wave links, which then settle at dynamic wave's own noise floor of about 4e-3 cfs, the same floor stock reaches from a 1e-7-ft seed."));
add(H2("9.4  Stability of the node coupling"));
add(...FIGURE("fig9_resonator.png", 0.4903, "A dead-end manhole (12.566 ft²) on a surcharged 3-ft FV pipe, 300 ft long, draining to a FIXED outfall, with the manhole started 0.05 ft high. The disturbance falls about 4.6× every 30 minutes and from 3.1 h is zero at the .out file's resolution (about 7.6e-6 ft at 105 ft). Before the semi-implicit node update, the same model grew into a ±2.1-ft limit cycle."));
add(H2("9.5  Consistency with stock and mesh refinement"));
add(P("Fourteen synthetic cases (partly full and surcharged chains, both surcharge methods, a short link, a long channel, a storage outlet, consecutive FV links) were compared element by element with stock. Outfall volumes agree within 1.04 % in every case and within 0.21 % in all but the case with every surcharged conduit on FV. Flagging all eight conduits of a surcharged chain moves the outfall peak 5.3 %; flagging one pipe in the chains moves it less than 1 %, and the long channel, flagged in its middle reach, moves 1.8 % during its dry start. The full table is in `VERIFICATION.md`."));
add(P("The clearest difference is at the upstream end of an FV link. In a chain of eight 300-ft pipes carrying a 30-cfs peak, flagging pipe C4 raises the peak depth at its upstream node J4 above stock, and refining the FV mesh brings it back down (Figure 7). The excess is numerical and shrinks with refinement; it is not an entrance-loss model. The likely cause is the half-cell bed step at each end of the link: a cell's bed sits at its midpoint, so the end cell stands half a cell's fall away from the node invert. OpenSWMM's finite-volume chapter (hydraulics reference, Chapter 8, at commit `8dd7387`) describes the same artificial bed step at manholes and the same remedy, more cells. The Riemann solver's dissipation at the node faces is a second likely contributor: OpenSWMM's own solver code names it as a source of backwater at two-conduit junctions and avoids it there with a pass-through ghost (Section 6.1), which this branch does not have. The split between the two causes was not measured."));
add(...FIGURE("fig6_refine.png", 0.5111, "Peak depth at J4, the upstream node of FV link C4, against the number of cells in C4. Stock dynamic wave gives 1.73 ft."));
add(P("In a long rectangular channel (10 ft wide, n 0.015, slope 0.001) carrying a steady 60 cfs, the 2,000-ft middle reach as an 80-cell FV link settles at 1.6592 ft against Manning normal depth of 1.6559 ft (+0.20 %), and reports 60.0001 cfs."));
add(H2("9.6  A sloshing channel in EPA's user2 model"));
add(P("Channel TW01290 in EPA's user2 regression model is an irregular channel 544 ft long that falls 8.1 ft. Re-run at a 5-s report step, which is also the model's routing step, stock dynamic wave oscillates there (Figure 8). Within a 44-minute window its flow differs from the FV link's by more than 100 cfs for 39 minutes in all. It peaks at 1,921 cfs and falls to −935 cfs, while the channel upstream carries at most 891 cfs and the one downstream at most 537 cfs, and it runs backwards in 83 of the 5-s steps, all within 21 minutes, sending 165,921 ft³ back upstream. With TW01290 as an FV link the flow peaks at 449 cfs and never reverses."));
add(...FIGURE("fig5_user2.png", 0.6538, "Flow in EPA user2 channel TW01290, stock dynamic wave against the same channel as an FV link, with the upstream channel for reference."));
add(...TABLE(["Measure", "Stock", "TW01290 as FV"], [
  ["routing continuity error", "0.285 %", "0.280 %"],
  ["flow instability index (stock report)", "\"All links are stable.\"", "TW01290 (3)"],
  ["peak flow in TW01290", "1,921 cfs", "449 cfs"],
  ["volume sent upstream", "165,921 ft³", "0"],
  ["total variation of the 5-s flow series", "38,260 cfs", "965 cfs"],
  ["net volume through TW01290", "7.7633e6 ft³", "7.7648e6 ft³ (+0.02 %)"],
  ["system outflow volume", "", "+0.025 %"],
], [4160, 2600, 2600], "EPA user2, TW01290. Neither the continuity error nor SWMM's own instability index sees the oscillation."));
add(P("SWMM's instability index misses it because it counts turns, not their size. A turn is a change in sign of the step-to-step change in flow, counted when that change exceeds 0.001 cfs, and the count is scaled by the number of routing steps: in a 36-hour run at 5 s, a link is listed only after about 170 turns. Stock's TW01290 makes 45, because an oscillation with a period of minutes turns only a few dozen times (S5-DW2). The FV link is listed for the opposite reason: its step-averaged outflow wiggles slightly from step to step, 449 turns in all, but those turns are small, and the total variation of its 5-s series over the whole run is 965 cfs against stock's 38,260 cfs. EPA's user5 model shows the same pattern: in channel LIB_9 at a 1-s report step, stock runs backwards for 824 seconds and sends 146,996 ft³ upstream; the FV link runs backwards for 4 seconds at no more than 0.003 cfs (0.008 ft³ in all), and the net volume through the link is within 0.9 % (`results/oscillation.txt`)."));
add(H2("9.7  Speed"));
add(P("A 400-pipe tree has a 40-pipe trunk with a 9-pipe lateral entering every trunk junction; one trunk pipe is 10 ft long. In stock dynamic wave that pipe holds the average step at 1.14 s. Flagged as an FV link it subcycles on its own and the network steps at 9.89 s on average, against 9.87 s for the same tree without the short pipe."));
add(...FIGURE("fig8_timing.png", 0.3482, "Wall time for the 400-pipe tree on the final build, seven interleaved runs per pair. Flagging the short pipe runs in 0.19× stock (per-pair ratios 0.16 to 0.19). Against a tree that never had the short pipe (timed in a second interleaved run) the FV run takes 1.43× (per-pair 1.24 to 1.54). The October 13 session measured 0.17× (0.16 to 0.20) and 1.32× (1.20 to 1.68), so read the FV link's own cost as roughly 1.3× to 1.5× on this network."));
add(P("Results stay close: across the 400 conduits the median change in peak flow is 0.34 % and the largest 0.53 %; across the 401 nodes the largest change in peak depth is 0.80 %. Very short cells are the expensive case, because the substep shrinks with the cell length divided by the fastest wave. In EPA's user4 the flagged link is 1.88 ft long, so its 4 cells are 0.47 ft, and fast shallow flow (up to 39 ft/s) needed 791 substeps per step: the run took 15.5 s against 3.0 s. Stock lengthens that link 509-fold under the model's `LENGTHENING_STEP 5`; the FV link keeps its true length (FVL-14). A link running full subcycles at the 100-ft/s slot celerity whatever its length, so a long routing step makes it expensive: extran10's flagged link is a 1,000-ft pipe that fills to its crown, in a model with fixed 60-s routing steps, and it needed 957 substeps per step (summed over the Picard iterations), 1.1 s against 0.004 s. These are single runs, so only the order of magnitude matters."));
add(H2("9.8  EPA's regression models with one link flagged"));
add(P("Every dynamic wave model in EPA's suite was run with one conduit flagged: the conduit with the largest stock peak flow that the FV validator accepts. Of 73 models, 32 are not dynamic wave and 4 have no conduits; 37 ran. They span 3 to 209 nodes and 3 to 276 links; the flagged conduits were 20 circular, 10 trapezoidal, 4 street and 3 irregular, with 4 to 40 cells. All 37 use EXTRAN surcharge (SLOT was tested only in the synthetic chains), and 5 are in SI units (CMS). Three use `LENGTHENING_STEP`; in one of them, user4, stock lengthens the flagged link."));
add(B("FV link volume balance 2.7e-12 % or better in all 37, with no Floor Hits."));
add(B("System outflow volume changes by a median of 0.014 % in absolute value (the signed median is 0.000 %). The one model above 0.5 % is extran8a (+22.7 %), traced to a stock first-step volume jump in conduits with initial flow (S5-DW1)."));
add(B("The flagged link's peak flow changes by a median of 0.04 % in absolute value. Four changed more than 5 %: user2 (−73 %) and user5 (−38 %), both oscillations; gate_control_2 (+23 %), a gate-release surge carried with a sharper front and the same volume; gate_control_3 (−13 %), a single 60-s report spike."));
add(H2("9.9  Independent review"));
add(P("A second AI agent that had not seen the code being built reviewed it and reproduced each finding with its own probe model. It found five real bugs (FVL-6 to FVL-10), all fixed and re-tested, and raised two risks, both closed. It found no fault in the null-effect path, the signs, the hydrostatic corrections, the node booking, the Picard restart, or repeated open and close cycles."));
add(P("Two more agents then checked drafts of this document against the code and the results files. The first found three wrong statements, twelve imprecise ones and four that no results file supported, and exposed FVL-13; the second found five more wrong statements and several imprecise ones, and exposed FVL-14. All are corrected here."));

// ---- 10
add(H1("10  Defects found during the build"));
add(P("Fourteen defects in this branch were found and fixed before delivery; four behaviors of stock 5.2.4 were found along the way. Appendix A gives each entry with the code as it stood when the defect was live."));
add(...TABLE(["ID", "Defect", "How it showed"], [
  ["FVL-1", "end ghost had zero velocity", "node upstream of the link at 8.83 ft vs stock 1.73 ft"],
  ["FVL-2", "explicit node coupling pumped an oscillation", "0.05-ft disturbance grew to ±2.1 ft"],
  ["FVL-3", "reported flow was cell momentum", "steady 60 cfs reported as 59.536"],
  ["FVL-4", "slot area counted as conveyance", "found by reading; deep surcharge only"],
  ["FVL-5", "positivity factors from half-scaled fluxes", "found by reading before the first run"],
  ["FVL-6", "pumps at an FV end node read the wrong inflow", "pump 9.97 cfs in stock, 4.0 or 0 cfs with FV"],
  ["FVL-7", "gated outfall let water back up the link", "31.7 cfs backflow; none in stock (its peak, 0.73 cfs, flows forward)"],
  ["FVL-8", "quality routing blew up", "quality continuity −38,402 %"],
  ["FVL-9", "report line overflowed with a long link ID", "AddressSanitizer stack overflow"],
  ["FVL-10", "node limiter ignored other outflows", "found by reading"],
  ["FVL-11", "flat area segment gave infinite wave speed", "69,031 substeps forced to the floor in user5"],
  ["FVL-12", "report rule line indented two extra columns", "seen in the report; cosmetic"],
  ["FVL-13", "substep cut after the last node estimate went unrecorded", "found by the document check; 18 of 17.9 million substeps, no result changed"],
  ["FVL-14", "report showed a lengthening ratio for an FV link", "user4: Adjusted/Actual Length 508.59 for a link solved at its true length"],
  ["S5-DW1", "first-step link volume jump with InitFlow (stock)", "extran8a continuity −0.98 % stock, −6.87 % without InitFlow"],
  ["S5-DW2", "instability index counts turns, not their size (stock)", "user2: \"All links are stable.\""],
  ["S5-DW3", "\"All links are stable\" hides link index 0 (stock)", "read in source, not reproduced"],
  ["S5-DW4", "irregular transect area falls as depth rises (stock)", "transect 179: 3.25 ft² at 0.39 ft, 0.24 ft² at 0.42 ft"],
], [1000, 4000, 4360], "Defect register summary. FVL: this branch, all fixed. S5: stock EPA SWMM 5.2.4, all open."));

// ---- 11
add(H1("11  Limits and open questions"));
add(B("**No field data.** Every comparison is against stock dynamic wave or an analytic answer."));
add(B("**Head at FV link ends.** The upstream node sits higher than in stock (0.12 to 0.40 ft in the test chain); refine the link to reduce it."));
add(B("**Not supported in an FV link:** force mains, culvert codes, conduit flap gates, entry, exit and average losses, seepage, max. flow limits, street inlets, evaporation. Pumps and dummy conduits drawing from an FV end node are rejected rather than supported. Conduit lengthening does not apply to FV links: three of the EPA models in Section 9.8 use `LENGTHENING_STEP`, and in user4 the flagged link, which stock lengthens 509-fold, runs at its true 1.88 ft and is slow for it."));
add(B("**Water quality** was tested with one conservative pollutant; reactions, treatment and LID interactions with FV links were not tested."));
add(B("**Hot start** files carry no cell state."));
add(B("**Surcharge methods.** All 37 EPA models use EXTRAN, but how often their FV end nodes surcharged was not measured; the synthetic chains test one EXTRAN case and three SLOT cases. At a node surcharged under EXTRAN the FV volume is not booked exactly (Section 6.6)."));
add(B("**Node faces.** This branch has no pass-through treatment for a junction between two FV links, which OpenSWMM uses to avoid head loss at such junctions (Section 6.1)."));
add(B("**Cost.** All FV links share one substep. Very short cells (user4) and full pipes, which subcycle at the slot celerity, in models with long routing steps (extran10) can be slow; use fewer cells on short links."));
add(B("**Not compared** against OpenSWMM 6's `FLOW_ROUTING FV` engine, which was read but not built here."));
add(B("**One platform:** Linux with gcc 13.3, serial and OpenMP builds. No Windows/MSVC build and no WebAssembly build."));
add(B("**Other programs:** how the EPA SWMM GUI and third-party tools handle the new section was not tested."));
add(P("The design choices behind the method are Claude's, not yet approved by Bob Dickinson: the section name and line format, the 25-ft default cell, the 100-ft/s slot, CFL 0.5, the A/K node limit, four node estimates per substep, the extrapolated ghost velocity, the semi-implicit node update, friction on the real area, the delivered-flow definition, the area repair, what ERROR 116 rejects, which nodes follow dynamic wave's head, and the 5.2.4 base. Any of them can change."));

// ---- 12
add(H1("12  Fixed parameters"));
add(P("The method has no new `[OPTIONS]` keywords. Its parameters are compile-time constants at the top of `fvlink.c`; internal units are feet and seconds."));
add(...TABLE(["Constant", "Value", "Role"], [
  ["FV_NTAB", "256", "depth segments in each link's geometry table"],
  ["FV_CFL", "0.5", "Courant number for substeps"],
  ["FV_SLOT_C", "100 ft/s", "slot celerity above the crown of closed shapes"],
  ["FV_SLOT_WFRAC", "0.05", "slot width cap, as a fraction of maximum width"],
  ["FV_DX_TARGET", "25 ft", "default cell length"],
  ["FV_MIN_CELLS", "4", "fewest cells in a default mesh"],
  ["FV_MIN_DT", "0.001 s", "substep floor (each use counted as a Floor Hit)"],
  ["FV_NODE_FACTOR", "1.0", "node limit: substep ≤ factor × A_node / K_node"],
  ["FV_MAX_VEL", "50 ft/s", "cell velocity cap"],
  ["FV_AEPS", "1e-8", "dry threshold, as a fraction of full area"],
  ["FV_MAX_PASS", "4", "node estimates per substep before the substep is taken (FVL-13)"],
], [2400, 1500, 5460], "Constants in fvlink.c."));

// ---- 13
add(H1("13  Building it and the delivered files"));
add(CODE("git clone --branch v5.2.4 https://github.com/USEPA/Stormwater-Management-Model.git\ncd Stormwater-Management-Model\ngit apply ../swmm524-fvlink.patch\ngcc -O2 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 -Isrc/solver -Isrc/solver/include \\\n    src/solver/*.c src/run/*.c -lm -o runswmm"));
add(P("The FORTIFY switches are needed for stock 5.2.4 as well on Ubuntu 24 (gcc's buffer check aborts the stock engine while it prints an input error). CMake builds pick up `fvlink.c` through the existing source glob; add `-fopenmp` for a threaded build."));
add(...TABLE(["Item", "Contents"], [
  ["swmm524-fvlink.patch", "the patch: fvlink.c plus hooks in 11 existing files"],
  ["src/solver/", "fvlink.c and the 11 changed files, as patched"],
  ["models/", "every test network (dynamic wave and FV variants), the gate models, and the reviewer's probes"],
  ["scripts/", "gen.py (networks), suite.py, sweep.py, gates.py, null_gate.sh, outread.py (.out reader), test_closure.c, oscillation.py, asan_runs.sh, omp_check.sh, prev_build_cmp.sh, pass_count.patch"],
  ["results/", "suite.csv, sweep.csv, null_gate.txt, gates.txt, closure.txt, outdiff_tree.txt, timing_*.txt, oscillation.txt, asan.txt, omp_check.txt, pass_count.txt, prev_build_cmp.txt, report_excerpts.txt, openswmm_check.txt, sweep_no_node_limit.csv, and the two 2026-10-13 timing files"],
  ["doc/", "this document; swmm524-fvlink-essay.docx, the same story told as an essay in the manner of Isaac Asimov; figs.py and figdata.py, which draw the figures from engine runs; and the figure data"],
  ["README.md, VERIFICATION.md, DEFECTS.md", "usage, the full evidence, and the defect register"],
], [3000, 6360], "The delivered package (swmm524-fvlink.zip)."));

// ---- 14
add(H1("14  Use of AI"));
add(P("The swmm524-fvlink branch and this document were produced with Claude, Anthropic's AI model, in Claude Code sessions from October 13 to 17, 2026, under the direction of Robert (Bob) Dickinson. He asked whether SWMM6 can run finite volume on a single link with dynamic wave on the rest, then asked Claude to build that as an option on EPA SWMM 5.2.4, and asked for this description. Responsibility for publishing the work is his."));
add(P("**What Claude did.** It read the OpenSWMM and EPA SWMM 5.2.4 source, designed the method and chose every parameter listed in Section 11, wrote `fvlink.c` and the hooks, generated the test networks and scripts, ran every test, investigated and fixed the defects in Section 10, wrote the README, verification report and defect register, drew the figures, and wrote this document. A second Claude agent, given the code but not the build history, reviewed it independently and found FVL-6 to FVL-10. Two more Claude agents checked drafts of this document against the code and results; Claude applied their corrections, fixed the defects they exposed (FVL-13 and FVL-14), and regenerated the results on the final build."));
add(P("**How the results were checked.** The checks are mechanical, not the AI's judgment: byte comparison of `.out` files against stock 5.2.4 on EPA's 73 regression models, rebuilding from the patch on a fresh clone, analytic answers (still water, Manning normal depth), per-link and per-model mass balances, interleaved timing, sanitizer runs for memory errors, and engine runs behind every figure in this document."));
add(P("**What no person has checked yet.** As far as this record shows, no person has reviewed `fvlink.c` line by line, run the branch on a project model, or approved the design choices in Section 11."));

// ---- Appendix A
add(H1("Appendix A  Defect register, with the code as it was"));
add(P("Each FVL entry shows the code as it stood when the defect was live, then the fix. Each S5 entry shows the stock code involved."));
const defects = [
  ["FVL-1  End ghost had zero velocity",
   "The node ghost had no velocity, so water leaving the pipe met a still pool and backed up. Chain with C4 flagged at 30 cfs: J4 peaked at 8.83 ft against stock's 1.73 ft. Fix: the ghost takes the end cell's velocity; J4 now 1.92 ft.",
   "                    zR = f->z2;\n                    etaR = NdH[f->n2];\n                    hR = MAX(0.0, etaR - zR);\n                    uR = 0.0;"],
  ["FVL-2  Explicit node coupling pumped a manhole-pipe oscillation",
   "The node head at the start of a substep fixed the face fluxes, which then advanced the node: forward Euler on an oscillator. A 0.05-ft disturbance in a dead-end manhole on a surcharged pipe grew to ±2.1 ft. Continuity could not see it, because mass was exact throughout. Fix: the semi-implicit node update of Section 6.3.",
   "        for (i = 0; i < NNodes; i++)\n        {\n            n = NodeList[i];\n            NdH[n] = nodeHead(n, t, dt);\n...\n            NdV[f->n1] -= f->fm[0] * f->barrels * dts;\n            NdV[f->n2] += f->fm[nc] * f->barrels * dts;"],
  ["FVL-3  Reported flow was cell momentum, not conveyed water",
   "On a sloped bed the cells' Q differs from the face mass flux. Steady 60 cfs was reported as 59.536 cfs. First fixed with a length-averaged face flux, later replaced by the delivered flow (FVL-8).",
   "                f->q[c] = qnew;\n                qbar += qnew;\n...\n            f->qSum += qbar / nc * dts;"],
  ["FVL-4  Slot area counted as conveyance",
   "Above the crown, friction divided by the slot-inflated area. Fix: friction uses min(A, A_full) for closed shapes. Not measured separately.",
   "                    if ( r > 0.0 )\n                        qnew /= 1.0 + dts * f->rf * fabs(qnew) /\n                                (anew * pow(r, 4.0/3.0));"],
  ["FVL-5  Positivity factors from half-scaled fluxes",
   "Each cell's factor was computed inside the face loop, after its left face could already have been scaled, so a cell draining through both faces could lose more than it held. Caught in review before the first run. Fix: all cell factors first, from the unscaled fluxes.",
   "                        c = m - 1;\n                        out = (f->fm[c+1] > 0.0 ? f->fm[c+1] : 0.0) +\n                              (f->fm[c]   < 0.0 ? -f->fm[c]  : 0.0);\n                        vol = f->a[c] * f->dx;\n                        lam = (out * dts > vol) ? vol / (out * dts) : 1.0;"],
  ["FVL-6  Pumps and dummy conduits at an FV end node read the wrong inflow",
   "Pumps are solved before the FV links, so an ideal pump or dummy conduit read a node inflow without the FV share; FV links add no surface area, so getModPumpFlow() divided by zero. Ideal pump 9.97 cfs in stock, 4.0 cfs with FV; a curve pump went to 0 and the wet well flooded. Fix: rejected with ERROR 116. No such check existed in the validator:",
   "        if ( RouteModel != DW ||\n             Link[j].type != CONDUIT ||\n             Link[j].xsect.type == DUMMY ||"],
  ["FVL-7  Gated outfall let water back up the FV link",
   "The validator checked only the conduit's own gate; stock also closes a link whose inflow end is a gated outfall. FIXED stage 4 ft above the junction's invert, with Gated YES: 31.7 cfs of backflow and the junction flooded; stock lets none through (its peak, 0.73 cfs, is forward flow). Fix: the end face becomes a wall whenever it would carry water from a gated outfall into the link; minimum flow now 0.000 cfs, as in stock.",
   "             Link[j].hasFlapGate ||"],
  ["FVL-8  Water-quality routing blew up",
   "q1 held the link's inflow, so quality routing's |q1| + dV/dt counted storage twice, and newFlow was not what the downstream node received. Quality continuity −38,402 % (stock −0.036 %). Fix: both are the delivered flow; 0.093 % after.",
   "    qBar = f->qSum / dt;\n\n    Conduit[k].a1 = aBar;\n    Conduit[k].q1 = f->vIn / dt;\n    Conduit[k].q2 = f->vOut / dt;"],
  ["FVL-9  Report line overflowed with a long link ID",
   "A fixed 200-character buffer was filled with sprintf; SWMM allows much longer IDs. AddressSanitizer reported a stack overflow with a 180-character ID. Fix: lines written straight to the report file.",
   "    char    line[200];\n...\n        sprintf(line, \"  %-16s %7d %8.2f %9.1f %9.0f %8.4f %8.1e\",\n            Link[f->link].ID, f->nCells, f->dx * UCF(LENGTH),"],
  ["FVL-10  Node limiter ignored the node's other outflows",
   "The water a node could give its FV links counted the other flows only when they were inflows, so the node could be drawn below its invert, and setNodeDepth() clips that to zero, which creates water. Fix: the signed value.",
   "            avail = (NdH[n] - Node[n].invertElev) * NdArea[n] +\n                    MAX(0.0, qe) * dts;"],
  ["FVL-11  Flat area segment gave an infinite wave speed",
   "Where SWMM's area did not rise with depth, the table forced a 1e-12 step, giving a near-zero width and a wave speed of 40,930 ft/s in user5's LIB_9; 69,031 substeps were forced to the floor. Fix: the area repair of Section 5.3; 3 depths bridged, 0 Floor Hits.",
   "        a = xsect_getAofY(x, y);\n        if ( a <= f->tA[i-1] ) a = f->tA[i-1] + 1.0e-12 * x->aFull;\n        f->tA[i] = a;"],
  ["FVL-12  Report rule line indented two extra columns",
   "report_writeLine() already starts every line with two spaces, and the rule string carried two more, so the dashed line under the column headings of the Finite-Volume Link Summary started two columns to the right of the table. Cosmetic: .out files unchanged, null gate still 72 identical. Fix: the rule string's leading spaces removed.",
   "    report_writeLine(\"  -----------------------------------------------------\"\n                     \"----------------------------\");"],
  ["FVL-13  Substep cut after the last node estimate went unrecorded",
   "The node estimate and end-face re-solve run up to four times. When the fourth still asked for a shorter substep, the loop shortened it and left without a new estimate, without the 0.001-s floor check, and without recording that substep for the Min Substep column; a substep below the floor would have run unreported. Counted with an instrumented build: 18 of 17,885,456 substeps in the EPA sweep, all in test5, each cut less than 2 parts in 10⁸ and the shortest 1.29 s (test5 reports 0.6956 s); none in 3.7 million substeps of the test networks. Fix: that final substep is recorded and held to the floor like any other; the fourth estimate is still used for it. No .out file changed: every model with FV links that runs to completion writes the same bytes on both builds, and three probe models stop with the same input error on both.",
   "        for (pass = 0; pass < 4; pass++)\n        {\n            floorHit = FALSE;\n            dtStable = dts;\n            if ( dts < FV_MIN_DT && dts < remaining )\n            {\n                dts = MIN(FV_MIN_DT, remaining);\n                floorHit = TRUE;\n            }\n...\n            if ( floorHit || dtEnd >= dts * (1.0 - 1.0e-9) ) break;\n            dts = dtEnd;\n        }\n        if ( dtStable < remaining )"],
  ["FVL-14  Report showed a lengthening ratio for an FV link",
   "Under LENGTHENING_STEP, stock stretches short conduits so they do not limit the Courant step, and the Flow Classification Summary prints each conduit's lengthened over true length. An FV link is solved at its true length and takes no part in that step, but buildLink() left the stock value in place, so EPA user4 reported 508.59 for its 1.88-ft FV link. Report only: the lengthened value is used nowhere else for an FV link. Fix: buildLink() resets it to the true length, and the column reads 1.00.",
   "    f->barrels = Conduit[f->conduit].barrels;\n    f->length = link_getLength(j);\n    if ( cells < 0 )\n...\n        fprintf(Frpt.file, \"  %6.2f \", Conduit[k].modLength / Conduit[k].length);"],
  ["S5-DW1  First-step link volume jump with InitFlow (stock 5.2.4)",
   "A conduit with an initial flow starts at the normal-depth volume of that flow; in the first step dwflow.c recomputes the volume from the end depths, which creates or destroys water. In EPA extran8a two such links nearly cancel (continuity −0.98 %); without the initial flows stock gives −6.87 %. Open, not reported.",
   "    Link[j].newVolume = aMid * link_getLength(j) * barrels;"],
  ["S5-DW2  Instability index blind to report-scale oscillation (stock 5.2.4)",
   "A turn is a change in sign of dq, the change in flow from one routing step to the next, counted when |dq| exceeds 0.001 cfs; the count is scaled by the number of routing steps, and a link is listed only above an index of 1. An oscillation with a period of minutes turns a few dozen times (45 for TW01290 in user2's 36-hour, 5-s run, index 0.26), while a flow with small step-to-step wiggles can score higher (the FV TW01290: 449 turns, index 2.60, which the report prints as 3). A limitation of the index's definition rather than a coding error.",
   "    k = LinkStats[j].flowTurnSign;\n    LinkStats[j].flowTurnSign = SGN(dq);\n    if ( fabs(dq) > 0.001 &&  k * LinkStats[j].flowTurnSign < 0 )\n            LinkStats[j].flowTurns++;"],
  ["S5-DW3  \"All links are stable\" hides link index 0 (stock 5.2.4)",
   "The table is seeded with index −1; testing ≤ 0 instead of < 0 means that when the first link in the file is the most unstable, the report says all links are stable. Read in source, not reproduced.",
   "    if ( nMaxStats <= 0 || flowTurns[0].index <= 0 )\n        fprintf(Frpt.file, \"\\n  All links are stable.\");"],
  ["S5-DW4  Irregular transect area falls as depth rises (stock 5.2.4)",
   "For the first two of the 50 intervals of the 51-entry table, lookup() adds a quadratic correction and keeps it only when positive, otherwise falling back to the linear value; on a transect that widens sharply near its invert the area jumps between the two and falls as depth rises. Transect 179 (user5): A(0.39 ft) = 3.25 ft², A(0.42 ft) = 0.24 ft², where the true area is 0.35 ft². Stock dynamic wave reads these areas every step. Open, not reported.",
   "    // --- use quadratic interpolation for low x value\n    if ( i < 2 )\n    {\n        y2 = y + (x - x0) * (x - x1) / (delta*delta) *\n             (table[i]/2.0 - table[i+1] + table[i+2]/2.0) ;\n        if ( y2 > 0.0 ) y = y2;\n    }"],
];
defects.forEach(([title, text, code]) => { add(H3(title), P(text, { keepNext: true }), CODE(code)); });

// ---- Appendix B
add(H1("Appendix B  Function reference for fvlink.c"));
add(...TABLE(["Function", "Called from", "Purpose"], [
  ["fvlink_readParams", "input.c parseLine()", "read one [FV_LINKS] line"],
  ["fvlink_validate", "project.c project_validate()", "apply the ERROR 116 checks"],
  ["fvlink_init", "flowrout.c flowrout_init()", "build every FV link; list interface nodes; seed the old FV net inflow"],
  ["buildLink", "fvlink_init", "mesh, friction factor, arrays, initial state of one link"],
  ["buildTable", "buildLink, test_closure.c", "geometry table, area repair, slot or walls"],
  ["fvlink_initStep", "dynwave.c initRoutingStep()", "save every cell's A and Q"],
  ["fvlink_findFlows", "dynwave.c findLinkFlows()", "solve (or reuse), then add face flows and dQ/dH to the nodes"],
  ["solveSystem", "fvlink_findFlows", "the subcycle of Figure 5"],
  ["nodeHead", "solveSystem", "LOCAL or PRESCRIBED node head at time t"],
  ["faceFlux", "solveSystem", "reconstruction, HLL, gated-outfall and closed-link walls"],
  ["hllFlux", "faceFlux", "HLL flux with Davis and dry-bed wave speeds"],
  ["setLinkResults", "solveSystem, buildLink", "publish the link to Link[] and Conduit[]"],
  ["fvlink_getNodeVolume", "dynwave.c setNodeDepth()", "exact FV booking in node continuity"],
  ["fvlink_getNodeDqdh", "dynwave.c findLinkFlows()", "FV dQ/dH for each node"],
  ["fvlink_isFv, fvlink_isFvNode, fvlink_active", "dynwave.c", "queries used by the hooks"],
  ["fvlink_endStep", "dynwave.c dynwave_execute()", "commit the step's FV net inflows and volumes"],
  ["fvlink_report", "stats.c stats_report()", "Finite-Volume Link Summary"],
  ["fvlink_close, fvlink_delete", "flowrout.c, project.c", "free run-time and input memory"],
  ["areaOf, widthOf, momentOf, depthOf, hradOf, velOf", "throughout", "the geometry closure of Section 5.3"],
], [3300, 2700, 3360], "Functions in fvlink.c."));

// ---------------------------------------------------------------- document
const doc = new Document({
  creator: "SWMM Enablement",
  title: "swmm524-fvlink: how it works",
  description: "Technical description of per-link finite-volume routing in EPA SWMM 5.2.4",
  styles: {
    default: { document: { run: { font: BODY, size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: BODY, color: ACCENT },
        paragraph: { spacing: { before: 120, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: BODY, color: ACCENT },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 21, bold: true, font: BODY, color: "333333" },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 270 } } } }] },
      { reference: "life", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
      { reference: "steps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "swmm524-fvlink: how it works", size: 16, color: INK2 })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: INK2 })] })] }) },
    children: C,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT, buf.length); });
