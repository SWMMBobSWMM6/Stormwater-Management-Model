# swmm524-fvlink: finite volume on chosen links, dynamic wave everywhere else

This folder documents the `swmm524-fvlink` branch. The engine changes are in
`../src/solver` (new file `fvlink.c`); `swmm524-fvlink.patch` is the same
change as one patch against EPA SWMM 5.2.4.

This is an opt-in solver option on EPA SWMM 5.2.4 (tag `v5.2.4`, commit
`7952ca8`):

- Conduits you list in a new `[FV_LINKS]` section are solved by an explicit
  finite-volume scheme on their own cell mesh.
- Every other link and node is stock dynamic wave.
- The two meet at the nodes they share.

Built 2026-10-13; last changed 2026-10-17 (FVL-12 to FVL-14). Without an
`[FV_LINKS]` section, the patched engine writes
the same `.out` bytes as stock 5.2.4 on 72 of EPA's 73 regression models. The
73rd stops with the same error in both.

**Open defect, FVL-15 (2026-10-30).** At the inflow end of an FV link the
ghost state pairs the node's water level with the link's own velocity. Fed
from a still pool (a storage unit, a lock), the link can run water uphill.
Do not put an FV link at the outlet of a pool until it is fixed. Details,
the code, a reproducing model and five prototype fixes (none adopted) are in
`DEFECTS.md` and `prototypes/`. The reproducing model is the Mars canal in
`../examples/thoth-mars`.

## Using it

```
[OPTIONS]
FLOW_ROUTING   DYNWAVE

[FV_LINKS]
;;Link        Cells
C4                     ; default mesh: 25 ft cells, at least 4
TW01290       40       ; 40 cells
C3            *        ; * = default
```

- **Cells** is optional. By default each cell is about 25 ft long, with a
  minimum of 4 cells.
- **What an FV link can be.** It must be a non-dummy conduit under DYNWAVE.
  ERROR 116 stops the run if the link has a force main section, a culvert
  code, a flap gate, any entry, exit or average loss, seepage, a max. flow,
  or a street inlet. It also stops the run if a pump or dummy conduit draws
  from either of the link's end nodes.
- **Input errors.** An unknown link gives ERROR 209. A cell count that isn't
  a positive whole number gives ERROR 211.
- **Old engines.** Stock 5.2.4 stops on the new section header with
  ERROR 205 and writes no `.out`, so an old engine fails loudly instead of
  misreading the file.
- **Report.** A new *Finite-Volume Link Summary* follows the Routing Time
  Step Summary. For each FV link it lists cells, cell length, substeps per
  routing step, the smallest substep, the link's volume balance error, and
  how many substeps hit the 0.001 s floor. It also names any link whose SWMM
  area table had to be repaired (see S5-DW4 below).

## How it works

Each FV conduit is cut into cells. The state in each cell is area A and flow
Q per barrel.

- **Flux:** HLL, using Davis wave speeds and dry-bed estimates.
- **Bed slope and offsets:** hydrostatic reconstruction (Audusse et al.
  2004). A still water surface stays still over any bed.
- **Closed shapes above the crown:** a static Preissmann slot, 100 ft/s
  celerity, capped at 5 % of max. width.
- **Friction:** semi-implicit Manning on the real section area. Slot area
  does not count.
- **Positivity:** each face is limited by the cell or node it drains from.

**Geometry** comes from SWMM's own `xsect_getAofY` at 256 depths, joined by
straight lines. That makes width exactly dA/dy and the pressure moment
exactly the integral of A, so depth from area is an exact inverse.

Where SWMM's area falls as depth rises, the table keeps SWMM's value at each
depth where the area reaches a new maximum. It joins those depths with
straight lines, so every width stays positive. This happens for some
irregular transects (S5-DW4). It never happens for a built-in shape.

**Coupling.** The FV links are subcycled inside every Picard iteration of the
dynamic wave step, starting from the saved start-of-step state.

- At each end of the link, the boundary face sees a ghost state: the node
  head as its water surface, and the adjacent cell's velocity.
- End nodes other than outfalls (junctions, storage units, dividers) track
  their own continuity during the subcycle, with a semi-implicit head update
  and a stability limit on the substep.
