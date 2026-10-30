"""Fine-step comparison of one channel, stock vs. the same channel as an FV link.

Writes the numbers quoted for EPA user2 (TW01290, 5-s report step) and
user5 (LIB_9, 1-s report step).

usage: python3 scripts/oscillation.py <stock_exe> <fv_exe> <nrtest_user_dir> <work_dir> <out_txt>
"""
import os, re, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from outread import read_out, series   # noqa: E402
STOCK, FV, U, WORK, TXT = sys.argv[1:6]
os.makedirs(WORK, exist_ok=True)
# (model, link, report step, neighbours to report, report step == routing step)
CASES = [("user2", "TW01290", "00:00:05", ("TW01300", "TW01280"), True),
         ("user5", "LIB_9", "00:00:01", (), False)]

def turns(q):
    """Flow turns as stats.c counts them: sign changes of the step-to-step
    change in flow dq, counted when |dq| > 0.001 cfs."""
    n, k = 0, 0
    for dq in np.diff(q):
        s = int(np.sign(dq))
        if abs(dq) > 0.001 and k * s < 0:
            n += 1
        k = s
    return n


def outflow(rpt):
    t = open(rpt, encoding="latin-1").read()
    blk = t[t.index("Flow Routing Continuity"):]
    return float(re.search(r"External Outflow \.+\s+(-?[\d.]+)", blk).group(1))


def rpt_items(rpt):
    t = open(rpt, encoding="latin-1").read()
    cont = re.findall(r"Flow Routing Continuity.*?Continuity Error \(%\) \.+\s+(-?[\d.]+)", t, re.S)
    inst = re.search(r"Highest Flow Instability Indexes\s*\n\s*\*+\s*\n(.*?)\n\s*\n", t, re.S)
    return (cont[0] if cont else "?"), (" ".join(inst.group(1).split()) if inst else "?")

lines = []
for model, link, step, others, every_step in CASES:
    src = open(os.path.join(U, model + ".inp"), encoding="latin-1").read()
    src, nsub = re.subn(r"(?m)^(\s*REPORT_STEP\s+)\S+", r"\g<1>" + step, src)
    assert nsub == 1, model
    res = {}
    for tag, exe, txt in (("dw", STOCK, src), ("fv", FV, src + "\n\n[FV_LINKS]\n" + link + "\n")):
        inp = os.path.join(U, "zz_%s_%s.inp" % (model, tag))
        open(inp, "w", encoding="latin-1").write(txt)
        rpt, out = (os.path.join(WORK, "%s_%s.%s" % (model, tag, e)) for e in ("rpt", "out"))
        subprocess.run([exe, os.path.basename(inp), rpt, out], cwd=U, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.remove(inp)
        res[tag] = (read_out(out), rpt_items(rpt), outflow(rpt))
    dt = res["dw"][0]["report_step"]
    lines.append("%s, link %s, report step %d s" % (model, link, dt))
    for tag in ("dw", "fv"):
        r, (cont, inst), _ = res[tag]
        q = series(r, "link", link, 0)
        t = (np.arange(len(q)) + 1) * dt / 3600.0
        neg = np.where(q < 0)[0]
        span = "%.2f-%.2f h" % (t[neg[0]], t[neg[-1]]) if len(neg) else "none"
        lines.append("  %s  peak %.1f cfs  min %.4f cfs  reversed periods %d (%d s, span %s)  volume upstream %.4f ft3"
                     % ("stock" if tag == "dw" else "FV   ", q.max(), q.min(), len(neg), len(neg) * dt, span, -q[q < 0].sum() * dt))
        lines.append("         net volume %.5e ft3  total variation %.0f cfs  routing continuity %s %%  instability: %s"
                     % (q.sum() * dt, np.abs(np.diff(q)).sum(), cont, inst))
        nt = turns(q)
        if every_step:
            lines.append("         flow turns %d; the series is every routing step, so SWMM's index = %.2f"
                         % (nt, nt * 100.0 / (2.0 / 3.0 * (len(q) - 2))))
        else:
            lines.append("         flow turns in this %d-s series %d (routing step is shorter)" % (dt, nt))
        for o in others:
            lines.append("         %s peak %.1f cfs" % (o, series(r, "link", o, 0).max()))
    qd, qf = series(res["dw"][0], "link", link, 0), series(res["fv"][0], "link", link, 0)
    big = np.where(np.abs(qd - qf) > 100.0)[0]
    if len(big):
        tt = (np.arange(len(qd)) + 1) * dt / 60.0
        lines.append("  |stock - FV| > 100 cfs from %.1f to %.1f min (a %.1f-min window), in %d periods = %.1f min in all"
                     % (tt[big[0]], tt[big[-1]], tt[big[-1]] - tt[big[0]], len(big), len(big) * dt / 60.0))
    lines.append("  net volume FV/stock - 1: %+.3f %%" % (100 * (qf.sum() / qd.sum() - 1)))
    lines.append("  system external outflow FV/stock - 1: %+.3f %%  (%.3f vs %.3f, report units)"
                 % (100 * (res["fv"][2] / res["dw"][2] - 1), res["fv"][2], res["dw"][2]))
    lines.append("")
open(TXT, "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
