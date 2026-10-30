# Defect register: swmm524-fvlink sessions, 2026-10-13 to 2026-10-17 (FVL-15 added 2026-10-30)

There are two kinds of entry. The FVL- entries are bugs in this branch. FVL-1 to
FVL-14 were found and fixed before delivery; FVL-15 is open; they are kept because each one is a trap
for anyone porting the scheme. The S5- entries are stock EPA SWMM 5.2.4
behaviour seen during verification.

Each FVL- entry shows the code as it stood when the bug was live.

I found FVL-1 to FVL-5, FVL-11 and FVL-12. FVL-6 to FVL-10 came from an
independent review agent that had not seen the work being built; its probe
models are in `models/review/`. FVL-13 and FVL-14 came from two more agents
that checked drafts of the technical description against the code.

---

## FVL-1  A still-water ghost choked flow out of the FV link

```
Engine / version:   swmm524-fvlink, first draft
Where:              src/solver/fvlink.c  solveSystem(), the end-face states
What:               The node ghost had zero velocity, so water leaving the pipe
                    hit a still pool and backed up. The ghost now takes the
                    adjacent cell's velocity; the node supplies only the head.
Reproduce:          gen.chain(qpeak=30, fv=["C4"]): J4 max depth 8.83 ft
                    (stock 1.73 ft); fixed build 1.92 ft
Detected by:        consistency with stock dynamic wave (node depth summary)
Blast radius:       every FV link end
Status:             fixed (uL = velOf(f, f->a[0], f->q[0]); uR likewise).
                    OpenSWMM's ExplicitFvSolver.cpp makes the same choice.
```

The code as it was:

```c
                    zR = f->z2;
                    etaR = NdH[f->n2];
                    hR = MAX(0.0, etaR - zR);
                    uR = 0.0;
```

## FVL-2  Explicit node coupling pumped a manhole-pipe oscillation

```
Engine / version:   swmm524-fvlink, second draft
Where:              src/solver/fvlink.c  solveSystem()
What:               The node head at the start of a substep fixed the face
                    fluxes, and those fluxes then advanced the node. That is
                    forward Euler on an oscillator, so energy grew. Fixed with a
                    backward-Euler head estimate per substep, using the end
                    faces' conductance sqrt(g*A*T), and then re-solving those
                    faces at that head.
Reproduce:          models/gates/resonator.inp: a 0.05 ft disturbance grew to a
                    +/-2.1 ft limit cycle. Fixed build: falls ~4.6x per 30 min.
                    In models/gates/lake_C1.inp the mode grew from round-off to
                    1.5 cfs within the 2-h run.
Detected by:        lake-at-rest gate (Corinne test 2). Continuity could not
                    see it, because mass was exact the whole time.
Blast radius:       any FV link with a dead-end or small-area end node
Status:             fixed
```

The code as it was:

```c
        for (i = 0; i < NNodes; i++)
        {
            n = NodeList[i];
            NdH[n] = nodeHead(n, t, dt);
...
            NdV[f->n1] -= f->fm[0] * f->barrels * dts;
            NdV[f->n2] += f->fm[nc] * f->barrels * dts;
```

## FVL-3  Reported link flow was the cell momentum, not the conveyed water

```
Engine / version:   swmm524-fvlink, third draft
Where:              src/solver/fvlink.c  solveSystem(), qSum accumulation
What:               On a sloped bed, the cells' Q differs from the face mass
                    flux by the HLL diffusion term. The report showed cell Q.
                    The first fix reported the length-weighted mean face
                    flux; FVL-8 later replaced that with the delivered flow.
Reproduce:          gen.channel(fv=[("C2", 80)]): steady 60 cfs read 59.536;
                    fixed build 60.0001
Detected by:        steady uniform-flow gate (the reported flow should equal
                    the inflow)
Blast radius:       reported flow only; mass was always carried by face fluxes
Status:             fixed (superseded by FVL-8)
```

The code as it was:

```c
                f->q[c] = qnew;
                qbar += qnew;
...
            f->qSum += qbar / nc * dts;
```

## FVL-4  Slot area counted as conveyance in friction

