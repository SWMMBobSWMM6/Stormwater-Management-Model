# Infiltration adjustments reach CN (branch `dev-cn_infil_pattern`)

Upstream: USEPA/Stormwater-Management-Model issues #198 / #199.

`[ADJUSTMENTS] CONDUCTIVITY` and `[ADJUSTMENTS] INFIL <subcatch> <pattern>` both
parse cleanly on a Curve Number subcatchment and then do nothing.

## What the code does now (`src/solver/infil.c` at 07c371f)

`InfilFactor` is set in `infil_setInfilFactor` (lines 262-284) and read only by
Horton, Modified Horton and Green-Ampt:

```c
    double f0   = infil->f0 * InfilFactor;      // line 400, Horton
    double f0 = infil->f0 * InfilFactor;        // line 511, Modified Horton
    Fumax = infil->IMDmax * infil->Lu * sqrt(InfilFactor);   // line 648, Green-Ampt
```

`curvenum_getInfil` never reads it. Seasonal **recovery** already works for CN
through `[EVAPORATION] RECOVERY` (line 1001, `Evap.recoveryFactor`).

## Run

```
./run.sh
```

## Measured on EPA develop 07c371f (CN 80 or Horton 3.0/0.5/4, 2.0 in storm, factor 0.5)

| model | infil (in) | runoff (in) |
|---|---|---|
| cn_base | 1.40 | 0.59 |
| cn_conductivity | 1.40 | 0.59 |
| cn_infil_pattern | 1.40 | 0.59 |
| horton_base | 2.00 | 0.00 |
| horton_conductivity | 1.58 | 0.42 |
| horton_infil_pattern | 1.58 | 0.42 |

## Design for the fix

Apply the factor to the regeneration constant, not to Smax or CN: no new .inp
syntax, `Se` already latches capacity at event start, and a factor on CN is
nonlinear and runs into the 10-99 clamp. Hazard to state in the PR: any existing
model that carries a currently-ignored pattern on a CN subcatchment will change.
