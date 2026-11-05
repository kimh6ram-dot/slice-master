/* 채점 — 조각 두께만으로 계산(랜덤 없음). 기준식은 재료와 무관하게 같고, 목표 두께는 조각 수(= 재료의 절단 횟수 + 1)에서 나온다.
 *  e = sqrt(mean((t − ideal)²)) / ideal,  ideal = LENGTH / 조각 수
 *  score = round(100 × (1 − min(1, e / ZERO_AT)))  → 완벽히 일정하면 100점 */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C = SL.C;

  function evaluate(th) {
    var n = th.length, ideal = C.LENGTH / th.length, sum = 0, i, mx = -1, mn = 1e9, imx = 0, imn = 0;
    for (i = 0; i < n; i++) {
      var d = th[i] - ideal;
      sum += d * d;
      if (th[i] > mx) { mx = th[i]; imx = i; }
      if (th[i] < mn) { mn = th[i]; imn = i; }
    }
    var e = Math.sqrt(sum / n) / ideal;
    var score = Math.round(100 * (1 - Math.min(1, e / C.ZERO_AT)));
    var grade = C.GRADES[C.GRADES.length - 1];
    for (i = 0; i < C.GRADES.length; i++) { if (score >= C.GRADES[i].min) { grade = C.GRADES[i]; break; } }
    var last = th[n - 1] / ideal;
    return {
      score: score, grade: grade.title, e: e,
      ideal: ideal,
      maxPct: Math.round((mx / ideal - 1) * 100), minPct: Math.round((mn / ideal - 1) * 100),
      maxIdx: imx, minIdx: imn,
      lastPct: Math.round(last * 100),
      lastThick: last >= C.LAST_THICK
    };
  }

  // 결과 화면 한 줄 문구
  function detailLine(r) {
    if (r.lastThick) return '마지막 조각이 많이 두껍습니다 (' + sgn(r.lastPct - 100) + ')';
    return '두꺼운 조각 ' + sgn(r.maxPct) + ' · 얇은 조각 ' + sgn(r.minPct);
  }
  function sgn(p) { return (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p) + '%'; }

  SL.scoring = { evaluate: evaluate, detailLine: detailLine };
})();
