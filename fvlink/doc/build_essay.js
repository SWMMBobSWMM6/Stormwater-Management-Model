// Builds "How Many Numbers Make a Pipe?", an essay in the manner of Isaac
// Asimov's science essays, on the swmm524-fvlink branch of EPA SWMM 5.2.4.
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun, Footer, Header,
  PageNumber, FootnoteReferenceRun, HeadingLevel, BorderStyle,
} = require("docx");

const FIG = "/home/claude/fvlink/docwork/";
const OUT = "/home/claude/fvlink/docwork/swmm524-fvlink-essay.docx";
const SERIF = "Georgia", MONO = "Courier New";
const INK2 = "5A5853", ACCENT = "7A2E1F";
let figNo = 0;

// ------------------------------------------------------------- inline text
// `code`, **bold**, *italic*, [^n] footnote reference
function runs(text, base = {}) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[\^\d+\])/g).filter((s) => s.length);
  return parts.map((p) => {
    if (p.startsWith("`")) return new TextRun({ text: p.slice(1, -1), font: MONO, size: 19, ...base });
    if (p.startsWith("**")) return new TextRun({ text: p.slice(2, -2), bold: true, ...base });
    if (p.startsWith("[^")) return new FootnoteReferenceRun(Number(p.slice(2, -1)));
    if (p.startsWith("*")) return new TextRun({ text: p.slice(1, -1), italics: true, ...base });
    return new TextRun({ text: p, ...base });
  });
}
let firstInSection = true;
const P = (text) => {
  const p = new Paragraph({
    children: runs(refs(text)),
    spacing: { after: 100, line: 300 },
    indent: firstInSection ? undefined : { firstLine: 360 },
    alignment: AlignmentType.JUSTIFIED,
  });
  firstInSection = false;
  return p;
};
const SEC = (num, title) => {
  firstInSection = true;
  const kids = num ? [new TextRun({ text: num, size: 26, color: ACCENT }), new TextRun({ text: "", break: 1 })] : [];
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, keepNext: true,
    spacing: { before: 480, after: 240 },
    children: [...kids, new TextRun({ text: title, size: 26, smallCaps: true })],
  });
};
const EQ = (text) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 140 }, keepLines: true,
  children: [new TextRun({ text, italics: true, size: 23 })] });
const CODE = (text) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 140 },
  children: [new TextRun({ text, font: MONO, size: 19 })] });
const RAT = JSON.parse(fs.readFileSync(FIG + "essayfigs/figinfo.json")).ratios;
const FIGS = {
  profile: ["fig1_profile.png", 0.5012], step: ["fig2_step.png", 0.9235], flow: ["fig3_substep.png", 0.9659],
  recon: ["fig4_recon.png", 0.4583], user2: ["fig5_user2.png", 0.6538], refine: ["fig6_refine.png", 0.5111],
  transect: ["fig7_transect.png", 0.566], timing: ["fig8_timing.png", 0.3482], reson: ["fig9_resonator.png", 0.4903],
};
Object.keys(RAT).forEach((f) => { FIGS[f.slice(0, 3)] = ["essayfigs/" + f, RAT[f]]; });
const ORDER = ["e01", "e02", "e03", "e04", "e05", "profile", "e06", "e08", "e07", "recon", "e09", "e10", "e11",
  "e12", "e13", "step", "e14", "reson", "flow", "e15", "e16", "e17", "e18", "transect", "timing", "e21", "user2",
  "e19", "e20", "e22", "refine", "e23", "e24"];
const FIGNUM = Object.fromEntries(ORDER.map((k, i) => [k, i + 1]));
function FIGURE(label, caption, widthPx = 560) {
  figNo += 1;
  if (FIGNUM[label] !== figNo) throw new Error("figure order: " + label + " placed as " + figNo);
  const [file, ratio] = FIGS[label];
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 60 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(FIG + file),
        transformation: { width: widthPx, height: Math.round(widthPx * ratio) } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 }, indent: { left: 360, right: 360 },
      children: runs(`Figure ${figNo}. ${caption}`, { size: 18, color: INK2, italics: true }) }),
  ];
}
const refs = (t) => t.replace(/\{fig:(\w+)\}/g, (m, k) => { if (!FIGNUM[k]) throw new Error("no figure " + k); return "Figure " + FIGNUM[k]; });
const FN = (text) => ({ children: [new Paragraph({ children: runs(text, { size: 18 }) })] });

// ------------------------------------------------------------- footnotes
const footnotes = {
  1: FN("Or perhaps it wasn't an accident at all. I didn't ask. Either way it's a better word than the one it may have replaced, and I'm grateful for it."),
  2: FN("Courant, Friedrichs and Lewy were proving that certain difference equations converge to the differential equations they imitate, and the condition fell out of the proof. It became famous later, when people began computing with machines and found that a step that is too long doesn't merely lose accuracy. The numbers blow up."),
  3: FN("This is a recurring theme in the subject. The exact answer is known, it's beautiful, and it's too expensive to compute a billion times. A cruder answer that gets the bookkeeping exactly right and the details approximately right is what nearly everybody ends up using."),
  4: FN("SWMM's own SLOT surcharge method is a Preissmann slot too. It is one of the most successful fictions in hydraulics."),
  5: FN("Euler's method in its backward form, the implicit version, has the opposite vice: it takes a little energy away at every step. For a manhole that ought to calm down, that's no vice at all."),
  6: FN("A number like that is almost a relief. Nobody could mistake it for round-off, and nobody could ship it."),
  7: FN("0.008 ft³ is about 0.06 gallon, or very nearly one cup."),
  8: FN("The idea that wrongness comes in degrees is the subject of Asimov's essay *The Relativity of Wrong*, which makes it with a better example than mine."),
  9: FN("Which is why I recommend explaining things. It is the cheapest debugging tool I know of."),
};

// ------------------------------------------------------------- content
const C = [];
const add = (...xs) => xs.forEach((x) => (Array.isArray(x) ? C.push(...x) : C.push(x)));

