# Verification: swmm524-fvlink

**Engine under test:** EPA SWMM 5.2.4 (tag `v5.2.4`, commit `7952ca8`) with
`swmm524-fvlink.patch` applied, built with gcc 13.3 on Linux
(`-O2 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0`).

**Reference:** stock 5.2.4 from the same tag, built with the same flags, in
every comparison.

Every number below comes from a file in `results/`, or from a re-run
described where the number is quoted. Every results file was regenerated on
the final build (`fvlink.c` dated 10/17/26) on 2026-10-17, except
`sweep_no_node_limit.csv`, a 2026-10-13 experiment with the node stability
limit switched off.

## Five-minute version

Each comparison runs one `.inp` on stock and on the patched engine, with
one conduit listed in `[FV_LINKS]`. Three controls back the comparisons:

- **Null effect.** With no `[FV_LINKS]`, the patched engine reproduces stock
  byte for byte on 72 of EPA's 73 regression models. The 73rd stops with the
  same error in both.
- **Determinism.** The same FV run twice gives identical `.out` bytes.
- **Rebuild.** The patch applied to a fresh clone rebuilds a byte-identical
  binary. An OpenMP build run with THREADS 2 writes the same `.out` as the
  serial build on 13 FV models (`results/omp_check.txt`).

**user2.** On EPA's `user2` model, flagging the one channel that stock
handles badly removes a flow oscillation. Re-run at a 5-s report step:

- **Stock:** TW01290 peaks at 1,921 cfs while the channel above it carries
  at most 891 cfs and the one below it at most 537 cfs. It sends
  165,921 ft³ back upstream over 83 reported steps.
- **FV:** TW01290 peaks at 449 cfs with no reversal.
- **Volume:** net volume through the link agrees to 0.02 %.
- Stock's own flow instability index calls its run stable.

**Speed.** On a 400-pipe tree whose average dynamic wave step is pinned at
1.14 s by one 10-ft pipe, flagging that pipe runs in 0.19× the wall time
(0.17× in the 2026-10-13 session).
Every conduit peak flow stays within 0.53 % of stock, and every node peak
depth within 0.80 %.

## The diagnostic that was blind, and the measurement that was not

EPA `user2`, conduit TW01290: an irregular channel, 544 ft long, falling
8.1 ft, routing step 5 s. The run was repeated with REPORT_STEP 5 s so that
every value below is integrated at nearly the routing step.

| | stock DW | DW with TW01290 FV | |
|---|---|---|---|
| routing continuity (%) | 0.285 | 0.280 | by that measure nothing happened |
| Highest Flow Instability Indexes | "All links are stable." | TW01290 (3) | stock calls itself stable |
| peak flow in TW01290 (cfs) | 1,921.2 | 449.3 | upstream TW01300: 890.7 / 628.7; downstream TW01280: 536.8 / 448.8 |
| volume sent upstream through TW01290 (ft³) | 165,921 | 0 | 83 reversed steps vs 0, all within 21 min (12.53–12.88 h) |
| total variation of TW01290 flow (cfs) | 38,260 | 965 | sum of \|ΔQ\| over the 5-s series |
| net volume through TW01290 (ft³) | 7.7633e6 | 7.7648e6 | +0.02 % |
| system outflow volume | | +0.025 % | |

Within a 44-minute window, stock and FV differ by more than 100 cfs for
39 minutes in all. All of these
numbers are in `results/oscillation.txt` (`scripts/oscillation.py`).

**user5 (LIB_9), re-run at a 1-s report step:**

| | stock DW | FV |
|---|---|---|
| reversed seconds | 824 | 4 |
| volume sent upstream (ft³) | 146,996 | 0.008 (at most 0.003 cfs) |
| total variation (cfs) | 225,965 | 84,129 |
| peak (cfs) | 2,119.8 | 1,407.9 |
| net volume through LIB_9 (ft³) | 3.297e6 | 3.267e6 (−0.9 %) |
| system outflow volume | | +0.048 % |

Turns at 1-s resolution, by stats.c's rule: 472 stock, 775 FV. So the FV
series isn't smooth either; its swings are smaller (total variation 84,129
vs 225,965 cfs).

