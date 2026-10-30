#!/usr/bin/env python3
"""Lay out the two test suites used by the node-area experiment.

    python3 collect_models.py

models/synthetic   the ten networks from gen_models.py, plus two pyswmm files
models/regression  every DYNWAVE model in USEPA/swmm-nrtestsuite and in
                   pyswmm/tests/data (bad-input model excluded), at pinned
                   commits; each file is renamed <folder>__<file>.inp and the
                   data files beside it are copied too

The public models are fetched, not redistributed with this branch.
"""
import hashlib, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, "downloads")
SYN = os.path.join(HERE, "models", "synthetic")
REG = os.path.join(HERE, "models", "regression")

SOURCES = [
    ("swmm-nrtestsuite", "https://github.com/USEPA/swmm-nrtestsuite.git",
     "d23f9d6941b3244594070b44a18d84014917ff1b"),
    ("pyswmm", "https://github.com/pyswmm/pyswmm.git",
     "97cb36ff7820ba23ed6c09d9a38551aa619ea88a"),
]
IS_DW = re.compile(r"FLOW_ROUTING *DYNWAVE", re.I)


def fetch(name, url, sha):
    d = os.path.join(DL, name)
    if not os.path.isdir(os.path.join(d, ".git")):
        os.makedirs(d, exist_ok=True)
        subprocess.run(["git", "init", "-q", d], check=True)
        subprocess.run(["git", "-C", d, "remote", "add", "origin", url], check=True)
    subprocess.run(["git", "-C", d, "fetch", "-q", "--depth", "1", "origin", sha], check=True)
    subprocess.run(["git", "-C", d, "checkout", "-q", "--detach", sha], check=True)
    return d


def main():
    roots = {name: fetch(name, url, sha) for name, url, sha in SOURCES}

    # --- synthetic suite
    shutil.rmtree(SYN, ignore_errors=True)
    subprocess.run([sys.executable, os.path.join(HERE, "gen_models.py"), SYN], check=True)
    py = roots["pyswmm"]
    shutil.copy(os.path.join(py, "pyswmm", "tests", "data", "model_full_features.inp"), SYN)
    shutil.copy(os.path.join(py, "docs", "source", "examples", "swmm_example.inp"), SYN)

    # --- regression suite
    shutil.rmtree(REG, ignore_errors=True)
    os.makedirs(REG)
    seen, kept = set(), []
    for name in ("swmm-nrtestsuite", "pyswmm"):
        for dirpath, dirnames, files in os.walk(roots[name]):
            dirnames[:] = sorted(d for d in dirnames if d != ".git")
            for f in sorted(files):
                if not f.endswith(".inp") or "bad_input" in f:
                    continue
                p = os.path.join(dirpath, f)
                if not IS_DW.search(open(p, errors="ignore").read()):
                    continue
                h = hashlib.md5(open(p, "rb").read()).hexdigest()
                if h in seen:
                    continue
                seen.add(h)
                out = (os.path.basename(dirpath) + "__" + f).replace(" ", "_")
                shutil.copy(p, os.path.join(REG, out))
                kept.append(out)
                for g in os.listdir(dirpath):
                    src = os.path.join(dirpath, g)
                    if (os.path.isfile(src) and not g.endswith((".inp", ".out", ".rpt", ".json"))
                            and not os.path.exists(os.path.join(REG, g))):
                        shutil.copy(src, os.path.join(REG, g))
    print(f"synthetic: {len([f for f in os.listdir(SYN) if f.endswith('.inp')])} models in {SYN}")
    print(f"regression: {len(kept)} models in {REG}")


if __name__ == "__main__":
    main()
