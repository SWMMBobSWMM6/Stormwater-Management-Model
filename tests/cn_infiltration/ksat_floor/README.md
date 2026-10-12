# The unused second CN field (branch `dev-cn_ksat_floor`)

`[INFILTRATION]` CN lines carry three numbers (`infil_readParams`, line 159,
`n = 4` tokens). `curvenum_setParams` uses only `p[0]` (CN) and `p[2]` (DryTime);
`p[1]`, the old conductivity field, is read and thrown away.

The CN rate also decays toward zero in a long storm, because
dF/dP = S²/(P+S)² has no lower bound.

## Run

```
./run.sh            # also compiles probe.c against the engine API
```

## Measured on EPA develop 07c371f

- `ks0.inp` (field 0) and `ks5.inp` (field 5.0): both 1.40 in infiltration
- CN 70, 0.5 in/hr for 24 hr: rate 0.402 in/hr at hour 1, 0.152 at hour 7,
  0.079 at hour 13, **0.037 in/hr at hour 23**; 3.16 in infiltrated of 12.0 in

## Design for the fix

Option A: warn when the field is nonzero, since users may think it does something.
Option B: use it as a floor rate while water is available and S > 0, behind an
`[OPTIONS]` keyword. Existing files may carry any value in this field, since it has
never mattered, so using it by default would silently change their results.
