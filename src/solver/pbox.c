//-----------------------------------------------------------------------------
//   pbox.c
//
//   Project:      EPA SWMM 5.2.4 -- modified engine (NOT stock EPA SWMM)
//   Version:      2026-10-02
//   Responsible:  Robert (Bob) Dickinson, SWMM Enablement
//   License:      public domain, like EPA SWMM 5 itself; no copyright is
//                 claimed in this file
//
//   Implicit four-point (Preissmann box scheme) solution of the full
//   St. Venant equations for conduits, solved simultaneously with node
//   continuity by Newton-Raphson iteration. This is the numerical method
//   the InfoWorks ICM 1D engine is documented as using, rebuilt from the
//   published literature (Preissmann 1961; Cunge & Wegner 1964; Cunge,
//   Holly & Verwey 1980). It contains no InfoWorks code and is not expected
//   to reproduce InfoWorks numbers.
//
//   What replaces stock dynamic wave when PboxMode = 1:
//     - several computational sections per conduit (spacing = PboxSpacing
//       x conduit width) instead of one momentum cell per conduit
//     - a theta-weighted implicit box scheme with no Courant limit: the
//       user's ROUTING_STEP is used as given and halved only when Newton
//       fails (theta = 1 by default; a step that fails at theta < 1 is
//       first retried at theta = 1)
//     - each conduit's interior unknowns are condensed onto its two end
//       depths (banded solve), leaving one sparse system in the node heads
//     - a Preissmann slot (PboxSlotFrac x max width) on closed conduits,
//       with the crown width blended into the slot width
//     - a base depth (PboxBaseFrac x height) held in every conduit by a
//       base flow that passes through the conduit but never enters a node;
//       link flows and volumes are reported net of it
//     - convective inertia phased out between Froude 0.8 and 1.0
//     - junctions carry their own plan area (MinSurfArea); no link surface
//       area is lumped onto nodes; a dry node that a front draws on runs a
//       small volume debt (reported depth 0) instead of having water made
//     - pumps, orifices, weirs and outlets use SWMM's own functions, with
//       their dq/dh in the node system
//
//   Not modelled (counted in the report): conduit flap gates, culvert inlet
//   control, force-main equations (Manning is used), conduit seepage and
//   evaporation, conduit flow limits. Dummy conduits pass flow through.
//
//   Off (PboxMode = 0, the default) none of this code runs.
//
//   AI use: this module, its hooks in flowrout.c and swmm5.c, its API and
//   test driver were written by Claude, Anthropic's AI model, in a claude.ai
//   session in October 2026, under the direction of Robert Dickinson, who
//   asked for the solver, chose where it goes and is comparing it against
//   InfoWorks ICM himself. Claude also wrote the test models and found and
//   fixed the convergence faults. The checks so far are mechanical, not a
//   human code review: switched off, the engine writes .out files that are
//   byte-identical to stock 5.2.4 on 16 test models; switched on, it is
//   compared element by element with stock dynamic wave on the same 16.
//   It has not yet been compared with InfoWorks ICM or with field data.
//-----------------------------------------------------------------------------
#define _CRT_SECURE_NO_DEPRECATE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "headers.h"

//-----------------------------------------------------------------------------
//  Run-time options (see swmm_setPboxOptions in swmm5.c)
//-----------------------------------------------------------------------------
int    PboxMode     = 0;       // 0 = stock dynamic wave, 1 = implicit box scheme
double PboxTheta    = 1.0;     // time weighting (0.5 - 1.0)
double PboxSlotFrac = 0.02;    // slot width / max. conduit width
double PboxBaseFrac = 0.05;    // base depth / conduit height
double PboxSpacing  = 20.0;    // section spacing / conduit width

//-----------------------------------------------------------------------------
//  Constants
//-----------------------------------------------------------------------------
#define MAXPTS    61           // max. sections per conduit
#define MAXHALVE  8            // max. successive halvings of the time step
#define MAXITER   30           // max. Newton iterations per (sub)step
#define YMIN      1.0e-4       // min. section depth (ft)
#define YLOW     -3.0          // lowest depth variable, in base depths (d = 1.8% of base)
#define FR_LO     0.8          // Froude no. where inertia phase-out starts
#define FR_HI     1.0          // Froude no. where inertia is fully removed
#define TOL_Y     5.0e-4       // depth convergence tolerance (ft)
#define TOL_Q     1.0e-4       // flow tolerance as fraction of full flow
#define DH_MAX    3.0          // max. head change per Newton iteration (ft)
#define YDEBT    -1.0e4        // a dry node's volume debt is not clamped in practice
#define SLOT_BLEND 0.03         // height of crown-to-slot width blend / conduit height
#define SEAL_FRAC 0.01         // plan area fraction of a sealed (surDepth) node
#define KL 2
#define KU 2
#define BW 7                   // 2*KL + KU + 1
#define AB(r,c) Band[(r)*BW + (c) - (r) + KL]

//-----------------------------------------------------------------------------
//  Data structures
//-----------------------------------------------------------------------------
typedef struct
{
    int    link, k;            // link index, conduit index
    int    n, off;             // number of sections, offset of first section
    int    nUp, nDn;           // end nodes
    int    barrels, closed;
    double len, dx, zUp, zDn;  // length, cell length, end inverts (ft)
    double yFull, yBase, qBase, aBase;
    double bTop, bMin, aTop, sTop, wBlend;
    double kFac;               // PHI / Manning n
    double cIn, cOut, cAvg;    // minor loss coeffs.
    double a0, b0, c0;         // dQ(up end)   = a0 + b0*dy(up) + c0*dy(dn)
    double a1, b1, c1;         // dQ(down end) = a1 + b1*dy(up) + c1*dy(dn)
    int    dUp, dDn;           // 1 if end depth follows node head
    int    mUp, mDn;           // end condition: 0 follows node head, 1 pinned depth
    double yfU, yfD;           // free-fall depths at the two ends
    double rUp, rDn;           // d(end depth)/d(end flow) while falling freely
    int    normUp, normDn;     // end node is a NORMAL outfall
} TPcon;

//-----------------------------------------------------------------------------
//  Shared variables
//-----------------------------------------------------------------------------
static int     NC, NS, NN, NX;
static TPcon*  Pc;
static int*    Xlink;
static double *Q, *Y, *Qo, *Yo, *A, *B, *K, *DK, *Ao, *Cold, *Mold, *Sig, *D, *GP, *AM, *BM;
static double *Sol, *Band, *Rhs;
static double *Yn, *Yno, *Vno, *Rn, *Aj, *Kp, *AccIn, *AccOut, *AccOv, *Bv;
static char   *Fixed;

static int    *Perm, *IPerm, *RowPtr, *ColIdx, *UpdPtr;
static double *Uval, *Lval, *Diag, **UpdP, **LkA, **LkB;

static double  DtCur;
static double  Th;                    // time weighting in use for the current step
static double  StTheta1;              // steps that fell back to theta = 1
static int     Switch;                // TRUE while conduit ends may change state
static double *Lim, *Dn;               // per node: free-surface step limit; applied change
static double *Gap;                   // per node: head rise that would re-attach a conduit end
static int     Refresh;               // TRUE while free-fall depths may still move
static double  StSteps, StSub, StIter, StMaxIter, StHalve, StNonConv;
static int     StUnsup[6];     // flap, culvert, forcemain, losses, qlimit, dummy
static int     MinPts, MaxPtsUsed;

//=============================================================================
//  Section geometry (slot above the crown, conveyance capped at full)
//=============================================================================

static double conv(TPcon* p, TXsect* x, double y, double a)
{
    double s;
    if ( y >= p->yFull ) return p->kFac * p->sTop;
    s = xsect_getSofA(x, a);
    if ( p->closed && s > p->sTop ) s = p->sTop;
    return p->kFac * s;
}

