/* 재료별 절단 횟수 · 가변 레이아웃 · 효과음 · 도전장 QA — node tools/qaz.js   (먼저 node tools/serve.js 8099)
 *  [1] 재료 4종 끝까지 썰기: 카운터·완료 시점·결과 조각 수가 설정(cuts)과 일치, 점수 목표 두께 = 1000/조각수
 *  [2] 효과음: 절단 성공 때만 1회(스윽→탁, 간격 = CHOP_MS/2), 이동·키 길게 누름은 무음, 변주가 연속으로 같지 않음
 *  [3] 창 크기·줌(80/100/125%): 플레이 16:9 프레임, HUD·조작이 도마·칼과 겹치지 않음, 카운터 위치 고정, 줌 중 진행 상태 유지
 *  [4] 선택·결과 화면 반응형: 넓은 창 좌우 / 좁은 창 위아래, 제목·그리드·버튼 같은 열, 받침(앞 모서리) 위치가 재료·화면과 무관
 *  [5] 도전장: 링크 생성 → 열기 → 도전 시작(같은 재료) → 대결 결과 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pw = require(path.join(ROOT, '..', '..', '260624', 'build', 'node_modules', 'playwright-core'));
const BASE = 'http://localhost:8099/index.html';
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const CUTS = { naruto: 14, tamago: 9, salmon: 11, cucumber: 24 };
const ING = Object.keys(CUTS);

(async () => {
  const b = await pw.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  async function open(w, h, o) {
    o = o || {};
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: o.dsf || 1, hasTouch: !!o.touch, isMobile: !!o.touch, permissions: ['clipboard-read', 'clipboard-write'] }), p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/pretendard|net::ERR|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
    await p.goto(o.url || BASE);
    await p.waitForFunction(() => window.SL && SL.assets && SL.assets.loaded);
    await p.waitForTimeout(150);
    return { ctx, p };
  }
  const st = (p) => p.evaluate(() => SL_DEBUG.state());
  const ct = async (p) => (await p.textContent('#hud-cuts')).replace(/ /g, ' ').replace(/^\s+/, '');   // 카운터는 앞자리를 figure space 로 채운다
  async function startGame(p, id) { await p.click('#btn-start'); await p.click('.ing-cell[data-id="' + id + '"]'); await p.click('#btn-play'); await p.waitForTimeout(300); }
  const cutAt = async (p, x) => { await p.evaluate((x) => SL_DEBUG.setKnife(x), x); await p.keyboard.press(' '); await p.waitForTimeout(190); };

  console.log('[1] 재료 4종 끝까지 썰기');
  for (const id of ING) {
    const { ctx, p } = await open(1280, 720);
    await startGame(p, id);
    let s = await st(p);
    ok(s.n === CUTS[id] && s.ing === id, `${id}: 절단 횟수 설정 ${CUTS[id]}회`, s.n);
    ok((await ct(p)) === `0 / ${CUTS[id]}`, `${id}: 카운터 시작 0 / ${CUTS[id]}`);
    let counterOk = true, doneEarly = false;
    for (let i = 1; i <= CUTS[id]; i++) {
      await cutAt(p, i * 1000 / (CUTS[id] + 1));
      s = await st(p);
      if ((await ct(p)) !== `${i} / ${CUTS[id]}` || s.cuts.length !== i) counterOk = false;
      if (i < CUTS[id] && s.phase !== 'play') doneEarly = true;
    }
    ok(counterOk, `${id}: 성공한 절단마다 카운터 1씩 증가`);
    ok(!doneEarly, `${id}: 마지막 절단 전에는 완료되지 않음`);
    ok(s.phase === 'settle', `${id}: ${CUTS[id]}번째 절단에서 완료(정착) 시작`, s.phase);
    await p.keyboard.press(' '); await p.waitForTimeout(120);
    ok((await st(p)).cuts.length === CUTS[id], `${id}: 완료 뒤 추가 절단 무시`);
    await p.waitForFunction(() => SL_DEBUG.state().screen === 'result', null, { timeout: 5000 });
    s = await st(p);
    ok(s.th.length === CUTS[id] + 1, `${id}: 결과 조각 수 ${CUTS[id] + 1} (마지막 남은 끝 조각 포함)`, s.th.length);
    ok(Math.abs(s.th.reduce((a, c) => a + c, 0) - 1000) < 1e-6, `${id}: 조각 두께 합 = 재료 전체 길이`);
    ok(s.result.score === 100 && Math.abs(s.result.ideal - 1000 / (CUTS[id] + 1)) < 1e-9, `${id}: 균등하게 썰면 100점, 목표 두께 = 1000/${CUTS[id] + 1}`, s.result);
    await p.screenshot({ path: path.join(ROOT, 'screenshot', `z_${id}_result.png`) });
    // 재시작 / 재료 변경 시 초기화
    await p.click('#btn-again'); await p.waitForTimeout(250);
    s = await st(p);
    ok(s.cuts.length === 0 && s.screen === 'play' && (await ct(p)) === `0 / ${CUTS[id]}`, `${id}: 다시 썰기 → 조각·카운터 초기화`);
    await ctx.close();
  }

  console.log('[2] 효과음');
  {
    const { ctx, p } = await open(1280, 720);
    await startGame(p, 'cucumber');
    ok((await p.evaluate(() => SL.sfx._state())) === 'running', '오디오 컨텍스트가 사용자 동작 뒤 running');
    await p.evaluate(() => { SL.sfx._log.length = 0; });
    await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight');
    await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(300); await p.keyboard.up('ArrowLeft');
    ok((await p.evaluate(() => SL.sfx._log.length)) === 0, '칼 이동·키 길게 누름에는 효과음 없음');
    await p.evaluate(() => SL_DEBUG.setKnife(40)); await p.keyboard.press(' '); await p.waitForTimeout(60);
    await p.keyboard.press(' '); await p.waitForTimeout(60);                       // 같은 위치 재절단 → 실패해야 함
    ok((await p.evaluate(() => SL.sfx._log.length)) === 1, '절단 성공 1번 = 효과음 1번(같은 위치 재시도 실패는 무음)');
    for (let i = 2; i <= 24; i++) await cutAt(p, i * 40);
    const lg = await p.evaluate(() => SL.sfx._log.map((r) => ({ v: r.v, d: r.thockAt - r.at, played: r.played })));
    ok(lg.length === 24 && lg.every((r) => r.played), '오이 24회 → 효과음 24회', lg.length);
    ok(lg.every((r) => Math.abs(r.d - 0.04) < 1e-6), '탁 = 스윽 + (BOARD−RESIST) = 약 40ms 뒤, 칼날이 도마에 닿는 시점', lg.map((r) => r.d)[0]);
    let repeat = 0; for (let i = 1; i < lg.length; i++) if (lg[i].v === lg[i - 1].v) repeat++;
    ok(repeat === 0 && new Set(lg.map((r) => r.v)).size === 3, '오이: 비슷한 소리 3종을 번갈아 쓰고 연속으로 같은 소리가 없음', lg.map((r) => r.v).join(''));
    await ctx.close();
    // 재료별 합성 확인(오프라인 렌더로 에너지·길이 비교)
    const { ctx: c2, p: p2 } = await open(1280, 720);
    await p2.click('#btn-start');
    const prof = await p2.evaluate(async () => {
      const out = {};
      for (const id of ['cucumber', 'tamago', 'salmon', 'naruto']) {
        const r = SL.sfx._render(id);
        out[id] = await r;
      }
      return out;
    });
    for (const id of ING) ok(prof[id] && prof[id].peak > 0.02 && prof[id].peak <= 1 && prof[id].len > 0.05, `${id}: 합성 소리가 비어있지 않고 클리핑 없음`, prof[id]);
    await c2.close();
  }

  console.log('[3] 창 크기 · 줌 · 겹침');
  {
    const cases = [[1920, 1080, 1], [1920, 1080, 0.8], [1920, 1080, 1.25], [1280, 720, 1], [844, 390, 1], [390, 844, 1], [1000, 1000, 1]];
    for (const [w, h, z] of cases) {
      const { ctx, p } = await open(Math.round(w / z), Math.round(h / z), { dsf: z });
      await startGame(p, 'cucumber');
      for (let i = 1; i <= 8; i++) await cutAt(p, i * 50);
      await p.evaluate(() => SL_DEBUG.setKnife(480)); await p.waitForTimeout(150);
      const r = await p.evaluate(() => {
        const R = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { l: e.left, t: e.top, r: e.right, b: e.bottom, w: e.width, h: e.height }; };
        const s = SL_DEBUG.state(), k = SL.FIT.k, fr = R('#stage-frame');
        const food = s.lay ? { l: fr.l + s.lay.g.x0 * k, r: fr.l + (s.lay.g.x0 + s.lay.g.w) * k, t: fr.t + (s.lay.g.yc - s.lay.g.h / 2) * k, b: fr.t + (s.lay.g.yc + s.lay.g.h / 2) * k } : null;
        const kn = s.knife2 ? { x: fr.l + s.knife2.x * k, t: fr.t + s.knife2.tipY * k, b: fr.t + s.knife2.bottomY * k } : null;
        return { fr, hud: R('.hud'), hint: R('#hint'), pad: R('.pad-group'), cut: R('.pad-cut'), mark: R('.watermark'), food, kn, cuts: s.cuts.length, text: document.getElementById('hud-cuts').textContent, vw: innerWidth, vh: innerHeight };
      });
      const hit = (a, c) => a.l < c.r - 1.5 && a.r > c.l + 1.5 && a.t < c.b - 1.5 && a.b > c.t + 1.5;   // 1.5px 이내 접촉은 겹침으로 보지 않는다
      const tag = `${w}×${h} 줌${Math.round(z * 100)}%`;
      ok(Math.abs(r.fr.w - r.vw) <= 1 && Math.abs(r.fr.h - r.vh) <= 1, `${tag}: 플레이 화면이 창 전체를 덮음(가로·세로 모두 빈 띠 없음, 배경이 연장됨)`, [r.fr.w, r.fr.h, r.vw, r.vh]);
      ok(!hit(r.hud, r.hint) && !hit(r.hud, r.cut) && !hit(r.hint, r.pad) && !hit(r.hint, r.cut) && !hit(r.pad, r.cut), `${tag}: 카운터·안내·이동·썰기 버튼이 서로 겹치지 않음`);
      const kb = { l: r.kn.x - 4, r: r.kn.x + 4, t: r.kn.t, b: r.kn.b };
      ok(!hit(r.pad, r.food) && !hit(r.cut, r.food) && !hit(r.pad, kb) && !hit(r.cut, kb) && !hit(r.hud, r.food) && !hit(r.hud, kb) && !hit(r.hint, r.food), `${tag}: HUD·조작이 도마 위 재료·칼과 겹치지 않음`);
      ok(r.hud.l >= r.fr.l && r.pad.l >= r.fr.l && r.cut.r <= r.fr.r + 0.5 && r.pad.b <= r.fr.b + 0.5 && r.hint.t >= r.fr.t, `${tag}: 조작·HUD가 프레임 가장자리 안(여백 있음)`);
      ok(r.cuts === 8 && r.text.replace(/ /g, ' ').trim() === '8 / 24', `${tag}: 줌/크기 변경 후에도 진행 상태 유지`, [r.cuts, r.text]);
      await p.screenshot({ path: path.join(ROOT, 'screenshot', `z_play_${w}x${h}_${Math.round(z * 100)}.png`) });
      await ctx.close();
    }
    // 창 크기를 진행 중에 바꿔도 절단 상태 유지 + 칼 위치 불변(논리 좌표)
    const { ctx, p } = await open(1280, 720);
    await startGame(p, 'salmon'); await cutAt(p, 200); await cutAt(p, 400); await p.evaluate(() => SL_DEBUG.setKnife(555)); await p.waitForTimeout(100);
    const a = await st(p);
    await p.setViewportSize({ width: 700, height: 500 }); await p.waitForTimeout(300);
    const c = await st(p);
    const rel = (z) => (z.knife2.x - z.lay.g.x0) / z.lay.g.w;   // 배경 확대율이 프레임 크기에 따라 달라지므로, 재료 길이 대비 칼 위치(=절단 위치)가 같은지 본다
    ok(c.cuts.join() === a.cuts.join() && c.knife === a.knife && Math.abs(rel(c) - rel(a)) < 1e-3 && Math.abs(c.lay.g.w / c.lay.s - a.lay.g.w / a.lay.s) < 1e-6, '진행 중 창 크기·확대율 변경: 절단 상태 유지, 칼은 재료 위 같은 지점, 재료·배경 같은 비율');
    // 카운터 위치 고정 (9→10)
    const { ctx: c3, p: p3 } = await open(1280, 720);
    await startGame(p3, 'cucumber');
    for (let i = 1; i <= 8; i++) await cutAt(p3, i * 50);
    const x9 = await p3.evaluate(() => document.getElementById('hud-cuts').getBoundingClientRect().left);
    await cutAt(p3, 450); await cutAt(p3, 500);
    const x10 = await p3.evaluate(() => document.getElementById('hud-cuts').getBoundingClientRect().left);
    ok(Math.abs(x9 - x10) < 0.01 && (await ct(p3)) === '10 / 24', '카운터 9→10 전환에도 위치 고정');
    await ctx.close(); await c3.close();
  }

  console.log('[4] 선택·결과 반응형 / 받침 정렬');
  {
    const edge = (p, sel) => p.evaluate((sel) => {
      const cv = document.querySelector(sel), c = cv.getContext('2d'), w = cv.width, h = cv.height, d = c.getImageData(0, 0, w, h).data;
      let top = h, bot = -1, l = w, r = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] > 40 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) { if (y < top) top = y; if (y > bot) bot = y; if (x < l) l = x; if (x > r) r = x; } }
      return { top: top / h, bot: bot / h, l: l / w, r: r / w };
    }, sel);
    for (const [w, h, z] of [[1440, 900, 1], [1800, 1125, 0.8], [1152, 720, 1.25], [844, 390, 1], [390, 844, 1], [768, 1024, 1]]) {
      const { ctx, p } = await open(w, h, { dsf: z });
      const tag = `${w}×${h}`;
      await p.click('#btn-start'); await p.waitForTimeout(100);
      const lay = await p.evaluate(() => {
        const R = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { l: e.left, t: e.top, r: e.right, b: e.bottom, w: e.width, h: e.height }; };
        const cells = [...document.querySelectorAll('.ing-cell')].map((e) => e.getBoundingClientRect());
        return { vis: R('#screen-select .slot-visual'), title: R('#screen-select .slot-title'), grid: R('#ing-grid'), btn: R('#btn-play'), cells: cells.map((c) => [c.width, c.height]), vw: innerWidth, sw: document.documentElement.scrollWidth, tr: getComputedStyle(document.getElementById('screen-select')).transform };
      });
      const wide = lay.vis.r <= lay.title.l + 1 && lay.vis.t < lay.title.b;
      const expectWide = !(w / z < 720 || w / h <= 1.25);
      ok(wide === expectWide, `${tag} 줌${Math.round(z * 100)}%: 선택 화면 ${expectWide ? '좌우(미리보기|정보)' : '위아래'} 배치`, { wide });
      ok(Math.abs(lay.title.l - lay.grid.l) < 0.5 && Math.abs(lay.grid.l - lay.btn.l) < 0.5 && Math.abs(lay.grid.w - lay.btn.w) < 0.5, `${tag}: 제목·재료 그리드·시작 버튼이 같은 열(왼쪽·폭 일치)`);
      ok(lay.cells.every((c) => Math.abs(c[0] - lay.cells[0][0]) < 0.5 && Math.abs(c[1] - lay.cells[0][1]) < 0.5), `${tag}: 재료 버튼 크기 동일`);
      ok(lay.tr === 'none' && lay.sw <= lay.vw, `${tag}: 선택 화면에 확대·축소 변환 없음, 가로 넘침 없음`);
      // 받침 위치: 재료/화면이 달라도 받침 가장자리 동일
      const shots = {};
      for (const id of ING) { await p.click('.ing-cell[data-id="' + id + '"]'); await p.waitForTimeout(60); shots[id] = await edge(p, '#select-canvas'); }
      const ref = shots.tamago;   // 선택 화면은 넣어 둔 재료 이미지를 쓴다 → 실제 보이는 영역의 가로·세로 중심이 박스 중앙, 재료 폭 비율(원래 길이·굵기 차이)은 유지
      ok(ING.every((id) => Math.abs((shots[id].l + shots[id].r) / 2 - 0.5) < 0.01 && Math.abs((shots[id].top + shots[id].bot) / 2 - 0.5) < 0.01), `${tag}: 재료를 바꿔도 이미지가 박스 가로·세로 중앙(보이는 영역 기준)`, shots);
      if (w === 1440 || w === 390) await p.screenshot({ path: path.join(ROOT, 'screenshot', `z_select_${w}x${h}.png`) });
      // 결과 화면
      await p.click('.ing-cell[data-id="tamago"]'); await p.click('#btn-play'); await p.waitForTimeout(250);
      for (let i = 1; i <= 9; i++) await cutAt(p, i * 100);
      await p.waitForFunction(() => SL_DEBUG.state().screen === 'result', null, { timeout: 5000 });
      await p.waitForTimeout(200);
      const hd = await p.evaluate(() => { const e = SL.ending.state(); return e && { n: e.info.n, row: e.info.row, pw: e.L.pw, ph: e.L.ph, food: e.food }; });
      ok(hd && hd.n === 10 && hd.food && hd.row.x0 > 0 && hd.row.x1 < hd.pw && hd.row.y0 > 0 && hd.row.y1 < hd.ph, `${tag}: 결과 화면 엔딩 — 접시 위 가로 한 줄 조각 10개가 캔버스 안에 그려짐`, hd);
      const rl = await p.evaluate(() => {
        const R = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { l: e.left, t: e.top, r: e.right, b: e.bottom, w: e.width, h: e.height }; };
        return { score: R('#result-score'), grade: R('#result-grade'), cmt: R('#result-detail'), a: R('#btn-again'), c: R('#btn-change'), ch: R('#btn-challenge') };
      });
      ok(Math.abs(rl.score.l - rl.grade.l) < 0.5 && Math.abs(rl.grade.l - rl.cmt.l) < 0.5, `${tag}: 점수·등급·안내 문구가 같은 기준선(왼쪽 정렬)`);
      ok(Math.abs(rl.a.w - rl.c.w) < 0.5 && Math.abs(rl.a.h - rl.c.h) < 0.5 && Math.abs(rl.a.t - rl.c.t) < 0.5 && Math.abs(rl.c.l - rl.a.r - 12) < 0.5 && Math.abs(rl.ch.l - rl.a.l) < 0.5 && Math.abs(rl.ch.r - rl.c.r) < 0.5, `${tag}: 다시 썰기·재료 바꾸기 버튼 너비·간격 동일, 도전장 버튼과 같은 열`, rl);
      if (w === 1440 || w === 390) await p.screenshot({ path: path.join(ROOT, 'screenshot', `z_result_${w}x${h}.png`) });
      await ctx.close();
    }
  }

  console.log('[6] 재료 드래그 · 눌림 · 상단 배치');
  {
    const { ctx, p } = await open(1280, 720);
    await startGame(p, 'tamago');
    const geo = () => p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { l: r.left, t: r.top, k: SL.FIT.k, food: SL_DEBUG.state().food, s: SL_DEBUG.state() }; });
    const pt = (g, x, y) => [g.l + x * g.k, g.t + y * g.k];
    let g = await geo();
    const hudR = await p.evaluate(() => { const R = (s) => document.querySelector(s).getBoundingClientRect(); const h = R('#hint'), c = R('#hud-cuts'), w = R('.watermark'), f = R('#stage-frame'); return { hint: [h.top, h.bottom, h.left + h.width / 2], cnt: [c.top, c.bottom, c.left + c.width / 2], wm: [w.left + w.width / 2, w.bottom], fr: [f.left + f.width / 2, f.bottom, f.top, f.height] }; });
    ok(!(await p.$('.hud-label')), '절단 글자 삭제');
    ok(hudR.cnt[0] >= hudR.hint[1] - 0.5 && Math.abs(hudR.cnt[2] - hudR.hint[2]) < 1, '카운터가 상단 중앙 문구 바로 아래 중앙');
    ok((hudR.hint[0] - hudR.fr[2]) / hudR.fr[3] > 0.095, '안내 문구가 배경 램프 아래로 내려옴', (hudR.hint[0] - hudR.fr[2]) / hudR.fr[3]);
    ok(Math.abs(hudR.wm[0] - hudR.fr[0]) < 1.5 && hudR.wm[1] <= hudR.fr[1], '꼬직 로고(@ccojik.dh)가 가운데 아래');
    const f0 = g.food, mid = (f0.top + f0.bottom) / 2, x0 = (f0.bodyL + f0.bodyR) / 2;
    // 집어 올리기: 잡으면 살짝 뜸, 잡은 지점이 커서 아래 유지(이동량 = 커서 변위), 놓으면 그 자리
    let [mx, my] = pt(g, x0, mid);
    await p.mouse.move(mx, my); await p.mouse.down(); await p.waitForTimeout(160);
    ok(await p.evaluate(() => SL_DEBUG.dragging()), '재료를 누르면 드래그 시작');
    let a = (await geo()).food;
    ok(a.lift > 3 && a.lift <= 7.01, '잡으면 도마에서 살짝 들림', a.lift);
    ok(Math.abs(a.shift.x) < 0.5 && Math.abs(a.shift.y) < 0.5, '잡는 순간 재료가 커서 쪽으로 튀지 않음', a.shift);
    const kx0 = a.knifeX, stK0 = (await st(p)).knife;
    await p.mouse.move(mx + 50 * g.k, my + 20 * g.k, { steps: 6 }); await p.waitForTimeout(80);
    a = (await geo()).food;
    ok(Math.abs(a.shift.x - 50) < 1.5 && Math.abs(a.shift.y - 20) < 1.5, '커서를 따라 움직임(잡은 지점 유지, 가로 방향 유지)', a.shift);
    ok(Math.abs(a.knifeX - kx0) < 0.5, '재료만 움직이고 칼의 화면 위치는 그대로');
    ok(Math.abs((await st(p)).knife - (stK0 - 50 / a.pxPerUnit)) < 0.5, '새 위치 기준으로 칼의 덩어리 좌표가 바뀜(접촉 판정 기준 변경)');
    await p.evaluate(() => { SL.sfx._log.length = 0; }); await p.keyboard.press(' '); await p.waitForTimeout(120);
    ok((await st(p)).cuts.length === 0 && (await p.evaluate(() => SL.sfx._log.length)) === 0, '드래그 중에는 썰기·효과음 없음');
    await p.mouse.move(mx - 900 * g.k, my - 600 * g.k, { steps: 8 }); await p.waitForTimeout(60);
    let L = (await geo()).food;
    const lay0 = (await geo()).s.lay, s0 = lay0.s, BD = await p.evaluate(() => SL.C.KITCHEN.BOARD);
    ok(L.bodyL >= lay0.ox + BD.L * s0 - 0.5 && L.top >= lay0.oy + BD.T * s0 - 0.5, '왼쪽·위로 끌어도 도마 안에 머묾', [L.bodyL, L.top]);
    await p.mouse.move(mx + 1200 * g.k, my + 600 * g.k, { steps: 8 }); await p.waitForTimeout(60);
    L = (await geo()).food;
    ok(L.bodyR <= lay0.ox + BD.R * s0 + 0.5 && L.bottom <= lay0.oy + BD.B * s0 + 0.5, '오른쪽·아래로 끌어도 도마 안에 머묾', [L.bodyR, L.bottom]);
    await p.mouse.up(); await p.waitForTimeout(40);
    ok(!(await p.evaluate(() => SL_DEBUG.dragging())), '버튼을 놓으면 드래그 종료');
    const samples = []; for (let i = 0; i < 24; i++) { samples.push((await geo()).food.squash); await p.waitForTimeout(40); }
    const mn = Math.min(...samples), mxs = Math.max(...samples);
    ok(mxs > 0.02 && mxs < 0.08, '놓으면 도마에 닿는 순간 미세하게 눌림(계란말이 ~5%)', mxs);
    ok(mn < 0 && mn > -0.02, '눌린 뒤 아주 살짝 되튀며 제자리(통)', mn);
    ok(Math.abs(samples[samples.length - 1]) < 0.002 && (await geo()).food.lift === 0, '약 1초 안에 완전히 안정, 들림 0');
    const placed = (await geo()).food.shift;
    ok(Math.abs(placed.x - L.shift.x) < 0.5 && Math.abs(placed.y - L.shift.y) < 0.5, '놓은 자리에 그대로 남음');
    // 이동 후 절단: 눌림과 무관하게 칼 위치 그대로 절단 → 잘린 조각은 제자리, 덩어리만 다시 옮겨짐
    await p.evaluate(() => SL_DEBUG.setKnife(480));
    await p.keyboard.press(' '); await p.waitForTimeout(220);
    const s1 = await st(p);
    ok(s1.cuts.length === 1 && Math.abs(s1.cuts[0] - 480) < 1e-6, '이동 후 절단: 칼 위치 그대로 정확히 절단(눌림은 판정과 무관)', s1.cuts);
    const pS0 = await p.evaluate(() => SL.view3d._dbg.pieces().map((q) => [q.S.x, q.S.y]));
    g = await geo(); const f1 = g.food;
    [mx, my] = pt(g, f1.bodyL - 60, (f1.top + f1.bottom) / 2);
    await p.mouse.move(mx, my); await p.mouse.down(); await p.waitForTimeout(80);
    ok(!(await p.evaluate(() => SL_DEBUG.dragging())), '잘린 조각은 집을 수 없음');
    await p.mouse.up();
    [mx, my] = pt(g, (f1.bodyL + f1.bodyR) / 2, (f1.top + f1.bottom) / 2);
    await p.mouse.move(mx, my); await p.mouse.down(); await p.waitForTimeout(100);
    await p.mouse.move(mx - 700 * g.k, my, { steps: 8 }); await p.waitForTimeout(80);
    const pcs = await p.evaluate(() => SL.view3d._dbg.pieces().map((q) => [q.S.x, q.S.y]));
    const f2 = (await geo()).food;
    ok(JSON.stringify(pcs) === JSON.stringify(pS0), '덩어리를 옮겨도 이미 잘린 조각은 놓인 자리에 그대로');
    ok(f2.bodyL >= f1.bodyL - 14, '덩어리를 잘린 조각 쪽으로 끌어도 조각과 겹치지 않게 멈춤(왼쪽 한계)', [f1.bodyL, f2.bodyL]);
    await p.mouse.up(); await p.waitForTimeout(100);
    ok((await st(p)).cuts.length === 1, '옮긴 뒤에도 누적 절단 횟수 유지(1)');
    await p.screenshot({ path: path.join(ROOT, 'screenshot', 'z_drag_after.png') });
    const feel = await p.evaluate(() => SL.C.DRAG.FEEL);
    ok(feel.salmon.A > feel.tamago.A && feel.tamago.A > feel.naruto.A && feel.naruto.A > feel.cucumber.A && feel.salmon.tau > feel.tamago.tau && feel.cucumber.w > feel.salmon.w, '재료마다 눌림 정도·돌아오는 속도가 다름(오이 단단/연어 묵직)');
    await ctx.close();
    // 터치 드래그(CDP)
    const { ctx: tc, p: tp } = await open(844, 390, { touch: true });
    await tp.tap('#btn-start'); await tp.tap('.ing-cell[data-id="cucumber"]'); await tp.tap('#btn-play'); await tp.waitForTimeout(350);
    const cdp = await tc.newCDPSession(tp);
    const tg = await tp.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(), f = SL_DEBUG.state().food; return { l: r.left, t: r.top, k: SL.FIT.k, f }; });
    const tx = tg.l + ((tg.f.bodyL + tg.f.bodyR) / 2) * tg.k, ty = tg.t + ((tg.f.top + tg.f.bottom) / 2) * tg.k;
    const sy0 = await tp.evaluate(() => window.scrollY);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty, id: 1 }] }); await tp.waitForTimeout(100);
    ok(await tp.evaluate(() => SL_DEBUG.dragging()), '터치: 재료를 누르면 드래그 시작');
    const dxs = 40 * tg.k;
    for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + dxs * i / 5, y: ty, id: 1 }] }); await tp.waitForTimeout(30); }
    const tsh = await tp.evaluate(() => SL_DEBUG.state().food.shift);
    ok(Math.abs(tsh.x - 40) < 2, '터치: 손가락을 따라 움직임(잡은 지점 유지)', tsh);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await tp.waitForTimeout(100);
    ok(!(await tp.evaluate(() => SL_DEBUG.dragging())) && Math.abs((await tp.evaluate(() => SL_DEBUG.state().food.shift.x)) - tsh.x) < 0.5, '터치: 떼면 그 자리에 놓임');
    ok((await tp.evaluate(() => window.scrollY)) === sy0, '터치 드래그 중 페이지 스크롤 없음');
    await tc.close();
  }

  console.log('[7] 절단 연출 순서: 칼 접촉 → 저항 → 통과 → 도마(탁·카운터) → 조각 밀림');
  {
    for (const id of ['naruto', 'cucumber']) {
      const { ctx, p } = await open(844, 390);                  // 모바일 가로(작은 화면)에서도 낙폭이 읽히는지
      await startGame(p, id);
      await p.evaluate(() => SL_DEBUG.setKnife(300));
      const rec = await p.evaluate(() => new Promise((res) => {
        const out = [], t0 = performance.now(), c0 = SL.sfx._state() === 'running' ? 1 : 0; SL_DEBUG.cut();
        const id = setInterval(() => {
          const s = SL_DEBUG.state(), ps = SL.view3d._dbg.pieces();
          out.push({ t: performance.now() - t0, tip: s.knife2 && s.knife2.tipY, hud: document.getElementById('hud-cuts').textContent.replace(/ /g, ' ').trim(), sh: ps.length ? SL.view3d._dbg.shiftOf(ps[0], performance.now()) : 0, sq: s.food && s.food.squash });
          if (performance.now() - t0 > 320) { clearInterval(id); res(out); }
        }, 4);
      }));
      const lg = await p.evaluate(() => SL.sfx._log[SL.sfx._log.length - 1]);
      const base = rec[rec.length - 1].tip, ys = rec.filter((r) => r.tip != null).map((r) => ({ ...r, d: r.tip - base })), k = await p.evaluate(() => SL.FIT.k);
      const peak = ys.reduce((a, r) => (r.d > a.d ? r : a), ys[0]), U = await p.evaluate(() => SL.C.CUT);
      const real = peak.d * k;
      ok(real >= 12, `${id}: 모바일(작은 화면)에서도 칼이 내려가는 궤적이 읽힘(실제 낙폭 ${real.toFixed(1)}px ≥ 12)`, real);
      const fn = await p.evaluate(() => { const o = {}; for (let t = 0; t <= 175; t += 1) o[t] = SL_DEBUG.dropAt(t); return o; }), U2 = U;
      const surf = fn[U2.PRESS] * peak.d, res2 = fn[U2.RESIST] * peak.d, thr = fn[Math.round((U2.RESIST + U2.BOARD) / 2)] * peak.d;
      ok(surf > 0 && fn[U.PRESS] < 0.3 && fn[10] > 0, `${id}: 입력 직후 칼이 바로 내려와 표면에 닿음`, [fn[10], fn[U.PRESS]]);
      ok((fn[U.RESIST] - fn[U.PRESS]) / (U.RESIST - U.PRESS) < 0.5 * (1 - fn[U.RESIST]) / (U.BOARD - U.RESIST), `${id}: 표면에서 잠깐 저항(거의 멈춤) 뒤 빠르게 통과`, [fn[U.PRESS], fn[U.RESIST]]);
      ok(fn[U.BOARD] === 1 && fn[U.BOARD - 1] < 1 && thr > res2 + peak.d * 0.12 && peak.t > U.BOARD - 45 && peak.t < U.BOARD + 70, `${id}: 저항 뒤 끝까지 통과해 BOARD(${U.BOARD}ms)에 도마에 닿음(실측 최저점 ${peak.t.toFixed(0)}ms)`, [res2, thr, peak.t]);
      const hudT = (rec.find((r) => r.hud === '1 / ' + (id === 'naruto' ? 14 : 24)) || {}).t;
      ok(hudT >= U.BOARD - 12 && hudT <= U.BOARD + 40, `${id}: 카운터는 도마에 닿는 순간에만 갱신(${hudT && hudT.toFixed(0)}ms)`, hudT);
      ok(rec.filter((r) => r.t < U.BOARD - 16).every((r) => r.hud === '0 / ' + (id === 'naruto' ? 14 : 24)), `${id}: 그 전에는 카운터가 그대로`);
      const sepT = (rec.find((r) => r.sh > 0.3) || {}).t;
      ok(sepT >= U.SEP - 10 && sepT <= U.BOARD + 60, `${id}: 막 잘린 조각이 칼이 지나가는 순간(SEP ${U.SEP}ms 무렵)부터 옆으로 밀림(${sepT && sepT.toFixed(0)}ms)`, sepT);
      const fin = rec[rec.length - 1].sh;
      ok(fin > 3 && fin < 12 && Math.abs(rec[rec.length - 1].sh - rec[rec.length - 20].sh) < 0.2, `${id}: 조각 하나만 작은 틈(월드 ${fin.toFixed(1)})을 만들고 멈춤`, fin);
      ok(lg && lg.played && Math.abs((lg.thockAt - lg.at) - (U.BOARD - U.RESIST) / 1000) < 1e-6 && (U.BOARD - U.RESIST) <= 45, `${id}: 절단음→탁 간격 ${(U.BOARD - U.RESIST)}ms(길게 벌어지지 않는 한 번의 스윽탁)`, lg);
      ok(rec.every((r) => (r.sq || 0) < 0.02), `${id}: 칼 눌림 ≤ 2%(화면 흔들림·조각 튀김 없음)`);
      await p.screenshot({ path: path.join(ROOT, 'screenshot', `z_cut_${id}.png`) });
      await ctx.close();
    }
    // 오이 연속 썰기: 입력이 밀리지 않고, 소리가 뭉치지 않는다(앞 스윽 꼬리는 끊기고 탁은 매번 한 번)
    const { ctx, p } = await open(1280, 720);
    await startGame(p, 'cucumber');
    await p.evaluate(() => { SL.sfx._log.length = 0; });
    const burst = await p.evaluate(() => new Promise((res) => {
      const t0 = performance.now(); let i = 0; const times = [];
      const id = setInterval(() => { i++; SL_DEBUG.setKnife(i * 38); if (SL_DEBUG.cut()) times.push(performance.now() - t0); if (i >= 12) { clearInterval(id); res(times); } }, 70);
    }));
    await p.waitForTimeout(400);
    const bl = await p.evaluate(() => ({ cuts: SL_DEBUG.state().cuts.length, snd: SL.sfx._log.map((r) => ({ at: r.at, th: r.thockAt, v: r.v })), hud: document.getElementById('hud-cuts').textContent.replace(/ /g, ' ').trim() }));
    ok(burst.length === 12 && bl.cuts === 12 && bl.hud === '12 / 24', '오이 70ms 간격 연속 12회: 입력 하나도 밀리거나 빠지지 않고 카운터 12 / 24', [burst.length, bl.cuts, bl.hud]);
    ok(bl.snd.length === 12 && bl.snd.every((s) => s.th > s.at), '연속 12회 → 스윽탁 12번(탁은 매번 정확히 한 번)');
    let overlap = 0; for (let i = 1; i < bl.snd.length; i++) if (bl.snd[i].th - bl.snd[i - 1].th < 0.03) overlap++;
    ok(overlap === 0, '연속 썰기에서 탁 소리끼리 30ms 안에 겹치지 않음(뭉침 없음)');
    await ctx.close();
  }

  console.log('[8] 메인 화면: 모바일 세로 그룹 중앙 · 1열일 때 텍스트 가운데 정렬');
  {
    const measure = (p) => p.evaluate(() => {
      const R = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { l: e.left, t: e.top, r: e.right, b: e.bottom, w: e.width, h: e.height }; };
      const T = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const e = rg.getBoundingClientRect(); return { l: e.left, r: e.right, c: (e.left + e.right) / 2, h: e.height }; };
      const scr = document.getElementById('screen-intro'), cp = document.querySelector('#screen-intro .intro-copy');
      return { vis: R('#screen-intro .slot-visual'), title: R('#screen-intro .slot-title'), body: R('#screen-intro .slot-body'), btn: R('#btn-start'), tt: T('#screen-intro .slot-title'), ct: T('#screen-intro .intro-copy'), ta: getComputedStyle(cp).textAlign, tta: getComputedStyle(document.querySelector('#screen-intro .slot-title')).textAlign, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, scW: scr.scrollWidth, cw: scr.clientWidth, sh: scr.scrollHeight, ch: scr.clientHeight, st: scr.scrollTop };
    });
    for (const [w, h] of [[400, 904], [320, 568], [390, 844], [360, 420]]) {
      const { ctx, p } = await open(w, h);
      const r = await measure(p), tag = `${w}×${h}`, fits = r.sh <= r.ch + 1, vc = (r.vis.l + r.vis.r) / 2;
      ok(Math.abs(r.vis.l - r.title.l) < 0.5 && Math.abs(r.title.l - r.body.l) < 0.5 && Math.abs(r.vis.l - r.btn.l) < 0.5 && Math.abs(r.vis.r - r.btn.r) < 0.5, `${tag}: 이미지·제목·설명·버튼 좌우 기준선 일치(버튼은 콘텐츠 전체 폭)`, r);
      ok(r.vis.l >= 16 && r.vis.l <= 20 && Math.abs((r.vw - r.vis.r) - r.vis.l) < 0.5, `${tag}: 좌우 여백 16~20px 대칭`, [r.vis.l, r.vw - r.vis.r]);
      ok(Math.abs(r.vis.w / r.vis.h - 1.6) < 0.02, `${tag}: 이미지 박스 16:10 유지`, r.vis.w / r.vis.h);
      ok(Math.abs((r.title.t - r.vis.b) - (r.btn.t - r.body.b)) < 1, `${tag}: 이미지→제목 간격 = 설명→버튼 간격`, [r.title.t - r.vis.b, r.btn.t - r.body.b]);
      ok(r.sw <= r.vw && r.scW <= r.cw, `${tag}: 가로 스크롤 없음`, r);
      ok(Math.abs(r.tt.c - vc) < 1 && Math.abs(r.ct.c - vc) < 1 && r.ta === 'center' && r.tta === 'center', `${tag}: 제목·설명이 이미지 박스 가로 중앙선에 가운데 정렬`, [r.tt.c, r.ct.c, vc]);
      if (fits) ok(Math.abs(r.vis.t - (r.vh - r.btn.b)) < 2 && r.btn.b <= r.vh, `${tag}: 네 요소 그룹이 화면 높이 중앙(위·아래 여백 같음), 버튼까지 한 번에 보임`, [r.vis.t, r.vh - r.btn.b]);
      else {
        ok(r.vis.t >= 0 && r.st === 0, `${tag}: 콘텐츠가 넘치면 위쪽부터 시작`, r);
        ok(await p.evaluate(() => { document.getElementById('screen-intro').scrollTop = 9999; return document.getElementById('btn-start').getBoundingClientRect().bottom <= innerHeight + 1; }), `${tag}: 스크롤하면 시작하기 버튼에 닿음`);
      }
      if (w === 400 || w === 320) await p.screenshot({ path: path.join(ROOT, 'screenshot', `z_intro_${w}x${h}.png`) });
      await ctx.close();
    }
    // 창 너비 기준: PC 에서도 창을 좁혀 1열이 되면 가운데 정렬, 넓은 2열은 기존 왼쪽 정렬, 모바일 가로는 기존(2열) 유지
    for (const [w, h, stacked] of [[600, 900, true], [700, 500, true], [1000, 1000, true], [1440, 900, false], [844, 390, false]]) {
      const { ctx, p } = await open(w, h);
      const r = await measure(p), tag = `${w}×${h}`, vc = (r.vis.l + r.vis.r) / 2, isStacked = r.title.t >= r.vis.b - 1;
      ok(isStacked === stacked, `${tag}: ${stacked ? '1열(이미지 아래 텍스트)' : '좌우 2열'} 배치`, [r.vis, r.title]);
      if (stacked) ok(Math.abs(r.tt.c - vc) < 1 && Math.abs(r.ct.c - vc) < 1 && Math.abs(r.vis.l - r.btn.l) < 0.5 && Math.abs(r.vis.r - r.btn.r) < 0.5, `${tag}: 1열 — 제목·설명 가운데 정렬, 버튼은 이미지 박스와 같은 폭`, [r.tt.c, r.ct.c, vc]);
      else ok(r.ta === 'left' || r.ta === 'start', `${tag}: 2열 — 기존 왼쪽 정렬 유지`, r.ta);
      await ctx.close();
    }
  }

  console.log('[9] 엔딩: 덮개 열림 · 재료 공개 · 소리 · 스케일');
  {
    const run = async (p, id, n) => {
      await startGame(p, id);
      for (let i = 1; i <= n; i++) { let x = i * 1000 / (n + 1); if (i % 4 === 0) x += 12; await p.evaluate((x) => SL_DEBUG.setKnife(x), x); await p.keyboard.press(' '); await p.waitForTimeout(190); }
      await p.waitForFunction(() => SL_DEBUG.state().screen === 'result', null, { timeout: 15000 });
    };
    // 1) 실시간 타임라인: 닫힌 채 정지(~0.5s) → 챙 → 위로 → 재료 공개(점수·평가 표시 + 팡파르 1회)
    {
      const { ctx, p } = await open(1280, 800);
      await p.evaluate(() => { SL.sfx._elog.length = 0; });
      await run(p, 'tamago', 9);
      const ev = await p.evaluate(() => new Promise((res) => {
        const out = [], t0 = performance.now(), id = setInterval(() => {
          const s = SL.ending.state(); if (!s) return;
          out.push({ t: performance.now() - t0, lift: s.lift, alpha: s.alpha, rev: s.revealed, clink: s.clinked, pend: document.getElementById('screen-result').classList.contains('reveal-pending') });
          if (s.revealed && performance.now() - t0 > 2600) { clearInterval(id); res(out); }
        }, 8);
      }));
      const first = ev[0], st0 = ev.filter((r) => r.lift === 0 && !r.clink);
      ok(first.lift === 0 && first.alpha === 1 && first.pend, '엔딩 시작: 덮개가 닫힌 채, 점수·평가는 숨김');
      const liftStart = ev.find((r) => r.lift > 0);
      ok(liftStart && liftStart.t > 300, '약 0.5초 정지 뒤 덮개가 들리기 시작', liftStart && liftStart.t);
      const alphaStart = ev.find((r) => r.alpha < 1), liftAtFade = alphaStart && alphaStart.lift;
      ok(alphaStart && alphaStart.lift > 100, '페이드아웃은 덮개가 올라가는 후반부에 시작', alphaStart);
      ok(ev.every((r, i) => i === 0 || r.lift >= ev[i - 1].lift - 1e-6), '덮개는 한 방향(위로)으로만 부드럽게 올라감');
      const el = await p.evaluate(() => ({ kinds: SL.sfx._elog.map((r) => r.kind), pend: document.getElementById('screen-result').classList.contains('reveal-pending') }));
      ok(el.kinds.filter((k) => k === 'clink').length === 1 && el.kinds.filter((k) => k === 'fanfare').length === 1, '챙 1번 · 팡파르 1번(한 판에 한 번)', el.kinds);
      ok(!el.pend, '재료가 공개된 뒤에는 점수·평가가 표시됨');
      // 창 크기 변경(다시 그리기)에도 팡파르·챙이 다시 울리지 않음
      await p.setViewportSize({ width: 800, height: 900 }); await p.waitForTimeout(400);
      ok((await p.evaluate(() => SL.sfx._elog.length)) === 2 && (await p.evaluate(() => SL.ending.state().revealed)), '크기를 바꿔 다시 그려도 소리가 반복되지 않고 공개 상태 유지');
      // 다시 썰기 → 다음 판에서 다시 한 번
      await p.click('#btn-again'); await p.waitForTimeout(250);
      ok((await p.evaluate(() => SL.ending.state())) === null, '다시 썰기: 엔딩 정지·초기화');
      await ctx.close();
    }
    // 2) 고정 프레임 검사: 닫힌 상태에서 재료가 덮개 밖으로 비치지 않음, 닫힌 위치가 참고 이미지(ending_close)와 일치, 공개 후 덮개 없음
    for (const [w, h] of [[1280, 800], [390, 844], [820, 1000]]) {
      const { ctx, p } = await open(w, h);
      await run(p, 'cucumber', 24);
      const r = await p.evaluate(async () => {
        const cv = document.getElementById('result-canvas'), c = cv.getContext('2d'), S = SL.ending.state().L;
        const shot = () => c.getImageData(0, 0, cv.width, cv.height).data;
        SL.ending._seek(0); SL.ending._noFood(false); const a = shot();
        SL.ending._noFood(true); SL.ending._seek(0); const b = shot();
        let diff = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) diff++;
        SL.ending._noFood(false); SL.ending._seek(0);
        // 참고 이미지(ending_close)와 닫힌 프레임 비교(덮개 영역)
        const ref = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'assets/ending_close.png'; });
        const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; const tc = t.getContext('2d'); tc.fillStyle = '#fff'; tc.fillRect(0, 0, t.width, t.height);
        tc.drawImage(ref, S.ox, S.oy, 1179 * S.S, 1334 * S.S);
        const op = document.createElement('canvas'); op.width = cv.width; op.height = cv.height; const oc = op.getContext('2d'); oc.fillStyle = '#fff'; oc.fillRect(0, 0, op.width, op.height);
        const open0 = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'assets/ending_open.png'; }); oc.drawImage(open0, S.ox, S.oy, 1179 * S.S, 1334 * S.S);
        const rd = tc.getImageData(0, 0, t.width, t.height).data, od = oc.getImageData(0, 0, op.width, op.height).data;
        SL.ending._noFood(true); SL.ending._seek(0); const a2 = shot(); SL.ending._noFood(false);
        const x0 = Math.round(S.ox + 30 * S.S), x1 = Math.round(S.ox + 470 * S.S), y0 = Math.round(S.oy + 780 * S.S), y1 = Math.round(S.oy + 1075 * S.S);
        // 덮개 영역에서 '닫힌 합성(재료 숨김)'과 참고 이미지(ending_close)의 평균 색차 — 덮개를 일부러 어긋나게 둔 합성(덮개 +12px)과 비교해 정렬이 더 낫다는 것도 확인
        let tot = 0, cnt = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * cv.width + x) * 4; tot += Math.abs(a2[i] - rd[i]) + Math.abs(a2[i + 1] - rd[i + 1]) + Math.abs(a2[i + 2] - rd[i + 2]); cnt++; }
        SL.ending._seek(3000); const e = SL.ending.state();
        const info = e.info, M = SL.assets.meta.ending;
        return { hiddenDiff: diff, refDiff: tot / cnt / 3, alphaEnd: e.alpha, revealed: e.revealed, row: info.row, S: S.S, ox: S.ox, oy: S.oy, pw: S.pw, ph: S.ph, plate: M.plate, topLift: M.cloche.top - SL.C.ENDING.LIFT_PX - SL.C.ENDING.RISE_PX };
      });
      const tag = `${w}×${h}`;
      ok(r.hiddenDiff === 0, `${tag}: 닫힌 상태에서 재료가 덮개 밖으로 비치지 않음(재료 유무와 화면 동일)`, r.hiddenDiff);
      ok(r.refDiff < 12, `${tag}: 닫힌 덮개 위치·크기가 참고 이미지(ending_close)와 일치(덮개 영역 평균 색차 ${r.refDiff.toFixed(1)})`, r.refDiff);
      ok(r.alphaEnd === 0 && r.revealed, `${tag}: 공개 후 덮개는 완전히 사라지고 재료가 보임`);
      const cx = ((r.row.x0 + r.row.x1) / 2 - r.ox) / r.S, bottom = (r.row.y1 - r.oy) / r.S;
      ok(Math.abs(cx - r.plate.cx) < 6 && bottom > r.plate.cy - 40 && bottom < r.plate.cy + 25 && (r.row.x1 - r.row.x0) / r.S < 345, `${tag}: 재료가 접시 위 같은 자리(컨테이너 좌표)에 놓임`, [cx, bottom, (r.row.x1 - r.row.x0) / r.S]);
      ok(r.topLift > 20, `${tag}: 덮개가 최고로 올라가도 컨테이너 위쪽 여백 안(잘리지 않음, 최고점 y=${r.topLift})`, r.topLift);
      ok(r.row.x0 > r.ox && r.row.x1 < r.pw - r.ox, `${tag}: 재료 줄이 캔버스 안`);
      await p.screenshot({ path: path.join(ROOT, 'screenshot', `z_ending_${w}x${h}.png`) }); await ctx.close();
    }
    // 3) 음소거: 설정이 저장되고, 절단음·엔딩 소리가 모두 꺼진다
    {
      const { ctx, p } = await open(1280, 800);
      await p.click('#btn-mute');
      ok((await p.evaluate(() => SL.sfx.isMuted() && localStorage.getItem('cut_mute') === '1')) && (await p.textContent('#btn-mute')) === '🔇', '음소거 버튼: 켜면 저장되고 아이콘이 바뀜');
      await p.evaluate(() => { SL.sfx._log.length = 0; SL.sfx._elog.length = 0; });
      await run(p, 'tamago', 9); await p.waitForFunction(() => SL.ending.state() && SL.ending.state().revealed, null, { timeout: 8000 });
      const m = await p.evaluate(() => ({ cut: SL.sfx._log.every((r) => !r.played), ending: SL.sfx._elog.every((r) => !r.played), n: SL.sfx._log.length, e: SL.sfx._elog.length }));
      ok(m.cut && m.ending && m.n === 9 && m.e === 2, '음소거: 절단음·챙·팡파르 모두 재생되지 않음(연출은 그대로)', m);
      await p.reload(); await p.waitForFunction(() => window.SL && SL.assets && SL.assets.loaded);
      ok(await p.evaluate(() => SL.sfx.isMuted()), '음소거 설정이 새로고침 뒤에도 유지');
      await ctx.close();
    }
  }

  console.log('[5] 도전장');
  {
    const { ctx, p } = await open(1280, 720);
    await startGame(p, 'salmon');
    for (const x of [60, 150, 230, 300, 390, 480, 560, 640, 720, 800, 880]) await cutAt(p, x);
    await p.waitForFunction(() => SL_DEBUG.state().screen === 'result', null, { timeout: 5000 });
    const mine = await st(p);
    ok(!(await p.$eval('#btn-challenge', (e) => e.disabled)), '공개 주소(http)에서 도전장 버튼 활성');
    await p.click('#btn-challenge'); await p.waitForSelector('#modal:not(.hidden)');
    await p.fill('#modal-input', '칼질왕'); await p.click('#modal-ok'); await p.waitForTimeout(300);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    const m = clip.match(/https?:\/\/\S+#battle\/\S+/);
    ok(!!m && /칼질 좀 하세요\? 대결해요/.test(clip) && new RegExp('연어 썰기 기록 ' + mine.result.score + '점').test(clip), '도전장 링크+문구 복사', clip.slice(0, 120));
    const page2 = await ctx.newPage(); page2.on('pageerror', (e) => errs.push(String(e)));
    await page2.goto(m[0]); await page2.waitForFunction(() => window.SL && SL.assets && SL.assets.loaded); await page2.waitForTimeout(300);
    let s2 = await st(page2);
    ok(s2.screen === 'challenge' && s2.challenge.nickname === '칼질왕' && s2.challenge.ing === 'salmon' && s2.challenge.total === mine.result.score, '링크로 열면 도전장 화면(닉네임·재료·점수 복원)', s2.challenge);
    ok(await page2.evaluate(() => !document.getElementById('screen-intro').classList.contains('active')), '도전장 진입 시 인트로가 깜빡이지 않음');
    await page2.screenshot({ path: path.join(ROOT, 'screenshot', 'z_challenge.png') });
    await page2.click('#btn-challenge-start'); await page2.waitForTimeout(100);
    ok(await page2.evaluate(() => document.querySelector('.ing-cell.is-selected').getAttribute('data-id')) === 'salmon', '도전 시작 → 같은 재료가 미리 선택됨');
    await page2.click('#btn-play'); await page2.waitForTimeout(250);
    for (const x of [70, 160, 250, 330, 420, 500, 590, 670, 760, 840, 910]) { await page2.evaluate((x) => SL_DEBUG.setKnife(x), x); await page2.keyboard.press(' '); await page2.waitForTimeout(190); }
    await page2.waitForFunction(() => SL_DEBUG.state().screen === 'result', null, { timeout: 5000 });
    ok(await page2.evaluate(() => !document.getElementById('btn-battle-result').hidden), '도전으로 들어온 판의 결과에는 [대결 결과 보기]');
    await page2.click('#btn-battle-result'); await page2.waitForTimeout(300);
    const vs = await page2.evaluate(() => ({ a: document.getElementById('vs-a-score').textContent, b: document.getElementById('vs-b-score').textContent, w: document.getElementById('vs-winner').textContent }));
    ok(vs.a === String(mine.result.score) && /점/.test(vs.w + '점') && vs.b !== '', '대결 결과: 내 점수 vs 친구 점수 + 승패 문구', vs);
    await page2.screenshot({ path: path.join(ROOT, 'screenshot', 'z_battle.png') });
    await page2.click('#btn-rematch'); await page2.waitForTimeout(250);
    s2 = await st(page2);
    ok(s2.screen === 'play' && s2.cuts.length === 0, '다시 붙기 → 새 판(초기화)');
    // 잘못된 링크는 무시하고 인트로
    const p3 = await ctx.newPage(); await p3.goto(BASE + '#battle/v1.broken'); await p3.waitForFunction(() => window.SL && SL.assets && SL.assets.loaded);
    ok((await st(p3)).screen === 'intro', '잘못된 도전장 링크는 인트로로 진입');
    await ctx.close();
    // 터치: 칼 동작과 소리 동기
    const { ctx: tc, p: tp } = await open(844, 390, { touch: true });
    await tp.tap('#btn-start'); await tp.tap('.ing-cell[data-id="tamago"]'); await tp.tap('#btn-play'); await tp.waitForTimeout(300);
    await tp.evaluate(() => { SL.sfx._log.length = 0; });
    await tp.tap('.pad-btn[data-act="right"]'); await tp.waitForTimeout(100);
    ok((await tp.evaluate(() => SL.sfx._log.length)) === 0, '터치: 이동 버튼은 무음');
    await tp.evaluate(() => SL_DEBUG.setKnife(120));
    await tp.tap('.pad-cut'); await tp.waitForTimeout(40);
    const tl = await tp.evaluate(() => ({ n: SL.sfx._log.length, cuts: SL_DEBUG.state().cuts.length, chop: SL_DEBUG.state().chopT }));
    ok(tl.n === 1 && tl.cuts === 1 && tl.chop > 0, '터치 썰기: 절단 1회 = 효과음 1회, 칼 애니메이션과 동시에 시작', tl);
    await tc.close();
  }

  console.log(errs.length ? '콘솔/페이지 에러:\n' + errs.slice(0, 5).join('\n') : '콘솔 에러 없음');
  ok(errs.length === 0, '콘솔/페이지 에러 없음');
  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
