# Node surface area experiment, EPA SWMM 5.2.4

Ten run-time switchable ways to give conduit surface area to nodes in SWMM5 dynamic wave routing, the harness that tests them on 42 models, and the results.

**Status.** This is an experiment branch (`exp-node_surfarea`) on a fork of USEPA/Stormwater-Management-Model, not a pull request. With the switch unset, the engine writes the same `.out` file as EPA SWMM 5.2.4, byte for byte, on all 42 test models.

## The question

In dynamic wave, a junction's new depth is `dy = dV / surfArea` (dynwave.c, `setNodeDepth`). `surfArea` is the sum of the shares each attached conduit hands the node in `findSurfArea` (dwflow.c), with a floor of `MIN_SURFAREA` (by default 12.566 ft², a 4-ft manhole). The mass balance counts conduit volume separately, as `aMid × length`. When the area a node is given is not the derivative of the volume the mass balance books, the two disagree. The question tested here is whether making them agree improves anything.

## Turning a mode on

The modes are bit flags in the environment variable `SWMM_NODEAREA`. Nothing in the `.inp` file changes, so every model still runs in EPA SWMM 5.2.4.

```
# Linux, macOS, WSL
SWMM_NODEAREA=512 ./runswmm model.inp model.rpt model.out

# Windows command prompt
set SWMM_NODEAREA=512
runswmm.exe model.inp model.rpt model.out
```

The variable is read once at the start of each run (`dynwave_init`), so pyswmm and other toolkit callers pick it up if it is set before the simulation opens. That path has not been tested.

| Bit | What it changes | Where |
|---:|---|---|
| 1 | Junction area = sum of conduit shares **plus** `MIN_SURFAREA` (instead of the larger of the two), and that manhole volume is booked as storage | dynwave.c, node.c |
| 2 | Every conduit end gets d(booked volume)/d(end depth) = W(y_end)·L/2; an end pinned at critical depth or dry gets 0 | dwflow.c |
| 4 | Conduit shares use the true length instead of the Courant-lengthened `modLength` | dwflow.c |
| 8 | Subcritical ends get W(y_end)·modLength/2, keeping the `fasnh` factor | dwflow.c |
| 16 | As 8, without `fasnh` | dwflow.c |
| 32 | Subcritical ends get the chord area [A(y_new) − A(y_old)] / (y_new − y_old) over the time step | dwflow.c |
| 64 | An outfall has no depth equation, so the outfall end's share of a terminal conduit goes to the interior node | dwflow.c |
| 128 | With 32: keep the crown-cutoff tangent width near the crown of closed conduits | dwflow.c |
| 256 | As 64, for FREE and NORMAL outfalls only (not FIXED, TIDAL, TIMESERIES) | dwflow.c |
| 512 | Book conduit volume with `modLength`, including the initial volume, and drop the second `modLength/L` rescale from the variable-step Courant limit | dwflow.c, flowrout.c, dynwave.c |

Bits combine: 420 = 4 + 32 + 128 + 256.

## What the runs showed

All values are the flow routing continuity error (%) from the `.rpt`. Every model and mode is in [`results/node-area-results.csv`](results/node-area-results.csv).

### Mode 512 removes a bookkeeping mismatch and changes no flows

Under Courant lengthening (`LENGTHENING_STEP` > 0), EPA SWMM 5.2.4 gives nodes the area of the lengthened conduit but books the volume of the real one:

```c
dwflow.c:136    length = Conduit[k].modLength;
dwflow.c:140    findSurfArea(j, qLast, length, &h1, &h2, &y1, &y2);
dwflow.c:291    Link[j].newVolume = aMid * link_getLength(j) * barrels;
```

The node depth equation stores water at the lengthened rate, and the mass balance counts it at the true length. Mode 512 books the lengthened volume in all three places that set conduit volume under dynamic wave. The Courant limit already rescales volume by `modLength/L`, so mode 512 drops that factor to avoid applying it twice:

```c
dynwave.c:864   t = Link[i].newVolume / Conduit[k].barrels / q;
dynwave.c:865   t = t * Conduit[k].modLength / link_getLength(i);
```

