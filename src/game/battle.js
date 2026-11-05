/* 썰기의 달인 — 친구 도전장 (기록을 링크 해시에 직접 담는다. 서버 없음. 주차하기·사과 깎기와 같은 방식)
 * 링크: <공개 주소>#battle/v1.<base64url JSON>
 * JSON: { n: 닉네임(≤12), i: 재료 id, t: 조각 두께 배열(×10 정수) }  — 점수는 담지 않고 받는 쪽이 두께로 다시 계산한다(점수와 두께가 어긋날 수 없다).
 * 조각 수는 재료의 절단 횟수 + 1 이어야 한다(설정값과 다르면 무효 링크). 상대 기기에서 같은 두께로 썰린 모습을 다시 그린다. */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C = SL.C, PREFIX = 'v1.';

  function b64uEncode(obj) {
    var b = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(str) {
    var b = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  }
  function known(id) { for (var i = 0; i < C.INGREDIENTS.length; i++) if (C.INGREDIENTS[i].id === id) return true; return false; }

  // rec: { nickname, ing, th }
  function makeToken(rec) {
    return PREFIX + b64uEncode({ n: (rec.nickname || '').slice(0, 12), i: rec.ing, t: rec.th.map(function (v) { return Math.round(v * 10); }) });
  }

  function parseToken(token) {
    try {
      if (!token || token.indexOf(PREFIX) !== 0) return null;
      var d = b64uDecode(token.slice(PREFIX.length));
      if (!known(d.i) || !Array.isArray(d.t) || d.t.length !== C.cutsOf(d.i) + 1) return null;
      var sum = 0, th = d.t.map(function (v) { v = Number(v); sum += v; return v / 10; });
      if (th.some(function (v) { return !(v > 0) || v > C.LENGTH; }) || Math.abs(sum - C.LENGTH * 10) > 4 * d.t.length) return null;
      var r = SL.scoring.evaluate(th);
      return { nickname: String(d.n || '친구').replace(/[\u0000-\u001f<>]/g, '').slice(0, 12) || '친구', ing: d.i, th: th, total: r.score, result: r };
    } catch (e) { return null; }
  }

  // 공개 주소(C.SHARE.URL)가 있으면 그것, 없으면 지금 열린 주소. file:// 로 열었을 땐 그 링크가 이 PC에서만 열린다(isLocal)
  function baseUrl() { return (C.SHARE.URL || location.href).split('#')[0]; }
  function isLocal() { return !C.SHARE.URL && !/^https?:$/.test(location.protocol); }
  function buildUrl(token) { return baseUrl() + '#battle/' + token; }
  function parseHash() { var m = location.hash.match(/^#battle\/(.+)$/); return m ? m[1] : null; }

  SL.battle = { makeToken: makeToken, parseToken: parseToken, buildUrl: buildUrl, parseHash: parseHash, baseUrl: baseUrl, isLocal: isLocal };
})();
