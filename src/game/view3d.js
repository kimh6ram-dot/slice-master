/* 3D 재료 장면(Three.js r186, vendor/three.min.js) — 계란말이·연어·나루토·오이가 같은 절단 구조(mesh3d.slab)를 공유한다.
 *  - WebGL 은 화면에 붙이지 않은 오프스크린 캔버스 하나로 렌더하고, 매 프레임 보이는 2D 캔버스(#stage / 미리보기 / 결과)에 drawImage 로 복사한다.
 *    → 텍스처·컨텍스트는 한 벌, 화면이 안 보일 때(display:none)도 크기 문제 없음, preserveDrawingBuffer 불필요(같은 태스크에서 복사).
 *  - 몸통 1개 + 잘린 조각(최대 10) 만 메시. 그림자맵 없음(접지 그림자는 도마 위 얇은 판 1장/조각). 재료별 텍스처는 처음 쓸 때 만든다.
 *  - 고정 직교 카메라: 길이 축(x)이 화면에서 정확히 수평이 되도록 up 벡터를 잡는다(카메라가 약간 왼쪽에서 보므로 왼쪽 단면이 보인다). */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C = SL.C, C3 = C.ROLL3D, L = C.LENGTH, M3 = SL.mesh3d;

  var R = null, tried = false, glCanvas, scene, cam, playGroup, showGroup, boardMesh, knifeGroup, bodyHolder, bodyInner;
  var bodyS = { x: 0, y: 0 };                         // 덩어리가 원래 자리에서 옮겨진 양(스테이지 논리 px). 잘린 조각은 자를 때의 값을 자기 것으로 가진다(p.S)
  var jac = null, lastK = null;                       // 월드(x,z) ↔ 화면 px 변환(정사영이라 일정)과 마지막 주방 장면 정보
  var dragA = { held: false, t: -1e9, lift0: 0 };
  var mats = { ing: {} }, shadowTex, body = null, pieces = [], lastKey = '', lastSize = '', curId = 'tamago', curCuts = 9, maxA = 1;
  var tgt = new THREE.Vector3(L / 2, C3.HY / 2, 0);

  function easeOutBack(t) { t = Math.min(1, Math.max(0, t)); var c1 = 0.35, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function easeOut(t) { t = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - t, 3); }

  // 방위각 az(도): 정면에서 왼쪽으로. up.x = 0 이라 az 와 무관하게 길이 축(x)이 화면 수평이다. az 가 클수록 왼쪽 단면이 넓게 보이지만 절단 평면의 화면상 기울기도 커진다
  var curAz = -1;
  function setAz(azDeg) {
    if (azDeg === curAz) return;
    curAz = azDeg;
    var az = azDeg * Math.PI / 180, el = C3.CAM_EL_DEG * Math.PI / 180;
    var d = new THREE.Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));   // 목표 → 카메라
    var f = d.clone().negate();
    cam.position.copy(tgt).addScaledVector(d, 3000);
    cam.up.set(0, -f.z, f.y).normalize();                 // up ⟂ 시선, up.x = 0 → x 축이 화면 수평
    cam.lookAt(tgt);
    cam.updateMatrixWorld(true);
    lastKey = '';
  }

  function init() {
    if (tried) return !!R;
    tried = true;
    try {
      if (typeof THREE === 'undefined') return false;
      glCanvas = document.createElement('canvas');
      R = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      R.setClearColor(0x000000, 0);
      R.setPixelRatio(1);
      scene = new THREE.Scene();

      // 카메라 — 길이 축을 화면 수평으로 (방위각만 setAz 로 바꾼다)
      cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 100, 8000);
      setAz(C3.CAM_AZ_DEG);

      var L3 = C3.LIGHT;
      scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xEBD7A8, L3.HEMI));
      var key = new THREE.DirectionalLight(0xFFF6E0, L3.KEY); key.position.set(L3.KEY_POS[0], L3.KEY_POS[1], L3.KEY_POS[2]).multiplyScalar(1000).add(tgt); key.target.position.copy(tgt);
      var fill = new THREE.DirectionalLight(0xFFFFFF, L3.FILL); fill.position.set(L3.FILL_POS[0], L3.FILL_POS[1], L3.FILL_POS[2]).multiplyScalar(1000).add(tgt); fill.target.position.copy(tgt);
      scene.add(key, key.target, fill, fill.target);

      // 공용 재질(재료별 몸통·단면 재질은 matsFor 에서 처음 쓸 때 만든다)
      maxA = Math.min(4, R.capabilities.getMaxAnisotropy());
      var wt = tex(SL.tex3d.wood(), true); wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
      mats.wood = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.92, metalness: 0 });
      shadowTex = new THREE.CanvasTexture(SL.tex3d.shadow());
      mats.shadow = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 });
      mats.steel = new THREE.MeshStandardMaterial({ color: 0xD9DEE4, roughness: 0.42, metalness: 0.35 });
      mats.edge = new THREE.MeshStandardMaterial({ color: 0xF5F7F9, roughness: 0.3, metalness: 0.3 });
      mats.handle = new THREE.MeshStandardMaterial({ color: 0x1D1D1D, roughness: 0.7, metalness: 0 });

      // 도마: 윗면이 y=0 (에셋 배경이 없을 때의 대체 장면용)
      boardMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 30, 400), mats.wood);
      scene.add(boardMesh);
      setBoard(-150, 1070);

      // 칼 (날 평면 = 절단 평면 x) — 대체 장면용
      knifeGroup = new THREE.Group();
      var bladeZ = C3.HZ + 70;
      var blade = new THREE.Mesh(new THREE.BoxGeometry(2.8, 130, bladeZ), mats.steel); blade.position.set(0, 10 + 65, 0);
      var edge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 9, bladeZ), mats.edge); edge.position.set(0, 10 + 4.5, 0);
      var handle = new THREE.Mesh(new THREE.BoxGeometry(15, 24, 150), mats.handle); handle.position.set(0, 10 + 130 + 12, 0);
      knifeGroup.add(blade, edge, handle);
      scene.add(knifeGroup);

      playGroup = new THREE.Group(); scene.add(playGroup);
      // 아직 썰리지 않은 덩어리는 holder(이동·들림) → inner(눌림 스케일) 아래에 둔다. 잘린 조각은 playGroup 에 직접 놓여 제자리에 남는다
      bodyHolder = new THREE.Group(); bodyInner = new THREE.Group(); bodyHolder.add(bodyInner); playGroup.add(bodyHolder);
      showGroup = new THREE.Group(); scene.add(showGroup);
      return true;
    } catch (e) {
      R = null;
      if (window.console) console.warn('3D 초기화 실패 — 2D 로 대체', e);
      return false;
    }
  }

  function tex(cv, srgb) { var t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxA; return t; }
  function matsFor(id) {
    if (mats.ing[id]) return mats.ing[id];
    var t = SL.tex3d.forIngredient(id);
    var m = {
      body: new THREE.MeshStandardMaterial({ map: tex(t.body.color, true), normalMap: tex(t.body.normal, false), roughness: t.rough.body, metalness: 0, vertexColors: true }),
      cap: new THREE.MeshStandardMaterial({ map: tex(t.cap.color, true), normalMap: tex(t.cap.normal, false), roughness: t.rough.cap, metalness: 0, vertexColors: true })
    };
    mats.ing[id] = m;
    if (id === 'tamago') { mats.body = m.body; mats.cap = m.cap; }
    return m;
  }

  function setBoard(x0, x1) { boardMesh.scale.x = x1 - x0; boardMesh.position.set((x0 + x1) / 2, -15, 0); mats.wood.map.repeat.set((x1 - x0) / 520, 1); }

  function shadowPlane(a, b, sh) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mats.shadow);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(b - a + 46, sh.HZ * (sh.def.kind === 'rrect' ? 1 : 0.84) + 56, 1);
    m.position.set((a + b) / 2 + 12, 0.6, -10);
    m.renderOrder = 2;
    return m;
  }

  // 조각/몸통 하나: group(피벗 = 왼쪽 아래 모서리) → mesh(월드 좌표 그대로, 피벗만큼 보정) + 접지 그림자
  function makeObj(a, b, withShadow, id) {
    id = id || curId;
    var sh = M3.shape(id), mt = matsFor(id), geo = M3.slab(a, b, id);
    var mesh = new THREE.Mesh(geo, [mt.body, mt.cap]);
    mesh.position.x = -a;
    var g = new THREE.Group();
    g.position.set(a, 0, 0);
    g.add(mesh);
    var shd = null;
    if (withShadow !== false) { shd = shadowPlane(a, b, sh); shd.position.x -= a; g.add(shd); }
    return { group: g, mesh: mesh, geo: geo, shadow: shd, a: a, b: b, thickness: b - a, id: id };
  }
  function disposeObj(o) {
    if (!o) return;
    if (o.group.parent) o.group.parent.remove(o.group);
    o.geo.dispose();
    if (o.shadow) o.shadow.geometry.dispose();
  }

  // ── 플레이 ──
  function begin(id) {
    if (!init()) return false;
    curId = id || curId; curCuts = C.cutsOf(curId);
    clearPlay();
    body = makeObj(0, L, true, curId);
    bodyInner.add(body.group);
    lastKey = '';
    return true;
  }
  function clearPlay() {
    pieces.forEach(disposeObj); pieces = [];
    disposeObj(body); body = null;
    bodyS.x = 0; bodyS.y = 0; dragA.held = false; dragA.t = -1e9; dragA.lift0 = 0;
    if (bodyHolder) { bodyHolder.position.set(0, 0, 0); bodyInner.scale.set(1, 1, 1); }
  }

  function tiltFor(t, prevAng) {
    var maxAng = C3.TILT_MAX_DEG * Math.PI / 180, lift = Math.asin(Math.min(1, C3.LIFT_MAX / Math.max(t, 1e-6)));
    return Math.min(maxAng, lift, prevAng + C3.TILT_STEP_DEG * Math.PI / 180);
  }
  function addPiece(a, b, now) {
    var o = makeObj(a, b, true, curId);
    var prev = pieces.length ? pieces[pieces.length - 1].angF : C3.TILT_MAX_DEG * Math.PI / 180;
    o.angF = tiltFor(b - a, prev);
    o.tA = now + C3.SEPARATE_DELAY_MS;
    o.sh0 = 0; o.sh1 = 0; o.tS = o.tA; o.idx = pieces.length;
    o.S = { x: bodyS.x, y: bodyS.y };                  // 자르는 순간 덩어리가 있던 자리 — 이후 덩어리를 옮겨도 조각은 여기 남는다
    playGroup.add(o.group);
    pieces.push(o);
    return o;
  }

  // 절단 한 번: [prev, x] 가 몸통에서 떨어져 나가고(이미 잘린 조각들은 왼쪽으로 한 칸 더 벌어진다), 몸통은 [x, L] 로 다시 만든다. done → 남은 끝부분이 10번째 조각
  function onCut(prev, x, done) {
    if (!R) return;
    var now = performance.now();
    var sg = sgOf(curCuts || 9);                       // 절단 1회당 벌어짐 — 재료의 절단 횟수로 나눠 총 벌어짐을 일정하게
        var np = addPiece(prev, x, now); np.sh1 = sg; np.sh0 = 0;
    disposeObj(body); body = null;
    if (done) { addPiece(x, L, now); }
    else { body = makeObj(x, L, true, curId); bodyInner.add(body.group); }
  }

  function sgOf() { return C3.NUDGE; }   // 막 잘린 조각 하나가 옆으로 밀리는 양
  function shiftOf(p, now) { return p.sh0 + (p.sh1 - p.sh0) * easeOut((now - p.tS) / C3.TILT_MS); }
  // 화면 이동량 S(px) → 월드 (x,z) 이동량. 주방 카메라의 정사영 야코비안의 역
  function toWorld(S) {
    if (!jac) return { x: 0, z: 0 };
    return { x: (jac.d * S.x - jac.b * S.y) / jac.det, z: (-jac.c * S.x + jac.a * S.y) / jac.det };
  }
  function applyPiece(p, now) {
    p.group.rotation.z = p.angF * easeOutBack((now - p.tA) / C3.TILT_MS);
    var w = p.S && jac ? toWorld(p.S) : { x: 0, z: 0 };
    p.group.position.x = p.a - shiftOf(p, now) + w.x;
    p.group.position.z = w.z;
  }

  // ── 재료 드래그: 들림·눌림(눈에 보이는 애니메이션 전용) ──
  function dragFeel() { return C.DRAG.FEEL[curId] || C.DRAG.FEEL.tamago; }
  function liftAt(now) {
    var D = C.DRAG;
    if (dragA.held) return dragA.lift0 + (D.LIFT - dragA.lift0) * easeOut((now - dragA.t) / D.LIFT_MS);
    var r = (now - dragA.t) / D.DROP_MS;
    return r >= 1 ? 0 : dragA.lift0 * (1 - r * r);
  }
  function squashAt(now) {                       // 0 = 평상시, 양수 = 눌림, 음수 = 살짝 되튐
    if (dragA.held) return 0;
    var D = C.DRAG, F = dragFeel(), r = now - dragA.t - D.DROP_MS;
    if (r < 0 || dragA.lift0 < 0.5) return 0;
    var amp = F.A * Math.min(1, dragA.lift0 / D.LIFT);
    if (r < D.CONTACT_MS) { var q = r / D.CONTACT_MS; return amp * (q * q * (3 - 2 * q)); }
    var v = r - D.CONTACT_MS;
    return v > 900 ? 0 : amp * Math.exp(-v / F.tau) * Math.cos(F.w * v);
  }
  function grab(now) { dragA.lift0 = liftAt(now); dragA.held = true; dragA.t = now; }
  function release(now) { dragA.lift0 = liftAt(now); dragA.held = false; dragA.t = now; }

  // 덩어리를 S 만큼 옮길 때 도마 안쪽·잘린 조각과 겹치지 않는 범위로 제한한 값(화면 px). 마지막 renderKitchen 의 레이아웃 기준
  function limitShift(S, st) {
    if (!lastK) return { x: S.x, y: S.y };
    var K = C.KITCHEN.BOARD, s = lastK.s, ox = lastK.ox, oy = lastK.oy, ppu = lastK.ppu, zero = lastK.zero, n = st.n, k = st.cuts.length;
    var lastCut = k ? st.cuts[k - 1] : 0, bodyL = zero + lastCut * ppu, bodyR = zero + L * ppu;
    // 왼쪽: 잘린 조각이 앞으로 더 벌어질 몫((남은 절단 수/전체)·SHIFT_TOTAL)까지 도마 안에 남도록 + 마지막 조각(벌어진 뒤 위치)과 겹치지 않도록
    var minX = ox + K.L * s + sgOf() * ppu - bodyL, maxX = ox + K.R * s - bodyR;
    if (pieces.length) { var lp = pieces[pieces.length - 1]; minX = Math.max(minX, zero + (lp.b - lp.sh1) * ppu + lp.S.x + 1 - bodyL); }
    var minY = oy + K.T * s - lastK.top, maxY = oy + K.B * s - lastK.bottom;
    if (minX > maxX) minX = maxX; if (minY > maxY) minY = maxY;
    return { x: Math.min(maxX, Math.max(minX, S.x)), y: Math.min(maxY, Math.max(minY, S.y)) };
  }
  function setShift(S) { bodyS.x = S.x; bodyS.y = S.y; }

  // ── 카메라 맞춤 ──
  var corner = new THREE.Vector3();
  function fit(min, max, w, h, top, bottom, margin) {
    cam.updateMatrixWorld(true);
    var inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, i;
    for (i = 0; i < 8; i++) {
      corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(inv);
      if (corner.x < x0) x0 = corner.x; if (corner.x > x1) x1 = corner.x;
      if (corner.y < y0) y0 = corner.y; if (corner.y > y1) y1 = corner.y;
    }
    var bandH = bottom - top, s = Math.min((w - 2 * margin) / (x1 - x0), (bandH - 2 * margin) / (y1 - y0));
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, pc = (top + bottom) / 2;
    cam.left = cx - (w / 2) / s; cam.right = cx + (w / 2) / s;
    cam.top = cy + pc / s; cam.bottom = cy - (h - pc) / s;
    cam.updateProjectionMatrix();
    return s;
  }

  // 오프스크린 GL 캔버스 크기(px). 보이는 캔버스 크기와 무관하게 지정한다 — 주방 장면은 작업 띠만 그려 비용을 줄인다
  function glSize(pw, ph) {
    var key = pw + 'x' + ph;
    if (key !== lastSize) { R.setSize(pw, ph, false); lastSize = key; }
  }
  function sizeGL(cv) {
    var d = Math.min((window.devicePixelRatio || 1) * SL.FIT.of(cv), C3.DPR_MAX), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return null;
    var pw = Math.round(w * d), ph = Math.round(h * d);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    glSize(pw, ph);
    return { w: w, h: h, pw: pw, ph: ph, dpr: d };
  }
  function present(cv, s) {
    var c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(glCanvas, 0, 0, s.pw, s.ph);
    c.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);       // 호출자가 CSS px 좌표로 덧그릴 수 있게
  }

  // 대체 장면(에셋 배경 없음)의 카메라 범위
  function playBox(id) {
    var sh = M3.shape(id);
    return { min: new THREE.Vector3(-150, -30, -(sh.HZ / 2 + 60)), max: new THREE.Vector3(L + 70, sh.HY + 190, sh.HZ / 2 + 60) };
  }
  function renderPlay(cv, st, drop, settle, view) {
    if (!R) return false;
    setAz(C3.CAM_AZ_DEG);
    var s = sizeGL(cv); if (!s) return false;
    var key = curId + '|' + s.pw + 'x' + s.ph + '|' + view.top + '|' + view.bottom;
    if (key !== lastKey) { var bx = playBox(curId); fit(bx.min, bx.max, s.w, s.h, view.top, view.bottom, 12); lastKey = key; }
    var now = performance.now(), sh = M3.shape(curId);
    playGroup.visible = true; showGroup.visible = false; boardMesh.visible = true; setBoard(-150, 1070);
    pieces.forEach(function (p) { applyPiece(p, now); });
    knifeGroup.visible = !st.done;
    knifeGroup.position.set(st.knife, sh.HY - (sh.HY + 14) * (drop || 0), 0);
    R.render(scene, cam);
    present(cv, s);
    return true;
  }

  // 현재 카메라에서 단면 링(x=L/2)의 화면 세로 범위(시점 좌표, 위가 +) — 재료의 "보이는 외곽" 높이와 중심
  var vtmp = new THREE.Vector3(), vdir = new THREE.Vector3(), silCache = {}, invM = new THREE.Matrix4();
  function silOf(id) {
    var key = id + '|' + curAz;
    if (silCache[key]) return silCache[key];
    cam.updateMatrixWorld(true);
    invM.copy(cam.matrixWorld).invert();
    var sh = M3.shape(id), r = sh.ring0, lo = 1e9, hi = -1e9, i, c0;
    for (i = 0; i < r.n; i++) { vtmp.set(L / 2, r.q[i] + sh.HY / 2, r.p[i]).applyMatrix4(invM); if (vtmp.y < lo) lo = vtmp.y; if (vtmp.y > hi) hi = vtmp.y; }
    c0 = vtmp.set(L / 2, sh.HY / 2, 0).applyMatrix4(invM);
    return (silCache[key] = { top: hi, bottom: lo, mid: (hi + lo) / 2, cx: c0.x, kx: vdir.set(1, 0, 0).transformDirection(invM).x });
  }

  // ── 주방 배경 위 플레이 ──  도마·칼은 배경 이미지/2D 칼 이미지가 맡으므로 3D 에서는 숨기고, 재료(조각·접지 그림자)만 투명 배경으로 렌더해 이미 깔린 배경 위에 얹는다.
  //   직교 카메라의 x 방향 배율을 맞춰 "길이 1000 = 화면에서 재료 폭(lay.g.w)" 이 되게 하므로 칼(2D)의 x 와 3D 절단 평면 x 가 같은 변환을 쓴다.
  //   보이는 외곽의 세로 중앙이 lay.g.yc 에 오도록 놓는다(재료마다 두께가 달라도 도마 위 같은 높이). GL 은 작업 띠(세로 REG_H)만 그린다.
  var REG_HALF = 300;                                                    // 논리 px (재료 높이 ±120 + 조각 기울기·그림자 여유)
  function renderKitchen(lay, st, press) {
    if (!R) return null;
    setAz(C3.KITCHEN_AZ_DEG);
    var g = lay.g, sh = M3.shape(curId), sil = silOf(curId);
    if (lastK && Math.abs(lay.s / lastK.s - 1) > 1e-4) {                 // 프레임 크기에 따라 배경 확대율이 바뀌면 옮겨진 양(논리 px)도 같은 비율로 → 배경·재료·조각이 계속 같은 비율
      var rr = lay.s / lastK.s; bodyS.x *= rr; bodyS.y *= rr;
      pieces.forEach(function (q) { q.S.x *= rr; q.S.y *= rr; });
    }
    var y0 = Math.max(0, Math.round(g.yc - REG_HALF)), y1 = Math.min(lay.H, Math.round(g.yc + REG_HALF));
    var pw = Math.round(lay.W * lay.d), ph = Math.round((y1 - y0) * lay.d);
    glSize(pw, ph);
    var s3 = (g.w / L) / sil.kx;                                         // 시점 좌표 1 당 CSS px (월드 x 1 → 화면 가로 비율은 방위각 때문에 1 이 아니다)
    var cxC = g.x0 + g.w / 2, cyC = g.yc - y0;
    cam.left = sil.cx - cxC / s3; cam.right = cam.left + lay.W / s3;
    cam.top = sil.mid + cyC / s3; cam.bottom = cam.top - (y1 - y0) / s3;
    cam.updateProjectionMatrix();
    var now = performance.now();
    // 월드 (x,z) 한 단위가 화면에서 움직이는 양(정사영 → 위치와 무관하게 일정). 드래그 이동량(화면 px)을 월드로 바꾸는 데 쓴다
    invM.copy(cam.matrixWorld).invert();
    vdir.set(1, 0, 0).transformDirection(invM); var ax = vdir.x * s3, cx2 = -vdir.y * s3;       // (vdir 는 재사용 객체 — 값을 바로 꺼낸다)
    vdir.set(0, 0, 1).transformDirection(invM); var bz = vdir.x * s3, dz = -vdir.y * s3;
    jac = { a: ax, b: bz, c: cx2, d: dz, det: ax * dz - bz * cx2 };
    var bw = toWorld(bodyS), lift = liftAt(now), sq = squashAt(now) + (press || 0) * C.CUT.PRESS_SQUASH;   // 칼이 누를 때의 아주 작은 눌림도 화면 연출만
    bodyHolder.position.set(bw.x, lift, bw.z);                           // 덩어리 이동 + 들림
    bodyInner.scale.set(1, 1 - sq, 1 + sq * 0.5);                        // 눌림(길이 x 는 그대로 → 절단면 위치 불변. 판정과 무관한 화면 연출)
    playGroup.visible = true; showGroup.visible = false; boardMesh.visible = false; knifeGroup.visible = false;
    pieces.forEach(function (p) { applyPiece(p, now); });
    R.render(scene, cam);
    var c = lay.cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(glCanvas, 0, Math.round(y0 * lay.d), pw, ph); c.setTransform(lay.d, 0, 0, lay.d, 0, 0);
    lastKey = '';
    invM.copy(cam.matrixWorld).invert();
    var kvx = vtmp.set(st.knife, sh.HY / 2, 0).applyMatrix4(invM).x;    // 절단 평면의 중심(z=0, 높이 중앙) — 덩어리가 옮겨지지 않은 자리 (vtmp 는 재사용 객체 → 값을 바로 꺼낸다)
    var kzx = vtmp.set(0, sh.HY / 2, 0).applyMatrix4(invM).x;
    var ppu = sil.kx * s3, zero = cxC + (kzx - sil.cx) * s3, topH = g.yc - (sil.top - sil.mid) * s3, botH = g.yc + (sil.mid - sil.bottom) * s3;
    lastK = { s: lay.s, ox: lay.ox, oy: lay.oy, ppu: ppu, zero: zero, top: topH, bottom: botH };
    var lastCut = st.cuts.length ? st.cuts[st.cuts.length - 1] : 0;
    // knifeX = 칼 날의 화면 x(덩어리 옮김 포함). body* = 아직 썰리지 않은 덩어리의 화면 범위(드래그로 집을 수 있는 영역)
    return { knifeX: cxC + (kvx - sil.cx) * s3 + bodyS.x, pxPerUnit: ppu, az: curAz, top: topH + bodyS.y, bottom: botH + bodyS.y, y0: y0, y1: y1,
      bodyL: zero + lastCut * ppu + bodyS.x, bodyR: zero + L * ppu + bodyS.x, shift: { x: bodyS.x, y: bodyS.y }, lift: lift, squash: sq, hasBody: !!body };
  }

  // ── 정지 장면(선택 미리보기·아이콘·결과) ──
  function clearShow() {
    while (showGroup.children.length) {
      var c = showGroup.children[0]; showGroup.remove(c);
      if (c.userData.obj) disposeObj(c.userData.obj);
    }
  }
  function snapshot(cv, kind, th, markIdx, id) {
    if (!init()) return null;
    id = id || curId;
    setAz(C3.CAM_AZ_DEG);
    var s = sizeGL(cv); if (!s) return null;
    // 재료 4종의 가장 큰 단면(HY·HZ)을 기준으로 카메라·받침을 고정한다 → 재료·조각 수가 바뀌어도, 선택/결과 화면이 달라도 받침의 크기·앞 모서리·중심이 그대로이고
    // 재료는 받침 위(y=0)에서 가로 중심(L/2 + 벌어짐/2)에 놓인다. 재료마다 원래 굵기 차이는 단면 크기 그대로 보인다.
    var HY = 0, HZ = 0, k0;
    for (k0 = 0; k0 < C.INGREDIENTS.length; k0++) { var sh0 = M3.shape(C.INGREDIENTS[k0].id); HY = Math.max(HY, sh0.HY); HZ = Math.max(HZ, sh0.HZ); }
    if (kind === 'icon') { var shI = M3.shape(id); HY = Math.max(HY, shI.HY); }
    clearShow();
    var SP = C3.SPREAD_TOTAL, n = th ? th.length : 1, spread = kind === 'result' && n > 1 ? SP / (n - 1) : 0, off = kind === 'icon' ? 0 : (kind === 'result' ? 0 : SP / 2);
    var i, acc = 0, objs = [], withShadow = kind !== 'icon';
    for (i = 0; i < n; i++) {
      var a = acc, b = th ? acc + th[i] : L; acc = b;
      var o = makeObj(a, b, withShadow, id); o.group.position.x = a + i * spread + off;
      var holder = new THREE.Group(); holder.add(o.group); holder.userData.obj = o; showGroup.add(holder); objs.push(o);
    }
    var xMax = L + SP;
    playGroup.visible = false; knifeGroup.visible = false; showGroup.visible = true;
    boardMesh.visible = kind !== 'icon';
    if (kind !== 'icon') setBoard(-60, xMax + 60);
    var min = new THREE.Vector3(-4, 0, -HZ / 2 - 6), max = new THREE.Vector3(L + 4, HY, HZ / 2 + 6);
    if (kind !== 'icon') { min.set(-60, -14, -HZ / 2 - 60); max.set(xMax + 60, HY + 4, HZ / 2 + 60); }
    var scale = fit(min, max, s.w, s.h, 0, s.h, kind === 'icon' ? 1 : 6);
    R.render(scene, cam);
    present(cv, s);
    var mark = null;
    if (markIdx != null && th) {          // 가장 두꺼운 조각 아래 표시 위치(CSS px)
      var o2 = objs[markIdx], v = new THREE.Vector3((o2.a + o2.b) / 2 + markIdx * spread + off, -6, M3.shape(id).HZ / 2 + 30).project(cam);
      mark = { x: (v.x + 1) / 2 * s.w, y: (1 - v.y) / 2 * s.h };
    }
    clearShow();
    playGroup.visible = true;
    lastKey = '';
    return { mark: mark, scale: scale };
  }

  // ── 결과(엔딩): 접시 위에 가로 한 줄로 놓인 조각 ──
  // 메인 화면의 접시 위 계란말이처럼 낮은 수평 시점(고도 el, 왼쪽에서 az)으로, 썬 조각을 원래 통재료의 순서대로 작은 틈(gap)을 두고 나란히 놓는다.
  // 왼쪽 첫 조각의 단면이 살짝 보이고 각 조각의 옆면·두께가 읽힌다. 줄 전체(통재료 길이 + 틈 합)가 화면에서 rowW(px)가 되는 배율 하나만 쓰므로
  // 조각이 많아도 조각마다 크기를 바꾸지 않고 줄 전체가 같은 비율로 줄어든다. 두께는 플레이어가 만든 실제 두께 그대로.
  // w×h(px) 투명 캔버스에 (cfg.x, cfg.y) = 줄 바닥 중심이 오도록 그려 돌려준다(접시 위 접촉 그림자 포함).
  var lastRow = null;
  function renderRowLayer(w, h, id, th, cfg) {
    if (!init()) return null;
    glSize(w, h);
    var n = th.length, az = cfg.az * Math.PI / 180, el = cfg.el * Math.PI / 180, sh = M3.shape(id), i, total = L + (n - 1) * cfg.gap;
    var sc = cfg.rowW / (total * Math.cos(az) + sh.HZ * Math.sin(az));                          // 재료 1 단위 → 화면 px
    var d = new THREE.Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)), f = d.clone().negate();
    cam.position.copy(d).multiplyScalar(3000); cam.up.set(0, -f.z, f.y).normalize(); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    cam.left = -cfg.x / sc; cam.right = (w - cfg.x) / sc; cam.top = cfg.y / sc; cam.bottom = -(h - cfg.y) / sc; cam.updateProjectionMatrix();
    curAz = -1; lastKey = '';
    clearShow();
    var acc = 0, x0 = -total / 2;
    var shd = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mats.shadow);                        // 줄 전체 아래 옅은 접촉 그림자
    shd.rotation.x = -Math.PI / 2; shd.scale.set(total + 70, sh.HZ * 1.15 + 40, 1); shd.position.set(10, 0.6, 14); shd.renderOrder = 2;
    var sg = new THREE.Group(); sg.add(shd); showGroup.add(sg); sg.userData.obj = { group: sg, geo: shd.geometry, shadow: null };
    for (i = 0; i < n; i++) {
      var a = acc, b = acc + th[i]; acc = b;
      var o = makeObj(a, b, false, id);
      o.group.position.x = a + i * cfg.gap + x0;
      var holder = new THREE.Group(); holder.add(o.group); holder.userData.obj = o; showGroup.add(holder);
    }
    playGroup.visible = false; knifeGroup.visible = false; boardMesh.visible = false; showGroup.visible = true;
    R.render(scene, cam);
    var out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(glCanvas, 0, 0, w, h);
    // 줄이 화면에서 차지하는 영역(QA·배치 확인용): 줄 전체 직육면체의 8 꼭짓점을 투영
    var rx0 = 1e9, rx1 = -1e9, ry0 = 1e9, ry1 = -1e9, k;
    for (k = 0; k < 8; k++) {
      var v = new THREE.Vector3(k & 1 ? total / 2 : -total / 2, k & 2 ? sh.HY : 0, k & 4 ? sh.HZ / 2 : -sh.HZ / 2).project(cam), px = (v.x + 1) / 2 * w, py = (1 - v.y) / 2 * h;
      rx0 = Math.min(rx0, px); rx1 = Math.max(rx1, px); ry0 = Math.min(ry0, py); ry1 = Math.max(ry1, py);
    }
    clearShow(); playGroup.visible = true;
    lastRow = { id: id, n: n, sigma: sc, gap: cfg.gap, row: { x0: rx0, x1: rx1, y0: ry0, y1: ry1 } };
    return { canvas: out, info: lastRow };
  }

  SL.view3d = {
    renderRowLayer: renderRowLayer, lastRow: function () { return lastRow; },
    // 에셋 로드(또는 실패 확정) 뒤에만 3D 를 쓴다 — 재료 텍스처가 에셋 이미지를 쓰기 때문
    supports: function (id) { return !!C.SHAPES[id] && !!(SL.assets && SL.assets.loaded) && init(); },
    grab: grab, release: release, limitShift: limitShift, setShift: setShift, shift: function () { return { x: bodyS.x, y: bodyS.y }; }, ppu: function () { return lastK ? lastK.ppu : 0; },
    init: init, begin: begin, onCut: onCut, renderPlay: renderPlay, renderKitchen: renderKitchen, snapshot: snapshot, clear: function () { if (R) clearPlay(); },
    setIngredient: function (id) { curId = id; },
    _dbg: {
      cam: function () { return cam; }, pieces: function () { return pieces; }, body: function () { return body; }, scene: function () { return scene; },
      project: function (x, y, z) { var v = new THREE.Vector3(x, y, z).project(cam); return [v.x, v.y]; },
      mats: function () { return mats; }, renderer: function () { return R; }, shiftOf: shiftOf, sil: silOf, glCanvas: function () { return glCanvas; }
    }
  };
})();
