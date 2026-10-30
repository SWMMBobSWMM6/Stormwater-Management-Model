//-----------------------------------------------------------------------------
//   dynwave.c
//
//   Project:  EPA SWMM5
//   Version:  5.2
//   Date:     07/13/23  (Build 5.2.4)
//   Author:   L. Rossman
//             M. Tryby (EPA)
//             R. Dickinson (CDM)
//
//   Dynamic wave flow routing functions.
//
//   This module solves the dynamic wave flow routing equations using
//   Picard Iterations (i.e., a method of successive approximations)
//   to solve the explicit form of the continuity and momentum equations
//   for conduits.
//
//   Update History
//   ==============
//   Build 5.1.002:
//   - Only non-ponded nodal surface area is saved for use in
//     surcharge algorithm.
//   Build 5.1.007:
//   - Node losses added to node outflow variable instead of treated
//     as a separate item when computing change in node flow volume.
//   Build 5.1.008:
//   - Module-specific constants moved here from project.c.
//   - Support added for user-specified minimum variable time step.
//   - Node crown elevations found here instead of in flowrout.c module.
//   - OpenMP use to parallelize findLinkFlows() & findNodeDepths().
//   - Bug in finding complete list of capacity limited links fixed.
//   Build 5.1.011:
//   - Added test for failed memory allocation.
//   - Fixed illegal array index bug for Ideal Pumps.
//   Build 5.1.013:
//   - Include omp.h protected against lack of compiler support for OpenMP.
//   - SurchargeMethod option used to decide how node surcharging is handled.
//   - Storage nodes allowed to pressurize if their surcharge depth > 0.
//   - Minimum flow needed to compute a Courant time step modified.
//   Build 5.1.014:
//   - updateNodeFlows() modified to subtract conduit evap. and seepage losses
//     from downstream node inflow instead of upstream node outflow.
//   Build 5.1.015:
//   - Roll back the 5.1.014 change for conduit losses in updateNodeFlows().
//   Build 5.2.0:
//   - Support added for reporting most frequent non-converging links.
//   Build 5.2.4:
//   - Conduit evap+seepage outflow split evenly between outflow from
//     conduit's upstream and non-outfall downstream nodes.
//-----------------------------------------------------------------------------
#define _CRT_SECURE_NO_DEPRECATE

#include <stdlib.h>
#include <math.h>
#include "headers.h"
#include "sgi.h"                                                    //SGI

//-----------------------------------------------------------------------------
//     Constants 
//-----------------------------------------------------------------------------
static const double MINTIMESTEP         = 0.001;  // min. time step (sec)
static const double OMEGA               = 0.5;    // under-relaxation parameter
static const double DEFAULT_SURFAREA    = 12.566; // Min. nodal surface area (~4 ft diam.)
static const double DEFAULT_HEADTOL     = 0.005;  // Default head tolerance (ft)
static const double EXTRAN_CROWN_CUTOFF = 0.96;   // crown cutoff for EXTRAN
static const double SLOT_CROWN_CUTOFF   = 0.985257; // crown cutoff for SLOT
static const int    DEFAULT_MAXTRIALS   = 8;      // Max. trials per time step


//-----------------------------------------------------------------------------
//  Data Structures
//-----------------------------------------------------------------------------
typedef struct 
{
    char    converged;                 // TRUE if iterations for a node done
    double  newSurfArea;               // current surface area (ft2)
    double  oldSurfArea;               // previous surface area (ft2)
    double  sumdqdh;                   // sum of dqdh from adjoining links
    double  dYdT;                      // change in depth w.r.t. time (ft/sec)
} TXnode;

//-----------------------------------------------------------------------------
//  Shared Variables
//-----------------------------------------------------------------------------
static double  VariableStep;           // size of variable time step (sec)
static TXnode* Xnode;                  // extended nodal information

static double  Omega;                  // actual under-relaxation parameter
static int     Steps;                  // number of Picard iterations

//-----------------------------------------------------------------------------
//  Function declarations
//-----------------------------------------------------------------------------
static void   initRoutingStep(void);
static void   initNodeStates(void);
static void   findBypassedLinks();
static void   findLimitedLinks();

static void   findLinkFlows(double dt);
static int    isTrueConduit(int link);
static void   findNonConduitFlow(int link, double dt);
static void   findNonConduitSurfArea(int link);
static double getModPumpFlow(int link, double q, double dt);
static void   updateNodeFlows(int link);
static void   updateConvergenceStats();

static int    findNodeDepths(double dt);
static void   setNodeDepth(int node, double dt);
static double getFloodedDepth(int node, int canPond, double dV, double yNew,
              double yMax, double dt);

static double getVariableStep(double maxStep);

static int    sgi_execute(double tStep);                               //SGI
static void   sgi_findConduitFlow(int link, double dt);                //SGI
static void   sgi_sumNodeFlows(void);                                  //SGI
static int    sgi_findNodeDepths(double dt);                           //SGI
static void   sgi_getGeomCoupling(int link, double* g1, double* g2);   //SGI
static double sgi_getNodeVolume(int node, double y);                   //SGI
static void   sgi_trimSurfArea(int link);                              //SGI
static double sgi_getNodeDepth(int node, double v, double yMax);       //SGI
static double getLinkStep(double tMin, int *minLink);
static double getNodeStep(double tMin, int *minNode);

//=============================================================================

void dynwave_init()
//
//  Input:   none
//  Output:  none
//  Purpose: initializes dynamic wave routing method.
//
{
    int i, j;
    double z;

    VariableStep = 0.0;
    Xnode = (TXnode *) calloc(Nobjects[NODE], sizeof(TXnode));
    if ( Xnode == NULL )
    {
        report_writeErrorMsg(ERR_MEMORY,
            " Not enough memory for dynamic wave routing.");
        return;
    }
    
    // --- initialize node surface areas & crown elev.
    for (i = 0; i < Nobjects[NODE]; i++ )
    {
        Xnode[i].newSurfArea = 0.0;
        Xnode[i].oldSurfArea = 0.0;
        Node[i].crownElev = Node[i].invertElev;
    }

    // --- initialize links & update node crown elevations
    for (i = 0; i < Nobjects[LINK]; i++)
    {
        j = Link[i].node1;
        z = Node[j].invertElev + Link[i].offset1 + Link[i].xsect.yFull;
        Node[j].crownElev = MAX(Node[j].crownElev, z);
        
        j = Link[i].node2;
        z = Node[j].invertElev + Link[i].offset2 + Link[i].xsect.yFull;
        Node[j].crownElev = MAX(Node[j].crownElev, z);
        Link[i].flowClass = DRY;
        Link[i].dqdh = 0.0;
    }

    // --- set crown cutoff for finding top width of closed conduits
    if ( SurchargeMethod == SLOT ) CrownCutoff = SLOT_CROWN_CUTOFF;
    else                           CrownCutoff = EXTRAN_CROWN_CUTOFF;

    // --- set up the staggered-grid implicit head solve if called for     //SGI
    if ( Sgi.mode )
    {
        if ( !sgi_open(Nobjects[NODE], Nobjects[LINK]) )
        {
            report_writeErrorMsg(ERR_MEMORY,
                " Not enough memory for dynamic wave routing.");
            return;
        }
        report_writeLine("");
        report_writeLine(
"  NOTE: dynamic wave routing used the staggered-grid implicit (SGI)");
        report_writeLine(
"  head solve extension. These are not stock EPA SWMM 5.2.4 results.");
    }
}

//=============================================================================

