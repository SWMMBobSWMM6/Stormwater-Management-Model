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
echo "1. The second CN field is read and discarded"
read -r p a r <<<"$(summ ks0.inp)"; echo "   ks0.inp (field = 0)   infil $a in"
read -r p b r <<<"$(summ ks5.inp)"; echo "   ks5.inp (field = 5.0) infil $b in"
echo
echo "2. CN 70, 0.5 in/hr for 24 hr: infiltration rate decays toward zero"
printf "   %5s %6s %6s\n" hour rain infil
probe long_storm.inp 60 1380 120 | awk '{printf "   %5d %6s %6s\n", $1/60, $2, $3}' | tee "$work/ls.txt"
end=$(tail -1 "$work/ls.txt" | awk '{print $3}')
echo
if [ "$a" = "$b" ]; then
  echo "REPRODUCED: the field has no effect; rate at hour 23 is $end in/hr with no floor"
else
  echo "NOT REPRODUCED: the second field now changes results"
fi
