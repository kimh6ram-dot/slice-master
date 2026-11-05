/* 에셋 가공 — node tools/build_assets.js   (먼저 `node tools/serve.js 8099` 를 띄워 둘 것: file:// 은 canvas 가 오염돼 픽셀을 못 읽는다)
 *  assets/ 원본 PNG(투명 여백 큼)를 게임용으로 가공해 src/game/assets_data.js 에 data URI 로 내장한다 → file:// 더블클릭으로도 동작.
 *   - 재료 4장(aggroll=계란말이 2D 대체용): 투명 여백을 잘라 실제 음식 영역만 남기고, 알파<22 잔여 번짐(가장자리 붉은 점)을 지운 뒤 폭 1200 이하로 축소. 가로세로 비율 유지.
 *   - knife_top: 날 중심선 x(cx)·칼끝/날밑/손잡이 끝 y 를 실측해 메타로 남긴다(절단 좌표 = 이 중심선).
  *   - kitchen_bg_v2(플레이 배경): 원본 비율 그대로 JPEG.
 *  knife_side.png 는 현재 쓰는 곳이 없다(기본 칼을 옆면으로 바꾸지 않는다는 지시) — 가공하지 않는다. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pw = require(path.join(ROOT, '..', '..', '260624', 'build', 'node_modules', 'playwright-core'));
const PORT = process.argv[2] || 8099;

(async () => {
  const b = await pw.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  await p.goto('http://localhost:' + PORT + '/index.html');
  const out = await p.evaluate(async () => {
    function load(n, ext) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('로드 실패 ' + n)); im.src = 'assets/' + n + '.' + (ext || 'png'); }); }
    function bbox(d, w, h, thr) {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return [x0, y0, x1, y1];
    }
    function px(im) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return { c, x, d: x.getImageData(0, 0, c.width, c.height) }; }
    const res = { food: {} };
    for (const [id, file, maxW] of [['naruto', 'narutomaki', 1200], ['salmon', 'salmon', 1200], ['cucumber', 'cucumber', 1200], ['tamago', 'aggroll', 1200]]) {
      const im = await load(file), s = px(im);
      for (let i = 3; i < s.d.data.length; i += 4) if (s.d.data[i] < 22) { s.d.data[i] = 0; s.d.data[i - 1] = 0; s.d.data[i - 2] = 0; s.d.data[i - 3] = 0; }
      s.x.putImageData(s.d, 0, 0);
      const bb = bbox(s.d.data, im.width, im.height, 0), w = bb[2] - bb[0] + 1, h = bb[3] - bb[1] + 1, k = Math.min(1, maxW / w);
      const o = document.createElement('canvas'); o.width = Math.round(w * k); o.height = Math.round(h * k);
      const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high';
      ox.drawImage(s.c, bb[0], bb[1], w, h, 0, 0, o.width, o.height);
      res.food[id] = { src: o.toDataURL('image/webp', 0.93), w: o.width, h: o.height, aspect: +(h / w).toFixed(4), from: file + '.png', bbox: bb };
    }
    {  // 칼(위에서 본 모습)
      const im = await load('knife_top'), s = px(im), W = im.width, H = im.height, d = s.d.data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 22) { d[i] = 0; d[i - 1] = 0; d[i - 2] = 0; d[i - 3] = 0; }
      s.x.putImageData(s.d, 0, 0);
      const bb = bbox(d, W, H, 0);
      // 날 중심선: 칼끝~날밑 사이 여러 행에서 알파>128 인 열의 가중 평균
      const cxs = [];
      for (let y = 200; y <= 900; y += 50) { let sw = 0, sx = 0; for (let x = bb[0]; x <= bb[2]; x++) { const a = d[(y * W + x) * 4 + 3]; if (a > 128) { sw += a; sx += a * x; } } if (sw) cxs.push(sx / sw); }
      const cx = cxs.reduce((a, v) => a + v, 0) / cxs.length;
      // 날 두께(알파>128 열 수)와 날밑 시작 y(폭이 갑자기 넓어지는 곳)
      let guardY = -1, bladeW = 0;
      for (let y = bb[1]; y <= bb[3]; y++) { let n = 0; for (let x = bb[0]; x <= bb[2]; x++) if (d[(y * W + x) * 4 + 3] > 128) n++; if (y === 500) bladeW = n; if (n > 40 && guardY < 0) guardY = y; }
      const pad = 4, x0 = bb[0] - pad, y0 = bb[1] - pad, w = bb[2] - bb[0] + 1 + pad * 2, h = bb[3] - bb[1] + 1 + pad * 2, k = 0.75;
      const o = document.createElement('canvas'); o.width = Math.round(w * k); o.height = Math.round(h * k);
      const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high';
      ox.drawImage(s.c, x0, y0, w, h, 0, 0, o.width, o.height);
      res.knife = { src: o.toDataURL('image/webp', 0.93), w: o.width, h: o.height, k,
        cx: +((cx - x0) * k).toFixed(2), tipY: +((bb[1] - y0) * k).toFixed(2), guardY: +((guardY - y0) * k).toFixed(2), bottomY: +((bb[3] - y0) * k).toFixed(2),
        bladeW: +(bladeW * k).toFixed(2), cxSpread: +(Math.max(...cxs) - Math.min(...cxs)).toFixed(2) };
    }
    {  // 엔딩: 토끼 셰프 + 빈 은색 접시(ending_open, 기본 이미지) / 덮개(ending_cloche, 별도 레이어) — 닫힌 상태 위치는 ending_close(참고)에서 실측한 값(open 이미지 좌표계)
      //   덮개 꼭대기 y=798, 림 중심 x≈260, 림 폭≈351(ending_close 와 ending_open 의 차이 마스크에 덮개 실루엣을 맞추는 탐색으로 측정, IoU≈0.71). 재료 줄 바닥 중심 (252, 1022)·폭 322 — 덮개 안에 완전히 가려지는 한도에서 최대.
      const op = await load('ending_open'), cl = await load('ending_cloche'), s = px(cl), d = s.d.data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < cl.height; y++) for (let x = 0; x < cl.width; x++) { const a = d[(y * cl.width + x) * 4 + 3]; if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } else { d[(y * cl.width + x) * 4 + 3] = 0; } }
      s.x.putImageData(s.d, 0, 0);
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(1, 640 / cw), o = document.createElement('canvas'); o.width = Math.round(cw * k); o.height = Math.round(ch * k);
      const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(s.c, x0, y0, cw, ch, 0, 0, o.width, o.height);
      const oc = document.createElement('canvas'); oc.width = op.width; oc.height = op.height; oc.getContext('2d').drawImage(op, 0, 0);
      res.ending = { open: { src: oc.toDataURL('image/webp', 0.92), w: op.width, h: op.height }, cloche: { src: o.toDataURL('image/webp', 0.92), w: o.width, h: o.height, cx: 260, top: 798, width: 351 }, plate: { cx: 262, cy: 1024, rowW: 350 } };
    }
    {  // 메인(인트로) 이미지 main.png — 투명 배경 16:10. 알파 24 미만 번짐을 지우고 폭 1200 으로 줄인다(박스는 최대 720px 폭, 2배 화면까지 충분)
      const im = await load('main'), s = px(im), d = s.d.data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 24) { d[i] = 0; d[i - 1] = 0; d[i - 2] = 0; d[i - 3] = 0; }
      s.x.putImageData(s.d, 0, 0);
      const k = Math.min(1, 1200 / im.width), o = document.createElement('canvas'); o.width = Math.round(im.width * k); o.height = Math.round(im.height * k);
      const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(s.c, 0, 0, o.width, o.height);
      res.main = { src: o.toDataURL('image/webp', 0.92), w: o.width, h: o.height, from: 'main.png' };
    }
    {  // 배경 — 비율 유지, 재인코딩만
      const im = await load('kitchen_bg_v2'), c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      c.getContext('2d').drawImage(im, 0, 0);
      res.bg = { src: c.toDataURL('image/jpeg', 0.9), w: im.width, h: im.height };
    }
    return res;
  });
  await b.close();

  const meta = JSON.parse(JSON.stringify(out));
  const kb = (s) => Math.round(s.length * 0.75 / 1024) + 'KB';
  Object.keys(meta.food).forEach((k) => console.log('food', k, meta.food[k].w + 'x' + meta.food[k].h, 'aspect', meta.food[k].aspect, kb(meta.food[k].src), meta.food[k].from));
  console.log('knife', out.knife.w + 'x' + out.knife.h, 'cx', out.knife.cx, 'cxSpread', out.knife.cxSpread, 'tip', out.knife.tipY, 'guard', out.knife.guardY, 'bottom', out.knife.bottomY, 'bladeW', out.knife.bladeW, kb(out.knife.src));
  console.log('ending', out.ending.open.w + 'x' + out.ending.open.h, kb(out.ending.open.src), 'cloche', out.ending.cloche.w + 'x' + out.ending.cloche.h, kb(out.ending.cloche.src));
  console.log('main', out.main.w + 'x' + out.main.h, kb(out.main.src));
  console.log('bg', out.bg.w + 'x' + out.bg.h, kb(out.bg.src));
  const js = '/* 자동 생성 — node tools/build_assets.js (원본: assets/*.png). 직접 고치지 말 것.\n * data URI 내장이라 file:// 에서도 canvas 가 오염되지 않는다. */\n(function () {\n  \'use strict\';\n  var SL = window.SL = window.SL || {};\n  SL.ASSETS = ' + JSON.stringify(out) + ';\n})();\n';
  fs.writeFileSync(path.join(ROOT, 'src', 'game', 'assets_data.js'), js);
  console.log('wrote src/game/assets_data.js', Math.round(js.length / 1024) + 'KB');
})();