void  dynwave_close()
//
//  Input:   none
//  Output:  none
//  Purpose: frees memory allocated for dynamic wave routing method.
//
{
    FREE(Xnode);
    sgi_close();                                                           //SGI
}

//=============================================================================

void dynwave_validate()
//
//  Input:   none
//  Output:  none
//  Purpose: adjusts dynamic wave routing options.
//
{
    if ( MinRouteStep > RouteStep ) MinRouteStep = RouteStep;
    if ( MinRouteStep < MINTIMESTEP ) MinRouteStep = MINTIMESTEP;
    if ( MinSurfArea == 0.0 ) MinSurfArea = DEFAULT_SURFAREA;
    else MinSurfArea /= UCF(LENGTH) * UCF(LENGTH);
    if ( HeadTol == 0.0 ) HeadTol = DEFAULT_HEADTOL;
    else HeadTol /= UCF(LENGTH);
    if ( MaxTrials == 0 ) MaxTrials = DEFAULT_MAXTRIALS;
}

//=============================================================================

double dynwave_getRoutingStep(double fixedStep)
//
//  Input:   fixedStep = user-supplied fixed time step (sec)
//  Output:  returns routing time step (sec)
//  Purpose: computes variable routing time step if applicable.
//
{
    // --- use user-supplied fixed step if variable step option turned off
    //     or if its smaller than the min. allowable variable time step
    if ( CourantFactor == 0.0 ) return fixedStep;
    if ( fixedStep < MINTIMESTEP ) return fixedStep;

    // --- at start of simulation (when current variable step is zero)
    //     use the minimum allowable time step
    if ( VariableStep == 0.0 )
    {
        VariableStep = MinRouteStep;
    }

    // --- otherwise compute variable step based on current flow solution
    else VariableStep = getVariableStep(fixedStep);

    // --- adjust step to be a multiple of a millisecond
    VariableStep = floor(1000.0 * VariableStep) / 1000.0;
    return VariableStep;
}

//=============================================================================

int dynwave_execute(double tStep)
//
//  Input:   links = array of topo sorted links indexes
//           tStep = time step (sec)
//  Output:  returns number of iterations used
//  Purpose: routes flows through drainage network over current time step.
//
{
    int converged;

    // --- initialize
    if ( ErrorCode ) return 0;
    if ( Sgi.mode ) return sgi_execute(tStep);                             //SGI
    Steps = 0;
    converged = FALSE;
    Omega = OMEGA;
    initRoutingStep();

    // --- keep iterating until convergence 
    while ( Steps < MaxTrials )
    {
        // --- execute a routing step & check for nodal convergence
        initNodeStates();
        findLinkFlows(tStep);
        converged = findNodeDepths(tStep);
        Steps++;
        if ( Steps > 1 )
        {
            if ( converged ) break;

            // --- check if link calculations can be skipped in next step
            findBypassedLinks();
        }
    }
    if ( !converged ) updateConvergenceStats();

    //  --- identify any capacity-limited conduits
    findLimitedLinks();
    return Steps;
}

//=============================================================================

void updateConvergenceStats()
{
    int i;
    NonConvergeCount++;
    for (i = 0; i < Nobjects[NODE]; i++)
        stats_updateConvergenceStats(i, Xnode[i].converged);
}

//=============================================================================

void   initRoutingStep()
{
    int i;
    for (i = 0; i < Nobjects[NODE]; i++)
    {
        Xnode[i].converged = FALSE;
        Xnode[i].dYdT = 0.0;
    }
    for (i = 0; i < Nobjects[LINK]; i++)
    {
        Link[i].bypassed = FALSE;
        Link[i].surfArea1 = 0.0;
        Link[i].surfArea2 = 0.0;
    }

    // --- a2 preserves conduit area from solution at last time step
    for ( i = 0; i < Nlinks[CONDUIT]; i++) Conduit[i].a2 = Conduit[i].a1;
}

//=============================================================================

void initNodeStates()
//
//  Input:   none
//  Output:  none
//  Purpose: initializes node's surface area, inflow & outflow
//
{
    int i;

    for (i = 0; i < Nobjects[NODE]; i++)
    {
        // --- initialize nodal surface area
        if ( AllowPonding )
        {
            Xnode[i].newSurfArea = node_getPondedArea(i, Node[i].newDepth);
        }
        else
        {
            Xnode[i].newSurfArea = node_getSurfArea(i, Node[i].newDepth);
        }

        // --- initialize nodal inflow & outflow
        Node[i].inflow = 0.0;
        Node[i].outflow = Node[i].losses;
        if ( Node[i].newLatFlow >= 0.0 )
        {    
            Node[i].inflow += Node[i].newLatFlow;
        }
        else
        {    
            Node[i].outflow -= Node[i].newLatFlow;
        }
        Xnode[i].sumdqdh = 0.0;
    }
}

//=============================================================================

void   findBypassedLinks()
{
    int i;
    for (i = 0; i < Nobjects[LINK]; i++)
    {
        if ( Xnode[Link[i].node1].converged &&
             Xnode[Link[i].node2].converged )
             Link[i].bypassed = TRUE;
        else Link[i].bypassed = FALSE;
    }
}

//=============================================================================

void  findLimitedLinks()
//
//  Input:   none
//  Output:  none
//  Purpose: determines if a conduit link is capacity limited.
//
{
    int    j, n1, n2, k;
    double h1, h2;

    for (j = 0; j < Nobjects[LINK]; j++)
    {
        // ---- check only non-dummy conduit links
        if ( !isTrueConduit(j) ) continue;

        // --- check that upstream end is full
        k = Link[j].subIndex;
        Conduit[k].capacityLimited = FALSE;
        if ( Conduit[k].a1 >= Link[j].xsect.aFull )
        {
            // --- check if HGL slope > conduit slope
            n1 = Link[j].node1;
            n2 = Link[j].node2;
            h1 = Node[n1].newDepth + Node[n1].invertElev;
            h2 = Node[n2].newDepth + Node[n2].invertElev;
            if ( (h1 - h2) > fabs(Conduit[k].slope) * Conduit[k].length )
                Conduit[k].capacityLimited = TRUE;
        }
    }
}

//=============================================================================

void findLinkFlows(double dt)
{
    int i;

    // --- find new flow in each non-dummy conduit
#pragma omp parallel num_threads(NumThreads)
{
    #pragma omp for
    for ( i = 0; i < Nobjects[LINK]; i++)
    {
        if ( isTrueConduit(i) && !Link[i].bypassed )
        {
            if ( Sgi.mode ) sgi_findConduitFlow(i, dt);                    //SGI
            else dwflow_findConduitFlow(i, Steps, Omega, dt);
        }
    }
}

    // --- update inflow/outflows for nodes attached to non-dummy conduits
    for ( i = 0; i < Nobjects[LINK]; i++)
    {
        if ( isTrueConduit(i) ) updateNodeFlows(i);
    }

    // --- find new flows for all dummy conduits, pumps & regulators
    for ( i = 0; i < Nobjects[LINK]; i++)
    {
        if ( !isTrueConduit(i) )
        {
            if ( !Link[i].bypassed ) findNonConduitFlow(i, dt);
            updateNodeFlows(i);
        }
    }
}

//=============================================================================

int isTrueConduit(int j)
{
    return ( Link[j].type == CONDUIT && Link[j].xsect.type != DUMMY );
}

//=============================================================================

