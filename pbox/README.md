# SWMM 5.2.4 implicit box-scheme extension (pbox.c)

Built 2026-10-02; put on GitHub 2026-10-30. A modified EPA SWMM 5.2.4 engine in which dynamic
wave routing can be replaced, at run time, by an implicit Preissmann four-point box scheme
solved simultaneously with node continuity by Newton-Raphson iteration.

## Branches

Both branches start from EPA's `v5.2.4` tag, not from `develop`.

| Branch | What it holds |
|---|---|
| `dev-pbox-implicit` | the engine change only: new `src/solver/pbox.c`, hooks in `flowrout.c`, the API in `swmm5.c` and `include/swmm5.h`, declarations in `funcs.h`, the two calls in `bindings/swmm5.def` |
| `dev-pbox-implicit-wasm` | that, plus this `pbox/` folder: the wasm engine, the browser test bench, the 16 test models, the build and gate scripts, and this report |

EPA's CMake build picks up `pbox.c` without changes, because `src/solver/CMakeLists.txt` globs
`*.c`.

This is the numerical method the InfoWorks ICM 1D engine is documented as using, rebuilt from
the published literature (Preissmann 1961; Cunge & Wegner 1964; Cunge, Holly & Verwey 1980).
It contains no InfoWorks code and has not been compared with InfoWorks results. The defaults
for slot width (2%), base depth (5%), section spacing (20 widths) and the Froude phase-out
range (0.8 to 1.0) are the ICM values as recalled from its help, not checked against a copy
of ICM. All four are run-time options.

## In five minutes

Switched off, the engine is stock: its .out file is byte-identical to pristine 5.2.4 on all
16 test models. Switched on, it ran all 16 with no routing step accepted unconverged, routing
continuity within 0.11%, conduit peak flows within 5.5% of stock dynamic wave and node peak
depths within 9.8%. It is slower than stock: 16 times at the same 5 s step on the chain model.
It has not been run on a network larger than 8 conduits, and it has not been compared with
InfoWorks ICM or with field data.

## What is in `pbox/`

| Path | What it is |
|---|---|
| `../src/solver/pbox.c` | the solver module (1,298 lines), in the engine tree itself |
| `swmm524-pbox.patch` | the same engine change as a patch against pristine v5.2.4, for applying to another 5.2.4 tree (`patch -p1`): adds pbox.c, touches flowrout.c, swmm5.c, funcs.h, include/swmm5.h and bindings/swmm5.def |
| `wasm/swmm524pbox.wasm` | wasm32-wasi reactor, 874,927 bytes, sha256 `2529e867a56f4942b80e6c96895a4a0df07dc08510234a1cba30880f2b73a126` |
| `swmm5-implicit-box-test-bench.html` | single-file browser test bench: runs any DYNWAVE .inp through stock and implicit routing, with the 16 models built in |
| `scripts/pboxengine.js` | browser/Node driver: `new PboxEngine(module).run(inpText, {mode, theta, slot, base, spacing, totalDays})` |
| `scripts/pboxmain.c` | native test driver; `PBOX=1` switches the extension on, `PBOX_THETA`, `PBOX_SLOT`, `PBOX_BASE`, `PBOX_SPACING` tune it |
| `scripts/build.sh` | builds native, musl and wasm engines from this branch, and stock 5.2.4 from a pristine tree |
| `scripts/null_gate.sh`, `scripts/wasm_check.js`, `scripts/out-diff.js` | the gates used below |
| `scripts/wasi-shim.iife.js`, `scripts/wasi_shims.h` | the browser WASI runtime and the compile shims for the wasm build |
| `models/` | the 16 test models (US customary, CFS) |
| `THIRD_PARTY_NOTICES.md`, `third_party/` | licenses for the code bundled into the wasm engine and the test bench |

## API

```c
int swmm_setPboxOptions(int mode, double theta, double slotFrac, double baseFrac, double spacing);
int swmm_getPboxStats(double v[10]);
```

Call `swmm_setPboxOptions` before `swmm_start`. `mode` 0 is stock dynamic wave (the default),
1 is the implicit scheme. It acts only when FLOW_ROUTING is DYNWAVE. A value of 0 (or below 0
for `baseFrac`) keeps that option's default: theta 1.0, slot 0.02, base 0.05, spacing 20.
`swmm_getPboxStats` fills, after `swmm_end`: mode, conduits, sections, routing steps, solver
steps, mean Newton iterations, max iterations, step halvings, steps accepted unconverged,
links using a feature the scheme does not model. An extended run writes an
"Implicit box-scheme extension" block into the .rpt; do not strip it.

## How it differs from stock dynamic wave

- Several computational sections per conduit (spacing times conduit width, 2 to 61 sections)
  instead of one momentum cell per conduit.
