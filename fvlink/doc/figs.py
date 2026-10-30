"""Figures for the swmm524-fvlink technical description (US units)."""
import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Polygon, FancyArrowPatch

import os
OUT = os.path.dirname(os.path.abspath(__file__)) + "/"            # figures and figure data
RESULTS = os.path.join(OUT, "..", "results") + "/"                 # timing files
INK, INK2, MUTED, GRID = "#0b0b0b", "#52514e", "#8a8984", "#e4e3df"
S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"     # validated categorical slots 1-3
WATER, PIPE, NEWC = "#cde2fb", "#3a3a38", "#2a78d6"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": MUTED,
    "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "axes.titlecolor": INK, "axes.titlesize": 10, "axes.titleweight": "bold",
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
    "grid.color": GRID, "grid.linewidth": 0.6, "legend.frameon": False,
    "savefig.dpi": 220, "savefig.bbox": "tight", "savefig.facecolor": "white",
})


def save(fig, name):
    fig.savefig(OUT + name)
    plt.close(fig)


# ---------------------------------------------------------------- Fig 1
def fig_profile():
    fig, ax = plt.subplots(figsize=(6.8, 3.4))
    ax.set_xlim(0, 100); ax.set_ylim(-4, 44); ax.axis("off")
    # three manholes
    nodes = {"J3": (8, 26), "J4": (40, 18), "J5": (78, 10)}
    for nm, (x, z) in nodes.items():
        ax.add_patch(Rectangle((x - 2.2, z), 4.4, 13, fc="white", ec=PIPE, lw=1.2))
        lev = {"J3": 5.0, "J4": 6.3, "J5": 4.6}[nm]
        ax.add_patch(Rectangle((x - 2.2, z), 4.4, lev, fc=WATER, ec="none"))
        ax.plot([x - 2.2, x + 2.2], [z + lev] * 2, color=S1, lw=1.2)
        ax.text(x, z + 13.6, nm, ha="center", va="bottom", fontsize=9, color=INK, fontweight="bold")
    # pipe J3-J4 : dynamic wave
    x0, z0, x1, z1 = 10.2, 26, 37.8, 18
    d = 4.0
    ax.add_patch(Polygon([(x0, z0), (x1, z1), (x1, z1 + d), (x0, z0 + d)], fc="white", ec=PIPE, lw=1.2))
    ax.add_patch(Polygon([(x0, z0), (x1, z1), (x1, z1 + 2.3), (x0, z0 + 2.6)], fc=WATER, ec="none"))
    ax.annotate("", xy=(30, 21.8), xytext=(17, 25.5),
                arrowprops=dict(arrowstyle="-|>", color=INK2, lw=1.2))
    ax.text(24.5, 31.0, "Dynamic wave link\none flow Q per conduit", ha="center", fontsize=8, color=INK2)
    # pipe J4-J5 : finite volume, 8 cells
    x0, z0, x1, z1 = 42.2, 18, 75.8, 10
    n = 8
    depths = [3.0, 2.8, 2.5, 2.3, 2.15, 2.05, 2.0, 2.1]
    for i in range(n):
        xa = x0 + (x1 - x0) * i / n; xb = x0 + (x1 - x0) * (i + 1) / n
        za = z0 + (z1 - z0) * i / n; zb = z0 + (z1 - z0) * (i + 1) / n
        zc = 0.5 * (za + zb)
        ax.add_patch(Polygon([(xa, za), (xb, zb), (xb, zb + depths[i] * 0 + (zc - zb) + depths[i]),
                              (xa, za + (zc - za) + depths[i])], fc=WATER, ec="none"))
    ax.add_patch(Polygon([(x0, z0), (x1, z1), (x1, z1 + d), (x0, z0 + d)], fc="none", ec=NEWC, lw=1.6))
    for i in range(1, n):
        xa = x0 + (x1 - x0) * i / n; za = z0 + (z1 - z0) * i / n
        ax.plot([xa, xa], [za, za + d], color=NEWC, lw=0.8)
    ax.text(58, 28.5, "Finite-volume link:\n8 cells, each with A and Q", ha="center", fontsize=8,
            color=NEWC, fontweight="bold")
    ax.text(59, 0.8, "faces between cells carry HLL fluxes;\nthe end faces see the node as a ghost state",
            ha="center", fontsize=7.6, color=INK2)
    # ghost callouts
    ax.annotate("ghost: water surface = J4 head,\nvelocity = first cell's", xy=(42.4, 20.5),
                xytext=(38, 6.5), fontsize=7.3, color=INK2, ha="center",
                arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.8))
    ax.annotate("volume through each end face\nbooked into J5's continuity", xy=(75.6, 12.3),
                xytext=(88, 33), fontsize=7.3, color=INK2, ha="center",
                arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.8))
    # pipe J5 onward : dynamic wave
    ax.add_patch(Polygon([(80.2, 10), (98, 4), (98, 8), (80.2, 14)], fc="white", ec=PIPE, lw=1.2))
    ax.add_patch(Polygon([(80.2, 10), (98, 4), (98, 6.2), (80.2, 12.4)], fc=WATER, ec="none"))
    ax.text(92, 0.0, "DW", ha="center", fontsize=8, color=INK2)
    save(fig, "fig1_profile.png")


