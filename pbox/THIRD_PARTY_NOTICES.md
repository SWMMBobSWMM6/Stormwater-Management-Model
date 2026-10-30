# Third-party notices

Everything in this branch that is not listed here is public domain (EPA SWMM 5 and the
implicit box-scheme extension). The items below are bundled third-party code and keep their
own licenses.

## @bjorn3/browser_wasi_shim 0.4.2

- Used as: the browser/Node WASI runtime that runs `wasm/swmm524pbox.wasm`. It is bundled
  with esbuild into `scripts/wasi-shim.iife.js` and embedded in
  `swmm5-implicit-box-test-bench.html`.
- Source: https://github.com/bjorn3/browser_wasi_shim (npm `@bjorn3/browser_wasi_shim`)
- License: MIT OR Apache-2.0, at your option.
- License texts, copied from the npm package: `third_party/browser_wasi_shim-LICENSE-MIT.txt`,
  `third_party/browser_wasi_shim-LICENSE-APACHE.txt`. The package's license files carry no
  copyright line; the copyright holders are bjorn3 and the project's contributors.

## wasi-libc

- Used as: the C library statically linked into `wasm/swmm524pbox.wasm` (Ubuntu 24.04 package
  `wasi-libc`). It includes code from musl libc.
- Source: https://github.com/WebAssembly/wasi-libc
- License: several, file by file (CC0-1.0, MIT, BSD-2-Clause, Apache-2.0, ISC, public domain).
  The full Debian copyright file is copied in `third_party/wasi-libc-COPYRIGHT.txt`.

## LLVM compiler-rt builtins (wasm32)

- Used as: compiler support routines statically linked into `wasm/swmm524pbox.wasm` (Ubuntu
  24.04 package `libclang-rt-18-dev-wasm32`).
- Source: https://github.com/llvm/llvm-project
- License: Apache-2.0 WITH LLVM-exception. The Debian copyright file is copied in
  `third_party/llvm-compiler-rt-COPYRIGHT.txt`.