static double areaOfY(TPcon* p, TXsect* x, double y)
//
//  Above the crown a closed conduit continues as a slot. The width does not
//  drop to the slot width at once: it decays from the width just under the
//  crown (wCrown) over a height of SLOT_BLEND x conduit height, so a flat-
//  topped section (box culvert) has no jump in wave speed as it pressurises.
//  The blend adds (wCrown - slot) * SLOT_BLEND * height of area above the crown.
//
{
    double e, h;
    if ( y < p->yFull ) return xsect_getAofY(x, y);
    y -= p->yFull;
    if ( p->wBlend <= 0.0 ) return p->aTop + p->bTop * y;
    h = SLOT_BLEND * p->yFull;
    e = (y < 40.0 * h) ? exp(-y / h) : 0.0;
    return p->aTop + p->bTop * y + p->wBlend * h * (1.0 - e);
}

static double dep(TPcon* p, double y, double* gp)
//
//  The solver's depth unknown y is the real depth d above the base depth.
//  Below it, d = yBase * exp(y/yBase - 1): d and its slope are continuous at
//  yBase and d stays positive for any y Newton may produce, so a front
//  undershoot drains a cell toward empty instead of to a negative depth.
//
{
    double d;
    if ( y >= p->yBase ) { *gp = 1.0; return y; }
    if ( y < YLOW * p->yBase ) y = YLOW * p->yBase;
    d = p->yBase * exp(y / p->yBase - 1.0);
    *gp = d / p->yBase;
    return d;
}

static void geom(TPcon* p, double y, double* d, double* gp, double* a, double* b,
                 double* am, double* bm, double* k, double* dk)
//
//  Returns, for depth variable y:
//    d, gp   real depth and dd/dy              (water surface, storage)
//    a, b    storage area and dA/dy            (continuity)
//    am, bm  area and its slope used by the momentum equation
//    k, dk   conveyance and its slope          (momentum)
//  Above the base depth the two areas are the same. Below it the momentum
//  equation sees a depth that levels off at half the base depth, so a section
//  that a front has drawn down still has a usable area and conveyance, while
//  continuity goes on tracking the real (smaller) stored area.
//
{
    TXsect* x = &Link[p->link].xsect;
    double  dy = 1.0e-3 * p->yFull, k0, k1, a1, dm, gm, c;

    *d = dep(p, y, gp);
    *a = areaOfY(p, x, *d);
    a1 = areaOfY(p, x, *d + dy);

    // --- top width is taken as the slope of the area function itself, so the
    //     Jacobian matches the residual even where SWMM's width and area
    //     tables disagree (they do, by tens of percent, at shallow depth)
    *b = (a1 - *a) / dy;
    if ( *b < p->bMin ) *b = p->bMin;
    if ( *a < 1.0e-9 ) *a = 1.0e-9;

    if ( y >= p->yBase ) { dm = *d; gm = 1.0; *am = *a; *bm = *b; }
    else
    {
        c  = 0.5 * p->yBase;
        gm = exp((MAX(y, YLOW * p->yBase) - p->yBase) / c);
        dm = p->yBase - c * (1.0 - gm);
        *am = areaOfY(p, x, dm);
        a1  = areaOfY(p, x, dm + dy);
        *bm = MAX((a1 - *am) / dy, p->bMin) * gm;
    }
    k0  = conv(p, x, dm, *am);
    k1  = conv(p, x, dm + dy, a1);
    *k  = MAX(k0, 1.0e-9);
    *dk = (k1 - k0) / dy * gm;
    *b *= *gp;                                      // dA/dy
}

static double fall(TPcon* p, double q, int norm)
{
    double yn = link_getYnorm(p->link, q);
    if ( norm ) return MIN(yn, p->yFull);
    return MIN(MIN(link_getYcrit(p->link, q), yn), p->yFull);
}

static double freeDepth(TPcon* p, double q, int norm, double* slope)
//
//  Depth at a conduit end that discharges freely (the smaller of critical and
//  normal depth, or normal depth alone at a NORMAL outfall), and its slope
//  with respect to flow so the end condition can sit inside the Newton step.
//
{
    double dq, q1, q2;
    q  = fabs(q);
    dq = 0.05 * q + 1.0e-4 * Link[p->link].qFull;
    q1 = q + dq; q2 = MAX(q - dq, 0.0);
    *slope = (fall(p, q1, norm) - fall(p, q2, norm)) / (q1 - q2);
    return fall(p, q, norm);
}

//=============================================================================
//  Node storage
//=============================================================================

static double nodeVol(int i, double y, double* area)
{
    double yF = Node[i].fullDepth, a;
    int    canPond = (AllowPonding && Node[i].pondedArea > 0.0);

    // --- a dry node in debt: volume runs negative on a plain plan area
    if ( y < 0.0 )
    {
        a = Aj[i];
        if ( Node[i].type == STORAGE ) a = MAX(node_getSurfArea(i, 0.0), a);
        *area = a;
        return a * y;
    }

    if ( Node[i].type == STORAGE )
    {
        if ( y <= yF || yF <= 0.0 )
        {
            a = node_getSurfArea(i, y);
            *area = MAX(a, 0.1);
            return node_getVolume(i, y);
        }
        a = MAX(node_getSurfArea(i, yF), 0.1);
        if ( canPond ) a = Node[i].pondedArea;
        else if ( Node[i].surDepth > 0.0 ) a *= SEAL_FRAC;
        *area = a;
        return Node[i].fullVolume + a * (y - yF);
    }
    a = Aj[i];
    if ( y <= yF || yF <= 0.0 ) { *area = a; return a * y; }
    if ( canPond ) *area = Node[i].pondedArea;
    else if ( Node[i].surDepth > 0.0 ) *area = SEAL_FRAC * a;
    else *area = a;
    return a * yF + (*area) * (y - yF);
}

static double nodeYmax(int i)
{
    if ( AllowPonding && Node[i].pondedArea > 0.0 ) return 1.0e30;
    if ( Node[i].fullDepth <= 0.0 ) return 1.0e30;
    return Node[i].fullDepth + Node[i].surDepth;
}

//=============================================================================
//  Sparse LU for the node system (structurally symmetric, min. degree order)
//=============================================================================

static int posU(int k, int j)
{
    int i;
    for ( i = RowPtr[k]; i < RowPtr[k+1]; i++ ) if ( ColIdx[i] == j ) return i;
    return -1;
}

static double* jPtr(int i, int j)       // pointer to J[i][j], i,j = node indexes
{
    int ki = IPerm[i], kj = IPerm[j];
    if ( ki == kj ) return &Diag[ki];
    if ( ki < kj )  return &Uval[posU(ki, kj)];
    return &Lval[posU(kj, ki)];
}

