# FV Link Lab: source

- `src/`: the page shell, stylesheet, app script and engine worker.
- `doc/`: `essay.js` (the one source for the Doc tab and the Word file), `figures.js` (the 20 figures as inline SVG), `figdata_app.py` and the `figdata.json` it writes from the branch's results.
- `wasm/`: the two engines and how they were built (`BUILD.md`).
- `build/`: `node build.js` writes `dist/index.html`; `node shoot_docx_figs.js && node build_docx.js` writes the Word file; `test_app.js` + `test_compare.sh` run every sample in headless Chromium and compare with the native engines; `ui_shots.js` and `test_gif.js` check both themes, phone width and the GIF recorder. Paths inside the scripts point at the build machine's folders; adjust them to yours.
- `test/`, `results/`: the WebAssembly-against-native census and the browser test results.

Built with Claude (Anthropic) under Robert Dickinson's direction; see the app's About tab for the AI-use statement.
