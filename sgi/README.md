# SGI: a staggered-grid implicit head solve for EPA SWMM 5.2.4

Branch `dev-sgi_solver` of SWMMBobSWMM6/Stormwater-Management-Model, off `develop`.
An experimental solver option, opt-in at run time; not proposed for EPA as it stands.

Built 2 October 2026 against the pristine `v5.2.4` tag. US units throughout.
Third revision the same day, after chasing the water creation on Greenville.

## Where it stands

- **The water creation is fixed.** It was three faults in this module, not physics. On
  Greenville SGI now closes at -1.0% to -1.1% at every step from 5 s to 60 s. Stock closes at
  +2.2% to +8.2%.
- **Chasing it turned up two bookkeeping gaps in stock 5.2.4**, both measured on the stock
  solver itself: an open channel goes on giving its end nodes surface area after the water
  is over its top, and a lengthened conduit gives surface area for its lengthened length
  while its volume is counted on its real one. With both closed, stock's own continuity on
  Greenville goes from +2.0% to -0.4% at 1 s and from +6.3% to -1.3% at its own settings.
- **Against a reference that books volume the same way, SGI at 5 to 10 s matches stock at
  1 s to 1 to 3% at the 90th percentile of 209 conduits.** At 30 and 60 s it is about as far
  off as stock is.
- **It is still slower.** 15 to 21 trials a step against stock's 8, and 20 to 52% of steps
  do not reach this model's 0.0001 ft head tolerance.

## What this is, and what it is not

This is **not Aquanuity's FSGI code**. Aquanuity has never published FSGI: no source, no
peer-reviewed paper. What is public is the family FSGI belongs to: heads at nodes, flows on
links, the head gradient taken implicitly, one linear system for all heads per step
(Casulli 1990; Stelling & Duinmeijer 2003; Casulli & Stelling 2013). This module is a
clean-room member of that family. It cannot tell you what AquaTwin does.

SWMM5's link-node layout already is a staggered grid. Stock dynamic wave solves its
equations one node at a time by successive approximation (`setNodeDepth`). SGI keeps
`dwflow.c`'s momentum equation and replaces the node update:

1. **A global head solve.** Each link answers a head change as `q = q* + c1 dH1 - c2 dH2`.
   Put into node continuity that gives one sparse system per trial (BiCGSTAB, with a dense
   direct solver behind it), and the link flows are corrected with the same coefficients.
2. **Friction solved exactly**, `q + K q|q| = S`, instead of by under-relaxed iteration.
3. **Conveyance in the head response.** `Link.dqdh` freezes the flow area. On a 4% pipe it
   gave 0.38 cfs/ft where the real response was 33 cfs/ft.
4. **A node volume function.** Storage is the difference of two volumes, not area times a
   depth change, and the new depth is the one that holds the volume the solve moved. A node
   can cross its crown inside one step without making or losing water.
5. **Pumps answer to head** through their curve slope, as stock's `sumdqdh` has them do.
6. **Damping on reversal, and a closing solve.** A node's move is halved each time it
   reverses; an unconverged step is finished with one full solve so it still conserves.
7. **Surface area that matches volume.** The two rules above, applied in SGI mode only.

## The water creation: what it was

Per-node and per-conduit audits (`+` = water created, Greenville, before the fixes):