// title page
add(
  new Paragraph({ spacing: { before: 2200, after: 200 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "How Many Numbers", size: 52, bold: true, color: ACCENT }), new TextRun({ text: "Make a Pipe?", size: 52, bold: true, color: ACCENT, break: 1 })] }),
  new Paragraph({ spacing: { after: 480 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "An essay on swmm524-fvlink, in the manner of Isaac Asimov", size: 26, italics: true, color: "333333" })] }),
  new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.CENTER, indent: { left: 900, right: 900 },
    children: runs("swmm524-fvlink is a branch of EPA SWMM 5.2.4 in which chosen conduits are solved by an explicit finite-volume method while every other link and node stays on stock dynamic wave routing. This essay explains how it works, why each piece is the way it is, and what went wrong along the way.", { size: 20, color: INK2 }) }),
  new Paragraph({ spacing: { before: 360, after: 80 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "SWMM Enablement  ·  October 2026  ·  US customary units", size: 18, color: INK2 })] }),
  new Paragraph({ spacing: { after: 80 }, alignment: AlignmentType.CENTER, indent: { left: 1200, right: 1200 },
    children: runs("The narrator is Claude, Anthropic's AI model, which built the branch for Robert (Bob) Dickinson. The essay borrows the manner of Asimov's science essays and quotes none of them. The section at the end says how AI was used.", { size: 18, color: INK2, italics: true }) }),
);

// ---- I
add(new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }));
add(SEC("I", "A Chemist's Word"));
add(P("Not long ago I was asked a short question, and short questions are the dangerous kind."));
add(P("It came from Bob Dickinson, who has been working on the EPA Storm Water Management Model since the 1970s, and it went like this: *In SWMM6 is it possible to have finite volume for only one link and the rest dynamic wave?*"));
add(P("The honest answer was no. OpenSWMM, the engine that is becoming SWMM 6, does have a finite-volume solver, but it offers it as a choice for the whole project. You write `FLOW_ROUTING FV` in the options and every conduit in the network is cut into cells; the code that builds the cells stops the run if any conduit lacks a real cross-section. There is no switch for one pipe."));
add(P("The difference is easiest to see in a picture ({fig:e01})."));
add(...FIGURE("e01", "Two ways to add finite volume. Left: OpenSWMM's FLOW_ROUTING FV cuts every conduit into cells. Right: this branch cuts only the conduits listed in [FV_LINKS], here C3, and leaves the rest on dynamic wave. (Diagram.)"));
add(P("His next message asked whether the idea was *theoretically miscible*."));
add(P("Now, *miscible* is a chemist's word. Two liquids are miscible if they mix in any proportion and stay mixed, the way alcohol and water do. They're immiscible if they separate no matter how hard you shake the bottle, the way oil and water do. A moment later a second message arrived that said *possible*, so perhaps the first word was an accident of the keyboard.[^1] I've decided to treat it as a happy accident, because *miscible* is exactly the right question."));
add(P("Dynamic wave routing and finite-volume routing are two different liquids. Could one network hold a lot of one and a little of the other without the two separating at the boundary? That is, without water being created or destroyed where they meet, and without the seam between them starting to slosh on its own?"));
add(P("I said I thought it could. He said to build it. What follows is an account of what I built, why each piece is the way it is, and the fourteen mistakes I made along the way. I'll explain everything from the beginning, and I'll do the arithmetic in plain sight, because arithmetic is the one kind of argument that can't hide anything."));

// ---- II
add(SEC("II", "One Flow and Two Heads"));
add(P("Let's start with what SWMM already does, and does well."));
add(P("To SWMM, a storm sewer is a set of nodes (manholes, junctions, storage units, outfalls) joined by links (conduits, pumps, weirs, orifices). Under dynamic wave routing each node carries one number that matters above all others, the elevation of its water surface, which hydraulic engineers call the head. Each conduit carries one number of its own, the flow through it. That's all. A conduit 300 ft long, with water rising at one end and falling at the other, is described by one flow and the two heads at its ends."));
add(P("{fig:e02} shows the gap between what the water does and what dynamic wave keeps for it."));
add(...FIGURE("e02", "Diagram: what the water does along a conduit, and the three numbers dynamic wave keeps for it."));
add(P("It is a wonderfully economical arrangement. At each routing step SWMM estimates each conduit's flow from the momentum equation, written for the conduit as a whole, using its two end heads. Then it adds up the flows arriving at and leaving each node and moves the node's head up or down to account for the water that came and went. Since the new heads change the flows and the new flows change the heads, SWMM goes around the loop again, a procedure numerical analysts call a Picard iteration, until the heads stop changing, and then it moves on to the next step."));
add(P("The method has a long pedigree. SWMM5's dynamic wave routing descends from EXTRAN, the Extended Transport block of earlier SWMM versions, and between them they have routed a great many real sewer systems. Nothing I say later should be taken to mean that it's a poor method. It's a good method that pays for its economy in two particular ways. The first is time. The second is what a single number can and cannot describe."));

// ---- III
add(SEC("III", "The Tyranny of the Shortest Pipe"));
add(P("When SWMM uses a variable time step, it chooses each step so that no wave can cross any conduit in less than a step. This is the Courant condition, named for Richard Courant, who published it with Kurt Friedrichs and Hans Lewy in 1928, long before there were computers to run into it.[^2]"));
add(P("The arithmetic is simple. A small wave on a water surface travels at a speed *c* equal to the square root of *g* times the hydraulic depth, which is the flow area divided by the width of the water surface. If the water itself is moving at velocity *v*, a wave heading downstream travels at *v + c*. Divide a conduit's length by that speed and you have the time a wave needs to cross it. SWMM multiplies that time by a safety factor (0.75 is the usual value) and won't let the step be any longer."));
add(P("Now consider a test network I built for this work: a tree of 400 pipes, made of a 40-pipe trunk with a 9-pipe lateral entering at every trunk junction. One trunk pipe, called CT21, is only 10 ft long. Everything else is ordinary."));
add(...FIGURE("e03", "The 400-pipe test tree: a trunk of 40 pipes of 6-ft circle, with a lateral of nine 1.5-ft pipes at every trunk junction. Every pipe is 300 ft long except the trunk pipe CT21, which is 10 ft. (Schematic, not to scale.)"));
add(P("At its peak, CT21, a 6-ft circular pipe, runs at 0.46 of its full depth with a velocity of 6.0 ft/s. At that depth the flow area is 12.7 ft² and the water surface is 5.98 ft wide, so the hydraulic depth is 2.12 ft, and"));
add(EQ("c = √(32.2 × 2.12) = 8.3 ft/s"));
add(P("A wave therefore crosses the pipe at 6.0 + 8.3 = 14.3 ft/s and needs 10 / 14.3 = 0.70 s to get from one end to the other. Multiply by 0.75 and you get 0.53 s."));
add(P("SWMM's own report for that run gives its smallest time step as 0.53 s."));
add(P("I did the same arithmetic for all 400 conduits, at every 30-second report of the stock run, skipping the moments SWMM itself skips: when a conduit is empty, completely full, or barely moving. {fig:e04} shows the result. CT21 sits alone at 0.53 s. No other conduit ever comes closer than 5.0 s."));
add(...FIGURE("e04", "Section III's arithmetic for all 400 conduits of the stock run, from its 30-second results: each conduit's Courant time, 0.75·L/(v + c), at its tightest moment, skipping the moments SWMM skips (empty, full, or Froude number 0.01 or less)."));
add(P("I enjoy a coincidence like that, though of course it isn't one. It's the Courant condition doing exactly what it says. The trouble is what it does to everybody else. The network allows steps of up to 10 s, but the average step in that run is 1.14 s, and on my machine the run takes 4.8 s. Remove CT21 from the tree altogether and the average step rises to 9.87 s, and the run takes 0.58 s. One 10-ft pipe among 400 makes the whole simulation about eight times slower."));
add(P("SWMM's report even counts the steps for you ({fig:e05}). With CT21 in the network, 98 % of the steps were between half a second and 1.7 s."));
add(...FIGURE("e05", "SWMM's own Time Step Frequencies for the three runs of the tree. With the 10-ft pipe, 98 % of the steps fall between 0.5 and 1.7 s; with that pipe as an FV link, or without it, 99 % fall between 5.5 and 10 s."));
add(P("That is the tyranny of the shortest pipe. A platoon marches at the pace of its slowest member, and in a sewer network the slowest member is the shortest one."));
add(P("The second cost of the single number shows up in a different kind of conduit, one that is long and steep and joins two nodes with large surface areas. With only one flow and two heads to work with, the water can surge from one end of such a conduit to the other and back again. We'll meet a real example in one of EPA's own test models in Section X."));