An earlier draft reported a 9.5 % volume loss here. That came from summing a
60-s report series of an oscillating flow, and it disappears at 1-s sampling.

**Gross inflow at node 1126.** The report's gross inflow there falls from
25.8 to 24.4 Mgal. Stock's figure includes the water that sloshes back and
forth.

## Mechanism

**Why the stock index is blind.** SWMM's flow instability index counts
turns: sign changes of dq, the change in a link's flow from one routing step
to the next, counted when |dq| > 0.001 cfs (`stats_updateLinkStats`,
stats.c:748-751). It counts turns, not their size. It scales the count as
`turns * 100 / (2/3 * (steps - 2))` (stats.c:785-790). A link appears in
the table only when its index exceeds 1.

user2 runs 36 h at a 5-s step, about 25,900 steps, so a link needs roughly
170 turns to appear at all. An oscillation with a period of minutes produces
a few dozen: stock's TW01290 has 45 turns in the 5-s series (which is every
routing step), index 0.26. The FV run scores 3: 449 turns, index 2.60, from
small step-to-step wiggles in its delivered flow (total variation 965 cfs
over the run).

Separately, `report_writeMaxFlowTurns` prints "All links are stable" when
`flowTurns[0].index <= 0`, which also hides an unstable link at index 0.
That one is read in source but not reproduced (S5-DW3).

**Why FV removes the oscillation.** Stock carries one flow per conduit,
derived from the two end heads. A steep channel between two nodes with large
surface areas can slosh. The FV link carries its flow on its own cells and
exchanges volume with its end nodes through face fluxes. A semi-implicit
node head update damps the node-pipe mode, and a node stability limit
(A_node/K) keeps it damped.

Removing that limit brings the oscillation back. Measured in the EPA sweep
with the limit switched off (`results/sweep_no_node_limit.csv`), the user2
maximum node depth difference rose from 1.31 ft to 7.05 ft. The limit stays.

**Why mass closes.**

- Each FV link's stored volume changes by exactly what crosses its two end
  faces. The largest error measured is 2.7e-12 %.
- Those face volumes enter the end node's continuity as booked volumes,
  through `fvlink_getNodeVolume()` called from `setNodeDepth()`. That holds
  wherever stock updates a node from its volume change (not surcharged, or
  flooding). A node surcharged under EXTRAN takes its head from the net flow
  and dQ/dH instead, so there the booking isn't exact.
- The reported link flow is the flow the link delivers. Quality routing's
  identity `qIn = |q1| + dV/dt` (qualrout.c:319) therefore returns exactly
  the volume that entered the link.

**The closure identities, by construction and measured.** The table builder
`buildTable()` takes SWMM's `xsect_getAofY` at 256 depths. Where the area
rises, area is piecewise linear in depth, so width is its exact derivative
and I1 its exact integral. `scripts/test_closure.c` links the engine's own
`fvlink.c` and calls `buildTable()` (`results/closure.txt`):

| shape | round trip max (ft) | dA/dh vs W | dI1/dh vs A | area vs SWMM: at table depths / between (of Afull) | width jump at a knot | min width (ft) | depths bridged | width above full (ft) |
|---|---|---|---|---|---|---|---|---|
| CIRCULAR 3 ft | 2.0e-14 | 3.6e-09 | 2.4e-10 | 0 / 8.9e-05 | 40.3 % | 0.366 | 0 | 0.0228 (slot) |
| RECT_CLOSED 3x4 | 2.3e-14 | 6.1e-09 | 3.4e-10 | 0 / 0 | 0 % | 4 | 0 | 0.0386 (slot) |
| RECT_OPEN 4x5 | 4.4e-16 | 1.3e-10 | 1.9e-10 | 0 / 2.8e-18 | 0 % | 5 | 0 | 5.0 (walls) |
| TRAPEZOIDAL | 2.2e-16 | 1.4e-10 | 2.1e-10 | 0 / 2.3e-06 | 1.2 % | 4.02 | 0 | 16.0 (walls) |
| HORSESHOE 5 ft | 2.7e-14 | 2.9e-09 | 1.1e-10 | 0 / 1.8e-04 | 37.7 % | 1.19 | 0 | 0.0668 (slot) |
| SEMICIRCULAR 4 ft | 2.8e-14 | 4.8e-09 | 2.4e-10 | 0 / 7.3e-04 | 43.0 % | 2.03 | 0 | 0.0654 (slot) |
| EGGSHAPED 4 ft | 3.4e-14 | 5.5e-09 | 1.7e-10 | 0 / 2.2e-04 | 38.1 % | 0.399 | 0 | 0.0263 (slot) |
| CATENARY 4 ft | 2.5e-14 | 3.3e-09 | 2.7e-10 | 0 / 4.1e-04 | 43.0 % | 1.12 | 0 | 0.0362 (slot) |
| TRIANGULAR 3x6 | 1.4e-17 | 2.4e-10 | 2.0e-10 | 0 / 3.8e-06 | 200 % | 0.0117 | 0 | 6.0 (walls) |
| RECT_ROUND | 2.6e-14 | 7.9e-09 | 2.1e-10 | 0 / 5.2e-05 | 82.6 % | 0.323 | 0 | 0.0348 (slot) |
| GOTHIC 4 ft | 2.7e-14 | 5.0e-09 | 1.8e-10 | 0 / 7.6e-04 | 46.4 % | 0.849 | 0 | 0.0338 (slot) |

