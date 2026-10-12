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
echo "CN 80, DryTime 7 d -> Tmax = 0.06 x 7 d = 10.08 hr. Two 2 in storms; infiltration vs gap"
printf "   %-7s %9s %10s\n" gap_hr infil_in runoff_in
first=""; last=""
for g in 9.00 9.50 9.75 10.00 10.25 10.50 11.00; do
  read -r p f r <<<"$(summ gap_${g/./p}h.inp)"
  printf "   %-7s %9s %10s\n" "$g" "$f" "$r"
  [ -z "$first" ] && first=$f; last=$f
done
echo
jump=$(awk -v a="$last" -v b="$first" 'BEGIN{printf "%.2f", a-b}')
if awk -v j="$jump" 'BEGIN{exit !(j>0.1)}'; then
  echo "REPRODUCED: infiltration jumps $jump in when the gap crosses Tmax, which is fixed at 0.06 x DryTime"
else
  echo "NOT REPRODUCED: no step change across Tmax"
fi
