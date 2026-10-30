# Evidence: node surface area experiment, 2026-10-30

**Claims**
1. With `SWMM_NODEAREA` unset or 0, this branch reproduces EPA SWMM 5.2.4 exactly.
2. Mode 512 changes the reported flow routing continuity of lengthened models and changes no conduit flow or node depth.
3. The continuity values for every mode and model are those in `results/node-area-results.csv`.

These are claims about the engine's bookkeeping and reproducibility, not about accuracy. No observed data was used.

**Engine.** EPA SWMM 5.2.4 (VERSION 52004), USEPA develop at `07c371f8a0d477da1d9d4e7c0d75719664f62fec`, plus the commits on this branch. Built with `gcc -O2 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 -fopenmp` on Linux (`build.sh`). The branch also builds with EPA's CMake files.

**Inputs.** 42 models: 10 from `gen_models.py`, 2 extra pyswmm files, 21 from USEPA/swmm-nrtestsuite at `d23f9d6941b3244594070b44a18d84014917ff1b` and 9 from pyswmm at `97cb36ff7820ba23ed6c09d9a38551aa619ea88a` (`collect_models.py`). Each model runs with its own options. The synthetic networks use CFS, DYNWAVE, a 5-s routing step (15 s and 20 s in two of them), variable step 0.75 except where fixed, and EXTRAN surcharge except M10 (SLOT).

| Check | How | Tolerance | Result |
|---|---|---|---|
| Null control | `run_modes.py` byte-compares the mode 0 `.out` with unmodified EPA SWMM 5.2.4 for every model | byte-identical | 42 of 42 |
| Mode 512, non-lengthened models | `cmp` of the mode 512 and mode 0 `.out` | byte-identical | 37 of 37 |
| Mode 512, lengthened models | `tools/out-diff.js`, every conduit and node, every reporting period | largest difference exactly 0 | 5 of 5: max \|ΔQ\| = 0, max \|ΔY\| = 0 |
| Results table | `reproduce.sh` regenerates the table from a clean clone and compares | file-identical | MATCH (run 2026-10-30) |
| Same answers as Oct 12 | Fresh table compared cell by cell with the October 12 table | identical | 629 of 630 cells; the one change is the corrected mode 512 value for CoS-Reduced-Outlets, +0.248 → +0.249 |
| Repeat runs | CoS-Reduced-Inlets, mode 160, four threads, run twice | byte-identical | identical |

**Not shown.** Accuracy against observations. Water quality, hot start, ponding beyond three models, pyswmm toolkit use, Windows/MSVC builds. Conduit shapes in the regression set were not counted.
