# CN parameter warnings (branch `dev-cn_warnings`)

Reproducer for silent handling of Curve Number inputs. The fix should add
warnings only: **no change to any computed number**, so nrtest stays identical.

## What the code does now (`src/solver/infil.c` at 07c371f)

```c
// curvenum_setParams, lines 871-872: out-of-range CN is changed with no message
    if ( p[0] < 10.0 ) p[0] = 10.0;
    if ( p[0] > 99.0 ) p[0] = 99.0;

// lines 877-878: DryTime <= 0 is rejected (ERROR 235) ...
    if ( p[2] > 0.0 )  infil->regen =  1.0 / (p[2] * SECperDAY);
    else return FALSE;

// ... so in curvenum_getInfil, line 991, this test can never be false
        if ( infil->regen > 0.0 )
```

## Run

```
./run.sh            # builds the engine from this checkout
./run.sh /path/to/swmm5
```

## Measured on EPA develop 07c371f (all-pervious 10 ac, 2.0 in storm)

| model | infil (in) | runoff (in) | warnings |
|---|---|---|---|
| cn99 | 0.10 | 1.88 | 0 |
| cn100 | 0.10 | 1.88 | 0 |
| cn10 | 1.96 | 0.03 | 0 |
| cn5 | 1.96 | 0.03 | 0 |

`drytime0.inp` stops with ERROR 235.

## Done when

- CN < 10 or > 99 writes a WARNING naming the subcatchment and the value used
- the dead `regen > 0.0` test is removed, or DryTime = 0 is allowed to mean "no recovery"
  (that second choice changes results and belongs behind an option)
