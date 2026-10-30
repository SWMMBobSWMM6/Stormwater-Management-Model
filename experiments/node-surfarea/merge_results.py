#!/usr/bin/env python3
"""Merge runs/synthetic and runs/regression into one continuity table.

    python3 merge_results.py runs/node-area-results.csv
"""
import csv, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = {
    0: "EPA 5.2.4 (mode 0)",
    1: "m1 manhole added+booked",
    2: "m2 strict dV/dy all ends",
    4: "m4 area from true length",
    8: "m8 W(end)L/2 subcritical",
    64: "m64 outfall share to interior",
    256: "m256 same, FREE/NORMAL only",
    160: "m160 chord area + crown guard",
    420: "m420 = 4+32+128+256",
    512: "m512 book lengthened volume",
}


def meta(path, model):
    t = open(path, errors="ignore").read()
    route = re.search(r"FLOW_ROUTING\s+(\S+)", t).group(1)
    m = re.search(r"LENGTHENING_STEP\s+(\S+)", t)
    of = t.split("[OUTFALLS]")[1].split("[")[0] if "[OUTFALLS]" in t else ""
    types = sorted({ln.split()[2] for ln in of.splitlines()
                    if ln.strip() and not ln.startswith(";") and len(ln.split()) > 2})
    if re.match(r"M\d+_", model):
        src = "synthetic"
    elif model.startswith("data__") or model in ("model_full_features", "swmm_example"):
        src = "pyswmm"
    else:
        src = "EPA nrtestsuite"
    return src, route, m.group(1) if m else "0", "/".join(types)


def main(out):
    rows = []
    for suite in ("synthetic", "regression"):
        for r in json.load(open(os.path.join(HERE, "runs", suite, "summary.json"))):
            src, route, L, of = meta(os.path.join(HERE, "models", suite, r["model"] + ".inp"), r["model"])
            row = {"model": r["model"], "source": src, "routing": route,
                   "lengthening_step": L, "outfall_types": of}
            for mode, label in LABELS.items():
                v = r.get(f"m{mode}")
                row[label] = "" if v is None else ("fail" if v[0] is None else f"{v[0]:.3f}")
            rows.append(row)
    rows.sort(key=lambda x: x["model"])
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main(sys.argv[1])
