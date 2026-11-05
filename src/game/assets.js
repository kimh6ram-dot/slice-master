/* 이미지 에셋 로더 — src/game/assets_data.js(tools/build_assets.js 가 만든 data URI)를 Image 로 디코드한다.
 * ready = 배경·칼·재료 4종이 모두 로드됨. 하나라도 실패하면 failed 에 이름이 남고 ready 는 false → 게임은 기존 그림(2D 캔버스)으로 동작하고
 * 임의 대체 이미지를 쓰지 않는다. onReady(cb) 는 로드 완료(또는 실패 확정) 때 한 번 호출. */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var D = SL.ASSETS;
  var A = SL.assets = { ready: false, failed: [], img: { bg: null, knife: null, main: null, endOpen: null, endCloche: null, food: {} }, meta: D || null };
  var cbs = [];

  function done() { var l = cbs.slice(); cbs.length = 0; l.forEach(function (f) { f(); }); }

  function load(name, rec, set) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { set(im); res(); };
      im.onerror = function () { A.failed.push(name); res(); };
      im.src = rec.src;
    });
  }

  if (!D || typeof Promise === 'undefined') { A.failed.push('assets_data'); }
  else {
    var jobs = [load('kitchen_bg', D.bg, function (im) { A.img.bg = im; }), load('knife_top', D.knife, function (im) { A.img.knife = im; })];
    // 엔딩(토끼 셰프·접시 / 덮개)도 선택 에셋: 없으면 기존 결과 화면(두 손)으로 대체
    if (D.ending) { [['endOpen', D.ending.open], ['endCloche', D.ending.cloche]].forEach(function (e) { jobs.push(new Promise(function (res) { var im = new Image(); im.onload = function () { A.img[e[0]] = im; res(); }; im.onerror = function () { res(); }; im.src = e[1].src; })); }); }
    if (D.main) jobs.push(new Promise(function (res) { var im = new Image(); im.onload = function () { A.img.main = im; res(); }; im.onerror = function () { res(); }; im.src = D.main.src; }));   // 메인 화면 이미지(선택 에셋)
    Object.keys(D.food).forEach(function (id) { jobs.push(load(id, D.food[id], function (im) { A.img.food[id] = im; })); });
    Promise.all(jobs).then(function () { A.ready = A.failed.length === 0; A.loaded = true; done(); });
  }

  A.onReady = function (cb) { if (A.loaded || !D) cb(); else cbs.push(cb); };
})();
