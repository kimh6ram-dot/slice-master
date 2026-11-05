/* 재료 3D 메시·칼 정렬 QA — node tools/qak.js
 *  [1] 재료 4종 메시 정합성(닫힘·평평한 절단면·끝 형태·뚜껑 uv)  [2] 칼 날 픽셀 중심 = 절단 평면(GL 카메라 투영과 독립 비교)  [3a] 한 번 자른 상태
 *  (절단 횟수·카운터·레이아웃·드래그·효과음·도전장은 tools/qaz.js). file:// 로 연다. */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pw =require(path.join(ROOT, '..', '..', '260624', 'build', 'node_modules', 'playwright-core'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const ING = ['naruto', 'tamago', 'salmon', 'cucumber'];
const VPS = [[1920, 1080], [1280, 720], [1440, 900], [2560, 1080], [844, 390], [932, 430], [390, 844], [768, 1024]];

(async () => {
  const b = await pw.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  async function open(w, h, dsf) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf || 1 }), p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/pretendard|net::ERR|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
    await p.goto('file:///' + ROOT.split(path.sep).join('/') + '/index.html');
    await p.waitForFunction(() => window.SL && SL.assets && SL.assets.loaded);
    await p.waitForTimeout(150);
    return { ctx, p };
  }
  async function play(p, id) {
    await p.click('#btn-start'); await p.click('.ing-cell[data-id="' + id + '"]'); await p.click('#btn-play'); await p.waitForTimeout(350);
  }
  // 칼 날 픽셀 열: 칼끝~재료 윗면 사이(배경 벽 위)의 한 줄에서 가장 밝은 열
  async function bladeCol(p) {
    return p.evaluate(() => {
      const st = SL_DEBUG.state(), k = st.knife2, cv = document.getElementById('stage'), d = cv.width / cv.clientWidth;
      const y = Math.round((k.tipY + 40) * d), row = cv.getContext('2d').getImageData(0, y, cv.width, 1).data;
      let best = -1, bi = 0;
      for (let i = Math.max(0, Math.round((k.x - 12) * d)); i < Math.min(cv.width, Math.round((k.x + 12) * d)); i++) { const v = row[i * 4] + row[i * 4 + 1] + row[i * 4 + 2]; if (v > best) { best = v; bi = i; } }
      return { col: (bi + 0.5) / d, knifeX: k.x, lum: best / 3 };
    });
  }

  console.log('[1] 재료 4종 메시 정합성');
  {
    const { ctx, p } = await open(1280, 720);
    const r = await p.evaluate((ING) => {
      const out = {}, L = SL.C.LENGTH;
      for (const id of ING) {
        const sh = SL.mesh3d.shape(id), res = { id, HY: sh.HY, HZ: sh.HZ, cases: [] };
        for (const [a, b] of [[0, 1000], [300, 500], [0, 120], [880, 1000], [400, 408]]) {
          const g = SL.mesh3d.slab(a, b, id), P = g.attributes.position.array, I = g.index.array, UV = g.attributes.uv.array;
          const key = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]].map((v) => Math.round(v * 500)).join(',');
          const edges = {};
          for (let t = 0; t < I.length; t += 3) [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]].forEach((e) => { const kx = key(e[0]), ky = key(e[1]); if (kx === ky) return; const k = kx < ky ? kx + '|' + ky : ky + '|' + kx; edges[k] = (edges[k] || 0) + 1; });
          let open = 0; for (const k in edges) if (edges[k] % 2 !== 0) open++;
          const cap0 = g.groups[1].start, cap = new Set(I.slice(cap0)), capX = [];
          cap.forEach((i) => capX.push(P[i * 3]));
          const leftX = capX.filter((x) => Math.abs(x - a) < 1e-4).length, rightX = capX.filter((x) => Math.abs(x - b) < 1e-4).length;
          let uvBad = 0; cap.forEach((i) => { if (UV[i * 2] < -1e-6 || UV[i * 2] > 1 + 1e-6 || UV[i * 2 + 1] < -1e-6 || UV[i * 2 + 1] > 1 + 1e-6) uvBad++; });
          let minY = 1e9, maxZ = 0; for (let i = 0; i < P.length / 3; i++) { minY = Math.min(minY, P[i * 3 + 1]); maxZ = Math.max(maxZ, Math.abs(P[i * 3 + 2])); }
          res.cases.push({ a, b, open, capVerts: cap.size, flat: leftX + rightX === cap.size, uvBad, tris: g.userData.triangles, minY, maxZ, leftInset: g.userData.leftFlat, rightInset: g.userData.rightInset });
        }
        out[id] = res;
      }
      return out;
    }, ING);
    for (const id of ING) {
      const o = r[id];
      ok(o.cases.every((c) => c.open === 0), `${id}: 모든 구간 메시가 닫힘(속 빈 모델 아님, 뚜껑 포함)`, o.cases.map((c) => c.open));
      ok(o.cases.every((c) => c.flat), `${id}: 양쪽 절단 뚜껑이 한 평면(x=a / x=b)에 평평`);
      ok(o.cases.every((c) => c.uvBad === 0), `${id}: 뚜껑 uv 가 0..1 안 → 단면 무늬가 윤곽 밖으로 안 나감`);
      ok(o.cases.every((c) => Math.abs(c.minY) < 1e-3), `${id}: 바닥이 도마 위(y=0)에 닿음`, o.cases.map((c) => c.minY));
      const mid = o.cases[1], full = o.cases[0], sh = { naruto: [12, 12], tamago: [40, 40], salmon: [30, 30], cucumber: [7, 64] }[id];
      ok(mid.leftInset === 0 && mid.rightInset === 0, `${id}: 가운데 구간 절단면은 오므라들지 않고 평평(링 그대로)`, mid);
      ok(Math.abs(full.leftInset - sh[0]) < 1e-6 && Math.abs(full.rightInset - sh[1]) < 1e-6, `${id}: 원래 양 끝 형태 유지(왼쪽 ${sh[0]}·오른쪽 ${sh[1]})`, full);
    }
    await ctx.close();
  }

  console.log('[2] 칼 날 픽셀 중심 = 절단 평면 (재료 4종 × 위치 4곳, 1920×1080)');
  for (const id of ING) {
    const { ctx, p } = await open(1920, 1080);
    await play(p, id);
    const use3d = await p.evaluate(() => SL_DEBUG.use3d());
    ok(use3d === true, `${id}: 3D 절단 구조 사용`);
    for (const kx of [60, 333, 500, 800]) {
      await p.evaluate((x) => SL_DEBUG.setKnife(x), kx); await p.waitForTimeout(80);
      const bc = await bladeCol(p);
      const proj = await p.evaluate((u) => { const sh = SL.mesh3d.shape(SL_DEBUG.state().ing), v = SL.view3d._dbg.project(u, sh.HY / 2, 0), W = SL_DEBUG.state().lay.W; return (v[0] + 1) / 2 * W; }, kx);
      ok(Math.abs(bc.col - bc.knifeX) <= 1.5 && bc.lum > 70, `${id} knife=${kx}: 칼날 픽셀 열 ${bc.col.toFixed(1)} ≈ 계산 중심선 ${bc.knifeX.toFixed(1)}`, bc);
      ok(Math.abs(bc.knifeX - proj) <= 0.6, `${id} knife=${kx}: 중심선 ${bc.knifeX.toFixed(1)} = GL 카메라가 투영한 절단 평면 중심 ${proj.toFixed(1)}`, { proj });
    }
    const s = await p.evaluate(() => SL_DEBUG.state());
    ok(s.knife2.tipY < s.food.top && s.knife2.guardY >= s.food.bottom - 12, `${id}: 칼끝이 재료 윗면 위, 날밑(손잡이 시작)이 재료 아래쪽`, { tip: s.knife2.tipY, top: s.food.top, guard: s.knife2.guardY, bottom: s.food.bottom });
    ok(s.knife2.bottomY <= s.lay.H + 2, `${id}: 칼 손잡이 끝이 화면 안(${s.knife2.bottomY.toFixed(0)} ≤ ${s.lay.H})`);
    await ctx.close();
  }

  console.log('[3a] 한 번 자른 상태 (재료 4종)');
  for (const id of ING) {
    const { ctx, p } = await open(1280, 720);
    await play(p, id);
      await p.evaluate((x) => { SL_DEBUG.setKnife(x); SL_DEBUG.cut(); }, 300); await p.waitForTimeout(60);
      const one = await p.evaluate(() => { const ps = SL.view3d._dbg.pieces(), bd = SL.view3d._dbg.body(); return { n: ps.length, th: ps[0] && ps[0].thickness, body: bd && [bd.a, bd.b] }; });
      ok(one.n === 1 && one.th === 300 && one.body[0] === 300 && one.body[1] === 1000, `${id}: 한 번 자르면 조각 1개(두께 300) + 남은 몸통 [300,1000]`, one);
    await ctx.close();
  }

  ok(errs.length === 0, '콘솔 에러 없음', errs.slice(0, 5));
  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
