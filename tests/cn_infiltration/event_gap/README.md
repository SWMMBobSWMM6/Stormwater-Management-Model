# CN event separation time (branch `dev-cn_event_gap`)

The inter-event time that resets the CN curve is locked to the drying time
(`src/solver/infil.c` line 881):

```c
    // --- compute inter-event time from regeneration const. as in Green-Ampt
    infil->Tmax = 0.06 / infil->regen;
```

`regen = 1/(DryTime·86400)`, so Tmax = 0.06 × DryTime: 2, 7 and 14 days give
2.9, 10.1 and 20.2 hr. Changing DryTime to tune recovery also moves the event
boundary, and results jump when a dry period crosses it.

## Run

```
./run.sh
```

## Measured on EPA develop 07c371f

CN 80, DryTime 7 d (Tmax 10.08 hr), two 2.0 in storms (1 in/hr x 2 hr), wide plane:

| gap (hr) | infil (in) | runoff (in) |
|---|---|---|
| 9.00 | 1.54 | 2.46 |
| 9.50 | 1.54 | 2.46 |
| 9.75 | 1.54 | 2.46 |
| 10.00 | 1.54 | 2.46 |
| 10.25 | 1.99 | 2.01 |
| 10.50 | 1.99 | 2.01 |
| 11.00 | 1.99 | 2.01 |

A 15-minute change in the gap moves event runoff by 0.45 in.

## Design for the fix

An `[OPTIONS]` keyword for the CN event gap in hours; when absent, keep
0.06 × DryTime so existing models reproduce exactly.