void findNonConduitFlow(int i, double dt)
//
//  Input:   i = link index
//           dt = time step (sec)
//  Output:  none
//  Purpose: finds new flow in a non-conduit-type link
//
{
    double qLast;                      // previous link flow (cfs)
    double qNew;                       // new link flow (cfs)

    // --- get link flow from last iteration
    qLast = Link[i].newFlow;
    Link[i].dqdh = 0.0;

    // --- get new inflow to link from its upstream node
    //     (link_getInflow returns 0 if flap gate closed or pump is offline)
    qNew = link_getInflow(i);
    if ( Link[i].type == PUMP ) qNew = getModPumpFlow(i, qNew, dt);

    // --- find surface area at each end of link
    findNonConduitSurfArea(i);

    // --- apply under-relaxation with flow from previous iteration;
    // --- do not allow flow to change direction without first being 0
    if ( Steps > 0 && Link[i].type != PUMP ) 
    {
        qNew = (1.0 - Omega) * qLast + Omega * qNew;
        if ( qNew * qLast < 0.0 ) qNew = 0.001 * SGN(qNew);
    }
    Link[i].newFlow = qNew;
}

//=============================================================================

double getModPumpFlow(int i, double q, double dt)
//
//  Input:   i = link index
//           q = pump flow from pump curve (cfs)
//           dt = time step (sec)
//  Output:  returns modified pump flow rate (cfs)
//  Purpose: modifies pump curve pumping rate depending on amount of water
//           available at pump's inlet node.
//
{
    int    j = Link[i].node1;          // pump's inlet node index
    int    k = Link[i].subIndex;       // pump's index
    double newNetInflow;               // inflow - outflow rate (cfs)
    double netFlowVolume;              // inflow - outflow volume (ft3)
    double y;                          // node depth (ft)

    if ( q == 0.0 ) return q;

    // --- case where inlet node is a storage node: 
    //     prevent node volume from going negative
    if ( Node[j].type == STORAGE ) return node_getMaxOutflow(j, q, dt); 

    // --- case where inlet is a non-storage node
    switch ( Pump[k].type )
    {
      // --- for Type1 pump, a volume is computed for inlet node,
      //     so make sure it doesn't go negative
      case TYPE1_PUMP:
        return node_getMaxOutflow(j, q, dt);

      // --- for other types of pumps, if pumping rate would make depth
      //     at upstream node negative, then set pumping rate = inflow
      case TYPE2_PUMP:
      case TYPE4_PUMP:
      case TYPE3_PUMP:
         newNetInflow = Node[j].inflow - Node[j].outflow - q;
         netFlowVolume = 0.5 * (Node[j].oldNetInflow + newNetInflow ) * dt;
         y = Node[j].oldDepth + netFlowVolume / Xnode[j].newSurfArea;
         if ( y <= 0.0 ) return Node[j].inflow;
    }
    return q;
}

//=============================================================================

void  findNonConduitSurfArea(int i)
//
//  Input:   i = link index
//  Output:  none
//  Purpose: finds the surface area contributed by a non-conduit
//           link to its upstream and downstream nodes.
//
{
    if ( Link[i].type == ORIFICE )
    {
        Link[i].surfArea1 = Orifice[Link[i].subIndex].surfArea / 2.;
    }

    // --- no surface area for weirs to maintain SWMM 4 compatibility
    else Link[i].surfArea1 = 0.0;

    Link[i].surfArea2 = Link[i].surfArea1;
    if ( Link[i].flowClass == UP_CRITICAL ||
        Node[Link[i].node1].type == STORAGE ) Link[i].surfArea1 = 0.0;
    if ( Link[i].flowClass == DN_CRITICAL ||
        Node[Link[i].node2].type == STORAGE ) Link[i].surfArea2 = 0.0;
}

//=============================================================================

void updateNodeFlows(int i)
//
//  Input:   i = link index
//           q = link flow rate (cfs)
//  Output:  none
//  Purpose: updates cumulative inflow & outflow at link's end nodes.
//
{
    int    k;
    int    barrels = 1;
    int    n1 = Link[i].node1;
    int    n2 = Link[i].node2;
    double q = Link[i].newFlow;
    double conduitLossRate = 0.0;

    // --- update total inflow & outflow at upstream/downstream nodes
    if ( q >= 0.0 )
    {
        Node[n1].outflow += q;
        Node[n2].inflow  += q;
    }
    else
    {
        Node[n1].inflow   -= q;
        Node[n2].outflow  -= q;
    }
 
    // --- add any uniform evap & seepage loss from conduit link
    if ( Link[i].type == CONDUIT )
    {
        k = Link[i].subIndex;
        barrels = Conduit[k].barrels;
        conduitLossRate = (Conduit[k].evapLossRate + Conduit[k].seepLossRate) *
                          barrels;
        if (conduitLossRate > 0.0)
        {
            // --- outfall nodes do not share evap & seepage losses
            if (Node[n1].type != OUTFALL && Node[n2].type != OUTFALL)
                conduitLossRate /= 2.0;
            if (Node[n1].type != OUTFALL)
                Node[n1].outflow += conduitLossRate;
            if (Node[n2].type != OUTFALL)
                Node[n2].outflow += conduitLossRate;
        }
    }
    
    // --- add surf. area contributions to upstream/downstream nodes
    Xnode[Link[i].node1].newSurfArea += Link[i].surfArea1 * barrels;
    Xnode[Link[i].node2].newSurfArea += Link[i].surfArea2 * barrels;

    // --- update summed value of dqdh at each end node
    Xnode[Link[i].node1].sumdqdh += Link[i].dqdh;
    if ( Link[i].type == PUMP )
    {
        k = Link[i].subIndex;
        if ( Pump[k].type != TYPE4_PUMP )
        {
            Xnode[n2].sumdqdh += Link[i].dqdh;
        }
    }
    else Xnode[n2].sumdqdh += Link[i].dqdh;
}

//=============================================================================

int findNodeDepths(double dt)
//
//  Input:   dt = time step (sec)
//  Output:  returns TRUE if depth change at all non-Outfall nodes is 
//           within the convergence tolerance and FALSE otherwise
//  Purpose: finds new depth at all nodes and checks if convergence achieved.
//
{
    int i;
    double yOld = 0.0;       // previous node depth (ft)

    // --- compute outfall depths based on flow in connecting link
    for ( i = 0; i < Nobjects[LINK]; i++ ) link_setOutfallDepth(i);

    // --- compute new depth for all non-outfall nodes and determine if
    //     depth change from previous iteration is below tolerance
#pragma omp parallel num_threads(NumThreads)
{
    #pragma omp for private(yOld)
    for ( i = 0; i < Nobjects[NODE]; i++ )
    {
        if ( Node[i].type == OUTFALL ) continue;
        yOld = Node[i].newDepth;
        setNodeDepth(i, dt);
        Xnode[i].converged = TRUE;
        if ( fabs(yOld - Node[i].newDepth) > HeadTol )
        {
            Xnode[i].converged = FALSE;
        }
    }
}

   // --- return FALSE if any non-Outfall node failed to converge
    for (i = 0; i < Nobjects[NODE]; i++)
    {
        if ( Node[i].type == OUTFALL ) continue;
        if (Xnode[i].converged == FALSE) return FALSE;
    }
    return TRUE;
}

//=============================================================================