static int buildSparse(void)
{
    int   n = NN, i, k, a, b, p, ia, ib, m, t, first = 0, poolN = 0, poolCap;
    int  *cnt, *cap, **adj, *pool, found;
    char *done;
    long  nUpd = 0;

    cnt  = (int *)  calloc(n, sizeof(int));
    cap  = (int *)  calloc(n, sizeof(int));
    adj  = (int **) calloc(n, sizeof(int *));
    done = (char *) calloc(n, sizeof(char));
    Perm   = (int *) calloc(n, sizeof(int));
    IPerm  = (int *) calloc(n, sizeof(int));
    RowPtr = (int *) calloc(n + 1, sizeof(int));
    poolCap = 4 * Nobjects[LINK] + 16;
    pool = (int *) malloc(poolCap * sizeof(int));
    if ( !cnt || !cap || !adj || !done || !Perm || !IPerm || !RowPtr || !pool ) return 1;

#define ADDADJ(u,v) { found = 0; \
    for (t = 0; t < cnt[u]; t++) if (adj[u][t] == (v)) { found = 1; break; } \
    if (!found) { if (cnt[u] >= cap[u]) { cap[u] = 2*cap[u] + 4; \
        adj[u] = (int *) realloc(adj[u], cap[u]*sizeof(int)); } \
        adj[u][cnt[u]++] = (v); } }

    for ( i = 0; i < Nobjects[LINK]; i++ )
    {
        a = Link[i].node1; b = Link[i].node2;
        if ( a == b ) continue;
        ADDADJ(a, b); ADDADJ(b, a);
    }
    for ( k = 0; k < n; k++ )
    {
        while ( first < n && done[first] ) first++;
        p = -1;
        for ( i = first; i < n; i++ )
        {
            if ( done[i] ) continue;
            if ( p < 0 || cnt[i] < cnt[p] ) { p = i; if ( cnt[p] <= 1 ) break; }
        }
        Perm[k] = p; IPerm[p] = k; done[p] = 1;
        RowPtr[k] = poolN;
        if ( poolN + cnt[p] > poolCap )
        {
            poolCap = 2 * (poolN + cnt[p]);
            pool = (int *) realloc(pool, poolCap * sizeof(int));
        }
        for ( ia = 0; ia < cnt[p]; ia++ ) pool[poolN++] = adj[p][ia];
        for ( ia = 0; ia < cnt[p]; ia++ )
        {
            a = adj[p][ia];
            for ( t = 0; t < cnt[a]; t++ ) if ( adj[a][t] == p )
            { adj[a][t] = adj[a][--cnt[a]]; break; }
            for ( ib = 0; ib < cnt[p]; ib++ )
            {
                if ( ib == ia ) continue;
                b = adj[p][ib];
                ADDADJ(a, b);
            }
        }
    }
    RowPtr[n] = poolN;
    ColIdx = (int *) malloc((poolN + 1) * sizeof(int));
    for ( i = 0; i < poolN; i++ ) ColIdx[i] = IPerm[pool[i]];
    for ( k = 0; k < n; k++ )                       // sort each row
    {
        for ( ia = RowPtr[k] + 1; ia < RowPtr[k+1]; ia++ )
        {
            t = ColIdx[ia];
            for ( ib = ia - 1; ib >= RowPtr[k] && ColIdx[ib] > t; ib-- )
                ColIdx[ib+1] = ColIdx[ib];
            ColIdx[ib+1] = t;
        }
        m = RowPtr[k+1] - RowPtr[k];
        nUpd += (long)m * m;
    }
    Uval = (double *) calloc(poolN + 1, sizeof(double));
    Lval = (double *) calloc(poolN + 1, sizeof(double));
    Diag = (double *) calloc(n, sizeof(double));
    Bv   = (double *) calloc(n, sizeof(double));
    UpdPtr = (int *) calloc(n + 1, sizeof(int));
    UpdP = (double **) malloc((nUpd + 1) * sizeof(double *));
    if ( !ColIdx || !Uval || !Lval || !Diag || !Bv || !UpdPtr || !UpdP ) return 1;
    nUpd = 0;
    for ( k = 0; k < n; k++ )
    {
        UpdPtr[k] = (int)nUpd;
        m = RowPtr[k+1] - RowPtr[k];
        for ( ia = 0; ia < m; ia++ ) for ( ib = 0; ib < m; ib++ )
        {
            a = ColIdx[RowPtr[k] + ia]; b = ColIdx[RowPtr[k] + ib];
            if ( a == b )     UpdP[nUpd++] = &Diag[a];
            else if ( a < b ) UpdP[nUpd++] = &Uval[posU(a, b)];
            else              UpdP[nUpd++] = &Lval[posU(b, a)];
        }
    }
    LkA = (double **) calloc(Nobjects[LINK], sizeof(double *));
    LkB = (double **) calloc(Nobjects[LINK], sizeof(double *));
    for ( i = 0; i < Nobjects[LINK]; i++ )
    {
        a = Link[i].node1; b = Link[i].node2;
        if ( a == b ) continue;
        LkA[i] = jPtr(a, b); LkB[i] = jPtr(b, a);
    }
    for ( i = 0; i < n; i++ ) free(adj[i]);
    free(adj); free(cnt); free(cap); free(done); free(pool);
    return 0;
}

static void luSolve(double* b)          // b in elimination order, overwritten
{
    int k, ia, ib, m, base;
    double d, l, s, **P;

    for ( k = 0; k < NN; k++ )
    {
        d = Diag[k];
        if ( fabs(d) < 1.0e-12 ) d = (d < 0.0) ? -1.0e-12 : 1.0e-12;
        Diag[k] = d;
        base = RowPtr[k]; m = RowPtr[k+1] - base; P = UpdP + UpdPtr[k];
        for ( ia = 0; ia < m; ia++ )
        {
            l = Lval[base+ia] / d;
            Lval[base+ia] = l;
            if ( l == 0.0 ) continue;
            for ( ib = 0; ib < m; ib++ ) *P[ia*m+ib] -= l * Uval[base+ib];
            b[ColIdx[base+ia]] -= l * b[k];
        }
    }
    for ( k = NN - 1; k >= 0; k-- )
    {
        s = b[k];
        for ( ib = RowPtr[k]; ib < RowPtr[k+1]; ib++ ) s -= Uval[ib] * b[ColIdx[ib]];
        b[k] = s / Diag[k];
    }
}

//=============================================================================
//  Banded solve for one conduit's interior unknowns (3 right-hand sides)
//=============================================================================

static void bandSolve(int M, double* x)
{
    int j, r, c, p, cmax, rmax, m;
    double piv, f, t;

    for ( j = 0; j < M; j++ )
    {
        rmax = MIN(j + KL, M - 1); cmax = MIN(j + KU + KL, M - 1);
        p = j;
        for ( r = j + 1; r <= rmax; r++ ) if ( fabs(AB(r,j)) > fabs(AB(p,j)) ) p = r;
        if ( p != j )
        {
            for ( c = j; c <= cmax; c++ ) { t = AB(j,c); AB(j,c) = AB(p,c); AB(p,c) = t; }
            for ( m = 0; m < 3; m++ ) { t = Rhs[j*3+m]; Rhs[j*3+m] = Rhs[p*3+m]; Rhs[p*3+m] = t; }
        }
        piv = AB(j,j);
        if ( fabs(piv) < 1.0e-14 ) { piv = (piv < 0.0) ? -1.0e-14 : 1.0e-14; AB(j,j) = piv; }
        for ( r = j + 1; r <= rmax; r++ )
        {
            f = AB(r,j) / piv;
            if ( f == 0.0 ) continue;
            for ( c = j + 1; c <= cmax; c++ ) AB(r,c) -= f * AB(j,c);
            for ( m = 0; m < 3; m++ ) Rhs[r*3+m] -= f * Rhs[j*3+m];
            AB(r,j) = 0.0;
        }
    }
    for ( j = M - 1; j >= 0; j-- )
    {
        cmax = MIN(j + KU + KL, M - 1);
        for ( m = 0; m < 3; m++ )
        {
            t = Rhs[j*3+m];
            for ( c = j + 1; c <= cmax; c++ ) t -= AB(j,c) * x[c*3+m];
            x[j*3+m] = t / AB(j,j);
        }
    }
}

//=============================================================================
//  Conduit end conditions
//=============================================================================

static void applyBC(TPcon* p)
//
//  Each conduit end is in one of two states:
//    0  the node water level is above the end's floor depth: the end depth
//       follows the node head and the node sees the conduit in its own equation
//    1  the node is lower: the end depth is pinned at the floor, which is the
//       base depth or, when water is spilling out of the end, the free-fall
//       depth for the end's flow (carried into the Newton step with its slope)
//
{
    int    i0 = p->off, iN = p->off + p->n - 1;
    double yu = Yn[p->nUp] + Node[p->nUp].invertElev - p->zUp;
    double yd = Yn[p->nDn] + Node[p->nDn].invertElev - p->zDn;
    double fu, fd, q;

    if ( Refresh )
    {
        q = Q[i0] - p->qBase;
        p->yfU = 0.0; p->rUp = 0.0;
        if ( yu < p->yFull && q < 0.0 )
        {
            p->yfU = freeDepth(p, Q[i0], p->normUp, &p->rUp);
            p->rUp = (p->yfU > p->yBase) ? -p->rUp : 0.0;
        }

        q = Q[iN] - p->qBase;
        p->yfD = 0.0; p->rDn = 0.0;
        if ( yd < p->yFull && q > 0.0 )
        {
            p->yfD = freeDepth(p, Q[iN], p->normDn, &p->rDn);
            if ( p->yfD <= p->yBase ) p->rDn = 0.0;
        }
    }
    fu = MAX(p->yBase, p->yfU);
    fd = MAX(p->yBase, p->yfD);
    if ( Switch )
    {
        p->mUp = (yu > fu) ? 0 : 1;
        p->mDn = (yd > fd) ? 0 : 1;
    }

    // --- a node below a pinned end is not yet coupled to that conduit, so a
    //     Newton step may carry it no further than just past the point where
    //     the conduit re-attaches; the next iteration then sees the coupling
    if ( p->mUp == 1 && !Fixed[p->nUp] )
        Gap[p->nUp] = MIN(Gap[p->nUp], MAX(fu - yu, 0.0) + 0.05 * p->yFull);
    if ( p->mDn == 1 && !Fixed[p->nDn] )
        Gap[p->nDn] = MIN(Gap[p->nDn], MAX(fd - yd, 0.0) + 0.05 * p->yFull);
    if ( p->mUp == 0 ) Y[i0] = yu; else if ( p->mUp == 1 ) Y[i0] = fu;
    if ( p->mDn == 0 ) Y[iN] = yd; else if ( p->mDn == 1 ) Y[iN] = fd;
    p->dUp = (p->mUp == 0 && !Fixed[p->nUp]);
    p->dDn = (p->mDn == 0 && !Fixed[p->nDn]);
}

