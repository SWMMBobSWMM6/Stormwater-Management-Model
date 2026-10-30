//-----------------------------------------------------------------------------
//   sgi.h
//
//   Staggered-grid implicit (SGI) head solve for dynamic wave routing.
//   An extension to EPA SWMM 5.2.4 - not part of the stock engine.
//
//   SWMM's link-node layout is already a staggered grid: heads live at nodes,
//   flows live in links. Stock dynamic wave solves the coupled flow/head
//   equations by successive approximation, one node at a time. This module
//   keeps the same conduit momentum equation (dwflow.c is unchanged apart
//   from exporting one number) but replaces the node-by-node depth update
//   with one linear system for all node heads at once, the semi-implicit
//   structure of Casulli (1990), Stelling & Duinmeijer (2003) and
//   Casulli & Stelling (2013). Where SWMM limits a conduit to normal flow or
//   to a critical-depth end, the flow no longer answers to the head at the
//   other end, so the system is not symmetric there and is solved by
//   BiCGSTAB instead of conjugate gradients.
//-----------------------------------------------------------------------------
#ifndef SGI_H
#define SGI_H

typedef struct
{
    int    mode;          // 0 = stock iteration, 1 = implicit head solve
    double theta;         // time weight of node continuity (0.5 to 1.0)
    int    maxTrials;     // max. outer iterations per routing step
    // --- run statistics
    double steps;         // routing steps taken
    double trials;        // total outer iterations
    double maxTrialsUsed; // most outer iterations in one step
    double nonConverged;  // steps that hit maxTrials
    double pcgIters;      // total linear solver iterations
    double maxPcgIters;   // most linear iterations in one solve
    double maxLinResid;   // largest linear residual left (cfs)
    double damped;        // node updates that were step-limited
    double fallbacks;     // solves handed to the direct solver
    double linFailures;   // solves that no solver could finish
    double closures;      // unconverged steps finished with a closing solve
    int    closing;       // 1 while the closing solve of a step is running
} TSgi;

extern TSgi    Sgi;
extern double* SgiDenom;  // 1 + dq1 + dq5 from each conduit's flow update
extern double* SgiOmega;  // dq/dS * denominator for each conduit this trial
extern double* SgiKap;    // friction coefficient per unit flow (0 if unused)
extern double* SgiCoup;   // dQ/dH1 of each link, upstream head (cfs/ft)
extern double* SgiCoup2;  // -dQ/dH2 of each link, downstream head (cfs/ft)
extern double* SgiA;      // node storage coefficient As/(theta*dt) (ft2/sec)
extern double* SgiDiag;   // matrix diagonal
extern double* SgiRhs;    // right hand side (cfs)
extern double* SgiX;      // head change (ft)
extern double* SgiYnew;   // trial depth (ft)
extern double* SgiLam;    // damping factor on each node's head change
extern double* SgiPrev;   // head change applied on the last trial (ft)
extern double* SgiVold;   // node control volume at the old time level (ft3)
extern double* SgiAs0;    // free-surface area the volume is built on (ft2)
extern double* SgiShare;  // conduit surface area booked to a storage unit (ft2)
extern double* SgiYref;   // depth above which the node surcharges (<0: never)
extern double* SgiTheta;  // time weight used at each node
extern char*   SgiFixed;  // 1 if node head is held this trial
extern char*   SgiSur;    // 1 if node is surcharged this trial

int    sgi_open(int nNodes, int nLinks);
void   sgi_close(void);
int    sgi_solve(int nNodes, int nLinks);

#endif
