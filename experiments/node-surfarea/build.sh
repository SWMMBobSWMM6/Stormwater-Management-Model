#!/usr/bin/env bash
# Build two command-line engines into ./bin:
#   runswmm_mod  this branch: EPA SWMM 5.2.4 + the node-area experiment
#   runswmm_ref  unmodified EPA SWMM 5.2.4 at BASE, for the null control
#
# Needs bash, git and gcc (Linux, WSL or MSYS2). On Windows without those,
# build this branch with EPA's CMake files instead (see README).
#
# FORTIFY is switched off because glibc's _FORTIFY_SOURCE aborts 5.2.4 with
# "buffer overflow detected" while printing some input-error messages.
set -euo pipefail

BASE=07c371f8a0d477da1d9d4e7c0d75719664f62fec   # USEPA develop, VERSION 52004
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
CFLAGS="-O2 -w -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 -fopenmp"

build() {   # $1 = source root, $2 = output binary
    gcc $CFLAGS -I"$1/src/solver/include" -I"$1/src/solver" \
        -o "$2" "$1"/src/solver/*.c "$1/src/run/main.c" -lm
}

mkdir -p "$HERE/bin"
build "$ROOT" "$HERE/bin/runswmm_mod"

if ! git -C "$ROOT" cat-file -e "$BASE^{commit}" 2>/dev/null; then
    git -C "$ROOT" fetch -q --depth 1 origin "$BASE"
fi
REFSRC="$HERE/bin/ref-src"
rm -rf "$REFSRC" && mkdir -p "$REFSRC"
git -C "$ROOT" archive "$BASE" src | tar -x -C "$REFSRC"
build "$REFSRC" "$HERE/bin/runswmm_ref"

echo "built $HERE/bin/runswmm_mod and $HERE/bin/runswmm_ref"