```
Engine / version:   swmm524-fvlink, third draft
Where:              src/solver/fvlink.c  solveSystem(), semi-implicit Manning
What:               Above the crown, friction divided by the slot-inflated area.
                    Friction now uses min(A, Afull) for closed shapes.
Reproduce:          not measured separately (it matters only for deep surcharge)
Detected by:        reading, while explaining test3's 49-ft surcharge
Blast radius:       closed FV links surcharged well above the crown
Status:             fixed
```

The code as it was:

```c
                    if ( r > 0.0 )
                        qnew /= 1.0 + dts * f->rf * fabs(qnew) /
                                (anew * pow(r, 4.0/3.0));
```

## FVL-5  Positivity factors were computed from half-scaled fluxes

```
Engine / version:   swmm524-fvlink, first draft (never run)
Where:              src/solver/fvlink.c  solveSystem(), donor limiter
What:               Each cell's factor was computed inside the face loop, after
                    its left face could already have been scaled. A cell
                    draining through both faces could then lose more water than
                    it held. All cell factors are now computed first, from the
                    unscaled fluxes.
Reproduce:          none; caught in review
Detected by:        reading
Status:             fixed before the first run
```

The code as it was:

```c
                        c = m - 1;
                        out = (f->fm[c+1] > 0.0 ? f->fm[c+1] : 0.0) +
                              (f->fm[c]   < 0.0 ? -f->fm[c]  : 0.0);
                        vol = f->a[c] * f->dx;
                        lam = (out * dts > vol) ? vol / (out * dts) : 1.0;
```

## FVL-6  Pumps and dummy conduits at an FV end node read the wrong inflow

```
Engine / version:   swmm524-fvlink, before review
Where:              src/solver/dynwave.c  findLinkFlows(): pumps are solved
                    before fvlink_findFlows(); link.c:1573 and
                    dynwave.c getModPumpFlow()
What:               An ideal pump or dummy conduit takes its flow from the
                    node's inflow, which does not yet include the FV face flow
                    when it is read. FV links add no surface area to their end
                    nodes, so getModPumpFlow() divided by zero:
                      y = Node[j].oldDepth + netFlowVolume / Xnode[j].newSurfArea;
                    The fix is to reject this case (ERROR 116). My README had
                    said such pumps "see the FV flow from the previous Picard
                    iteration"; that was wrong, they saw none of it.
Reproduce:          models/review/pump*_fv.inp. Ideal pump 9.97 cfs stock vs
                    4.0 cfs FV; PUMP2 curve 9.97 vs 0, with the wet well
                    flooding. Fixed build: ERROR 116.
Detected by:        independent review
Blast radius:       any pump or dummy conduit whose inlet node is an FV end node
Status:             fixed by rejection; making it work needs the FV inflow
                    moved ahead of the non-conduit links
```

The code as it was (no check of this kind existed):

```c
        if ( RouteModel != DW ||
             Link[j].type != CONDUIT ||
             Link[j].xsect.type == DUMMY ||
```

## FVL-7  A flap-gated outfall let water back up the FV link

```
Engine / version:   swmm524-fvlink, before review
Where:              src/solver/fvlink.c  fvlink_validate() and faceFlux()
What:               The validator checked only the conduit's own gate. Stock
                    also closes a link whose inflow end is an outfall with
                    Gated YES (link_setFlapGate, link.c:663-668). The FV end
                    face now becomes a wall whenever its flux would carry
                    water from a gated outfall into the pipe.
Reproduce:          models/review/gate_fv.inp: FIXED stage 104 ft, Gated YES,
                    J1 invert 100 ft. Peak backflow 31.7 cfs with J1 flooding.
                    Stock lets none through: its minimum flow is 0.000 cfs
                    and its peak, 0.73 cfs, is forward flow. Fixed build:
                    minimum flow 0.000 cfs, same as stock.
Detected by:        independent review
Status:             fixed
```

The code as it was:

```c
             Link[j].hasFlapGate ||
```

## FVL-8  Water quality routing blew up on FV links

