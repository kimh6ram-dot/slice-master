/* 엔딩(결과) 연출 — 토끼 셰프가 내민 은색 접시의 덮개가 열리면서 방금 썬 재료가 공개된다.
 *  레이어 3장을 하나의 기준 컨테이너(ending_open 이미지 좌표계 1179×1334)에 함께 놓고 같은 배율·원점으로 그린다 → 화면이 줄어도 덮개와 재료는 접시의 같은 자리에 맞는다.
 *    1) 바닥: ending_open(토끼 셰프 + 빈 접시)  2) 재료: 실제 썬 조각(3D 로 한 번 렌더해 둔 투명 레이어, 접시 위 낮은 수평 시점·접촉 그림자 포함)  3) 덮개: ending_cloche
 *  덮개는 처음부터 open 이미지 위에 합성돼 있으므로 캐릭터·접시는 한 번도 움직이지 않는다(닫힌 위치는 ending_close 참고 이미지에서 측정). 재료는 덮개 아래에 처음부터 고정돼 있고,
 *  덮개가 올라가면서 가리던 부분이 자연스럽게 드러난다.
 *  타임라인(C.ENDING): HOLD 닫힌 채 정지 → LIFT 살짝 들림(금속음 '챙') → RISE 부드럽게 위로, 후반에 서서히 페이드아웃 → 재료 공개: 점수·평가 표시 + 팡파르(한 판에 한 번). */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C = SL.C, E = C.ENDING, st = null;

  function easeOut(t) { t = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - t, 3); }
  function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

  function supported(id) {
    var A = SL.assets;
    return !!(A && A.img.endOpen && A.img.endCloche && A.meta && A.meta.ending && SL.view3d.supports(id));
  }

  // 컨테이너(open 이미지)를 캔버스에 비율 유지로 꽉 채우는 배율·원점(캔버스 px)
  function layout(cv) {
    var M = SL.assets.meta.ending, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    var S = Math.min(pw / M.open.w, ph / M.open.h);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    return { M: M, pw: pw, ph: ph, S: S, ox: (pw - M.open.w * S) / 2, oy: (ph - M.open.h * S) / 2 };
  }

  function buildFood() {
    var L = st.L, p = L.M.plate;
    var r = SL.view3d.renderRowLayer(L.pw, L.ph, st.id, st.th, { x: L.ox + p.cx * L.S, y: L.oy + p.cy * L.S, rowW: p.rowW * L.S, az: E.AZ, el: E.EL, gap: E.GAP });
    st.food = r ? r.canvas : null; st.info = r ? r.info : null;
  }

  // 시각 t(ms) 의 덮개 상태: lift(컨테이너 px, 위로 올라간 양), alpha
  function stateAt(t) {
    var up = t - E.HOLD, lift = 0, alpha = 1;
    if (up > 0) {
      lift = E.LIFT_PX * easeOut(up / E.LIFT);                                         // 살짝 들림
      if (up > E.LIFT) {
        var u = (up - E.LIFT) / E.RISE;
        lift += E.RISE_PX * smooth(u);                                                  // 부드럽게 위로
        alpha = u < E.FADE_FROM ? 1 : 1 - smooth((u - E.FADE_FROM) / (1 - E.FADE_FROM)); // 후반부 서서히 페이드아웃
      }
    }
    return { lift: lift, alpha: Math.max(0, Math.min(1, alpha)), done: up >= E.LIFT + E.RISE };
  }

  function drawFrame(t) {
    var cv = st.cv, c = cv.getContext('2d'), L = st.L, A = SL.assets, M = L.M, s = stateAt(t);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.imageSmoothingQuality = 'high';
    c.drawImage(A.img.endOpen, L.ox, L.oy, M.open.w * L.S, M.open.h * L.S);            // 1) 토끼 셰프 + 빈 접시(항상 같은 자리)
    if (st.food && !st.hideFood) { var fa = Math.min(1, Math.max(0, (t - E.HOLD) / (E.LIFT + 120))); if (fa > 0) { c.globalAlpha = fa; c.drawImage(st.food, 0, 0); c.globalAlpha = 1; } }   // 덮개가 들리기 시작하면 아래에서 드러난다(닫힌 동안엔 안 그림 → 덮개보다 넓은 줄도 삐져나오지 않음)                                           // 2) 접시 위에 고정된 재료
    if (s.alpha > 0.002) {                                                             // 3) 덮개(닫힌 위치에서 위로 lift 만큼)
      var cl = M.cloche, w = cl.width * L.S, h = w * cl.h / cl.w;
      c.globalAlpha = s.alpha;
      c.drawImage(A.img.endCloche, L.ox + (cl.cx - cl.width / 2) * L.S, L.oy + (cl.top - s.lift) * L.S, w, h);
      c.globalAlpha = 1;
    }
    return s;
  }

  function tick(now) {
    if (!st || st.stopped) return;
    st.raf = 0;
    var t = st.frozen != null ? st.frozen : now - st.t0, s = drawFrame(t);
    st.t = t; st.lift = s.lift; st.alpha = s.alpha;
    if (!st.clinked && t >= E.HOLD) { st.clinked = true; SL.sfx.clink(); }              // 덮개가 들리는 순간 '챙'
    if (s.done && !st.revealed) {                                                      // 재료가 온전히 드러난 순간
      st.revealed = true;
      if (!st.fanfared) { st.fanfared = true; SL.sfx.fanfare(); }                       // 한 판에 한 번
      if (st.onReveal) st.onReveal();
    }
    if (!st.revealed && st.frozen == null) st.raf = requestAnimationFrame(tick);
  }

  // 엔딩 시작(같은 판의 th 로 다시 부르면 — 창 크기 변경 등 — 진행 상태를 유지한 채 레이아웃만 다시 잡는다)
  function show(cv, id, th, onReveal) {
    if (!supported(id)) return false;
    var L = layout(cv); if (!L) return false;
    if (st && st.th === th && st.cv === cv) {
      st.L = L; st.onReveal = st.onReveal || onReveal; buildFood();
      if (st.revealed || st.frozen != null) { var t = st.frozen != null ? st.frozen : st.t; drawFrame(t); }
      else if (!st.raf) st.raf = requestAnimationFrame(tick);
      return true;
    }
    stop();
    st = { cv: cv, id: id, th: th, L: L, onReveal: onReveal, t0: performance.now(), t: 0, lift: 0, alpha: 1, raf: 0, revealed: false, clinked: false, fanfared: false, frozen: null, stopped: false };
    buildFood();
    drawFrame(0);                                                                      // 첫 프레임부터 닫힌 덮개
    st.raf = requestAnimationFrame(tick);
    return true;
  }
  function stop() { if (st) { st.stopped = true; if (st.raf) cancelAnimationFrame(st.raf); } st = null; }

  SL.ending = {
    supported: supported, show: show, stop: stop,
    state: function () { return st ? { t: st.t, lift: st.lift, alpha: st.alpha, revealed: st.revealed, clinked: st.clinked, fanfared: st.fanfared, food: !!st.food, info: st.info, L: { S: st.L.S, ox: st.L.ox, oy: st.L.oy, pw: st.L.pw, ph: st.L.ph } } : null; },
    _noFood: function (on) { if (st) st.hideFood = !!on; },
    _seek: function (ms) { if (!st) return; st.frozen = ms; if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; tick(performance.now()); }   // QA: 해당 시각의 프레임을 그리고 멈춘다
  };
})();
