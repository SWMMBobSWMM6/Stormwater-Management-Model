#!/bin/bash
# OpenMP check: the same .inp with THREADS 2 run on the serial build and on
# the OpenMP build (same patch, gcc -O2 -fopenmp); .out must be byte-identical.
# SWMM 5.2.4 drops to one thread when a model has fewer than 4 links per thread.
SER=$1; OMP=$2; ROOT=$3; OUT=$4
mkdir -p "$OUT"; pass=0; fail=0
U=$ROOT/nrtest/public/user
cp $U/user2.inp $U/zz_user2__fv.inp; printf "\n\n[FV_LINKS]\nTW01290\n" >> $U/zz_user2__fv.inp
cp $U/user5.inp $U/zz_user5__fv.inp; printf "\n\n[FV_LINKS]\nLIB_9\n"   >> $U/zz_user5__fv.inp
for f in models/gates/chain_fv models/mixed_4fv_fv models/gates/lake_all_fv models/gates/resonator \
         models/review/q_fv models/review/gate_fv models/review/rev_fvall models/chain70x_C4_fv \
         models/short_C3_fv models/channel_C2_fv models/tree_fv \
         nrtest/public/user/zz_user2__fv nrtest/public/user/zz_user5__fv; do
  d=$ROOT/$(dirname $f); b=$(basename $f); t=zz_omp_$b.inp
  awk 'toupper($1) == "THREADS" {next} {print} toupper($0) ~ /^\[OPTIONS\]/ {print "THREADS              2"}' $d/$b.inp > $d/$t
  ( cd $d && "$SER" $t "$OUT/$b.ser.rpt" "$OUT/$b.ser.out" >/dev/null 2>&1 )
  ( cd $d && "$OMP" $t "$OUT/$b.omp.rpt" "$OUT/$b.omp.out" >/dev/null 2>&1 )
  rm -f $d/$t
  if [ -s "$OUT/$b.ser.out" ] && cmp -s "$OUT/$b.ser.out" "$OUT/$b.omp.out"; then
    echo "IDENTICAL $b $(stat -c %s "$OUT/$b.ser.out") bytes, threads used: $(grep 'Number of Threads' "$OUT/$b.omp.rpt" | tr -dc '0-9')"; pass=$((pass+1))
  else echo "DIFFERENT $b"; fail=$((fail+1)); fi
done
rm -f $U/zz_user2__fv.inp $U/zz_user5__fv.inp
echo "SUMMARY identical=$pass different=$fail (THREADS 2)"
