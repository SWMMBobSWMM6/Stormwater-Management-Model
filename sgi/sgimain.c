/* test driver: SGI / SGI_THETA / SGI_TRIALS env vars select the extension */
#include <stdio.h>
#include <stdlib.h>
#include "swmm5.h"
int main(int argc, char* argv[])
{
    const char* s = getenv("SGI"); const char* t = getenv("SGI_THETA"); const char* k = getenv("SGI_TRIALS");
    double v[10]; float e1, e2, e3;
    if ( argc < 4 ) { printf("usage: sgiswmm in.inp out.rpt out.out\n"); return 1; }
    swmm_setSgiOptions(s ? atoi(s) : 0, t ? atof(t) : 1.0, k ? atoi(k) : 0);
    int rc = swmm_open(argv[1], argv[2], argv[3]);
    if ( !rc ) rc = swmm_start(1);
    if ( !rc ) { double el = 0; do { rc = swmm_step(&el); } while ( el > 0 && !rc ); }
    swmm_end();
    swmm_getMassBalErr(&e1, &e2, &e3);
    swmm_getSgiStats(v);
    swmm_report();
    swmm_close();
    printf("rc=%d cont=%.3f%% steps=%g trials/step=%.2f maxTrials=%g nonConv=%g linIters/solve=%.1f maxLinIters=%g linRes=%.2g damped=%g directSolves=%g linFail=%g\n",
        rc, e2, v[0], v[0] > 0 ? v[1]/v[0] : 0, v[2], v[3], v[1] > 0 ? v[4]/v[1] : 0, v[5], v[6], v[7], v[8], v[9]);
    return rc;
}