| Model | Lengthening step | EPA 5.2.4 | Mode 512 | Flows and depths |
|---|---:|---:|---:|---|
| M5_short_lengthened (twenty 40-ft pipes) | 10 s | +0.187 | −0.019 | identical |
| M9_coarse_lengthened | 20 s | +0.054 | −0.054 | identical |
| user__user4 | 5 s | +0.054 | −0.046 | identical |
| update_v52__CoS-Reduced-Inlets | 2 s | +0.240 | +0.231 | identical |
| update_v52__CoS-Reduced-Outlets | 2 s | +0.258 | +0.249 | identical |

"Identical" means a largest difference of exactly 0 in every conduit flow and node depth at every reporting period (`tools/out-diff.js`). The other 37 models do not lengthen, and their `.out` files are byte-identical to EPA's. The fix changes only what the mass balance reports. On M5 the mismatch was almost all of the reported error. On the others the remaining error comes from somewhere else, and on M9 the sign flips.

### Mode 4 fixes the same mismatch the other way and changes the hydraulics

Taking the area from the true length makes area and volume agree too, but it removes damping that the lengthened area was supplying. In `CoS-Reduced-Inlets`, conduit O3954B, an 18.6-ft trapezoidal channel, its peak went from 3.19 to 5.53 cfs (+73%), and O3954A, 18.2 ft, from 3.62 to 5.23 cfs (+45%).

### The consistent-derivative modes help the synthetic networks and hurt EPA's

| Mode | 12 synthetic-suite models, sum of \|error\| | 30 regression models, sum of \|error\| | Regression better / worse (±0.01) |
|---|---:|---:|---|
| EPA 5.2.4 | 1.542 | 10.145 | |
| 256 | 0.997 | 11.084 | 4 / 8 |
| 160 | 1.277 | 12.205 | 9 / 8 |
| 420 | 0.524 | 13.051 | 9 / 7 |

Mode 420 improved all 10 generated networks. On EPA's models it took EXTRAN8a from −0.982 to −2.047, user5 from −2.352 to −3.401, and EXTRAN10 from +0.131 to +1.022. The generated networks alone would have given the opposite conclusion.

### The strict derivative breaks drop manholes

Mode 2 gives an end pinned at critical depth a zero share, because its depth no longer follows the node. Drop manholes went from −0.063 to −0.551 (M2_drop_manholes), and steep pipes with drops from −0.054 to −0.264 (M8). The pinned depth still depends on flow, and so on the upstream head. That is why EPA's `DN_CRITICAL` rule gives the whole conduit to the wet end:

```c
dwflow.c:498    surfArea1 = (width1 + widthMid) * length * 0.5;
```

### Adding the manhole instead of using it as a floor does not help continuity

Mode 1 took the trickle-flow network from −0.368 to −0.413 and the SLOT surcharge network from −0.060 to −0.068. EPA uses `MIN_SURFAREA` as a floor:

```c
dynwave.c:670   surfArea = MAX(surfArea, MinSurfArea);
```

Whether the manhole should add to the pipe area is a physics question, and the continuity line cannot settle it.

No mode fixed the two largest errors in the regression set, EXTRAN2 at −4.052% and user5 at −2.352%. Both models end at a FIXED-stage outfall. Mode 64, which moves the outfall end's share to the interior node, took EXTRAN2 to −2.045 and EXTRAN8a from −0.982 to +0.401, but took user5 to +5.002. Modes 160 and 420 made both worse. EXTRAN2 also loses 8% of its inflow to flooding, so the flooding and surcharge path is the next place to look.

## Before mode 512 could become a pull request

- **Reported link volume.** Under mode 512 the `.out` link volume is the lengthened volume, which can exceed the pipe's physical full volume. The alternative is to keep `Link.newVolume` physical and apply the `modLength/L` factor only in the mass balance (`massbal_getStorage` and the initial storage). That alternative has not been built.
- **Water quality.** `qualrout.c:299-300` mixes conduit quality with these volumes, so pollutant results in lengthened models change under mode 512. Not tested.
- **Loss limit.** `link.c:1386` caps evaporation and seepage loss with the same volume. Not tested.
- **Hot start.** Initial volume is set in `initLinks` after a hot start file is read. Not tested.
- **No `.inp` option.** As a bug fix it needs none. It changes the reported continuity of every model with `LENGTHENING_STEP` > 0 and changes nothing else.

## Reproduce

```
git clone -b exp-node_surfarea https://github.com/SWMMBobSWMM6/Stormwater-Management-Model.git
cd Stormwater-Management-Model/experiments/node-surfarea
./reproduce.sh
```