// ---- IV
add(SEC("IV", "A Pipe With Many Rooms"));
add(P("Here is the finite-volume idea in a sentence: instead of describing a conduit by a single flow, cut it into a row of short pieces, called cells, and give each cell its own water and its own flow."));
add(P("In swmm524-fvlink each cell carries two numbers. One is the flow area *A*, which multiplied by the cell's length is the volume of water in the cell. The other is the flow *Q*. By default a cell is about 25 ft long, and no conduit gets fewer than four cells, so a 300-ft pipe becomes 12 cells and 24 numbers. A modeler chooses which conduits get this treatment by listing them in a new input section called `[FV_LINKS]`. Every conduit not listed stays on dynamic wave, untouched."));
add(...FIGURE("profile", "The arrangement. The FV link in the middle is cut into cells; the nodes at its ends, J4 and J5, remain ordinary dynamic wave nodes, and so does every other conduit."));
add(P("The equations the cells obey are the ones Barré de Saint-Venant wrote down in 1871 for shallow water in a channel: one says that water is neither created nor destroyed, and the other says that a change in momentum is caused by pressure, gravity and friction. The interesting part is how the method keeps its books."));
add(P("The most important rule of the game is a bookkeeping rule. Water moves between neighboring cells only through the face they share, and whatever leaves one cell through a face enters its neighbor through the same face in exactly the same amount. So the change in a cell's water over a short interval is the water in through its left face minus the water out through its right face. Add that up over all the cells and the inner faces cancel in pairs, the way a transfer between two of your own bank accounts cancels out of your net worth. The total water in the conduit changes only by what crosses its two end faces."));
add(...FIGURE("e06", "The bookkeeping rule. Each cell gains what enters through its left face and loses what leaves through its right; summed over the cells, every inner face cancels and only the two end faces remain. (Diagram.)"));
add(P("That is why such a method is called *conservative*, and the word is not an approximation. Every run of swmm524-fvlink checks it: at the end of the run, each FV link's change in stored water is compared with the water that crossed its two end faces. In all 51 test runs the largest disagreement was 2.7e-12 %, which is round-off in about the fourteenth significant figure."));
add(...FIGURE("e08", "Every FV link's volume check in the 51 test runs: the change in stored water against the water through its two end faces. The worst is 2.7e-12 %."));
add(P("The hard part is the face. Given the cell on the left and the cell on the right, how much water and how much momentum crosses the face between them in a short interval?"));
add(P("In 1959 a young Soviet mathematician, Sergei Godunov, proposed an answer of great beauty. At each face, pretend that the two neighboring cells are two halves of an endless channel, separated by a gate. Now pull the gate out and ask what the water does. This is the Riemann problem, named for Bernhard Riemann, who studied its version for gases in 1860, and it's the dam break of hydraulics: a surge runs one way and a wave of lowering water runs the other, and the flow at the gate's old position is the answer to the question."));
add(P("Solving the Riemann problem exactly at every face at every instant is expensive. In 1983 Amiram Harten, Peter Lax and Bram van Leer showed that a cruder answer does nearly as well. Assume the dam break sends out just two waves, one to the left and one to the right, estimate how fast each travels, and average everything between them in the one way that keeps mass and momentum exactly in balance. This is the HLL flux. For the two speeds, swmm524-fvlink uses estimates S. F. Davis published in 1988: the slowest of the leftward speeds, *u − c*, on either side of the face, and the fastest of the rightward speeds, *u + c*.[^3] A face with water on one side and a dry bed on the other gets its own speeds, from the exact solution for water rushing into a dry channel."));
add(P("To show the face rule at work, I wrote a short Python version of it and gave it the textbook test, a dam break: water 2 ft deep held behind a gate against water 0.5 ft deep, and the gate pulled out. The exact answer has been known for a long time. A stretch of water 1.10 ft deep moves downstream at 4.1 ft/s behind a front advancing at 7.5 ft/s, while the water behind the gate draws down in a smooth curve. {fig:e07} shows the exact answer after 30 seconds as a line and the cells as dots. They agree everywhere except at the front itself, which the cells smear over a few cell lengths. That's the price of the cruder answer, and the reason to use more cells where fronts matter."));
add(...FIGURE("e07", "The face rule on a dam break: 2 ft of water held behind a gate against 0.5 ft, then released. The line is the exact solution; the dots are a short Python version of the same HLL rule with Davis speeds, on 5-ft cells. A toy for illustration, not the engine."));
add(P("Each cell's momentum also feels gravity pulling it down the slope and friction holding it back. The next two sections are about getting those right, because either one can go wrong in ways that conservation alone won't catch."));

