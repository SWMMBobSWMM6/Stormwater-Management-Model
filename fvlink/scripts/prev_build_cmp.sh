#!/bin/bash
# .out comparison: build before FVL-13 (swmm5_fv_prev) vs final (swmm5_fv).
# usage: scripts/prev_build_cmp.sh <repo_root>   (needs both binaries and nrtest/)
R=${1:-$(pwd)}; O=$R/work/cmp_prev; mkdir -p $O; same=0; diff=0
run2(){ d=$1; b=$2; ( cd $d && $R/swmm5_fv_prev $b.inp $O/$b.p.rpt $O/$b.p.out >/dev/null 2>&1; $R/swmm5_fv $b.inp $O/$b.n.rpt $O/$b.n.out >/dev/null 2>&1 )
  if cmp -s $O/$b.p.out $O/$b.n.out; then same=$((same+1)); else diff=$((diff+1)); echo "DIFF $b"; fi; rm -f $O/$b.p.out $O/$b.n.out; }
for f in $R/models/*_fv*.inp $R/models/gates/*.inp $R/models/review/*_fv*.inp $R/work/x8/*_fv.inp; do run2 $(dirname $f) $(basename $f .inp); done
python3 - "$R" <<'PY' > $O/list.txt
import csv, sys
for r in csv.DictReader(open(sys.argv[1] + '/results/sweep.csv')):
    if r['status']=='ran': print(r['model'], r['fv_link'])
PY
while read m l; do f=$(find $R/nrtest -name "$m.inp" | head -1); d=$(dirname $f); cp $f $d/zz_${m}__fv.inp; printf "\n\n[FV_LINKS]\n%s\n" "$l" >> $d/zz_${m}__fv.inp; run2 $d zz_${m}__fv; rm -f $d/zz_${m}__fv.inp; done < $O/list.txt
echo "SUMMARY same=$same different=$diff"