# ---------------------------------------------------------------- flowchart helper
def box(ax, x, y, w, h, text, new=False, fs=7.6, bold=False):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle="round,pad=0.02,rounding_size=0.12",
                                fc="#eef4fc" if new else "white", ec=NEWC if new else MUTED,
                                lw=1.4 if new else 0.9))
    ax.text(x, y, text, ha="center", va="center", fontsize=fs, color=INK,
            fontweight="bold" if bold else "normal", linespacing=1.25)


def arrow(ax, x0, y0, x1, y1, color=INK2):
    ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>", mutation_scale=9,
                                 color=color, lw=0.9, shrinkA=0, shrinkB=0))


# ---------------------------------------------------------------- loop helper
def loop_back(ax, x_edge, y_from, y_to, x_out, label=None, lx=None):
    ax.plot([x_edge, x_out, x_out], [y_from, y_from, y_to], color=INK2, lw=0.9)
    arrow(ax, x_out, y_to, x_edge, y_to)
    if label:
        ax.text(lx if lx else x_out + 0.1, 0.5 * (y_from + y_to), label, fontsize=7.2,
                color=INK2, ha="left", va="center")


def column(ax, rows, x, w, fs, gap_top):
    """rows: list of (text, new, bold). Stacks boxes top-down; returns centers/heights."""
    y = gap_top
    out = []
    for text, new, bold in rows:
        n = text.count("\n") + 1
        h = 0.27 * n + 0.28
        yc = y - h / 2
        box(ax, x, yc, w, h, text, new=new, bold=bold, fs=fs)
        out.append((yc, h))
        y = y - h - 0.32
    for (a, ha), (b, hb) in zip(out[:-1], out[1:]):
        arrow(ax, x, a - ha / 2, x, b + hb / 2)
    return out


# ---------------------------------------------------------------- Fig 2
def fig_step():
    fig, ax = plt.subplots(figsize=(6.8, 6.3))
    ax.set_xlim(0, 10); ax.set_ylim(0, 12.6); ax.axis("off")
    rows = [
        ("dynwave_execute(): one dynamic wave routing step", False, True),
        ("initRoutingStep(), then fvlink_initStep():\nsave every FV cell's A and Q", True, False),
        ("initNodeStates(): node surface area, inflow, outflow", False, False),
        ("findLinkFlows(): dwflow_findConduitFlow() for every conduit\nthat is not an FV link; then pumps, orifices, weirs, outlets", False, False),
        ("fvlink_findFlows(): unless every interface node has converged,\nsubcycle all FV links over the step from the saved state;\nadd each end face's average flow to the node's inflow or\noutflow, and the links' dQ/dH to the node's sum", True, False),
        ("findNodeDepths(): node continuity. At an FV end node the FV\nshare is booked exactly (fvlink_getNodeVolume) and the rest\nby dynamic wave's trapezoidal rule", True, False),
        ("Converged (all heads within HEAD_TOLERANCE)\nor MAX_TRIALS reached?", False, False),
        ("fvlink_endStep(): commit each node's FV net inflow\nand the links' cumulative face volumes", True, False),
        ("findLimitedLinks(); statistics, report and mass balance read\nthe FV links through the usual Link and Conduit fields", False, False),
    ]
    xc, w = 4.1, 7.4
    out = column(ax, rows, xc, w, 7.2, 12.4)
    xe = xc + w / 2
    loop_back(ax, xe, out[6][0], out[2][0], xe + 0.55, label="no: next\nPicard\niteration", lx=xe + 0.65)
    ax.text(xc + 0.12, out[6][0] - out[6][1] / 2 - 0.16, "yes", fontsize=7.2, color=INK2, va="center")
    yl = out[-1][0] - out[-1][1] / 2 - 0.55
    ax.add_patch(FancyBboxPatch((0.45, yl - 0.15), 0.45, 0.3, boxstyle="round,pad=0.02", fc="#eef4fc", ec=NEWC, lw=1.4))
    ax.text(1.05, yl, "new code (fvlink.c and its hooks)", fontsize=7.2, va="center", color=INK2)
    ax.add_patch(FancyBboxPatch((4.75, yl - 0.15), 0.45, 0.3, boxstyle="round,pad=0.02", fc="white", ec=MUTED, lw=0.9))
    ax.text(5.35, yl, "stock EPA SWMM 5.2.4", fontsize=7.2, va="center", color=INK2)
    ax.set_ylim(yl - 0.4, 12.6)
    save(fig, "fig2_step.png")