// ---- V
add(SEC("V", "Still Water Must Stay Still"));
add(P("The simplest test of any hydraulic model is a pond. Fill a network with water to the same level everywhere, add no inflow, open no gates, and the water should stay exactly where it is, forever."));
add(P("You might suppose any method would pass that test. It isn't so. In a sloping pipe full of still water the water is deeper at the low end than at the high end, so the pressure pushes harder at the low end, and that push is balanced exactly by gravity pulling the water downhill. In the equations, the balance is perfect. In a computer, the pressure is computed at the faces and the pull of gravity from the beds of the cells, which are two different pieces of arithmetic, and unless they're arranged with great care they won't cancel to the last digit. What's left over is a small fictitious force, and a small fictitious force acting on a still pond makes it move."));
add(P("The cure used here is called *hydrostatic reconstruction*, and it was published in 2004 by Emmanuel Audusse and four colleagues. At each face, both sides are re-cut as though the bed were at the higher of the two cell beds, with each side keeping its own water surface. If the two water surfaces are level, the re-cut depths are equal, no water crosses, and the pressures cancel exactly. Then each side gets back, in its own cell, the pressure it lost by being re-cut."));
add(...FIGURE("recon", "Hydrostatic reconstruction at a face with a step in the bed. Both sides are re-cut at the higher bed, so a level water surface produces no flow; each cell gets back the pressure its own side lost. (Diagram.)", 500));
add(P("That last detail matters more than it looks. Each correction has to go to the cell on its own side of the face. Put it on the wrong side and the method still conserves water perfectly, with every drop accounted for, and a still pond starts to move anyway. Conservation is a necessary virtue, not a sufficient one."));
add(P("The test I used has four conduits: a 3-ft circular pipe, an open channel with a 0.5-ft step up at its inlet, two barrels of 6-ft pipe running full, and a trapezoidal channel. Everything is ponded at elevation 105 ft for two hours. With every conduit an FV link, the largest flow anywhere was 1.2e-11 cfs, and no head moved within the precision of SWMM's output file. With a mixture of FV and dynamic wave conduits the flows settle at about 4e-3 cfs, which looks worse until you notice that stock SWMM, with no FV links at all, settles at the same 4e-3 cfs if one node is disturbed by a ten-millionth of a foot. That's dynamic wave's own noise floor. The seam adds nothing to it."));
add(...FIGURE("e09", "The pond at rest, from the gate results: the largest flow anywhere in two hours. Runs with a mixture of FV and dynamic wave conduits settle at the same few thousandths of a cfs that stock reaches from a ten-millionth of a foot."));

// ---- VI
add(SEC("VI", "The Slot"));
add(P("A storm sewer isn't an open channel all the time. When it fills, the water inside is under pressure, the width of the water surface shrinks to nothing, and the formula for wave speed, the square root of *g* times area over width, gives infinity. In reality a pressure wave in a full pipe travels at thousands of feet per second, which is close enough to infinity to be very inconvenient."));
add(P("In 1961 Alexandre Preissmann, working in Grenoble, proposed a fiction. Pretend that the pipe has a very narrow slot running along its crown and rising forever. Water that rises above the crown fills the slot, so the pipe still has a free surface with a width, though a tiny one, and the same equations go on working. The narrower the slot, the faster the wave.[^4]"));
add(P("So you choose the wave speed you want and the slot follows from it. In swmm524-fvlink the slot's width is"));
add(EQ("T = g · A_full / c²"));
add(P("with *c* = 100 ft/s, capped at 5 % of the section's widest point. For a 3-ft pipe, *A_full* = 7.07 ft², and so *T* = 32.2 × 7.07 / 10,000 = 0.0228 ft, about a quarter of an inch."));
add(P("{fig:e10} shows what this does to the wave speed in a 3-ft pipe, read from the FV link's own geometry table. As the pipe fills, the speed rises slowly to about 20 ft/s just below the crown, and above the crown it jumps to the slot's 100 ft/s."));
add(...FIGURE("e10", "Left: the slot, drawn wider than scale. Right: the wave speed in a 3-ft FV link at each depth, from the link's own geometry table. It rises to about 20 ft/s just below the crown and jumps to the slot's 100 ft/s above it."));
add(P("Why 100 ft/s, when the real wave is so much faster? Because an explicit method must take substeps short enough that the fastest wave crosses no more than half a cell. At 100 ft/s a 25-ft cell already needs substeps of 0.5 × 25 / 100 = 0.125 s, which is forty substeps in a 5-s routing step. At a realistic wave speed it would be thirty or forty times as many. The slot speed is a compromise: fast enough that a surcharged pipe responds promptly, and slow enough to compute."));
add(P("{fig:e11} does the same arithmetic for any cell length, and marks the smallest substeps the engine actually reported for three links."));
add(...FIGURE("e11", "The substep the Courant limit allows, half a cell divided by the fastest wave, for two wave speeds. The dots are the smallest substeps the engine reported for three real links; user4's lies between the lines because its fastest wave was about 44 ft/s."));
add(P("There's a trap here too, and I fell into it. Friction depends on the flow area and the hydraulic radius, through the relation Robert Manning presented in 1889. Above the crown a cell's area includes the slot, and the first version of the code let that slot area count as room for the water to flow. It isn't. The slot is a fiction for storage and wave speed, not a bigger pipe. Friction now uses the real area, never more than the full area of the pipe. It's applied after the rest of the update, in a form that divides rather than subtracts, so that it can slow the flow but never reverse it, however long the substep."));

