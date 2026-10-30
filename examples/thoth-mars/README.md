# The Thoth: a Mars canal for SWMM

This is the model behind the story [*Thaw on the Thoth*](story/THAW_ON_THE_THOTH.md):
an invented canal on Mars, run on EPA SWMM 5.2.4 and on this branch
(swmm524-fvlink), both rebuilt with Mars gravity. It is also the model that
reproduces the open defect FVL-15 (`../../fvlink/DEFECTS.md`).

## The canal

`gen_thoth.py` writes the model (US units, CFS, dynamic wave, 4 days from
04/10/2097):

- Headworks, then eight one-mile reaches of the Upper Thoth (trapezoid, 40-ft bed, 2:1 sides, 14-ft banks, slope 0.0003)
- the Causeway Culvert at mile 4: 10 ft long, open rectangular 14 x 40 ft
- the Chute: 400 ft, 20-ft drop
- six one-mile reaches of the Lower Thoth and a last 600-ft reach
- Colony Basin: functional storage 1,500,000 + 20,000 d ft2, levee crest 14.5 ft, starting at 8.3 ft
- an overflow sill (weir, 100 ft, crest 8 ft) to the Outlet Canal
- the town intake: a 300-ft channel to a wet well and a 150-cfs pump
- the Old Canal gate: an 8 x 20 ft side orifice at lower mile 6 (offset 2 ft, Cd 0.61) onto a dry channel
- with `--lock`: the Company's version, with a Lock node and a 10-ft gate throat (open rectangular 18 x 40 ft) into the basin

The thaw: 300 cfs to hour 24, then 300 + 3,900 t^3 e^(3(1-t)) with t = (h-24)/18, cresting at 4,200 cfs at hour 42.

```
python3 gen_thoth.py OUT.inp [--n 0.015] [--cw 3.33] [--lock]
        [--spill T1 [--close T2] [--spill-setting 1.0]]
        [--fv LINK,LINK --cells N,N] [--peak 4200] [--days 4]
```

## Mars

Gravity is a compiled constant in SWMM, so Mars needs its own build. Apply
`mars_gravity.patch` (one line in `src/solver/consts.h`, GRAVITY 32.2 to 12.2)
and build as usual. That changes wave speeds, the momentum equation, the
friction factor, the orifice formula and critical depth.

Two inputs carry Earth's gravity inside them and must be scaled by hand:

| Input | Earth value | Mars value | Why |
|---|---|---|---|
| Manning's n | 0.015 | 0.02437 | the wall's drag is fixed, so g n^2 is fixed: n x sqrt(32.2/12.2) = n x 1.6246 |
| Weir coefficient Cw | 3.33 | 2.050 | Cw = (2/3) Cd sqrt(2g): Cw x sqrt(12.2/32.2) |

The Mars model is `--n 0.02437 --cw 2.050`. With gravity changed and n left
at 0.015, the lower canal rings (`runs/Bs.rpt`), because the friction that
damps it has been cut to 38 % of the wall's real drag.

## Files

| Path | What |
|---|---|
| `gen_thoth.py` | the model generator |
| `mars_gravity.patch` | the one-line Mars build change |
| `runs/` | every input and report behind the story; `RUNS.md` maps story to run |
| `scen.py`, `variant.py`, `ts.py`, `outread.py` | scenario runner and `.out` readers (set `SWMM_FV_MARS`, `SWMM_STOCK` to your engine paths) |
| `storydata.py`, `storydata.json` | the numbers behind the figures (`storydata.py` needs the `.out` files, so rerun the inputs first) |
| `scenarios.json`, `timing_C.json`, `timing_C.txt` | scenario results and timings |
| `story_figs.js`, `render.js` | draw the figures from `storydata.json` (SVG, then PNG with Playwright) |
| `figs/` | the figures and paintings |
| `story/THAW_ON_THE_THOTH.md` | the story |

## What this does not show

- The n and Cw scaling is a dimensional argument. No measurement on Mars stands behind it.
- The Lock and its 10-ft throat could not be modeled honestly at Mars gravity: stock dynamic wave loses 18 % of its water there (`runs/C_mars.rpt`), and the FV link runs water uphill (FVL-15). The story's model merges the Lock into the basin.
- The Old Canal gate opens and closes all at once in the model.
- No evaporation or seepage.

## AI use

The model, the Mars builds, every run, the scripts, the figures and the
story were made by Claude, Anthropic's AI model, in a Claude Code session in
October 2026, at the request of Robert (Bob) Dickinson, who is responsible
for the published work. The checks are mechanical: numbers traced to run
outputs, a byte-for-byte null check, two engines compared, timings as
medians of interleaved runs. No person has reviewed the model or rerun it
yet.
