/* 가로형 주방 장면 스크린샷 — node tools/shotk.js [ing...]   (screenshot/k_<ing>_<w>x<h>_*.png), file:// 로 연다
 *  env VP="1280x720,844x390" 로 뷰포트 지정, ONLY=1 이면 0aim/1cut/5cuts/9cuts/result 중 일부만 */
'use strict';
const path = require('path'); const ROOT = path.join(__dirname, '..');
const pw = require(path.join(ROOT, '..', '..', '260624', 'build', 'node_modules', 'playwright-core'));
const ings = process.argv.slice(2).length ? process.argv.slice(2) : ['salmon'];
const VPS = (process.env.VP || '1280x720').split(',').map((v) => v.split('x').map(Number));
(async () => {
  const b = await pw.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const ing of ings) for (const [w, h] of VPS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: process.env.DSF ? +process.env.DSF : 1 }); const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('PAGEERR', e)); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.text()); });
    await p.goto('file:///' + ROOT.split(path.sep).join('/') + '/index.html');
    await p.waitForFunction(() => window.SL && SL.assets && SL.assets.loaded);
    await p.waitForTimeout(300);
    const tag = ing + '_' + w + 'x' + h, sh = (n) => p.screenshot({ path: path.join(ROOT, 'screenshot', 'k_' + tag + '_' + n + '.png') });
    await sh('intro');
    await p.click('#btn-start'); await p.click('.ing-cell[data-id="' + ing + '"]'); await p.waitForTimeout(200); await sh('select');
    await p.click('#btn-play'); await p.waitForTimeout(500);
    await p.evaluate(() => SL_DEBUG.setKnife(100)); await p.waitForTimeout(150); await sh('0aim');
    const cutAt = async (x, wait) => { await p.evaluate((x) => { SL_DEBUG.setKnife(x); SL_DEBUG.cut(); }, x); await p.waitForTimeout(wait); };
    await cutAt(100, 40); await sh('1chop'); await p.waitForTimeout(500); await sh('1cut');
    for (let k = 2; k <= 5; k++) await cutAt(k * 100, 400);
    await p.evaluate(() => SL_DEBUG.setKnife(560)); await p.waitForTimeout(200); await sh('5cuts');
    for (let k = 6; k <= 9; k++) await cutAt(k * 100 + (k === 9 ? 50 : 0), 400);
    await p.waitForTimeout(300); await sh('9cuts');
    await p.waitForFunction(() => SL_DEBUG.state().screen === 'result', null, { timeout: 5000 }); await p.waitForTimeout(250); await sh('result');
    console.log('ok', tag); await ctx.close();
  }
  await b.close();
})();