// ---- VII
add(SEC("VII", "The Handshake at the Manhole"));
add(P("Now for the seam itself. An FV link begins and ends at nodes it shares with ordinary dynamic wave links. What does its end face see on the node side?"));
add(P("swmm524-fvlink gives it a *ghost*: an imaginary cell just outside the pipe whose water surface is the node's head and whose velocity is the velocity of the end cell inside the pipe. The ghost's depth is the node's head minus the conduit's invert at that end, or zero if the head is lower than the invert."));
add(...FIGURE("e12", "The handshake at the end of an FV link. The ghost takes its water surface from the node and its velocity from the end cell. A local node keeps its own books during the FV calculation; a prescribed node follows dynamic wave. (Diagram.)"));
add(P("I learned the velocity part the hard way. The first version gave the ghost no velocity at all. A manhole is a pool of still water, after all, so that seemed natural. But to the Riemann solver, still water at the end of the pipe is a wall of water that the outflow must push aside. In a test chain of eight 300-ft pipes carrying a 30-cfs peak, with the fourth pipe, C4, made an FV link, the node at the upstream end of C4 peaked at 8.83 ft. Stock SWMM put it at 1.73 ft. The whole of the error was one line:"));
add(CODE("uR = 0.0;"));
add(P("Giving the ghost the end cell's velocity let water leave freely, and the same node's peak fell to 1.92 ft. I found out later that OpenSWMM's finite-volume solver makes the same choice."));
add(...FIGURE("e13", "Peak depth at the node above FV link C4 in the test chain. The first value is from the defect register; the build that produced it no longer exists."));
add(P("The node side is subtler. Every node at the end of an FV link is handled in one of two ways during the FV calculation. Outfalls, and nodes that dynamic wave is treating as surcharged under its EXTRAN method, are *prescribed*: their heads simply follow dynamic wave's, moving in a straight line from the old value to the current estimate across the step. Every other node is *local*. It keeps its own books during the FV calculation, adding up what the FV link delivers substep by substep and what everything else delivers (assumed to change in a straight line across the step), and moving its own head accordingly."));
add(P("{fig:step} shows where the whole FV calculation sits inside one dynamic wave routing step: after every other link has been solved, so that each end node already knows what everything else is sending it."));
add(...FIGURE("step", "One dynamic wave routing step with the FV hooks. Blue boxes are new code; gray boxes are stock SWMM 5.2.4.", 500));
add(P("And here we meet an oscillator."));
add(P("A small manhole at the end of a full pipe is a weight on a spring. The water in the pipe is the weight. The manhole is the spring, because a small surface area rises a long way for a little water. Push the water in the manhole up and it pushes water into the pipe, which overshoots and comes back. In a real sewer, friction makes the motion die away."));
add(P("The first version updated the node in the obvious way. At the start of each substep it took the node's head, computed the flow through the end face, and then moved the node's head by that flow times the length of the substep. This is Euler's method in its forward form, which Leonhard Euler described in the 1760s, and applied to an oscillator it adds a little energy at every step. It's like pushing a child on a swing at slightly the wrong moment: each push is small, but they all push the same way.[^5]"));
add(P("A toy model shows the effect plainly. Treat the resonator described next as a frictionless weight on a spring, and step it forward 0.2 second at a time. The swing ought to stay the same size forever. In {fig:e14} it grows from 0.05 ft to 1.75 ft in ten minutes. Make the same toy look ahead, as the fix below does, and the swing dies away instead."));
add(...FIGURE("e14", "A toy model of a manhole on a full pipe, without friction: the resonator's dimensions, a 0.05-ft start and 0.2-s steps. Stepping forward, the swing grows to 1.75 ft in ten minutes; looking ahead, it dies away. The engine is more complicated; the real resonator is in the next figure."));
add(P("In a test I call the resonator, a dead-end manhole 12.6 ft² in area sits at the top of a 3-ft pipe 300 ft long, running full, that drains to an outfall held at a fixed level. The manhole starts 0.05 ft high. The first version turned that 0.05 ft into a swing of plus or minus 2.1 ft that never stopped. Through it all, continuity was perfect. No water was created or destroyed; it was simply thrown back and forth harder and harder. A mass balance cannot see a problem like that. Only a test designed for it can."));
add(P("The fix is to let the node look ahead. For a local node, the change in head over a substep is estimated as"));
add(EQ("ΔH = Δt · (Q_other + Q_FV) / (A_node + Δt · K)"));
add(P("where *A_node* is the node's surface area and *K* measures how strongly the end faces respond to a change in head, √(*g A T*) for each face. The term Δ*t* · *K* in the denominator is the node knowing, in advance, that its own rise will cut its inflow. The end faces are then solved again with the node at its new head, and those are the flows both the node and the pipe use. Because both read the same numbers, no water is lost; because the node looked ahead, the swing is damped instead of pumped."));
add(P("The same resonator now settles down. The disturbance falls about 4.6 times every half hour, and from about 3.1 hours on it is too small for SWMM's output file to record."));
add(...FIGURE("reson", "The resonator with the node looking ahead: the manhole's 0.05-ft disturbance shrinks about 4.6 times every half hour. The flat steps at the end are the output file's single-precision limit, about 7.6e-6 ft at 105 ft.", 470));
add(P("Two further safeguards keep the handshake honest. The substep is also kept shorter than the node's area divided by *K*, a limit that keeps the manhole from swinging faster than the calculation can follow; when I tried removing it, EPA's user2 model, which we'll meet shortly, went from a largest node-depth difference from stock of 1.31 ft to 7.05 ft. And because solving the end faces again can reveal faster waves than the substep was sized for, the substep is shrunk and the estimate made again, up to four times. No local node is allowed to give its FV links more water than it has, counting everything else that arrives and leaves during the substep."));
add(P("{fig:flow} puts the whole calculation in order, and {fig:e15} shows how seldom the later estimates are needed: about 97 % of all substeps are accepted on the first."));
add(...FIGURE("flow", "One FV calculation, run once per Picard iteration. Steps 1 to 7 repeat until the substeps fill the dynamic wave step.", 500));
add(...FIGURE("e15", "On which look-ahead estimate each substep was accepted, counted with an instrumented build. About 97 % pass on the first. In 17.9 million sweep substeps, 18 ran out of estimates (FVL-13)."));

