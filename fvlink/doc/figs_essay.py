"""Diagrams and charts for the essay "How Many Numbers Make a Pipe?" (US units).

Every chart reads the branch's own results or run outputs; every diagram is
labeled as a diagram, and the two toy calculations (dam break, oscillator)
say so in their captions.
usage: python3 docwork/figs_essay.py      (run from the repository root)
"""
import csv, json, math, os, re, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Polygon, Circle, FancyArrowPatch, Wedge

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from outread import read_out, series   # noqa: E402

OUT = os.path.join(ROOT, "docwork", "essayfigs") + "/"
os.makedirs(OUT, exist_ok=True)
R = os.path.join(ROOT, "results") + "/"
INK, INK2, MUTED, GRID = "#0b0b0b", "#52514e", "#8a8984", "#e4e3df"
S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"     # stock / FV / third series
WATER, PIPE, CELL = "#cde2fb", "#3a3a38", "#9cc3f0"
G = 32.2
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": MUTED,
    "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "axes.titlecolor": INK, "axes.titlesize": 10, "axes.titleweight": "bold",
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
    "grid.color": GRID, "grid.linewidth": 0.6, "legend.frameon": False,
    "savefig.dpi": 220, "savefig.bbox": "tight", "savefig.facecolor": "white",
})
RATIOS = {}


def save(fig, name):
    fig.savefig(OUT + name)
    plt.close(fig)
    from PIL import Image
    w, h = Image.open(OUT + name).size
    RATIOS[name] = round(h / w, 4)


def box(ax, x, y, w, h, text, fc="#eef4fc", ec=S1, fs=8, bold=False, tc=INK):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                                fc=fc, ec=ec, lw=1.2))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, color=tc,
            fontweight="bold" if bold else "normal")


def arrow(ax, x1, y1, x2, y2, color=INK2, lw=1.1, style="-|>", ms=9):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=ms,
                                 color=color, lw=lw, shrinkA=0, shrinkB=0))


def circ_geom(D, y):
    """exact circle: area and top width at depth y"""
    y = min(max(y, 1e-9), D - 1e-9)
    th = 2 * math.acos(1 - 2 * y / D)
    return D * D / 8 * (th - math.sin(th)), D * math.sin(th / 2)


def sections(path):
    sec, out = None, {}
    for line in open(path, encoding="latin-1"):
        s = line.split(";")[0].strip()
        if not s:
            continue
        if s.startswith("["):
            sec = s.upper(); out.setdefault(sec, []); continue
        if sec:
            out[sec].append(s.split())
    return out


# ============================================================ I
def e01_global_vs_link():
    fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.6))
    nodes = [(0, 1), (1.4, 1), (2.8, 1), (4.2, 1), (1.4, 2.1), (2.8, 0.0), (4.2, 2.1)]
    links = [(0, 1), (1, 2), (2, 3), (4, 1), (2, 5), (6, 3)]
    for ax, title, fvset in ((axs[0], "OpenSWMM: FLOW_ROUTING FV", set(range(len(links)))),
                             (axs[1], "swmm524-fvlink: [FV_LINKS] C3", {2})):
        ax.set_xlim(-0.4, 4.6); ax.set_ylim(-0.5, 2.6); ax.axis("off"); ax.set_aspect("equal")
        ax.set_title(title, loc="left", fontsize=9.5)
        for k, (a, b) in enumerate(links):
            (x1, y1), (x2, y2) = nodes[a], nodes[b]
            if k in fvset:
                n = 6
                for i in range(n):
                    t0, t1 = i / n, (i + 1) / n
                    ax.plot([x1 + (x2 - x1) * t0, x1 + (x2 - x1) * t1], [y1 + (y2 - y1) * t0, y1 + (y2 - y1) * t1],
                            color=S2 if i % 2 == 0 else "#f6b08f", lw=5.5, solid_capstyle="butt", zorder=2)
            else:
                ax.plot([x1, x2], [y1, y2], color=S1, lw=2.2, zorder=1)
        for x, y in nodes:
            ax.add_patch(Circle((x, y), 0.13, fc="white", ec=INK2, lw=1.2, zorder=3))
    axs[1].text(3.5, 0.78, "C3", fontsize=8, color=S2, ha="center", va="top")
    fig.text(0.13, 0.02, "blue: one flow per conduit (dynamic wave)      orange stripes: conduit cut into cells (finite volume)",
             fontsize=7.6, color=INK2)
    save(fig, "e01_global_vs_link.png")


# ============================================================ II
def e02_linknode():
    fig, axs = plt.subplots(2, 1, figsize=(6.6, 3.6), gridspec_kw={"height_ratios": [1.15, 1]})
    ax = axs[0]
    ax.set_xlim(-0.6, 10.6); ax.set_ylim(-0.4, 4.2); ax.axis("off")
    ax.set_title("What the water does in a 300-ft conduit", loc="left", fontsize=9.5)
    xs = np.linspace(0, 10, 200)
    bed = 1.2 - 0.06 * xs
    surf = bed + 1.3 + 0.55 * np.exp(-((xs - 3.2) / 1.8) ** 2) - 0.25 * xs / 10
    ax.fill_between(xs, bed, surf, color=WATER, lw=0)
    ax.plot(xs, bed, color=PIPE, lw=2); ax.plot(xs, bed + 2.3, color=PIPE, lw=2)
    ax.plot(xs, surf, color=S1, lw=1.2)
    for xq, lab in ((2.0, ""), (4.5, ""), (7.0, ""), (9.0, "")):
        yq = (np.interp(xq, xs, bed) + np.interp(xq, xs, surf)) / 2
        ln = 0.6 + 0.4 * math.exp(-((xq - 3.2) / 2.2) ** 2)
        arrow(ax, xq - ln / 2, yq, xq + ln / 2, yq, color=S1, lw=1.3)
    ax.text(5.2, 3.75, "depth and flow differ along the pipe; a wave travels through it", fontsize=7.8, color=INK2, ha="center")
    ax = axs[1]
    ax.set_xlim(-0.6, 10.6); ax.set_ylim(-0.3, 3.2); ax.axis("off")
    ax.set_title("What dynamic wave carries for it", loc="left", fontsize=9.5)
    for xn, lab in ((0, "H₁"), (10, "H₂")):
        ax.add_patch(Rectangle((xn - 0.35, 0.2), 0.7, 2.2, fc="#f2f1ee", ec=INK2, lw=1.1))
        ax.add_patch(Rectangle((xn - 0.35, 0.2), 0.7, 1.5 if xn == 0 else 1.0, fc=WATER, ec="none"))
        ax.text(xn, 2.65, lab, ha="center", fontsize=10, color=INK)
    ax.plot([0.35, 9.65], [1.0, 1.0], color=S1, lw=5, solid_capstyle="butt")
    ax.text(5, 1.45, "one flow Q", ha="center", fontsize=9, color=INK)
    ax.text(5, 0.35, "three numbers: two node heads and one conduit flow", ha="center", fontsize=7.8, color=INK2)
    fig.tight_layout()
    save(fig, "e02_linknode.png")