```
Engine / version:   swmm524-fvlink, before review
Where:              src/solver/fvlink.c  setLinkResults()
What:               Quality routing treats a conduit as one flow plus a change
                    in storage: qualrout.c:319 qIn = |q1|*barrels + (v2-v1)/dt,
                    and findLinkMassFlow() delivers newFlow*c downstream. The
                    FV link set q1 to its inflow, which counted the storage
                    change twice, and newFlow to the mean face flux, which is
                    not what node2 receives. Both are now the delivered flow:
                    out of the downstream face, or out of the upstream face
                    when the net movement is upstream.
Reproduce:          models/review/q_fv.inp (TSS, C1 and C3 FV): quality
                    continuity -38,402 % (stock -0.036 %). Fixed build:
                    0.093 %, concentrations within 0.1 mg/L of stock.
Detected by:        independent review
Status:             fixed
```

The code as it was:

```c
    qBar = f->qSum / dt;

    Conduit[k].a1 = aBar;
    Conduit[k].q1 = f->vIn / dt;
    Conduit[k].q2 = f->vOut / dt;
```

## FVL-9  The report line overflowed with a long link ID

```
Engine / version:   swmm524-fvlink, before review
Where:              src/solver/fvlink.c  fvlink_report()
What:               A fixed 200-char buffer was filled with sprintf. SWMM
                    allows IDs far longer than that. Lines are now written
                    straight to the report file.
Reproduce:          models/review/longid.inp (180-char ID): AddressSanitizer
                    stack-buffer-overflow. Fixed build writes the report.
Detected by:        independent review (AddressSanitizer)
Status:             fixed
```

The code as it was:

```c
    char    line[200];
...
        sprintf(line, "  %-16s %7d %8.2f %9.1f %9.0f %8.4f %8.1e",
            Link[f->link].ID, f->nCells, f->dx * UCF(LENGTH),
```

## FVL-10  The node limiter ignored the node's other outflows

```
Engine / version:   swmm524-fvlink, before review
Where:              src/solver/fvlink.c  solveSystem(), node positivity
What:               The water a node could give to its FV links counted the
                    non-FV net inflow only when it was positive, so non-FV
                    withdrawals were ignored. The node could then be drawn
                    below its invert, and setNodeDepth() clips that to zero,
                    which creates water. It now uses the signed value.
Reproduce:          not isolated in a model; found by reading
Detected by:        independent review
Status:             fixed
```

The code as it was:

```c
            avail = (NdH[n] - Node[n].invertElev) * NdArea[n] +
                    MAX(0.0, qe) * dts;
```

The same review raised two risks, both closed:

- **End faces sized on stale speeds.** The substep was sized on wave speeds
  measured before the end faces were re-solved at the new node heads. The
  step is now re-checked against the re-solved faces, for up to four node
  estimates (FVL-13 covers the case where the fourth still asks for less).
- **Silent floor.** The 0.001 s floor silently overrode the stability limit.
  The report now counts every such substep as a Floor Hit.

## FVL-11  A flat stretch in SWMM's area table meant infinite wave speed

```
Engine / version:   swmm524-fvlink, found after the review fixes
Where:              src/solver/fvlink.c  geometry table (now buildTable())
What:               Where SWMM's area did not rise with depth, the table forced
                    a 1e-12*aFull step. That gave a near-zero width and a wave
                    speed c = sqrt(gA/W) of tens of thousands of ft/s, which
                    pinned the substep at the floor. The table now keeps SWMM's
                    area at each depth where it reaches a new maximum and joins
                    those depths with straight lines.
Reproduce:          EPA user5 with LIB_9 (transect 179) FV: minimum width
                    3.7e-8 ft at 0.234 ft depth, smax 40,930 ft/s, 69,031
                    substeps forced to the 0.001 s floor. Fixed build: 3 of 256
                    depths bridged, 0 floor hits.
Detected by:        the Floor Hits column added for the FVL-10 review risk
Blast radius:       FV links on irregular or street transects whose width
                    jumps within the first 4 % of depth
Status:             fixed
```

The code as it was:

```c
        a = xsect_getAofY(x, y);
        if ( a <= f->tA[i-1] ) a = f->tA[i-1] + 1.0e-12 * x->aFull;
        f->tA[i] = a;
```

## FVL-12  The FV report's rule line sat two columns right of the table