//=============================================================================
//  One conduit: residuals, Jacobian, condensation onto its two end depths
//=============================================================================

static void solveConduit(TPcon* p, double dt)
{
    int    n = p->n, M = 2 * (n - 1), c, s, ia, ib, r, iqa, iqb;
    double ru, rd;
    double th = Th, g = GRAVITY, dx = p->dx, w = dx / (2.0 * dt);
    double z, za, zb, dh, abar, sfa, sfb, sg, kl, qm, rC, rM, t;
    double mQa, mYa, mQb, mYb;
    double* sol = Sol + 6 * p->off;

    applyBC(p);
    for ( s = 0; s < n; s++ )
    {
        ia = p->off + s;
        geom(p, Y[ia], &D[ia], &GP[ia], &A[ia], &B[ia], &AM[ia], &BM[ia], &K[ia], &DK[ia]);
    }
    ru = (Refresh && p->mUp == 1) ? p->rUp : 0.0;
    rd = (Refresh && p->mDn == 1) ? p->rDn : 0.0;
    memset(Band, 0, M * BW * sizeof(double));
    memset(Rhs, 0, M * 3 * sizeof(double));
    z = (p->zDn - p->zUp) / (double)(n - 1);
    for ( c = 0; c < n - 1; c++ )
    {
        ia = p->off + c; ib = ia + 1;
        za = p->zUp + z * c; zb = za + z;
        dh = (zb + D[ib]) - (za + D[ia]);
        abar = 0.5 * (AM[ia] + AM[ib]);
        sfa = Q[ia] * fabs(Q[ia]) / (K[ia] * K[ia]);
        sfb = Q[ib] * fabs(Q[ib]) / (K[ib] * K[ib]);
        sg  = Sig[ia] * th;
        kl  = p->cAvg / (double)(n - 1);
        if ( c == 0 )     kl += p->cIn;
        if ( c == n - 2 ) kl += p->cOut;
        qm  = 0.5 * (Q[ia] + Q[ib]);

        // --- continuity
        rC = (A[ia] + A[ib] - Ao[ia] - Ao[ib]) * w + th * (Q[ib] - Q[ia]) + Cold[ia];

        // --- momentum
        rM = (Q[ia] + Q[ib] - Qo[ia] - Qo[ib]) * w
           + sg * (Q[ib]*Q[ib]/AM[ib] - Q[ia]*Q[ia]/AM[ia])
           + g * th * abar * dh
           + g * dx * 0.5 * (AM[ia]*sfa + AM[ib]*sfb)
           + kl * qm * fabs(qm) / (2.0 * abar)
           + Mold[ia];
        t   = kl * fabs(qm) / (2.0 * abar);
        mQa = w - sg * 2.0 * Q[ia] / AM[ia] + g * dx * AM[ia] * fabs(Q[ia]) / (K[ia]*K[ia]) + t;
        mQb = w + sg * 2.0 * Q[ib] / AM[ib] + g * dx * AM[ib] * fabs(Q[ib]) / (K[ib]*K[ib]) + t;
        mYa =  sg * Q[ia]*Q[ia] * BM[ia] / (AM[ia]*AM[ia]) + g * th * (0.5*BM[ia]*dh - abar*GP[ia])
            +  g * dx * 0.5 * sfa * (BM[ia] - 2.0 * AM[ia] * DK[ia] / K[ia]);
        mYb = -sg * Q[ib]*Q[ib] * BM[ib] / (AM[ib]*AM[ib]) + g * th * (0.5*BM[ib]*dh + abar*GP[ib])
            +  g * dx * 0.5 * sfb * (BM[ib] - 2.0 * AM[ib] * DK[ib] / K[ib]);

        iqa = (c == 0) ? 0 : 2*c - 1;
        iqb = 2*c + 1;
        r = 2*c;                                   // continuity row
        Rhs[r*3] = -rC;
        AB(r, iqa) = -th;
        if ( c == 0 ) { Rhs[r*3+1] = -B[ia] * w; AB(r, iqa) += B[ia] * w * ru; }
        else AB(r, 2*c) = B[ia] * w;
        AB(r, iqb) = th;
        if ( c == n - 2 ) { Rhs[r*3+2] = -B[ib] * w; AB(r, iqb) += B[ib] * w * rd; }
        else AB(r, 2*c+2) = B[ib] * w;

        r = 2*c + 1;                               // momentum row
        Rhs[r*3] = -rM;
        AB(r, iqa) = mQa;
        if ( c == 0 ) { Rhs[r*3+1] = -mYa; AB(r, iqa) += mYa * ru; }
        else AB(r, 2*c) = mYa;
        AB(r, iqb) = mQb;
        if ( c == n - 2 ) { Rhs[r*3+2] = -mYb; AB(r, iqb) += mYb * rd; }
        else AB(r, 2*c+2) = mYb;
    }
    bandSolve(M, sol);
    p->a0 = sol[0];         p->b0 = sol[1];           p->c0 = sol[2];
    p->a1 = sol[(M-1)*3];   p->b1 = sol[(M-1)*3+1];   p->c1 = sol[(M-1)*3+2];
}

//=============================================================================
//  Start of a (sub)step: freeze the old time level
//=============================================================================

static void beginStep(void)
{
    int    j, s, c, ia, ib;
    double th = Th, a, b, k, dk, fr, fa, z, za, zb, area, am, bm;
    TPcon* p;

    for ( j = 0; j < NN; j++ ) { Yno[j] = Yn[j]; Vno[j] = nodeVol(j, Yn[j], &area); }
    for ( j = 0; j < NC; j++ )
    {
        p = &Pc[j];
        for ( s = 0; s < p->n; s++ )
        {
            ia = p->off + s;
            Qo[ia] = Q[ia]; Yo[ia] = Y[ia];
            geom(p, Y[ia], &D[ia], &GP[ia], &a, &b, &am, &bm, &k, &dk);
            Ao[ia] = a; AM[ia] = am;
            fr = fabs(Q[ia] / am) / sqrt(GRAVITY * am / MAX(bm, 1.0e-6));
            Sig[ia] = fr;                           // section Froude, for now
        }
        z = (p->zDn - p->zUp) / (double)(p->n - 1);
        for ( c = 0; c < p->n - 1; c++ )
        {
            ia = p->off + c; ib = ia + 1;
            fr = MAX(Sig[ia], Sig[ib]);
            if ( fr <= FR_LO ) fa = 1.0;
            else if ( fr >= FR_HI ) fa = 0.0;
            else fa = (FR_HI - fr) / (FR_HI - FR_LO);
            za = p->zUp + z * c; zb = za + z;
            Cold[ia] = (1.0 - th) * (Qo[ib] - Qo[ia]);
            Mold[ia] = fa * (1.0 - th) * (Qo[ib]*Qo[ib]/AM[ib] - Qo[ia]*Qo[ia]/AM[ia])
                     + GRAVITY * (1.0 - th) * 0.5 * (AM[ia] + AM[ib])
                       * ((zb + D[ib]) - (za + D[ia]));
            Sig[ia] = fa;                           // cell phase-out factor
        }
    }
}

static void restoreStep(void)
{
    memcpy(Q, Qo, NS * sizeof(double));
    memcpy(Y, Yo, NS * sizeof(double));
    memcpy(Yn, Yno, NN * sizeof(double));
}