# ============================================================ III
def e03_tree():
    fig, ax = plt.subplots(figsize=(7.0, 2.7))
    ax.axis("off"); ax.set_aspect("equal")
    ax.set_title("The 400-pipe test tree (schematic, not to scale)", loc="left", fontsize=9.5)
    n = 40
    for i in range(n):
        x0, x1 = i, i + 1
        col, lw = (S2, 4.5) if i == 20 else (S1, 2.2)
        ax.plot([x0, x1], [0, 0], color=col, lw=lw, solid_capstyle="butt", zorder=2)
        sgn = 1 if i % 2 == 0 else -1
        ax.plot([x0, x0], [0, sgn * 4.5], color="#7fb0e8", lw=0.9, zorder=1)
        for k in range(1, 10):
            ax.plot([x0 - 0.12, x0 + 0.12], [sgn * k * 0.5, sgn * k * 0.5], color="#7fb0e8", lw=0.6, zorder=1)
    ax.add_patch(Polygon([[40, -0.45], [40.9, 0], [40, 0.45]], closed=True, fc=INK2, ec="none"))
    ax.text(41.2, 0, "outfall", va="center", fontsize=7.5, color=INK2)
    ax.annotate("CT21, the 10-ft trunk pipe (6-ft circle)", xy=(20.5, 0.12), xytext=(22.5, 5.6), fontsize=8, color=INK,
                arrowprops=dict(arrowstyle="-", color=S2, lw=0.9))
    ax.text(0, -5.6, "trunk: 40 pipes of 6-ft circle, 300 ft long except CT21     laterals: 9 pipes of 1.5-ft circle at each trunk junction",
            fontsize=7.3, color=INK2)
    ax.set_xlim(-1, 44); ax.set_ylim(-6.2, 6.4)
    save(fig, "e03_tree.png")


def e04_courant():
    s = sections(os.path.join(ROOT, "models", "tree_dw.inp"))
    L = {r[0]: float(r[3]) for r in s["[CONDUITS]"]}
    D = {r[0]: float(r[2]) for r in s["[XSECTIONS]"]}
    r = read_out(os.path.join(ROOT, "runs", "tree_dw.out"))
    ids = r["links"]; dep = r["link"][:, :, 1]; vel = r["link"][:, :, 2]
    tmin = {}
    for j, lid in enumerate(ids):
        best = np.inf
        for p in range(dep.shape[0]):
            y, v = dep[p, j], abs(vel[p, j])
            # stock getLinkStep() skips a conduit that is empty, full, or has
            # Froude number <= 0.01 (link_getFroude returns 0 when full)
            if y <= 1e-4 or D[lid] - y <= 1e-4 or v <= 1e-4:
                continue
            a, t = circ_geom(D[lid], y)
            c = math.sqrt(G * a / t)
            if v / c <= 0.01:
                continue
            best = min(best, 0.75 * L[lid] / (v + c))
        tmin[lid] = best
    vals = sorted(tmin.items(), key=lambda kv: kv[1])
    fig, ax = plt.subplots(figsize=(6.6, 2.9))
    xs = np.arange(len(vals))
    cols = [S2 if k == "CT21" else S1 for k, _ in vals]
    ax.scatter(xs, [v for _, v in vals], s=[26 if k == "CT21" else 6 for k, _ in vals], c=cols, zorder=3, lw=0)
    ax.set_yscale("log"); ax.set_ylim(0.3, 300)
    ax.axhline(10, color=MUTED, lw=0.9, ls="--"); ax.text(len(vals) * 0.62, 11.5, "largest step the model allows, 10 s", fontsize=7.5, color=INK2)
    ct = tmin["CT21"]
    ax.annotate("CT21: %.2f s" % ct, xy=(0, ct), xytext=(30, 0.42), fontsize=8, color=INK,
                arrowprops=dict(arrowstyle="-", color=S2, lw=0.8))
    nxt = vals[1][1]
    ax.text(len(vals) * 0.30, 2.0, "every other conduit: %.1f s or more" % nxt, fontsize=7.8, color=INK2)
    ax.set_xlabel("the 400 conduits, sorted"); ax.set_ylabel("shortest Courant time, 0.75·L/(v+c) (s)")
    ax.set_title("Each conduit's Courant limit at its tightest moment", loc="left")
    save(fig, "e04_courant.png")
    return ct, nxt


def step_freqs(rpt):
    t = open(rpt).read()
    blk = t[t.index("Time Step Frequencies"):].splitlines()[1:6]
    out = []
    for ln in blk:
        m = re.match(r"\s*([\d.]+)\s*-\s*([\d.]+)\s*sec\s*:\s*([\d.]+)", ln)
        out.append((float(m.group(1)), float(m.group(2)), float(m.group(3))))
    return out


