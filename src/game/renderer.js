/* 그리기 — 플레이 스테이지(도마·재료·칼)와 미리보기/결과 캔버스. 로직 상태는 읽기만 한다. */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C = SL.C;

  function dprOf() { return Math.min(window.devicePixelRatio || 1, 3); }

  // 캔버스를 CSS 크기에 맞춰 DPR 로 리사이즈하고 CSS px 좌표계 컨텍스트를 돌려준다
  function setup(cv, dmax) {
    var w = cv.clientWidth, h = cv.clientHeight, d = Math.min(dprOf() * SL.FIT.of(cv), dmax || 3);   // 플레이 스테이지만 논리 좌표(1920×1080) → 실제 픽셀 배율 = 기기 DPR × 맞춤 배율 k. 나머지 화면 캔버스는 CSS px 그대로
    if (!w || !h) return null;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    var c = cv.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, h);
    return { c: c, w: w, h: h, d: d };
  }

  function ing(id) {
    for (var i = 0; i < C.INGREDIENTS.length; i++) if (C.INGREDIENTS[i].id === id) return C.INGREDIENTS[i];
    return C.INGREDIENTS[0];
  }

  // 재료 기하: 전체 폭 ingW 안에 LENGTH 를 매핑
  function geom(id, ingW, x0, yc) {
    return { id: id, x0: x0, yc: yc, w: ingW, h: ingW * ing(id).h, scale: ingW / C.LENGTH };
  }

  function board(c, g, padX, padY) {
    var x = g.x0 - padX, y = g.yc - g.h / 2 - padY, w = g.w + padX * 2, h = g.h + padY * 2;
    c.save();
    c.beginPath(); c.moveTo(x + 6, y);
    c.arcTo(x + w, y, x + w, y + h, 6); c.arcTo(x + w, y + h, x, y + h, 6); c.arcTo(x, y + h, x, y, 6); c.arcTo(x, y, x + w, y, 6); c.closePath();
    var gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#E2C294'); gr.addColorStop(1, '#D2AC78');
    c.fillStyle = gr; c.fill();
    c.clip();
    c.strokeStyle = 'rgba(120,80,30,0.13)'; c.lineWidth = 1;
    for (var i = 0; i < 9; i++) {
      var yy = y + h * (i + 0.5) / 9;
      c.beginPath(); c.moveTo(x, yy); c.bezierCurveTo(x + w * 0.3, yy - 3, x + w * 0.65, yy + 3, x + w, yy); c.stroke();
    }
    c.restore();
    c.strokeStyle = '#8F6B3C'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + 6, y + 0.5);
    c.arcTo(x + w - 0.5, y + 0.5, x + w - 0.5, y + h, 6); c.arcTo(x + w - 0.5, y + h - 0.5, x, y + h - 0.5, 6); c.arcTo(x + 0.5, y + h - 0.5, x + 0.5, y, 6); c.arcTo(x + 0.5, y + 0.5, x + w, y + 0.5, 6); c.closePath(); c.stroke();
  }

  // 절단면: 조각 왼쪽 앞모서리(x)에서 왼쪽으로 capW 만큼 비스듬히 보이는 평행사변형(왼쪽 앞에서 본 시점). 재료별 단면 텍스처를 아핀 변환으로 눕혀 그린다
  function cutFace(c, id, x, top, h, d) {
    var capW = h * C.KITCHEN.CAP, S = Math.max(64, Math.min(256, Math.round(h * d * 2)));
    var tex = SL.ingredients.face(id, S);
    c.save();
    c.transform(capW / S, h * 0.30 / S, 0, h * 0.68 / S, x - capW, top);   // 텍스처 (0..S)² → 평행사변형. 오른쪽 가장자리 = 앞면, 왼쪽 = 뒤쪽(위로 올라감)
    c.imageSmoothingQuality = 'high';
    c.drawImage(tex, 0, 0);
    c.restore();
  }

  // 조각들 그리기. list=[{a,b}] 논리 단위. trim=절단면 틈(한쪽 px), spread=조각 i 의 i×spread 만큼 오른쪽 이동.
  // opts.off(i) 가 있으면 spread 대신 조각 i 의 x 오프셋(px)으로 쓰고, opts.face 면 절단면(a>0 인 조각의 왼쪽)을 그린다
  function pieces(c, g, list, trim, spread, d, opts) {
    var sp = SL.ingredients.sprite(g.id, g.w, g.h, d);
    c.save();
    c.shadowColor = 'rgba(60,35,10,0.28)'; c.shadowBlur = 5; c.shadowOffsetY = 3;
    for (var i = 0; i < list.length; i++) {
      var p = list[i], sx = p.a * g.scale, sw = (p.b - p.a) * g.scale;
      var tl = p.a > 0 ? Math.min(trim, Math.max(0, (sw - 1) / 4)) : 0;
      var tr = p.b < C.LENGTH ? Math.min(trim, Math.max(0, (sw - 1) / 4)) : 0;
      var off = opts && opts.off ? opts.off(i) : (spread ? i * spread : 0);
      var dx = g.x0 + sx + tl + off, dw = sw - tl - tr;
      if (dw <= 0.2) continue;
      c.drawImage(sp, (sx + tl) * d, 0, dw * d, g.h * d, dx, g.yc - g.h / 2, dw, g.h);
      if (opts && opts.face && p.a > 0) { c.save(); c.shadowColor = 'transparent'; cutFace(c, g.id, dx, g.yc - g.h / 2, g.h, d); c.restore(); }
    }
    c.restore();
  }

  // 칼: 가는 날(끝이 아래) + 손잡이. kx=칼 x(px), drop=0..1 내려간 비율
  function knife(c, kx, topY, g, drop) {
    var bladeLen = 74, handleLen = 46, travel = g.h + 12;
    var by = topY - 5 + drop * travel;          // 날 끝(아래) y
    var bt = by - bladeLen;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 4; c.shadowOffsetX = 2;
    var gr = c.createLinearGradient(kx - 3, 0, kx + 3, 0);
    gr.addColorStop(0, '#9AA3AD'); gr.addColorStop(0.5, '#F4F6F8'); gr.addColorStop(1, '#8C959F');
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(kx - 3, bt); c.lineTo(kx + 3, bt); c.lineTo(kx + 0.9, by); c.lineTo(kx - 0.9, by); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,45,52,0.8)'; c.lineWidth = 0.8; c.stroke();
    c.shadowColor = 'transparent';
    c.fillStyle = '#1B1B1B'; c.fillRect(kx - 6, bt - handleLen, 12, handleLen);
    c.fillStyle = '#6B6B6B'; c.fillRect(kx - 6, bt - 2, 12, 3);
    c.restore();
  }

  // 플레이 장면. view={w,h,top,bottom} 은 재료를 놓을 세로 범위. st=slicing state, anim={drop}
  function play(cv, id, st, drop, view, settle) {
    var s = setup(cv); if (!s) return null;
    var c = s.c, ingW = Math.min(s.w - 36, s.w > 700 ? 900 : 360), x0 = (s.w - ingW) / 2;
    var g = geom(id, ingW, x0, (view.top + view.bottom) / 2);
    board(c, g, 14, 30);
    var list = SL.slicing.pieces(st).slice();
    var last = st.cuts.length ? st.cuts[st.cuts.length - 1] : 0;
    if (!st.done) list.push({ a: last, b: C.LENGTH });
    var sp = (settle || 0) * C.SETTLE_SPREAD_PX;          // 정착: 조각이 가운데를 기준으로 살짝 벌어진다
    var pg = geom(id, ingW, x0 - (list.length - 1) * sp / 2, g.yc);
    pieces(c, pg, list, C.TRIM_PX, sp, s.d);
    if (!st.done) knife(c, x0 + st.knife * g.scale, g.yc - g.h / 2, g, drop || 0);
    return g;
  }

  // ───────────── 주방 장면: kitchen_bg.png(도마 포함) 위에 재료·칼을 독립 오브젝트로 얹는다 ─────────────
  // 게임 기준 좌표계 = 1920×1080(16:9). 배경은 원본 비율 그대로 가로 전체에 놓는다(배율 s 하나, 늘이기·색 연장 없음).
  // 재료·칼·판정 좌표는 모두 이 배율 s 와 원점(ox, oy)으로 정해진다.
  var K = C.KITCHEN, bgCache = null, kt = { cut: -1e9 };

  function ease(t) { t = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - t, 3); }
  function resetPlay() { kt.cut = -1e9; }
  function noteCut(now) { kt.cut = now; }

  // 가장자리 한 줄을 가로 32칸으로 뭉개 둔다 → 늘여 붙여도 세로 줄무늬(스트릭) 없이 부드러운 색 띠가 된다
  function softRow(im, row, BW) {
    var t = document.createElement('canvas'); t.width = 32; t.height = 1;
    var x = t.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, row, BW, 1, 0, 0, 32, 1);
    return t;
  }

  function bgLayer(W, H, d, s, ox, oy) {
    var A = SL.assets, im = A.img.bg, BW = A.meta.bg.w, BH = A.meta.bg.h;
    var key = [W, H, d, Math.round(ox * 100), Math.round(oy * 100)].join('|');
    if (bgCache && bgCache.key === key) return bgCache.cv;
    var cv = document.createElement('canvas'); cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    var c = cv.getContext('2d'); c.scale(d, d); c.imageSmoothingQuality = 'high';
    // 배경 이미지는 아래 나무 가장자리 띠(y > K.BG_CROP)를 빼고 쓴다. 창이 세로로 길어 이미지 위·아래가 모자라면 가장자리 한 줄을 늘려 이어 붙이고
    // 끝으로 갈수록 어두운 색으로 옅게 가라앉힌다(빈 띠 없이 창 전체를 배경으로 채움). 가로는 s 가 창 폭을 덮도록 정해져 있어 연장이 필요 없다.
    var CR = K.BG_CROP, top = oy, bot = oy + CR * s, FADE = 'rgba(46,39,34,';
    if (top > 0) {
      c.drawImage(softRow(im, 0, BW), 0, 0, 32, 1, ox, 0, BW * s, top + 1);
      var gt = c.createLinearGradient(0, 0, 0, top); gt.addColorStop(0, FADE + '0.9)'); gt.addColorStop(1, FADE + '0)');
      c.fillStyle = gt; c.fillRect(ox, 0, BW * s, top);
    }
    if (bot < H) {
      c.drawImage(softRow(im, CR - 1, BW), 0, 0, 32, 1, ox, bot - 1, BW * s, H - bot + 1);
      var gb = c.createLinearGradient(0, bot, 0, H); gb.addColorStop(0, FADE + '0)'); gb.addColorStop(1, FADE + '0.9)');
      c.fillStyle = gb; c.fillRect(ox, bot, BW * s, H - bot);
    }
    c.drawImage(im, 0, 0, BW, CR, ox, oy, BW * s, CR * s);
    bgCache = { key: key, cv: cv };
    return cv;
  }

  // 프레임이 작을수록 배경 확대를 낮춘다(k = 프레임 폭 / 1920): 480px 이하 ZOOM_MIN … 960px 이상 ZOOM_MAX
  function zoomFor(k) { var t = Math.min(1, Math.max(0, (k - 0.25) / 0.25)); return K.ZOOM_MIN + (K.ZOOM_MAX - K.ZOOM_MIN) * t; }

  // 배경을 깔고 재료 기하를 돌려준다. use3d: 3D 재료는 보이는 외곽 높이를 view3d 가 정하므로 g.h 는 2D 스프라이트 비율(대체 경로용)
  function kitchen(cv, id, use3d) {
    var A = SL.assets, BW = A.meta.bg.w, BH = A.meta.bg.h;
    var sc = setup(cv, SL.FIT.DPR_MAX); if (!sc) return null;
    // 배경 확대: 도마 중심(K.CX)을 기준으로 가로 폭에 맞춘 배율 × zoom. 재료 중심 높이(K.YC)가 항상 K.YC_Y 에 오게 세로 원점을 잡고,
    // 배경이 위·아래 끝을 넘지 않게만 보정한다(좌우는 자르지 않는다 — 항상 도마 중심 기준 대칭 확대)
    var W = sc.w, H = sc.h, s = Math.max(SL.FIT.W / BW * zoomFor(SL.FIT.k), W / BW), ox = W / 2 - K.CX * s, Y0 = (H - SL.FIT.H) / 2, oy = Y0 + K.YC_Y - K.YC * s;   // 창이 세로로 길면 16:9 장면(재료·칼)은 세로 가운데에 두고 배경을 위아래로 이어 붙인다
    oy = Math.min(Y0, Math.max(Y0 + SL.FIT.H - K.BG_CROP * s, oy));          // 16:9 구간 안에서는 배경 이미지 위·아래 끝이 드러나지 않게
    if (window.innerWidth >= window.innerHeight) oy -= K.LAND_LIFT / SL.FIT.k;   // 가로 화면: 장면 전체(배경·도마·재료·칼)를 화면 기준 LAND_LIFT px 위로. 아래쪽은 bgLayer 가 가장자리 띠를 이어 붙여 채운다
    sc.c.setTransform(1, 0, 0, 1, 0, 0);
    sc.c.drawImage(bgLayer(W, H, sc.d, s, ox, oy), 0, 0);
    sc.c.setTransform(sc.d, 0, 0, sc.d, 0, 0);
    var fw = K.FOOD_W[id] * s;
    var g = geom(id, fw, ox + (K.CX - K.FOOD_W[id] / 2) * s, oy + K.YC * s);
    return { cv: cv, c: sc.c, W: W, H: H, d: sc.d, s: s, ox: ox, oy: oy, g: g, id: id, use3d: !!use3d };
  }

  // 조각 사이 벌어짐: 절단면(CAP)이 보일 만큼. 조각 j 의 x 오프셋 = (j − n/2)·gap → 전체가 가운데에 머물고, 남은 몸통은 오른쪽으로 조금씩 밀린다(칼은 몸통 좌표를 따라간다)
  function kOffsets(lay, n, now) {
    var gap = lay.g.h * K.CAP + K.GAP_EXTRA, t = ease((now - kt.cut) / K.SLIDE_MS);
    return function (j) {
      var to = (j - n / 2) * gap;
      if (n === 0 || t >= 1) return to;
      var from = (Math.min(j, n - 1) - (n - 1) / 2) * gap;
      return from + (to - from) * t;
    };
  }

  // 재료(조각 + 남은 몸통) 그리기. 칼이 놓일 x(몸통 좌표를 따라가는 화면 x)를 돌려준다
  function kitchenFood(lay, st, now) {
    var n = st.cuts.length, off = kOffsets(lay, n, now);
    var list = SL.slicing.pieces(st).slice(), last = n ? st.cuts[n - 1] : 0;
    if (!st.done) list.push({ a: last, b: C.LENGTH });
    pieces(lay.c, lay.g, list, C.TRIM_PX, 0, lay.d, { off: off, face: true });
    return { knifeX: lay.g.x0 + off(n) + st.knife * lay.g.scale };
  }

  // 칼(위에서 본 모습, 손잡이 아래·칼끝 위). X = 날 중심선이 와야 할 화면 x. drop 0..1 = 내려간 정도.
  // 크기·높이는 재료와 무관한 고정값(K.KNIFE_*): 칼끝은 도마 뒤쪽 위, 손잡이 끝은 도마 앞쪽 가장자리 근처에 온다.
  function kitchenKnife(lay, X, drop) {
    var A = SL.assets, im = A.img.knife, M = A.meta.knife, c = lay.c;
    var ks = lay.s * K.KNIFE_KS / M.k;
    var dropL = Math.min(110, Math.max(K.KNIFE_DROP * lay.s, K.MIN_DROP_PX / SL.FIT.k));   // 낙폭은 화면에 보이는 최소 크기(실제 px)를 보장 — 모바일에서도 내려가는 궤적이 읽힌다
    var y = lay.oy + K.KNIFE_TIP_Y * lay.s + drop * dropL - M.tipY * ks;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = (6 - 3.5 * drop) * lay.d; c.shadowOffsetX = (4 - 2.5 * drop) * lay.d; c.shadowOffsetY = (5 - 3.5 * drop) * lay.d;
    c.drawImage(im, X - M.cx * ks, y, M.w * ks, M.h * ks);
    c.restore();
    return { x: X, tipY: y + M.tipY * ks, guardY: y + M.guardY * ks, bottomY: y + M.bottomY * ks, ks: ks };
  }

  // 완성/미리보기: 조각을 벌려 가운데 정렬. th=null 이면 통재료
  function strip(cv, id, th, mark) {
    var s = setup(cv); if (!s) return null;
    var c = s.c, n = th ? th.length : 1;
    var asset = !!(SL.assets && SL.assets.ready), gap = th ? C.SPREAD_PX * Math.max(1, Math.min(2.4, s.w / 320)) : 0;
    if (th && asset) gap = Math.max(gap, ing(id).h * Math.min(s.w - 32, s.w > 600 ? 800 : 320) * 0.7 * C.KITCHEN.CAP + 2);   // 절단면이 보일 만큼
    var ingW = Math.min(s.w - 32 - (n - 1) * gap, s.w > 600 ? 800 : 320);
    var x0 = (s.w - (ingW + (n - 1) * gap)) / 2;
    var g = geom(id, ingW, x0, s.h / 2 - (th && mark ? 6 : 0));
    var list = [], acc = 0, i;
    if (th) { for (i = 0; i < n; i++) { list.push({ a: acc, b: acc + th[i] }); acc += th[i]; } }
    else list.push({ a: 0, b: C.LENGTH });
    pieces(c, g, list, 0, gap, s.d, { face: !!(th && asset) });
    if (th && mark != null) {                      // 가장 두꺼운 조각 아래 표시
      var p = list[mark], cx = x0 + (p.a + p.b) / 2 * g.scale + mark * gap, y = g.yc + g.h / 2 + 12;
      c.fillStyle = '#000000';
      c.beginPath(); c.moveTo(cx, y - 5); c.lineTo(cx - 5, y + 3); c.lineTo(cx + 5, y + 3); c.closePath(); c.fill();
    }
    return g;
  }

  // 재료 선택 칸의 작은 아이콘
  function icon(cv, id) {
    var s = setup(cv); if (!s) return;
    var ingW = Math.min(s.w - 4, 92), g = geom(id, ingW, (s.w - ingW) / 2, s.h / 2);
    pieces(s.c, g, [{ a: 0, b: C.LENGTH }], 0, 0, s.d);
  }

  // 그림 한 장을 캔버스(CSS px)에 비율 유지로 꽉 차게(contain) 그린다 — 메인 화면 이미지처럼 박스와 같은 비율이면 여백 없이 채워진다
  function picture(cv, im, pad, fixedW) {
    var s = setup(cv); if (!s || !im) return false;
    var m = (pad || 0) * 2, k = fixedW ? fixedW / im.width : Math.min(s.w * (1 - m) / im.width, s.h * (1 - m) / im.height), w = im.width * k, h = im.height * k;
    s.c.imageSmoothingQuality = 'high'; s.c.drawImage(im, (s.w - w) / 2, (s.h - h) / 2, w, h);
    return true;
  }

  SL.renderer = { picture: picture, play: play, strip: strip, icon: icon, setup: setup, kitchen: kitchen, kitchenFood: kitchenFood, kitchenKnife: kitchenKnife, resetPlay: resetPlay, noteCut: noteCut };
})();