This needs bash, git, gcc with OpenMP and python3, plus node for `tools/out-diff.js`. `reproduce.sh` builds both engines, fetches the public models at pinned commits, runs every mode, and ends by printing `MATCH` if the new table equals `results/node-area-results.csv`. It took four minutes on the test machine.

To see a hydraulic difference directly, for example mode 4 on the CoS model:

```
node tools/out-diff.js runs/regression/update_v52__CoS-Reduced-Inlets.m0.out \
                       runs/regression/update_v52__CoS-Reduced-Inlets.m4.out
```

On Windows without bash, build this branch with EPA's CMake files (`cmake -B build -DCMAKE_BUILD_TYPE=Release`, then `cmake --build build --config Release`) and set `SWMM_NODEAREA` as shown above. The CMake build was checked on Linux only.

## Test models

| Suite | Models | Source |
|---|---:|---|
| Synthetic | 10 | `gen_models.py`: binary trees of 31 junctions and 8 to 18-in circular pipes, a 60-in trunk chain, and two lengthened networks. All FREE outfalls, no ponding, US units |
| Synthetic (extra) | 2 | `model_full_features.inp` and `swmm_example.inp` from pyswmm (the second is KINWAVE, a null case) |
| Regression | 21 | Every DYNWAVE model in [USEPA/swmm-nrtestsuite](https://github.com/USEPA/swmm-nrtestsuite) at `d23f9d6` |
| Regression | 9 | Every DYNWAVE model in pyswmm `tests/data` at `97cb36f`, except the bad-input model |

Only 5 of the 42 use Courant lengthening. The regression models are fetched by `collect_models.py`, not redistributed here.

## What this does not show

- **Accuracy.** There are no observed flows or depths. Every result is a continuity number or a run-to-run comparison.
- **Breadth.** 42 models, of which 5 lengthen. Conduit shapes in the regression set were not counted. The synthetic networks are all circular with FREE outfalls.
- **Platforms.** One Linux machine with gcc. No Windows or MSVC run.
- **Paths not tested.** Water quality, hot start files, pyswmm toolkit runs, and ponding (`ALLOW_PONDING YES` appears only in the two CoS models and the bioretention model).
- **Precision.** Continuity values are read from the `.rpt` at three decimals.

## Files

| File | What it is |
|---|---|
| `../../src/solver/dwflow.c`, `dynwave.c`, `flowrout.c`, `node.c` | The engine changes, marked `NODE-AREA EXPERIMENT` |
| `build.sh` | Builds `bin/runswmm_mod` (this branch) and `bin/runswmm_ref` (EPA at `07c371f`) |
| `gen_models.py` | Writes the ten synthetic networks |
| `collect_models.py` | Fetches the public models and lays out both suites |
| `run_modes.py` | Runs each model under each mode, with the byte-for-byte null control |
| `merge_results.py` | Writes the continuity table |
| `reproduce.sh` | All of the above, then compares with `results/` |
| `tools/out-diff.js` | Per-element `.out` comparison, from Bob Dickinson's corinne-testing kit |
| `results/node-area-results.csv` | Continuity error for every model and mode |
| `EVIDENCE.md` | The claims and the checks behind them |

## Changelog

- **2026-10-30.** First push. Relative to the October 12 runs, mode 512 was corrected. The first version applied the `modLength/L` rescale twice in the variable-step Courant limit and left the initial conduit volume at the true length, which moved one peak flow by 12% in CoS-Reduced-Outlets. The corrected version moves no flow or depth anywhere. The mode-32 depth arrays are now freed at the end of each run.

## AI use

This branch was made with Claude, Anthropic's AI model, in Claude Code sessions on October 12 and 30, 2026, under the direction of Robert (Bob) Dickinson. He asked how SWMM5's link-to-node surface area could be improved and decided to publish the work. Responsibility for it is his. Claude read the EPA source, wrote the engine changes for all ten modes, wrote the build and test scripts and the synthetic networks, ran the tests, and wrote this README and EVIDENCE.md. The checks are mechanical: the null control byte-compares mode 0 with unmodified EPA SWMM 5.2.4 on every model; continuity is read from each `.rpt`; flows and depths are compared at every reporting period with `out-diff.js`; and `reproduce.sh` regenerates the results table from a clean clone. Claude found and fixed the mode 512 defect described in the changelog. No line-by-line human review of the C changes is recorded here, and no result has been compared with field data.