def e05_stepfreq():
    runs = [("stock, with the 10-ft pipe", "tree_dw", S1), ("CT21 as an FV link", "tree_fv", S2),
            ("stock, without the 10-ft pipe", "tree_noshort_dw", S3)]
    data = [(lab, step_freqs(os.path.join(ROOT, "runs", f + ".rpt")), c) for lab, f, c in runs]
    bins = ["%.1f–%.1f s" % (b[1], b[0]) for b in data[0][1]]
    fig, ax = plt.subplots(figsize=(6.6, 2.8))
    x = np.arange(len(bins)); w = 0.26
    for k, (lab, fr, c) in enumerate(data):
        ax.bar(x + (k - 1) * w, [f[2] for f in fr], width=w - 0.03, color=c, label=lab, edgecolor="white", lw=0)
    ax.set_xticks(x); ax.set_xticklabels(bins)
    ax.set_ylabel("% of routing steps"); ax.set_ylim(0, 128); ax.set_yticks([0, 20, 40, 60, 80, 100]); ax.grid(axis="x", visible=False)
    ax.legend(loc="upper right", fontsize=7.6, ncol=1)
    ax.set_title("How long the routing steps were (SWMM's own report)", loc="left")
    save(fig, "e05_stepfreq.png")


# ============================================================ IV
def e06_ledger():
    fig, ax = plt.subplots(figsize=(6.8, 2.5))
    ax.set_xlim(-0.6, 10.6); ax.set_ylim(-1.3, 2.4); ax.axis("off")
    n = 5
    for i in range(n):
        x0 = 0.4 + i * 1.9
        ax.add_patch(Rectangle((x0, 0), 1.9, 1.3, fc=CELL, ec=PIPE, lw=1.2))
        ax.text(x0 + 0.95, 0.65, "cell %d" % (i + 1), ha="center", va="center", fontsize=8, color=INK)
    for i in range(n + 1):
        xf = 0.4 + i * 1.9
        arrow(ax, xf - 0.35, 1.65, xf + 0.35, 1.65, color=S2 if i in (0, n) else INK2, lw=1.3)
        ax.text(xf, 1.95, "F%d" % i, ha="center", fontsize=8.5, color=S2 if i in (0, n) else INK)
    ax.text(5.15, -0.45, "change in cell k  =  F(k−1) − F(k)        (what came in minus what went out)", ha="center", fontsize=8.3, color=INK)
    ax.text(5.15, -1.0, "sum over the cells  =  (F0 − F1) + (F1 − F2) + … + (F4 − F5)  =  F0 − F5", ha="center", fontsize=8.3, color=S2)
    save(fig, "e06_ledger.png")


def hll_step(h, q, dx, dt):
    n = len(h); u = np.where(h > 1e-9, q / np.maximum(h, 1e-12), 0.0); c = np.sqrt(G * h)
    F = np.zeros((n + 1, 2))
    for m in range(1, n):
        hl, hr, ul, ur, cl, cr = h[m - 1], h[m], u[m - 1], u[m], c[m - 1], c[m]
        sl = min(ul - cl, ur - cr); sr = max(ul + cl, ur + cr)
        fl = np.array([hl * ul, hl * ul * ul + 0.5 * G * hl * hl]); fr = np.array([hr * ur, hr * ur * ur + 0.5 * G * hr * hr])
        UL, UR = np.array([hl, hl * ul]), np.array([hr, hr * ur])
        if sl >= 0: F[m] = fl
        elif sr <= 0: F[m] = fr
        else: F[m] = (sr * fl - sl * fr + sl * sr * (UR - UL)) / (sr - sl)
    F[0] = [h[0] * u[0], h[0] * u[0] ** 2 + 0.5 * G * h[0] ** 2]
    F[n] = [h[-1] * u[-1], h[-1] * u[-1] ** 2 + 0.5 * G * h[-1] ** 2]
    h2 = h - dt / dx * (F[1:, 0] - F[:-1, 0]); q2 = q - dt / dx * (F[1:, 1] - F[:-1, 1])
    return h2, q2, np.max(np.abs(u) + c)


def stoker(x, t, hl, hr):
    cl = math.sqrt(G * hl)
    lo, hi = hr, hl
    for _ in range(200):
        hm = 0.5 * (lo + hi)
        f = 2 * (cl - math.sqrt(G * hm)) - (hm - hr) * math.sqrt(G / 2 * (hm + hr) / (hm * hr))
        lo, hi = (hm, hi) if f > 0 else (lo, hm)
    cm = math.sqrt(G * hm); um = 2 * (cl - cm); S = hm * um / (hm - hr)
    out = []
    for xi in x:
        z = xi / t
        if z <= -cl: out.append(hl)
        elif z <= um - cm: out.append((2 * cl - z) ** 2 / (9 * G))
        elif z <= S: out.append(hm)
        else: out.append(hr)
    return np.array(out), hm, um, S


def e07_dambreak():
    hl, hr, T = 2.0, 0.5, 30.0
    dx = 5.0; xc = np.arange(-500 + dx / 2, 500, dx)
    h = np.where(xc < 0, hl, hr); q = np.zeros_like(h); t = 0.0
    while t < T - 1e-12:
        _, _, smax = hll_step(h, q, dx, 1.0)
        dt = min(0.5 * dx / smax, T - t)
        h, q, _ = hll_step(h, q, dx, dt); t += dt
    xe = np.linspace(-500, 500, 2001); he, hm, um, S = stoker(xe, T, hl, hr)
    fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.6), sharey=True)
    ax = axs[0]
    ax.fill_between(xe, 0, np.where(xe < 0, hl, hr), color=WATER, lw=0); ax.plot(xe, np.where(xe < 0, hl, hr), color=S1, lw=1.6)
    ax.axvline(0, color=INK2, lw=2.2); ax.text(8, 2.25, "gate", fontsize=7.8, color=INK2)
    ax.set_title("Before: two states, one gate", loc="left"); ax.set_xlabel("distance (ft)"); ax.set_ylabel("depth (ft)")
    ax = axs[1]
    ax.fill_between(xe, 0, he, color=WATER, lw=0)
    ax.plot(xe, he, color=S1, lw=1.6, label="exact solution")
    ax.plot(xc, h, "o", ms=2.2, color=S2, label="HLL with Davis speeds, 5-ft cells")
    ax.set_title("After 30 s", loc="left"); ax.set_xlabel("distance (ft)")
    ax.legend(loc="upper right", fontsize=7.2)
    ax.set_ylim(0, 2.6)
    save(fig, "e07_dambreak.png")
    return hm, um, S