- No Courant limit. The model's ROUTING_STEP is used as a fixed step and halved (up to 8
  times) only when Newton fails. Stock's variable step is not used.
- Each conduit's interior unknowns are condensed onto its two end depths with a banded solve,
  leaving one sparse system in the node heads (minimum-degree ordering, LU without pivoting).
- Preissmann slot on closed conduits. The crown width is blended into the slot width over 3%
  of the conduit height so a flat-topped section has no jump in wave speed.
- Conveyance is capped at the full-pipe value, so it does not fall near the crown.
- Convective inertia is phased out between Froude 0.8 and 1.0.
- Junctions carry their own plan area (MIN_SURFAREA, 12.566 ft2 by default). No conduit
  surface area is lumped onto nodes.
- Pumps, orifices, weirs and outlets use SWMM's own functions, with their dq/dh in the node
  system.

## Where it departs from ICM as documented

- **Base flow.** Every conduit holds 5% depth, kept there by a base flow equal to normal flow
  at that depth. The base flow passes through the conduit but never enters a node, and link
  flows and volumes are reported net of it. Link depths include the base depth.
- **Drawn-down sections.** Below the base depth a section's depth variable is logarithmic, so
  it can drain toward empty but not go negative, and the momentum equation sees a depth that
  levels off at half the base depth.
- **Dry nodes run a debt.** A front can draw a small volume out of a dry node. The node then
  carries a negative volume (reported depth 0) that the next inflow repays, instead of having
  water created for it.
- **Theta is 1.0 by default** (fully implicit). See the theta section below.
- **Free-fall ends.** A conduit end above its node's water level is pinned at the smaller of
  critical and normal depth for its flow, with the slope of that relation inside the Newton
  step. Outfall stage is applied once per step.

## Not modelled

Conduit flap gates, culvert inlet control, force-main equations (Manning is used), conduit
seepage and evaporation, conduit flow limits. Dummy conduits pass flow through. The report
block counts any of these it meets. None of the 16 test models uses them, so none has been
exercised.

## Verification

All runs: EPA SWMM 5.2.4 compiled from the v5.2.4 tag, gcc -O2 on Ubuntu 24, REPORT_STEP 1 min.
"Stock" is the pristine CLI; "implicit" is the patched engine with `PBOX=1` and defaults.

### Null effect (the control)

With the extension off, the patched engine's .out is byte-identical to pristine 5.2.4 on
16 of 16 models (`scripts/null_gate.sh`). Three implicit runs repeated gave identical bytes.
Rechecked on 2026-10-30 against engines built from the `dev-pbox-implicit` branch itself:
16 of 16 again, both for a gcc build and for EPA's own CMake build (`runswmm`), and the
wasm built from the branch is byte-identical to `wasm/swmm524pbox.wasm`.

### Parity

The wasm engine is byte-identical to a native musl build of the same source on 16 of 16
models, extension off and on (`scripts/wasm_check.js`). Against a glibc build it is identical
with the extension off and differs with it on, because the scheme calls exp() and log(): the
largest difference measured on four models was 6.9e-7 ft and 3.0e-8 cfs.

### Run summary, 16 models

Volumes in acre-feet. "halv" is step halvings, "nonc" is routing steps accepted unconverged.

| Model | Continuity % stock | Continuity % implicit | Outflow stock | Outflow implicit | Flooding stock | Flooding implicit | Mean Newton its | Max its | halv | nonc |
|---|---|---|---|---|---|---|---|---|---|---|
| t1_chain | 0.011 | 0.000 | 0.661 | 0.661 | 0.000 | 0.000 | 2.02 | 4 | 0 | 0 |
| t2_backwater | 0.005 | 0.000 | 0.680 | 0.674 | 0.000 | 0.000 | 2.03 | 6 | 0 | 0 |
| t3_surcharge | -0.022 | 0.000 | 2.439 | 2.432 | 0.041 | 0.048 | 2.07 | 5 | 0 | 0 |
| t3b_flood | -0.021 | 0.000 | 2.201 | 2.189 | 0.279 | 0.291 | 2.07 | 5 | 0 | 0 |
| t4_steep | 0.007 | -0.010 | 1.653 | 1.653 | 0.000 | 0.000 | 2.88 | 7 | 0 | 0 |
| t5_flat | -0.019 | 0.000 | 0.330 | 0.330 | 0.000 | 0.000 | 2.00 | 3 | 0 | 0 |
| t6_box | -0.031 | 0.001 | 3.720 | 3.719 | 0.000 | 0.000 | 2.05 | 4 | 0 | 0 |
| t7_open | 0.013 | -0.002 | 4.958 | 4.959 | 0.000 | 0.000 | 2.02 | 7 | 0 | 0 |
| t1_chain_60s | 0.093 | 0.000 | 0.660 | 0.661 | 0.000 | 0.000 | 2.17 | 5 | 0 | 0 |
| t3_surcharge_60s | 0.008 | 0.000 | 2.436 | 2.432 | 0.041 | 0.047 | 2.42 | 8 | 0 | 0 |
| k_split_dynwave | -0.001 | 0.000 | 5.372 | 5.372 | 0.000 | 0.000 | 2.01 | 6 | 0 | 0 |
| k_diamond_dynwave | -0.002 | 0.000 | 5.372 | 5.372 | 0.000 | 0.000 | 2.00 | 4 | 0 | 0 |
| k_braid_dynwave | 0.000 | -0.001 | 5.372 | 5.372 | 0.000 | 0.000 | 2.01 | 7 | 0 | 0 |
| k_loopactive_dynwave | -0.009 | -0.002 | 8.022 | 8.020 | 0.000 | 0.000 | 2.02 | 6 | 0 | 0 |
| k_storage | 0.003 | -0.001 | 5.371 | 5.371 | 0.000 | 0.000 | 2.02 | 5 | 0 | 0 |
| t8_features | 0.292 | -0.105 | 0.698 | 0.707 | 0.000 | 0.000 | 2.37 | 20 | 3 | 0 |

