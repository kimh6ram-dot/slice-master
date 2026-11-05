/* 썰기의 달인 — 정한 값 모음. 튜닝은 여기서만 한다.
 * 논리 단위: 재료 길이 LENGTH=1000 (화면 픽셀과 무관). 두께·위치·속도 모두 이 단위. */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};

  SL.C = {
    LENGTH: 1000,          // 재료 전체 길이(논리 단위)
    MIN_T: 8,              // 조각 최소 두께(0.8%) — 두께 0 조각 방지 + 남은 절단 횟수 확보에 쓰인다 (절단 횟수는 재료별 INGREDIENTS[].cuts)

    // 칼 이동: 누른 시간에 따라 느림→빠름 (탭 = 미세 조정, 길게 = 빠른 이동)
    SPEED_MIN: 70,         // u/s
    SPEED_MAX: 560,        // u/s
    RAMP_SEC: 0.9,
    NUDGE: 5,              // 키/버튼을 누른 순간 즉시 이동하는 양(u) — 탭 한 번의 최소 이동

    CHOP_MS: 170,          // 칼이 내려갔다 올라오는 연출 시간(아래 CUT 타임라인과 같은 길이)
    // 절단 한 번의 타임라인(ms, 썰기 입력 = 0): 0~PRESS 칼이 바로 내려와 재료 표면에 닿음 → PRESS~RESIST 표면에서 잠깐 저항(거의 멈춤, 재료 눌림) → RESIST~BOARD 끝까지 통과
    // (절단선·막 잘린 조각의 밀림은 SEP 에 시작, 절단음 '스윽' 은 RESIST 에 시작) → BOARD 칼날이 도마에 닿아 절단 완료(마른 나무 '탁' + 카운터 갱신) → CHOP_MS 까지 복귀
    CUT: { PRESS: 28, RESIST: 52, BOARD: 92, SEP: 60, SURFACE_DROP: 0.2, RESIST_DROP: 0.27, PRESS_SQUASH: 0.014},
    SETTLE_MS: 1000,       // 9번째 절단 뒤 조각이 벌어지며 정착하는 시간 → 결과
    TRIM_PX: 1.6,          // 플레이 중 절단면 틈(한쪽, px)
    SPREAD_PX: 7,          // 결과 화면에서 조각 사이 간격(px)
    SETTLE_SPREAD_PX: 3,   // 플레이 화면 정착 연출에서 벌어지는 간격(px) — 도마 안에 머물도록 작게

    // 점수: 두께의 RMS 편차 / 이상 두께(=L/10). 0 → 100점, ZERO_AT 이상 → 0점 (선형)
    ZERO_AT: 0.5,
    LAST_THICK: 1.35,      // 마지막 조각이 이상 두께의 이 배수 이상이면 "예상보다 두꺼움" 문구

    // 등급(min 내림차순). 문구는 임시 — 사용자 확정 문구가 오면 글자 그대로 교체
    GRADES: [
      { min: 95, title: '이연복 셰프급 칼질' },
      { min: 85, title: '칼질 좀 하시네요' },
      { min: 70, title: '먹을 만합니다' },
      { min: 50, title: '집중하세요' },
      { min: 0,  title: '이건 못 먹겠습니다' }
    ],

    // 재료 4종 — 조작·점수 기준(두께 균일도)은 같고, 절단 횟수(cuts)만 재료별 설정값이다. 조각 수 = cuts + 1(마지막 남은 끝 조각 포함).
    // 진행 카운터·완료 판정(slicing)·점수의 목표 두께(scoring: LENGTH / 조각 수)가 모두 이 값을 읽는다.
    // h = 실제 에셋 이미지의 세로/가로 비율(굵기 차이는 이미지 그대로, 규칙·점수와 무관)
    INGREDIENTS: [
      { id: 'naruto',   name: '나루토 어묵', h: 0.2757, cuts: 14 },
      { id: 'tamago',   name: '계란말이',   h: 0.2825, cuts: 9 },
      { id: 'salmon',   name: '연어',       h: 0.2523, cuts: 11 },
      { id: 'cucumber', name: '오이',       h: 0.181,  cuts: 24 }
    ],
    // 친구 도전장 공유 문구. URL 이 비어 있으면 http(s) 로 열린 현재 주소를 쓰고, file:// 처럼 공유할 수 없는 환경에서는 버튼을 끈다(임의 주소 금지)
    SHARE: {
      URL: '',
      TITLE: '칼질 좀 하세요? 대결해요.',
      TEXT: '내 {ing} 썰기 기록 {score}점. 이길 수 있으면 해보세요.',
      COPIED: '도전장 링크가 복사됐어요!'
    },
    cutsOf: function (id) {
      var a = SL.C.INGREDIENTS;
      for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i].cuts;
      return a[0].cuts;
    }
  };
})();

