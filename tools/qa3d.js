/* 3D 계란말이 QA — node tools/qa3d.js
 * 메시 정합성(닫힘·평평한 절단면·끝만 둥긂·uv 연속·두께 데이터), 카메라 수평, 조각 겹침/도마 관통, 예산(메시·삼각형·텍스처), 9회 연속 절단~결과를 검증한다. */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pw = require(path.join(ROOT, '..', '..', '260624', 'build', 'node_modules', 'playwright-core'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };

(async () => {
  const b = await pw.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/pretendard|net::ERR|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  await p.goto('file:///' + ROOT.split(path.sep).join('/') + '/index.html');
  await p.waitForFunction(() => !!window.SL_DEBUG);

  console.log('[A] 카메라');
  const cam = await p.evaluate(() => {
    SL.view3d.init();
    const d = SL.view3d._dbg, a = d.project(0, 0, 0), c = d.project(1000, 0, 0);
    const cm = d.cam(), dir = new THREE.Vector3(); cm.getWorldDirection(dir);
    return { dy: Math.abs(a[1] - c[1]), dx: c[0] - a[0], ortho: cm.isOrthographicCamera, top: -dir.y, front: -dir.z, left: dir.x };
  });
  ok(cam.ortho, '직교 카메라');
  ok(cam.dy < 1e-6 && cam.dx > 0.5, '길이 축이 화면에서 정확히 수평', { dy: cam.dy, dx: cam.dx });
  ok(cam.top > 0.2 && cam.front > 0.2 && cam.left > 0.2, '윗면(+y)·앞면(+z)·왼쪽 단면(−x)이 모두 보이는 방향', cam);

  console.log('[B] 조각 메시');
  const geo = await p.evaluate(() => {
    const out = {};
    function stats(a, b) {
      const g = SL.mesh3d.slab(a, b), P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array;
      const key = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]].map((v) => Math.round(v * 1000)).join(',');
      const edges = {};
      let badWinding = 0;
      for (let t = 0; t < I.length; t += 3) {
        const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
        [[i0, i1], [i1, i2], [i2, i0]].forEach((e) => { const kx = key(e[0]), ky = key(e[1]), k = kx < ky ? kx + '|' + ky : ky + '|' + kx; edges[k] = (edges[k] || 0) + 1; });
        const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
        const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
        const f = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
        const n = [0, 1, 2].map((k) => N[i0 * 3 + k] + N[i1 * 3 + k] + N[i2 * 3 + k]);
        if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] <= 0) badWinding++;
      }
      const open = Object.values(edges).filter((c) => c !== 2).length;
      const gc = g.groups[1], capX = {}, capHalfZ = {};
      for (let t = gc.start; t < gc.start + gc.count; t++) {
        const i = I[t], x = Math.round(P[i * 3] * 10) / 10;
        capX[x] = 1; capHalfZ[x] = Math.max(capHalfZ[x] || 0, Math.abs(P[i * 3 + 2]));
      }
      return { open, badWinding, capX: Object.keys(capX).map(Number), capHalfZ, tris: g.userData.triangles, verts: g.userData.vertices, thick: g.userData.thickness, groups: g.groups.length };
    }
    out.mid = stats(300, 400); out.first = stats(0, 100); out.last = stats(900, 1000); out.full = stats(0, 1000); out.thin = stats(500, 508); out.inEnd = stats(10, 110);
    const a = SL.mesh3d.slab(0, 300), bb = SL.mesh3d.slab(300, 1000);
    function atX(g, x) {
      const P = g.attributes.position.array, U = g.attributes.uv.array, N = g.attributes.normal.array, r = [];
      for (let i = 0; i < P.length / 3; i++) if (Math.abs(P[i * 3] - x) < 1e-6 && N[i * 3] === 0 && N[i * 3 + 1] + N[i * 3 + 2] !== 0 && !(U[i * 2] === 0.5 && U[i * 2 + 1] === 0.5)) r.push([U[i * 2], U[i * 2 + 1], P[i * 3 + 1], P[i * 3 + 2]].map((v) => Math.round(v * 1e5)));
      return r.sort((p, q) => p[1] - q[1] || p[2] - q[2]);
    }
    const ua = atX(a, 300), ub = atX(bb, 300);
    out.uv = { n: ua.length, same: ua.length > 0 && JSON.stringify(ua) === JSON.stringify(ub), u: ua.length ? ua[0][0] / 1e5 : null };
    return out;
  });
  for (const k of ['mid', 'first', 'last', 'full', 'thin', 'inEnd']) {
    const s = geo[k];
    ok(s.open === 0 && s.badWinding === 0 && s.groups === 2, `${k}: 닫힌 메시(열린 모서리 0)·법선 바깥·옆면/뚜껑 2그룹`, { open: s.open, bad: s.badWinding });
  }
  const m = geo.mid;
  ok(m.capX.length === 2 && Math.abs(m.capX[1] - m.capX[0] - 100) < 1e-6, '중간 조각: 두 절단면이 각각 평면(x 한 값)이고 간격 = 두께 100', m.capX);
  ok(Math.abs(Math.max.apply(null, Object.values(m.capHalfZ)) - 115) < 0.5, '몸통 중간의 절단면은 원래 단면 크기(끝처럼 오므라들지 않음)', m.capHalfZ);
  ok(geo.first.capHalfZ['0'] < 115 - 30, '원래 왼쪽 끝은 둥글다(끝 면 링이 오므라듦)', geo.first.capHalfZ);
  ok(geo.first.capHalfZ['100'] > 114.5, '…새로 잘린 면(x=100)은 원래 크기로 평평', geo.first.capHalfZ);
  ok(geo.last.capHalfZ['900'] > 114.5 && geo.last.capHalfZ['1000'] < 85, '오른쪽 끝도 원래 끝만 둥글고 잘린 면(x=900)은 평평', geo.last.capHalfZ);
  ok(geo.inEnd.capHalfZ['10'] < 115 && geo.inEnd.capHalfZ['110'] > 114.5, '둥근 끝 구간 안에서 자른 면은 그 위치의(더 작은) 단면 — 물리적으로 맞음', geo.inEnd.capHalfZ);
  ok(geo.thin.thick === 8 && geo.thin.open === 0, '가장 얇은 조각(8)도 닫힌 메시');
  ok(geo.uv.same && Math.abs(geo.uv.u - 0.3) < 1e-4, '무늬 연속: 경계의 옆면 uv 가 두 조각에서 동일(u = x/L)', geo.uv);
  console.log('   삼각형/정점: 중간 조각', m.tris, '/', m.verts, ' 전체', geo.full.tris, '/', geo.full.verts);

  console.log('[C] 텍스처·재질·예산');
  const bud = await p.evaluate(() => {
    SL.view3d.begin('tamago'); const m = SL.view3d._dbg.mats(), sz = (t) => [t.image.width, t.image.height];
    return { body: sz(m.body.map), bodyN: sz(m.body.normalMap), cap: sz(m.cap.map), capN: sz(m.cap.normalMap), rough: m.body.roughness, metal: m.body.metalness, shadowMap: SL.view3d._dbg.renderer().shadowMap.enabled };
  });
  ok(bud.body[0] === 1024 && bud.bodyN[0] === 512 && bud.cap[0] === 512 && bud.capN[0] === 512, '텍스처 크기(몸통 1024, 몸통 노멀 512, 절단면 512/512)', bud);
  ok(bud.rough >= 0.9 && bud.metal === 0, '강한 광택 없음(roughness ≥ 0.9, metalness 0)', bud);
  ok(!bud.shadowMap, '그림자맵 미사용(도마 위 접지 그림자 판)');

  console.log('[D] 하나 잘랐을 때');
  await p.click('#btn-start'); await p.click('.ing-cell[data-id="tamago"]'); await p.click('#btn-play');
  ok(await p.evaluate(() => SL_DEBUG.use3d()), '계란말이는 3D 로 플레이');
  await p.evaluate(() => { SL_DEBUG.setKnife(130); SL_DEBUG.cut(); });
  await p.waitForTimeout(700);
  const one = await p.evaluate(() => {
    const d = SL.view3d._dbg, ps = d.pieces(), b = d.body();
    return { n: ps.length, t: ps[0].thickness, ud: ps[0].geo.userData.thickness, ang: ps[0].group.rotation.z * 180 / Math.PI, x: ps[0].group.position.x - ps[0].a, bodyA: b.a, bodyB: b.b, bodyUd: b.geo.userData.thickness };
  });
  ok(one.n === 1 && one.t === 130 && one.ud === 130 && one.bodyA === 130 && one.bodyB === 1000 && one.bodyUd === 870, '조각 130 + 남은 몸통 870, 두께 데이터 유지', one);
  ok(one.ang > 2 && one.ang < 10.5, '잘린 조각이 기울어져 정착', one.ang);
  ok(one.x < -5 && one.x > -30, '잘린 조각이 왼쪽으로 살짝 벌어짐', one.x);
  await p.screenshot({ path: path.join(ROOT, 'screenshot', '3d_one_cut.png') });

  console.log('[E] 9회 연속 절단 · 겹침/도마 관통');
  const cuts = [130, 213, 305, 420, 498, 640, 700, 845, 905], expect = [130, 83, 92, 115, 78, 142, 60, 145, 60, 95];
  for (const x of cuts.slice(1)) { await p.evaluate((v) => { SL_DEBUG.setKnife(v); SL_DEBUG.cut(); }, x); await p.waitForTimeout(260); }
  await p.waitForTimeout(500);
  const fin = await p.evaluate(() => {
    const d = SL.view3d._dbg, ps = d.pieces(), out = { n: ps.length, th: ps.map((q) => q.thickness), ud: ps.map((q) => q.geo.userData.thickness), body: !!d.body() };
    out.angs = ps.map((q) => +(q.group.rotation.z * 180 / Math.PI).toFixed(2));
    out.sum = out.th.reduce((a, c) => a + c, 0);
    function world(q) { q.group.updateMatrixWorld(true); const P = q.geo.attributes.position, v = new THREE.Vector3(), r = []; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(q.mesh.matrixWorld); r.push(v.clone()); } return r; }
    const W = ps.map(world);
    out.minY = Math.min.apply(null, W.map((w) => Math.min.apply(null, w.map((v) => v.y))));
    out.gap = [];
    for (let i = 1; i < ps.length; i++) {      // i 의 왼쪽 면 평면에서 i−1 의 가장 가까운 정점까지의 거리(양수 = 틈)
      const P = ps[i].geo.attributes.position, N = ps[i].geo.attributes.normal; let p0 = null, n0 = null;
      for (let k = 0; k < P.count; k++) if (Math.abs(P.getX(k) - ps[i].a) < 1e-6 && N.getX(k) === -1) { p0 = new THREE.Vector3().fromBufferAttribute(P, k).applyMatrix4(ps[i].mesh.matrixWorld); n0 = new THREE.Vector3(-1, 0, 0).transformDirection(ps[i].mesh.matrixWorld); break; }
      let mn = 1e9; W[i - 1].forEach((v) => { mn = Math.min(mn, v.clone().sub(p0).dot(n0)); });
      out.gap.push(+mn.toFixed(2));
    }
    out.maxAng = Math.max.apply(null, out.angs);
    out.minLeft = Math.min.apply(null, ps.map((q) => q.group.position.x));
    out.tris = ps.reduce((a, q) => a + q.geo.userData.triangles, 0);
    out.meshes = 0; d.scene().traverse((o) => { if (o.isMesh && o.visible !== false) out.meshes++; });
    return out;
  });
  ok(fin.n === 10 && !fin.body, '9번 절단 → 조각 10개(남은 끝부분이 10번째), 몸통 메시 없음', { n: fin.n, body: fin.body });
  ok(JSON.stringify(fin.th) === JSON.stringify(expect) && JSON.stringify(fin.ud) === JSON.stringify(expect) && fin.sum === 1000, '실제 절단 간격대로 조각마다 두께가 다르고(데이터 유지) 합 = 1000', fin.th);
  ok(fin.gap.every((g, i) => i === fin.gap.length - 1 ? g > 0.5 : g > -0.5), '이웃 조각이 눈에 띄게 파고들지 않음(앞서 잘린 조각끼리는 맞닿고 기울기 차이로 생기는 겹침 < 0.5 월드 단위 ≈ 0.4px, 막 잘린 조각과 몸통 사이엔 틈)', fin.gap);
  ok(fin.minY > -0.01, '도마를 뚫고 내려가지 않음', fin.minY);
  ok(fin.maxAng <= 10.2, '기울기 상한(오버슈트 포함)', fin.maxAng);
  ok(fin.minLeft > -150 + 5, '가장 왼쪽 조각이 도마 안', fin.minLeft);
  console.log('   각도', fin.angs.join(','), '\n   틈', fin.gap.join(','), ' 메시', fin.meshes, ' 삼각형', fin.tris);
  ok(fin.meshes <= 36 && fin.tris <= 6000, '메시·삼각형 예산(보이는 메시 ≤ 36, 삼각형 ≤ 6000)', { meshes: fin.meshes, tris: fin.tris });
  await p.screenshot({ path: path.join(ROOT, 'screenshot', '3d_nine_cuts.png') });

  await p.waitForFunction(() => SL_DEBUG.state().screen === 'result', null, { timeout: 5000 });
  const res = await p.evaluate(() => SL_DEBUG.state());
  ok(res.th.length === 10 && JSON.stringify(res.th) === JSON.stringify(expect), '결과 화면 도달 — 두께 균일도 평가 적용', { score: res.result.score, grade: res.result.grade });
  const ink = await p.evaluate(() => { const c = document.getElementById('result-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  ok(ink > 8000, '결과 3D 비주얼이 그려짐', ink);
  await p.screenshot({ path: path.join(ROOT, 'screenshot', '3d_result_uneven.png') });

  console.log('[F] 재도전·성능');
  await p.click('#btn-again');
  ok(await p.evaluate(() => SL.view3d._dbg.pieces().length === 0 && !!SL.view3d._dbg.body() && SL_DEBUG.state().cuts.length === 0), '다시 썰기 → 몸통 새로 생성·조각 0개(메시 누수 없음)');
  const perf = await p.evaluate(() => new Promise((res) => {
    const cv = document.getElementById('stage'), t = []; let n = 0;
    (function f() { const a = performance.now(); SL.view3d.renderPlay(cv, { knife: 100, done: false }, 0, 0, { top: 92, bottom: 700 }); SL.view3d._dbg.renderer().getContext().finish(); t.push(performance.now() - a); if (++n < 40) requestAnimationFrame(f); else res(t.reduce((x, y) => x + y, 0) / t.length); })();
  }));
  console.log('   renderPlay 평균', perf.toFixed(1), 'ms (헤드리스 SwiftShader = 소프트웨어 렌더, 실기기 GPU 수치가 아님)');
  ok(errs.length === 0, '콘솔 에러 없음', errs);
  await b.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
