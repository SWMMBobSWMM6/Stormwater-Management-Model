# Runs behind the story

Every model result in *Thaw on the Thoth* comes from one of these runs. The
`.inp` and `.rpt` files are in `runs/`. The `.out` files are not kept here
(about 1.3 MB each); rerun an input to get one.

Engines (all built from this branch's tree, `src/`):

| Name | Build |
|---|---|
| Earth stock | EPA SWMM 5.2.4 (commit `7952ca8`), unchanged |
| Mars stock | EPA SWMM 5.2.4 + `mars_gravity.patch` (GRAVITY 12.2) |
| Mars FV | this branch (swmm524-fvlink) + `mars_gravity.patch` |
| Mars FV, prototype 15b | this branch + `mars_gravity.patch` + `../../fvlink/prototypes/fvl-15b.diff` (not adopted) |

| Story | Input | Engine | Report | Key result |
|---|---|---|---|---|
| Ch. I, II: the Company forecast | `CO.inp` | Earth stock | `CO.rpt` | basin crest 13.29 ft; average step 0.27 s; THROAT max 14,036 cfs; continuity -0.024 % |
| Ch. II: Lock merged, Earth constants | `A2.inp` | Earth stock | `A2.rpt` | basin crest 13.28 ft |
| Ch. III: Mars gravity only | `B_stock.inp` | Mars stock | `Bs.rpt` | U1 at hour 12: 2.38 ft; L6 at its bank at hour 37.4; 20.9 Mgal over it |
| Ch. III: the same, fixed 2-s step | `B_stock_2s.inp` | Mars stock | `Bs2.rpt` | 22.0 Mgal over the bank |
| Ch. III: corrected (n 0.02437, Cw 2.050) | `F_nospill_stock.inp` | Mars stock | `F_nospill_stock.rpt` | U1 base 3.16 ft, crest 13.54 ft; basin at the levee at hour 40.3; 134.8 Mgal over |
| Ch. III: Company geometry, corrected | `C_mars.inp` | Mars stock | `C_mars.rpt` | at the levee at hour 40.3; continuity -18.139 %; THROAT 24,439 cfs |
| Ch. IV: FV throat and culvert (FVL-15) | `CM_lockfv.inp` | Mars FV | `CMl.rpt` | hour 24: LOCK 0.63 ft deep, BASIN 7.7 ft higher, 300 cfs at 11.9 ft/s into BASIN |
| Ch. IV: Raffi's fix | `CM_lockfv.inp` | Mars FV 15b | `CMl15b.rpt` | LOCK 1.97 ft below BASIN at base flow; CULVERT max 3,412 cfs; U4 floods 199 Mgal; L6 256 Mgal |
| Ch. IV: the fix under the gate plan (not in the story) | `CMl_plan.inp` | Mars FV 15b / Mars FV | `CMl_plan15b.rpt`, `CMl_plan.rpt` | |
| Ch. V: FV culvert, 4 cells | `C.inp` | Mars FV | `tm_fv4.rpt` | network step 16.3 s; 334.7 substeps per step |
| Ch. V: FV culvert, 1 cell | `F_nospill_fv1.inp` | Mars FV | `tm_fv1.rpt`, `F_nospill_fv1.rpt` | 84.4 substeps per step; at the levee at hour 40.4; 134.3 Mgal |
| Ch. V: null check | `F_nospill_stock.inp` | Mars FV (no `[FV_LINKS]`) | `nullfv.rpt` | `.out` byte-identical to Mars stock (1,273,166 bytes) |
| Ch. V: plain engine for timing | `F_nospill_stock.inp` | Mars stock | `tm_stock.rpt` | |
| Ch. VI: gate clock, full gate open at hour 37 to 41, closed at 56 | `F_full37_fv1.inp` ... `F_full41_fv1.inp` (38: `F_full38_fv1.inp`) | Mars FV | same names | 13.64, 13.64, 14.01, 14.39 ft, then over (5.1 Mgal) |
| Ch. VI: half gate 38 to 52; half gate 36 to 52 | `F_half38_fv1.inp`, `F_half36_fv1.inp` | Mars FV | same names | 14.32 ft (853 ac-ft), 14.32 ft (961 ac-ft) |
| Ch. VI: full gate 38 to 52 (the plan) | `F_full38c52_fv1.inp`, `F_full38c52_stock.inp` | Mars FV, Mars stock | same names | 13.98 ft, 13.99 ft; 1,443 ac-ft |
| Ch. VI: sill 5 % weaker | `H_*_cw95.inp` | Mars FV | same names | half: over; 38-52: 14.17; 38-56: 13.81 |
| Ch. VI: thaw 10 % bigger | `H_*_pk110.inp` | Mars FV | same names | half: over (21.2 Mgal); 38-52: 14.38; 38-56: 13.97 |
| Ch. VI: roughness -5 %, +5 %, +10 % | `G_*.inp` | Mars FV | same names | 38-52 crest 13.97 to 14.03 ft |

The `D*`, `E*`, `j_*`, `s_*`, `v*`, `lockstor_dw` and `COg` files are
exploratory runs made while the model was being built. They are kept for the
record and are not used in the story.

Timing (`../timing_C.json`): five interleaved runs each on one modern machine;
medians 6.47 s (stock), 9.40 s (FV, 4 cells), 1.40 s (FV, 1 cell). The
Company model (`CO.inp`, Earth stock) took 13.84 s. The Clerk in the story
is fiction; its times are these times 1,000.
