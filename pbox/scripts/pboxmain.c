/* test driver: PBOX=1 switches the implicit box scheme on; PBOX_THETA, PBOX_SLOT, PBOX_BASE, PBOX_SPACING tune it */
#include <stdio.h>
#include <stdlib.h>
#include "swmm5.h"
static double env(const char* n, double d) { const char* s = getenv(n); return s ? atof(s) : d; }
int main(int argc, char* argv[])
{
    double v[10], el = 0; int rc;
    if ( argc < 4 ) { printf("usage: pboxswmm in.inp out.rpt out.out\n"); return 1; }
    swmm_setPboxOptions((int)env("PBOX", 0), env("PBOX_THETA", 0), env("PBOX_SLOT", 0), env("PBOX_BASE", -1), env("PBOX_SPACING", 0));
    rc = swmm_open(argv[1], argv[2], argv[3]);
    if ( !rc ) rc = swmm_start(1);
    if ( !rc ) do { rc = swmm_step(&el); } while ( el > 0 && !rc );
    swmm_end();
    swmm_getPboxStats(v);
    swmm_report();
    swmm_close();
    printf("rc=%d mode=%g conduits=%g sections=%g steps=%g substeps=%g meanIt=%.2f maxIt=%g halvings=%g nonConv=%g unsupported=%g\n",
        rc, v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9]);
    return rc;
}
