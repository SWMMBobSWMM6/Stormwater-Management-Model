# Initial abstraction ratio for CN (branch `dev-cn_ia_ratio`)

SWMM's CN equation has Ia fixed at zero (`src/solver/infil.c` line 958):

```c
        F1 = infil->P * (1.0 - infil->P / (infil->P + infil->Se));
```

That is F = P·S/(P+S), so Q = P²/(P+S). TR-55 uses Q = (P − λS)²/(P − λS + S)
with λ = 0.2; Hawkins et al. / Woodward et al. (2002-2003) recommend λ = 0.05 with
S₀.₀₅ = 1.33·S₀.₂^1.15. Depression storage was meant to stand in for Ia.

## Run

```
./run.sh
```

## Measured on EPA develop 07c371f

CN 80 (S = 2.5 in), Width 50,000 ft and S-Perv 0 to isolate the in-storm equation.
Runoff in inches:

| P (in) | SWMM | Ia = 0 form | TR-55 λ = 0.2 | λ = 0.05 (S₀.₀₅) |
|---|---|---|---|---|
| 1.0 | 0.29 | 0.29 | 0.08 | 0.14 |
| 2.0 | 0.89 | 0.89 | 0.56 | 0.58 |
| 4.0 | 2.46 | 2.46 | 2.04 | 1.90 |

## Design for the fix

Add λ as an `[OPTIONS]` keyword (e.g. `CN_IA_RATIO 0.2`), default 0. Not a fourth
number on the `[INFILTRATION]` line: older engines read three values and ignore
the rest, so they would silently run λ models with Ia = 0. An unknown `[OPTIONS]`
keyword stops older engines with ERROR 205, which is the failure you want.