How to read the table:

- **Derivative columns.** These are limited by the 1e-6 finite-difference
  step, not by the closure.
- **Width jump.** The largest relative change between neighbouring
  segments, read on both sides of every knot. It sits at the invert segment,
  where width grows fastest: for the triangle the segment widths run 1:3.
- **Depths bridged.** No built-in shape needed any. The one case among the
  37 conduits flagged in the EPA set is transect 179 in user5, where 3 of 256 depths were bridged
  (S5-DW4, FVL-11).

**Lake at rest** (`results/gates.txt`):

- Head is 105 ft everywhere, and the outfall is FIXED at 105 ft.
- C1: 3-ft circle.
- C2: rectangular open channel with a 0.5 ft inlet offset.
- C3: 2 barrels of 6-ft circle, surcharged.
- C4: trapezoid into the outfall.

| run | max \|Q\| (cfs) | max head drift (ft) |
|---|---|---|
| stock DW | 0 | 0 |
| all four conduits FV | 1.22e-11 | 0 |
| C4 only FV | 0 | 0 |
| C1 only FV | 4.46e-03 | 7.6e-05 |
| C2 only FV | 3.65e-03 | 3.4e-04 |
| C3 only FV | 3.37e-03 | 3.4e-04 |
| C2 and C3 FV | 1.19e-03 | 4.1e-04 |
| **control:** stock DW with J1 seeded +1e-7 ft | 4.16e-03 | n/a |

With every conduit FV, the lake stays still to round-off. A mixed model
doesn't: the FV links' 1e-12 round-off seeds the dynamic wave links, which
then settle at dynamic wave's own noise floor of about 4e-3 cfs. Stock
reaches the same floor from a 1e-7 ft seed.

**Resonator** (`results/gates.txt`). A dead-end manhole (12.566 ft²) on a
surcharged 3-ft FV pipe, 300 ft long, draining to a FIXED outfall. J1 starts
0.05 ft high. The largest deviation in each 30-min window:

```
4.6e-02 1.0e-02 2.2e-03 4.8e-04 1.1e-04 2.3e-05 7.6e-06 0 0 0 0 0
```

With the original explicit node coupling (FVL-2), the same model grew to a
±2.1 ft limit cycle.

Heads in both gates come from the `.out` file, whose single-precision values
resolve about 7.6e-6 ft at 105 ft. A drift or deviation of 0 means none at
that resolution; the last nonzero resonator value, 7.6e-06, is one step.

## Independent review

A review agent read the code without having seen it built. It reproduced
each finding with its own probe model, now in `models/review/`. The
findings and their status are in `DEFECTS.md` as FVL-6 to FVL-10. The
probes run as gate 6 (`results/gates.txt`, final build):