```
Engine / version:   swmm524-fvlink, build of 2026-10-13
Where:              src/solver/fvlink.c  fvlink_report()
What:               report_writeLine() already starts each line with two
                    spaces, and the rule string carried two more, so the
                    dashed line under the column headings started two columns
                    to the right of the table. The string's leading spaces
                    are removed.
Reproduce:          any run with an FV link: compare the dashed line with the
                    heading lines of the Finite-Volume Link Summary
Detected by:        reading the report while writing the technical description
Blast radius:       report layout only; .out unchanged (null gate still 72
                    identical, gates unchanged)
Status:             fixed 2026-10-17
```

The code as it was:

```c
    report_writeLine("  -----------------------------------------------------"
                     "----------------------------");
```

## FVL-13  A substep cut after the last node estimate went unrecorded

```
Engine / version:   swmm524-fvlink, builds of 2026-10-13 to 2026-10-17
Where:              src/solver/fvlink.c  solveSystem(), the end-face re-check
What:               The node estimate and end-face re-solve run up to four
                    times. When the fourth still asked for a shorter substep,
                    the loop cut the substep and left without a new estimate,
                    without the 0.001 s floor check, and without recording the
                    substep for the Min Substep column. A substep below the
                    floor would have run unreported. The final substep is now
                    recorded and held to the floor like any other (FV_MAX_PASS
                    names the four). The fourth estimate is still used for it.
Reproduce:          scripts/pass_count.patch on the build before the fix
                    (results/pass_count.txt): 18 of 17,885,456 substeps in the
                    37-model EPA sweep, all in test5; each cut was less than
                    2 parts in 1e8, the shortest such substep 1.29 s (test5
                    reports a minimum of 0.6956 s). None in 3,692,824
                    substeps of the test networks.
Detected by:        independent check of the technical description, which had
                    said a substep is never shorter than 0.001 s
Blast radius:       the Min Substep and Floor Hits columns, on the rare
                    substep that runs out of estimates; no .out changed
                    (every run that completes identical, 3 pump probes stop
                    with the same ERROR 116; results/prev_build_cmp.txt)
Status:             fixed 2026-10-17
```

The code as it was:

```c
        for (pass = 0; pass < 4; pass++)
        {
            floorHit = FALSE;
            dtStable = dts;
            if ( dts < FV_MIN_DT && dts < remaining )
            {
                dts = MIN(FV_MIN_DT, remaining);
                floorHit = TRUE;
            }
...
            if ( floorHit || dtEnd >= dts * (1.0 - 1.0e-9) ) break;
            dts = dtEnd;
        }
        if ( dtStable < remaining )
```

## FVL-14  The report gave an FV link stock's lengthening ratio

```
Engine / version:   swmm524-fvlink, builds of 2026-10-13 to 2026-10-17
Where:              src/solver/fvlink.c  buildLink(); read by stock
                    statsrpt.c (Flow Classification Summary)
What:               Under LENGTHENING_STEP, stock stretches short conduits so
                    they don't limit the Courant step, and the Flow
                    Classification Summary prints modLength / length. An FV
                    link is solved at its true length and takes no part in
                    that step, but buildLink() left stock's modLength in
                    place. buildLink() now resets it to the true length. The
                    lengthened value is used nowhere else for an FV link
                    (dwflow.c and the Courant step skip FV links).
Reproduce:          EPA user4 with 23916007-23916003 FV (sweep): the column
                    read 508.59 for a 1.88-ft link; fixed build 1.00
                    (results/report_excerpts.txt)
Detected by:        second check of the technical description, which had
                    said no sweep model used LENGTHENING_STEP with FV links
Blast radius:       report only; no .out changed (results/prev_build_cmp.txt)
Status:             fixed 2026-10-17
```

The code as it was (buildLink(), then the stock report line that read the
value it left behind):

```c
    f->barrels = Conduit[f->conduit].barrels;
    f->length = link_getLength(j);
    if ( cells < 0 )
...
        fprintf(Frpt.file, "  %6.2f ", Conduit[k].modLength / Conduit[k].length);
```

## FVL-15  An inflow ghost paired the node's level with the link's velocity

