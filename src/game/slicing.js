/* 썰기 규칙(순수 로직, DOM 없음). 위치·두께는 논리 단위(0~LENGTH).
 *  - 절단은 왼쪽 → 오른쪽. 재료별 정해진 횟수(n)만큼, 마지막(n+1번째) 조각은 남은 오른쪽 끝.
 *  - 칼은 [직전 절단, LENGTH−MIN_T×(남은 절단 수 −1)] 안에서만 움직인다 → 이미 자른 곳으로 못 돌아간다.
 *  - 절단은 칼이 직전 절단에서 MIN_T 이상 떨어졌을 때만 → 같은 위치 재절단·두께 0 조각 불가.
 *    (오른쪽 상한 덕분에 어떤 위치에서든 남은 절단을 모두 끝낼 수 있다.) */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C = SL.C;

  // id = 재료. 절단 횟수 n 은 재료별 설정(C.INGREDIENTS[].cuts)에서 한 번만 읽어 상태에 담는다 → 이후 모든 판정이 s.n 을 쓴다
  function create(id) { return { id: id, n: C.cutsOf(id), cuts: [], knife: 0, done: false }; }

  function prevCut(s) { return s.cuts.length ? s.cuts[s.cuts.length - 1] : 0; }

  // 이동 범위 lo~hi, 그 안에서 절단 가능한 최소 위치 cutLo. 절단이 끝났으면 null
  function bounds(s) {
    var k = s.cuts.length;
    if (k >= s.n) return null;
    var prev = prevCut(s);
    return { lo: prev, cutLo: prev + C.MIN_T, hi: C.LENGTH - C.MIN_T * (s.n - 1 - k) - C.MIN_T };
  }

  // 칼 이동 범위 = 아직 썰리지 않은 덩어리 [lo, hi]. 재료를 끌어 옮기면 칼이 덩어리 밖(허공·잘린 조각 위)에 놓일 수 있는데,
  // 그때는 바깥쪽으로 더 못 가고 안쪽으로만 움직일 수 있다(갑자기 덩어리 위로 튀지 않는다). 절단은 canCut 이 덩어리 안일 때만 허용한다.
  function clampKnife(s, x) {
    var b = bounds(s);
    if (!b) return s.knife;
    return Math.min(Math.max(b.hi, s.knife), Math.max(Math.min(b.lo, s.knife), x));
  }

  function moveKnife(s, dx) {
    if (s.done) return s.knife;
    s.knife = clampKnife(s, s.knife + dx);
    return s.knife;
  }

  function canCut(s) {
    var b = bounds(s);
    return !!b && s.knife >= b.cutLo - 1e-9 && s.knife <= b.hi + 1e-9;
  }

  // 현재 칼 위치에서 절단. 성공하면 방금 만든 조각 두께, 불가하면 null
  function cut(s) {
    if (s.done || !canCut(s)) return null;
    var prev = prevCut(s), x = s.knife;
    s.cuts.push(x);
    if (s.cuts.length >= s.n) s.done = true;
    return x - prev;
  }

  // 조각 구간 [{a,b}] — 끝나기 전에는 확정된 조각만, 끝나면 마지막 조각 포함 n+1개
  function pieces(s) {
    var out = [], prev = 0, i;
    for (i = 0; i < s.cuts.length; i++) { out.push({ a: prev, b: s.cuts[i] }); prev = s.cuts[i]; }
    if (s.done) out.push({ a: prev, b: C.LENGTH });
    return out;
  }

  function thicknesses(s) {
    return pieces(s).map(function (p) { return p.b - p.a; });
  }

  SL.slicing = { create: create, bounds: bounds, clampKnife: clampKnife, moveKnife: moveKnife, canCut: canCut, cut: cut, pieces: pieces, thicknesses: thicknesses };
})();