//=============================================================================
//  Newton iteration for one (sub)step
//=============================================================================

static void setOutfallStage(void)
//
//  Head held at each outfall for the step: its stage (fixed, tidal or time
//  series), or nothing for FREE and NORMAL outfalls. The free-fall depth SWMM
//  folds into the outfall's depth is applied at the conduit end instead (see
//  applyBC), where it is part of the Newton step rather than lagging it.
//
{
    int j, i, n;
    for ( j = 0; j < Nobjects[LINK]; j++ )
    {
        if ( Fixed[Link[j].node2] )      { n = Link[j].node2; i = 2; }
        else if ( Fixed[Link[j].node1] ) { n = Link[j].node1; i = 1; }
        else continue;
        node_setOutletDepth(n, 0.0, 0.0, (i == 2) ? Link[j].offset2 : Link[j].offset1);
        Yn[n] = Node[n].newDepth;
    }
}

static void setOutfallDepths(void)                 // reported outfall depths
{
    int j, i, i0, iN;
    TPcon* p;
    for ( j = 0; j < NC; j++ )
    {
        p = &Pc[j];
        if ( !Fixed[p->nUp] && !Fixed[p->nDn] ) continue;
        i0 = p->off; iN = i0 + p->n - 1;
        i = Fixed[p->nDn] ? iN : i0;
        Link[p->link].newFlow = (Q[i] - p->qBase) * p->barrels;
        link_setOutfallDepth(p->link);
    }
    for ( j = 0; j < NX; j++ )
    {
        i = Xlink[j];
        if ( Fixed[Link[i].node1] || Fixed[Link[i].node2] ) link_setOutfallDepth(i);
    }
}

static int solveStep(double dt, int* iters)
{
    int    it, j, i, s, r, n1, n2, converged = 0, bad = 0, clipped = 0;
    double th = Th, area, v, yMax, q, dq, nb, alpha, dmax, dy0, dyN, wq, wy;
    double errY, errQ, tolQ, qmax, rho;
    double *sol;
    TPcon* p;

    beginStep();
    setOutfallStage();
    for ( it = 1; it <= MAXITER; it++ )
    {
        // --- node depths visible to SWMM's own link functions
        for ( j = 0; j < NN; j++ )
            if ( !Fixed[j] ) Node[j].newDepth = MAX(0.0, MIN(Yn[j], nodeYmax(j)));
        Refresh = (it <= 4);
        Switch  = (it <= 12);
        for ( j = 0; j < NN; j++ ) Gap[j] = 1.0e30;

        // --- node storage, lateral inflow, losses, flooding
        memset(Uval, 0, RowPtr[NN] * sizeof(double));
        memset(Lval, 0, RowPtr[NN] * sizeof(double));
        for ( j = 0; j < NN; j++ )
        {
            if ( Fixed[j] ) { Rn[j] = 0.0; Diag[IPerm[j]] = 1.0; continue; }
            v = nodeVol(j, Yn[j], &area);
            Rn[j] = (v - Vno[j]) / dt - Node[j].newLatFlow + Node[j].losses;
            Diag[IPerm[j]] = area / dt;
            yMax = nodeYmax(j);
            if ( Yn[j] > yMax )
            {
                Rn[j] += Kp[j] * (Yn[j] - yMax);
                Diag[IPerm[j]] += Kp[j];
            }
            Node[j].inflow = MAX(Node[j].newLatFlow, 0.0);
        }

        // --- conduits
        for ( j = 0; j < NC; j++ )
        {
            p = &Pc[j];
            solveConduit(p, dt);
            n1 = p->nUp; n2 = p->nDn; nb = p->barrels;
            i = p->off; s = i + p->n - 1;
            if ( !Fixed[n1] )
            {
                Rn[n1] += nb * (th * (Q[i] - p->qBase) + (1.0 - th) * (Qo[i] - p->qBase))
                        + nb * th * p->a0;
                if ( p->dUp ) Diag[IPerm[n1]] += nb * th * p->b0;
                if ( p->dDn ) *LkA[p->link] += nb * th * p->c0;
            }
            if ( !Fixed[n2] )
            {
                Rn[n2] -= nb * (th * (Q[s] - p->qBase) + (1.0 - th) * (Qo[s] - p->qBase))
                        + nb * th * p->a1;
                if ( p->dDn ) Diag[IPerm[n2]] -= nb * th * p->c1;
                if ( p->dUp ) *LkB[p->link] -= nb * th * p->b1;
            }
            q = nb * (Q[s] - p->qBase);
            if ( q > 0.0 ) Node[n2].inflow += q;
            q = nb * (Q[i] - p->qBase);
            if ( q < 0.0 ) Node[n1].inflow -= q;
        }

        // --- pumps, orifices, weirs, outlets, dummy conduits (SWMM's own functions)
        for ( j = 0; j < NX; j++ )
        {
            i = Xlink[j]; n1 = Link[i].node1; n2 = Link[i].node2;
            q = link_getInflow(i);
            if ( Link[i].type == PUMP && q > 0.0 && !Fixed[n1] )
            {
                qmax = Node[n1].inflow + Vno[n1] / dt;
                if ( q > qmax ) q = MAX(qmax, 0.0);
            }
            Link[i].newFlow = q;
            dq = (Link[i].type == PUMP || Link[i].type == CONDUIT) ? 0.0 : MAX(Link[i].dqdh, 0.0);
            if ( !Fixed[n1] )
            {
                Rn[n1] += q; Diag[IPerm[n1]] += dq;
                if ( !Fixed[n2] && LkA[i] ) *LkA[i] -= dq;
            }
            if ( !Fixed[n2] )
            {
                Rn[n2] -= q; Diag[IPerm[n2]] += dq;
                if ( !Fixed[n1] && LkB[i] ) *LkB[i] -= dq;
            }
            if ( q > 0.0 ) Node[n2].inflow += q; else Node[n1].inflow -= q;
        }

        // --- solve the node system for head corrections
        for ( j = 0; j < NN; j++ ) Bv[IPerm[j]] = -Rn[j];
        luSolve(Bv);
        dmax = 0.0;
        for ( j = 0; j < NN; j++ )
        {
            if ( !Fixed[j] && Yn[j] <= YDEBT && Bv[IPerm[j]] < 0.0 ) continue;
            dmax = MAX(dmax, fabs(Bv[IPerm[j]]));
        }
        alpha = (dmax > DH_MAX) ? DH_MAX / dmax : 1.0;

        // --- update nodes and back-substitute into the conduits
        errY = 0.0; errQ = 0.0; clipped = 0;
        for ( j = 0; j < NN; j++ )
        {
            if ( Fixed[j] ) continue;
            v = Yn[j];
            dq = MIN(alpha * Bv[IPerm[j]], Gap[j]);

            // --- below the crown of its conduits a node's outflow is strongly
            //     non-linear in depth, so one iteration moves it a limited way
            if ( Yn[j] < Node[j].crownElev - Node[j].invertElev )
            {
                if ( dq > Lim[j] ) dq = Lim[j]; else if ( dq < -Lim[j] ) dq = -Lim[j];
            }
            Yn[j] += dq;

            // --- a dry node may run a small volume debt (repaid by the next
            //     inflow) rather than have water created for it by a clip
            if ( Yn[j] < YDEBT ) Yn[j] = YDEBT;
            Dn[j] = Yn[j] - v;
            errY = MAX(errY, fabs(Dn[j]));
            if ( fabs(Dn[j] - alpha * Bv[IPerm[j]]) > TOL_Y ) clipped = 1;
        }
        // --- damping: no free-surface section may move more than half its
        //     conduit's height in one iteration; if one would, the whole step
        //     (nodes and conduits together, so it stays a Newton direction)
        //     is scaled back
        rho = 1.0;
        for ( j = 0; j < NC; j++ )
        {
            p = &Pc[j];
            sol = Sol + 6 * p->off;
            dy0 = p->dUp ? Dn[p->nUp] : 0.0;
            dyN = p->dDn ? Dn[p->nDn] : 0.0;
            for ( s = 1; s < p->n - 1; s++ )
            {
                if ( D[p->off + s] >= p->yFull || Y[p->off + s] < p->yBase ) continue;
                r = 2*s;
                wy = fabs(alpha * sol[r*3] + sol[r*3+1] * dy0 + sol[r*3+2] * dyN);
                if ( wy > rho * 0.5 * p->yFull ) rho = wy / (0.5 * p->yFull);
            }
        }
        if ( rho > 1.0 )
        {
            clipped = 1;
            alpha /= rho;
            for ( j = 0; j < NN; j++ )
            {
                if ( Fixed[j] ) continue;
                Yn[j] -= Dn[j] * (1.0 - 1.0 / rho);
                Dn[j] /= rho;
            }
            errY /= rho;
        }
        for ( j = 0; j < NC; j++ )
        {
            p = &Pc[j];
            sol = Sol + 6 * p->off;
            dy0 = p->dUp ? Dn[p->nUp] : 0.0;
            dyN = p->dDn ? Dn[p->nDn] : 0.0;
            tolQ = TOL_Q * Link[p->link].qFull + 1.0e-6;
            for ( s = 0; s < p->n; s++ )
            {
                i = p->off + s;
                r = (s == 0) ? 0 : 2*s - 1;
                wq = alpha * sol[r*3] + sol[r*3+1] * dy0 + sol[r*3+2] * dyN;
                Q[i] += wq;
                if ( !(fabs(wq) < 1.0e12) ) bad = 1;
                errQ = MAX(errQ, fabs(wq) / tolQ);
                if ( s > 0 && s < p->n - 1 )
                {
                    r = 2*s;
                    wy = alpha * sol[r*3] + sol[r*3+1] * dy0 + sol[r*3+2] * dyN;
                    if ( !(fabs(wy) < 1.0e6) ) bad = 1;
                    v = Y[i];

                    // --- below the base depth the variable is logarithmic in
                    //     real depth: move it at most two base depths at a time
                    if ( v < p->yBase )
                    {
                        if ( wy > 2.0 * p->yBase ) wy = 2.0 * p->yBase;
                        else if ( wy < -2.0 * p->yBase ) wy = -2.0 * p->yBase;
                    }
                    Y[i] += wy;
                    if ( Y[i] < YLOW * p->yBase ) Y[i] = YLOW * p->yBase;
                    errY = MAX(errY, fabs(Y[i] - v));
                }
            }
        }
        if ( it > 1 && alpha == 1.0 && !clipped && errY < TOL_Y && errQ < 1.0 ) { converged = 1; break; }
        if ( it > 12 && alpha == 1.0 && !clipped && errY < 10.0 * TOL_Y && errQ < 10.0 ) { converged = 1; break; }
        for ( j = 0; j < NN; j++ ) if ( Yn[j] != Yn[j] ) bad = 1;
        if ( bad ) { *iters = it; return -1; }      // blew up: give up on this step
    }
    *iters = MIN(it, MAXITER);
    return converged;
}

