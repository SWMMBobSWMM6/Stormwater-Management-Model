#!/bin/bash
# Build the implicit box-scheme engines from this branch, plus a pristine EPA SWMM 5.2.4 build
# for the null gate.
#
#   pbox/scripts/build.sh <pristine-v5.2.4-tree> [outdir]
#
# The engine source is the repository this script sits in (branch dev-pbox-implicit-wasm, which
# already carries the patch). The pristine tree is only used to build stock524. One way to get it:
#   git fetch https://github.com/USEPA/Stormwater-Management-Model.git tag v5.2.4 --no-tags
#   git worktree add ../swmm-5.2.4 v5.2.4
#
# Produces in outdir:
#   pboxswmm        test driver; PBOX=1 switches the extension on (PBOX_THETA, PBOX_SLOT,
#                   PBOX_BASE, PBOX_SPACING tune it)
#   stock524        pristine 5.2.4 command-line engine, for the null gate
#   pboxswmm-musl   when musl-gcc is installed; the build the wasm matches byte for byte
#   swmm524pbox.wasm when clang-18, wasi-libc and libclang-rt-18-dev-wasm32 are installed
set -e
STOCK=${1:?usage: build.sh <pristine-v5.2.4-tree> [outdir]}
HERE=$(cd "$(dirname "$0")/.." && pwd)          # pbox/
REPO=$(cd "$HERE/.." && pwd)                    # repository root, already patched
OUT=$(mkdir -p "${2:-pboxbuild}" && cd "${2:-pboxbuild}" && pwd)
S="$REPO/src/solver"; P="$STOCK/src/solver"
[ -f "$S/pbox.c" ] || { echo "no src/solver/pbox.c under $REPO: check out dev-pbox-implicit-wasm"; exit 1; }
[ ! -f "$P/pbox.c" ] || { echo "$STOCK already has pbox.c: give a pristine v5.2.4 tree"; exit 1; }
CF="-O2 -D_FORTIFY_SOURCE=0 -U_FORTIFY_SOURCE -w"   # glibc fortify aborts stock 5.2.4 builds
gcc $CF -I$S -I$S/include $S/*.c "$HERE/scripts/pboxmain.c" -lm -o "$OUT/pboxswmm"
gcc $CF -I$P -I$P/include $P/*.c "$STOCK/src/run/main.c" -lm -o "$OUT/stock524"
if command -v musl-gcc >/dev/null; then
  musl-gcc $CF -I$S -I$S/include $S/*.c "$HERE/scripts/pboxmain.c" -lm -o "$OUT/pboxswmm-musl"
fi
if command -v clang-18 >/dev/null && [ -d /usr/lib/wasm32-wasi ]; then
  EXP=""; for e in swmm_open swmm_start swmm_step swmm_end swmm_report swmm_close swmm_getMassBalErr \
                   swmm_getVersion swmm_getWarnings swmm_getError swmm_setPboxOptions swmm_getPboxStats malloc free; do
    EXP="$EXP -Wl,--export=$e"; done
  clang-18 --target=wasm32-wasi --sysroot=/usr -mexec-model=reactor -O2 -w \
    -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_SIGNAL -include "$HERE/scripts/wasi_shims.h" \
    -I$S -I$S/include $S/*.c -o "$OUT/swmm524pbox.wasm" $EXP -lwasi-emulated-process-clocks -lwasi-emulated-signal
  if cmp -s "$OUT/swmm524pbox.wasm" "$HERE/wasm/swmm524pbox.wasm"; then echo "wasm: byte-identical to pbox/wasm/swmm524pbox.wasm"
  else echo "wasm: DIFFERS from pbox/wasm/swmm524pbox.wasm (different toolchain or source): rerun the gates"; fi
fi
echo "built in $OUT"