def e08_volbal():
    v = []
    for r in csv.DictReader(open(R + "suite.csv")):
        v.append(("suite", abs(float(r["fv_vol_bal_max_pct"]))))
    for r in csv.DictReader(open(R + "sweep.csv")):
        if r["status"] == "ran":
            v.append(("sweep", abs(float(r["fv_vol_bal_pct"]))))
    v.sort(key=lambda z: z[1])
    fig, ax = plt.subplots(figsize=(6.6, 2.6))
    x = np.arange(len(v)); y = [max(z[1], 1e-17) for z in v]
    ax.scatter(x, y, s=12, c=[S1 if z[0] == "sweep" else S3 for z in v], lw=0, zorder=3)
    ax.set_yscale("log"); ax.set_ylim(1e-17, 1e-9)
    ax.scatter([], [], s=12, c=S1, label="37 EPA models, one conduit FV"); ax.scatter([], [], s=12, c=S3, label="14 synthetic cases")
    ax.legend(loc="upper left", fontsize=7.4)
    ax.axhline(2.7e-12, color=MUTED, lw=0.8, ls="--"); ax.text(1, 4e-12, "largest: 2.7e-12 %", fontsize=7.5, color=INK2)
    ax.set_xlabel("the 51 runs, sorted"); ax.set_ylabel("|volume balance error| (%)")
    ax.set_title("Stored water vs water through the end faces, every FV link", loc="left")
    save(fig, "e08_volbal.png")
    return len(v), max(z[1] for z in v), sum(1 for z in v if z[1] == 0)


# ============================================================ V
def e09_lake():
    txt = open(R + "gates.txt").read()
    rows = [("stock dynamic wave", "lake_dw "), ("all four conduits FV", "lake_all_fv"), ("C4 only FV", "lake_C4 "),
            ("C1 only FV", "lake_C1 "), ("C2 only FV", "lake_C2 "), ("C3 only FV", "lake_C3 "), ("C2 and C3 FV", "lake_C2C3"),
            ("control: stock, one node +1e-7 ft", "lake_dw_seed")]
    vals = []
    for lab, key in rows:
        m = re.search(re.escape(key.strip()) + r"\s.*?max\|Q\|\s+([\d.e+-]+)", txt)
        vals.append((lab, float(m.group(1))))
    fig, ax = plt.subplots(figsize=(6.6, 2.9))
    y = np.arange(len(vals))[::-1]
    for yi, (lab, v) in zip(y, vals):
        col = S3 if "control" in lab else (S1 if "stock" in lab else S2)
        if v > 0:
            ax.barh(yi, v, color=col, height=0.6, left=1e-13)
            ax.text(v * 1.4, yi, "%.2g cfs" % v, va="center", fontsize=7.5, color=INK)
        else:
            ax.text(2e-13, yi, "exactly 0", va="center", fontsize=7.5, color=INK2)
    ax.set_xscale("log"); ax.set_xlim(1e-13, 1); ax.set_yticks(y); ax.set_yticklabels([v[0] for v in vals], fontsize=8)
    ax.grid(axis="y", visible=False); ax.set_xlabel("largest |flow| anywhere in 2 h (cfs, log scale)")
    ax.set_title("A pond at rest: how much does it move?", loc="left")
    save(fig, "e09_lake.png")
    return vals


# ============================================================ VI
def e10_slot():
    d = np.loadtxt(os.path.join(ROOT, "docwork", "wavespeed_circ3.txt"))
    fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.9), gridspec_kw={"width_ratios": [0.85, 1.4]})
    ax = axs[0]; ax.set_aspect("equal"); ax.axis("off")
    ax.set_xlim(-2.0, 2.0); ax.set_ylim(-1.8, 2.9)
    ax.add_patch(Circle((0, 0), 1.5, fc=WATER, ec=PIPE, lw=2))
    sw = 0.18
    ax.add_patch(Rectangle((-sw / 2, 1.45), sw, 1.15, fc=WATER, ec=PIPE, lw=1.2))
    ax.text(0.25, 2.3, "slot", fontsize=8, color=INK)
    ax.text(0, -0.1, "full 3-ft pipe\nA = 7.07 ft²", ha="center", fontsize=7.6, color=INK)
    ax.text(0, -2.1, "slot drawn about 8× wider than scale\n(true width 0.0228 ft)", ha="center", fontsize=7, color=INK2)
    ax.set_title("Preissmann's fiction", loc="left", fontsize=9.5)
    ax = axs[1]
    y, c = d[:, 0] / 3.0, d[:, 3]
    below = y <= 1.0
    ax.plot(y[below], c[below], color=S1, lw=1.6, label="open channel: √(g·A/T)")
    ax.plot(y[~below], c[~below], color=S2, lw=1.8, label="above the crown: the slot")
    ax.axvline(1.0, color=MUTED, lw=0.8, ls="--"); ax.text(1.01, 60, "crown", fontsize=7.5, color=INK2)
    ax.set_xlabel("depth / pipe diameter"); ax.set_ylabel("wave speed c (ft/s)")
    ax.set_ylim(0, 115); ax.set_xlim(0, 1.25)
    ax.legend(loc="upper left", fontsize=7.4)
    ax.set_title("Wave speed in the FV link's own table", loc="left")
    save(fig, "e10_slot.png")
    return float(c[below][:-1].max())