//=============================================================================
//  Accumulate step-average flows after an accepted (sub)step
//=============================================================================

static void acceptStep(double dt)
{
    int    j, i0, iN, n1, n2;
    double th = Th, q, yMax;
    TPcon* p;

    for ( j = 0; j < NC; j++ )
    {
        p = &Pc[j];
        i0 = p->off; iN = i0 + p->n - 1; n1 = p->nUp; n2 = p->nDn;
        q = p->barrels * (th * (Q[i0] - p->qBase) + (1.0 - th) * (Qo[i0] - p->qBase));
        if ( q >= 0.0 ) AccOut[n1] += q * dt; else AccIn[n1] -= q * dt;
        q = p->barrels * (th * (Q[iN] - p->qBase) + (1.0 - th) * (Qo[iN] - p->qBase));
        if ( q >= 0.0 ) AccIn[n2] += q * dt; else AccOut[n2] -= q * dt;
    }
    for ( j = 0; j < NX; j++ )
    {
        i0 = Xlink[j]; q = Link[i0].newFlow;
        n1 = Link[i0].node1; n2 = Link[i0].node2;
        if ( q >= 0.0 ) { AccOut[n1] += q * dt; AccIn[n2] += q * dt; }
        else            { AccIn[n1] -= q * dt;  AccOut[n2] -= q * dt; }
    }
    for ( j = 0; j < NN; j++ )
    {
        if ( Fixed[j] ) continue;
        yMax = nodeYmax(j);
        if ( Yn[j] > yMax ) AccOv[j] += Kp[j] * (Yn[j] - yMax) * dt;
    }
}

//=============================================================================
//  Copy the solver's state into SWMM's node and link objects
//=============================================================================

static void exportState(double tStep)
{
    int    j, s, i, i0, iN, k, canPond;
    double area, v, yMax, net, vol, qm, ym, am, bm, fr, lat;
    TPcon* p;

    for ( j = 0; j < NN; j++ )
    {
        lat = Node[j].newLatFlow;
        if ( Fixed[j] )
        {
            net = (AccIn[j] - AccOut[j]) / tStep + lat;
            Node[j].inflow  = (net >= 0.0) ? net : 0.0;
            Node[j].outflow = (net <  0.0) ? -net : 0.0;
            Node[j].overflow = 0.0;
            Node[j].newVolume = 0.0;
            continue;
        }
        canPond = (AllowPonding && Node[j].pondedArea > 0.0);
        yMax = nodeYmax(j);
        v = nodeVol(j, Yn[j], &area);
        Node[j].newDepth = MAX(0.0, MIN(Yn[j], yMax));
        Node[j].inflow  = MAX(lat, 0.0) + AccIn[j] / tStep;
        Node[j].outflow = Node[j].losses + MAX(-lat, 0.0) + AccOut[j] / tStep;
        if ( canPond )
        {
            Node[j].newVolume = v;
            Node[j].overflow = (v - MAX(Node[j].oldVolume, Node[j].fullVolume)) / tStep;
            if ( Node[j].overflow < FUDGE ) Node[j].overflow = 0.0;
        }
        else
        {
            Node[j].newVolume = MIN(v, Node[j].fullVolume);
            Node[j].overflow = AccOv[j] / tStep;
        }
    }
    for ( j = 0; j < NC; j++ )
    {
        p = &Pc[j]; k = p->k; i = p->link;
        i0 = p->off; iN = i0 + p->n - 1;
        vol = 0.0;
        for ( s = i0; s <= iN; s++ )
        {
            D[s] = dep(p, Y[s], &GP[s]);
            A[s] = areaOfY(p, &Link[i].xsect, D[s]);
        }
        for ( s = i0; s < iN; s++ ) vol += 0.5 * (A[s] + A[s+1]) * p->dx;
        s = i0 + (p->n - 1) / 2;
        if ( p->n % 2 ) { qm = Q[s]; ym = D[s]; }
        else { qm = 0.5 * (Q[s] + Q[s+1]); ym = 0.5 * (D[s] + D[s+1]); }
        qm -= p->qBase;
        Conduit[k].q1 = Q[i0] - p->qBase;  Conduit[k].q2 = Q[iN] - p->qBase;
        Conduit[k].a1 = A[i0];             Conduit[k].a2 = A[iN];
        Conduit[k].evapLossRate = 0.0;     Conduit[k].seepLossRate = 0.0;
        Conduit[k].capacityLimited = FALSE;
        Link[i].newFlow   = qm * p->barrels;
        Link[i].newDepth  = MIN(0.5 * (D[i0] + D[iN]), p->yFull);
        Link[i].newVolume = p->barrels * (vol - p->aBase * p->len);
        Link[i].surfArea1 = 0.0; Link[i].surfArea2 = 0.0; Link[i].dqdh = 0.0;
        Link[i].normalFlow = FALSE; Link[i].inletControl = FALSE;
        am = MAX(areaOfY(p, &Link[i].xsect, ym), 1.0e-9);
        bm = (ym < p->yFull) ? MAX(xsect_getWofY(&Link[i].xsect, ym), p->bMin) : p->bTop;
        fr = fabs((qm + p->qBase) / am) / sqrt(GRAVITY * am / bm);
        Link[i].froude = (p->closed && ym >= p->yFull) ? 0.0 : fr;
        if ( fabs(qm) < 1.0e-6 && ym <= 1.01 * p->yBase ) Link[i].flowClass = DRY;
        else Link[i].flowClass = (fr > 1.0) ? SUPCRITICAL : SUBCRITICAL;
        Conduit[k].fullState = 0;
        if ( p->closed )
        {
            if ( D[i0] >= p->yFull && D[iN] >= p->yFull ) Conduit[k].fullState = ALL_FULL;
            else if ( D[i0] >= p->yFull ) Conduit[k].fullState = UP_FULL;
            else if ( D[iN] >= p->yFull ) Conduit[k].fullState = DN_FULL;
        }
    }
}