void setNodeDepth(int i, double dt)
//
//  Input:   i  = node index
//           dt = time step (sec)
//  Output:  none
//  Purpose: sets depth at non-outfall node after current time step.
//
{
    int     canPond;                   // TRUE if node can pond overflows
    int     isPonded;                  // TRUE if node is currently ponded 
    int     isSurcharged = FALSE;      // TRUE if node is surcharged
    double  dQ;                        // inflow minus outflow at node (cfs)
    double  dV;                        // change in node volume (ft3)
    double  dy;                        // change in node depth (ft)
    double  yMax;                      // max. depth at node (ft)
    double  yOld;                      // node depth at previous time step (ft)
    double  yLast;                     // previous node depth (ft)
    double  yNew;                      // new node depth (ft)
    double  yCrown;                    // depth to node crown (ft)
    double  surfArea;                  // node surface area (ft2)
    double  denom;                     // denominator term
    double  corr;                      // correction factor
    double  f;                         // relative surcharge depth

    // --- see if node can pond water above it
    canPond = (AllowPonding && Node[i].pondedArea > 0.0);
    isPonded = (canPond && Node[i].newDepth > Node[i].fullDepth);

    // --- initialize values
    yCrown = Node[i].crownElev - Node[i].invertElev;
    yOld = Node[i].oldDepth;
    yLast = Node[i].newDepth;
    Node[i].overflow = 0.0;
    surfArea = Xnode[i].newSurfArea;
    surfArea = MAX(surfArea, MinSurfArea);
    
    // --- determine average net flow volume into node over the time step
    dQ = Node[i].inflow - Node[i].outflow;
    dV = 0.5 * (Node[i].oldNetInflow + dQ) * dt;

    // --- determine if node is EXTRAN surcharged
    if (SurchargeMethod == EXTRAN)
    {
        // --- ponded nodes don't surcharge
        if (isPonded) isSurcharged = FALSE;

        // --- closed storage units that are full are in surcharge
        else if (Node[i].type == STORAGE)
        {
            isSurcharged = (Node[i].surDepth > 0.0 &&
                            yLast > Node[i].fullDepth);
        }

        // --- surcharge occurs when node depth exceeds top of its highest link
        else isSurcharged = (yCrown > 0.0 && yLast > yCrown);
    }

    // --- if node not surcharged, base depth change on surface area        
    if (!isSurcharged)
    {
        dy = dV / surfArea;
        yNew = yOld + dy;

        // --- save non-ponded surface area for use in surcharge algorithm
        if ( !isPonded ) Xnode[i].oldSurfArea = surfArea;

        // --- apply under-relaxation to new depth estimate
        if ( Steps > 0 )
        {
            yNew = (1.0 - Omega) * yLast + Omega * yNew;
        }

        // --- don't allow a ponded node to drop much below full depth
        if ( isPonded && yNew < Node[i].fullDepth )
            yNew = Node[i].fullDepth - FUDGE;
    }

    // --- if node surcharged, base depth change on dqdh
    //     NOTE: depth change is w.r.t depth from previous
    //     iteration; also, do not apply under-relaxation.
    else
    {
        // --- apply correction factor for upstream terminal nodes
        corr = 1.0;
        if ( Node[i].degree < 0 ) corr = 0.6;

        // --- allow surface area from last non-surcharged condition
        //     to influence dqdh if depth close to crown depth
        denom = Xnode[i].sumdqdh;
        if ( yLast < 1.25 * yCrown )
        {
            f = (yLast - yCrown) / yCrown;
            denom += (Xnode[i].oldSurfArea/dt -
                      Xnode[i].sumdqdh) * exp(-15.0 * f);
        }

        // --- compute new estimate of node depth
        if ( denom == 0.0 ) dy = 0.0;
        else dy = corr * dQ / denom;
        yNew = yLast + dy;
        if ( yNew < yCrown ) yNew = yCrown - FUDGE;

        // --- don't allow a newly ponded node to rise much above full depth
        if ( canPond && yNew > Node[i].fullDepth )
            yNew = Node[i].fullDepth + FUDGE;
    }

    // --- depth cannot be negative
    if ( yNew < 0 ) yNew = 0.0;

    // --- determine max. non-flooded depth
    yMax = Node[i].fullDepth;
    if ( canPond == FALSE ) yMax += Node[i].surDepth;

    // --- find flooded depth & volume
    if ( yNew > yMax )
    {
        yNew = getFloodedDepth(i, canPond, dV, yNew, yMax, dt);
    }
    else Node[i].newVolume = node_getVolume(i, yNew);

    // --- compute change in depth w.r.t. time
    Xnode[i].dYdT = fabs(yNew - yOld) / dt;

    // --- save new depth for node
    Node[i].newDepth = yNew;
}

//=============================================================================

double getFloodedDepth(int i, int canPond, double dV, double yNew,
                       double yMax, double dt)
//
//  Input:   i  = node index
//           canPond = TRUE if water can pond over node
//           isPonded = TRUE if water is currently ponded
//           dV = change in volume over time step (ft3)
//           yNew = current depth at node (ft)
//           yMax = max. depth at node before ponding (ft)
//           dt = time step (sec)
//  Output:  returns depth at node when flooded (ft)
//  Purpose: computes depth, volume and overflow for a flooded node.
//
{
    if ( canPond == FALSE )
    {
        Node[i].overflow = dV / dt;
        Node[i].newVolume = Node[i].fullVolume;
        yNew = yMax;
    }
    else
    {
        Node[i].newVolume = MAX((Node[i].oldVolume+dV), Node[i].fullVolume);
        Node[i].overflow = (Node[i].newVolume - 
            MAX(Node[i].oldVolume, Node[i].fullVolume)) / dt;
    }
    if ( Node[i].overflow < FUDGE ) Node[i].overflow = 0.0;
    return yNew;

}

//=============================================================================

double getVariableStep(double maxStep)
//
//  Input:   maxStep = user-supplied max. time step (sec)
//  Output:  returns time step (sec)
//  Purpose: finds time step that satisfies stability criterion but
//           is no greater than the user-supplied max. time step.
//
{
    int    minLink = -1;                // index of link w/ min. time step
    int    minNode = -1;                // index of node w/ min. time step
    double tMin;                        // allowable time step (sec)
    double tMinLink;                    // allowable time step for links (sec)
    double tMinNode;                    // allowable time step for nodes (sec)

    // --- find stable time step for links & then nodes
    tMin = maxStep;
    tMinLink = getLinkStep(tMin, &minLink);
    tMinNode = getNodeStep(tMinLink, &minNode);

    // --- use smaller of the link and node time step
    tMin = tMinLink;
    if ( tMinNode < tMin )
    {
        tMin = tMinNode ;
        minLink = -1;
    }

    // --- update count of times the minimum node or link was critical
    stats_updateCriticalTimeCount(minNode, minLink);

    // --- don't let time step go below an absolute minimum
    if ( tMin < MinRouteStep ) tMin = MinRouteStep;
    return tMin;
}

//=============================================================================

double getLinkStep(double tMin, int *minLink)
//
//  Input:   tMin = critical time step found so far (sec)
//  Output:  minLink = index of link with critical time step;
//           returns critical time step (sec)
//  Purpose: finds critical time step for conduits based on Courant criterion.
//
{
    int    i;                           // link index
    int    k;                           // conduit index
    double q;                           // conduit flow (cfs)
    double t;                           // time step (sec)
    double tLink = tMin;                // critical link time step (sec)

    // --- examine each conduit link
    for ( i = 0; i < Nobjects[LINK]; i++ )
    {
        if ( Link[i].type == CONDUIT )
        {
            // --- skip conduits with negligible flow, area or Fr
            k = Link[i].subIndex;
            q = fabs(Link[i].newFlow) / Conduit[k].barrels;
            if ( q <= FUDGE 
            ||   Conduit[k].a1 <= FUDGE
            ||   Link[i].froude <= 0.01 
               ) continue;

            // --- compute time step to satisfy Courant condition
            t = Link[i].newVolume / Conduit[k].barrels / q;
            t = t * Conduit[k].modLength / link_getLength(i);
            t = t * Link[i].froude / (1.0 + Link[i].froude) * CourantFactor;

            // --- update critical link time step
            if ( t < tLink )
            {
                tLink = t;
                *minLink = i;
            }
        }
    }
    return tLink;
}