```
Engine / version:   swmm524-fvlink, builds of 2026-10-13 to 2026-10-17 (current)
Where:              src/solver/fvlink.c  faceFlux(), the end-face states
                    (m == 0 and m == nc)
What:               At an end face the ghost state takes its water level from
                    the node head and its velocity from the adjacent cell.
                    Where the node is a still pool feeding the link, the ghost
                    carries about u^2/2g of energy the pool does not have, and
                    the link sustains a jet out of the pool, uphill if need be.
                    The cell velocity in the ghost is FVL-1's fix; FVL-1 and
                    FVL-15 are the two wrong answers to one question: what
                    velocity does the water have just before it enters the
                    link? A SWMM node carries no velocity of its own.
Reproduce:          examples/thoth-mars/runs/CM_lockfv.inp on the engine built
                    with GRAVITY 12.2 (THROAT and CULVERT in [FV_LINKS], 4
                    cells each). Hour 24, base flow: LOCK head 158.28 ft
                    (0.63 ft deep), BASIN head 165.95 ft, THROAT 300 cfs at
                    11.9 ft/s from LOCK into BASIN, 7.7 ft uphill. The LOCK
                    starts level with the basin (165.44 ft) and falls 6.7 ft
                    within the first simulated hour. u^2/2g at 11.9 ft/s and
                    g = 12.2 is 5.8 ft.
Detected by:        building the Thoth canal model for the story "Thaw on the
                    Thoth" (examples/thoth-mars); the throat run's lock and
                    basin heads read from its .out file
Blast radius:       FV links whose upstream node holds slow water (storage,
                    a lock, a wide junction): the inflow face. Links fed by a
                    moving channel are much less affected: in the Thoth model
                    the node above the FV culvert peaks at 13.27 ft in stock
                    dynamic wave and with the culvert as 1 or 4 FV cells.
Status:             open. Not fixed. Five prototypes tried (prototypes/), none
                    adopted; see the table below.
```

The code as it is:

```c
    // --- left state
    if ( m == 0 )
    {
        zL = f->z1;
        etaL = hd1;
        hL = MAX(0.0, etaL - zL);
        uL = velOf(f, f->a[0], f->q[0]);
    }
    ...
    // --- right state
    if ( m == nc )
    {
        zR = f->z2;
        etaR = hd2;
        hR = MAX(0.0, etaR - zR);
        uR = velOf(f, f->a[nc-1], f->q[nc-1]);
    }
```

Prototypes (diffs against the current `fvlink.c` in `prototypes/`):

| Diff | What it changes | Result |
|---|---|---|
| fvl-15.diff | Ghost velocity from the Riemann invariant instead of the cell velocity | Throat still oscillates (Earth company model) |
| fvl-15b.diff | Energy-consistent entrance: ghost satisfies h + u^2/2g = node head (Bernoulli), outflow face by invariant | Earth company model: throat oscillation gone, continuity -0.008 %. Mars Thoth (CM_lockfv.inp): jet gone, but at base flow the LOCK still sits 1.97 ft below the BASIN while 300 cfs runs into it; the culvert is throttled to 3,412 cfs of 4,200 and the canal floods at U4 (199 Mgal) and L6 (256 Mgal). Test suite: every FV inflow node rises by about one velocity head (chain30 J4 +0.76 to +0.78 ft at 1 to 48 cells; chain70 J4 +3.49 ft). It treats every node as a still pool. |
| fvl-15c.diff | Inflow velocity capped at the node's wave celerity | Suite parity kept; throat still oscillates |
| fvl-15d.diff | Critical-depth entrance when the cell is supercritical | Better, but the throat still swings about 8,600 cfs |
| fvl-15e.diff | 15d plus the outflow invariant | Throat still oscillates; suite parity worse |

A fix needs the approach velocity of the node, which SWMM does not keep. A
candidate is the node's net inflow divided by an area taken from its other
connected links. It has not been tried.

---

## S5-DW1  First-step link volume jump when conduits start with InitFlow