//=============================================================================
//  Public functions
//=============================================================================

int pbox_init(void)
{
    int    i, j, k, n, s, nb;
    double size, s0, f, z, hu, hd, a, b, kk, dk, area, dd, gp, am, bm;
    TPcon* p;
    TXsect* x;

    if ( PboxTheta < 0.5 ) PboxTheta = 0.5;
    if ( PboxTheta > 1.0 ) PboxTheta = 1.0;
    if ( PboxSlotFrac <= 0.0 ) PboxSlotFrac = 0.02;
    if ( PboxBaseFrac < 0.0 ) PboxBaseFrac = 0.0;
    if ( PboxBaseFrac > 0.25 ) PboxBaseFrac = 0.25;
    if ( PboxSpacing < 1.0 ) PboxSpacing = 1.0;

    NN = Nobjects[NODE]; NC = 0; NS = 0; NX = 0;
    DtCur = 0.0;
    StSteps = StSub = StIter = StMaxIter = StHalve = StNonConv = StTheta1 = 0.0;
    Th = PboxTheta;
    memset(StUnsup, 0, sizeof(StUnsup));
    MinPts = MAXPTS; MaxPtsUsed = 0;
    for ( i = 0; i < Nobjects[LINK]; i++ )
    {
        if ( Link[i].type == CONDUIT && Link[i].xsect.type != DUMMY ) NC++;
        else NX++;
    }
    Pc    = (TPcon *) calloc(NC + 1, sizeof(TPcon));
    Xlink = (int *)   calloc(NX + 1, sizeof(int));
    if ( !Pc || !Xlink ) return 1;
    NC = 0; NX = 0;
    for ( i = 0; i < Nobjects[LINK]; i++ )
    {
        if ( !(Link[i].type == CONDUIT && Link[i].xsect.type != DUMMY) )
        {
            Xlink[NX++] = i;
            if ( Link[i].type == CONDUIT ) StUnsup[5]++;
            continue;
        }
        p = &Pc[NC++]; k = Link[i].subIndex; x = &Link[i].xsect;
        p->link = i; p->k = k;
        p->nUp = Link[i].node1; p->nDn = Link[i].node2;
        p->barrels = Conduit[k].barrels;
        p->closed  = !xsect_isOpen(x->type);
        p->len = Conduit[k].length;
        p->zUp = Node[p->nUp].invertElev + Link[i].offset1;
        p->zDn = Node[p->nDn].invertElev + Link[i].offset2;
        p->yFull = x->yFull;
        size = MAX(x->wMax, 0.1 * x->yFull);
        n = (int)ceil(p->len / (PboxSpacing * size)) + 1;
        n = MAX(2, MIN(n, MAXPTS));
        p->n = n; p->off = NS; NS += n;
        p->dx = p->len / (double)(n - 1);
        MinPts = MIN(MinPts, n); MaxPtsUsed = MAX(MaxPtsUsed, n);
        p->aTop = x->aFull;
        p->sTop = x->sFull;
        p->wBlend = 0.0;
        if ( p->closed )
        {
            p->bTop = PboxSlotFrac * x->wMax; p->bMin = p->bTop;
            size = (x->aFull - xsect_getAofY(x, 0.999 * x->yFull)) / (0.001 * x->yFull);
            if ( size > p->bTop ) p->wBlend = size - p->bTop;
        }
        else { p->bTop = MAX(xsect_getWofY(x, x->yFull), 0.001 * x->wMax); p->bMin = 0.001 * x->wMax; }
        p->kFac = PHI / Conduit[k].roughness;
        p->cIn = Link[i].cLossInlet; p->cOut = Link[i].cLossOutlet; p->cAvg = Link[i].cLossAvg;
        p->mUp = 1; p->mDn = 1;
        p->normUp = (Node[p->nUp].type == OUTFALL && Outfall[Node[p->nUp].subIndex].type == NORMAL_OUTFALL);
        p->normDn = (Node[p->nDn].type == OUTFALL && Outfall[Node[p->nDn].subIndex].type == NORMAL_OUTFALL);
        p->yBase = MAX(PboxBaseFrac * x->yFull, 10.0 * YMIN);
        geom(p, p->yBase, &dd, &gp, &a, &b, &am, &bm, &kk, &dk);
        s0 = (p->zUp - p->zDn) / p->len;
        p->aBase = a;
        p->qBase = (s0 > 0.0) ? kk * sqrt(s0) : 0.0;
        if ( Link[i].hasFlapGate ) StUnsup[0]++;
        if ( x->culvertCode > 0 )  StUnsup[1]++;
        if ( x->type == FORCE_MAIN ) StUnsup[2]++;
        if ( Link[i].seepRate > 0.0 ) StUnsup[3]++;
        if ( Link[i].qLimit > 0.0 )   StUnsup[4]++;
    }

    Q   = (double *) calloc(NS + 1, sizeof(double));  Y    = (double *) calloc(NS + 1, sizeof(double));
    Qo  = (double *) calloc(NS + 1, sizeof(double));  Yo   = (double *) calloc(NS + 1, sizeof(double));
    A   = (double *) calloc(NS + 1, sizeof(double));  B    = (double *) calloc(NS + 1, sizeof(double));
    K   = (double *) calloc(NS + 1, sizeof(double));  DK   = (double *) calloc(NS + 1, sizeof(double));
    Ao  = (double *) calloc(NS + 1, sizeof(double));  Cold = (double *) calloc(NS + 1, sizeof(double));
    Mold= (double *) calloc(NS + 1, sizeof(double));  Sig  = (double *) calloc(NS + 1, sizeof(double));
    D   = (double *) calloc(NS + 1, sizeof(double));  GP   = (double *) calloc(NS + 1, sizeof(double));
    AM  = (double *) calloc(NS + 1, sizeof(double));  BM   = (double *) calloc(NS + 1, sizeof(double));
    Sol = (double *) calloc(6 * NS + 6, sizeof(double));
    Band= (double *) calloc(2 * MAXPTS * BW, sizeof(double));
    Rhs = (double *) calloc(2 * MAXPTS * 3, sizeof(double));
    Yn  = (double *) calloc(NN + 1, sizeof(double));  Yno  = (double *) calloc(NN + 1, sizeof(double));
    Vno = (double *) calloc(NN + 1, sizeof(double));  Rn   = (double *) calloc(NN + 1, sizeof(double));
    Aj  = (double *) calloc(NN + 1, sizeof(double));  Kp   = (double *) calloc(NN + 1, sizeof(double));
    AccIn = (double *) calloc(NN + 1, sizeof(double)); AccOut = (double *) calloc(NN + 1, sizeof(double));
    AccOv = (double *) calloc(NN + 1, sizeof(double)); Fixed  = (char *) calloc(NN + 1, sizeof(char));
    Gap   = (double *) calloc(NN + 1, sizeof(double));
    Lim   = (double *) calloc(NN + 1, sizeof(double));  Dn = (double *) calloc(NN + 1, sizeof(double));
    if ( !Q || !Y || !Qo || !Yo || !A || !B || !K || !DK || !Ao || !Cold || !Mold || !Sig || !D || !GP || !AM || !BM
      || !Sol || !Band || !Rhs || !Yn || !Yno || !Vno || !Rn || !Aj || !Kp
      || !AccIn || !AccOut || !AccOv || !Fixed ) return 1;

    // --- junctions get their own plan area (a Type 1 wet well keeps its volume)
    for ( j = 0; j < NN; j++ )
    {
        Fixed[j] = (Node[j].type == OUTFALL);
        Yn[j] = Node[j].newDepth;
        Aj[j] = MinSurfArea;
        if ( Node[j].type == STORAGE || Fixed[j] ) continue;
        if ( Node[j].fullVolume > 0.0 && Node[j].fullDepth > 0.0 )
            Aj[j] = Node[j].fullVolume / Node[j].fullDepth;
        else Node[j].fullVolume = Aj[j] * Node[j].fullDepth;
    }
    for ( j = 0; j < NC; j++ )
    {
        p = &Pc[j]; nb = p->barrels;
        Kp[p->nUp] += nb * Link[p->link].qFull;
        Kp[p->nDn] += nb * Link[p->link].qFull;
    }
    for ( j = 0; j < NN; j++ ) { Kp[j] = MAX(100.0 * Kp[j], 100.0); Lim[j] = 1.0e30; }
    for ( j = 0; j < NC; j++ )
    {
        p = &Pc[j];
        Lim[p->nUp] = MIN(Lim[p->nUp], 0.3 * p->yFull);
        Lim[p->nDn] = MIN(Lim[p->nDn], 0.3 * p->yFull);
    }

    // --- initial water surface: straight line between the end node heads
    for ( j = 0; j < NC; j++ )
    {
        p = &Pc[j];
        hu = Node[p->nUp].invertElev + Yn[p->nUp];
        hd = Node[p->nDn].invertElev + Yn[p->nDn];
        for ( s = 0; s < p->n; s++ )
        {
            f = (double)s / (double)(p->n - 1);
            z = p->zUp + f * (p->zDn - p->zUp);
            Y[p->off + s] = MAX(p->yBase, hu + f * (hd - hu) - z);
            Q[p->off + s] = p->qBase + Link[p->link].newFlow / p->barrels;
        }
    }
    if ( buildSparse() ) return 1;
    for ( j = 0; j < NN; j++ ) { AccIn[j] = AccOut[j] = AccOv[j] = 0.0; }
    exportState(1.0);
    for ( j = 0; j < NN; j++ )
    {
        if ( Fixed[j] ) continue;
        Node[j].oldVolume = Node[j].newVolume = MIN(nodeVol(j, Yn[j], &area),
            (AllowPonding && Node[j].pondedArea > 0.0) ? 1.0e30 : Node[j].fullVolume);
        Node[j].overflow = 0.0;
        Node[j].inflow = Node[j].newLatFlow; Node[j].outflow = 0.0;
    }
    for ( i = 0; i < Nobjects[LINK]; i++ ) Link[i].oldVolume = Link[i].newVolume;
    return 0;
}