// ---- VIII
add(SEC("VIII", "Keeping the Books"));
add(P("When the FV calculation is done, the water that crossed each end face has to be entered in the node's accounts, and it has to be entered exactly."));
add(P("Stock SWMM changes a node's volume over a step by the average of its old and new net inflow, times the length of the step. Mathematicians call that the trapezoidal rule. At a node shared with an FV link, swmm524-fvlink splits the net inflow into two parts: the part from FV links, entered as exactly the volume that crossed the end faces, and everything else, which keeps the trapezoidal rule:"));
add(EQ("ΔV = ½ · [ (Q_old − Q_FV,old) + (Q_new − Q_FV,new) ] · Δt + Q_FV,new · Δt"));
add(P("Here *Q_FV,new* is the volume that actually crossed the end faces during the step, divided by the step."));
add(...FIGURE("e16", "Diagram: how a node's books are kept over one routing step. Flows from ordinary links are averaged by the trapezoidal rule; the FV link's flow is entered as exactly the volume that crossed its end face, substep by substep."));
add(P("There is one exception, and I mention it because exceptions are where the truth lives. When a node is surcharged and SWMM is using its EXTRAN surcharge method, stock SWMM doesn't move the node's head by its change in volume at all. It moves it by the net flow and the node's sensitivity to head. At such a node the FV volume is not entered exactly, unless the node floods, in which case SWMM uses the volume again. That's why such a node is prescribed for the FV link."));
add(P("Then there's water quality. SWMM's quality routing treats a conduit as a single flow plus a change in storage: the flow into a conduit is taken as the reported flow plus the rate at which the conduit's volume changes. An FV link doesn't have a single flow. During a rising or falling flow, the water going in at one end differs from the water coming out at the other. So which flow should it report?"));
add(P("My first version reported the inflow in one place and an average along the length in another, and the quality routing, adding the change in storage on top, counted it twice. With one pollutant in a small network, the quality continuity error came out at −38,402 %.[^6] The fix was to report the flow the link *delivers*: the water that left through its downstream face over the step, or through its upstream face when the net movement is upstream. With that definition the quality routing's accounting identity holds exactly. The same pollutant, run through two FV links, now gives a continuity error of 0.093 %, against stock's −0.036 %, with concentrations within 0.1 mg/L of stock's."));
add(...FIGURE("e17", "Quality continuity for one pollutant in a small network with two FV links, before and after the reported flow became the delivered flow. Symmetric log scale."));

// ---- IX
add(SEC("IX", "The Shape of a Ditch"));
add(P("To do its arithmetic, an FV cell needs three facts about its cross-section: the depth that goes with a given area, the width of the water surface, and the pressure integral (the sum of depth times width over the depth of the water). SWMM knows a great many shapes, from circles and eggs to horseshoes, gothic arches and natural channels described by surveyed points. Rather than write each shape's formulas again, swmm524-fvlink asks SWMM for the area at 256 equally spaced depths and joins the points with straight lines."));
add(P("That choice buys an unusual guarantee. Between two table depths, the area changes along a straight line, so the width is *exactly* the slope of that line, the pressure integral is *exactly* its integral, and the depth that goes with an area is *exactly* recoverable. A small test program builds the table for eleven of SWMM's shapes and checks: depth from area returns the original depth to within 3.4e-14 ft, and the table matches SWMM's own area exactly at every table depth."));
add(...FIGURE("e18", "Geometry closure for eleven of SWMM's shapes, from the closure test: depth recovered from area, and the table's width and pressure integral checked against slopes. The two slope checks are limited by the test's own finite-difference step."));
add(P("Then came a ditch."));
add(P("EPA's user5 model contains a natural channel, transect 179, shaped like a narrow V that opens onto a wide, flat overbank. SWMM stores the area of an irregular channel in a table of 51 entries, and for the first two intervals of that table it adds a curved correction, keeping it only when the result is positive. On a shape that widens as suddenly as this one, the area SWMM reports *falls* as the depth rises: 3.25 ft² at 0.39 ft deep, and 0.24 ft² at 0.42 ft. The true area of the V at 0.42 ft is about 0.35 ft²."));
add(P("An area that falls as the depth rises means a negative width, and a negative width means an infinite wave speed. My first table builder papered over flat spots with a tiny upward step, which gave a width of 3.7e-8 ft and a wave speed of 40,930 ft/s. The substep collapsed to its floor of a thousandth of a second, 69,031 times in one run. The table now keeps SWMM's area wherever it reaches a new high and bridges the dips with straight lines. In the user5 channel that bridges 3 of the 256 depths, and the report says so."));
add(P("{fig:transect} shows SWMM's area, the true area of the ditch, and the FV table that bridges the dip."));
add(...FIGURE("transect", "SWMM 5.2.4's area for transect 179 (EPA user5) against the exact geometry of the transect and the FV link's table. The dots are the table depths, 0.0586 ft apart. Between 0.29 and 0.47 ft SWMM's area jumps between two interpolants; the table bridges those depths."));
add(P("Stock SWMM reads those same areas at every step. That's a property of SWMM 5.2.4, not of this branch, and it's recorded in the defect register as an open item."));