- Outfalls follow dynamic wave's current head, and so do nodes surcharged
  under EXTRAN.
- A flap-gated outfall lets no water into the pipe.
- The volume crossing each end face is booked into that node's continuity
  exactly. The node's other flows keep dynamic wave's trapezoidal rule. The
  exception is a node surcharged under EXTRAN, whose head stock SWMM sets
  from the net flow rather than the volume.

**Reported flow** is the time-averaged flow the link delivers: out of its
downstream face, or out of its upstream face when the net movement is
upstream. Quality routing treats a conduit as one flow plus a change in
storage, and with this definition that identity holds exactly.

FV links play no part in dynamic wave's Courant step, so a short link no
longer sets the time step for the whole network.

## What it measured

Every number comes from the files in `results/`. `VERIFICATION.md` has the
detail and the controls.

| Check | Result |
|---|---|
| Null effect: no `[FV_LINKS]`, 73 EPA regression models | 72 `.out` byte-identical to stock; 1 stops with the same error in both |
| Patch applied to a fresh v5.2.4 clone and rebuilt | binary byte-identical to the tested one; OpenMP build with THREADS 2 writes the same `.out` on 13 FV models |
| FV link volume balance (change in stored volume vs. what crossed its faces) | at most 2.7e-12 % over 37 EPA models and 14 synthetic cases |
| Lake at rest, every conduit FV (slopes, 0.5 ft offset, 2 barrels, surcharged) | max \|Q\| 1.2e-11 cfs, no head drift at the `.out` file's precision |
| Manhole on a surcharged pipe, disturbed by 0.05 ft | decays about 4.6× every 30 min |
| 10-ft rectangular channel, 60 cfs, n 0.015, S 0.001 | FV reach 1.6592 ft vs Manning normal depth 1.6559 ft (+0.20 %), flow 60.0001 cfs |
| One pollutant, 2 of 6 conduits FV | quality continuity 0.093 % (stock −0.036 %); concentrations within 0.1 mg/L |
| Flap-gated outfall 4 ft above the junction | no backflow (minimum flow 0.000 cfs, same as stock) |
| 400-pipe tree whose 10-ft trunk pipe pins DW at 1.14 s; that pipe FV | 0.19× stock wall time (per-pair 0.16–0.19, n = 7 interleaved; 0.17× in the 2026-10-13 session); DW step 9.89 s; every conduit peak flow within 0.53 %, every node peak depth within 0.80 % |
| EPA user2, one channel FV, 5-s report step | stock peaks at 1,921 cfs and sends 165,921 ft³ backwards while the channels on either side carry at most 891 and 537 cfs; FV peaks at 449 cfs with no reversal; net volume through the link agrees to 0.02 % |

## Bugs found and fixed during the build

The full register is in `DEFECTS.md`, with each bug's code as it stood when
it failed.

- **FVL-1** The end ghost had zero velocity, so water leaving the pipe hit a
  still pool. J4 reached 8.83 ft against stock's 1.73.
- **FVL-2** Explicit node coupling pumped a manhole-pipe oscillation into a
  ±2.1 ft limit cycle.
- **FVL-3** The reported flow was cell momentum (59.536 cfs in steady
  60 cfs flow). It was later redefined again by FVL-8.
- **FVL-4** Slot area counted as conveyance in the friction term.
- **FVL-5** The positivity factors read face fluxes that were already
  half-scaled.
- **FVL-6 to FVL-10** were found by an independent review agent that hadn't
  seen the work:
  - FVL-6: pumps drawing from an FV end node read the wrong inflow and
    divided by zero.
  - FVL-7: a flap-gated outfall let water back up the pipe (31.7 cfs; stock
    lets none through).
  - FVL-8: quality routing blew up (−38,402 % quality continuity).
  - FVL-9: a long link ID overflowed the report buffer.
  - FVL-10: the node limiter ignored other outflows.

  Two risks it raised were also closed: an end face could exceed the
  Courant limit, and the substep floor overrode the limit without saying so.
- **FVL-11** A flat stretch in SWMM's own area table for an irregular
  transect gave a 40,930 ft/s wave speed. That pinned 69,031 substeps at the
  floor in EPA user5.
