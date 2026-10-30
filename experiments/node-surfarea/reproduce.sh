#!/usr/bin/env bash
# Rebuild both engines, fetch the models, run every mode, and compare the
# continuity table with the one committed in results/. About 4 minutes.
set -euo pipefail
cd "$(dirname "$0")"

./build.sh
python3 collect_models.py
MODES=0,1,2,4,8,64,256,160,420,512 python3 run_modes.py models/synthetic runs/synthetic
MODES=0,4,64,256,160,420,512        python3 run_modes.py models/regression runs/regression
python3 merge_results.py runs/node-area-results.csv

if cmp -s runs/node-area-results.csv results/node-area-results.csv; then
    echo "MATCH: runs/node-area-results.csv is identical to results/node-area-results.csv"
else
    echo "DIFFERENT: compare runs/node-area-results.csv with results/node-area-results.csv"
    exit 1
fi
