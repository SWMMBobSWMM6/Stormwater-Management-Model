#!/bin/bash
# wasm vs native: .out byte-identical, .rpt identical apart from run-time stamps
# usage: wasm_vs_native.sh <native> <engine.js> <exportName> <tag> <outdir> inp...
NAT=$1; ENG=$2; NAME=$3; TAG=$4; OUT=$5; shift 5
F="Analysis begun\|Analysis ended\|Total elapsed"
for inp in "$@"; do
  d=$(dirname "$inp"); b=$(basename "$inp" .inp); k="$TAG.$(basename $d).$b"
  ( cd "$d" && timeout 900 "$NAT" "$b.inp" "$OUT/$k.n.rpt" "$OUT/$k.n.out" >/dev/null 2>&1 )
  j=$(timeout 1800 node /home/claude/fvapp/test/runwasm.js "$ENG" "$NAME" "$inp" "$OUT/$k.w.rpt" "$OUT/$k.w.out" 2>&1 | tail -1)
  if cmp -s "$OUT/$k.n.out" "$OUT/$k.w.out" && diff -q <(grep -v "$F" "$OUT/$k.n.rpt") <(grep -v "$F" "$OUT/$k.w.rpt") >/dev/null; then
    s=IDENTICAL; else s=DIFFERENT; fi
  echo "$s $k nout=$(stat -c %s "$OUT/$k.n.out") $j"
done