| fault | where | size |
|---|---|---|
| storage units booked only their own curve | 5 s run | +1.58 Mgal, 8% of inflow |
| crown clamp in the closing solve | divider 333, 60 s run | +3.4 Mgal |
| links corrected with the depth change, not the head change | 60 s run | +0.8 Mgal |
| depth clipped at the invert (last revision's suspect) | 60 s run | +0.06 Mgal |

1. The volume function returned `node_getVolume(i, y)` for a storage unit, while the
   surface area on the matrix diagonal, `MAX(Xnode[i].newSurfArea, MinSurfArea)`, also
   carried the conduit ends that meet the unit. The unit booked its own curve; the conduits
   beside it filled for free. Fixed by adding the conduit share to the volume.
2. `if ( yNew < yRef ) yNew = yRef - FUDGE;` held a barely surcharged node at its crown
   when the solve had already taken the water for a larger drop. Fixed by taking the depth
   that holds the volume the solve moved.
3. `SgiX[i] = yNew - yLast;` corrected the links with the depth actually applied. Once the
   depth comes from the volume, that is not the head change the solve used. Fixed.

The suspect named in the last revision, a node driven below its invert, was wrong. It
accounts for 0.06 Mgal.

## Two bookkeeping gaps in stock 5.2.4

Both were found by the audits and then tested on the stock solver, with SGI off
(`greenville/stock-bookkeeping-experiment.patch`, an environment switch, not part of the
SGI patch).

**B-1. An overtopped open channel still gives its end nodes surface area.** A conduit's
flow area is capped at `aFull`, so once the water is over an open channel's top the channel
holds no more. Its top width is still booked to the end node, most of all at a storage unit,
which never surcharges. The node stores water in a volume that does not exist.

**B-2. A lengthened conduit is booked on two lengths.** `dwflow.c` line 136 takes
`length = Conduit[k].modLength` for the momentum equation and the surface area;
`Link.newVolume` uses `link_getLength`, the real length. With LENGTHENING_STEP 10 on
Greenville the gap opens at any routing step of 10 s or more.

| stock 5.2.4 on Greenville, continuity error | as shipped | B-1 closed | LENGTHENING_STEP 0 | B-1 and B-2 closed |
|---|---|---|---|---|
| fixed 1 s | +2.04% | -0.37% | | -0.45% |
| fixed 5 s | +2.20% | -0.61% | | -1.37% |
| fixed 10 s | +6.32% | +3.00% | | -1.26% |
| own settings | +6.29% | | | -1.26% |
| fixed 30 s | +7.26% | +9.12% | +3.14% | |
| fixed 60 s | +8.24% | unstable | | |

Two cautions. The phantom storage is also a stabiliser: with B-1 closed, stock at 60 s blew
up. And closing a bookkeeping gap makes the engine consistent with its own volumes; it does
not show the result is closer to a real sewer. Flooding rose from 0.74 to 0.87 Mgal when
the gaps were closed, because water that had been parked in the phantom storage had to go
somewhere.

About -1% is left in both engines once the two are closed. It was not chased.

## Greenville results

Model: `Greenville/Greenville_all_SWMM5_Features.inp` from the 1729 corpus, the US-units
file. 149 junctions, 17 storage units, 1 divider, 5 outfalls, 223 conduits in 23 shapes,
5 pumps, 4 weirs, 2 orifices, 1 outlet, 30 subcatchments. Its own options: variable step
with a 10 s cap, LENGTHENING_STEP 10, INERTIAL_DAMPING NONE, HEAD_TOLERANCE 0.0001,
MAX_TRIALS 8, EXTRAN surcharge. The only edit: the three `SAVE` lines in `[FILES]` are
commented out.

| run | continuity | flooding, Mgal | outflow, Mgal | steps not converged | trials per step | wall, s |
|---|---|---|---|---|---|---|
| stock, fixed 1 s (reference A) | +2.0% | 0.93 | 5.00 | 93% | 7.7 | 13.1 |
| stock, own settings (variable, 10 s cap) | +6.3% | 0.74 | 5.34 | 94% | 7.8 | 1.6 |
| **SGI**, own settings (variable, 10 s cap) | -1.1% | 0.97 | 5.23 | 28% | 16.6 | 16.0 |
| stock, fixed 5 s | +2.2% | 0.74 | 5.37 | 95% | 7.8 | 2.9 |
| **SGI**, fixed 5 s | -1.1% | 0.97 | 5.24 | 20% | 14.8 | 27.2 |
| stock, fixed 10 s | +6.3% | 0.74 | 5.34 | 94% | 7.8 | 1.6 |
| **SGI**, fixed 10 s | -1.1% | 0.97 | 5.23 | 28% | 16.4 | 15.6 |
| stock, fixed 30 s | +7.3% | 0.74 | 5.33 | 93% | 7.8 | 0.7 |
| **SGI**, fixed 30 s | -1.1% | 1.03 | 5.30 | 45% | 19.6 | 6.8 |
| stock, fixed 60 s | +8.2% | 0.74 | 5.36 | 92% | 7.8 | 0.5 |
| **SGI**, fixed 60 s | -1.0% | 1.06 | 5.30 | 52% | 21.1 | 4.2 |

Differences in peak, period by period with `out-diff.js`, 209 conduits and 167 nodes, each
normalised to its own peak. **Reference A** is stock at 1 s as shipped. **Reference B** is
stock at 1 s with B-1 and B-2 closed. The first three columns are against A, the last three
against B.

| run | link peak, median / p90 | link worst-instant, median | node peak, median / p90 | link peak, median / p90 | link worst-instant, median | node peak, median / p90 |
|---|---|---|---|---|---|---|
| stock, own settings (variable, 10 s cap) | 0.3% / 16% | 3.9% | 0.1% / 11% | 0.3% / 32% | 4.7% | 0.1% / 19% |
| **SGI**, own settings (variable, 10 s cap) | 0.1% / 24% | 2.1% | 0.0% / 9% | 0.1% / 2% | 0.8% | 0.0% / 5% |
| stock, fixed 5 s | 0.1% / 5% | 0.6% | 0.0% / 5% | 0.1% / 23% | 1.1% | 0.0% / 13% |
| **SGI**, fixed 5 s | 0.1% / 24% | 1.5% | 0.0% / 8% | 0.0% / 1% | 0.5% | 0.0% / 3% |
| stock, fixed 10 s | 0.3% / 14% | 3.4% | 0.1% / 9% | 0.3% / 32% | 3.6% | 0.1% / 17% |
| **SGI**, fixed 10 s | 0.1% / 25% | 2.1% | 0.0% / 8% | 0.1% / 3% | 0.8% | 0.0% / 4% |
| stock, fixed 30 s | 0.5% / 19% | 5.7% | 0.2% / 12% | 0.7% / 36% | 5.8% | 0.2% / 20% |
| **SGI**, fixed 30 s | 0.4% / 30% | 5.7% | 0.1% / 10% | 0.3% / 26% | 4.0% | 0.1% / 11% |
| stock, fixed 60 s | 0.8% / 25% | 11.9% | 0.2% / 22% | 0.9% / 37% | 11.9% | 0.3% / 29% |
| **SGI**, fixed 60 s | 0.5% / 37% | 5.7% | 0.2% / 14% | 0.6% / 33% | 4.7% | 0.2% / 13% |

The two references differ from each other by 0.0% / 22% in link peak (median / p90) and 0.0% / 6% in node peak.

How to read it:

- Against A, SGI looks worse than stock at the 90th percentile. Against B it is far better
  at 5 to 10 s. The gap between the two readings is the bookkeeping, not the solver: SGI
  books volume the way B does.
- Two different solvers, stock's node-by-node iteration at 1 s and SGI's global solve at
  5 to 10 s, land within 1 to 3% of each other at the 90th percentile once they book volume
  alike. That is the strongest evidence here that SGI is solving the same equations.
- Neither reference is the truth, and stock fails to converge on 93% of its steps at this
  model's head tolerance.
- Nothing above 60 s was tested: the model's WET_STEP is 1 minute and SWMM caps the routing
  step at it.
- Wall times are single runs. They show the order of the cost, not a ratio.

Controls: with the switch off the patched engine's `.out` is byte-identical to stock on
Greenville. An engine rebuilt from the patch on a fresh clone reproduces the 60 s `.out`
byte for byte. The experiment patch reproduces reference B byte for byte.

## The seven chains

Reference: stock at a 1 s step, 5-minute reporting.

**Peak flow error, worst conduit** (stock / SGI)

| network | 5 s | 30 s | 60 s | 120 s | 300 s |
|---|---|---|---|---|---|
| flat10 | 0.0% / 0.0% | 731.7% / 0.0% | 2,692% / 2.5% | 6,395% / 1.7% | 16,916% / 0.0% |
| mild | 0.1% / 0.2% | 1.0% / 1.2% | 2.1% / 2.1% | 1,721% / 2.7% | 7,112% / 3.8% |
| steep | 0.1% / 0.1% | 1.6% / 0.7% | 2.1% / 1.5% | 959.1% / 2.1% | 7,411% / 2.4% |
| surch | 0.1% / 0.0% | 6.9% / 0.0% | 4.1% / 0.0% | 2,100% / 0.0% | 5,567% / 0.0% |
| flood | 0.9% / 5.6% | 6.4% / 5.1% | 5.9% / 4.6% | 68.3% / 4.9% | 1,227% / 5.2% |
| tail | 0.3% / 1.4% | 2.0% / 0.6% | 5.5% / 0.9% | 2,600% / 2.6% | 7,830% / 2.9% |
| pond | 0.6% / 0.3% | 12.9% / 0.9% | 400.0% / 1.7% | 1,679% / 1.3% | 5,304% / 1.1% |

**Peak depth error, worst node** (stock / SGI)

| network | 5 s | 30 s | 60 s | 120 s | 300 s |
|---|---|---|---|---|---|
| flat10 | 0.0% / 0.0% | 282.1% / 0.0% | 623.7% / 11.7% | 726.2% / 73.6% | 726.2% / 127.7% |
| mild | 0.1% / 0.2% | 0.7% / 0.8% | 1.4% / 1.3% | 1,362% / 1.7% | 1,364% / 2.4% |
| steep | 0.0% / 0.1% | 0.9% / 0.4% | 1.2% / 0.9% | 2,611% / 1.4% | 2,623% / 1.5% |
| surch | 0.1% / 0.0% | 0.3% / 0.0% | 11.3% / 0.0% | 291.6% / 0.0% | 634.8% / 0.0% |
| flood | 0.0% / 0.0% | 0.0% / 0.0% | 1.0% / 0.0% | 123.3% / 0.0% | 209.7% / 0.0% |
| tail | 0.9% / 0.6% | 2.9% / 1.8% | 15.0% / 11.3% | 475.3% / 8.4% | 475.3% / 174.9% |
| pond | 0.0% / 0.0% | 0.1% / 0.0% | 32.5% / 0.1% | 514.8% / 0.1% | 514.8% / 514.8% |

**Worst single-instant flow difference, share of that conduit's peak** (stock / SGI)

| network | 5 s | 30 s | 60 s | 120 s | 300 s |
|---|---|---|---|---|---|
| flat10 | 2.2% / 1.8% | 731.7% / 7.5% | 2,792% / 7.0% | 6,495% / 16.3% | 17,016% / 98.5% |
| mild | 0.4% / 0.5% | 3.7% / 2.4% | 9.2% / 5.6% | 1,821% / 9.2% | 7,147% / 15.5% |
| steep | 0.4% / 0.3% | 3.9% / 1.8% | 92.5% / 4.1% | 1,048% / 6.7% | 7,425% / 12.5% |
| surch | 3.4% / 10.9% | 19.4% / 11.5% | 27.7% / 14.7% | 2,109% / 18.6% | 5,663% / 25.7% |
| flood | 1.5% / 11.1% | 11.6% / 11.9% | 18.1% / 12.7% | 168.3% / 14.4% | 1,327% / 22.7% |
| tail | 3.5% / 14.6% | 10.8% / 12.0% | 19.8% / 6.4% | 2,699% / 8.4% | 7,866% / 18.7% |
| pond | 2.0% / 4.0% | 15.8% / 11.3% | 435.1% / 18.3% | 1,779% / 27.4% | 5,404% / 55.4% |

**Flow routing continuity error** (stock / SGI)

| network | 5 s | 30 s | 60 s | 120 s | 300 s |
|---|---|---|---|---|---|
| flat10 | -0.11% / +0.03% | -261.91% / -0.04% | -550.86% / -0.23% | -3949.09% / +0.03% | -9369.67% / -0.35% |
| mild | +0.01% / +0.03% | +0.04% / +0.13% | +0.28% / +0.19% | -247.35% / +0.44% | -7481.30% / +0.83% |
| steep | +0.01% / +0.02% | +0.02% / +0.05% | -2.56% / +0.13% | -220.87% / +0.23% | -4496.64% / +0.69% |
| surch | -0.04% / +0.00% | -0.26% / +0.00% | -0.89% / +0.05% | -342.07% / +0.07% | -5622.08% / +0.09% |
| flood | -0.02% / +0.00% | -0.07% / +0.01% | -0.05% / +0.05% | -11.55% / +0.09% | -892.85% / +0.04% |
| tail | -0.24% / +0.11% | -0.24% / +0.12% | -1.09% / +0.21% | -1161.02% / -0.40% | -7753.39% / -0.85% |
| pond | -0.05% / +0.02% | -1.15% / -0.00% | -14.90% / -0.01% | -1094.67% / -0.06% | -5510.16% / -0.01% |

Networks: **flat10** = ten 100 ft, 4 ft pipes at 0% slope, 100 cfs square wave (the
Aquanuity TEST 1 geometry); **mild** = ten 400 ft, 3 ft pipes at 0.5%; **steep** = ten
400 ft, 2 ft pipes at 4%; **surch** = ten 400 ft, 2 ft pipes at 0.5%, surcharged;
**flood** = the same with 6 ft manholes; **tail** = ten 400 ft, 3 ft pipes at 0.2% with a
fixed 5 ft tailwater; **pond** = storage unit with orifice and weir into six 2.5 ft pipes.

Controls: 18 of 18 `.out` files byte-identical to stock with the switch off.

Where the chains are worse than stock or unproven:

- **Depth spikes at very long steps.** At 120 to 300 s a step that does not converge can
  leave one node at its rim for that step: peak depth is off by 74% on `flat10` at 120 s,
  175% on `tail` and 515% on `pond` at 300 s. Flows are not affected. This came in with
  the closing solve, which puts the volume where the solve sent it even when that is a
  node with no room. It is the price of the continuity fix and the next thing to repair.
- **Flooding.** `flood` sits about 5% from the reference in peak flow at every step.
- **Short steps.** At 5 s, `surch`, `flood` and `tail` show an 11 to 15% single-instant
  flow difference where stock shows 1.5 to 3.5%. Peaks agree to about 1%.

## Files on this branch

The engine change lives in `src/solver`, where EPA's CMake build picks it up with no
build-file edits. Everything else is in `sgi/`.

| file | what |
|---|---|
| `src/solver/sgi.c`, `src/solver/sgi.h` | new: options, work arrays, statistics, the linear solvers |
| `src/solver/dynwave.c` | the head solve, appended and marked `//SGI` |
| `src/solver/dwflow.c` | two lines: exports the denominator of the flow update |
| `src/solver/swmm5.c`, `src/solver/include/swmm5.h` | the API below |
| `sgi/sgimain.c` | test driver; `SGI=1` turns the solve on, `SGI_THETA`, `SGI_TRIALS` tune it |
| `sgi/tests/` | chain generator, sweep script, raw results; `stockmain.c` is the unpatched driver |
| `sgi/greenville/` | sweep script, raw results, option diagnostic, the stock experiment patch |

The sweep scripts are kept as they were run. They carry the session's paths for the
engines and for `out-diff.js` (from the corinne-testing scripts) in their first lines; edit
those before running them anywhere else.

Diff against `develop`: `sgi.c` and `sgi.h` are new (356 lines). `dynwave.c` gains about
690 lines, all appended or marked `//SGI`, and one stock line changes. `dwflow.c` gains two
lines. `swmm5.c` and `swmm5.h` gain the API. In these files `develop` is identical to the
`v5.2.4` tag, so the branch is the same change that was tested against `v5.2.4`.

```c
int swmm_setSgiOptions(int mode, double theta, int maxTrials);  // before swmm_start
int swmm_getSgiStats(double v[10]);                             // after swmm_end
```

`mode` 0 is stock, 1 is the head solve. `theta` is the time weight of node continuity,
0.5 to 1.0, default 1.0. `maxTrials` defaults to 30. The switch is a runtime call, not an
`.inp` keyword, so `runswmm` alone always runs stock dynamic wave. A report from an SGI run
says the results are not stock EPA SWMM 5.2.4.

## Building it

```
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_C_FLAGS="-U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0"
cmake --build build
gcc -O2 -Isrc/solver/include sgi/sgimain.c -Lbuild/bin/Release -lswmm5 \
    -Wl,-rpath,$PWD/build/bin/Release -o sgiswmm
SGI=1 ./sgiswmm model.inp model.rpt model.out
```

On Linux the fortify switch is needed for stock 5.2.4 too: without it glibc aborts with
`*** buffer overflow detected ***` while reading project data, before any routing. That is
an upstream issue, not part of this change.

Checked on this branch, built with the commands above: with the switch off, `runswmm`
gives `.out` files byte-identical to stock `develop` on 10 of 10 models (the seven chains,
Greenville at its own settings and at 60 s); with it on, Greenville closes at -1.12% at its
own settings and -1.03% at a fixed 60 s, the same as the tested build.

## What none of this shows

- No comparison with field data.
- One real network, one storm, one machine.
- B-1 and B-2 were measured on Greenville only. How much they matter elsewhere depends on
  how many open channels overtop and how much lengthening a model uses.
- Not tested: the SI Greenville file (which uses the SLOT method), ponding, culverts,
  multi-threading, a still-water test, the legacy 5.3 base, any network above a few
  hundred nodes.
- No speed claim. On Greenville SGI was slower than stock at every step tried.

## AI use

This solver and these tests were built with Claude, Anthropic's AI model, in Claude Code
sessions on 2 October 2026, and put on this branch on 29 October 2026, under the direction
of Robert (Bob) Dickinson. He asked for a staggered-grid implicit solution in his SWMM5
branches, chose Greenville as the test network and decided to chase the water creation.
Responsibility for the work is his.

**What Claude did.** It wrote `sgi.c`, `sgi.h`, the `//SGI` code in `dynwave.c`, `dwflow.c`
and `swmm5.c`, and the test driver; generated the seven test chains; wrote the sweep, audit
and diagnostic scripts; found and fixed the faults described above, including the three that
created water; measured the two stock bookkeeping gaps; and wrote this README and the commit
message.

**How the results were checked.** The checks are mechanical: every number here comes from
engine runs compared `.out` file to `.out` file with `out-diff.js`, from continuity tables,
from byte comparisons for the null gates, and from a rebuild of the patch on a fresh clone.
The method follows published literature (Casulli; Stelling and Duinmeijer; Casulli and
Stelling) and no Aquanuity code, which is not public. No person has yet reviewed the code
line by line, and none of the results has been compared with field data.

