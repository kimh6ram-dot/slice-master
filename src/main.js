/* 썰기의 달인 — 화면 흐름(INTRO → SELECT → PLAY → RESULT → 재도전 / 도전장 CHALLENGE → BATTLE)과 플레이 루프.
 * 규칙은 slicing.js, 채점은 scoring.js, 그림은 renderer.js, 효과음은 audio.js, 도전장은 battle.js·share.js. 여기서는 연결만 한다. */
(function () {
  'use strict';
  var SL = window.SL, C = SL.C, R = SL.renderer, AS = SL.assets;

  var $ = function (id) { return document.getElementById(id); };
  var app = { ing: C.INGREDIENTS[0].id, screen: 'intro' };
  var V3 = SL.view3d;
  var G = { use3d: false, st: null, phase: 'off', chopT: 0, settleT: 0, holdT: 0, holdDir: 0, last: 0, raf: 0, lay: null, knife: null, result: null, th: null, elapsed: 0 };
  var challenge = null;                              // 도전장 링크로 들어왔을 때 친구의 기록(SL.battle.parseToken)
  var SCREENS = ['intro', 'select', 'play', 'result', 'challenge', 'battle'];

  // 인트로 미리보기: 대체로 고른데 마지막 조각만 두껍다 (조각 수는 재료의 절단 횟수 + 1)
  function unevenFor(id) {
    var n = C.cutsOf(id) + 1, base = [0.94, 1.02, 1.08, 0.96, 0.9, 1.0, 1.04, 0.97, 0.92, 1.05, 0.99, 1.01], i, th = [], sum = 0, ideal = C.LENGTH / n;
    for (i = 0; i < n - 1; i++) { th.push(ideal * 0.9 * base[i % base.length]); sum += th[i]; }
    th.push(C.LENGTH - sum);
    return th;
  }

  // ---------- 화면 ----------
  function show(name) {
    app.screen = name;
    SCREENS.forEach(function (n) { $('screen-' + n).classList.toggle('active', n === name); });
    document.body.classList.toggle('is-play', name === 'play');
    if (name !== 'result' && name !== 'challenge') SL.ending.stop();   // 엔딩 장면은 결과·도전장 화면에서만 돌고, 다른 화면으로 가면 멈춘다(다시 오면 처음부터)
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    paint();
  }

  // 정지 장면: 3D 가 되면 Three.js 렌더를 복사해 보여주고, 안 되면(WebGL 없음·에셋 미로드) 2D 그림. 반환 = 3D 스냅샷 정보
  function still(cv, id, th, mark) {
    if (V3.supports(id)) return V3.snapshot(cv, th ? 'result' : 'whole', th, mark, id);
    R.strip(cv, id, th || null, mark);
    return null;
  }

  function paint() {
    var s = app.screen;
    if (s === 'intro') { if (!(SL.assets.img.main && R.picture($('intro-canvas'), SL.assets.img.main))) still($('intro-canvas'), 'naruto', unevenFor('naruto')); }   // 메인 이미지(assets/main.png), 없으면 코드로 그린 미리보기
    else if (s === 'select') drawSelect();
    else if (s === 'result' && G.th) drawResult();
    else if (s === 'challenge' && challenge) drawChallenge();
    else if (s === 'battle' && challenge) drawBattle();
    else if (s === 'play' && G.st) draw();
  }

  // 썸네일 길이 통일: 모든 재료를 같은 가로 길이로 그리고(굵기는 이미지 비율 그대로), 길이는 칸 폭 84% 와 가장 두꺼운 재료(비율 최대)가 칸 높이 92% 안에 들어오는 값 중 작은 쪽.
  // (맞춤 방식으로 넣으면 두꺼운 재료는 높이에 걸려 짧아지고 얇은 오이만 폭 끝까지 길어졌다)
  function thumbW(cv) {
    var maxAsp = 0;
    for (var k in AS.img.food) { var im = AS.img.food[k]; maxAsp = Math.max(maxAsp, im.height / im.width); }
    return Math.min(cv.clientWidth * 0.84, cv.clientHeight * 0.92 / (maxAsp || 0.3));
  }

  function drawSelect() {
    // 선택 화면은 3D 가 아니라 넣어 둔 재료 이미지(assets/*.png, 투명 여백을 잘라 실제 음식 영역만 남긴 것)를 그대로 쓴다 — 가로·세로 중앙에 같은 여백으로 놓인다
    var useImg = AS.ready;
    if (!(useImg && R.picture($('select-canvas'), AS.img.food[app.ing], 0.08))) still($('select-canvas'), app.ing, null);
    var cells = $('ing-grid').children;
    for (var i = 0; i < cells.length; i++) {
      var id = cells[i].getAttribute('data-id'), cv = cells[i].querySelector('canvas');
      cells[i].classList.toggle('is-selected', id === app.ing);
      if (!(useImg && R.picture(cv, AS.img.food[id], 0.04, thumbW(cv)))) { if (V3.supports(id)) V3.snapshot(cv, 'icon', null, null, id); else R.icon(cv, id); }
    }
  }

  function buildGrid() {
    var grid = $('ing-grid');
    C.INGREDIENTS.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ing-cell'; b.setAttribute('data-id', it.id);
      b.innerHTML = '<canvas></canvas><span class="ing-name"></span>';
      b.querySelector('.ing-name').textContent = it.name;
      b.addEventListener('click', function () { app.ing = it.id; drawSelect(); });
      grid.appendChild(b);
    });
  }

  // ---------- 플레이 ----------
  // 앞자리를 숫자와 같은 폭의 공백(figure space)으로 채워 9 → 10 으로 바뀌어도 글자 폭이 그대로(가운데 정렬이 흔들리지 않는다)
  function counterText(st) { return String(st.cuts.length).padStart(2, ' ') + ' / ' + st.n; }

  // 세로 화면 첫 진입에만 하단 도움말로 '가로로 돌리면…' 안내(한 번 보인 뒤에는 다시 안 나옴)
  function showRotateTip() {
    var tip = $('rotate-tip'), seen = false;
    try { seen = localStorage.getItem('cut_rot_tip') === '1'; } catch (e) { /* 무시 */ }
    var on = !seen && window.innerHeight > window.innerWidth;
    if (on) { try { localStorage.setItem('cut_rot_tip', '1'); } catch (e) { /* 무시 */ } }
    tip.hidden = !on;
  }

  // 인앱 브라우저(카카오톡·인스타·네이버 앱 등)에서 기기의 기본 브라우저로 열기.
  //  갤럭시 → 삼성 인터넷(intent, 없으면 원래 주소), 그 외 안드로이드 → 크롬(intent), 아이폰 → 사파리(카카오톡은 전용 스킴, 그 외는 x-safari 스킴을 시도하고 안 열리면 주소 복사 안내)
  function openExternal() {
    var url = location.href.split('#')[0], ua = navigator.userAgent || '', plain = url.replace(/^https?:\/\//, ''), scheme = location.protocol === 'http:' ? 'http' : 'https';
    var android = /Android/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var copyGuide = function () {
      var guide = function (msg) { SL.share.toast(msg); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { guide('주소를 복사했어요. 사파리에 붙여넣어 열어주세요'); }, function () { guide('주소창의 링크를 길게 눌러 복사해주세요'); });
      else guide('주소창의 링크를 길게 눌러 복사해주세요');
    };
    if (android) {
      var samsung = /SAMSUNG|SM-[A-Z0-9]|SamsungBrowser/i.test(ua), pkg = samsung ? 'com.sec.android.app.sbrowser' : 'com.android.chrome';
      location.href = 'intent://' + plain + '#Intent;scheme=' + scheme + ';package=' + pkg + ';S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
      return;
    }
    if (ios) {
      if (/KAKAOTALK/i.test(ua)) { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url); return; }
      var left = false, mark = function () { left = true; };
      document.addEventListener('visibilitychange', mark, { once: true }); window.addEventListener('pagehide', mark, { once: true });
      location.href = 'x-safari-' + url;
      setTimeout(function () { if (!left && !document.hidden) copyGuide(); }, 1500);
      return;
    }
    var w = null; try { w = window.open(url, '_blank'); } catch (e) { /* 무시 */ }
    if (!w) copyGuide();
  }

  function startPlay() {
    SL.ending.stop(); $('screen-result').classList.remove('reveal-pending');
    showRotateTip();
    G.st = SL.slicing.create(app.ing);               // 절단 횟수는 재료 설정(C.INGREDIENTS[].cuts)에서 한 번 읽는다
    G.use3d = V3.supports(app.ing) && V3.begin(app.ing);
    R.resetPlay();
    G.phase = 'play'; G.chopT = 0; G.settleT = 0; G.holdT = 0; G.holdDir = 0; G.elapsed = 0; G.result = null; G.th = null; G.knife = null; G.food = null; G.hudDue = false;
    drag = null; $('stage').style.cursor = '';
    $('hud-cuts').textContent = counterText(G.st);
    $('hud-goal').textContent = (G.st.n + 1) + '조각으로 썰기';       // 세로 화면 상단 목표(재료 설정의 절단 횟수 + 끝 조각 1)
    $('hint').textContent = window.matchMedia('(pointer: coarse)').matches ? '◀ ▶ 로 칼을 옮기고, 썰기 버튼으로 자르세요 · 재료는 끌어서 옮겨요' : '← → 로 칼을 옮기고, SPACE 로 자르세요 · 재료는 끌어서 옮겨요';
    show('play');
    relayout();                                      // 세로 화면: 조작 영역 높이를 반영해 덩어리를 다시 맞춘다
    SL.input.clear();
    SL.input.setEnabled(true);
    G.last = performance.now();
    if (!G.raf) G.raf = requestAnimationFrame(loop);
  }

  function ease(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

  function step(dt) {
    var st = G.st;
    if (G.chopT > 0) G.chopT = Math.max(0, G.chopT - dt * 1000);
    if (G.hudDue && G.chopT <= C.CHOP_MS - C.CUT.BOARD) { $('hud-cuts').textContent = counterText(st); G.hudDue = false; }
    if (G.phase === 'play') {
      G.elapsed += dt;
      var inp = SL.input.take();
      if (inp.nudge) SL.slicing.moveKnife(st, inp.nudge * C.NUDGE);
      if (inp.dir !== 0) {
        if (inp.dir !== G.holdDir) G.holdT = 0;
        G.holdDir = inp.dir; G.holdT += dt;
        var sp = C.SPEED_MIN + (C.SPEED_MAX - C.SPEED_MIN) * ease(G.holdT / C.RAMP_SEC);
        SL.slicing.moveKnife(st, inp.dir * sp * dt);
      } else { G.holdT = 0; G.holdDir = 0; }
      if (drag) inp.cut = 0;                      // 재료를 끄는 중에는 썰기 입력을 받지 않는다(드래그와 절단이 겹치지 않게). 소리도 없다
      for (var i = 0; i < inp.cut; i++) doCut();
    } else if (G.phase === 'settle') {
      G.settleT += dt * 1000;
      if (G.settleT >= C.SETTLE_MS) finish();
    }
  }

  function doCut() {
    var prev = G.st.cuts.length ? G.st.cuts[G.st.cuts.length - 1] : 0;
    var t = SL.slicing.cut(G.st);
    if (t == null) return false;                  // 직전 절단과 너무 가깝다(같은 위치) → 무시 (소리도 없다)
    SL.sfx.cut(app.ing);                          // 절단 성공 때만 '스윽 → 탁' 한 번 (탁은 칼이 도마에 닿는 시점 CHOP_MS/2 에 예약)
    if (G.use3d) V3.onCut(prev, G.st.cuts[G.st.cuts.length - 1], G.st.done);
    G.chopT = C.CHOP_MS;
    R.noteCut(performance.now());
    G.hudDue = true;                              // 카운터는 칼날이 도마에 닿아 절단이 끝나는 순간(C.CUT.BOARD)에 올린다 — step 에서 갱신
    if (G.st.done) {                              // 마지막 절단 → 남은 오른쪽 끝이 마지막 조각
      G.phase = 'settle'; G.settleT = 0;
      SL.input.setEnabled(false);
      G.th = SL.slicing.thicknesses(G.st);
    }
    return true;
  }

  // ---------- 재료 드래그 ----------
  // 마우스/터치로 아직 썰리지 않은 덩어리를 잡아 도마 안에서 옮긴다(가로 방향 유지). 잡은 지점은 커서 아래에 그대로 유지되고(절대 좌표 = 잡을 때 이동량 + 커서 변위),
  // 놓으면 그 자리에 놓인다. 잘린 조각은 view3d 가 자른 자리에 그대로 둔다. 칼은 화면에 그대로 있고 덩어리만 움직이므로 칼의 덩어리 좌표(st.knife)를 보정해
  // 칼 화면 위치를 유지한다 → 이후 접촉(절단 가능 범위) 판정은 새 위치 기준. 3D 장면에서만 동작한다.
  var drag = null;                                // { pid, p0, S0 }
  function stagePt(e) {
    var r = $('stage').getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * SL.FIT.LW, y: (e.clientY - r.top) / r.height * SL.FIT.LH };
  }
  function canGrab() { return !!(G.use3d && G.phase === 'play' && G.chopT <= 0 && G.st && !G.st.done && !drag); }
  function onBody(info, pt, pad) { return !!(info && info.hasBody && pt.x >= info.bodyL - pad && pt.x <= info.bodyR + pad && pt.y >= info.top - pad && pt.y <= info.bottom + pad); }
  function endDrag() {
    if (!drag) return;
    V3.release(performance.now()); drag = null;
    $('stage').style.cursor = '';
  }
  function bindDrag() {
    var cv = $('stage');
    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var pt = stagePt(e);
      if (!canGrab() || !onBody(G.food, pt, e.pointerType === 'touch' ? 28 : 6)) return;
      e.preventDefault();
      drag = { pid: e.pointerId, p0: pt, S0: V3.shift() };
      V3.grab(performance.now());
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
      cv.style.cursor = 'grabbing';
    });
    cv.addEventListener('pointermove', function (e) {
      var pt = stagePt(e);
      if (!drag) { if (e.pointerType === 'mouse') cv.style.cursor = canGrab() && onBody(G.food, pt, 6) ? 'grab' : ''; return; }
      if (e.pointerId !== drag.pid) return;
      var S = V3.limitShift({ x: drag.S0.x + pt.x - drag.p0.x, y: drag.S0.y + pt.y - drag.p0.y }, G.st), cur = V3.shift(), ppu = V3.ppu();
      if (ppu > 0) G.st.knife -= (S.x - cur.x) / ppu;              // 칼은 화면에 그대로 → 덩어리 좌표의 칼 위치만 보정
      V3.setShift(S);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      cv.addEventListener(t, function (e) { if (drag && e.pointerId === drag.pid) endDrag(); });
    });
    window.addEventListener('blur', endDrag);
  }

  function viewRange(cv) {
    return { top: 140, bottom: 990 };
  }

  // 칼 연출(C.CUT 타임라인): 입력 즉시 내려와 표면에 닿음 → 표면에서 잠깐 저항 → 끝까지 통과 → 도마에 닿음 → 복귀. drop 0..1 = 칼이 내려간 정도(1 = 도마), press 0..1 = 재료가 눌리는 정도
  function sm(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }
  function dropAt(t) {
    var U = C.CUT;
    if (t < U.PRESS) return U.SURFACE_DROP * sm(t / U.PRESS);
    if (t < U.RESIST) return U.SURFACE_DROP + (U.RESIST_DROP - U.SURFACE_DROP) * sm((t - U.PRESS) / (U.RESIST - U.PRESS));   // 저항: 거의 멈춘 듯 천천히
    if (t < U.BOARD) return U.RESIST_DROP + (1 - U.RESIST_DROP) * sm((t - U.RESIST) / (U.BOARD - U.RESIST));                   // 그 뒤 끝까지 빠르게 통과
    return 1 - sm((t - U.BOARD) / (C.CHOP_MS - U.BOARD));
  }
  function pressAt(t) {
    var U = C.CUT;
    if (t < U.PRESS) return t / U.PRESS;
    return t < U.RESIST ? 1 : t < U.BOARD ? Math.max(0, 1 - (t - U.RESIST) / (U.BOARD - U.RESIST)) : 0;
  }

  function draw() {
    var cv = $('stage');
    var ct = G.chopT > 0 ? C.CHOP_MS - G.chopT : -1, drop = ct >= 0 ? dropAt(ct) : 0, press = ct >= 0 ? pressAt(ct) : 0;
    var settle = G.phase === 'settle' ? ease(G.settleT / (C.SETTLE_MS * 0.6)) : 0;
    if (!AS.ready) {                              // 에셋 미로드(또는 누락) 시 기존 2D 도마 장면 — 임의 대체 이미지는 쓰지 않는다
      if (G.use3d) V3.renderPlay(cv, G.st, drop, settle, viewRange(cv));  // (에셋이 없으면 use3d 도 false 라 사실상 2D)
      else R.play(cv, app.ing, G.st, drop, viewRange(cv), settle);
      return;
    }
    // 주방 장면: 배경(도마 포함) → 재료(2D 조각 이미지 / 3D) → 칼 이미지. 칼 x 는 재료와 같은 변환으로 정해진다
    var lay = R.kitchen(cv, app.ing, G.use3d);
    if (!lay) return;
    var info = G.use3d ? V3.renderKitchen(lay, G.st, press) : R.kitchenFood(lay, G.st, performance.now());
    if (info && !G.st.done) G.knife = R.kitchenKnife(lay, info.knifeX, drop);
    else G.knife = null;
    G.lay = lay; G.food = info;
  }

  function loop(now) {
    G.raf = 0;
    if (app.screen !== 'play') return;
    var dt = Math.min(0.05, Math.max(0, (now - G.last) / 1000));
    G.last = now;
    step(dt);
    draw();
    if (app.screen === 'play') G.raf = requestAnimationFrame(loop);
  }

  // ---------- 결과 ----------
  function finish() {
    G.phase = 'off';
    var r = SL.scoring.evaluate(G.th);
    G.result = r;
    $('result-score').innerHTML = r.score + '<span class="unit">점</span>';
    $('result-grade').textContent = r.grade;
    $('result-detail').textContent = SL.scoring.detailLine(r);
    var ending = SL.ending.supported(app.ing);        // 엔딩 연출(덮개 열림)이 되면 재료가 공개될 때 점수·평가를 띄운다. 아니면 바로
    $('screen-result').classList.toggle('reveal-pending', ending);
    $('screen-result').classList.toggle('has-battle', !!challenge);      // 도전으로 들어온 판이면 [대결 결과 보기]가 주 버튼
    $('btn-battle-result').hidden = !challenge;
    $('challenge-note').hidden = true;               // 파일 실행 안내는 도전장 버튼을 눌렀을 때만
    show('result');
  }

  function drawResult() {
    var cv = $('result-canvas'), mi = G.result.maxPct >= 5 ? G.result.maxIdx : null;
    // 엔딩: 토끼 셰프 접시의 덮개가 열리며 방금 썬 조각(실제 두께)이 공개된다 — 재료 공개 시점에 점수·평가 표시. 같은 판에서 다시 그리면(창 크기 변경) 진행 상태를 유지한다
    if (SL.ending.show(cv, app.ing, G.th, function () { $('screen-result').classList.remove('reveal-pending'); })) return;
    $('screen-result').classList.remove('reveal-pending');
    var info = still(cv, app.ing, G.th, mi);
    if (info && info.mark) {                      // 가장 두꺼운 조각 아래 ▲ (CSS px, 컨텍스트는 dpr 스케일 상태)
      var c = cv.getContext('2d'), x = info.mark.x, y = info.mark.y;
      c.fillStyle = '#000000'; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x - 7, y + 4); c.lineTo(x + 7, y + 4); c.closePath(); c.fill();
    }
  }

  // ---------- 도전장 · 대결 ----------
  function drawChallenge() {
    // 결과 화면과 같은 엔딩: 토끼 셰프 접시의 덮개가 열리며 친구가 썬 재료가 공개되고, 그때 이름·점수가 나타난다
    if (!SL.ending.state() && SL.ending.supported(challenge.ing)) $('screen-challenge').classList.add('reveal-pending');   // 새로 시작할 때만(창 크기 변경으로 다시 그릴 땐 진행 상태 유지). 에셋 디코드가 늦어도 점수가 먼저 보이지 않는다
    if (SL.ending.show($('challenge-canvas'), challenge.ing, challenge.th, function () { $('screen-challenge').classList.remove('reveal-pending'); })) return;
    $('screen-challenge').classList.remove('reveal-pending');
    still($('challenge-canvas'), challenge.ing, challenge.th);
  }
  function showChallenge() {
    document.documentElement.classList.remove('boot-challenge');
    $('challenge-name').textContent = challenge.nickname + '의 ' + ingName(challenge.ing) + ' 썰기 기록';
    var sc = $('challenge-score'); sc.textContent = String(challenge.total);
    var un = document.createElement('span'); un.className = 'unit'; un.textContent = '점'; sc.appendChild(un);
    show('challenge');
  }
  function drawBattle() { still($('vs-a-canvas'), challenge.ing, challenge.th); still($('vs-b-canvas'), app.ing, G.th); }
  function showBattle() {
    if (!challenge || !G.result) return;
    $('vs-a-name').textContent = challenge.nickname + ' · ' + ingName(challenge.ing); $('vs-b-name').textContent = '나 · ' + ingName(app.ing);
    $('vs-a-score').textContent = String(challenge.total); $('vs-b-score').textContent = String(G.result.score);
    var diff = G.result.score - challenge.total;
    $('vs-winner').textContent = diff > 0 ? '이겼습니다. ' + diff + '점 차이.' : (diff < 0 ? '졌습니다. ' + (-diff) + '점 부족.' : '무승부. 한 번 더.');
    show('battle');
  }
  function ingName(id) { for (var i = 0; i < C.INGREDIENTS.length; i++) if (C.INGREDIENTS[i].id === id) return C.INGREDIENTS[i].name; return ''; }

  // ---------- 배선 ----------
  // 플레이 스테이지(1920×1080, 16:9)만 창에 균일 배율 k 하나로 맞춘다(늘이기·자르기 없음). 다른 화면은 일반 반응형이라 여기서 건드리지 않는다.
  // 프레임(#stage-frame)은 실제 px 크기 1920k × 1080k 이고, HUD·조작 버튼은 이 프레임의 가장자리를 기준으로 --fw 에 비례해 놓인다.
  function fitStage() {
    var vw = window.innerWidth, vh = window.innerHeight, portrait = vh > vw, k = Math.min(vw / SL.FIT.W, vh / SL.FIT.H);
    // 세로 화면: 도마가 화면 폭을 거의 채우도록 장면을 확대(양옆 배경을 잘라 낸다). 안내·카운터는 프레임 바로 위, 조작 버튼은 바로 아래에 놓이므로(CSS) 그 높이만큼 남긴다
    var above = 0, below = 0;
    if (portrait) {
      // 진행도(위)·조작 바+도움말+워터마크(아래)의 실제 높이를 재서(플레이 화면이 보일 때) 덩어리 전체를 화면 높이에 맞춘다. 짧으면 바깥 여백(8px 까지)부터 줄이고 버튼 크기는 그대로
      above = $('screen-play').classList.contains('active') ? $('stage-frame').querySelector('.top-center').offsetHeight + 10 : 40;
      below = $('screen-play').classList.contains('active') ? $('pad-area').offsetHeight + 12 : SL.FIT.PORTRAIT_UI - 40;
      k = Math.min(vw / SL.FIT.PORTRAIT_W, (vh - above - below - 16) / SL.FIT.H);
    }
    SL.FIT.k = k;
    // 창이 16:9 보다 넓으면 논리 가로 폭(LW), 세로로 길면 논리 세로 높이(LH)를 늘려 배경이 창 전체를 채운다(빈 띠 없음).
    // 재료·칼·도마는 가운데 16:9 기준 그대로이고, 글자·버튼 크기(--fw)도 높이 기준(16:9 폭)이다.
    var LW = portrait ? Math.round(vw / k) : (vw / vh > SL.FIT.W / SL.FIT.H ? Math.round(vw / k) : SL.FIT.W), LH = portrait ? SL.FIT.H : (vh / vw > SL.FIT.H / SL.FIT.W ? Math.round(vh / k) : SL.FIT.H); SL.FIT.LW = LW; SL.FIT.LH = LH;
    var fw = Math.round(LW * k), bw = Math.round(SL.FIT.W * k), fh = Math.round(LH * k), ch = Math.round(SL.FIT.H * k), fr = $('stage-frame');
    fr.style.width = fw + 'px'; fr.style.height = fh + 'px'; fr.style.setProperty('--fw', bw + 'px');
    $('stage').style.width = LW + 'px'; $('stage').style.height = LH + 'px';
    fr.classList.toggle('narrow', bw < 640);
    $('stage').style.transform = 'scale(' + k + ')';
    document.body.classList.toggle('portrait', portrait);
    if (portrait) {                                  // 덩어리(진행도+주방+조작 영역)를 세로 가운데에: 위 여백 = 아래 여백(최소 8px)
      var top = Math.max(8, (vh - (above + fh + below)) / 2 - 28) + above;   // 가운데보다 28px 위(위 여백이 모자라면 8px 까지)
      fr.style.top = Math.round(top) + 'px'; fr.style.transform = 'translateX(-50%)';
    } else { fr.style.top = ''; fr.style.transform = ''; }
  }

  function relayout() { fitStage(); paint(); }                   // 창 크기·줌이 바뀌어도 진행 중인 절단 상태(G.st)는 그대로 다시 그린다

  function init() {
    buildGrid();
    SL.input.bind();
    bindDrag();
    $('btn-ext').addEventListener('click', openExternal);
    var mb = $('btn-mute');
    function paintMute() { var on = SL.sfx.isMuted(); mb.textContent = on ? '🔇' : '🔊'; mb.setAttribute('aria-pressed', on ? 'true' : 'false'); mb.setAttribute('aria-label', on ? '소리 켜기' : '소리 끄기'); }
    mb.addEventListener('click', function () { SL.sfx.setMuted(!SL.sfx.isMuted()); paintMute(); mb.blur(); });
    paintMute();
    $('btn-start').addEventListener('click', function () { show('select'); });
    $('btn-play').addEventListener('click', startPlay);
    $('btn-again').addEventListener('click', startPlay);
    $('btn-change').addEventListener('click', function () { show('select'); });
    $('btn-challenge-start').addEventListener('click', function () { app.ing = challenge.ing; show('select'); });     // 친구와 같은 재료가 미리 선택된다(바꿀 수 있음)
    $('btn-battle-result').addEventListener('click', showBattle);
    $('btn-rematch').addEventListener('click', startPlay);
    $('btn-vs-detail').addEventListener('click', function () { show('result'); });
    SL.share.bind({ challenge: $('btn-challenge'), note: $('challenge-note'), toast: $('toast') }, function () {
      return G.result && G.th ? { ing: app.ing, name: ingName(app.ing), th: G.th, score: G.result.score } : null;
    });
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', function () { setTimeout(relayout, 120); });
    fitStage();
    var tok = SL.battle.parseHash(), rec = tok && SL.battle.parseToken(tok);     // 도전장 링크(#battle/…)면 도전장 화면, 아니면 인트로
    if (rec) { challenge = rec; showChallenge(); } else { document.documentElement.classList.remove('boot-challenge'); show('intro'); }
    AS.onReady(relayout);                          // 에셋 디코드가 끝나면 현재 화면을 실제 이미지로 다시 그린다

    // QA 훅 — 제품 동작에는 쓰이지 않는다
    window.SL_DEBUG = {
      state: function () { return { screen: app.screen, phase: G.phase, ing: app.ing, cuts: G.st ? G.st.cuts.slice() : [], n: G.st ? G.st.n : null, knife: G.st ? G.st.knife : null, th: G.th, result: G.result, chopT: G.chopT, elapsed: G.elapsed, food: G.food || null, lay: G.lay ? { W: G.lay.W, H: G.lay.H, s: G.lay.s, ox: G.lay.ox, oy: G.lay.oy, g: G.lay.g } : null, knife2: G.knife, assets: { ready: AS.ready, failed: AS.failed }, challenge: challenge ? { nickname: challenge.nickname, ing: challenge.ing, total: challenge.total } : null }; },
      setKnife: function (x) { if (G.st) G.st.knife = SL.slicing.clampKnife(G.st, x); },
      cut: doCut,
      dragging: function () { return !!drag; },
      dropAt: dropAt, pressAt: pressAt,
      pick: function (id) { app.ing = id; },
      use3d: function () { return G.use3d; },
      fit: function () { return { k: SL.FIT.k, W: SL.FIT.W, H: SL.FIT.H }; }
    };
  }

  init();
})();