```
Engine / version:   EPA SWMM 5.2.4 (v5.2.4 tag)
Where:              src/solver/dwflow.c  dwflow_findConduitFlow(), last lines:
                    Link[j].newVolume = aMid * link_getLength(j) * barrels;
                    with aMid = (a1 + a2)/2 from the end depths
What:               A conduit with InitFlow starts at its normal-depth volume.
                    Node depths start as averages of the connected link depths.
                    In the first step, the link volume is recomputed from the
                    end depths and jumps, which creates or destroys water.
Reproduce:          EPA extran8a, report step set to 20 s. Link 10081 goes from
                    25,966 to 19,581 ft3 and link 10082 from about 17,333 to
                    25,048 ft3 in the first 20 s. Stock continuity is -0.98 %
                    because the two jumps nearly cancel. With InitFlow removed
                    from both links, stock gives -6.87 %.
Detected by:        system-volume balance per period (Corinne test 3). With
                    10081 as FV its jump disappears, 10082's stands, and
                    continuity reads -7.39 %.
Blast radius:       models with InitFlow, or initial depths that disagree with
                    the link depths
Status:             open, not reported
```

## S5-DW2  The flow instability index cannot see report-scale oscillation

```
Engine / version:   EPA SWMM 5.2.4
Where:              src/solver/stats.c  stats_updateLinkStats() (turn count) and
                    stats_findMaxStats() (index = turns*100/(2/3*(steps-2)))
What:               A turn is a sign change of dq, the change in flow from one
                    routing step to the next, counted when |dq| > 0.001 cfs.
                    The index counts turns, not their size, so an oscillation
                    with a period of minutes scores far below the reporting
                    threshold of 1, while small step-to-step wiggles can
                    score above it.
Reproduce:          EPA user2, stock run. TW01290 reads 818, -281, 845, 1662,
                    -86 cfs in consecutive 5-minute periods, and the report says
                    "All links are stable." At a 5-s report step (= the
                    routing step) TW01290 has 45 turns, index 0.26; as an FV
                    link it has 449, index 2.60, reported as 3
                    (results/oscillation.txt).
Detected by:        direct series measurement (reversals, total variation)
Blast radius:       any long run with a small routing step
Status:             a limitation of the index's definition, not a coding bug
```

## S5-DW3  "All links are stable" hides link index 0

```
Engine / version:   EPA SWMM 5.2.4
Where:              src/solver/report.c  report_writeMaxFlowTurns():
                    if ( nMaxStats <= 0 || flowTurns[0].index <= 0 )
What:               The table is seeded with index -1. Testing <= 0 instead of
                    < 0 means that when the most unstable link is the first link
                    in the file (index 0), the report says all links are stable.
Reproduce:          not yet; read in source
Detected by:        reading, while tracing S5-DW2
Blast radius:       models whose first [CONDUITS] entry is the most unstable link
Status:             open, unverified
```

## S5-DW4  Irregular transect area falls as depth rises

```
Engine / version:   EPA SWMM 5.2.4
Where:              src/solver/xsect.c  lookup(), used by xsect_getAofY() for
                    IRREGULAR (and the width table)
What:               For the first two of the 50 intervals of the 51-entry
                    table, lookup() adds
                    a quadratic correction through table[i..i+2] and keeps it
                    only when it is positive; otherwise it falls back to the
                    linear value. On a transect that widens sharply near its
                    invert, the area therefore jumps between the two
                    interpolants and falls as depth rises.
Reproduce:          EPA user5, transect 179 (2-ft V notch, then a 146-ft flat
                    overbank at 0.565 ft, yFull 15 ft):
                      A(0.39 ft) = 3.25213 ft2,  A(0.42 ft) = 0.24441 ft2
                      W(0.30 ft) = 1.2 ft,       W(0.33 ft) = 22.19 ft
                    The true area of the V at 0.42 ft is 2y^2 = 0.35 ft2.
Detected by:        FVL-11 (an FV link needs dA/dy >= 0)
Blast radius:       irregular and street transects with a sharp change in width
                    in the first 4 % of their depth; stock dynamic wave reads
                    these areas for its midpoint area each step
Status:             open, not reported
```

The code:

```c
    // --- use quadratic interpolation for low x value
    if ( i < 2 )
    {
        y2 = y + (x - x0) * (x - x1) / (delta*delta) *
             (table[i]/2.0 - table[i+1] + table[i+2]/2.0) ;
        if ( y2 > 0.0 ) y = y2;
    }
```
