/* 입력 — 키보드(← → SPACE)와 화면 버튼(◀ ▶ 썰기)을 같은 상태로 합친다.
 *  - 이동: 소스(key-left, pad-right …)별로 눌림을 기록하고 실효 방향 = 오른쪽 − 왼쪽. 방향이 새로 생기거나 바뀌면 nudge 1회(탭 = 미세 이동).
 *  - 모바일 버튼은 포인터마다 따로 추적(왼손 이동 + 오른손 썰기 동시 가능). 손가락을 떼거나 버튼 밖으로 나가면 즉시 해제. */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};

  var held = {};          // source → true
  var nudge = 0;          // 누적된 즉시 이동 방향(−1/0/+1 의 합 대신 부호 있는 횟수)
  var cutReq = 0;
  var lastDir = 0;
  var enabled = false;

  function dir() { return (held.pr || held.kr ? 1 : 0) - (held.pl || held.kl ? 1 : 0); }

  function refresh() {
    var d = dir();
    if (d !== 0 && d !== lastDir) nudge += d;
    lastDir = d;
  }
  function setHeld(src, on) {
    if (on && !enabled) return;
    if (!!held[src] === on) return;
    if (on) held[src] = true; else delete held[src];
    refresh();
  }
  function requestCut() { if (enabled) cutReq++; }

  function setEnabled(on) {
    enabled = on;
    if (!on) { clear(); cutReq = 0; nudge = 0; }
  }
  function clear() {
    held = {}; lastDir = 0;
    var els = document.querySelectorAll('.pad-btn.is-down');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('is-down');
  }

  // 루프에서 소비
  function take() {
    var r = { dir: dir(), nudge: nudge, cut: cutReq };
    nudge = 0; cutReq = 0;
    return r;
  }

  function bind() {
    window.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === ' ' || k === 'Spacebar') {
        if (enabled) e.preventDefault();             // 스크롤·포커스된 버튼 클릭 방지
        if (!enabled || e.repeat) return;
        if (k === 'ArrowLeft') setHeld('kl', true);
        else if (k === 'ArrowRight') setHeld('kr', true);
        else requestCut();
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft') setHeld('kl', false);
      else if (k === 'ArrowRight') setHeld('kr', false);
      else if ((k === ' ' || k === 'Spacebar') && enabled) e.preventDefault();
    });
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', function () { if (document.hidden) clear(); });

    // 화면 버튼 — 포인터별 추적
    var active = {};     // pointerId → {btn, src}
    function inside(btn, e) {
      var r = btn.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }
    function release(id) {
      var a = active[id]; if (!a) return;
      delete active[id];
      a.btn.classList.remove('is-down');
      if (a.src) setHeld(a.src, false);
    }
    var btns = document.querySelectorAll('.pad-btn');
    Array.prototype.forEach.call(btns, function (btn) {
      var role = btn.getAttribute('data-act');       // left | right | cut
      var src = role === 'left' ? 'pl' : role === 'right' ? 'pr' : null;
      btn.addEventListener('pointerdown', function (e) {
        if (!enabled) return;
        e.preventDefault();
        try { btn.releasePointerCapture(e.pointerId); } catch (_) {}   // 터치의 암묵적 캡처를 풀어 밖으로 나간 걸 감지
        active[e.pointerId] = { btn: btn, src: src };
        btn.classList.add('is-down');
        if (src) setHeld(src, true); else requestCut();
      });
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    window.addEventListener('pointermove', function (e) {
      var a = active[e.pointerId];
      if (a && !inside(a.btn, e)) release(e.pointerId);
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(function (t) {
      window.addEventListener(t, function (e) { release(e.pointerId); });
    });
    window.addEventListener('blur', function () { Object.keys(active).forEach(release); });

    // 스크롤·확대 방지 (패드·스테이지 위 터치, 더블탭 확대, iOS 핀치)
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
      document.addEventListener(t, function (e) { e.preventDefault(); });
    });
    var lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouchEnd < 350 && e.target.closest && e.target.closest('#screen-play')) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
    document.addEventListener('touchmove', function (e) {
      if (e.target.closest && e.target.closest('#screen-play')) e.preventDefault();
    }, { passive: false });
  }

  SL.input = { bind: bind, take: take, setEnabled: setEnabled, clear: clear, _held: function () { return held; } };
})();
