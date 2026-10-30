const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  const dir = __dirname + '/figs';
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg')).filter(f => process.argv.length < 3 || process.argv.slice(2).includes(f.replace('.svg','')))) {
    const svg = fs.readFileSync(dir + '/' + f, 'utf8');
    const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    await p.setViewportSize({ width: +m[1], height: +m[2] });
    await p.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await p.screenshot({ path: dir + '/' + f.replace('.svg', '.png'), clip: { x: 0, y: 0, width: +m[1], height: +m[2] } });
  }
  await b.close();
})();
