/* 재료 그림 4종 — 실제 에셋(assets/*.png → assets_data.js)이 로드되면 그 이미지를, 아니면 아래 ART(캔버스 임시 그림)를 쓴다.
 * 모두 "도마 위에 가로로 놓인 재료를 옆에서 본 모습". 텍스처는 길이 방향으로 이어져 있어 잘린 조각이 원래 자리의 무늬를 그대로 가진다.
 * sprite(id, w, h, dpr) → 전체 재료가 그려진 오프스크린 캔버스(캐시). 조각은 이 캔버스의 구간을 잘라 그린다. */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};

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

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function vgrad(c, h, stops) {
    var g = c.createLinearGradient(0, 0, 0, h);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  // 공통 마감: 위쪽 빛 반사 + 아래쪽 음영 + 외곽선
  function finish(c, w, h, r, line) {
    c.save();
    rr(c, 0, 0, w, h, r); c.clip();
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.28, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.20)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.restore();
    c.strokeStyle = line; c.lineWidth = 1.5;
    rr(c, 0.75, 0.75, w - 1.5, h - 1.5, r); c.stroke();
  }

  var ART = {
    // 나루토 어묵: 흰 몸통 + 분홍 소용돌이 띠(옆에서 보면 비스듬한 물결 줄무늬)
    naruto: function (c, w, h) {
      var r = h * 0.2, R = rng(11), x, k;
      rr(c, 0, 0, w, h, r); c.fillStyle = vgrad(c, h, [[0, '#FFFFFF'], [0.55, '#F6F1E8'], [1, '#E4DBCB']]); c.fill();
      c.save(); rr(c, 0, 0, w, h, r); c.clip();
      var period = h * 1.25;
      for (x = -period; x < w + period; x += period) {
        c.beginPath();
        for (k = 0; k <= 24; k++) {
          var t = k / 24, yy = t * h, xx = x + (t - 0.5) * h * 0.9 + Math.sin(t * Math.PI * 2 + x * 0.05) * h * 0.09;
          if (k === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy);
        }
        c.lineWidth = h * 0.16; c.lineCap = 'round'; c.strokeStyle = '#F29BB4'; c.stroke();
        c.lineWidth = h * 0.06; c.strokeStyle = '#F9C3D2'; c.stroke();
      }
      // 살짝 눌린 자국
      for (k = 0; k < 26; k++) { c.fillStyle = 'rgba(190,170,140,0.16)'; c.beginPath(); c.arc(R() * w, R() * h, 0.8 + R() * 1.2, 0, 7); c.fill(); }
      c.restore();
      finish(c, w, h, r, 'rgba(120,100,80,0.55)');
    },

    // 계란말이: 노란 층층 + 윗면 갈색 구움
    tamago: function (c, w, h) {
      var r = h * 0.14, R = rng(23), i, k;
      rr(c, 0, 0, w, h, r); c.fillStyle = vgrad(c, h, [[0, '#FFE98A'], [0.5, '#FBD04F'], [1, '#EAA928']]); c.fill();
      c.save(); rr(c, 0, 0, w, h, r); c.clip();
      for (i = 1; i <= 4; i++) {
        var y0 = h * (i / 5);
        c.beginPath();
        for (k = 0; k <= 40; k++) {
          var xx = w * k / 40;
          var yy = y0 + Math.sin(k * 0.55 + i * 1.7) * h * 0.018;
          if (k === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy);
        }
        c.lineWidth = 1.6; c.strokeStyle = 'rgba(196,128,30,0.6)'; c.stroke();
      }
      for (i = 0; i < 9; i++) {
        c.fillStyle = 'rgba(176,104,28,0.28)';
        c.beginPath(); c.ellipse(R() * w, h * (0.04 + R() * 0.16), 10 + R() * 22, 2 + R() * 3, 0, 0, 7); c.fill();
      }
      for (i = 0; i < 18; i++) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(R() * w, R() * h, 0.8 + R(), 0, 7); c.fill(); }
      c.restore();
      finish(c, w, h, r, 'rgba(150,96,20,0.6)');
    },

    // 연어: 주황 살 + 흰 지방 결(비스듬한 줄)
    salmon: function (c, w, h) {
      var r = h * 0.12, R = rng(37), x, k;
      rr(c, 0, 0, w, h, r); c.fillStyle = vgrad(c, h, [[0, '#FFB08A'], [0.45, '#F97D56'], [1, '#E0553A']]); c.fill();
      c.save(); rr(c, 0, 0, w, h, r); c.clip();
      for (x = -h; x < w + h; x += 15 + R() * 17) {
        var lean = h * (0.55 + R() * 0.25), wob = h * (0.03 + R() * 0.05), ph = R() * 6.28, lw = 1.4 + R() * 3.2;
        c.beginPath();
        for (k = 0; k <= 16; k++) {
          var t = k / 16;
          var xx = x + (t - 0.5) * lean + Math.sin(t * 5 + ph) * wob;
          if (k === 0) c.moveTo(xx, t * h); else c.lineTo(xx, t * h);
        }
        c.lineCap = 'round'; c.lineWidth = lw; c.strokeStyle = 'rgba(255,240,230,' + (0.55 + R() * 0.3) + ')'; c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.20)'; c.fillRect(0, h * 0.08, w, h * 0.06);   // 윤기
      c.restore();
      finish(c, w, h, r, 'rgba(150,50,30,0.55)');
    },

    // 오이: 진한 초록 껍질 + 밝은 줄 + 돌기
    cucumber: function (c, w, h) {
      var r = h * 0.3, R = rng(51), i;
      rr(c, 0, 0, w, h, r); c.fillStyle = vgrad(c, h, [[0, '#8ED06A'], [0.4, '#4BA640'], [1, '#26702B']]); c.fill();
      c.save(); rr(c, 0, 0, w, h, r); c.clip();
      for (i = 0; i < 7; i++) {
        var y0 = h * (0.15 + i * 0.12);
        c.beginPath(); c.moveTo(0, y0);
        for (var k = 1; k <= 30; k++) c.lineTo(w * k / 30, y0 + Math.sin(k * 0.8 + i) * h * 0.012);
        c.lineWidth = 1.2; c.strokeStyle = i % 2 ? 'rgba(200,240,170,0.45)' : 'rgba(20,70,25,0.35)'; c.stroke();
      }
      for (i = 0; i < 70; i++) {
        var px = R() * w, py = h * (0.12 + R() * 0.76);
        c.fillStyle = R() > 0.5 ? 'rgba(20,70,25,0.45)' : 'rgba(210,245,180,0.5)';
        c.beginPath(); c.arc(px, py, 0.9 + R() * 1.1, 0, 7); c.fill();
      }
      c.restore();
      finish(c, w, h, r, 'rgba(20,70,25,0.7)');
    }
  };

  // ── 절단면(재료 단면): 정면에서 본 정사각 텍스처. 윤곽 밖은 투명 → 사선으로 눕혀 그릴 때 재료 단면 모양이 된다 ──
  var FACE = {
    // 연어: 주황빛 살 + 크림색 지방결(굽이치는 줄)
    salmon: function (c, S) {
      var R = rng(71), k, i;
      rr(c, S * 0.03, S * 0.08, S * 0.94, S * 0.84, S * 0.14); c.fillStyle = vgrad(c, S, [[0, '#FF9A68'], [0.5, '#F57440'], [1, '#EA5A30']]); c.fill();
      c.save(); rr(c, S * 0.03, S * 0.08, S * 0.94, S * 0.84, S * 0.14); c.clip();
      for (i = 0; i < 7; i++) {
        var x0 = S * (0.04 + i * 0.15 + R() * 0.04), ph = R() * 6.28;
        c.beginPath();
        for (k = 0; k <= 14; k++) { var t = k / 14; var xx = x0 + (t - 0.5) * S * 0.32 + Math.sin(t * 4 + ph) * S * 0.03; if (k === 0) c.moveTo(xx, S * (0.08 + 0.84 * t)); else c.lineTo(xx, S * (0.08 + 0.84 * t)); }
        c.lineCap = 'round'; c.lineWidth = S * (0.018 + R() * 0.02); c.strokeStyle = 'rgba(255,236,214,' + (0.75 + R() * 0.2) + ')'; c.stroke();
      }
      c.restore();
      c.strokeStyle = 'rgba(160,52,24,0.85)'; c.lineWidth = Math.max(1, S * 0.018); rr(c, S * 0.03, S * 0.08, S * 0.94, S * 0.84, S * 0.14); c.stroke();
    },
    // 오이: 초록 껍질 + 연한 속살 + 가운데 씨 부분(3갈래)
    cucumber: function (c, S) {
      var R = rng(83), i, cx = S / 2, cy = S / 2;
      c.beginPath(); c.ellipse(cx, cy, S * 0.47, S * 0.43, 0, 0, 7); c.fillStyle = '#2F7A2E'; c.fill();
      c.beginPath(); c.ellipse(cx, cy, S * 0.42, S * 0.38, 0, 0, 7); c.fillStyle = '#9BCB6A'; c.fill();
      var g = c.createRadialGradient(cx, cy, S * 0.04, cx, cy, S * 0.4); g.addColorStop(0, '#E9F3C4'); g.addColorStop(0.6, '#D4E8A4'); g.addColorStop(1, '#B6D882');
      c.beginPath(); c.ellipse(cx, cy, S * 0.395, S * 0.355, 0, 0, 7); c.fillStyle = g; c.fill();
      c.beginPath(); c.ellipse(cx, cy, S * 0.2, S * 0.17, 0, 0, 7); c.fillStyle = 'rgba(244,250,214,0.85)'; c.fill();
      for (i = 0; i < 3; i++) {
        var a = -Math.PI / 2 + i * Math.PI * 2 / 3, px = cx + Math.cos(a) * S * 0.09, py = cy + Math.sin(a) * S * 0.08;
        c.save(); c.translate(px, py); c.rotate(a);
        c.beginPath(); c.ellipse(0, 0, S * 0.095, S * 0.05, 0, 0, 7); c.fillStyle = 'rgba(214,230,160,0.95)'; c.fill();
        for (var k = 0; k < 4; k++) { c.beginPath(); c.ellipse((k - 1.5) * S * 0.035, (R() - 0.5) * S * 0.02, S * 0.014, S * 0.008, 0, 0, 7); c.fillStyle = '#F6F3D2'; c.fill(); }
        c.restore();
      }
      c.beginPath(); c.ellipse(cx, cy, S * 0.47, S * 0.43, 0, 0, 7); c.strokeStyle = 'rgba(20,70,25,0.8)'; c.lineWidth = Math.max(1, S * 0.015); c.stroke();
    },
    // 나루토 어묵: 흰 속살 + 분홍 소용돌이 + 분홍 바깥 띠
    naruto: function (c, S) {
      var cx = S / 2, cy = S / 2, t;
      c.beginPath(); c.ellipse(cx, cy, S * 0.47, S * 0.43, 0, 0, 7); c.fillStyle = '#FBF6EC'; c.fill();
      c.save(); c.beginPath(); c.ellipse(cx, cy, S * 0.47, S * 0.43, 0, 0, 7); c.clip();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      for (t = 0; t <= 1.0001; t += 0.01) { var ang = t * Math.PI * 5.2, r = 0.03 + t * 0.35; var x = cx + Math.cos(ang) * S * r * 1.07, y = cy + Math.sin(ang) * S * r * 0.97; if (t === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.lineWidth = S * 0.075; c.strokeStyle = '#F08CAB'; c.stroke();
      c.lineWidth = S * 0.03; c.strokeStyle = '#F8BDD0'; c.stroke();
      c.beginPath(); c.ellipse(cx, cy, S * 0.445, S * 0.405, 0, 0, 7); c.lineWidth = S * 0.05; c.strokeStyle = '#F29DB7'; c.stroke();
      c.restore();
      c.beginPath(); c.ellipse(cx, cy, S * 0.47, S * 0.43, 0, 0, 7); c.strokeStyle = 'rgba(150,100,100,0.7)'; c.lineWidth = Math.max(1, S * 0.015); c.stroke();
    },
    // 계란말이(2D 대체): 노란 층 + 작은 기공
    tamago: function (c, S) {
      var R = rng(97), i, n = 5;
      rr(c, S * 0.04, S * 0.06, S * 0.92, S * 0.88, S * 0.2); c.fillStyle = '#FFD650'; c.fill();
      c.save(); rr(c, S * 0.04, S * 0.06, S * 0.92, S * 0.88, S * 0.2); c.clip();
      for (i = 0; i < n; i++) { var m = 0.08 + i * 0.075; rr(c, S * m, S * (0.06 + (m - 0.04) * 0.95), S * (1 - 2 * m), S * (0.88 - (m - 0.04) * 1.9), S * 0.14); c.lineWidth = S * 0.012; c.strokeStyle = i % 2 ? 'rgba(236,170,40,0.7)' : 'rgba(255,238,160,0.9)'; c.stroke(); }
      for (i = 0; i < 26; i++) { c.beginPath(); c.arc(S * (0.15 + R() * 0.7), S * (0.15 + R() * 0.7), S * (0.006 + R() * 0.012), 0, 7); c.fillStyle = 'rgba(214,150,40,0.55)'; c.fill(); }
      c.restore();
      c.strokeStyle = 'rgba(176,112,24,0.8)'; c.lineWidth = Math.max(1, S * 0.015); rr(c, S * 0.04, S * 0.06, S * 0.92, S * 0.88, S * 0.2); c.stroke();
    }
  };
  var faceCache = {};
  function face(id, S) {
    var key = id + '|' + S;
    if (faceCache[key]) return faceCache[key];
    var cv = document.createElement('canvas'); cv.width = cv.height = S;
    FACE[id](cv.getContext('2d'), S);
    return (faceCache[key] = cv);
  }

  var cache = {};
  function sprite(id, w, h, dpr) {
    var key = id + '|' + Math.round(w) + 'x' + Math.round(h) + '@' + dpr;
    if (cache[key]) return cache[key];
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    var c = cv.getContext('2d');
    var im = SL.assets && SL.assets.img.food[id];
    if (im) {                                   // 실제 에셋: 비율이 같은 이미지를 그대로 축소(늘이거나 찌그러뜨리지 않는다)
      c.imageSmoothingQuality = 'high';
      c.drawImage(im, 0, 0, cv.width, cv.height);
    } else {
      c.scale(dpr, dpr);
      ART[id](c, w, h);
    }
    cache = Object.keys(cache).length > 24 ? {} : cache;   // 리사이즈로 늘어나는 것 방지
    if (im) cache[key] = cv;                    // 임시 그림은 에셋 로드 후 교체돼야 하므로 캐시하지 않는다
    return cv;
  }

  SL.ingredients = { sprite: sprite, face: face };
})();