| probe | stock | FV, before the fix | FV, final |
|---|---|---|---|
| flap-gated outfall 4 ft above J1 | min C1 flow 0.000 cfs | 31.7 cfs backflow, J1 floods | min C1 flow 0.000 cfs |
| one pollutant, C1 and C3 FV | quality continuity −0.036 % | −38,402 % | 0.093 %; link TSS within 0.1 mg/L of stock |
| ideal pump and two curve pumps fed by an FV link | pump 9.97 cfs | 4.0 cfs and 0 cfs (wet well floods) | ERROR 116 (unsupported, by design) |
| 180-character link ID | report OK | AddressSanitizer overflow | report OK |
| reversed 2-barrel FV conduit with a 1.0 ft offset | continuity −0.012 % | balanced | −0.010 % |

The review found no fault in the null-effect path, the signs, the
hydrostatic corrections, the node booking, the Picard restart, or repeated
open/close cycles in one process (run under valgrind).

## Document check and final-build controls

Two more agents checked drafts of the technical description (the Word
document) against the code and these results. The first found 3 wrong
statements, 12 imprecise ones and 4 unsupported ones; the second found 5
more wrong statements and several imprecise ones. All are corrected in the
document and here. The second exposed FVL-14 (the report's lengthening
ratio for an FV link). The first exposed FVL-13: when the fourth node estimate still asked for a
shorter substep, the substep was cut without being recorded or held to the
floor. Counted with an instrumented build (`results/pass_count.txt`): 18 of
17,885,456 substeps in the sweep, all in test5, each cut under 2 parts in
1e8.

On the final build:

| control | result | file |
|---|---|---|
| null effect, 73 EPA models | 72 identical, 1 same error | `null_gate.txt` |
| `.out` before vs after the FVL-13 and FVL-14 fixes: 43 test, gate and probe models plus 37 sweep models | every run that completes identical; 3 pump probes stop with the same ERROR 116 on both | `prev_build_cmp.txt` |
| AddressSanitizer + UBSan + leak detection, 13 models | all clean | `asan.txt` |
| OpenMP (THREADS 2) vs serial, 13 FV models (6 use 2 threads) | all identical | `omp_check.txt` |
| suite, sweep, gates, closure, out-diff vs the 2026-10-13 runs | identical except wall time | `suite.csv`, `sweep.csv`, `gates.txt`, `closure.txt`, `outdiff_tree.txt` |
| tree step lengths, FV report rows | as quoted | `report_excerpts.txt` |
| OpenSWMM statements | checked at commit 8dd7387 | `openswmm_check.txt` |

## Consistency with stock dynamic wave (synthetic networks)

`results/suite.csv` holds 14 cases. Each element is measured against its
own peak in the stock run, after a 0.0353 cfs magnitude floor. These are
differences between two numerical schemes, not errors. None of the cases
hit the substep floor.

