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
echo "1. CN is clamped to 10..99 in curvenum_setParams with no message"
printf "   %-7s %9s %10s %9s\n" model infil_in runoff_in warnings
declare -A INF WRN
for m in cn99 cn100 cn10 cn5; do
  read -r p f r <<<"$(summ $m.inp)"
  INF[$m]=$f; WRN[$m]=$(grep -c "WARNING" "$work/r.rpt" || true)
  printf "   %-7s %9s %10s %9s\n" "$m" "$f" "$r" "${WRN[$m]}"
done
echo
echo "2. DryTime 0 is rejected, so regen is always > 0 and 'if ( infil->regen > 0.0 )' is dead"
"$swmm" "$here/drytime0.inp" "$work/d.rpt" "$work/d.out" >/dev/null 2>&1 || true
e=$(grep -o "ERROR [0-9]*" "$work/d.rpt" | head -1 || true)
echo "   drytime0.inp -> ${e:-no error}"
echo
same=0
[ "${INF[cn100]}" = "${INF[cn99]}" ] && [ "${INF[cn5]}" = "${INF[cn10]}" ] && same=1
if [ $same = 1 ] && [ "${WRN[cn100]}" = 0 ] && [ "${WRN[cn5]}" = 0 ]; then
  echo "REPRODUCED: CN 100 runs as CN 99 and CN 5 runs as CN 10, with no warning in the .rpt"
elif [ $same = 1 ] && [ "${WRN[cn100]}" = 1 ] && [ "${WRN[cn5]}" = 1 ] && \
     [ "${WRN[cn99]}" = 0 ] && [ "${WRN[cn10]}" = 0 ]; then
  echo "FIXED: CN 100 and CN 5 each get one warning, CN 99 and CN 10 none; results unchanged"
else
  echo "NOT REPRODUCED: clamp results or warnings differ from both the old and the fixed engine"
fi