# ---------------------------------------------------------------- Fig 3
def fig_substep():
    fig, ax = plt.subplots(figsize=(6.8, 6.6))
    ax.set_xlim(0, 10); ax.set_ylim(0, 13.0); ax.axis("off")
    rows = [
        ("solveSystem(dt): restore every FV link to its start-of-step state;\nmark each interface node PRESCRIBED (outfall, EXTRAN-surcharged\nnode) or LOCAL (every other node)", True, True),
        ("1  Node heads at time t: LOCAL nodes integrate their own continuity;\nPRESCRIBED nodes interpolate dynamic wave's head", True, False),
        ("2  Face fluxes in every FV link: hydrostatic reconstruction + HLL;\nCourant limit 0.5 dx / fastest wave; end-face conductance K = sqrt(g A T)", True, False),
        ("3  Node limit: substep <= A_node / K_node", True, False),
        ("4  Semi-implicit node head change  dH = dt (Q_other + Q_FV) / (A + dt K);\nre-solve the end faces at the new head; if their waves are faster, shrink\nthe substep and repeat (4 estimates at most); floor 0.001 s = a Floor Hit", True, False),
        ("5  Positivity: no cell, and no LOCAL node, gives more water than it has\n(each face is scaled by the factor of the side it drains)", True, False),
        ("6  Update every cell: A and Q from the face fluxes and the\nhydrostatic corrections, then semi-implicit Manning friction", True, False),
        ("7  Book the end-face volumes into the link's vIn / vOut\nand into each node's running FV volume", True, False),
        ("t = t + substep; repeat 1 to 7 until t = dt", True, False),
        ("setLinkResults(): publish flow, depth, volume, Froude number and dQ/dH\nthrough Link[] and Conduit[]", True, False),
    ]
    xc, w = 4.75, 8.5
    out = column(ax, rows, xc, w, 7.1, 12.9)
    xe = xc + w / 2
    loop_back(ax, xe, out[8][0], out[1][0], xe + 0.35)
    ax.set_ylim(out[-1][0] - out[-1][1] / 2 - 0.2, 13.0)
    save(fig, "fig3_substep.png")


# ---------------------------------------------------------------- Fig 4
def fig_recon():
    fig, ax = plt.subplots(figsize=(6.0, 2.6))
    ax.set_xlim(0.5, 9.5); ax.set_ylim(0.2, 5.0); ax.axis("off")
    # left cell bed lower, right cell bed higher
    zL, zR, eta = 0.8, 2.0, 3.6
    ax.add_patch(Rectangle((1, 0.3), 4, zL - 0.3, fc="#d9d7d0", ec="none"))
    ax.add_patch(Rectangle((5, 0.3), 4, zR - 0.3, fc="#d9d7d0", ec="none"))
    ax.add_patch(Rectangle((1, zL), 4, eta - zL, fc=WATER, ec="none"))
    ax.add_patch(Rectangle((5, zR), 4, eta - zR, fc=WATER, ec="none"))
    ax.plot([1, 9], [eta, eta], color=S1, lw=1.4)
    ax.plot([5, 5], [0.3, 4.6], color=INK2, lw=0.9, ls="--")
    ax.plot([4.2, 5.8], [zR, zR], color=S2, lw=1.6)
    ax.text(3.0, eta + 0.15, "η_L", ha="center", va="bottom", color=INK)
    ax.text(7.0, eta + 0.15, "η_R  (same water surface)", ha="center", va="bottom", color=INK)
    ax.text(3.0, zL + 0.15, "cell bed z_L", ha="center", color=INK2, fontsize=8)
    ax.text(7.0, zR - 0.45, "cell bed z_R", ha="center", color=INK2, fontsize=8)
    ax.text(5.15, zR + 0.12, "z* = max(z_L, z_R)", color=S2, fontsize=8, va="bottom")
    ax.annotate("", xy=(4.6, eta), xytext=(4.6, zR), arrowprops=dict(arrowstyle="<->", color=S2, lw=1.0))
    ax.text(4.5, 0.5 * (eta + zR), "h*_L = η_L − z*", ha="right", va="center", color=S2, fontsize=8)
    ax.text(5, 4.85, "face", ha="center", color=INK2, fontsize=8)
    save(fig, "fig4_recon.png")