//=============================================================================

double getNodeStep(double tMin, int *minNode)
//
//  Input:   tMin = critical time step found so far (sec)
//  Output:  minNode = index of node with critical time step;
//           returns critical time step (sec)
//  Purpose: finds critical time step for nodes based on max. allowable
//           projected change in depth.
//
{
    int    i;                           // node index
    double maxDepth;                    // max. depth allowed at node (ft)
    double dYdT;                        // change in depth per unit time (ft/sec)
    double t1;                          // time needed to reach depth limit (sec)
    double tNode = tMin;                // critical node time step (sec)

    // --- find smallest time so that estimated change in nodal depth
    //     does not exceed safety factor * maxdepth
    for ( i = 0; i < Nobjects[NODE]; i++ )
    {
        // --- see if node can be skipped
        if ( Node[i].type == OUTFALL ) continue;
        if ( Node[i].newDepth <= FUDGE) continue;
        if ( Node[i].newDepth  + FUDGE >=
             Node[i].crownElev - Node[i].invertElev ) continue;

        // --- define max. allowable depth change using crown elevation
        maxDepth = (Node[i].crownElev - Node[i].invertElev) * 0.25;
        if ( maxDepth < FUDGE ) continue;
        dYdT = Xnode[i].dYdT;
        if (dYdT < FUDGE ) continue;

        // --- compute time to reach max. depth & compare with critical time
        t1 = maxDepth / dYdT;
        if ( t1 < tNode )
        {
            tNode = t1;
            *minNode = i;
        }
    }
    return tNode;
}


//=============================================================================
//   SGI: staggered-grid implicit head solve (extension, see sgi.h)
//=============================================================================

int sgi_execute(double tStep)
//
//  Input:   tStep = time step (sec)
//  Output:  returns number of trials used
//  Purpose: routes flows over one time step, finding all node heads
//           together from one linear system on each trial.
//
{
    int converged = FALSE;

    int i;

    Steps = 0;
    Omega = OMEGA;
    initRoutingStep();
    for (i = 0; i < Nobjects[NODE]; i++)
    {
        SgiLam[i] = 1.0;
        SgiPrev[i] = 0.0;
    }
    while ( Steps < Sgi.maxTrials )
    {
        initNodeStates();
        findLinkFlows(tStep);
        converged = sgi_findNodeDepths(tStep);
        Steps++;
        if ( Steps > 1 && converged ) break;
    }
    if ( !converged )
    {
        updateConvergenceStats();
        Sgi.nonConverged += 1.0;

        // --- finish an unconverged step with one full, undamped solve.
        //     A damped or step-limited head change leaves node continuity
        //     open by the part not applied; a full one closes it, so the
        //     step conserves volume whether or not it converged.
        Sgi.closing = 1;
        initNodeStates();
        findLinkFlows(tStep);
        sgi_findNodeDepths(tStep);
        Sgi.closing = 0;
        Sgi.closures += 1.0;
        Steps++;
    }
    Sgi.steps += 1.0;
    Sgi.trials += Steps;
    if ( Steps > Sgi.maxTrialsUsed ) Sgi.maxTrialsUsed = Steps;
    findLimitedLinks();
    return Steps;
}

//=============================================================================

void sgi_trimSurfArea(int i)
//
//  Purpose: makes the surface area a conduit gives its end nodes agree with
//           the volume the conduit can actually hold. Two cases. First,
//           removes the surface area an open channel contributes to an end
//           node whose water level is above the channel's top. The channel
//           holds no more water once it is full (its area is capped at
//           aFull), so a node that goes on booking its top width while
//           the level climbs past it is storing water in a volume that
//           does not exist.
//
{
    TXsect* xsect = &Link[i].xsect;
    int     k = Link[i].subIndex;
    double  f;

    // --- a lengthened conduit gets its surface area from its lengthened
    //     length but its volume from its real one; book the real one
    if ( Conduit[k].modLength > 0.0 )
    {
        f = link_getLength(i) / Conduit[k].modLength;
        if ( f < 1.0 )
        {
            Link[i].surfArea1 *= f;
            Link[i].surfArea2 *= f;
        }
    }
    if ( !xsect_isOpen(xsect->type) ) return;
    if ( Node[Link[i].node1].newDepth - Link[i].offset1 >= xsect->yFull )
        Link[i].surfArea1 = 0.0;
    if ( Node[Link[i].node2].newDepth - Link[i].offset2 >= xsect->yFull )
        Link[i].surfArea2 = 0.0;
}

//=============================================================================

void sgi_findConduitFlow(int i, double dt)
//
//  Purpose: finds a conduit's flow from the stock momentum equation, with
//           the friction term solved exactly instead of by iteration.
//
//  Stock writes the update as  q = S / (1 + K|qLast|),  where K|qLast| is
//  dq1 + dq5 evaluated at the last trial's flow, and relies on repeated
//  trials with 0.5 under-relaxation to reach  q (1 + K|q|) = S.  At a
//  long time step K|q| is large and that iteration is fragile, so here the
//  quadratic is solved directly:  q = 2S / (1 + sqrt(1 + 4K|S|)).
//  SgiOmega keeps dq/dS * (1 + K|qLast|), so that SgiOmega * Link.dqdh
//  is the derivative of this flow with respect to head.
//
{
    int     k = Link[i].subIndex;
    double  qLast = Conduit[k].q1;
    double  q, d, s, kap, a, r, root;
    TXsect* xsect = &Link[i].xsect;

    SgiDenom[i] = 1.0;
    dwflow_findConduitFlow(i, 0, 1.0, dt);
    sgi_trimSurfArea(i);
    SgiOmega[i] = 1.0;
    SgiKap[i] = 0.0;
    q = Conduit[k].q1;
    d = SgiDenom[i];

    // --- leave flows that stock has limited or zeroed as they are
    if ( Link[i].normalFlow || Link[i].inletControl ) return;
    if ( fabs(q) <= FUDGE ) return;
    if ( Link[i].qLimit > 0.0 && fabs(q) >= Link[i].qLimit ) return;

    // --- friction + local loss coefficient per unit flow
    if ( fabs(qLast) > 1.0e-6 && d > 1.0 ) kap = (d - 1.0) / fabs(qLast);
    else
    {
        a = Conduit[k].a1;
        if ( a <= FUDGE ) return;
        r = xsect_getRofA(xsect, MIN(a, xsect->aFull));
        if ( r <= FUDGE ) return;
        kap = dt * Conduit[k].roughFactor / pow(r, 1.33333) / a;
    }
    s = q * d;
    root = sqrt(1.0 + 4.0 * kap * fabs(s));
    q = 2.0 * s / (1.0 + root);
    SgiOmega[i] = d / root;
    SgiKap[i] = kap;
    Conduit[k].q1 = q;
    Conduit[k].q2 = q;
    Link[i].newFlow = q * Conduit[k].barrels;
}

//=============================================================================