### Peaks on the chain models

C4 is the last conduit; J1 is the upstream node.

| Model | Stock C4 peak (cfs) | at | Implicit C4 peak (cfs) | at | Stock J1 max depth (ft) | Implicit J1 max depth (ft) |
|---|---|---|---|---|---|---|
| t1_chain | 7.87 | 01:18 | 8.03 | 01:19 | 1.00 | 1.01 |
| t2_backwater | 7.87 | 01:19 | 7.99 | 01:18 | 1.00 | 1.01 |
| t3_surcharge | 26.16 | 01:10 | 25.81 | 01:11 | 15.00 | 15.00 |
| t3b_flood | 19.94 | 01:02 | 19.73 | 01:02 | 6.00 | 6.00 |
| t4_steep | 19.93 | 01:16 | 20.03 | 01:16 | 0.87 | 0.88 |
| t5_flat | 3.71 | 01:23 | 3.67 | 01:23 | 1.26 | 1.25 |
| t6_box | 45.02 | 01:15 | 44.66 | 01:15 | 8.20 | 7.71 |
| t7_open | 59.71 | 01:17 | 61.07 | 01:17 | 1.27 | 1.28 |
| t1_chain_60s | 7.91 | 01:19 | 7.82 | 01:20 | 1.00 | 1.01 |
| t3_surcharge_60s | 26.18 | 01:10 | 25.81 | 01:16 | 15.00 | 15.00 |

The implicit peak on t7_open (61.07 cfs) and t1_chain (8.03 cfs) is above the inflow peak
(60 and 8 cfs). At a 60 s step the surcharge peak arrives 6 minutes later than stock's.

### Per-element differences against stock (scripts/out-diff.js)

Every reporting period, every conduit and node, each difference as a percentage of that
element's own stock peak. Three numbers per group: the worst single instant, the time average,
and the change in the peak itself. The value shown is the maximum over elements.

| Model | Links: worst instant | Links: time-avg | Links: peak change | Nodes: worst instant | Nodes: time-avg | Nodes: peak change |
|---|---|---|---|---|---|---|
| k_braid_dynwave | 3.02% | 0.80% | 1.18% | 17.36% | 4.93% | 3.13% |
| k_diamond_dynwave | 5.69% | 0.63% | 0.96% | 15.97% | 4.83% | 3.47% |
| k_loopactive_dynwave | 14.12% | 3.32% | 5.46% | 36.77% | 3.31% | 4.02% |
| k_split_dynwave | 3.38% | 0.73% | 0.48% | 25.27% | 4.38% | 2.67% |
| k_storage | 4.09% | 0.34% | 0.74% | 26.50% | 2.73% | 0.54% |
| t1_chain | 4.47% | 0.14% | 2.11% | 20.04% | 5.91% | 1.54% |
| t1_chain_60s | 2.74% | 0.31% | 1.07% | 12.61% | 5.99% | 0.81% |
| t2_backwater | 53.60% | 1.66% | 1.87% | 31.83% | 6.09% | 3.85% |
| t3_surcharge | 5.90% | 0.49% | 1.36% | 21.99% | 1.82% | 2.98% |
| t3_surcharge_60s | 9.86% | 0.67% | 1.38% | 14.60% | 2.02% | 2.68% |
| t3b_flood | 7.49% | 0.43% | 1.26% | 24.50% | 2.66% | 4.30% |
| t4_steep | 1.50% | 0.03% | 0.35% | 11.54% | 7.15% | 0.94% |
| t5_flat | 8.23% | 0.32% | 1.13% | 14.55% | 4.38% | 4.32% |
| t6_box | 10.88% | 0.48% | 1.05% | 54.42% | 2.65% | 9.81% |
| t7_open | 5.01% | 0.11% | 2.59% | 20.65% | 7.48% | 1.96% |
| t8_features | 99.73% | 7.04% | 2.56% | 97.51% | 31.17% | 4.17% |