/* 3D 계란말이(Three.js) — 논리 단위 = 월드 단위. 길이 방향 = +x, 위 = +y, 카메라 쪽 = +z */
(function () {
  'use strict';
  window.SL.C.ROLL3D = {
    HY: 220, HZ: 230,          // 단면 높이·깊이
    RC: 64,                    // 단면 모서리 반지름
    RE: 40,                    // 양 끝 둥근 정도(원래 끝만 둥글고 절단면은 평평)
    RING_CORNER: 6,            // 모서리 호 분할
    END_STEPS: 8,              // 끝 둥근 부분 분할

    // 고정 직교 카메라: 윗면·앞 옆면·왼쪽 단면이 보이고, 길이 축(x)은 화면에서 정확히 수평
    CAM_AZ_DEG: 30,            // 정면에서 왼쪽으로
    CAM_EL_DEG: 30,            // 위에서
    KITCHEN_AZ_DEG: 12,      // 주방 장면(정면 배경·세로 칼)에서는 방위각을 줄여 절단 평면이 화면에서 거의 수직으로 보이게 한다

    TEX_BODY: 1024,            // 몸통 색 텍스처(정사각, u=길이·v=둘레)
    TEX_BUMP: 512,             // 몸통 노멀맵 해상도
    TEX_CAP: 512,              // 절단면 색·노멀 해상도
    NORMAL_STRENGTH: 2.6,
    DPR_MAX: 2,

    LIGHT: { HEMI: 1.35, KEY: 2.0, KEY_POS: [-0.75, 1.0, 0.55], FILL: 0.55, FILL_POS: [0.7, 0.3, 0.8] },
    NUDGE: 7,                   // 막 잘린 조각 하나가 옆으로 밀리는 양(월드 단위) — 그 조각만 움직이고 멈춘다(앞서 잘린 조각은 그대로)
    SPREAD_TOTAL: 170,          // 정지 장면(결과)에서 첫 조각~마지막 조각 사이 벌어짐 총량 — 조각 수와 무관하게 받침 위 같은 폭을 쓴다
    LIFT_MAX: 16,              // 기울어진 조각의 오른쪽 아래가 도마에서 뜨는 최대 높이
    TILT_MAX_DEG: 4,
    TILT_STEP_DEG: 1.0,        // 이웃 조각보다 더 기울 수 있는 한계(인접 조각이 겹치지 않게)
    TILT_MS: 170,
    SEPARATE_DELAY_MS: 60      // 칼날이 재료를 지나가는 순간(CUT.SEP)에 조각이 움직이기 시작
  };
})();

/* 재료 드래그 손맛(눈에 보이는 애니메이션 전용 — 절단 판정에는 쓰이지 않는다).
 *  잡으면 LIFT(월드 단위)만큼 살짝 뜨고(LIFT_MS), 놓으면 DROP_MS 에 내려와 닿는 순간 높이가 A 만큼 눌렸다가(CONTACT_MS) 한 번의 작은 감쇠 진동(τ·ω)으로 돌아온다.
 *  scaleY = 1 − A·…(cos 가 음수가 되는 구간 = 아주 살짝 되튐 '통'), scaleZ 는 반대로 조금 부푼다. 길이(x) 방향은 그대로라 절단면 위치가 변하지 않는다.
 *  A = 눌림 정도, tau(ms) = 가라앉는 속도, w(rad/ms) = 되돌아오는 속도(클수록 단단하고 빠름). */