def e11_substep():
    dx = np.logspace(math.log10(0.3), math.log10(60), 200)
    fig, ax = plt.subplots(figsize=(6.6, 2.9))
    for s, col, lab in ((14.3, S1, "fastest wave 14.3 ft/s (CT21 at its peak)"), (100.0, S2, "fastest wave 100 ft/s (a full pipe's slot)")):
        ax.plot(dx, 0.5 * dx / s, color=col, lw=1.6, label=lab)
    pts = [("CT21, 2.5-ft cells: 0.0878 s", 2.5, 0.0878, S1, (0.45, 2.6)), ("extran10, 25-ft cells, full: 0.115 s", 25.0, 0.1150, S2, (0.42, 0.16)),
           ("user4, 0.47-ft cells: 0.0053 s", 0.47, 0.0053, INK2, (1.5, 0.75))]
    for lab, x, y, col, (fx, fy) in pts:
        ax.plot(x, y, "o", ms=6, color=col, mec="white", mew=1.0, zorder=4)
        ax.annotate(lab, xy=(x, y), xytext=(x * fx, y * fy), fontsize=7.4, color=INK,
                    arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.6))
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("cell length Δx (ft)"); ax.set_ylabel("substep, 0.5·Δx / s (s)")
    ax.legend(loc="upper left", fontsize=7.4)
    ax.set_title("Short cells and fast waves make short substeps", loc="left")
    save(fig, "e11_substep.png")


# ============================================================ VII
def e12_ghost():
    fig, ax = plt.subplots(figsize=(7.0, 2.9))
    ax.set_xlim(-0.5, 12.7); ax.set_ylim(-1.1, 4.1); ax.axis("off")
    ax.add_patch(Rectangle((0, 0), 1.6, 3.4, fc="#f2f1ee", ec=INK2, lw=1.2))
    ax.add_patch(Rectangle((0, 0), 1.6, 2.4, fc=WATER, ec="none"))
    ax.text(0.8, 3.6, "node J4", ha="center", fontsize=8.5, color=INK)
    ax.plot([0, 1.6], [2.4, 2.4], color=S1, lw=1.4)
    ax.add_patch(Rectangle((1.6, 0.2), 1.9, 2.2, fc="none", ec=S2, lw=1.4, ls="--"))
    ax.text(2.55, 2.75, "ghost", ha="center", fontsize=8.5, color=S2, fontweight="bold")
    ax.text(2.55, 1.35, "surface =\nnode head", ha="center", fontsize=7.6, color=INK)
    for i in range(3):
        x0 = 3.5 + i * 1.9
        ax.add_patch(Rectangle((x0, 0.2), 1.9, 1.5 - 0.15 * i, fc=CELL, ec=PIPE, lw=1.1))
        ax.text(x0 + 0.95, 0.75, "cell %d" % (i + 1), ha="center", fontsize=7.8, color=INK)
    ax.plot([3.5, 9.2], [2.4, 2.4], color=PIPE, lw=1.6); ax.plot([3.5, 9.2], [0.2, 0.2], color=PIPE, lw=1.6)
    arrow(ax, 4.1, 1.9, 5.0, 1.9, color=S1, lw=1.5); ax.text(4.55, 2.05, "v", fontsize=8, color=S1, ha="center")
    arrow(ax, 1.95, 1.9, 2.85, 1.9, color=S2, lw=1.5); ax.text(2.4, 2.05, "same v", fontsize=7.5, color=S2, ha="center")
    ax.annotate("end face: solved like any\nother face, ghost vs cell 1", xy=(3.5, 1.0), xytext=(5.6, -0.85), fontsize=7.6,
                color=INK, arrowprops=dict(arrowstyle="-", color=INK2, lw=0.8))
    box(ax, 9.6, 2.2, 2.9, 1.3, "LOCAL node\nkeeps its own books\nduring the subcycle", fs=7.2)
    box(ax, 9.6, 0.25, 2.9, 1.5, "PRESCRIBED node\n(outfall, or surcharged\nunder EXTRAN):\nfollows dynamic wave", fs=7.2, fc="#fdf0e8", ec=S2)
    save(fig, "e12_ghost.png")


def e13_fvl1():
    vals = [("first draft: ghost velocity 0", 8.83, S2), ("ghost takes the cell's velocity", 1.92, S1), ("stock dynamic wave", 1.73, S3)]
    fig, ax = plt.subplots(figsize=(6.0, 2.1))
    y = np.arange(3)[::-1]
    for yi, (lab, v, c) in zip(y, vals):
        ax.barh(yi, v, color=c, height=0.55)
        ax.text(v + 0.12, yi, "%.2f ft" % v, va="center", fontsize=8, color=INK)
    ax.set_yticks(y); ax.set_yticklabels([v[0] for v in vals], fontsize=8); ax.set_xlim(0, 10.3)
    ax.grid(axis="y", visible=False); ax.set_xlabel("peak depth at J4, upstream of FV link C4 (ft)")
    ax.set_title("One line of code: the still-water ghost (FVL-1)", loc="left")
    save(fig, "e13_fvl1.png")


