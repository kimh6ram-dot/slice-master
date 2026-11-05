/* 재료 조각 메시 — 길이 축(x)에 수직인 평면으로만 자르는 방식. 계란말이·연어·나루토·오이가 이 구조를 공유하고 단면 링(외곽)만 다르다.
 *  전체 재료를 "단면 링이 x 에 따라 달라지는 곡면"으로 정의하고, 구간 [a,b] 의 조각 = 그 곡면의 일부 + 양쪽 절단면 뚜껑.
 *   - 원래 양 끝(x<REL, x>L−RER)만 링이 안쪽으로 오므라들어 둥글다. 그 외 구간은 같은 링이라 절단면은 평평하고, 외곽 형태(둥근 모서리·물결 골·원)는 길이 방향으로 그대로 이어진다.
 *   - 뚜껑은 항상 닫혀 있다(속 빈 모델 아님). 끝에서 자른 조각의 뚜껑은 그 위치의 (오므라든) 링으로 닫힌다 — 실제로 끝에서 자르면 그렇게 보인다.
 *   - UV: 옆면 u = x/L (월드 x 기준 → 어느 조각이든 같은 무늬가 같은 자리에), v = 둘레 비율(링 인덱스 기준이라 오므라들어도 안 늘어남).
 *     뚜껑 uv = 단면 좌표(고정 크기) — 어느 위치에서 잘라도 같은 단면 무늬. 뚜껑 uv 는 링과 같은 좌표로 계산하므로 단면 무늬가 몸통 윤곽 밖으로 나가지 않는다.
 *  groups: 0 = 옆면(몸통 재질), 1 = 뚜껑(절단면 재질). 정점 색 = 바닥 쪽 가짜 AO.
 *  링 순서: 바닥 중앙에서 시작해 앞(+z) → 위 → 뒤 → 바닥으로 한 바퀴(p = z, q = y 중심 기준). */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var C = SL.C, C3 = C.ROLL3D, L = C.LENGTH;

  // ── 링 생성기(재료 형태별) ──
  function ringRRect(def, inset) {
    var hy = def.HY / 2 - inset, hz = def.HZ / 2 - inset, r = Math.max(0.5, def.RC - inset), n = C3.RING_CORNER;
    var P = [], Q = [], NP = [], NQ = [];
    function add(p, q, np, nq) { P.push(p); Q.push(q); NP.push(np); NQ.push(nq); }
    add(0, -hy, 0, -1);
    var corners = [[hz - r, -hy + r, -90], [hz - r, hy - r, 0], [-(hz - r), hy - r, 90], [-(hz - r), -hy + r, 180]];
    for (var c = 0; c < 4; c++) {
      for (var k = 0; k <= n; k++) {
        var a = (corners[c][2] + 90 * k / n) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        add(corners[c][0] + r * ca, corners[c][1] + r * sa, ca, sa);
      }
    }
    add(0, -hy, 0, -1);
    return { p: P, q: Q, np: NP, nq: NQ, n: P.length };
  }

  // 극좌표 반지름 함수 rad(a) 로 닫힌 링을 만든다(법선은 이웃 점에서 계산)
  function ringPolar(count, rad) {
    var P = [], Q = [], NP = [], NQ = [], i;
    for (i = 0; i < count; i++) {
      var a = (-90 + 360 * i / (count - 1)) * Math.PI / 180, r = rad(a);
      P.push(r * Math.cos(a)); Q.push(r * Math.sin(a));
    }
    P[count - 1] = P[0]; Q[count - 1] = Q[0];
    for (i = 0; i < count; i++) {
      var ip = i === 0 ? count - 2 : i - 1, inx = i === count - 1 ? 1 : i + 1;
      var tx = P[inx] - P[ip], ty = Q[inx] - Q[ip], tl = Math.hypot(tx, ty) || 1;
      NP.push(ty / tl); NQ.push(-tx / tl);              // 진행 방향(반시계)의 오른쪽 = 바깥
    }
    return { p: P, q: Q, np: NP, nq: NQ, n: count };
  }

  function makeRing(def, inset) {
    if (def.kind === 'rrect') return ringRRect(def, inset);
    if (def.kind === 'circle') return ringPolar(65, function () { return Math.max(0.5, def.R - inset); });
    var r0 = Math.max(0.5, def.R0 - inset), am = def.A * r0 / def.R0, N = def.N;
    return ringPolar(N * 8 + 1, function (a) { return r0 + am * Math.cos(N * a); });   // 물결 골: 반지름이 각도에 따라 오르내린다 → 길이 방향 골이 되어 모든 조각에 그대로 이어진다
  }

  var shapes = {};
  function shape(id) {
    id = id || 'tamago';
    if (shapes[id]) return shapes[id];
    var def = C.SHAPES[id], HY, HZ;
    if (def.kind === 'rrect') { HY = def.HY; HZ = def.HZ; }
    else if (def.kind === 'circle') { HY = HZ = def.R * 2; }
    else { HY = HZ = (def.R0 + def.A) * 2; }
    var sh = { id: id, def: def, HY: HY, HZ: HZ, REL: def.REL, RER: def.RER, cache: {}, steps: id === 'cucumber' ? 10 : C3.END_STEPS };
    sh.ring0 = makeRing(def, 0);
    var s = [0], tot = 0, i, R0 = sh.ring0;
    for (i = 1; i < R0.n; i++) { tot += Math.hypot(R0.p[i] - R0.p[i - 1], R0.q[i] - R0.q[i - 1]); s.push(tot); }
    sh.sp = s.map(function (v) { return v / tot; });     // 둘레 비율(인셋 0 기준 호 길이) — 모든 링이 공유
    shapes[id] = sh;
    return sh;
  }
  function ringFor(sh, inset) {
    var key = Math.round(inset * 1000);
    return sh.cache[key] || (sh.cache[key] = makeRing(sh.def, inset));
  }

  // x 위치의 링 정보: inset(오므라든 정도), nx(축 방향 법선 성분), rs(링 법선 성분)
  function station(x, id) {
    var sh = shape(id), REL = sh.REL, RER = sh.RER;
    if (x < REL) { var p = Math.acos(Math.min(1, Math.max(-1, 1 - x / REL))); return { x: x, inset: REL * (1 - Math.sin(p)), nx: -Math.cos(p), rs: Math.sin(p) }; }
    if (x > L - RER) { var p2 = Math.acos(Math.min(1, Math.max(-1, 1 - (L - x) / RER))); return { x: x, inset: RER * (1 - Math.sin(p2)), nx: Math.cos(p2), rs: Math.sin(p2) }; }
    return { x: x, inset: 0, nx: 0, rs: 1 };
  }

  function slab(a, b, id) {
    var sh = shape(id), HY = sh.HY, HZ = sh.HZ, REL = sh.REL, RER = sh.RER, R0 = sh.ring0;
    var pos = [], nor = [], uv = [], colr = [], idx = [], i, k;
    function ao(y) { var t = Math.min(1, Math.max(0, y / (HY * 0.5))); t = t * t * (3 - 2 * t); return 0.74 + 0.26 * t; }

    // 스테이션 목록: a, (끝 둥근 구간의 샘플 중 a<x<b), b
    var xs = [a], n = sh.steps, ph;
    for (k = 1; k < n; k++) { ph = (Math.PI / 2) * k / n; var xl = REL * (1 - Math.cos(ph)); if (xl > a + 1e-6 && xl < b - 1e-6) xs.push(xl); }
    for (k = n - 1; k >= 1; k--) { ph = (Math.PI / 2) * k / n; var xr = L - RER * (1 - Math.cos(ph)); if (xr > a + 1e-6 && xr < b - 1e-6) xs.push(xr); }
    if (REL > a + 1e-6 && REL < b - 1e-6) xs.push(REL);
    if (L - RER > a + 1e-6 && L - RER < b - 1e-6) xs.push(L - RER);
    xs.push(b);
    xs.sort(function (p, q) { return p - q; });
    xs = xs.filter(function (v, j) { return j === 0 || v - xs[j - 1] > 1e-6; });
    var sts = xs.map(function (x) { return station(x, sh.id); }), M = R0.n;

    // 옆면
    for (i = 0; i < sts.length; i++) {
      var st = sts[i], R = ringFor(sh, st.inset);
      for (k = 0; k < M; k++) {
        var y = R.q[k] + HY / 2;
        pos.push(st.x, y, R.p[k]);
        var nyy = R.nq[k] * st.rs, nzz = R.np[k] * st.rs, nxx = st.nx, nl = Math.hypot(nxx, nyy, nzz) || 1;
        nor.push(nxx / nl, nyy / nl, nzz / nl);
        uv.push(st.x / L, sh.sp[k]);
        var a2 = ao(y); colr.push(a2, a2, a2);
      }
    }
    function tri(i0, i1, i2) {                 // 정점 법선과 같은 쪽을 보도록 감는 방향을 맞춘다
      var ax = pos[i1 * 3] - pos[i0 * 3], ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1], az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
      var bx = pos[i2 * 3] - pos[i0 * 3], by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1], bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
      var fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
      var wx = nor[i0 * 3] + nor[i1 * 3] + nor[i2 * 3], wy = nor[i0 * 3 + 1] + nor[i1 * 3 + 1] + nor[i2 * 3 + 1], wz = nor[i0 * 3 + 2] + nor[i1 * 3 + 2] + nor[i2 * 3 + 2];
      if (fx * wx + fy * wy + fz * wz >= 0) idx.push(i0, i1, i2); else idx.push(i0, i2, i1);
    }
    for (i = 0; i < sts.length - 1; i++) {
      for (k = 0; k < M - 1; k++) {
        var v00 = i * M + k, v01 = v00 + 1, v10 = (i + 1) * M + k, v11 = v10 + 1;
        tri(v00, v10, v01); tri(v01, v10, v11);
      }
    }
    var sideCount = idx.length;

    // 뚜껑 (왼쪽 −x, 오른쪽 +x). 중심에서 링을 따라 부채꼴로 닫는다(링은 중심 기준 볼록/별 모양이라 겹치지 않는다)
    function capAt(st, dir) {
      var R = ringFor(sh, st.inset), base = pos.length / 3, y;
      pos.push(st.x, HY / 2, 0); nor.push(dir, 0, 0); uv.push(0.5, 0.5); colr.push(1, 1, 1);
      for (k = 0; k < M - 1; k++) {
        y = R.q[k] + HY / 2;
        pos.push(st.x, y, R.p[k]); nor.push(dir, 0, 0);
        uv.push(0.5 + R.p[k] / HZ, y / HY);
        var a3 = ao(y) * 0.5 + 0.5; colr.push(a3, a3, a3);
      }
      for (k = 0; k < M - 1; k++) { var nk = (k + 1) % (M - 1); tri(base, base + 1 + k, base + 1 + nk); }
    }
    capAt(sts[0], -1);
    capAt(sts[sts.length - 1], +1);

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.addGroup(0, sideCount, 0);
    g.addGroup(sideCount, idx.length - sideCount, 1);
    g.userData = { a: a, b: b, id: sh.id, thickness: b - a, vertices: pos.length / 3, triangles: idx.length / 3, leftFlat: station(a, sh.id).inset, rightInset: station(b, sh.id).inset };
    return g;
  }

  SL.mesh3d = {
    slab: slab, shape: shape,
    station: station,
    baseRing: function (inset, id) { return ringFor(shape(id), inset || 0); }
  };
})();