# ---------------------------------------------------------------- Fig 5
def fig_user2():
    d = json.load(open(OUT + "user2_5s.json"))
    dt = d["dt"]
    t = np.arange(len(d["TW01290_dw"])) * dt / 3600.0
    m = (t >= 12.2) & (t <= 13.3)
    fig, ax = plt.subplots(figsize=(6.6, 3.5))
    ax.plot(t[m], np.array(d["TW01300_dw"])[m], color=MUTED, lw=1.0, ls=(0, (4, 2)), label="TW01300, the channel upstream (stock)")
    ax.plot(t[m], np.array(d["TW01290_dw"])[m], color=S1, lw=1.6, label="TW01290, stock dynamic wave")
    ax.plot(t[m], np.array(d["TW01290_fv"])[m], color=S2, lw=2.0, label="TW01290 as an FV link")
    ax.axhline(0, color=INK2, lw=0.7)
    ax.set_xlabel("Time since start (h)"); ax.set_ylabel("Flow (cfs)")
    i = int(np.argmax(d["TW01290_dw"]))
    ax.annotate("stock peak 1,921 cfs", xy=(t[i], d["TW01290_dw"][i]), xytext=(t[i] + 0.16, 1750),
                fontsize=7.6, color=INK, arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.7))
    ax.text(12.21, 190, "FV link: peak 449 cfs", fontsize=7.6, color=INK)
    ax.legend(loc="upper left", bbox_to_anchor=(0.0, -0.17), ncol=2, fontsize=7.4, handlelength=2.6,
              columnspacing=1.2)
    ax.set_title("EPA user2: TW01290 flow at a 5-s report step", loc="left")
    ax.set_ylim(-1000, 2050)
    save(fig, "fig5_user2.png")


# ---------------------------------------------------------------- Fig 6
def fig_refine():
    r = json.load(open(OUT + "refine.json"))
    cells = [1, 2, 4, 12, 48]
    y = [r["fv_J4_%d" % c] for c in cells]
    fig, ax = plt.subplots(figsize=(6.2, 2.9))
    ax.axhline(r["dw_J4"], color=MUTED, lw=1.2, ls=(0, (4, 2)))
    ax.text(48, r["dw_J4"] - 0.03, "stock dynamic wave 1.73 ft", ha="right", va="top", fontsize=7.6, color=INK2)
    ax.plot(cells, y, color=S1, lw=2.0, marker="o", ms=6, mec="white", mew=1.5)
    for c, v in zip(cells, y):
        ax.text(c, v + 0.025, "%.2f" % v, ha="center", va="bottom", fontsize=7.6, color=INK)
    ax.set_xscale("log"); ax.set_xticks(cells); ax.set_xticklabels([str(c) for c in cells])
    ax.minorticks_off()
    ax.set_ylim(1.6, 2.25)
    ax.set_xlabel("Cells in FV link C4 (300 ft; 12 cells is the 25-ft default)")
    ax.set_ylabel("Peak depth at J4 (ft)")
    ax.set_title("Head at the upstream end of an FV link falls with mesh refinement", loc="left")
    save(fig, "fig6_refine.png")


