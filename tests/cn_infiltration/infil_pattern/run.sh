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
echo "Seasonal infiltration adjustments: factor 0.5 in every month"
printf "   %-26s %9s %10s\n" model infil_in runoff_in
declare -A INF
for m in cn_base cn_conductivity cn_infil_pattern horton_base horton_conductivity horton_infil_pattern; do
  read -r p f r <<<"$(summ $m.inp)"; INF[$m]=$f
  printf "   %-26s %9s %10s\n" "$m" "$f" "$r"
done
echo
if [ "${INF[cn_conductivity]}" = "${INF[cn_base]}" ] && [ "${INF[cn_infil_pattern]}" = "${INF[cn_base]}" ] && \
   [ "${INF[horton_conductivity]}" != "${INF[horton_base]}" ]; then
  echo "REPRODUCED: CONDUCTIVITY and INFIL patterns change Horton (${INF[horton_base]} -> ${INF[horton_conductivity]} in) but not CN (${INF[cn_base]} in)"
else
  echo "NOT REPRODUCED: CN now responds to the infiltration adjustment"
fi
