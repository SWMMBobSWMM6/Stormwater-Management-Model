//-----------------------------------------------------------------------------
//   sgi.c
//
//   Staggered-grid implicit (SGI) head solve for dynamic wave routing.
//   An extension to EPA SWMM 5.2.4 - not part of the stock engine.
//
//   Holds the options, work arrays, run statistics and the linear solver.
//   The matrix is the weighted graph Laplacian of the link-node network plus
//   a positive diagonal. It is column diagonally dominant with non-positive
//   off-diagonals, symmetric except at links whose flow is set by one end
//   only, and is solved by Jacobi-preconditioned BiCGSTAB.
//-----------------------------------------------------------------------------
#include <stdlib.h>
#include <math.h>
#include "headers.h"
#include "sgi.h"

TSgi    Sgi = {0, 1.0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
double* SgiDenom = NULL;
double* SgiOmega = NULL;
double* SgiKap   = NULL;
double* SgiCoup  = NULL;
double* SgiCoup2 = NULL;
double* SgiA     = NULL;
double* SgiDiag  = NULL;
double* SgiRhs   = NULL;
double* SgiX     = NULL;
double* SgiYnew  = NULL;
double* SgiLam   = NULL;
double* SgiPrev  = NULL;
double* SgiVold  = NULL;
double* SgiAs0   = NULL;
double* SgiYref  = NULL;
double* SgiShare = NULL;
double* SgiTheta = NULL;
char*   SgiFixed = NULL;
char*   SgiSur   = NULL;

static double *R, *R0, *P, *V, *S, *T, *Y, *Z;

//=============================================================================

int sgi_open(int n, int m)
{
    int j;
    sgi_close();
    SgiDenom = (double *) calloc(m + 1, sizeof(double));
    SgiOmega = (double *) calloc(m + 1, sizeof(double));
    SgiKap   = (double *) calloc(m + 1, sizeof(double));
    SgiCoup  = (double *) calloc(m + 1, sizeof(double));
    SgiCoup2 = (double *) calloc(m + 1, sizeof(double));
    SgiA     = (double *) calloc(n + 1, sizeof(double));
    SgiDiag  = (double *) calloc(n + 1, sizeof(double));
    SgiRhs   = (double *) calloc(n + 1, sizeof(double));
    SgiX     = (double *) calloc(n + 1, sizeof(double));
    SgiYnew  = (double *) calloc(n + 1, sizeof(double));
    SgiLam   = (double *) calloc(n + 1, sizeof(double));
    SgiPrev  = (double *) calloc(n + 1, sizeof(double));
    SgiVold  = (double *) calloc(n + 1, sizeof(double));
    SgiAs0   = (double *) calloc(n + 1, sizeof(double));
    SgiYref  = (double *) calloc(n + 1, sizeof(double));
    SgiShare = (double *) calloc(n + 1, sizeof(double));
    SgiTheta = (double *) calloc(n + 1, sizeof(double));
    SgiFixed = (char *)   calloc(n + 1, sizeof(char));
    SgiSur   = (char *)   calloc(n + 1, sizeof(char));
    R  = (double *) calloc(n + 1, sizeof(double));
    R0 = (double *) calloc(n + 1, sizeof(double));
    P  = (double *) calloc(n + 1, sizeof(double));
    V  = (double *) calloc(n + 1, sizeof(double));
    S  = (double *) calloc(n + 1, sizeof(double));
    T  = (double *) calloc(n + 1, sizeof(double));
    Y  = (double *) calloc(n + 1, sizeof(double));
    Z  = (double *) calloc(n + 1, sizeof(double));
    if ( !SgiDenom || !SgiOmega || !SgiKap || !SgiCoup || !SgiCoup2 || !SgiA ||
         !SgiDiag || !SgiRhs || !SgiX || !SgiYnew || !SgiTheta || !SgiLam ||
         !SgiPrev || !SgiVold || !SgiAs0 || !SgiYref || !SgiShare ||
         !SgiFixed || !SgiSur || !R || !R0 || !P || !V || !S || !T ||
         !Y || !Z ) return 0;
    for (j = 0; j < m; j++) { SgiDenom[j] = 1.0; SgiOmega[j] = 1.0; }
    Sgi.steps = Sgi.trials = Sgi.maxTrialsUsed = Sgi.nonConverged = 0.0;
    Sgi.pcgIters = Sgi.maxPcgIters = Sgi.maxLinResid = Sgi.damped = 0.0;
    Sgi.fallbacks = Sgi.linFailures = Sgi.closures = 0.0;
    Sgi.closing = 0;
    return 1;
}

//=============================================================================

void sgi_close(void)
{
    FREE(SgiDenom); FREE(SgiOmega); FREE(SgiKap); FREE(SgiCoup); FREE(SgiCoup2); FREE(SgiA);
    FREE(SgiDiag); FREE(SgiRhs); FREE(SgiX); FREE(SgiYnew); FREE(SgiTheta);
    FREE(SgiFixed); FREE(SgiSur); FREE(SgiLam); FREE(SgiPrev); FREE(SgiVold);
    FREE(SgiAs0); FREE(SgiYref); FREE(SgiShare);
    FREE(R); FREE(R0); FREE(P); FREE(V); FREE(S); FREE(T); FREE(Y); FREE(Z);
}

//=============================================================================

static void matvec(int n, int m, const double* x, double* ax)
//
//  Row of a link's upstream node:   +c1 dH1 - c2 dH2
//  Row of its downstream node:      +c2 dH2 - c1 dH1
//  (the +c1 and +c2 are already in SgiDiag)
//
{
    int i, j, n1, n2;
    for (i = 0; i < n; i++) ax[i] = SgiFixed[i] ? 0.0 : SgiDiag[i] * x[i];
    for (j = 0; j < m; j++)
    {
        if ( SgiCoup[j] <= 0.0 && SgiCoup2[j] <= 0.0 ) continue;
        n1 = Link[j].node1;
        n2 = Link[j].node2;
        if ( SgiFixed[n1] || SgiFixed[n2] ) continue;
        ax[n1] -= SgiCoup2[j] * x[n2];
        ax[n2] -= SgiCoup[j] * x[n1];
    }
}

static double dot(int n, const double* a, const double* b)
{
    int i; double s = 0.0;
    for (i = 0; i < n; i++) s += a[i] * b[i];
    return s;
}

static double maxabs(int n, const double* a)
{
    int i; double s = 0.0;
    for (i = 0; i < n; i++) if ( fabs(a[i]) > s ) s = fabs(a[i]);
    return s;
}

//=============================================================================

static int directSolve(int n, int m)
//
//  Gaussian elimination with partial pivoting on the free nodes, used only
//  when BiCGSTAB does not reach tolerance. Dense, so limited to 3000 free
//  nodes. Returns 1 if a finite solution was found.
//
{
    int     i, j, k, p, nf = 0, n1, n2, ok = 1;
    int*    idx;
    double* a;
    double* b;
    double  piv, f, t;

    idx = (int *) malloc((n + 1) * sizeof(int));
    if ( !idx ) return 0;
    for (i = 0; i < n; i++) idx[i] = SgiFixed[i] ? -1 : nf++;
    if ( nf == 0 ) { free(idx); return 1; }
    if ( nf > 3000 ) { free(idx); return 0; }
    a = (double *) calloc((size_t)nf * nf, sizeof(double));
    b = (double *) calloc(nf, sizeof(double));
    if ( !a || !b ) { free(idx); FREE(a); FREE(b); return 0; }
    for (i = 0; i < n; i++)
    {
        if ( idx[i] < 0 ) continue;
        a[(size_t)idx[i] * nf + idx[i]] = SgiDiag[i];
        b[idx[i]] = SgiRhs[i];
    }
    for (j = 0; j < m; j++)
    {
        if ( SgiCoup[j] <= 0.0 && SgiCoup2[j] <= 0.0 ) continue;
        n1 = idx[Link[j].node1];
        n2 = idx[Link[j].node2];
        if ( n1 < 0 || n2 < 0 ) continue;
        a[(size_t)n1 * nf + n2] -= SgiCoup2[j];
        a[(size_t)n2 * nf + n1] -= SgiCoup[j];
    }
    for (k = 0; k < nf && ok; k++)
    {
        p = k;
        piv = fabs(a[(size_t)k * nf + k]);
        for (i = k + 1; i < nf; i++)
            if ( fabs(a[(size_t)i * nf + k]) > piv )
            { piv = fabs(a[(size_t)i * nf + k]); p = i; }
        if ( !(piv > 1.0e-300) ) { ok = 0; break; }
        if ( p != k )
        {
            for (j = k; j < nf; j++)
            { t = a[(size_t)k*nf + j]; a[(size_t)k*nf + j] = a[(size_t)p*nf + j]; a[(size_t)p*nf + j] = t; }
            t = b[k]; b[k] = b[p]; b[p] = t;
        }
        for (i = k + 1; i < nf; i++)
        {
            f = a[(size_t)i * nf + k];
            if ( f == 0.0 ) continue;
            f /= a[(size_t)k * nf + k];
            for (j = k + 1; j < nf; j++) a[(size_t)i*nf + j] -= f * a[(size_t)k*nf + j];
            b[i] -= f * b[k];
        }
    }
    if ( ok )
    {
        for (k = nf - 1; k >= 0; k--)
        {
            t = b[k];
            for (j = k + 1; j < nf; j++) t -= a[(size_t)k*nf + j] * b[j];
            b[k] = t / a[(size_t)k*nf + k];
            if ( !(fabs(b[k]) < 1.0e300) ) ok = 0;
        }
    }
    if ( ok ) for (i = 0; i < n; i++) if ( idx[i] >= 0 ) SgiX[i] = b[idx[i]];
    free(idx); free(a); free(b);
    return ok;
}

//=============================================================================

int sgi_solve(int n, int m)
//
//  Solves for the head change SgiX at the free nodes. Nodes flagged in
//  SgiFixed keep the value already in SgiX (the caller has folded their
//  effect into SgiRhs). Returns the number of iterations used.
//
{
    int    i, it, maxit = 5 * n + 50;
    double rho = 1.0, rhoNew, alpha = 1.0, omega = 1.0, beta, tol, resid, d;

    for (i = 0; i < n; i++)
    {
        P[i] = V[i] = S[i] = T[i] = Y[i] = Z[i] = 0.0;
        if ( SgiFixed[i] ) { R[i] = R0[i] = 0.0; continue; }
        SgiX[i] = 0.0;
        R[i] = R0[i] = SgiRhs[i];
    }
    resid = maxabs(n, R);
    tol = 1.0e-9 + 1.0e-12 * resid;

    for (it = 0; it < maxit && resid > tol; it++)
    {
        rhoNew = dot(n, R0, R);
        if ( fabs(rhoNew) < 1.0e-300 ) break;
        beta = (rhoNew / rho) * (alpha / omega);
        rho = rhoNew;
        for (i = 0; i < n; i++)
        {
            if ( SgiFixed[i] ) continue;
            P[i] = R[i] + beta * (P[i] - omega * V[i]);
            Y[i] = P[i] / SgiDiag[i];
        }
        matvec(n, m, Y, V);
        d = dot(n, R0, V);
        if ( fabs(d) < 1.0e-300 ) break;
        alpha = rho / d;
        for (i = 0; i < n; i++) S[i] = R[i] - alpha * V[i];
        if ( maxabs(n, S) <= tol )
        {
            for (i = 0; i < n; i++)
                if ( !SgiFixed[i] ) { SgiX[i] += alpha * Y[i]; R[i] = S[i]; }
            resid = maxabs(n, R);
            it++;
            break;
        }
        for (i = 0; i < n; i++) Z[i] = SgiFixed[i] ? 0.0 : S[i] / SgiDiag[i];
        matvec(n, m, Z, T);
        d = dot(n, T, T);
        if ( d < 1.0e-300 ) break;
        omega = dot(n, T, S) / d;
        for (i = 0; i < n; i++)
        {
            if ( SgiFixed[i] ) continue;
            SgiX[i] += alpha * Y[i] + omega * Z[i];
            R[i] = S[i] - omega * T[i];
        }
        resid = maxabs(n, R);
        if ( omega == 0.0 ) break;
    }
    Sgi.pcgIters += it;
    if ( it > Sgi.maxPcgIters ) Sgi.maxPcgIters = it;

    // --- if the iteration stalled, hand the system to the direct solver;
    //     if that fails too, make no head change on this trial
    if ( !(resid <= 1.0e-6 * (1.0 + maxabs(n, SgiRhs))) )
    {
        Sgi.fallbacks += 1.0;
        if ( directSolve(n, m) ) resid = 0.0;
        else
        {
            Sgi.linFailures += 1.0;
            for (i = 0; i < n; i++) if ( !SgiFixed[i] ) SgiX[i] = 0.0;
            return it;
        }
    }
    if ( resid > Sgi.maxLinResid ) Sgi.maxLinResid = resid;
    return it;
}