# ---------------------------------------------------------------- Fig 7
def fig_transect():
    a = np.loadtxt(OUT + "t179.txt")
    y, aswmm, afv = a[:, 0], a[:, 1], a[:, 2]
    def exact(h):
        if h <= 0.5: return 2 * h * h
        if h <= 0.565: return 0.5 + 2 * (h - 0.5) + 72 / 0.065 * (h - 0.5) ** 2
        return 0.5 + 0.13 + 72 / 0.065 * 0.065 ** 2 + 146 * (h - 0.565) + 5 / 14.435 * (h - 0.565) ** 2
    ex = np.array([exact(h) for h in y])
    nodes = np.loadtxt(OUT + "t179_nodes.txt", max_rows=13)
    m = y <= 0.62
    fig, ax = plt.subplots(figsize=(6.6, 3.2))
    ax.plot(y[m], ex[m], color=MUTED, lw=1.0, ls=(0, (4, 2)), label="transect geometry, exact")
    ax.plot(y[m], aswmm[m], color=S1, lw=1.4, label="SWMM 5.2.4 xsect_getAofY()")
    ax.plot(y[m], afv[m], color=S2, lw=2.0, label="FV link table (dips bridged)")
    k = nodes[:, 1] <= 0.62
    ax.plot(nodes[k, 1], nodes[k, 3], ls="none", marker="o", ms=5, color=S2, mec="white", mew=1.2)
    ax.set_xlim(0, 0.62); ax.set_ylim(-0.3, 12)
    ax.set_xlabel("Depth (ft)"); ax.set_ylabel("Flow area (ft²)")
    ax.set_title("EPA user5, transect 179: SWMM's area falls as depth rises", loc="left")
    ax.annotate("A(0.39 ft) = 3.25 ft²\nA(0.42 ft) = 0.24 ft²", xy=(0.42, 0.244), xytext=(0.12, 5.2),
                fontsize=7.6, color=INK, arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.7))
    ax.legend(loc="upper left", fontsize=7.4)
    save(fig, "fig7_transect.png")


# ---------------------------------------------------------------- Fig 8
def fig_timing():
    labels = ["Stock, network with one 10-ft pipe", "Same network, 10-ft pipe as FV link",
              "Stock, network without the short pipe"]
    # medians, minima and maxima from the two interleaved-timing results files
    import re
    R = RESULTS
    def stats(path, which):
        txt = open(R + path).read()
        m = re.findall(r"median ([\d.]+) s  min ([\d.]+) s  max ([\d.]+) s", txt)[which]
        return [float(v) for v in m]
    a, b, c = stats("timing_tree_short.txt", 0), stats("timing_tree_short.txt", 1), stats("timing_tree_vs_noshort.txt", 0)
    med = [a[0], b[0], c[0]]; lo = [a[1], b[1], c[1]]; hi = [a[2], b[2], c[2]]
    fig, ax = plt.subplots(figsize=(6.4, 2.3))
    yy = np.arange(3)[::-1]
    cols = [S1, S2, S1]
    ax.barh(yy, med, height=0.5, color=cols, edgecolor="white", linewidth=2)
    ax.errorbar(med, yy, xerr=[np.array(med) - lo, np.array(hi) - med], fmt="none", ecolor=INK2, elinewidth=0.9, capsize=3)
    ax.set_axisbelow(True)
    for v, h, yv in zip(["%.3f s" % m for m in med], hi, yy):
        ax.text(h + 0.08, yv, v, va="center", fontsize=8, color=INK)
    ax.set_yticks(yy); ax.set_yticklabels(labels, fontsize=8)
    ax.set_xlabel("Wall time, median of 7 interleaved runs (s); whiskers = min to max")
    ax.set_xlim(0, 1.25 * max(hi)); ax.grid(axis="y", visible=False)
    ax.set_title("400-pipe tree: one FV link frees the dynamic wave step", loc="left")
    save(fig, "fig8_timing.png")


# ---------------------------------------------------------------- Fig 9
def fig_resonator():
    d = json.load(open(OUT + "resonator.json"))
    dev = np.abs(np.array(d["dev"]))
    per = int(300 / d["dt"])
    env = np.array([dev[i:i + per].max() for i in range(0, len(dev), per)])
    te = (np.arange(len(env)) + 0.5) * 300 / 3600.0
    keep = env > 0
    fig, ax = plt.subplots(figsize=(6.2, 2.7))
    ax.plot(te[keep], env[keep], color=S1, lw=2.0, marker="o", ms=4, mec="white", mew=1.0)
    ax.set_yscale("log"); ax.set_ylim(3e-6, 0.1); ax.set_xlim(0, 4)
    ax.set_xlabel("Time (h)"); ax.set_ylabel("Largest |J1 head − 105 ft|\nin each 5 min (ft)")
    ax.text(2.55, 4.5e-5, "0 at .out precision\nfrom about 3.1 h", fontsize=7.6, color=INK2)
    ax.set_title("Manhole on a surcharged FV pipe, disturbed by 0.05 ft", loc="left")
    save(fig, "fig9_resonator.png")


for fn in (fig_profile, fig_step, fig_substep, fig_recon, fig_user2, fig_refine,
           fig_transect, fig_timing, fig_resonator):
    fn()
print("ok")