def e14_euler():
    As, Ap, Lp = 12.566, math.pi * 1.5 ** 2, 300.0
    w2 = G * Ap / (Lp * As); dt, T = 0.2, 600
    n = int(T / dt)
    H = [0.05]; Q = [0.0]; H2 = [0.05]; Q2 = [0.0]
    for _ in range(n):
        h, q = H[-1], Q[-1]
        H.append(h - dt * q / As); Q.append(q + dt * G * Ap / Lp * h)
        h, q = H2[-1], Q2[-1]
        # backward Euler for the pair (implicit in both)
        hn = (h - dt * q / As) / (1 + dt * dt * w2)
        H2.append(hn); Q2.append(q + dt * G * Ap / Lp * hn)
    t = np.arange(n + 1) * dt / 60
    fig, ax = plt.subplots(figsize=(6.6, 2.7))
    ax.plot(t, H, color=S2, lw=1.0, label="forward Euler: each push adds a little energy")
    ax.plot(t, H2, color=S1, lw=1.2, label="looking ahead (implicit): each step takes a little away")
    ax.axhline(0, color=MUTED, lw=0.6)
    ax.set_xlabel("time (min)"); ax.set_ylabel("manhole level above rest (ft)")
    ax.legend(loc="upper left", fontsize=7.3)
    ax.set_title("A manhole on a pipe is a weight on a spring (toy model, 0.2-s steps)", loc="left")
    save(fig, "e14_euler.png")
    return 2 * math.pi / math.sqrt(w2), H[-1], max(abs(np.array(H[-61:])))


def e15_passes():
    txt = open(R + "pass_count.txt").read()
    def nums(block):
        m = re.search(r"accepted on pass 1: ([\d,]+)\s+pass 2: ([\d,]+)\s+pass 3: ([\d,]+)\s+pass 4: ([\d,]+)\s+exhausted: (\d+)", block, re.S)
        return [int(g.replace(",", "")) for g in m.groups()]
    parts = txt.split("37 EPA sweep runs")
    a, b = nums(parts[0]), nums(parts[1])
    labs = ["1st estimate", "2nd", "3rd", "4th", "ran out"]
    fig, ax = plt.subplots(figsize=(6.6, 2.7))
    x = np.arange(5); w = 0.38
    for k, (vals, col, lab) in enumerate(((a, S3, "38 test-network runs, 3.7 million substeps"),
                                           (b, S1, "37 EPA sweep runs, 17.9 million substeps"))):
        vv = [max(v, 0.6) for v in vals]
        ax.bar(x + (k - 0.5) * w, vv, width=w - 0.04, color=col, label=lab)
        for xi, v in zip(x, vals):
            ax.text(xi + (k - 0.5) * w, max(v, 0.6) * 1.3, "{:,}".format(v), ha="center", fontsize=6.6, color=INK)
    ax.set_yscale("log"); ax.set_ylim(0.5, 1e9); ax.set_xticks(x); ax.set_xticklabels(labs)
    ax.grid(axis="x", visible=False); ax.set_ylabel("substeps (log scale)")
    ax.legend(loc="upper right", fontsize=7.3)
    ax.set_title("On which node estimate was each substep accepted?", loc="left")
    save(fig, "e15_passes.png")
    return a, b


# ============================================================ VIII
def e16_booking():
    t = np.linspace(0, 1, 400)
    qo, qn = 4.0, 6.5
    other = qo + (qn - qo) * t
    fv = 3.0 + 1.2 * np.sin(5.5 * t + 0.4) + 0.8 * t
    fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.6), sharey=True)
    ax = axs[0]
    ax.fill_between(t, 0, other, color="#d7e7fa", lw=0); ax.plot(t, other, color=S1, lw=1.6)
    ax.plot([0, 1], [qo, qn], "o", color=S1, ms=4)
    ax.set_title("Other links: trapezoid", loc="left"); ax.set_xlabel("time within one routing step")
    ax.set_ylabel("flow into the node (illustration)")
    ax.text(0.5, 1.6, "½·(Q_old + Q_new)·Δt", ha="center", fontsize=8, color=INK)
    ax = axs[1]
    ts = np.linspace(0, 1, 13); fs = np.interp(ts, t, fv)
    ax.fill_between(ts, 0, fs, step="post", color="#fbe0d2", lw=0)
    ax.step(ts, fs, where="post", color=S2, lw=1.4)
    ax.plot([0, 1], [fv[0], fv[-1]], color=MUTED, lw=0.9, ls="--")
    ax.text(0.5, 1.2, "exactly the volume that\ncrossed the end face", ha="center", fontsize=8, color=INK)
    ax.text(0.98, fv[-1] + 0.25, "trapezoid would\nuse this line", ha="right", fontsize=7, color=INK2)
    ax.set_title("FV links: substep by substep", loc="left"); ax.set_xlabel("time within one routing step")
    for a_ in axs:
        a_.set_xticks([]); a_.set_ylim(0, 7.5)
    save(fig, "e16_booking.png")


def e17_quality():
    vals = [("FV, first version", -38402.0, S2), ("FV, delivered flow", 0.093, S1), ("stock dynamic wave", -0.036, S3)]
    fig, ax = plt.subplots(figsize=(6.2, 2.2))
    y = np.arange(3)[::-1]
    for yi, (lab, v, c) in zip(y, vals):
        ax.barh(yi, v, color=c, height=0.55)
        if v < -100:
            ax.text(-3e3, yi, "{:,.0f} %".format(v), va="center", ha="center", fontsize=8.5, color="white", fontweight="bold")
        else:
            ax.text(v * 1.25 if v < 0 else v * 1.6 + 0.02, yi, "%.3f %%" % v,
                    va="center", ha="right" if v < 0 else "left", fontsize=8, color=INK)
    ax.set_xscale("symlog", linthresh=0.1); ax.set_xlim(-2e5, 30)
    ax.axvline(0, color=INK2, lw=0.8)
    ax.set_yticks(y); ax.set_yticklabels([v[0] for v in vals], fontsize=8); ax.grid(axis="y", visible=False)
    ax.set_xlabel("quality continuity error (%, symmetric log scale)")
    ax.set_title("One pollutant, two FV links: the storage counted twice (FVL-8)", loc="left")
    save(fig, "e17_quality.png")