void sgi_sumNodeFlows(void)
//
//  Purpose: rebuilds each node's total inflow & outflow from the current
//           link flows (same bookkeeping as initNodeStates/updateNodeFlows).
//
{
    int    i, k, n1, n2;
    double q, loss;

    for (i = 0; i < Nobjects[NODE]; i++)
    {
        Node[i].inflow = 0.0;
        Node[i].outflow = Node[i].losses;
        if ( Node[i].newLatFlow >= 0.0 ) Node[i].inflow += Node[i].newLatFlow;
        else Node[i].outflow -= Node[i].newLatFlow;
    }
    for (i = 0; i < Nobjects[LINK]; i++)
    {
        n1 = Link[i].node1;
        n2 = Link[i].node2;
        q = Link[i].newFlow;
        if ( q >= 0.0 ) { Node[n1].outflow += q; Node[n2].inflow += q; }
        else            { Node[n1].inflow -= q;  Node[n2].outflow -= q; }
        if ( Link[i].type == CONDUIT )
        {
            k = Link[i].subIndex;
            loss = (Conduit[k].evapLossRate + Conduit[k].seepLossRate) *
                   Conduit[k].barrels;
            if ( loss > 0.0 )
            {
                if ( Node[n1].type != OUTFALL && Node[n2].type != OUTFALL )
                    loss /= 2.0;
                if ( Node[n1].type != OUTFALL ) Node[n1].outflow += loss;
                if ( Node[n2].type != OUTFALL ) Node[n2].outflow += loss;
            }
        }
    }
}

//=============================================================================

void sgi_getGeomCoupling(int j, double* g1, double* g2)
//
//  Input:   j = conduit link index
//  Output:  g1, g2 = change in the conduit's flow per unit rise in the
//           depth at its upstream and downstream end (cfs/ft)
//  Purpose: finds how the flow answers to the change in flow area and
//           hydraulic radius as the end depths move, the part of dq/dh
//           that Link.dqdh (head gradient only) leaves out. On a steep
//           pipe it is nearly all of dq/dh.
//
//  From  q + K q|q| = S,  S = qOld + dt g aWtd (h1 - h2)/L + ...,
//  K ~ 1 / (rWtd^4/3 * aMid):
//      dq = [ (S - qOld) dln(aWtd)
//             + K q|q| (4/3 dln(rWtd) + dln(aMid)) ] / (1 + 2K|q|)
//  with aWtd, rWtd weighted toward the upstream end as the Froude number
//  rises, the same way dwflow.c weights them.
//
{
    int     k = Link[j].subIndex;
    int     n1 = Link[j].node1, n2 = Link[j].node2;
    TXsect* xsect = &Link[j].xsect;
    double  kap = SgiKap[j], q = Conduit[k].q1;
    double  yFull = xsect->yFull, dy = 0.001 * yFull;
    double  y1, y2, yMid, a1, aMid, r1, rMid, aW, rW, rho, fr, e1, e2;
    double  w1, wMid, dr1, drMid, sp, fric, root, daW, drW;

    *g1 = 0.0;
    *g2 = 0.0;
    if ( kap <= 0.0 || fabs(q) <= FUDGE ) return;
    if ( Link[j].flowClass == UP_CRITICAL || Link[j].flowClass == DN_CRITICAL )
        return;
    y1 = Node[n1].newDepth - Link[j].offset1;
    y2 = Node[n2].newDepth - Link[j].offset2;
    e1 = (y1 > FUDGE && y1 < yFull - dy) ? 1.0 : 0.0;
    e2 = (y2 > FUDGE && y2 < yFull - dy) ? 1.0 : 0.0;
    if ( e1 == 0.0 && e2 == 0.0 ) return;
    y1 = MIN(MAX(y1, FUDGE), yFull - dy);
    y2 = MIN(MAX(y2, FUDGE), yFull - dy);
    yMid = 0.5 * (y1 + y2);
    a1 = xsect_getAofY(xsect, y1);
    aMid = xsect_getAofY(xsect, yMid);
    r1 = xsect_getRofY(xsect, y1);
    rMid = xsect_getRofY(xsect, yMid);
    if ( a1 <= FUDGE || aMid <= FUDGE || r1 <= FUDGE || rMid <= FUDGE ) return;
    w1 = (xsect_getAofY(xsect, y1 + dy) - a1) / dy;
    wMid = (xsect_getAofY(xsect, yMid + dy) - aMid) / dy;
    dr1 = (xsect_getRofY(xsect, y1 + dy) - r1) / dy;
    drMid = (xsect_getRofY(xsect, yMid + dy) - rMid) / dy;

    // --- upstream weighting, as in dwflow.c
    rho = 1.0;
    if ( q > 0.0 && Node[n1].newDepth + Node[n1].invertElev >=
                    Node[n2].newDepth + Node[n2].invertElev )
    {
        fr = Link[j].froude;
        if ( InertDamping == FULL_DAMPING ) rho = 0.0;
        else if ( InertDamping == PARTIAL_DAMPING )
        {
            if ( fr >= 1.0 ) rho = 0.0;
            else if ( fr > 0.5 ) rho = 2.0 * (1.0 - fr);
        }
    }
    aW = a1 + (aMid - a1) * rho;
    rW = r1 + (rMid - r1) * rho;
    sp = q * (1.0 + kap * fabs(q)) - Link[j].oldFlow / Conduit[k].barrels;
    fric = kap * q * fabs(q);
    root = 1.0 + 2.0 * kap * fabs(q);

    daW = w1 * (1.0 - rho) + 0.5 * rho * wMid;
    drW = dr1 * (1.0 - rho) + 0.5 * rho * drMid;
    *g1 = e1 * ( sp * daW / aW +
          fric * (4./3. * drW / rW + 0.5 * wMid / aMid) ) / root *
          Conduit[k].barrels;
    daW = 0.5 * rho * wMid;
    drW = 0.5 * rho * drMid;
    *g2 = e2 * ( sp * daW / aW +
          fric * (4./3. * drW / rW + 0.5 * wMid / aMid) ) / root *
          Conduit[k].barrels;
}

//=============================================================================

double sgi_getNodeVolume(int i, double y)
//
//  Input:   i = node index, y = depth (ft)
//  Output:  returns the node's control volume (ft3)
//  Purpose: the volume whose derivative is the node's surface area: free
//           surface area SgiAs0 up to the surcharge depth SgiYref, then the
//           exp(-15 f) decay of that area plus the 1% sliver above it.
//           Storage is the difference of two of these, not area times a
//           depth change, so a node that crosses its crown inside one
//           step neither makes nor loses water.
//
//           A storage unit's volume is its own storage curve plus the
//           surface area of the conduit ends that meet it (SgiShare), the
//           same total area stock uses in its depth update. Leaving the
//           conduit share out of the volume while keeping it in the area
//           lets the conduits beside a storage unit fill for free.
//
{
    double yRef = SgiYref[i], as0 = SgiAs0[i], f, v;

    if ( yRef <= 0.0 || y <= yRef )
    {
        if ( Node[i].type == STORAGE )
            return node_getVolume(i, y) + SgiShare[i] * y;
        return as0 * y;
    }
    if ( Node[i].type == STORAGE )
        v = node_getVolume(i, yRef) + SgiShare[i] * yRef;
    else v = as0 * yRef;
    f = (y - yRef) / yRef;
    return v + as0 * yRef / 15.0 * (1.0 - exp(-15.0 * f)) +
           0.01 * MinSurfArea * (y - yRef);
}

