#!/usr/bin/env bash
# Usage: ./run.sh [path/to/swmm5]
# With no argument, compiles the engine from this checkout (gcc, ~10 s).
# _FORTIFY_SOURCE is switched off because glibc aborts with "buffer overflow
# detected" while SWMM prints some input-error messages (separate upstream bug).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
CFLAGS="-O2 -w -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 -I$root/src/solver -I$root/src/solver/include"
swmm=${1:-}
if [ -z "$swmm" ]; then
  swmm=$work/swmm5
  gcc $CFLAGS "$root"/src/solver/*.c "$root"/src/run/main.c -lm -o "$swmm"
fi

# summ <model.inp>  ->  "precip_in infil_in runoff_in" from the Subcatchment Runoff Summary
summ() {
  "$swmm" "$here/$1" "$work/r.rpt" "$work/r.out" >/dev/null 2>&1 || true
  awk '/Subcatchment Runoff Summary/{f=1} f&&/^  S1 /{print $2, $5, $8; exit}' "$work/r.rpt"
}

# probe <model.inp> <from_min> <to_min> <every_min>  ->  "minute rain_in/hr infil_in/hr"
probe() {
  [ -x "$work/probe" ] || gcc $CFLAGS "$here/probe.c" "$root"/src/solver/*.c -lm -o "$work/probe"
  "$work/probe" "$here/$1" "$work/p.rpt" "$work/p.out" "$2" "$3" "$4"
}

echo "engine: $(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo unknown)  ($swmm)"

echo
echo "1. Same CN 80, same 2 in storm, all pervious: event infiltration depends on Width"
printf "   %-9s %9s %10s\n" width_ft infil_in runoff_in
lo=99; hi=0
for w in 50 500 5000 50000; do
  read -r p f r <<<"$(summ width_$w.inp)"
  printf "   %-9s %9s %10s\n" "$w" "$f" "$r"
  lo=$(awk -v a="$lo" -v b="$f" 'BEGIN{print (b<a)?b:a}'); hi=$(awk -v a="$hi" -v b="$f" 'BEGIN{print (b>a)?b:a}')
done
spread=$(awk -v a="$hi" -v b="$lo" 'BEGIN{printf "%.2f", a-b}')

echo
echo "2. Routing 50% impervious onto pervious: infiltration gained"
printf "   %-8s %8s %10s %7s\n" method outlet pervious gain
for t in cn horton; do
  read -r p a r <<<"$(summ runon_${t}_outlet.inp)"; read -r p b r <<<"$(summ runon_${t}_pervious.inp)"
  g=$(awk -v a="$a" -v b="$b" 'BEGIN{printf "%.2f", b-a}')
  printf "   %-8s %8s %10s %7s\n" "$t" "$a" "$b" "$g"
  [ "$t" = cn ] && gcn=$g || gho=$g
done

echo
echo "3. CN 70, 1 in/hr, 1 hr gap, 1 in/hr: infiltration rate (in/hr) around the gap"
printf "   %7s %6s %6s\n" minute rain infil
probe rain_gap.inp 50 150 5 | awk '{printf "   %7s %6s %6s\n", $1, $2, $3}' | tee "$work/gap.txt"
zero=$(awk '$1>=120 && $2>0 && $3==0' "$work/gap.txt" | wc -l | tr -d ' ')

echo
if awk -v s="$spread" 'BEGIN{exit !(s>0.05)}' && [ "$zero" -gt 0 ]; then
  echo "REPRODUCED: Width moves CN infiltration by $spread in; runon gain CN $gcn in vs Horton $gho in;"
  echo "            infiltration is zero at $zero of the 5-min samples while it rains in the second burst"
else
  echo "NOT REPRODUCED: spread $spread in, zero-infiltration minutes in burst 2: $zero"
fi