# ============================================================ IX
def e18_closure():
    rows = []
    for ln in open(R + "closure.txt"):
        m = re.match(r"(\S+(?: \d)?)\s+round-trip ([\d.e+-]+) ft \| dA/dh vs W ([\d.e+-]+) \| dI1/dh vs A ([\d.e+-]+) \| area vs SWMM at nodes ([\d.e+-]+), between ([\d.e+-]+)", ln)
        if m:
            rows.append((m.group(1), *[float(g) for g in m.groups()[1:]]))
    names = [r[0].replace("_", " ").title().replace("Rect ", "Rect. ") for r in rows]
    fig, ax = plt.subplots(figsize=(6.8, 3.0))
    x = np.arange(len(rows)); w = 0.26
    series_ = [("depth(area(h)) − h  (ft)", 1, S1), ("dA/dh vs width", 2, S2), ("dI₁/dh vs area", 3, S3)]
    for k, (lab, col_i, c) in enumerate(series_):
        ax.bar(x + (k - 1) * w, [max(r[col_i], 1e-18) for r in rows], width=w - 0.03, color=c, label=lab)
    ax.set_yscale("log"); ax.set_ylim(1e-18, 1e-6)
    ax.set_xticks(x); ax.set_xticklabels(names, rotation=35, ha="right", fontsize=7.4)
    ax.grid(axis="x", visible=False); ax.set_ylabel("largest disagreement (log scale)")
    ax.legend(loc="upper left", fontsize=7.2, ncol=3)
    ax.set_title("Geometry closure for eleven of SWMM's shapes", loc="left", pad=6)
    save(fig, "e18_closure.png")
    return max(r[1] for r in rows)


# ============================================================ X
def turns(q):
    n, k = 0, 0
    for dq in np.diff(q):
        s = int(np.sign(dq))
        if abs(dq) > 0.001 and k * s < 0: n += 1
        k = s
    return n


def e19_turns():
    d = json.load(open(os.path.join(ROOT, "docwork", "user2_5s.json")))
    qd, qf = np.array(d["TW01290_dw"]), np.array(d["TW01290_fv"])
    td, tf = turns(qd), turns(qf)
    vd, vf = np.abs(np.diff(qd)).sum(), np.abs(np.diff(qf)).sum()
    fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.4))
    for ax, vals, title, fmt in ((axs[0], (td, tf), "How often the flow turns", "{:,.0f}"),
                                 (axs[1], (vd, vf), "How far the flow travels (total variation, cfs)", "{:,.0f}")):
        ax.bar([0, 1], vals, color=[S1, S2], width=0.55)
        for xi, v in enumerate(vals):
            ax.text(xi, v * 1.02 + max(vals) * 0.02, fmt.format(v), ha="center", fontsize=8.5, color=INK)
        ax.set_xticks([0, 1]); ax.set_xticklabels(["stock", "FV link"]); ax.grid(axis="x", visible=False)
        ax.set_ylim(0, max(vals) * 1.22); ax.set_title(title, loc="left", fontsize=9.2)
    axs[0].axhline(173, color=MUTED, lw=0.8, ls="--"); axs[0].text(-0.3, 182, "index passes 1 at about 173", fontsize=7, color=INK2, va="bottom", ha="left")
    fig.suptitle("EPA user2, TW01290, every 5-s step: SWMM's instability index counts the left panel", x=0.02, ha="left",
                 fontsize=9.5, fontweight="bold", y=1.04)
    save(fig, "e19_turns.png")
    return td, tf, vd, vf


def e20_user5():
    rd = read_out(os.path.join(ROOT, "work", "osc", "user5_dw.out")); rf = read_out(os.path.join(ROOT, "work", "osc", "user5_fv.out"))
    qd, qf = series(rd, "link", "LIB_9", 0), series(rf, "link", "LIB_9", 0)
    t = (np.arange(len(qd)) + 1) * rd["report_step"] / 3600.0
    fig, ax = plt.subplots(figsize=(6.8, 2.8))
    m = t <= 2.2
    ax.plot(t[m], qd[m], color=S1, lw=0.6, label="stock dynamic wave")
    ax.plot(t[m], qf[m], color=S2, lw=1.0, label="LIB_9 as an FV link")
    ax.axhline(0, color=INK2, lw=0.6)
    ax.set_xlabel("time (h)"); ax.set_ylabel("flow in LIB_9 (cfs)")
    ax.legend(loc="upper right", fontsize=7.4)
    ax.set_title("EPA user5, channel LIB_9, reported every second", loc="left")
    save(fig, "e20_user5.png")
    return qd.min(), qf.min()


def e21_treepeaks():
    a = read_out(os.path.join(ROOT, "runs", "tree_dw.out")); b = read_out(os.path.join(ROOT, "runs", "tree_fv.out"))
    pa = np.abs(a["link"][:, :, 0]).max(axis=0); pb = np.abs(b["link"][:, :, 0]).max(axis=0)
    ch = 100 * np.abs(pb - pa) / pa
    na = a["node"][:, :, 0].max(axis=0); nb = b["node"][:, :, 0].max(axis=0)
    ok = na > 0.001
    nch = 100 * np.abs(nb[ok] - na[ok]) / na[ok]
    fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.5), sharey=False)
    bins = np.linspace(0, 1.0, 26)
    axs[0].hist(ch, bins=bins, color=S1, edgecolor="white", lw=0.6)
    axs[0].set_title("400 conduits: |change in peak flow|", loc="left", fontsize=9.2); axs[0].set_xlabel("%")
    axs[1].hist(nch, bins=bins, color=S3, edgecolor="white", lw=0.6)
    axs[1].set_title("%d nodes: |change in peak depth|" % ok.sum(), loc="left", fontsize=9.2); axs[1].set_xlabel("%")
    axs[0].set_ylabel("count")
    for ax in axs: ax.grid(axis="x", visible=False)
    save(fig, "e21_treepeaks.png")
    return ch.max(), np.median(ch), nch.max()