| case | what is FV | link peak Δ max % | node peak Δ max % (node, ft) | outfall peak Δ % | outfall vol Δ % | continuity DW → FV % | FV link vol. balance % | avg DW step s (DW → FV) | substeps / step |
|---|---|---|---|---|---|---|---|---|---|
| chain30_C4_c1 | part-full, C4 FV 1 cell | 0.59 | 23.2 (J4, 0.41) | -0.24 | -0.044 | -0.057 → -0.053 | 2e-13 | 5.0 → 5.0 | 2.0 |
| chain30_C4_c2 | part-full, C4 FV 2 cells | 0.39 | 19.5 (J4, 0.34) | -0.11 | -0.037 | -0.057 → -0.053 | 1e-13 | 5.0 → 5.0 | 2.0 |
| chain30_C4_c4 | part-full, C4 FV 4 cells | 0.32 | 15.6 (J4, 0.27) | -0.05 | -0.041 | -0.057 → -0.054 | 3e-13 | 5.0 → 5.0 | 2.4 |
| chain30_C4_c12 | part-full, C4 FV default (12 cells) | 0.25 | 10.9 (J4, 0.19) | -0.01 | -0.032 | -0.057 → -0.054 | 3e-13 | 5.0 → 5.0 | 5.4 |
| chain30_C4_c48 | part-full, C4 FV 48 cells | 0.19 | 7.0 (J4, 0.13) | 0.02 | -0.017 | -0.057 → -0.054 | 2e-13 | 5.0 → 5.0 | 22.3 |
| chain30_all | part-full, all 8 conduits FV | 1.53 | 10.4 (J1, 0.29) | -1.53 | -0.206 | -0.057 → 0.038 | 3e-13 | 5.0 → 5.0 | 14.4 |
| chain70_C4 | surcharged (SLOT), C4 FV | 0.99 | 2.4 (J5, 1.11) | -0.99 | -0.109 | -0.064 → -0.061 | 2e-13 | 4.99 → 5.0 | 11.9 |
| chain70_C6 | surcharged (SLOT), C6 FV | 0.74 | 1.8 (J6, 0.88) | -0.74 | -0.098 | -0.064 → -0.061 | 4e-13 | 4.99 → 4.99 | 11.4 |
| chain70_all | surcharged (SLOT), all FV | 5.29 | 2.5 (J5, 2.95) | -5.29 | -1.035 | -0.064 → 0.018 | 3e-13 | 4.99 → 5.0 | 19.9 |
| chain70x_C4 | surcharged (EXTRAN), C4 FV | 0.40 | 1.4 (J5, 1.27) | -0.40 | -0.075 | -0.041 → -0.064 | 2e-13 | 4.98 → 4.99 | 17.0 |
| short_C3 | 10-ft C3 FV, ROUTING_STEP 10 s | 0.70 | 5.5 (J3, 0.11) | 0.70 | -0.029 | -0.064 → -0.041 | 4e-14 | 1.13 → 10.0 | 105.9 |
| channel_C2 | rect. channel, C2 FV 80 cells | 6.43 | 7.8 (J2, 0.46) | -1.83 | 0.029 | -0.323 → -0.323 | 4e-14 | 5.0 → 5.0 | 10.0 |
| mixed_4fv | storage + shared junction + outfall link FV | 1.02 | 19.7 (S1, 0.47) | -1.02 | -0.077 | -0.018 → 0.005 | 4e-13 | 5.0 → 5.0 | 22.9 |
| mixed_C1 | storage outlet only FV | 0.44 | 19.9 (S1, 0.47) | -0.44 | -0.053 | -0.018 → -0.017 | 7e-14 | 5.0 → 5.0 | 9.1 |

How to read it:

- **Mesh refinement on one link** (chain30, 1 to 48 cells). The extra head
  at the FV link's upstream node shrinks from 0.41 to 0.13 ft. It is
  numerical, not an entrance loss. The likely cause is the half-cell bed
  step at each conduit end; OpenSWMM's Chapter 8 (commit 8dd7387) describes
  the same artificial step at manholes and the same remedy, more cells
  (`results/openswmm_check.txt`). A second likely cause is the Riemann
  solver's dissipation at the node faces, which OpenSWMM's solver code names
  and avoids at two-conduit junctions with a pass-through ghost. The split
  wasn't measured.
- **Storage outlet** (S1, +0.47 ft). The same interface loss, against a
  large storage area.
- **channel_C2.** The peak deltas come from the dry start. At steady state
  the FV reach sits at 1.6592 ft against Manning normal depth of 1.6559 ft
  (+0.20 %) and carries 60.0001 cfs. The DW reaches sit at 1.6559 ft.

## What it costs

Timings use `interleave-timing.js` with n = 7, interleaved
(`results/timing_*.txt`, final build). Run-to-run noise on this machine is
6-30 %, so per-pair ratios are quoted.

| comparison | A median | B median | B/A (per-pair range) |
|---|---|---|---|
| 400-pipe tree with a 10-ft trunk pipe: stock vs that pipe FV | 4.783 s | 0.896 s | 0.19× (0.16–0.19), resolved |
| same tree without the short pipe (stock) vs the FV run above | 0.580 s | 0.831 s | 1.43× (1.24–1.54), resolved |

The 2026-10-13 session on the earlier build measured 0.17× (0.16–0.20) and
1.32× (1.20–1.68) (`results/timing_*_2026-10-13.txt`). Flagging the short
pipe recovers most of the speed of a network that never had it. The FV link
itself costs roughly 1.3× to 1.5× on this network. The second row
compares two different networks, so read it as the price of the FV link,
not a like-for-like test.

On results, `results/outdiff_tree.txt` (tree, stock vs FV):

- 400 conduits: median \|peak change\| 0.34 %, max 0.53 %, time-averaged
  max 0.13 %.
