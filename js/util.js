/* =========================================================
   util.js — 수학, 이징, 트윈, 검량선, 색 변환
   ========================================================= */

/* ---------------------------------------------------------
   검량선 (질산염 농도별 Nitrate Reductase 흡광도, 540 nm)
   실측 수치가 확보되면 이 배열만 교체하면
   색·슬라이더·채점이 전부 따라 바뀐다.
   --------------------------------------------------------- */
var CALIBRATION = [
  [0,    0.000],
  [0.5,  0.070],
  [1,    0.130],
  [2,    0.270],
  [3,    0.330],
  [5,    0.385],
  [7,    0.390],
  [10,   0.410]
];

/* 슬라이더와 정답의 농도 범위.

   5 mg/L 이상은 검량선이 포화되어(0.385 → 0.410, 전체 범위의 6%)
   색으로 구분할 수 없다. 그 구간은 눈금으로서 의미가 없으므로
   슬라이더 자체를 0~5 mg/L 로 둔다.
   검량선 배열은 10 mg/L 까지 그대로 두어 5 mg/L 부근의
   기울기(포화 진입)가 정확히 반영되게 한다. */
var CONC_MIN = 0;
var CONC_MAX = 5;

var TARGET_MIN = 0.30;
var TARGET_MAX = CONC_MAX;

/* 슬라이더 아래에 놓을 색 견본 농도.
   실제 실험에서 만든 표준용액 농도 중에서 고른다.
   1 mg/L 은 눈금의 1/5, 3 mg/L 은 3/5 지점. */
var REF_CONCS = [1, 3];

/* =========================================================
   기본 수학
   ========================================================= */
function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t){ return a + (b - a) * t; }
function invLerp(a, b, v){ return b === a ? 0 : (v - a) / (b - a); }
function rand(a, b){ return a + Math.random() * (b - a); }
function randInt(a, b){ return Math.floor(rand(a, b + 1)); }
function dist2(ax, ay, bx, by){ var dx = bx - ax, dy = by - ay; return dx*dx + dy*dy; }

/* 프레임레이트 독립 감쇠. rate = 초당 남는 비율 */
function damp(current, target, rate, dt){
  return target + (current - target) * Math.pow(rate, dt);
}

/* =========================================================
   이징
   ========================================================= */
var Ease = {
  linear:      function(t){ return t; },
  outCubic:    function(t){ return 1 - Math.pow(1 - t, 3); },
  outQuint:    function(t){ return 1 - Math.pow(1 - t, 5); },
  inCubic:     function(t){ return t*t*t; },
  inOutCubic:  function(t){ return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; },
  inOutQuint:  function(t){ return t < .5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t + 2, 5)/2; },
  outBack:     function(t){ var c1 = 1.70158, c3 = c1 + 1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); },
  outElastic:  function(t){
    if (t === 0 || t === 1) return t;
    var c4 = (2*Math.PI)/3;
    return Math.pow(2, -10*t) * Math.sin((t*10 - .75) * c4) + 1;
  },
  outBounceSoft: function(t){ return 1 - Math.pow(1 - t, 2) * Math.cos(t * Math.PI * .6); }
};

/* =========================================================
   트윈 엔진
   ========================================================= */
var Tweens = {
  list: [],

  add: function(opt){
    var tw = {
      from:     opt.from !== undefined ? opt.from : 0,
      to:       opt.to   !== undefined ? opt.to   : 1,
      dur:      opt.dur  !== undefined ? opt.dur  : .5,
      delay:    opt.delay || 0,
      ease:     opt.ease || Ease.outCubic,
      onUpdate: opt.onUpdate || null,
      onDone:   opt.onDone || null,
      tag:      opt.tag || null,
      t:        0,
      done:     false
    };
    if (tw.tag) Tweens.killTag(tw.tag);
    Tweens.list.push(tw);
    return tw;
  },

  /* 값 변화 없이 지연 실행만 */
  after: function(delay, fn, tag){
    return Tweens.add({ dur: 0.0001, delay: delay, onDone: fn, tag: tag });
  },

  killTag: function(tag){
    for (var i = Tweens.list.length - 1; i >= 0; i--){
      if (Tweens.list[i].tag === tag) Tweens.list.splice(i, 1);
    }
  },

  killAll: function(){ Tweens.list.length = 0; },

  update: function(dt){
    for (var i = Tweens.list.length - 1; i >= 0; i--){
      var tw = Tweens.list[i];
      if (tw.delay > 0){ tw.delay -= dt; if (tw.delay > 0) continue; }
      tw.t += dt;
      var p = tw.dur <= 0 ? 1 : clamp(tw.t / tw.dur, 0, 1);
      var e = tw.ease(p);
      if (tw.onUpdate) tw.onUpdate(lerp(tw.from, tw.to, e), e);
      if (p >= 1){
        Tweens.list.splice(i, 1);
        if (tw.onDone) tw.onDone();
      }
    }
  }
};

/* =========================================================
   PCHIP (Fritsch–Carlson) 단조 3차보간
   검량선이 실측점을 정확히 통과하면서
   포화 구간에서 오버슈트하지 않도록 한다.
   ========================================================= */