def e22_sweeppeaks():
    rows = [r for r in csv.DictReader(open(R + "sweep.csv")) if r["status"] == "ran"]
    v = sorted(((r["model"], float(r["fv_link_peak_pct"])) for r in rows), key=lambda z: z[1])
    fig, ax = plt.subplots(figsize=(6.8, 2.9))
    x = np.arange(len(v))
    cols = [S2 if abs(p) > 5 else S1 for _, p in v]
    ax.scatter(x, [p for _, p in v], c=cols, s=16, lw=0, zorder=3)
    ax.set_yscale("symlog", linthresh=1.0); ax.set_ylim(-150, 60)
    ax.axhline(0, color=INK2, lw=0.6)
    for xi, (mname, p) in enumerate(v):
        if abs(p) > 5:
            ax.annotate("%s %+.0f %%" % (mname, p), xy=(xi, p), xytext=(xi + (2 if p < 0 else -2), p * (1.5 if p < 0 else 1.6)),
                        fontsize=7.2, color=INK, ha="left" if p < 0 else "right", arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.6))
    ax.set_xlabel("37 EPA models, sorted"); ax.set_ylabel("change in the flagged\nconduit's peak flow (%)")
    ax.set_title("One conduit FV in each EPA model: how much its peak moved", loc="left")
    save(fig, "e22_sweeppeaks.png")


# ============================================================ XI
def e23_substeps():
    rows = [r for r in csv.DictReader(open(R + "sweep.csv")) if r["status"] == "ran"]
    v = sorted(((r["model"], float(r["fv_substeps_per_step"])) for r in rows), key=lambda z: z[1])
    fig, ax = plt.subplots(figsize=(6.8, 2.8))
    x = np.arange(len(v))
    cols = [S2 if m in ("user4", "extran10") else S1 for m, _ in v]
    ax.bar(x, [s for _, s in v], color=cols, width=0.75)
    ax.set_yscale("log"); ax.set_ylim(1, 3000)
    for xi, (m, s) in enumerate(v):
        if m in ("user4", "extran10"):
            ax.text(xi - 0.6 if m == "user4" else xi + 0.4, s * 1.25, m, ha="right" if m == "user4" else "left",
                    fontsize=7.4, color=INK, rotation=0)
    ax.set_xlim(-1, len(v) + 3)
    ax.set_xticks([]); ax.grid(axis="x", visible=False)
    ax.set_xlabel("37 EPA models, sorted"); ax.set_ylabel("FV substeps per routing step")
    ax.set_title("The price of the subcycle", loc="left")
    save(fig, "e23_substeps.png")


# ============================================================ XII
def e24_defects():
    D = [("FVL-1", "still-water ghost", "me"), ("FVL-2", "pumped manhole oscillation", "me"),
         ("FVL-3", "flow reported from cell momentum", "me"), ("FVL-4", "slot counted as conveyance", "me"),
         ("FVL-5", "positivity from half-scaled fluxes", "me"), ("FVL-6", "pumps read the wrong inflow", "review"),
         ("FVL-7", "gated outfall let water back in", "review"), ("FVL-8", "quality storage counted twice", "review"),
         ("FVL-9", "long link name overflowed a line", "review"), ("FVL-10", "node limit ignored outflows", "review"),
         ("FVL-11", "flat area segment, infinite speed", "me"), ("FVL-12", "report rule two columns off", "me"),
         ("FVL-13", "last substep cut went unrecorded", "check"), ("FVL-14", "report showed a lengthening ratio", "check")]
    col = {"me": S1, "review": S2, "check": S3}
    fig, ax = plt.subplots(figsize=(7.0, 3.4))
    ax.axis("off"); ax.set_xlim(0, 14.6); ax.set_ylim(-1.6, 3.2)
    for i, (k, lab, who) in enumerate(D):
        ax.add_patch(FancyBboxPatch((i + 0.08, 0), 0.84, 0.84, boxstyle="round,pad=0.01,rounding_size=0.1", fc=col[who], ec="none"))
        ax.text(i + 0.5, 0.42, k.replace("FVL-", ""), ha="center", va="center", fontsize=9, color="white", fontweight="bold")
        ax.text(i + 0.5, 1.0, lab, rotation=55, ha="left", va="bottom", fontsize=6.9, color=INK, rotation_mode="anchor")
    ax.text(0, -0.45, "in the order found  →", fontsize=7.4, color=INK2)
    for j, (who, lab) in enumerate((("me", "found by Claude while building, testing and writing (7)"), ("review", "found by an independent review agent (5)"),
                                    ("check", "found by checking the written description (2)"))):
        ax.add_patch(Rectangle((5.2, -0.62 - j * 0.42), 0.28, 0.28, fc=col[who], ec="none"))
        ax.text(5.6, -0.48 - j * 0.42, lab, va="center", fontsize=7.4, color=INK)
    save(fig, "e24_defects.png")


if __name__ == "__main__":
    info = {}
    e01_global_vs_link(); e02_linknode(); e03_tree()
    info["courant"] = e04_courant(); e05_stepfreq(); e06_ledger()
    info["dambreak"] = e07_dambreak(); info["volbal"] = e08_volbal(); info["lake"] = e09_lake()
    info["cmax_below_crown"] = e10_slot(); e11_substep(); e12_ghost(); e13_fvl1()
    info["euler"] = e14_euler(); info["passes"] = e15_passes(); e16_booking(); e17_quality()
    info["closure_max_roundtrip"] = e18_closure(); info["turns"] = e19_turns(); info["user5_min"] = e20_user5()
    info["treepeaks"] = e21_treepeaks(); e22_sweeppeaks(); e23_substeps(); e24_defects()
    json.dump({"ratios": RATIOS, "info": info}, open(OUT + "figinfo.json", "w"), indent=1, default=float)
    print(json.dumps(info, indent=1, default=float))