Read the worst-instant columns with the peak columns beside them. A large worst instant with
a small peak change is a timing shift, not a different answer: on t8_features the pump
switches at slightly different times, and on t2_backwater the initial filling from the
tailwater differs. The largest peak changes are 5.46% for a conduit (relief loop) and 9.81%
for a node (box culvert, where surcharge depth at J1 is 7.71 ft against stock's 8.20 ft).

### Theta below 1

At theta 0.65, 14 of 16 models ran with no halvings and continuity within 0.03%. t4_steep
did not finish inside 60 s, and t8_features finished with -3.245% continuity. A step that
fails at theta below 1 is retried at theta 1 before it is halved, which was not enough on
those two. Treat theta below 1 as experimental.

### Cost (interleaved, 7 pairs each)

| Model | Implicit / stock run time | Range of per-pair ratios |
|---|---|---|
| t1_chain (5 s step) | 16.10 | 14.96 to 16.45 |
| t1_chain_60s (60 s step, both engines) | 3.28 | 3.23 to 3.61 |
| t8_features (5 s step) | 8.66 | 7.95 to 10.92 |

The implicit scheme at a 60 s step (0.029 s) is still slower than stock at 5 s (0.016 s) on
the chain model. Nothing in the module has been optimised.

## What this does not show

- No comparison with InfoWorks ICM, and no field data. Agreement with stock SWMM says the two
  schemes solve the same equations on these models, not that either is right.
- Sixteen models, 3 to 8 conduits each: circular, closed rectangular and trapezoidal sections;
  free and fixed outfalls; one storage, orifice, weir and pump. No real network, no irregular
  or custom shapes, no dividers, no inlets, no RDII, no water quality, no hot start, no SI
  model.
- One machine, one compiler.
- The scheme's own choices (base flow, conveyance cap, slot blend, node plan area) are part
  of every difference above. None has been varied to see how much it matters.

## Decisions that are yours

- **Run-time switch or .inp keyword.** The mode lives outside the file, so one .inp gives
  stock or implicit results depending on the caller. An `[OPTIONS]` keyword would make it
  visible in the file but is a fatal ERROR 205 in stock 5.2.4.
- **Version stamp.** The report header still says 5.2.4; the extension announces itself only
  in its own block.
- **Theta default.** 1.0 is the robust choice here. If ICM's weighting is lower, the default
  is one more place this departs from it.
- **Base flow.** Kept because the scheme needs water in every pipe. It leaves 5% depth in dry
  pipes, as ICM does.

## Rebuild and re-run the gates

From the repository root, on branch `dev-pbox-implicit-wasm`:

```
git fetch https://github.com/USEPA/Stormwater-Management-Model.git tag v5.2.4 --no-tags
git worktree add ../swmm-5.2.4 v5.2.4
pbox/scripts/build.sh ../swmm-5.2.4 build
pbox/scripts/null_gate.sh build pbox/models/*.inp
(cd pbox/scripts && node wasm_check.js ../../build ../wasm/swmm524pbox.wasm wasi-shim.iife.js ../models/*.inp)
build/stock524 pbox/models/t3_surcharge.inp s.rpt s.out
PBOX=1 build/pboxswmm pbox/models/t3_surcharge.inp p.rpt p.out
node pbox/scripts/out-diff.js s.out p.out
```

The test bench needs no build: open `pbox/swmm5-implicit-box-test-bench.html` in a browser.

## License

`pbox.c`, the hooks, the scripts, the test models and the test bench are public domain, like
EPA SWMM 5 itself; no copyright is claimed. Two kinds of third-party code are bundled and keep
their own licenses: the browser WASI runtime (`scripts/wasi-shim.iife.js`, also embedded in the
test bench) is MIT or Apache-2.0, and the wasm engine statically links wasi-libc and LLVM
compiler-rt. See `THIRD_PARTY_NOTICES.md`.

## AI use

This extension was built with Claude, Anthropic's AI model, in a claude.ai session in October
2026, under the direction of Robert (Bob) Dickinson. He asked for the solver, chose to put it in
SWMM 5.2.4 and is running the InfoWorks ICM comparison himself; responsibility for the work is
his. Claude wrote `pbox.c`, its hooks in `flowrout.c` and `swmm5.c`, the API, the test driver,
the 16 test models, the browser driver and test bench, the build and gate scripts and this
README, and it found and fixed the convergence faults described in the session. Claude also
put both branches on GitHub. Every check in the Verification section is mechanical (byte
comparisons, engine runs and element-by-element .out diffs); none of it is a human code
review. No comparison with InfoWorks ICM or with field data has been made yet.