//=============================================================================

double sgi_getNodeDepth(int i, double v, double yMax)
//
//  Input:   i = node index, v = control volume (ft3), yMax = rim depth (ft)
//  Output:  returns the depth that holds that volume, between 0 and yMax
//  Purpose: inverts sgi_getNodeVolume by bisection (it rises with depth).
//
{
    int    k;
    double lo = 0.0, hi = yMax, mid;

    if ( v <= sgi_getNodeVolume(i, 0.0) ) return 0.0;
    if ( v >= sgi_getNodeVolume(i, yMax) ) return yMax;
    for (k = 0; k < 60; k++)
    {
        mid = 0.5 * (lo + hi);
        if ( sgi_getNodeVolume(i, mid) < v ) lo = mid;
        else hi = mid;
        if ( hi - lo < 1.0e-7 ) break;
    }
    return 0.5 * (lo + hi);
}

//=============================================================================

int sgi_findNodeDepths(double dt)
//
//  Input:   dt = time step (sec)
//  Output:  returns TRUE if no node's depth moved more than HeadTol
//  Purpose: finds new depths at all nodes together.
//
//  With the link flows q* just found at the current trial heads, each link
//  responds to a head change as  q = q* + c1 dH1 - c2 dH2,  c = w * dq/dh.
//  Putting that into node continuity
//      As (y + dH - yOld) / dt = theta * net(q) + (1 - theta) * netOld
//  gives one linear system for dH at every node. After solving it the
//  link flows are corrected with the same c, so node continuity holds to
//  the linear solver's tolerance on every trial.
//
{
    int    i, j, k, n1, n2, canPond, isPonded, isSur;
    int    n = Nobjects[NODE], m = Nobjects[LINK];
    int    converged = TRUE;
    double yCrown, yRef, yOld, yLast, yNew, yMax, surfArea, theta;
    double f, net, c, c2, dH, lim, dq, dV, excess, y1, dy, qn1, qn2, g1, g2;
    TXsect* xsect;

    // --- outfall depths follow their connecting link, as in stock;
    //     the change is a known head change in the solve
    for (i = 0; i < n; i++)
    {
        SgiX[i] = 0.0;
        if ( Node[i].type == OUTFALL ) SgiYnew[i] = Node[i].newDepth;
    }
    for (j = 0; j < m; j++) link_setOutfallDepth(j);

    // --- head coupling of each link: c = dQ/dH1, c2 = -dQ/dH2
    for (j = 0; j < m; j++)
    {
        c = 0.0;
        c2 = 0.0;
        if ( isTrueConduit(j) )
        {
            k = Link[j].subIndex;
            if ( Link[j].newFlow == 0.0 &&
                 ( Link[j].flowClass == DRY || Link[j].flowClass == UP_DRY ||
                   Link[j].flowClass == DN_DRY || Link[j].setting == 0.0 ||
                   Link[j].hasFlapGate ) ) c = 0.0;

            // --- normal flow depends on the upstream depth alone
            else if ( Link[j].normalFlow )
            {
                xsect = &Link[j].xsect;
                y1 = Node[Link[j].node1].newDepth - Link[j].offset1;
                y1 = MIN(MAX(y1, FUDGE), xsect->yFull);
                dy = 0.001 * xsect->yFull;
                if ( y1 + dy > xsect->yFull ) y1 = xsect->yFull - dy;
                qn1 = xsect_getAofY(xsect, y1) *
                      pow(xsect_getRofY(xsect, y1), 2./3.);
                qn2 = xsect_getAofY(xsect, y1 + dy) *
                      pow(xsect_getRofY(xsect, y1 + dy), 2./3.);
                c = Conduit[k].beta * (qn2 - qn1) / dy * Conduit[k].barrels;
            }

            // --- otherwise the momentum equation's dq/dh at both ends,
            //     except at an end sitting at critical depth over a drop
            else
            {
                c = SgiOmega[j] * Link[j].dqdh;
                c2 = c;
                if ( Link[j].flowClass == DN_CRITICAL ) c2 = 0.0;
                if ( Link[j].flowClass == UP_CRITICAL ) c = 0.0;

                // --- plus the change in conveyance as the end depths move
                sgi_getGeomCoupling(j, &g1, &g2);
                c += g1;
                c2 -= g2;
            }
        }
        // --- a pump answers to head through the slope of its curve
        //     (a Type 4 pump to its inlet depth only), as in stock's sumdqdh
        else if ( Link[j].type == PUMP )
        {
            c = Link[j].dqdh;
            c2 = c;
            if ( Pump[Link[j].subIndex].type == TYPE4_PUMP ) c2 = 0.0;
        }
        else if ( Link[j].type != CONDUIT )
        {
            c = Link[j].dqdh;
            if ( Steps > 0 ) c *= Omega;
            c2 = c;
        }
        SgiCoup[j] = MAX(c, 0.0);
        SgiCoup2[j] = MAX(c2, 0.0);
    }

    // --- storage term and continuity residual at each node
    for (i = 0; i < n; i++)
    {
        SgiFixed[i] = 0;
        SgiSur[i] = 0;
        SgiDiag[i] = 0.0;
        SgiRhs[i] = 0.0;
        if ( Node[i].type == OUTFALL )
        {
            SgiFixed[i] = 1;
            SgiX[i] = Node[i].newDepth - SgiYnew[i];
            continue;
        }
        canPond = (AllowPonding && Node[i].pondedArea > 0.0);
        isPonded = (canPond && Node[i].newDepth > Node[i].fullDepth);
        yCrown = Node[i].crownElev - Node[i].invertElev;
        yOld = Node[i].oldDepth;
        yLast = Node[i].newDepth;
        surfArea = MAX(Xnode[i].newSurfArea, MinSurfArea);
        theta = Sgi.theta;

        // --- same surcharge test as stock setNodeDepth
        isSur = FALSE;
        yRef = -1.0;
        if ( SurchargeMethod == EXTRAN && !isPonded )
        {
            if ( Node[i].type == STORAGE )
            {
                if ( Node[i].surDepth > 0.0 ) yRef = Node[i].fullDepth;
            }
            else if ( yCrown > 0.0 ) yRef = yCrown;
            isSur = (yRef > 0.0 && yLast > yRef);
        }

        // --- above the crown the free surface closes off: the last free
        //     surface area decays with stock's exp(-15 f) factor, down to a
        //     sliver (1% of the minimum nodal area) so that a surcharged
        //     pocket whose flows do not answer to its own head still has
        //     a solution; the node is then a pressure node (sum of q = 0)
        if ( isSur )
        {
            f = (yLast - yRef) / yRef;
            SgiAs0[i] = Xnode[i].oldSurfArea;
            surfArea = SgiAs0[i] * exp(-15.0 * f) + 0.01 * MinSurfArea;
            theta = 1.0;
        }
        else
        {
            SgiAs0[i] = surfArea;
            if ( !isPonded ) Xnode[i].oldSurfArea = surfArea;

            // --- what a storage unit holds beyond its own curve
            if ( Node[i].type == STORAGE )
            {
                if ( AllowPonding ) f = node_getPondedArea(i, yLast);
                else                f = node_getSurfArea(i, yLast);
                SgiShare[i] = MAX(surfArea - f, 0.0);
            }
        }
        SgiYref[i] = yRef;
        SgiVold[i] = sgi_getNodeVolume(i, yOld);

        net = Node[i].inflow - Node[i].outflow;
        SgiTheta[i] = theta;
        SgiSur[i] = (char)isSur;
        SgiA[i] = surfArea / (theta * dt);
        SgiRhs[i] = net + (1.0 - theta) / theta * Node[i].oldNetInflow -
                    (sgi_getNodeVolume(i, yLast) - SgiVold[i]) / (theta * dt);
        SgiDiag[i] = SgiA[i];

        // --- hold a flooded node at its rim, and a dry node at its invert
        yMax = Node[i].fullDepth;
        if ( canPond == FALSE ) yMax += Node[i].surDepth;
        if ( !canPond && yLast >= yMax && SgiRhs[i] > 0.0 ) SgiFixed[i] = 1;
        else if ( yLast <= 0.0 && SgiRhs[i] < 0.0 ) SgiFixed[i] = 1;
    }

    // --- add the link couplings
    for (j = 0; j < m; j++)
    {
        c = SgiCoup[j];
        c2 = SgiCoup2[j];
        if ( c <= 0.0 && c2 <= 0.0 ) continue;
        n1 = Link[j].node1;
        n2 = Link[j].node2;
        SgiDiag[n1] += c;
        SgiDiag[n2] += c2;
        if ( SgiFixed[n2] && !SgiFixed[n1] ) SgiRhs[n1] += c2 * SgiX[n2];
        if ( SgiFixed[n1] && !SgiFixed[n2] ) SgiRhs[n2] += c * SgiX[n1];
    }
    for (i = 0; i < n; i++)
    {
        if ( !SgiFixed[i] && SgiDiag[i] <= 1.0e-12 ) SgiFixed[i] = 1;
    }

    // --- solve for the head change at all free nodes
    sgi_solve(n, m);

    // --- turn head changes into trial depths, within each node's limits
    for (i = 0; i < n; i++)
    {
        if ( Node[i].type == OUTFALL ) continue;
        canPond = (AllowPonding && Node[i].pondedArea > 0.0);
        isPonded = (canPond && Node[i].newDepth > Node[i].fullDepth);
        yCrown = Node[i].crownElev - Node[i].invertElev;
        yLast = Node[i].newDepth;
        yMax = Node[i].fullDepth;
        if ( canPond == FALSE ) yMax += Node[i].surDepth;
        yNew = yLast;
        if ( SgiFixed[i] ) SgiRhs[i] = 0.0;
        else
        {
            dH = SgiX[i];
            SgiRhs[i] = dH;          // keep the undamped change for the
                                     // convergence test (rhs is spent)

            // --- halve the move each time it reverses on this node. Where
            //     flow goes as the square root of a head difference, an
            //     undamped Newton step lands the same distance on the far
            //     side forever; half a step lands on the answer. It is the
            //     job stock's 0.5 under-relaxation does on every trial.
            if ( !Sgi.closing )
            {
                if ( dH * SgiPrev[i] < 0.0 )
                    SgiLam[i] = MAX(0.5 * SgiLam[i], 1.0 / 64.0);
                dH *= SgiLam[i];
            }

            // --- limit the move of a free-surface junction on one trial
            //     (a dry node has almost no surface area to linearize on)
            if ( !Sgi.closing && !SgiSur[i] && Node[i].type != STORAGE &&
                 !isPonded )
            {
                lim = MAX(0.5, 0.5 * yCrown);
                if ( fabs(dH) > lim )
                {
                    dH = SGN(dH) * lim;
                    Sgi.damped += 1.0;
                }
            }
            yNew = yLast + dH;

            // --- the solve moved the node's volume by (surface area x dH).
            //     Where the volume is not a straight line in depth (a
            //     storage curve, or a node passing its crown, where the
            //     area collapses) take the depth that holds that volume,
            //     so the crossing neither makes nor loses water.
            if ( !canPond && ( Node[i].type == STORAGE ||
                 ( SgiYref[i] > 0.0 &&
                   ( SgiSur[i] || yNew > SgiYref[i] ) ) ) )
            {
                yNew = sgi_getNodeDepth(i, sgi_getNodeVolume(i, yLast) +
                       SgiA[i] * SgiTheta[i] * dt * dH, yMax);
            }
            else if ( SgiSur[i] )
            {
                yRef = SgiYref[i];
                if ( yNew < yRef ) yNew = yRef - FUDGE;
                if ( canPond && yNew > Node[i].fullDepth )
                    yNew = Node[i].fullDepth + FUDGE;
            }
            else if ( isPonded && yNew < Node[i].fullDepth )
                yNew = Node[i].fullDepth - FUDGE;
            if ( yNew < 0.0 ) yNew = 0.0;
            if ( !canPond && yNew > yMax ) yNew = yMax;
        }
        // --- the links are corrected with the head change the solve
        //     used, which is what moved the node's volume; the depth that
        //     holds that volume may be a different distance away
        if ( SgiFixed[i] ) SgiX[i] = 0.0;
        else if ( canPond ) SgiX[i] = yNew - yLast;
        else SgiX[i] = dH;
        SgiPrev[i] = SgiX[i];
        SgiYnew[i] = yNew;
    }

    // --- correct link flows for the head changes actually applied
    for (j = 0; j < m; j++)
    {
        c = SgiCoup[j];
        c2 = SgiCoup2[j];
        if ( c <= 0.0 && c2 <= 0.0 ) continue;
        dq = c * SgiX[Link[j].node1] - c2 * SgiX[Link[j].node2];
        if ( dq == 0.0 ) continue;
        Link[j].newFlow += dq;
        if ( Link[j].type == CONDUIT )
        {
            k = Link[j].subIndex;
            Conduit[k].q1 = Link[j].newFlow / Conduit[k].barrels;
            Conduit[k].q2 = Conduit[k].q1;
        }
    }
    sgi_sumNodeFlows();

    // --- save new depths, volumes and overflows
    for (i = 0; i < n; i++)
    {
        if ( Node[i].type == OUTFALL ) continue;
        canPond = (AllowPonding && Node[i].pondedArea > 0.0);
        yOld = Node[i].oldDepth;
        yLast = Node[i].newDepth;
        yNew = SgiYnew[i];
        theta = SgiTheta[i];
        yMax = Node[i].fullDepth;
        if ( canPond == FALSE ) yMax += Node[i].surDepth;
        net = Node[i].inflow - Node[i].outflow;
        dV = (theta * net + (1.0 - theta) * Node[i].oldNetInflow) * dt;
        Node[i].overflow = 0.0;
        if ( !canPond && yNew >= yMax )
        {
            // --- whatever the node cannot store or pass on leaves as flooding
            excess = dV / dt - (sgi_getNodeVolume(i, yNew) - SgiVold[i]) / dt;
            if ( excess >= FUDGE )
            {
                Node[i].overflow = excess;
                Node[i].newVolume = Node[i].fullVolume;
            }
            else Node[i].newVolume = node_getVolume(i, yNew);
        }
        else if ( canPond && yNew > yMax )
        {
            yNew = getFloodedDepth(i, canPond, dV, yNew, yMax, dt);
        }
        else Node[i].newVolume = node_getVolume(i, yNew);

        Xnode[i].dYdT = fabs(yNew - yOld) / dt;
        // --- converged only when the full, undamped change is within
        //     tolerance; a damped change being small proves nothing
        Xnode[i].converged = ( fabs(SgiRhs[i]) <= HeadTol &&
                               fabs(yNew - yLast) <= HeadTol );
        if ( !Xnode[i].converged ) converged = FALSE;
        Node[i].newDepth = yNew;
    }
    return converged;
}
