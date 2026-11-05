/* 썰기 효과음 — 에셋 파일 없이 WebAudio 로 합성한다. 한 번 썰 때 '스윽'(재료를 통과) → '탁'(칼날이 나무 도마에 닿음).
 *  - 타이밍(C.CUT 타임라인): 칼이 표면에 닿아 누르는 PRESS 가 지나면 칼날이 재료를 통과하기 시작하므로 '스윽' 은 PRESS 에, 칼날이 도마에 닿는 BOARD 에 '탁' 을 예약한다(오디오 시계로 예약 → 프레임 지터와 무관).
 *  - 재질: 오이 아삭(고음 노이즈 + 잔 파열음) / 계란말이 부드럽고 푹신 / 연어 촉촉하고 매끈 / 나루토 탄력(고무 같은 짧은 톤).
 *    '탁'은 4종 모두 같은 나무 도마 소리(짧은 울림)이고 재료 소리가 묻히지 않게 작게 둔다.
 *  - 변주: 재료마다 비슷한 소리 3개를 번갈아 쓰고(직전과 같은 것은 연속 선택 안 함) 값에 미세한 무작위를 더해 기계적 반복을 피한다.
 *  - 호출은 "절단 성공" 시점에서만 한다(main.js doCut). 칼 이동·키 길게 누르기는 소리를 내지 않는다.
 *  - 브라우저 정책상 첫 사용자 동작(누름·터치·키)에서 AudioContext 를 만들고 resume 한다(unlock). */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C = SL.C;

  var elog = [];   // 엔딩 소리 기록(QA)
  var ctx = null, master = null, noiseBuf = null, last = {}, log = [];
  var out = null, prevSwish = null, muted = false;
  try { muted = localStorage.getItem('cut_mute') === '1'; } catch (e) { /* 무시 */ }        // out = 지금 만드는 소리가 연결될 버스(스윽 버스/탁 버스). 다음 절단이 오면 앞 스윽 버스는 짧게 줄여 잔향이 다음 소리를 덮지 않게 한다

  function unlock() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
        var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ctx.destination);
        var n = Math.floor(ctx.sampleRate * 0.6), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        noiseBuf = b;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }

  function noise(t, dur, type, f0, f1, q, g, atk) {       // 필터 통과 노이즈 한 덩어리 (f0 → f1 주파수 이동, 어택 atk 후 지수 감쇠)
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var a = ctx.createGain(); a.gain.setValueAtTime(0.0001, t);
    a.gain.linearRampToValueAtTime(g, t + atk); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(a); a.connect(out || master);
    s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.02);
  }
  function tone(t, dur, type, f0, f1, g, atk) {            // 짧은 톤 (f0 → f1)
    var o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var a = ctx.createGain(); a.gain.setValueAtTime(0.0001, t);
    a.gain.linearRampToValueAtTime(g, t + (atk || 0.003)); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(a); a.connect(out || master); o.start(t); o.stop(t + dur + 0.02);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // 재료 소리('스윽'). v = 변주 0~2 (같은 재료의 비슷한 소리 3종), t = 시작 시각
  var SWISH = {
    cucumber: function (t, v) {                             // 아삭: 밝은 대역 + 잔 파열음 몇 개
      var f = [3600, 4300, 3100][v];
      noise(t, 0.06, 'bandpass', f, f * 0.7, 1.3, 0.6, 0.005);
      noise(t, 0.05, 'highpass', 6000, 6000, 0.7, 0.22, 0.003);
      var n = [4, 5, 3][v];
      for (var i = 0; i < n; i++) noise(t + rnd(0.004, 0.05), 0.016, 'bandpass', rnd(2600, 5200), 2400, 2, rnd(0.32, 0.5), 0.001);
    },
    tamago: function (t, v) {                               // 부드럽고 푹신: 낮은 대역, 느린 어택
      var f = [900, 750, 1050][v];
      noise(t, 0.09, 'lowpass', f, f * 0.55, 0.6, 0.55, 0.02);
      tone(t, 0.07, 'sine', [150, 135, 165][v], 95, 0.16, 0.02);
    },
    salmon: function (t, v) {                               // 촉촉하고 매끈: 중대역이 아래로 미끄러짐 + 약한 물기
      var f = [2100, 1800, 2400][v];
      noise(t, 0.085, 'bandpass', f, f * 0.5, 2.2, 0.5, 0.01);
      noise(t + 0.015, 0.05, 'lowpass', 700, 420, 1.1, 0.24, 0.012);
      noise(t + rnd(0.03, 0.06), 0.02, 'bandpass', 1500, 900, 4, 0.22, 0.002);
    },
    naruto: function (t, v) {                               // 탄력: 중간 대역 + 고무 같은 짧은 톤
      var f = [1250, 1100, 1400][v];
      noise(t, 0.07, 'bandpass', f, f * 0.72, 3, 0.55, 0.007);
      tone(t, 0.055, 'triangle', [330, 290, 360][v], [210, 190, 235][v], 0.15, 0.006);
    }
  };

  // 나무 도마 '탁' — 4종 공통: 짧고 마른 나무 소리(몸통 ~55ms + 얇은 딱 소리), 울림을 길게 끌지 않는다
  function thock(t, v) {
    var p = [1, 0.94, 1.07][v] * rnd(0.97, 1.03);
    tone(t, 0.055, 'sine', 240 * p, 120 * p, 0.42, 0.0015);
    tone(t, 0.03, 'triangle', 520 * p, 260 * p, 0.2, 0.001);
    noise(t, 0.014, 'bandpass', 2200 * p, 1500, 1.6, 0.4, 0.001);
  }

  function nextVariant(id) {                                // 3종을 번갈아, 직전과 같은 변주는 연속 선택하지 않는다
    var prev = last[id], v;
    do { v = Math.floor(Math.random() * 3); } while (v === prev);
    last[id] = v;
    return v;
  }

  // 절단 성공 한 번 = 스윽 + 탁. 반환: 재생 정보(QA용) 또는 null(오디오 불가)
  function cut(id) {
    unlock();
    if (muted) { log.push({ id: id, played: false, muted: true }); return null; }
    if (!ctx || ctx.state !== 'running') { log.push({ id: id, played: false }); return null; }
    var fn = SWISH[id] || SWISH.tamago, v = nextVariant(id), t0 = ctx.currentTime + 0.005, U = C.CUT;
    var t = t0 + U.RESIST / 1000, dt = (U.BOARD - U.RESIST) / 1000;   // 스윽 = 표면 저항을 넘어 칼날이 재료를 통과하기 시작할 때, 탁 = 칼날이 도마에 닿는 순간(약 40ms 뒤 — 한 번의 '스윽탁')
    var sb = ctx.createGain(), tb = ctx.createGain(); sb.connect(master); tb.connect(master);
    if (prevSwish) { prevSwish.gain.cancelScheduledValues(t0); prevSwish.gain.setTargetAtTime(0, t0, 0.006); }   // 연속 절단: 앞 스윽의 꼬리는 바로 끊는다(탁은 그대로)
    prevSwish = sb;
    out = sb; fn(t, v);
    out = tb; thock(t + dt, v);
    out = null;
    var rec = { id: id, played: true, v: v, at: t, thockAt: t + dt, wall: performance.now() };
    log.push(rec);
    if (log.length > 200) log.shift();
    return rec;
  }


  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('cut_mute', muted ? '1' : '0'); } catch (e) { /* 무시 */ }
    if (master) master.gain.value = muted ? 0 : 0.9;       // 이미 예약된 소리도 즉시 꺼진다
  }

  // 엔딩 '챙' — 덮개가 접시에서 들리는 순간의 가벼운 금속음(은색 부분음 4개, 짧게 울리고 사라짐)
  function clink() {
    unlock();
    var rec = { kind: 'clink', played: false };
    if (muted || !ctx || ctx.state !== 'running') { elog.push(rec); return rec; }
    var t = ctx.currentTime + 0.005; out = null;
    [[1850, 0.3, 0.26], [2790, 0.24, 0.2], [4180, 0.18, 0.14], [5320, 0.12, 0.09]].forEach(function (p) { tone(t, p[1], 'sine', p[0], p[0] * 0.995, p[2], 0.001); });
    noise(t, 0.02, 'highpass', 5000, 5000, 0.7, 0.25, 0.001);
    rec.played = true; rec.at = t; elog.push(rec); return rec;
  }

  // 엔딩 팡파르 '쵕—!' — 브라스 스탭(짧은 도입음 + 으뜸화음) + 심벌 크래시, 약 1.5초. 호출한 쪽(ending.js)이 한 판에 한 번만 부른다
  function brass(t, f, dur, g) {
    [-7, 7].forEach(function (cents) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.05); lp.frequency.exponentialRampToValueAtTime(1500, t + dur);
      var a = ctx.createGain(); a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + 0.018);
      a.gain.setValueAtTime(g * 0.8, t + dur * 0.55); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(a); a.connect(master); o.start(t); o.stop(t + dur + 0.03);
    });
  }
  function fanfare() {
    unlock();
    var rec = { kind: 'fanfare', played: false };
    if (muted || !ctx || ctx.state !== 'running') { elog.push(rec); return rec; }
    var t = ctx.currentTime + 0.01, tc = t + 0.13; out = null;
    brass(t, 392, 0.11, 0.1);                                                           // 도입음 (솔)
    [130.8, 261.6, 329.6, 392, 523.3].forEach(function (f, i) { brass(tc, f, 1.25, i === 0 ? 0.12 : 0.085); });   // 으뜸화음 (도 미 솔 도)
    noise(tc, 1.4, 'highpass', 5200, 5200, 0.7, 0.3, 0.002);                          // 심벌 크래시
    noise(tc, 0.6, 'bandpass', 8200, 7000, 0.9, 0.18, 0.002);
    rec.played = true; rec.at = t; rec.len = 1.4; elog.push(rec); return rec;
  }

  // QA: 재료 소리 한 번(스윽+탁)을 오프라인으로 렌더해 최대 진폭과 길이를 돌려준다(재생하지 않는다)
  function render(id) {
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 44100, N = Math.floor(sr * 0.6);
    if (!AC) return Promise.resolve(null);
    var off = new AC(1, N, sr), save = { c: ctx, m: master, n: noiseBuf };
    try {
      ctx = off; out = null; master = off.createGain(); master.connect(off.destination);
      noiseBuf = off.createBuffer(1, N, sr); var d = noiseBuf.getChannelData(0); for (var i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
      (SWISH[id] || SWISH.tamago)(0.005, 1); thock(0.005 + (C.CUT.BOARD - C.CUT.RESIST) / 1000, 1);
    } finally { ctx = save.c; master = save.m; noiseBuf = save.n; }
    return off.startRendering().then(function (buf) {
      var x = buf.getChannelData(0), peak = 0, len = 0, k;
      for (k = 0; k < x.length; k++) { var a = Math.abs(x[k]); if (a > peak) peak = a; if (a > 0.003) len = k / sr; }
      return { peak: peak, len: len };
    });
  }

  SL.sfx = { unlock: unlock, cut: cut, clink: clink, fanfare: fanfare, setMuted: setMuted, isMuted: function () { return muted; }, _elog: elog, _render: render, _log: log, _state: function () { return ctx ? ctx.state : 'none'; } };

  // 첫 사용자 동작에서 오디오 해제 (클릭·터치·키)
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (t) { window.addEventListener(t, unlock, { passive: true }); });
})();