// ---- X
add(SEC("X", "What It Bought"));
add(P("Back to the tree with the 10-ft pipe. Make CT21 an FV link and it subcycles on its own. Its four cells are 2.5 ft long and its smallest substep is 0.0878 s, while the rest of the network, freed of its tyrant, steps along at an average of 9.89 s, all but the 9.87 s of the tree without the short pipe. In the final timing runs the whole simulation took 0.19 of stock's time; an earlier session measured 0.17. Across the 400 conduits, no peak flow changed by more than 0.53 %, and across the 401 nodes no peak depth changed by more than 0.80 %."));
add(P("{fig:timing} shows the run times and {fig:e21} how little the answers moved."));
add(...FIGURE("timing", "Run times for the 400-pipe tree, median of seven interleaved runs, with the range as whiskers. One short pipe as an FV link brings the network most of the way back to a tree that never had it."));
add(...FIGURE("e21", "How much the tree's results moved when CT21 became an FV link: the change in each conduit's peak flow and in each node's peak depth. The largest are 0.53 % and 0.80 %."));
add(P("And here is a small piece of arithmetic that pleased me more than it should have. The FV substep is set so that the fastest wave crosses half a cell. Half of 2.5 ft divided by 0.0878 s is"));
add(EQ("0.5 × 2.5 / 0.0878 = 14.2 ft/s"));
add(P("which is the same *v + c* = 14.3 ft/s we worked out from stock SWMM's smallest step in Section III. Two methods, one wave."));
add(P("Now the sloshing channel. EPA's user2 regression model contains an irregular channel, TW01290, 544 ft long, that falls 8.1 ft. I ran the model with results reported every 5 seconds, which is also its routing step, so nothing happened between reports that the reports didn't show."));
add(P("Stock SWMM's flow in TW01290 peaks at 1,921 cfs and swings down to −935 cfs, while the channel above it never carries more than 891 cfs and the channel below it never more than 537. Within a 44-minute window, stock and FV differ by more than 100 cfs for 39 minutes in all. The flow runs backward in 83 of the 5-second steps, all within 21 minutes, and sends 165,921 ft³ back upstream. As an FV link, the same channel peaks at 449 cfs and never runs backward at all, and the net volume it passes over the whole run agrees with stock's to 0.02 %."));
add(...FIGURE("user2", "Flow in EPA user2's channel TW01290 every 5 seconds: stock dynamic wave against the same channel as an FV link, with the channel upstream of it for reference."));
add(P("Here's the curious part. By SWMM's usual measures, nothing happened. The routing continuity error is 0.285 % for stock and 0.280 % with the FV link. And stock's own flow instability index reports *All links are stable.*"));
add(P("The index misses the swing because it counts how often a flow changes direction, not how violently. A *turn* is a change of sign in the step-to-step change of flow, counted whenever that change exceeds 0.001 cfs, and the count is divided by the number of routing steps. In a 36-hour run at 5-second steps, a link has to turn about 173 times before the index passes 1, the threshold for being listed. Stock's TW01290, for all its violence, turns only 45 times, for an index of 0.26. The FV link turns 449 times, for an index of 2.60, which the report prints as 3, because its outflow wiggles slightly from one step to the next. But its wiggles are small: added up over the whole run, its flow changes by 965 cfs in all, against 38,260 cfs for stock's."));
add(...FIGURE("e19", "TW01290 in EPA user2, every 5-second step. SWMM's instability index counts the turns on the left; the size of the swings, on the right, is what an engineer would want to know."));
add(P("EPA's user5 model shows the same pattern in its channel LIB_9. Reported every second, stock's flow runs backward for 824 seconds and sends 146,996 ft³ upstream. The FV link runs backward for 4 seconds, at never more than 0.003 cfs, and sends back 0.008 ft³ in all.[^7] The net volume through the channel agrees with stock's to within 0.9 %."));
add(...FIGURE("e20", "EPA user5's channel LIB_9, reported every second. Stock's flow runs backward for 824 seconds in all; as an FV link it never goes below −0.003 cfs."));
add(P("One example could be luck, so I repeated the experiment on every dynamic wave model in EPA's regression suite, 37 of them. In each, the conduit with the largest stock peak flow that the validator accepts became an FV link. {fig:e22} shows how much that conduit's peak moved. For most, the change is a few hundredths of a percent; the median, in absolute value, is 0.04 %. Four moved by more than 5 %: user2 and user5, the two oscillating channels; gate_control_2, where a gate releases a surge that the FV link carries with a sharper front and the same volume; and gate_control_3, where the difference is a single spike in one 60-second report."));
add(...FIGURE("e22", "The same experiment on every dynamic wave model in EPA's regression suite: one conduit, the one with the largest stock peak flow that the validator accepts, made an FV link. The four peaks that moved by more than 5 % are labeled. Symmetric log scale."));

// ---- XI
add(SEC("XI", "What It Cost, and How Wrong It Is"));
add(P("Nothing is free, and an essay that told you only what this branch bought would be an advertisement."));
add(P("First, the node at the upstream end of an FV link sits higher than stock SWMM puts it. In the test chain, stock gives the node above C4 a peak of 1.73 ft. With C4 as an FV link the peak is 2.13 ft with one cell, 2.07 ft with two, 2.00 ft with four, 1.92 ft with the default twelve, and 1.85 ft with forty-eight. The excess shrinks as the cells get shorter, which tells you it's a property of the arithmetic, not of the water. It is not a model of entrance losses."));
add(...FIGURE("refine", "Peak depth at the upstream end of FV link C4 against the number of cells in C4. Stock dynamic wave gives 1.73 ft."));
add(P("There are two likely culprits. A cell's bed is set at the midpoint of the cell, so the end cell stands half a cell's fall away from the node's invert, a small artificial step at every manhole; OpenSWMM's finite-volume chapter describes the same step, and the same remedy, more cells. The other is the Riemann solver itself, which loses a little energy at every face it solves. OpenSWMM's solver code says that presenting the node's head at a junction loses about 1 mm of head per junction that way, 0.23 m (0.75 ft) over a chain of 199 junctions, and it avoids the loss at junctions between two conduits with a special pass-through treatment. This branch has no such treatment, and I didn't measure how the excess divides between the two causes."));
add(P("Second, very short cells are slow. In EPA's user4 model the flagged link is only 1.88 ft long, so its four cells are less than half a foot each, and the water in it moves at up to 39 ft/s. It needed 791 substeps per routing step, and the run took 15.5 s instead of 3.0 s. A pipe running full subcycles at the slot's 100 ft/s whatever its length, so a long routing step makes it expensive: in EPA's extran10 model, a 1,000-ft pipe running full, in a model that takes fixed 60-second steps, needed 957 substeps per routing step (counting every pass of the Picard iteration), and the run took 1.1 s instead of 0.004 s. Use fewer cells on short links, and expect full pipes to cost more."));
add(P("{fig:e23} shows the substeps per routing step across EPA's 37 models. All but these two need between 2 and 173."));
add(...FIGURE("e23", "FV substeps per routing step for each of the 37 EPA models. Two stand apart: user4, with very short cells, and extran10, a full pipe at the slot's 100 ft/s under 60-second routing steps."));
add(P("Third, and most important: none of the comparisons in this essay were made against measurements of real water. Stock dynamic wave is the reference throughout, not the truth."));
add(P("That's worth a moment's thought. A 300-ft pipe described by one flow is wrong; real water doesn't move as one flow. The same pipe described by twelve cells is less wrong about what happens along its length, and, at its upstream end, a little more wrong than stock about the depth in the manhole. Neither is right. The useful question is never *which method is right* but *which is less wrong, where, and by how much*, and only measurements can settle that.[^8]"));
add(P("There are smaller limits too. Evaporation and seepage are not modeled in an FV link. Water quality was tested with one pollutant that doesn't react. A hot-start file stores no cell states, so an FV link restarts at a uniform depth. A pump or a dummy conduit that draws from an FV link's end node is rejected, with an error, rather than supported. Every model in the EPA sweep uses the EXTRAN surcharge method, but I didn't measure how often their FV end nodes actually surcharged. And everything here was built and run on one machine, with one compiler."));