function buildPCHIP(points){
  var n = points.length;
  var xs = new Array(n), ys = new Array(n);
  for (var i = 0; i < n; i++){ xs[i] = points[i][0]; ys[i] = points[i][1]; }

  var h = new Array(n-1), del = new Array(n-1);
  for (i = 0; i < n-1; i++){
    h[i]   = xs[i+1] - xs[i];
    del[i] = (ys[i+1] - ys[i]) / h[i];
  }

  var d = new Array(n);
  d[0]   = del[0];
  d[n-1] = del[n-2];
  for (i = 1; i < n-1; i++){
    if (del[i-1] * del[i] <= 0){
      d[i] = 0;
    } else {
      var w1 = 2*h[i] + h[i-1];
      var w2 = h[i] + 2*h[i-1];
      d[i] = (w1 + w2) / (w1/del[i-1] + w2/del[i]);
    }
  }

  return function(x){
    x = clamp(x, xs[0], xs[n-1]);
    var k = n - 2;
    for (var j = 0; j < n-1; j++){
      if (x <= xs[j+1]){ k = j; break; }
    }
    var s  = x - xs[k];
    var hk = h[k];
    var t  = s / hk;
    var t2 = t*t, t3 = t2*t;
    // Hermite 기저
    var h00 =  2*t3 - 3*t2 + 1;
    var h10 =    t3 - 2*t2 + t;
    var h01 = -2*t3 + 3*t2;
    var h11 =    t3 -   t2;
    return h00*ys[k] + h10*hk*d[k] + h01*ys[k+1] + h11*hk*d[k+1];
  };
}

var _absorbance = buildPCHIP(CALIBRATION);

/* 농도(mg/L) → 흡광도 */
function absorbanceAt(conc){
  return _absorbance(clamp(conc, CONC_MIN, CONC_MAX));
}

var A_MIN   = absorbanceAt(CONC_MIN);
var A_MAX   = absorbanceAt(CONC_MAX);
var A_RANGE = A_MAX - A_MIN;

/* =========================================================
   채점 — 색(흡광도) 오차 기준

   단순 선형(1 - err/range)으로 하면 대충 찍어도 85% 이상이 나와
   상위권이 전부 붙어 버린다. 허용 오차를 좁히고 곡선을 세워
   잘 맞춘 사람과 대충 맞춘 사람이 벌어지게 한다.
   ========================================================= */
var SCORE_TOLERANCE = 0.80;   // A_RANGE 의 이 비율만큼 빗나가면 0점
var SCORE_EXPONENT  = 1.60;   // 클수록 상위권이 넓게 벌어진다

function scoreFor(absErr){
  var ratio = clamp(absErr / (A_RANGE * SCORE_TOLERANCE), 0, 1);
  var v = 100 * Math.pow(1 - ratio, SCORE_EXPONENT);
  return clamp(Math.round(v * 10) / 10, 0, 100);
}

/* =========================================================
   흡광도 → 색 (Beer–Lambert)

   투과율 T = 10^(-A). Griess 아조 염료의 최대 흡수는 540 nm(녹색)이므로
   채널별 상대 흡광계수를 두고 종이 바탕색에 곱한다.
   임의로 고른 분홍 그라데이션이 아니라 흡광도에서 유도된 색이다.
   ========================================================= */
var PAPER_BASE = [250, 247, 242];   // 거름종이 바탕 #FAF7F2
var K_R = 0.15;                      // ~615 nm 상대 흡광계수
var K_G = 1.00;                      // ~540 nm (최대 흡수)
var K_B = 0.35;                      // ~465 nm

function rgbFromAbsorbance(A){
  return [
    Math.round(PAPER_BASE[0] * Math.pow(10, -A * K_R)),
    Math.round(PAPER_BASE[1] * Math.pow(10, -A * K_G)),
    Math.round(PAPER_BASE[2] * Math.pow(10, -A * K_B))
  ];
}

function rgbForConc(conc){ return rgbFromAbsorbance(absorbanceAt(conc)); }

function cssRGB(arr){ return 'rgb(' + arr[0] + ',' + arr[1] + ',' + arr[2] + ')'; }
function colorForConc(conc){ return cssRGB(rgbForConc(conc)); }

function mixRGB(a, b, t){
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t))
  ];
}

/* 슬라이더 트랙 그라데이션 — 선형 블렌드가 아니라 검량선을 따라간다 */
function calibrationGradientCSS(steps){
  steps = steps || 24;
  var stops = [];
  for (var i = 0; i <= steps; i++){
    var p = i / steps;
    var c = CONC_MIN + (CONC_MAX - CONC_MIN) * p;
    stops.push(colorForConc(c) + ' ' + (p * 100).toFixed(2) + '%');
  }
  return 'linear-gradient(90deg,' + stops.join(',') + ')';
}

/* =========================================================
   포맷
   ========================================================= */
function fmtConc(v){ return v.toFixed(2); }
function fmtAbs(v){ return v.toFixed(3); }

/* =========================================================
   캔버스 헬퍼
   ========================================================= */

/* CSS 와 동일한 폰트 스택 (fonts/ 에 번들된 웹폰트) */
var FONT_SANS    = '"Pretendard Variable",Pretendard,"Malgun Gothic",sans-serif';
var FONT_DISPLAY = '"SUIT Variable","Pretendard Variable","Malgun Gothic",sans-serif';

function roundRect(ctx, x, y, w, h, r){
  var rr = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function shadowed(ctx, blur, oy, color, fn){
  ctx.save();
  ctx.shadowColor = color || 'rgba(20,60,110,.18)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = oy;
  fn();
  ctx.restore();
}
