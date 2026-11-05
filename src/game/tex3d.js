/* 3D 계란말이용 절차적 텍스처 — 색 + 노멀맵(기공은 텍스처/노멀로만, 개별 메시 없음).
 * 팔레트는 assets/aggroll.png 에서 측정한 값(윗면 ≈ #FBC431, 앞면 ≈ #F0BA2F, 절단면 ≈ #F8C63A)에 맞췄고, 사진 자체는 쓰지 않는다
 * (검은 배경/표시 영역이 텍스처에 섞이지 않도록 전부 캔버스에서 새로 그린다).
 * 몸통 텍스처: u = 길이 방향(0..1), v = 단면 둘레(0..1; 0 = 바닥 중앙 → 앞면 → 윗면(0.5) → 뒷면 → 바닥) — 이음새는 바닥 중앙이라 안 보인다. */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C3 = SL.C.ROLL3D;

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // 낮은 해상도 난수 → 부드럽게 확대해 덮는다(저주파 얼룩). amp: 0~1
  function mottle(ctx, w, h, cols, rows, R, rgb, amp, mode) {
    var n = canvas(cols, rows), x = n.getContext('2d'), d = x.createImageData(cols, rows), i;
    for (i = 0; i < cols * rows; i++) {
      var v = 128 + (R() - 0.5) * 2 * 128 * amp;
      d.data[i * 4] = v; d.data[i * 4 + 1] = v; d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = mode || 'soft-light';
    ctx.drawImage(n, 0, 0, w, h);
    ctx.restore();
  }

  // 높이맵(그레이 canvas) → 노멀맵 canvas. wrapV: v 방향 순환
  function normalFrom(hc, strength, wrapV) {
    var w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
    var out = canvas(w, h), ox = out.getContext('2d'), od = ox.createImageData(w, h), x, y;
    function H(px, py) {
      if (px < 0) px = 0; if (px >= w) px = w - 1;
      if (wrapV) { py = (py + h) % h; } else { if (py < 0) py = 0; if (py >= h) py = h - 1; }
      return src[(py * w + px) * 4] / 255;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      var dy = (H(x, y + 1) - H(x, y - 1)) * strength;      // 캔버스 아래쪽이 v 감소 방향
      var nx = -dx, ny = dy, nz = 1, l = Math.sqrt(nx * nx + ny * ny + 1);
      var i = (y * w + x) * 4;
      od.data[i] = (nx / l * 0.5 + 0.5) * 255; od.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; od.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; od.data[i + 3] = 255;
    }
    ox.putImageData(od, 0, 0);
    return out;
  }

  function pore(ctx, x, y, rx, ry, rot, inner, rim) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.45);
    g.addColorStop(0, inner); g.addColorStop(0.55, inner); g.addColorStop(0.72, rim); g.addColorStop(1, 'rgba(255,225,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx * 1.45, 0, 7); ctx.fill();
    ctx.restore();
  }
  function hole(ctx, x, y, rx, ry, rot, depth) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.3);
    g.addColorStop(0, 'rgba(0,0,0,' + depth + ')'); g.addColorStop(0.6, 'rgba(0,0,0,' + depth * 0.85 + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx * 1.3, 0, 7); ctx.fill();
    ctx.restore();
  }
  function grain(ctx, w, h, R, amp) {
    var d = ctx.getImageData(0, 0, w, h), a = d.data;
    for (var i = 0; i < a.length; i += 4) { var n = (R() - 0.5) * amp; a[i] += n; a[i + 1] += n * 0.9; a[i + 2] += n * 0.6; }
    ctx.putImageData(d, 0, 0);
  }

  // ── 몸통(윗면·옆면) ──
  function body() {
    var S = C3.TEX_BODY, B = C3.TEX_BUMP, R = rng(7), i;
    var col = canvas(S, S), c = col.getContext('2d');
    c.fillStyle = '#FFD754'; c.fillRect(0, 0, S, S);
    mottle(c, S, S, 40, 40, R, null, 0.35, 'soft-light');
    mottle(c, S, S, 120, 120, R, null, 0.16, 'soft-light');
    // 윗면(v≈0.5) 구움색: 금빛 갈색 얼룩. 앞·뒤 위쪽 모서리에도 약하게
    for (i = 0; i < 90; i++) {
      var v = 0.5 + (R() - 0.5) * 0.30 * (R() < 0.8 ? 1 : 1.7), u = R();
      var r = 60 + R() * 140, a = 0.05 + R() * 0.12;
      var g = c.createRadialGradient(u * S, v * S, 0, u * S, v * S, r);
      g.addColorStop(0, 'rgba(234,162,28,' + a + ')'); g.addColorStop(1, 'rgba(228,150,22,0)');
      c.fillStyle = g; c.fillRect(u * S - r, v * S - r, r * 2, r * 2);
    }
    // 바닥은 살짝 어둡게(도마와 닿는 면)
    var gb = c.createLinearGradient(0, 0, 0, S);
    gb.addColorStop(0, 'rgba(190,120,20,0.22)'); gb.addColorStop(0.12, 'rgba(190,120,20,0)'); gb.addColorStop(0.88, 'rgba(190,120,20,0)'); gb.addColorStop(1, 'rgba(190,120,20,0.22)');
    c.fillStyle = gb; c.fillRect(0, 0, S, S);

    // 높이맵
    var hm = canvas(B, B), hc = hm.getContext('2d');
    hc.fillStyle = '#808080'; hc.fillRect(0, 0, B, B);
    mottle(hc, B, B, 30, 30, R, null, 0.5, 'source-over');   // 저주파 요철(굴곡)
    hc.globalAlpha = 0.72; hc.fillStyle = '#808080'; hc.fillRect(0, 0, B, B); hc.globalAlpha = 1;
    mottle(hc, B, B, 160, 160, R, null, 0.05, 'overlay');     // 미세 결

    // 기공 — 색(1024)·높이(512) 같은 좌표. 위·앞 면(v 0.2~0.8)에 몰린다
    var count = 230;
    for (i = 0; i < count; i++) {
      var pu = R(), pv = 0.14 + R() * 0.72;
      var big = R() < 0.1, rx = (big ? 4.5 + R() * 4.5 : 1.6 + R() * 3.2) * (S / 1024);
      var ry = rx * (0.6 + R() * 0.5), rot = R() * 3.14;
      pore(c, pu * S, pv * S, rx, ry, rot, 'rgba(214,150,26,0.82)', 'rgba(255,238,160,0.55)');
      hole(hc, pu * B, pv * B, rx * B / S * 1.0, ry * B / S * 1.0, rot, big ? 0.85 : 0.65);
    }
    // 아주 작은 점(기공 가루)
    for (i = 0; i < 260; i++) {
      var qu = R(), qv = 0.1 + R() * 0.8;
      c.fillStyle = 'rgba(222,160,30,' + (0.12 + R() * 0.16) + ')';
      c.beginPath(); c.arc(qu * S, qv * S, 0.6 + R() * 0.9, 0, 7); c.fill();
      hole(hc, qu * B, qv * B, 0.8 + R() * 0.7, 0.8 + R() * 0.7, 0, 0.4);
    }
    grain(c, S, S, R, 4);
    return { color: col, normal: normalFrom(hm, C3.NORMAL_STRENGTH * 2.0, true) };
  }

  // ── 절단면: 얇게 접힌 계란 층의 소용돌이(말린 단면) + 작은 기공 ──
  function cap() {
    var S = C3.TEX_CAP, R = rng(21), i;
    var col = canvas(S, S), c = col.getContext('2d');
    var bg = c.createRadialGradient(S * 0.46, S * 0.5, S * 0.05, S * 0.5, S * 0.5, S * 0.72);
    bg.addColorStop(0, '#FFDF78'); bg.addColorStop(0.6, '#FFD65A'); bg.addColorStop(1, '#F2B93A');
    c.fillStyle = bg; c.fillRect(0, 0, S, S);
    mottle(c, S, S, 24, 24, R, null, 0.4, 'soft-light');

    var hm = canvas(S, S), hc = hm.getContext('2d');
    hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);
    mottle(hc, S, S, 20, 20, R, null, 0.4, 'overlay');

    // 네모난 소용돌이 (superellipse 반지름이 각도에 따라 커진다)
    var cx = S * 0.45, cy = S * 0.52, turns = 4.2, rMax = S * 0.50, rMin = S * 0.025, P = 3.4;
    function pt(th, r) {
      var cs = Math.cos(th), sn = Math.sin(th);
      return [cx + r * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / P) * 1.04, cy + r * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / P)];
    }
    var T = turns * 2 * Math.PI, steps = 900, gap = (rMax - rMin) / turns;
    function spiral(ctx, width, style, off) {
      ctx.beginPath();
      for (i = 0; i <= steps; i++) {
        var th = T * i / steps, r = rMin + (rMax - rMin) * (th / T) + (off || 0), p = pt(th, r);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.lineWidth = width; ctx.strokeStyle = style; ctx.lineJoin = 'round'; ctx.stroke();
    }
    spiral(c, gap * 0.62, 'rgba(255,238,160,0.45)', gap * 0.28);          // 밝은 층
    spiral(c, 3.6, 'rgba(226,150,26,0.78)', 0);                            // 층 사이 경계선
    spiral(c, 1.6, 'rgba(255,244,190,0.55)', 4.5);                         // 경계선 옆 하이라이트
    spiral(hc, 5.5, 'rgba(0,0,0,0.55)', 0);                                // 높이: 층 사이가 살짝 파임
    spiral(hc, gap * 0.5, 'rgba(255,255,255,0.10)', gap * 0.3);

    for (i = 0; i < 110; i++) {
      var px = R() * S, py = R() * S, rx = 1.2 + R() * 3.2, ry = rx * (0.7 + R() * 0.5), rot = R() * 3.14;
      pore(c, px, py, rx, ry, rot, 'rgba(206,138,18,0.85)', 'rgba(255,238,160,0.5)');
      hole(hc, px, py, rx, ry, rot, 0.6);
    }
    grain(c, S, S, R, 10);
    return { color: col, normal: normalFrom(hm, C3.NORMAL_STRENGTH * 2.2, false) };
  }

  // ── 도마(나무결) ──
  function wood() {
    var R = rng(3), c, cv = canvas(512, 256), i;
    c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#E5C595'); g.addColorStop(1, '#D4AE7A');
    c.fillStyle = g; c.fillRect(0, 0, 512, 256);
    for (i = 0; i < 46; i++) {
      var y = R() * 256, amp = 2 + R() * 6, ph = R() * 6;
      c.beginPath(); c.moveTo(0, y);
      for (var x = 0; x <= 512; x += 16) c.lineTo(x, y + Math.sin(x * 0.013 + ph) * amp);
      c.strokeStyle = 'rgba(120,80,30,' + (0.05 + R() * 0.1) + ')'; c.lineWidth = 0.8 + R() * 1.6; c.stroke();
    }
    mottle(c, 512, 256, 20, 10, R, null, 0.25, 'soft-light');
    return cv;
  }

  // ── 접지 그림자(그림자맵 대신 얇은 판에 붙이는 부드러운 둥근 사각형) ──
  function shadow() {                      // ctx.filter(blur) 는 Safari 미지원 → 겹친 사각형으로 가장자리를 부드럽게
    var S = 128, cv = canvas(S, S), c = cv.getContext('2d'), k;
    for (k = 0; k < 24; k++) {
      var m = 20 + k * 1.9;
      c.fillStyle = 'rgba(40,20,0,0.06)';
      c.fillRect(m, m, S - 2 * m, S - 2 * m);
    }
    return cv;
  }

  // ═════════ 재료별 텍스처(연어·나루토·오이) ═════════
  // 몸통: 에셋 이미지가 있으면 보이는 면을 둘레 좌표(v)로 펼쳐 쓰고(길이 방향 u 는 이미지 가로 그대로), 없으면 절차적으로 그린다.
  // 단면: 에셋 이미지에 정면 단면이 없으므로(나루토·오이는 비스듬한 끝면 뿐) 에셋의 색·무늬 모양을 기준으로 새로 그린다.
  var BW = 1024, BH = 512, CAPS = 512;

  function foodImg(id) { var A = SL.assets; return A && A.img && A.img.food && A.img.food[id] || null; }

  // 원통: 스프라이트 한 줄(가로 전체)을 둘레 각도 a 에 대응시켜 행마다 복사 — 화면에 보이는 반원(카메라 정면 ±90°)만 의미가 있다
  function unwrapCylinder(c, im, x0f, x1f, camDeg) {
    var sx = im.width * x0f, sw = im.width * (x1f - x0f), ac = camDeg * Math.PI / 180, y;
    c.imageSmoothingQuality = 'high';
    for (y = 0; y < BH; y++) {
      var v = 1 - (y + 0.5) / BH, a = (-90 + 360 * v) * Math.PI / 180;
      var t = 0.5 - 0.5 * Math.sin(a - ac); t = Math.min(1, Math.max(0, t));
      c.drawImage(im, sx, Math.min(im.height - 1, Math.floor(t * im.height)), sw, 1, 0, y, BW, 1);
    }
  }
  // 직육면체: 이미지 세로 전체를 둘레 비율 [vLo, vHi] 구간(앞 아래 모서리 → 윗면 뒤쪽)에 선형으로 입힌다
  function unwrapBlock(c, im, vLo, vHi) {
    var yTop = (1 - vHi) * BH, yBot = (1 - vLo) * BH;
    c.imageSmoothingQuality = 'high';
    c.drawImage(im, 0, 0, im.width, 1, 0, 0, BW, Math.max(1, yTop));                 // 안 보이는 뒤쪽: 가장자리 줄을 늘여 채움
    c.drawImage(im, 0, im.height - 1, im.width, 1, 0, yBot, BW, BH - yBot);
    c.drawImage(im, 0, 0, im.width, im.height, 0, yTop, BW, yBot - yTop);
  }
  function avgColor(im) {
    var s = canvas(8, 8), x = s.getContext('2d'); x.drawImage(im, 0, 0, 8, 8);
    var d = x.getImageData(0, 0, 8, 8).data, r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    n = n || 1; return 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
  }
  function noiseHeight(S1, S2, R, amp) {
    var hm = canvas(S1, S2), hc = hm.getContext('2d');
    hc.fillStyle = '#808080'; hc.fillRect(0, 0, S1, S2);
    mottle(hc, S1, S2, S1 / 8, S2 / 8, R, null, amp, 'overlay');
    return { cv: hm, c: hc };
  }

  // ── 연어 ──
  function salmonBody() {
    var R = rng(31), im = foodImg('salmon'), col = canvas(BW, BH), c = col.getContext('2d'), i;
    c.fillStyle = im ? avgColor(im) : '#F2692B'; c.fillRect(0, 0, BW, BH);
    if (im) {
      var sh = SL.mesh3d.shape('salmon'), n = SL.C.ROLL3D.RING_CORNER, ring = sh.sp;
      unwrapBlock(c, im, ring[1 + Math.floor(n / 2)], ring[1 + 2 * (n + 1) + Math.floor(n / 2)]);
    } else {
      var g = c.createLinearGradient(0, 0, 0, BH); g.addColorStop(0, '#F57A38'); g.addColorStop(1, '#EF5F26'); c.fillStyle = g; c.fillRect(0, 0, BW, BH);
      for (i = 0; i < 14; i++) {
        var y0 = BH * (0.15 + R() * 0.7), x0 = R() * BW; c.beginPath(); c.moveTo(x0, y0);
        c.bezierCurveTo(x0 + 120, y0 - 70 + R() * 40, x0 + 220, y0 + 80 - R() * 40, x0 + 360, y0 + 20); c.strokeStyle = 'rgba(255,224,200,' + (0.4 + R() * 0.4) + ')'; c.lineWidth = 3 + R() * 6; c.stroke();
      }
    }
    var hm = noiseHeight(BW / 2, BH / 2, R, 0.35);
    return { color: col, normal: normalFrom(hm.cv, 1.2, true) };
  }
  function salmonCap() {
    var S = CAPS, R = rng(33), col = canvas(S, S), c = col.getContext('2d'), i;
    var bg = c.createRadialGradient(S * 0.5, S * 0.45, S * 0.05, S * 0.5, S * 0.5, S * 0.7);
    bg.addColorStop(0, '#FA8650'); bg.addColorStop(0.6, '#F36C32'); bg.addColorStop(1, '#E85A22');
    c.fillStyle = bg; c.fillRect(0, 0, S, S);
    mottle(c, S, S, 20, 20, R, null, 0.35, 'soft-light');
    c.lineCap = 'round';
    for (i = 0; i < 70; i++) {                                    // 가는 근섬유 결
      var fx = R() * S, fy = R() * S, fl = 18 + R() * 40, fa = -0.5 + R() * 1.0;
      c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
      c.strokeStyle = 'rgba(214,80,26,' + (0.10 + R() * 0.12) + ')'; c.lineWidth = 1 + R() * 1.6; c.stroke();
    }
    for (i = 0; i < 7; i++) {                                     // 크림색 지방결(위쪽에서 아래쪽으로 흐르는 완만한 곡선)
      var y0 = S * (0.04 + 0.15 * i + R() * 0.06), amp = 18 + R() * 34, w = 5 + R() * 9, ph = R() * 6;
      c.beginPath();
      for (var x = -10; x <= S + 10; x += 12) { var y = y0 + x * 0.20 + Math.sin(x * 0.015 + ph) * amp; if (x === -10) c.moveTo(x, y); else c.lineTo(x, y); }
      c.strokeStyle = 'rgba(255,226,204,' + (0.55 + R() * 0.3) + ')'; c.lineWidth = w; c.stroke();
      c.strokeStyle = 'rgba(255,244,232,0.5)'; c.lineWidth = Math.max(1.5, w * 0.35); c.stroke();
    }
    grain(c, S, S, R, 8);
    var hm = noiseHeight(S / 2, S / 2, R, 0.25);
    return { color: col, normal: normalFrom(hm.cv, 1.0, false) };
  }

  // ── 나루토 어묵 ──
  function narutoBody() {
    var R = rng(41), col = canvas(BW, BH), c = col.getContext('2d'), i;
    var g = c.createLinearGradient(0, 0, 0, BH);
    g.addColorStop(0, '#F5EAD6'); g.addColorStop(0.5, '#FBF4E6'); g.addColorStop(1, '#F3E7D0');
    c.fillStyle = g; c.fillRect(0, 0, BW, BH);
    mottle(c, BW, BH, 40, 20, R, null, 0.18, 'soft-light');
    var hm = noiseHeight(BW / 2, BH / 2, R, 0.2), hc = hm.c;
    for (i = 0; i < 1100; i++) {                                  // 에셋의 어묵 표면처럼 작은 기공
      var u = R(), v = 0.05 + R() * 0.9, r = 0.5 + R() * 0.9;
      c.fillStyle = 'rgba(214,190,150,' + (0.18 + R() * 0.2) + ')'; c.beginPath(); c.ellipse(u * BW, v * BH, r * 1.3, r, 0, 0, 7); c.fill();
      hole(hc, u * BW / 2, v * BH / 2, r * 0.6, r * 0.5, 0, 0.45);
    }
    grain(c, BW, BH, R, 5);
    return { color: col, normal: normalFrom(hm.cv, 2.2, true) };
  }
  function narutoCap() {
    var S = CAPS, R = rng(43), col = canvas(S, S), c = col.getContext('2d'), i, cx = S / 2, cy = S / 2, Rr = S * 0.47;
    var bg = c.createRadialGradient(cx, cy, 0, cx, cy, S * 0.7);
    bg.addColorStop(0, '#FFF9EE'); bg.addColorStop(1, '#F6EAD3');
    c.fillStyle = bg; c.fillRect(0, 0, S, S);
    var hm = noiseHeight(S / 2, S / 2, R, 0.15), hc = hm.c;
    // 분홍 소용돌이: 중심에서 시작해 두 바퀴 반
    function spiral(ctx, w, style, sc) {
      ctx.beginPath();
      for (var t = 0; t <= 1.0001; t += 0.004) {
        var th = t * 5.0 * Math.PI + 0.6, r = (0.05 + 0.80 * t) * Rr * sc, x = cx * (sc === 1 ? 1 : 0.5) + r * Math.cos(th), y = cy * (sc === 1 ? 1 : 0.5) - r * Math.sin(th);
        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = style; ctx.stroke();
    }
    spiral(c, Rr * 0.17, '#E9588A', 1);
    spiral(c, Rr * 0.07, 'rgba(255,150,180,0.55)', 1);
    for (i = 0; i < 520; i++) {                                    // 기공
      var a = R() * 6.283, d = Math.sqrt(R()) * Rr * 0.97, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d, r = 0.8 + R() * 1.7;
      c.fillStyle = 'rgba(205,180,140,' + (0.15 + R() * 0.2) + ')'; c.beginPath(); c.arc(px, py, r * 0.8, 0, 7); c.fill();
      hole(hc, px / 2, py / 2, r * 0.6, r * 0.6, 0, 0.6);
    }
    grain(c, S, S, R, 6);
    return { color: col, normal: normalFrom(hm.cv, 1.6, false) };
  }

  // ── 오이 ──
  function cucumberBody() {
    var R = rng(51), im = foodImg('cucumber'), col = canvas(BW, BH), c = col.getContext('2d'), i;
    c.fillStyle = im ? avgColor(im) : '#5E9B2D'; c.fillRect(0, 0, BW, BH);
    if (im) unwrapCylinder(c, im, 0.095, 0.985, SL.C.ROLL3D.CAM_EL_DEG);
    else {
      var g = c.createLinearGradient(0, 0, 0, BH); g.addColorStop(0, '#4E8A24'); g.addColorStop(0.5, '#6BAA35'); g.addColorStop(1, '#4E8A24'); c.fillStyle = g; c.fillRect(0, 0, BW, BH);
      for (i = 0; i < 160; i++) { c.fillStyle = 'rgba(190,230,120,' + (0.1 + R() * 0.15) + ')'; c.fillRect(R() * BW, R() * BH, 40 + R() * 90, 2); }
    }
    var hm = noiseHeight(BW / 2, BH / 2, R, 0.3);
    for (i = 0; i < 90; i++) { hole(hm.c, R() * BW / 2, (0.2 + R() * 0.6) * BH / 2, 2, 2, 0, 0.5); }
    return { color: col, normal: normalFrom(hm.cv, 1.4, true) };
  }
  function cucumberCap() {
    var S = CAPS, R = rng(53), col = canvas(S, S), c = col.getContext('2d'), i, cx = S / 2, cy = S / 2, Rr = S * 0.5;
    c.fillStyle = '#3F7A25'; c.fillRect(0, 0, S, S);                 // 껍질(바깥 가장자리)
    var fl = c.createRadialGradient(cx, cy, 0, cx, cy, Rr * 0.94);   // 연한 속살
    fl.addColorStop(0, '#E6EFC6'); fl.addColorStop(0.55, '#EAF2D4'); fl.addColorStop(1, '#D3E5B2');
    c.fillStyle = fl; c.beginPath(); c.arc(cx, cy, Rr * 0.935, 0, 7); c.fill();
    c.strokeStyle = 'rgba(96,160,60,0.6)'; c.lineWidth = Rr * 0.04; c.beginPath(); c.arc(cx, cy, Rr * 0.9, 0, 7); c.stroke();   // 껍질 바로 안쪽의 진한 속살 띠
    // 씨 부분: 세 갈래로 퍼진 촉촉한 영역
    c.fillStyle = 'rgba(214,226,160,0.9)';
    for (i = 0; i < 3; i++) {
      var th = i * 2.0944 + 0.5, ex = cx + Math.cos(th) * Rr * 0.34, ey = cy + Math.sin(th) * Rr * 0.34;
      c.save(); c.translate(ex, ey); c.rotate(th); c.scale(1.5, 0.9); c.beginPath(); c.arc(0, 0, Rr * 0.2, 0, 7); c.fill(); c.restore();
    }
    c.beginPath(); c.arc(cx, cy, Rr * 0.16, 0, 7); c.fill();
    for (i = 0; i < 60; i++) {                                       // 씨앗
      var a = R() * 6.283, d = Math.sqrt(R()) * Rr * 0.5, sx = cx + Math.cos(a) * d, sy = cy + Math.sin(a) * d;
      c.save(); c.translate(sx, sy); c.rotate(R() * 6.283); c.scale(1.7, 0.9);
      c.fillStyle = 'rgba(248,244,214,0.95)'; c.beginPath(); c.arc(0, 0, 3.2 + R() * 2.2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(180,196,120,0.7)'; c.lineWidth = 0.9; c.stroke(); c.restore();
    }
    // 촉촉한 반사
    var gl = c.createRadialGradient(cx - Rr * 0.3, cy - Rr * 0.35, 0, cx - Rr * 0.3, cy - Rr * 0.35, Rr * 0.6);
    gl.addColorStop(0, 'rgba(255,255,255,0.28)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(0, 0, S, S);
    grain(c, S, S, R, 5);
    var hm = noiseHeight(S / 2, S / 2, R, 0.2);
    return { color: col, normal: normalFrom(hm.cv, 0.8, false) };
  }

  var cache = {};
  // 재료별 {body, cap, rough} — 에셋 로드 뒤 처음 필요할 때 한 번만 만든다
  function forIngredient(id) {
    if (cache[id]) return cache[id];
    var r;
    if (id === 'tamago') r = { body: body(), cap: cap(), rough: { body: 0.96, cap: 0.96 } };
    else if (id === 'salmon') r = { body: salmonBody(), cap: salmonCap(), rough: { body: 0.5, cap: 0.55 } };
    else if (id === 'naruto') r = { body: narutoBody(), cap: narutoCap(), rough: { body: 0.92, cap: 0.9 } };
    else r = { body: cucumberBody(), cap: cucumberCap(), rough: { body: 0.6, cap: 0.42 } };
    cache[id] = r;
    return r;
  }

  SL.tex3d = { body: body, cap: cap, wood: wood, shadow: shadow, forIngredient: forIngredient };
})();