// ---- XII
add(SEC("XII", "Fourteen Mistakes"));
add(P("I've mentioned several of my mistakes already. There were fourteen in all, every one now fixed, and every one is written up in the branch's defect register with the code as it stood when it was wrong. I found some myself: the still-water ghost, the pumped oscillation, the slot that carried water, the flat spot in the ditch. Others I didn't."));
add(...FIGURE("e24", "The fourteen defects of this branch in the order they were found, colored by who found them. Each is written up in DEFECTS.md with the code as it was."));
add(P("Five came from a second AI agent that read the code without having watched it being written. It found that a flap-gated outfall could let water back up an FV link, 31.7 cfs of it, where stock SWMM lets none through the gate; that the quality routing blew up; that a long link name could overflow a line of the report; that a pump drawing from an FV link's end node would read the wrong inflow; and that the node's water limit ignored its other outflows."));
add(P("The last two came from checking a written description of the branch against its code, line by line. The description said that no substep is ever shorter than a thousandth of a second. The checker asked whether that was true, and it wasn't quite: on the rare substep where the fourth look-ahead still asked for a shorter step, the code shortened it without recording it in the report or holding it to the floor. Over 17.9 million substeps in EPA's models that happened 18 times, all in one model, and each cut was less than 2 parts in a hundred million, but it was wrong all the same. The second check found that, in a model using SWMM's conduit lengthening, the report showed an FV link as stretched 509-fold when it is in fact solved at its true length. Neither fix changed a single number in any output file, and both were found only because someone tried to explain the program clearly and someone else refused to take the explanation on trust.[^9]"));
add(P("Through all of it, one promise held. With no `[FV_LINKS]` section in the input, the branch writes the same output file, byte for byte, as stock SWMM 5.2.4 for 72 of EPA's 73 regression models, and the 73rd stops with the same error in both. A model that doesn't ask for finite volume cannot tell the branch from the original. And an old copy of SWMM given a file that *does* ask for it stops with an error rather than quietly ignoring the request, which is the right way for an old program to fail."));

// ---- XIII
add(SEC("XIII", "Miscible After All"));
add(P("So, back to the chemist's word. Are dynamic wave and finite volume miscible?"));
add(P("In the sense that matters, yes, with the exceptions I've listed. The two meet at the nodes, each keeps its own books, and they agree on a single entry in the ledger: the volume of water that crosses each end face. Water is conserved across the seam to round-off, still water stays still, and the seam doesn't swing on its own. A modeler can choose, one conduit at a time, which liquid each pipe is made of."));
add(P("SWMM first appeared in 1971, sized to the computers of its day, and its methods have accumulated ever since rather than replacing one another: kinematic wave beside dynamic wave, and now, if anyone wants it, finite volume beside both, inside a single network. How many numbers make a pipe? One, if the pipe behaves. Twelve, or forty-eight, if it doesn't. The answer turns out to depend on the pipe, and now the model can let it."));
add(P("Asimov gave his robots three laws. I worked under one, which is to show the numbers. The fourteen entries in the defect register are what that law cost, and they are the best reason I can offer for believing the rest."));

// ---- end matter
add(SEC("", "Use of AI"));
add(P("This essay and the swmm524-fvlink branch it describes were made with Claude, Anthropic's AI model, in Claude Code sessions from October 13 to 18, 2026, under the direction of Robert (Bob) Dickinson, who asked the question in Section I, asked for the branch to be built, and asked for this essay in the manner of Isaac Asimov. Responsibility for publishing it is his. Claude designed and wrote the branch, ran the tests, found and fixed the defects described in Section XII (three other Claude agents found seven of them), drew the 33 figures, and wrote this text. Of the figures, the diagrams are labeled as diagrams, two are toy calculations in Python and say so (the dam break and the oscillator), and every chart is drawn from the branch's own runs and results files by `figs.py` and `figs_essay.py`. Every number in the essay comes from the branch's results files or from the technical description `swmm524-fvlink-how-it-works.docx`, which two AI agents checked against the code and results; the arithmetic in Sections III, VI and X was checked by running it. No person has yet checked the essay's historical statements against the original papers, and no person has reviewed the branch's code line by line."));
add(SEC("", "Where to Read More"));
add(P("The technical description of the branch is `swmm524-fvlink-how-it-works.docx`, in the package's `doc` folder. The full evidence is in `VERIFICATION.md`, and the defect register, with the code of each defect as it was, is in `DEFECTS.md`. The scripts that draw this essay's figures, `figs.py` and `figs_essay.py`, are in the `doc` folder too."));
const REFLIST = [
  "Audusse, E., Bouchut, F., Bristeau, M.-O., Klein, R., and Perthame, B. (2004). A fast and stable well-balanced scheme with hydrostatic reconstruction for shallow water flows. *SIAM Journal on Scientific Computing* 25(6), 2050–2065.",
  "Courant, R., Friedrichs, K., and Lewy, H. (1928). Über die partiellen Differenzengleichungen der mathematischen Physik. *Mathematische Annalen* 100, 32–74.",
  "Davis, S. F. (1988). Simplified second-order Godunov-type methods. *SIAM Journal on Scientific and Statistical Computing* 9(3), 445–473.",
  "Godunov, S. K. (1959). A difference method for numerical calculation of discontinuous solutions of the equations of hydrodynamics. *Matematicheskii Sbornik* 47(89), 271–306.",
  "Harten, A., Lax, P. D., and van Leer, B. (1983). On upstream differencing and Godunov-type schemes for hyperbolic conservation laws. *SIAM Review* 25(1), 35–61.",
  "HydroCouple/openswmm.engine, branch develop, commit 8dd7387: `ExplicitFvSolver.cpp` and the hydraulics reference, Chapter 8 (Finite Volume).",
  "Manning, R. (1891). On the flow of water in open channels and pipes. *Transactions of the Institution of Civil Engineers of Ireland* 20, 161–207 (presented 1889).",
  "Preissmann, A. (1961). Propagation des intumescences dans les canaux et rivières. First Congress of the French Association for Computation, Grenoble.",
  "Rossman, L. A. (2017). *Storm Water Management Model Reference Manual, Volume II – Hydraulics*. U.S. Environmental Protection Agency.",
];
REFLIST.forEach((r) => C.push(new Paragraph({ children: runs(r, { size: 19 }), spacing: { after: 80, line: 264 }, indent: { left: 360, hanging: 360 } })));

// ------------------------------------------------------------- document
const doc = new Document({
  creator: "SWMM Enablement",
  title: "How Many Numbers Make a Pipe?",
  description: "An essay on swmm524-fvlink in the manner of Isaac Asimov",
  styles: {
    default: { document: { run: { font: SERIF, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: SERIF, size: 26, color: "222222" }, paragraph: { outlineLevel: 0, keepNext: true } },
    ],
  },
  footnotes,
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 1440, right: 1584, bottom: 1440, left: 1584 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "How Many Numbers Make a Pipe?", size: 16, italics: true, color: INK2 })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: INK2 })] })] }) },
    children: C,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT, buf.length); });