- 401 nodes: \|peak change\| max 0.80 %.

Sweep wall times in `sweep.csv` are single runs, not interleaved. Very short
cells are the expensive case. user4's flagged link is 1.88 ft long (stock
lengthens it 509-fold under `LENGTHENING_STEP 5`; the FV link keeps its true
length), so its cells are 0.47 ft and fast shallow flow (up to 39 ft/s) sets
the substep. extran10's 1,000-ft link fills to its crown, in a model with
fixed 60-s routing steps, and subcycles at the 100 ft/s slot celerity:

| model | stock | FV | FV substeps per step |
|---|---|---|---|
| user4 | 3.0 s | 15.5 s | 791 |
| extran10 | 0.004 s | 1.1 s | 957 |
| test2 | 0.03 s | 1.1 s | 75 |
| test3 | 0.06 s | 0.9 s | 119 |

## What the test networks contain

**EPA swmm-nrtestsuite v2.5.0-dev, 73 models** (`results/sweep.csv`):

- 32 models aren't dynamic wave (31 KINWAVE, 1 STEADY). They test only the
  null effect.
- 4 dynamic wave models have no conduits.
- 37 models ran with one conduit flagged: the conduit with the largest stock
  peak flow that the FV validator accepts.
  - Size: 3 to 209 nodes, 3 to 276 links.
  - Flagged shapes: 20 circular, 10 trapezoidal, 4 street, 3 irregular.
  - Default cell counts: 4 to 40.
  - Units: 5 SI (CMS) models; the rest US (CFS).
  - All 37 use EXTRAN surcharge. SLOT is tested only in the synthetic
    chains.
  - Three use `LENGTHENING_STEP`; stock lengthens the flagged link in one
    (user4).

**Synthetic** (`scripts/gen.py`):

- Shapes: circular in single and double barrel, rectangular closed,
  rectangular open, and trapezoidal.
- Nodes: a functional storage unit, plus FIXED, NORMAL and FREE outfalls.
- A 0.5 ft offset.
- Two consecutive FV links sharing a junction.

**Review probes** (`models/review/`):

- a gated outfall
- a pollutant
- a reversed, two-barrel, offset conduit
- three pump wet wells
- a long link ID

**This set can't tell you about:**

- egg, horseshoe, gothic or custom conduits in a running model (they are
  covered only by the closure gate)
- reactive pollutants
- ponding
- hot start
- control rules acting on an FV link

**The sweep in one paragraph:**

- FV link volume balance stays at or below 2.7e-12 % in all 37 runs, with
  0 floor hits.
- System outflow volume changes by a median absolute 0.014 % (signed
  median 0.000 %).
- The only model above 0.5 % is extran8a, at +22.7 %. It starts with
  InitFlow = 20 cfs in two links, and stock dynamic wave recomputes each
  link's volume from its end depths in the first step. In stock the two
  links' jumps cancel (−0.98 % continuity). With one of them FV, the other's
  jump stands (−7.39 %). The imbalance appears in the first 20-s step and
  then stays flat. With the initial flows removed, stock gives −6.87 % and
  FV −6.70 % (S5-DW1).
- The flagged-link peak changes by a median absolute 0.04 %. Four links moved
  more than 5 %:
  - user2: −73 % (the oscillation above)
  - user5: −38 % (oscillation)
  - gate_control_2: +23 % (a gate-release surge that FV carries with a
    sharper front; same volume)
  - gate_control_3: −13 % (a single 60-s report spike)
- The largest worst-instant node difference is test3's 15.6 ft at node 7,
  during a near-vertical drawdown from a 49-ft surcharge. The drop happens
  about one minute apart in the two runs. Peak depths differ by 0.5 ft, and
  the steady states agree.

## WebAssembly build (2026-10-21)

The FV Link Lab app runs both engines in the browser. They are the same
source compiled with Emscripten 3.1.51 (system LLVM 18, Binaryen 116),
`-O2`, single-file glue, run in a Web Worker with a fresh module per run.
Each was run against its native build on every test, gate and probe model
(67 runs) and on all 73 EPA models (`results/wasm_check.txt`):

