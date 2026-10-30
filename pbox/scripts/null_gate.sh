#!/bin/bash
# Null-effect gate: with the extension off, the patched engine must write the same .out bytes as
# pristine EPA SWMM 5.2.4.   scripts/null_gate.sh <build-dir> model1.inp ...
B=${1:?usage: null_gate.sh <build-dir> models...}; shift; pass=0; n=0
for f in "$@"; do n=$((n+1))
  "$B/stock524" "$f" /tmp/ng_s.rpt /tmp/ng_s.out >/dev/null 2>&1
  PBOX=0 "$B/pboxswmm" "$f" /tmp/ng_p.rpt /tmp/ng_p.out >/dev/null 2>&1
  if cmp -s /tmp/ng_s.out /tmp/ng_p.out; then pass=$((pass+1)); else echo "DIFFERS: $f"; fi
done
echo "null gate: $pass/$n byte-identical to stock"; [ $pass -eq $n ]