(function () {
  'use strict';
  window.SL.C.DRAG = {
    LIFT: 7, LIFT_MS: 90, DROP_MS: 70, CONTACT_MS: 40,
    FEEL: {
      tamago:   { A: 0.050, tau: 75, w: 0.0150 },    // 포슬포슬 폭신: 중간 눌림, 부드럽게 되돌아오며 살짝 되튐
      naruto:   { A: 0.038, tau: 60, w: 0.0210 },    // 탄력: 눌림 작고 되튐 빠름
      salmon:   { A: 0.056, tau: 95, w: 0.0095 },    // 촉촉하고 묵직: 눌림 깊고 천천히, 되튐 거의 없음
      cucumber: { A: 0.022, tau: 38, w: 0.0280 }     // 단단하고 가벼움: 눌림 작고 빠르게 안착
    }
  };
})();

/* 재료별 3D 형태 — 절단 구조(mesh3d.slab)는 공유하고 단면 링(외곽)만 재료마다 다르다. 단위 = 논리 길이(LENGTH=1000)
 *  kind: rrect = 모서리 둥근 직육면체(HY 높이·HZ 깊이·RC 모서리 반지름) / flute = 물결 테두리 원통(R0 반지름·A 골 깊이·N 골 개수) / circle = 원통(R)
 *  REL·RER = 원래 왼쪽·오른쪽 끝의 둥근 정도(절단면은 항상 평평). 오이는 왼쪽 끝이 잘려 있고 오른쪽이 둥글다(에셋 형태 그대로). */
(function () {
  'use strict';
  var C3 = window.SL.C.ROLL3D;
  window.SL.C.SHAPES = {
    tamago:   { kind: 'rrect',  HY: C3.HY, HZ: C3.HZ, RC: C3.RC, REL: C3.RE, RER: C3.RE },
    salmon:   { kind: 'rrect',  HY: 176, HZ: 214, RC: 48, REL: 30, RER: 30 },
    naruto:   { kind: 'flute',  R0: 122, A: 8, N: 16, REL: 12, RER: 12 },
    cucumber: { kind: 'circle', R: 84, REL: 7, RER: 64 }
  };
})();

/* 플레이 영역 기준 좌표계 — 주방 장면(#stage)만 1920×1080(16:9) 논리 좌표를 쓰고 창에는 균일 배율 k 하나로 맞춘다(main.js 가 갱신).
 * 인트로·선택·결과 화면 캔버스는 일반 반응형이라 배율 1(실제 CSS px). of(cv) = 그 캔버스에 적용할 배율 */
(function () {
  'use strict';
  var F = window.SL.FIT = { W: 1920, H: 1080, LW: 1920, LH: 1080, k: 1, DPR_MAX: 1.5, PORTRAIT_W: 1580, PORTRAIT_UI: 230 };   // 세로 화면: 논리 가로 1580 만 보이게 확대(PORTRAIT_W), 프레임 위·아래 안내/버튼 자리(PORTRAIT_UI px)   // LW = 스테이지 실제 논리 가로 폭(창이 16:9 보다 넓을 때만 W 보다 큼)
  F.of = function (cv) { return cv && cv.id === 'stage' ? F.k : 1; };
})();