| set | .out and .rpt identical | .out identical, .rpt round-off | .out differs | same error |
|---|---|---|---|---|
| test, gate and probe models, FV engine | 52 | 10 | 2 | 3 |
| EPA suite, stock engine | 65 | 1 | 6 | 1 |
| EPA suite, FV engine | 65 | 1 | 6 | 1 |

- Inside WebAssembly the null effect holds exactly: the stock and FV
  engines write identical bytes on all 73 EPA models.
- The report-only differences are the last digit of a 1e-13 % FV volume
  balance and the minute at which a flat peak is reported.
- The largest `.out` difference is 16.2 cfs in a 1,962-cfs peak (0.83 %),
  in stock dynamic wave on user5. The largest relative one is 0.44 cfs in a
  29.8-cfs peak (1.5 %), on `review/rev_fvall.inp` with every conduit FV.
- A native clang 18 build matches the native gcc build on Example1, user5
  and Example3, so the compiler is not the cause. The difference follows
  the math library (musl in the WebAssembly build, glibc natively). That was
  found by elimination, not function by function.
- The app itself was tested headless in Chromium (`results/app_browser_test.txt`):
  each of its 9 samples was run through the page's own engines, and the
  inputs the page built were run through the native engines. All 18 `.out`
  files are byte-identical; 3 FV reports differ in the 1e-13 % volume
  balance digit or a flat peak's time. The page's tree runs reproduce the
  tested `runs/tree_dw.out` and `runs/tree_fv.out` exactly, and its null
  check on the tree is byte-identical.

## What this does not show

- No observed data. Stock dynamic wave is a reference, not the truth.
- The extra head at FV link ends is numerical and shrinks with refinement.
  It isn't calibrated entrance-loss physics.
- "Exact" mass means exact for the FV link and its booking into nodes, except
  at a node surcharged under EXTRAN. Whole-model continuity is still dynamic
  wave's.
- A mixed model at rest sits at dynamic wave's noise floor, not at zero.
- Not tested: reactive water quality, ponding, hot start continuity, or
  control rules acting on an FV link.
- Pumps or dummy conduits drawing from an FV end node are rejected, not
  supported.
- Native Linux (gcc 13.3, serial and OpenMP) and the WebAssembly build
  above. No Windows or MSVC.
- No comparison against OpenSWMM's own FV engine.

## Reproduction

```
git clone --branch v5.2.4 https://github.com/USEPA/Stormwater-Management-Model.git stock
cp -r stock patched && (cd patched && git apply ../swmm524-fvlink.patch)
# build both: gcc -O2 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 -Isrc/solver -Isrc/solver/include src/solver/*.c src/run/*.c -lm
git clone --branch v2.5.0-dev https://github.com/USEPA/swmm-nrtestsuite.git nrtest
scripts/null_gate.sh $STOCK $FV nrtest work/null            > results/null_gate.txt
python3 scripts/suite.py $STOCK $FV models runs results      # results/suite.csv
python3 scripts/sweep.py $STOCK $FV nrtest work/sweep results/sweep.csv
python3 scripts/gates.py $STOCK $FV models runs/gates results/gates.txt
node out-diff.js runs/tree_dw.out runs/tree_fv.out          # results/outdiff_tree.txt
node interleave-timing.js -n 7 --a "$STOCK models/tree_dw.inp a.rpt a.out" --b "$FV models/tree_fv.inp b.rpt b.out"
python3 scripts/oscillation.py $STOCK $FV nrtest/public/user work/osc results/oscillation.txt
scripts/asan_runs.sh $FV_ASAN . runs/asan_final > results/asan.txt   # gcc -O1 -g -fsanitize=address,undefined
scripts/omp_check.sh $FV $FV_OMP . runs/omp > results/omp_check.txt  # gcc -O2 -fopenmp
```

Paths given to the scripts must be absolute, because each run starts in the
model's own folder.

Notes:

- `out-diff.js` and `interleave-timing.js` are the corinne-testing scripts.
- The closure gate builds from the patched `src/solver` directory:
  `gcc ... test_closure.c $(ls *.c | grep -v fvlink.c) -lm`.
- `scripts/oscillation.py` makes the user2 (5-s) and user5 (1-s)
  re-runs itself.
- The patch applied to a fresh clone rebuilt a binary byte-identical to the
  tested one.
