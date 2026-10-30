#!/bin/bash
# Memory and undefined-behaviour check: the patched engine built with
#   gcc -O1 -g -fno-omit-frame-pointer -fsanitize=address,undefined ...
# runs 11 FV test networks plus EPA user2 (TW01290 FV) and user5 (LIB_9 FV).
# A run passes when the sanitizers print nothing and the run completes.
ASAN=$1; ROOT=$2; OUT=$3       # ROOT = repository root (models/, nrtest/)
mkdir -p "$OUT"
export ASAN_OPTIONS=detect_leaks=1:abort_on_error=0 UBSAN_OPTIONS=print_stacktrace=1
U=$ROOT/nrtest/public/user
cp $U/user2.inp $U/zz_user2__fv.inp; printf "\n\n[FV_LINKS]\nTW01290\n" >> $U/zz_user2__fv.inp
cp $U/user5.inp $U/zz_user5__fv.inp; printf "\n\n[FV_LINKS]\nLIB_9\n"   >> $U/zz_user5__fv.inp
pass=0; fail=0
for f in models/gates/chain_fv models/mixed_4fv_fv models/gates/lake_all_fv models/gates/resonator \
         models/review/q_fv models/review/gate_fv models/review/longid models/review/rev_fvall \
         models/chain70x_C4_fv models/short_C3_fv models/channel_C2_fv \
         nrtest/public/user/zz_user2__fv nrtest/public/user/zz_user5__fv; do
  d=$ROOT/$(dirname $f); b=$(basename $f)
  ( cd $d && "$ASAN" $b.inp "$OUT/$b.rpt" "$OUT/$b.out" > "$OUT/$b.stdout" 2> "$OUT/$b.stderr" ); rc=$?
  n=$(grep -c "ERROR: AddressSanitizer\|ERROR: LeakSanitizer\|runtime error:" "$OUT/$b.stderr")
  done_=$(grep -c "Analysis ended" "$OUT/$b.rpt")
  if [ "$n" = 0 ] && [ "$rc" = 0 ] && [ "$done_" = 1 ]; then r=CLEAN; pass=$((pass+1)); else r=REPORTED; fail=$((fail+1)); fi
  printf "%-9s %-16s exit %d  sanitizer reports %s  run completed %s\n" $r $b $rc $n $done_
done
rm -f $U/zz_user2__fv.inp $U/zz_user5__fv.inp
echo "SUMMARY clean=$pass reported=$fail"