/* 주방 장면(가로 배경 kitchen_bg_v2.png 1672×941 기준). 좌표는 "배경 원본 픽셀" 단위 → 배율 s 를 곱하면 논리 좌표(1920×1080).
 *  새 배경의 도마는 작게(윗면 앞 가장자리 x 265~1405, 뒤 345~1320 / y 537~762) 놓여 있어, 배경을 도마 중심(CX)을 기준으로 살짝 확대해 쓴다:
 *  s = (1920/1672) × zoom. zoom 은 프레임이 클 땐 ZOOM_MAX(도마 양끝에 좌우 여유 ~5% 남는 크기), 프레임이 작을수록 ZOOM_MIN 까지 낮춘다.
 *  확대는 항상 도마 중심 기준이라 좌우를 억지로 자르지 않고 도마 전체가 보인다(프레임이 16:9 라 세로로 든 폰은 위아래 여백만 생긴다).
 *  재료·칼·도마 범위는 모두 이 한 배율 s 와 원점으로 정해지므로 배경과 항상 같은 비율로 움직인다. */
(function () {
  'use strict';
  window.SL.C.KITCHEN = {
    CX: 836,                   // 도마 윗면 가로 중앙
    YC: 640,                   // 재료(보이는 외곽) 세로 중앙 — 도마 윗면(537~762)의 중앙(650)에서 살짝 뒤
    BG_CROP: 900,             // 배경 이미지에서 쓰는 높이(아래 나무 가장자리 띠 제외)
    LAND_LIFT: 40,             // 가로 화면에서 장면을 위로 올리는 양(화면 px, 세로 화면은 0)
    YC_Y: 680,                 // 재료 세로 중앙이 놓일 스테이지 y(논리 px). 확대해도 재료·칼 높이는 이 값으로 고정되고 배경이 그 뒤를 따라 움직인다
    ZOOM_MAX: 1.30, ZOOM_MIN: 1.15,    // 배경 확대율 — 프레임 폭 960px 이상 = MAX, 480px 이하 = MIN, 사이는 선형
    FOOD_W: { naruto: 700, salmon: 690, cucumber: 840, tamago: 650 },   // 재료 길이(배경 px) — 도마 앞 폭(1140)의 약 57~74%
    KNIFE_TIP_Y: 508,          // 칼끝 y(배경 px) — 칼은 재료와 무관하게 항상 같은 높이에 걸린다
    KNIFE_KS: 0.30,            // 칼 원본 이미지 1px → 배경 px (0.25 → 0.30: 20% 확대, 칼끝 위치는 고정이라 손잡이 쪽으로 커진다)
    KNIFE_DROP: 16, MIN_DROP_PX: 15,            // 썰 때 칼이 내려가는 양(배경 px)
    BOARD: { L: 300, R: 1372, T: 498, B: 758 },   // 재료를 끌어 옮길 수 있는 도마 안쪽 범위(배경 px) — 재료의 보이는 외곽(좌·우·위·아래)이 이 안에 머문다
    SLIDE_MS: 170,             // (2D 대체 경로) 절단 뒤 조각이 벌어지는 시간
    CAP: 0.14, GAP_EXTRA: 1.5  // (2D 대체 경로) 단면 폭 비율·간격
  };
})();

/* 엔딩(결과) 장면 — 토끼 셰프 접시 위에 썬 조각을 메인 화면 접시 위 계란말이처럼 낮은 수평 시점의 가로 한 줄로 올려 둔다.
 *  좌표는 ending_open 이미지 좌표계(1179×1334). 접시 안쪽 중심(PLATE)·줄 폭(ROW_W)은 build_assets.js 의 meta.ending.plate 가 정한다.
 *  AZ = 왼쪽에서 보는 각도(첫 조각 단면이 살짝 보임), EL = 카메라 고도(접시의 기울어진 정도와 같게), GAP = 조각 사이 틈(재료 단위).
 *  타임라인(ms): HOLD 덮개가 닫힌 채 정지 → LIFT 살짝 들림('챙') → RISE 부드럽게 위로(후반 페이드아웃) → 끝나면 재료 공개·점수 표시·팡파르. */
(function () {
  'use strict';
  window.SL.C.ENDING = { AZ: 30, EL: 20, GAP: 16, HOLD: 500, LIFT: 200, LIFT_PX: 16, RISE: 800, RISE_PX: 330, FADE_FROM: 0.45 };
})();
