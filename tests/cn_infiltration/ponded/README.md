# Ponded water and runon on the CN curve (branch `dev-cn_ponded`)

Three linked defects in `curvenum_getInfil`. One fix, behind a new `[OPTIONS]`
keyword; the default must reproduce 07c371f exactly.

## 1. Event volume depends on subcatchment Width

After rain stops, ponded water infiltrates at the rate from the last rain step
(`src/solver/infil.c` lines 969-974):

```c
        // --- if there is ponded water then use previous infil. rate
        if ( depth > MIN_TOTAL_DEPTH && infil->S > 0.0 )
        {
            f1 = infil->f;
            if ( f1*tstep > infil->S ) f1 = infil->S / tstep;
        }
```

A slower overland recession (smaller Width) gives more infiltration.

## 2. Zero infiltration at the start of the next burst

Water infiltrated in a gap pushes F above F1(P); lines 961-962 then zero the rate,
and the `else` branch at lines 999-1003 regenerates S while it is raining:

```c
        f1 = (F1 - infil->F) / tstep;
        if ( f1 < 0.0 || infil->S <= 0.0 ) f1 = 0.0;
...
    else
    {
        infil->S += infil->regen * infil->Smax * tstep * Evap.recoveryFactor;
```

## 3. Runon never reaches the curve

Horton and Green-Ampt receive `rainfall+runon`; CN receives rainfall only
(`infil_getInfil`, lines 314-316):

```c
      case CURVE_NUMBER:
        depth += runon * tstep;
        return curvenum_getInfil(&Infil[j].curveNum, tstep, rainfall, depth);
```

## Run

```
./run.sh            # also compiles probe.c against the engine API
```

## Measured on EPA develop 07c371f

CN 80, 2.0 in storm (0.5 in/hr x 4 hr), 10 ac all pervious, no depression storage:

| Width (ft) | infil (in) | runoff (in) |
|---|---|---|
| 50 | 1.79 | 0.17 |
| 500 | 1.40 | 0.59 |
| 5,000 | 1.16 | 0.84 |
| 50,000 | 1.11 | 0.89 |

50% impervious routed 100% onto pervious vs to outlet, infiltration gained:
CN **+0.05 in**, Horton control **+0.42 in**.

CN 70, S-Perv 0.2 in, 1 in/hr for 1 hr, 1 hr gap, 1 in/hr for 1 hr: infiltration
runs at 0.659 in/hr for ~20 min of the gap, then is **0.000 in/hr from minute 120
to 135** while it rains 1 in/hr, resuming at 0.583 in/hr by minute 140.

## Done when

With the new option on: the Width table collapses toward the in-storm curve value,
the CN runon gain is of the same order as Horton's, and no rainy minute in
`rain_gap.inp` has zero infiltration while capacity remains. With it off: every
number above is unchanged. Share the keyword with the coupled-infiltration option
in the runoff-solver work rather than adding a second switch.
