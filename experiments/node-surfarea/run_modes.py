#!/usr/bin/env python3
"""Run every model in a folder with the reference engine and with each
node-area mode, and record flow routing continuity and instability.

    MODES=0,4,512 python3 run_modes.py models/regression runs/regression

Null control: mode 0 of the patched engine is byte-compared with the
unmodified EPA engine on every model.
Each run's working directory is the runs folder, so files a model writes
there (an LID report, for example) stay out of the source tree.
Writes runs/<suite>/summary.json and prints one row per model.
Env: MODES (comma list of bit-flag values, default 0,512), TMO (seconds per
run, default 150), REF / MOD (engine paths, default ./bin/runswmm_ref/_mod).
"""
import filecmp, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.abspath(os.environ.get("REF", os.path.join(HERE, "bin", "runswmm_ref")))
MOD = os.path.abspath(os.environ.get("MOD", os.path.join(HERE, "bin", "runswmm_mod")))
MODES = [int(x) for x in os.environ.get("MODES", "0,512").split(",")]
if 0 not in MODES:
    MODES.insert(0, 0)
TMO = float(os.environ.get("TMO", "150"))


def run(exe, inp, base, mode=None):
    env = dict(os.environ)
    env.pop("SWMM_NODEAREA", None)
    if mode is not None:
        env["SWMM_NODEAREA"] = str(mode)
    try:
        subprocess.run([exe, inp, base + ".rpt", base + ".out"], env=env,
                       cwd=os.path.dirname(base), timeout=TMO,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        open(base + ".rpt", "a").write("\nTIMEOUT ERROR\n")
    return base


def parse(rpt):
    try:
        t = open(rpt, errors="ignore").read()
    except FileNotFoundError:
        return None, 0, True
    m = re.search(r"Flow Routing Continuity.*?Continuity Error \(%\) \.+\s+(-?[\d.]+)", t, re.S)
    cont = float(m.group(1)) if m else None
    inst = re.search(r"Highest Flow Instability Indexes\s*\*+\s*(.*?)\n\s*\n", t, re.S)
    worst = max([int(x) for x in re.findall(r"\((\d+)\)", inst.group(1))] or [0]) if inst else 0
    return cont, worst, "ERROR" in t


def main(models_dir, runs_dir):
    models_dir, runs_dir = os.path.abspath(models_dir), os.path.abspath(runs_dir)
    os.makedirs(runs_dir, exist_ok=True)
    rows = []
    for f in sorted(os.listdir(models_dir)):
        if not f.endswith(".inp"):
            continue
        inp = os.path.join(models_dir, f)
        stem = os.path.join(runs_dir, f[:-4])
        r = {"model": f[:-4]}
        b = run(REF, inp, stem + ".ref")
        r["ref"] = parse(b + ".rpt")
        for mode in MODES:
            bm = run(MOD, inp, stem + f".m{mode}", mode)
            r[f"m{mode}"] = parse(bm + ".rpt")
        try:
            r["null_bytes_identical"] = filecmp.cmp(b + ".out", stem + ".m0.out", shallow=False)
        except FileNotFoundError:
            r["null_bytes_identical"] = False
        rows.append(r)

    c = lambda v: f"{v[0]:8.3f}" if v[0] is not None else "     n/a"
    print(f"{'model':32s} null {'ref':>8s}" + "".join(f"{'m' + str(m):>8s}" for m in MODES)
          + " | worst instability index per mode")
    for r in rows:
        print(f"{r['model']:32s} {'same' if r['null_bytes_identical'] else 'DIFF'} {c(r['ref'])}"
              + "".join(c(r[f"m{m}"]) for m in MODES)
              + " | " + "/".join(str(r[f"m{m}"][1]) for m in MODES)
              + ("  ERR" if any(r[f"m{m}"][2] for m in MODES) else ""))
    json.dump(rows, open(os.path.join(runs_dir, "summary.json"), "w"), indent=1)
    bad = [r["model"] for r in rows if not r["null_bytes_identical"]]
    print(f"null control: mode 0 byte-identical to EPA on {len(rows) - len(bad)} of {len(rows)}"
          + (f"; DIFFERS: {', '.join(bad)}" if bad else ""))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