void pbox_close(void)
{
    FREE(Pc); FREE(Xlink);
    FREE(Q); FREE(Y); FREE(Qo); FREE(Yo); FREE(A); FREE(B); FREE(K); FREE(DK);
    FREE(Ao); FREE(Cold); FREE(Mold); FREE(Sig); FREE(D); FREE(GP); FREE(AM); FREE(BM); FREE(Sol); FREE(Band); FREE(Rhs);
    FREE(Yn); FREE(Yno); FREE(Vno); FREE(Rn); FREE(Aj); FREE(Kp);
    FREE(AccIn); FREE(AccOut); FREE(AccOv); FREE(Fixed); FREE(Gap); FREE(Lim); FREE(Dn);
    FREE(Perm); FREE(IPerm); FREE(RowPtr); FREE(ColIdx); FREE(UpdPtr);
    FREE(Uval); FREE(Lval); FREE(Diag); FREE(UpdP); FREE(LkA); FREE(LkB); FREE(Bv);
}

int pbox_execute(double tStep)
{
    int    j, it, ok, halved = 0, total = 0, failed = 0;
    double tLeft = tStep, dt;

    if ( ErrorCode ) return 0;
    for ( j = 0; j < NN; j++ ) { AccIn[j] = AccOut[j] = AccOv[j] = 0.0; }
    if ( DtCur <= 0.0 || DtCur > tStep ) DtCur = tStep;
    Th = PboxTheta;
    while ( tLeft > 1.0e-9 * tStep )
    {
        dt = MIN(DtCur, tLeft);
        ok = solveStep(dt, &it);
        total += it;
        if ( ok <= 0 && Th < 0.999 )                   // first retry fully implicit
        {
            restoreStep();
            Th = 1.0; StTheta1++;
            continue;
        }
        if ( ok <= 0 && halved < MAXHALVE && dt > 1.0001 * tStep / 256.0 )
        {
            restoreStep();
            DtCur = 0.5 * dt; halved++; StHalve++;
            Th = PboxTheta;
            continue;
        }
        if ( ok <= 0 ) failed = 1;
        if ( ok < 0 ) restoreStep();               // cannot shrink further: hold the old state
        acceptStep(dt);
        tLeft -= dt; StSub++; StIter += it;
        Th = PboxTheta;
        StMaxIter = MAX(StMaxIter, (double)it);
        if ( ok > 0 && it <= 6 && DtCur < tStep ) { DtCur = MIN(tStep, 2.0 * DtCur); if ( halved ) halved--; }
    }
    if ( failed ) { StNonConv++; NonConvergeCount++; }
    StSteps++;
    for ( j = 0; j < NN; j++ ) if ( !Fixed[j] ) Node[j].newDepth = MAX(0.0, Yn[j]);
    setOutfallDepths();
    exportState(tStep);
    return total;
}

void pbox_getStats(double* v)
{
    v[0] = PboxMode; v[1] = NC; v[2] = NS; v[3] = StSteps; v[4] = StSub;
    v[5] = (StSub > 0.0) ? StIter / StSub : 0.0;
    v[6] = StMaxIter; v[7] = StHalve; v[8] = StNonConv;
    v[9] = StUnsup[0] + StUnsup[1] + StUnsup[2] + StUnsup[3] + StUnsup[4] + StUnsup[5];
}

void pbox_report(void)
{
    char line[256];
    static const char* what[6] = { "conduit flap gates", "culvert inlet control",
        "force main equation (Manning used)", "conduit seepage/evaporation",
        "conduit flow limits", "dummy conduits (passed through)" };
    int  j;

    if ( !PboxMode || RouteModel != DW || !Frpt.file ) return;
    report_writeLine("");
    report_writeLine("****************************************************************");
    report_writeLine("Implicit box-scheme extension (modified engine, pbox.c)");
    report_writeLine("Preissmann four-point scheme in the InfoWorks style; NOT stock");
    report_writeLine("EPA SWMM dynamic wave and NOT InfoWorks ICM code or results.");
    report_writeLine("****************************************************************");
    sprintf(line, "  Time weighting (theta) ........ %.2f", PboxTheta); report_writeLine(line);
    sprintf(line, "  Slot width / conduit width .... %.3f", PboxSlotFrac); report_writeLine(line);
    sprintf(line, "  Base depth / conduit height ... %.3f", PboxBaseFrac); report_writeLine(line);
    sprintf(line, "  Section spacing / width ....... %.1f", PboxSpacing); report_writeLine(line);
    sprintf(line, "  Inertia phase-out (Froude) .... %.1f to %.1f", FR_LO, FR_HI); report_writeLine(line);
    sprintf(line, "  Conduits / sections ........... %d / %d  (%d to %d per conduit)",
        NC, NS, (NC ? MinPts : 0), MaxPtsUsed); report_writeLine(line);
    sprintf(line, "  Routing steps / solver steps .. %.0f / %.0f", StSteps, StSub); report_writeLine(line);
    sprintf(line, "  Newton iterations, mean / max . %.2f / %.0f",
        (StSub > 0.0) ? StIter / StSub : 0.0, StMaxIter); report_writeLine(line);
    sprintf(line, "  Steps retried at theta = 1 .... %.0f", StTheta1); report_writeLine(line);
    sprintf(line, "  Step halvings ................. %.0f", StHalve); report_writeLine(line);
    sprintf(line, "  Steps accepted unconverged .... %.0f", StNonConv); report_writeLine(line);
    for ( j = 0; j < 6; j++ ) if ( StUnsup[j] > 0 )
    {
        sprintf(line, "  NOT MODELLED: %s on %d link(s)", what[j], StUnsup[j]);
        report_writeLine(line);
    }
    report_writeLine("  Link depths include the base depth; link flows and volumes are net");
    report_writeLine("  of the base flow. Link flow is reported at the conduit midpoint.");
}
