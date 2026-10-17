/*
 * probe.c - print rainfall and infiltration rate for subcatchment 0
 * at fixed reporting minutes while stepping the engine.
 *
 * usage: probe <model.inp> <report.rpt> <output.out> <from_min> <to_min> <every_min>
 * Output columns: minute, rainfall (in/hr), infiltration (in/hr)
 */
#include <stdio.h>
#include <stdlib.h>
#include "swmm5.h"

int main(int argc, char *argv[])
{
    double elapsed = 0.0, from, to, every, next;
    if (argc < 7) {
        fprintf(stderr, "usage: probe inp rpt out from_min to_min every_min\n");
        return 1;
    }
    from = atof(argv[4]); to = atof(argv[5]); every = atof(argv[6]);
    if (swmm_open(argv[1], argv[2], argv[3])) return 2;
    if (swmm_start(1)) return 3;
    next = from;
    do {
        double minute;
        if (swmm_step(&elapsed)) break;
        minute = elapsed * 1440.0;
        while (elapsed > 0.0 && minute >= next - 1e-6 && next <= to + 1e-6) {
            printf("%7.0f  %6.3f  %6.3f\n", next,
                   swmm_getValue(swmm_SUBCATCH_RAINFALL, 0),
                   swmm_getValue(swmm_SUBCATCH_INFIL, 0));
            next += every;
        }
    } while (elapsed > 0.0);
    swmm_end();
    swmm_close();
    return 0;
}
