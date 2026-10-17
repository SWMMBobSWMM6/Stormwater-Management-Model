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
echo "CN 80 (S = 2.5 in), wide plane, no depression storage: runoff (in)"
echo "SWMM uses F = P*S/(P+S), i.e. Q = P^2/(P+S) with Ia = 0"
printf "   %-5s %8s %10s %13s %14s\n" P_in SWMM Ia=0_eq TR-55_l=0.2 l=0.05_S05
ok=1
for p in 1 2 4; do
  read -r P f r <<<"$(summ cn80_p${p}in.inp)"
  read -r q0 q2 q5 <<<"$(awk -v P="$P" 'BEGIN{S=2.5; q0=P*P/(P+S);
     Ia=0.2*S; q2=(P>Ia)?(P-Ia)^2/(P-Ia+S):0;
     S5=1.33*S^1.15; Ia=0.05*S5; q5=(P>Ia)?(P-Ia)^2/(P-Ia+S5):0;
     printf "%.2f %.2f %.2f", q0, q2, q5}')"
  printf "   %-5s %8s %10s %13s %14s\n" "$P" "$r" "$q0" "$q2" "$q5"
  awk -v a="$r" -v b="$q0" 'BEGIN{exit !((a-b)^2<0.0004)}' || ok=0
done
echo
if [ $ok = 1 ]; then
  echo "REPRODUCED: SWMM runoff equals the Ia = 0 form at every depth; there is no Ia ratio to set"
else
  echo "NOT REPRODUCED: SWMM no longer matches the Ia = 0 form (Ia ratio applied?)"
fi
