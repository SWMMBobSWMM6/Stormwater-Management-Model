# Building the two WebAssembly engines

Both engines are built from the same trees that were tested natively:
stock EPA SWMM 5.2.4 (tag v5.2.4, commit 7952ca8) and the same tree with
`swmm524-fvlink.patch` applied. Built 2026-10-21 with Emscripten 3.1.51
(git c0c2ca1) on the system's LLVM 18 and Binaryen 116.

```bash
git clone --depth 1 --branch 3.1.51 https://github.com/emscripten-core/emscripten.git
curl -L -o binaryen.tgz https://github.com/WebAssembly/binaryen/releases/download/version_116/binaryen-version_116-x86_64-linux.tar.gz && tar xzf binaryen.tgz
cat > em_config.py <<'CFG'
LLVM_ROOT = '/usr/lib/llvm-18/bin'
BINARYEN_ROOT = '/path/to/binaryen-version_116'
NODE_JS = '/path/to/node'
CFG
export EM_CONFIG=$PWD/em_config.py EM_CACHE=/tmp/emcache
(cd emscripten && python3 bootstrap.py)

EXP='["_swmm_run","_swmm_open","_swmm_start","_swmm_step","_swmm_end","_swmm_report","_swmm_close","_swmm_getError","_swmm_getWarnings","_swmm_getVersion","_swmm_getMassBalErr","_malloc","_free"]'
RT='["FS","ccall","cwrap","getValue","setValue","UTF8ToString","stringToUTF8"]'
for v in stock:createSwmmStock:swmm524_stock.js patched:createSwmmFV:swmm524_fvlink.js; do
  IFS=: read src name out <<< "$v"
  emscripten/emcc $src/src/solver/*.c -I$src/src/solver -I$src/src/solver/include -O2 \
    -sSINGLE_FILE=1 -sMODULARIZE=1 -sEXPORT_NAME=$name -sENVIRONMENT=web,worker \
    -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=2MB -sFORCE_FILESYSTEM=1 \
    -sEXPORTED_FUNCTIONS="$EXP" -sEXPORTED_RUNTIME_METHODS="$RT" -o $out
done
```

sha256 of the two glue files as built:

```
249d5b3853ad82c55e2ca5a118a693143ddef05485040bbd82e1833912d4641c  swmm524_stock.js
69996b70fedf1e5e27302e6f92ee0785a060ac63270ed5e2b4bbabe919303fe2  swmm524_fvlink.js
```

Check them against the native builds with `test/wasm_vs_native.sh` and
`test/classify.py` (results in `results/wasm_check.txt`). `test/runwasm.js`
loads the web,worker glue in Node with `new Function`, copies the model's
folder into MEMFS, and runs `swmm_run`.
