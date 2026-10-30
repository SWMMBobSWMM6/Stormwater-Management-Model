//  Closure gate for fvlink.c (Corinne tests 1, 2 and 7).
//
//  Builds each FV geometry table with the engine's own buildTable(), then
//  checks:
//    - round trip   depth(area(h)) == h            (identity, not "close")
//    - derivative   dA/dh == width, dI1/dh == area (two descriptions agree)
//    - knots        width on both sides of each table node
//    - fidelity     table area vs xsect_getAofY at the table depths and
//                   between them (piecewise-linear interpolation error)
//    - repair       how many table depths had to be bridged (0 for every
//                   built-in shape; the irregular case is shown in user5)
//
//  Compile from the patched src/solver directory:
//    gcc -O2 -w -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 -I. -Iinclude \
//        test_closure.c $(ls *.c | grep -v fvlink.c) -lm -o test_closure
#include "fvlink.c"
#include <stdio.h>

static void report(const char* name, TFvLink* f, TXsect* x)
{
    double h, a, e, rt, rtmax = 0.0, dmax = 0.0, imax = 0.0, fid = 0.0;
    double wL, wR, jump = 0.0, d, wmin = 1e30, fidMid = 0.0;
    int i, k, n = 200000;

    for (k = 1; k < n; k++)
    {
        h = 1.5 * x->yFull * k / n;
        a = areaOf(f, h);
        rt = fabs(depthOf(f, a) - h);
        if ( rt > rtmax ) rtmax = rt;
        e = 1.0e-6 * x->yFull;
        if ( fmod(h, f->dy) > 2*e && f->dy - fmod(h, f->dy) > 2*e &&
             fabs(h - x->yFull) > 2*e )
        {
            d = fabs((areaOf(f, h+e) - areaOf(f, h-e)) / (2*e) - widthOf(f, h))
                / MAX(widthOf(f, h), 1e-12);
            if ( d > dmax ) dmax = d;
            d = fabs((momentOf(f, h+e) - momentOf(f, h-e)) / (2*e) - a) / MAX(a, 1e-12);
            if ( d > imax ) imax = d;
        }
        if ( h < x->yFull )
        {
            d = fabs(a - xsect_getAofY(x, h)) / x->aFull;
            if ( d > fidMid ) fidMid = d;
        }
    }
    for (i = 1; i <= FV_NTAB; i++)
    {
        double y = (i == FV_NTAB) ? x->yFull : i * f->dy;
        d = fabs(f->tA[i] - xsect_getAofY(x, y)) / x->aFull;
        if ( d > fid ) fid = d;
    }
    for (i = 0; i < FV_NTAB; i++) if ( f->tW[i] < wmin ) wmin = f->tW[i];
    for (i = 1; i < FV_NTAB; i++)
    {
        wL = f->tW[i-1]; wR = f->tW[i];
        d = fabs(wR - wL) / MAX(wL, 1e-12);
        if ( d > jump ) jump = d;
    }
    printf("%-14s round-trip %.1e ft | dA/dh vs W %.1e | dI1/dh vs A %.1e |"
           " area vs SWMM at nodes %.1e, between %.1e of Afull |"
           " width jump at a knot %.1f%% |"
           " min width %.3g ft | depths bridged %d | W above full %.4f ft\n",
           name, rtmax, dmax, imax, fid, fidMid, 100*jump, wmin, f->repaired, f->wTop);
}

static void check(const char* name, int type, double g1, double g2, double g3,
                  double g4)
{
    static TFvLink f;
    TXsect x;
    double p[4] = {g1, g2, g3, g4};
    memset(&x, 0, sizeof(x));
    if ( !xsect_setParams(&x, type, p, 1.0) ) { printf("%s: bad params\n", name); return; }
    memset(&f, 0, sizeof(f));
    f.closed = !xsect_isOpen(type);         // as buildLink() sets it
    buildTable(&f, &x);
    report(name, &f, &x);
}

int main(void)
{
    check("CIRCULAR 3", CIRCULAR, 3.0, 0, 0, 0);
    check("RECT_CLOSED", RECT_CLOSED, 3.0, 4.0, 0, 0);
    check("RECT_OPEN", RECT_OPEN, 4.0, 5.0, 0, 0);
    check("TRAPEZOIDAL", TRAPEZOIDAL, 6.0, 4.0, 1.0, 1.0);
    check("HORSESHOE 5", HORSESHOE, 5.0, 0, 0, 0);
    check("SEMICIRCULAR", SEMICIRCULAR, 4.0, 0, 0, 0);
    check("EGGSHAPED 4", EGGSHAPED, 4.0, 0, 0, 0);
    check("CATENARY 4", CATENARY, 4.0, 0, 0, 0);
    check("TRIANGULAR", TRIANGULAR, 3.0, 6.0, 0, 0);
    check("RECT_ROUND", RECT_ROUND, 3.0, 4.0, 2.5, 0);
    check("GOTHIC 4", GOTHIC, 4.0, 0, 0, 0);
    return 0;
}