- **FVL-12** The rule line under the FV report's column headings was
  indented two extra columns. Cosmetic.
- **FVL-13** When the fourth node estimate still asked for a shorter substep,
  the loop cut the substep without recording it or holding it to the 0.001 s
  floor. Found by an independent check of the technical description; it
  happened for 18 of 17.9 million substeps in the EPA sweep, and no `.out`
  changed with the fix.
- **FVL-14** Under `LENGTHENING_STEP` the report's Adjusted/Actual Length
  column showed stock's lengthening (508.59 in user4) for an FV link that is
  solved at its true length. Report only; found by a second check of the
  technical description.

## Choices that are mine, not yours

You asked for FV on one link with dynamic wave on the rest. Everything below
was my call, and any of it can change:

- the section name and line format
- 25-ft default cells
- 100 ft/s slot celerity
- CFL 0.5
- the node stability limit A/K
- four node estimates per substep
- extrapolated ghost velocity
- semi-implicit nodes
- friction on the real area
- reported flow = delivered flow
- the area repair
- ERROR 116 and what it rejects
- which nodes follow dynamic wave's head
- the 5.2.4 base (your solver branches use it; the legacy 5.3 port isn't
  done)

## What this does not show

- **No field data.** Stock dynamic wave is the reference, not the truth.
- **Extra head at FV link ends.** The node upstream of an FV link sits
  higher than in stock: +0.19 ft at 12 cells and +0.13 ft at 48 cells in the
  30 cfs chain, and +0.47 ft at the storage node in the mixed case. This is
  numerical and shrinks with refinement; it isn't a model of entrance
  losses. Likely causes are the half-cell bed step at the node (OpenSWMM's
  Chapter 8 describes the same step) and the Riemann solver's dissipation at
  the node faces (OpenSWMM's solver avoids that at two-conduit junctions with
  a pass-through ghost; this branch doesn't). The split wasn't measured.
- **Not in FV links:** evaporation and seepage. Water quality was tested
  with one conservative pollutant only. Hot start files store no cell state,
  so an FV link restarts at uniform depth.
- **Surcharge methods.** All 37 EPA sweep models use EXTRAN, but how often
  their FV end nodes surcharged wasn't measured; the synthetic chains test
  one EXTRAN and three SLOT cases. A node surcharged under EXTRAN doesn't
  book the FV volume exactly.
- **Conduit lengthening** (`LENGTHENING_STEP`) doesn't apply to FV links.
  Three sweep models use it; in user4 stock lengthens the flagged 1.88-ft
  link 509-fold, while the FV link keeps its true length.
- **Cost.** Very short cells are slow. user4's 1.88-ft link has 0.47-ft
  cells and fast shallow flow: 791 substeps per step, 15.5 s vs 3.0 s stock.
  A full pipe subcycles at the slot celerity whatever its length:
  extran10's 1,000-ft pipe, under fixed 60-s routing steps, took 957
  substeps per step, 1.1 s vs 0.004 s (single runs). Use fewer cells on
  short links.
- **Mixed lake at rest.** It isn't exactly still: it sits at dynamic wave's
  own noise floor, about 4e-3 cfs.
- **Not compared against OpenSWMM's FV engine.**
- **Platforms:** native Linux with gcc 13.3 (serial and OpenMP), and a
  WebAssembly build (Emscripten 3.1.51) that the FV Link Lab app runs. No
  MSVC build. The WebAssembly engines match the native `.out` byte for byte
  on most models but not all; see VERIFICATION.md, *WebAssembly build*.

## The app: FV Link Lab

`app/index.html` is a single-file web app that runs stock 5.2.4 and this
branch side by side in the browser, both compiled to WebAssembly. Pick a
sample or open your own `.inp`, click conduits to list them as FV links,
run both engines, compare hydrographs and peaks, and run a byte-for-byte
null check on your own model. Its Doc tab explains the method in the
manner of Robert Heinlein explaining engineering (*One Pipe, Its Own
Clock*, 20 figures), and `app/swmm524-fvlink-one-pipe-its-own-clock.docx`
is the same text as a Word file. To publish it, drag the `app/netlify`
folder onto Netlify. `app/source/` holds everything needed to rebuild it.

## Build

```
git clone --branch v5.2.4 https://github.com/USEPA/Stormwater-Management-Model.git
cd Stormwater-Management-Model && git apply ../swmm524-fvlink.patch
gcc -O2 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 -Isrc/solver -Isrc/solver/include \
    src/solver/*.c src/run/*.c -lm -o runswmm
```

Stock 5.2.4 needs the FORTIFY switches on Ubuntu 24 too. CMake picks up
`fvlink.c` through its source glob.

## Files

| Path | Contents |
|---|---|
| `swmm524-fvlink.patch` | the patch: `fvlink.c` (new, 1,403 lines) plus hooks in 11 existing files |
| `src/solver/` | `fvlink.c` and the 11 changed files, as patched |
| `models/` | every generated test network (DW and FV variants), the gates, and the reviewer's probes in `models/review/` |
| `scripts/` | `gen.py`, `suite.py`, `sweep.py`, `gates.py`, `null_gate.sh`, `outread.py`, `test_closure.c`, `oscillation.py`, `asan_runs.sh`, `omp_check.sh`, `prev_build_cmp.sh`, `pass_count.patch`, `dump_wavespeed.c` |
| `results/` | `suite.csv`, `sweep.csv`, `null_gate.txt`, `gates.txt`, `closure.txt`, `timing_*.txt`, `outdiff_tree.txt`, `oscillation.txt`, `asan.txt`, `omp_check.txt`, `pass_count.txt`, `prev_build_cmp.txt`, `report_excerpts.txt`, `openswmm_check.txt`, `sweep_no_node_limit.csv`, two `timing_*_2026-10-13.txt` files from the earlier session |
| `doc/` | `swmm524-fvlink-how-it-works.docx` (the technical description), `swmm524-fvlink-essay.docx` (the same story as an essay in the manner of Isaac Asimov, *How Many Numbers Make a Pipe?*, with 33 diagrams and charts), `figs.py`, `figs_essay.py` and `figdata.py` (the figures, drawn from engine runs and results files; `essayfigs/` holds the essay's) and the figure data |
| `app/` | the FV Link Lab app (`index.html`), its Word document, a ready-to-deploy `netlify/` folder, and `source/` (the app's sources, the essay source, the figure code and data, the WebAssembly build notes and the test scripts) |
| `VERIFICATION.md` | full evidence, in the Corinne report shape |
| `DEFECTS.md` | FVL-1 to FVL-14 (this branch) and S5-DW1 to S5-DW4 (stock 5.2.4) |

Every file in `results/` was regenerated on the final build on 2026-10-17,
except `sweep_no_node_limit.csv` (a 2026-10-13 experiment with the node
stability limit switched off) and the two timing files from 2026-10-13.

## AI use

This branch, its tests, its documents and the FV Link Lab app were made
with Claude, Anthropic's AI model, in Claude Code sessions from October 13
to 21, 2026, under the direction of Robert (Bob) Dickinson. He asked for
finite volume on chosen links with dynamic wave on the rest, for the
technical description, the two essays and the app; responsibility for the
work is his. Claude read the EPA SWMM 5.2.4 and OpenSWMM source, designed
the method and chose its parameters, wrote `fvlink.c`, the hooks, the test
networks and scripts, ran every test, fixed the defects in `DEFECTS.md`,
compiled both engines to WebAssembly, wrote the app, drew the figures from
the results files, and wrote this README, `VERIFICATION.md`, `DEFECTS.md`,
the technical description and both essays. A second Claude agent reviewed
the code without the build history (FVL-6 to FVL-10), and two more checked
drafts of the Word document against the code and results (FVL-13,
FVL-14). The checks are mechanical: byte comparison with stock on EPA's
regression models, rebuilds from the patch, analytic answers, mass
balances, interleaved timing, sanitizer runs, the WebAssembly-against-native
census and a headless browser test of the app. No person has yet reviewed
`fvlink.c` line by line, run the branch on a project model, approved the
design choices listed above, or checked the app's parsers beyond its
automated tests.
