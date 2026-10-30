#!/bin/bash
# Null-effect gate: stock 5.2.4 vs patched engine on every nrtestsuite model.
# .out must be byte-identical; .rpt identical apart from the run-time stamps.
STOCK=$1; FV=$2; ROOT=$3; OUT=$4
mkdir -p "$OUT"
pass=0; fail=0; err=0
for inp in $(find "$ROOT" -name "*.inp" | sort); do
  d=$(dirname "$inp"); b=$(basename "$inp" .inp)
  ( cd "$d" && timeout 600 "$STOCK" "$b.inp" "$OUT/$b.s.rpt" "$OUT/$b.s.out" >/dev/null 2>&1 )
  ( cd "$d" && timeout 600 "$FV"    "$b.inp" "$OUT/$b.f.rpt" "$OUT/$b.f.out" >/dev/null 2>&1 )
  if [ ! -s "$OUT/$b.s.out" ]; then
    # stock produced no .out (model error); compare reports only
    if diff <(grep -v "Analysis begun\|Analysis ended\|Total elapsed" "$OUT/$b.s.rpt") \
            <(grep -v "Analysis begun\|Analysis ended\|Total elapsed" "$OUT/$b.f.rpt") >/dev/null; then
      echo "NOOUT-SAME $b"; err=$((err+1)); else echo "NOOUT-DIFF $b"; fail=$((fail+1)); fi
    continue
  fi
  if cmp -s "$OUT/$b.s.out" "$OUT/$b.f.out" && \
     diff <(grep -v "Analysis begun\|Analysis ended\|Total elapsed" "$OUT/$b.s.rpt") \
          <(grep -v "Analysis begun\|Analysis ended\|Total elapsed" "$OUT/$b.f.rpt") >/dev/null; then
    echo "IDENTICAL $b $(stat -c %s "$OUT/$b.s.out")"; pass=$((pass+1))
  else
    echo "DIFFERENT $b"; fail=$((fail+1))
  fi
done
echo "SUMMARY identical=$pass different=$fail stock-error-same=$err"
