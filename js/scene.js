/* =========================================================
   scene.js — 월드 지오메트리와 벡터 드로잉
   시점: 측면 단면. y 는 아래로 증가.
   ========================================================= */

/* ---------- 월드 좌표 ---------- */
var W = {
  surfaceY: 0,

  soil: [
    { y0: 0,    y1: 380,  c: '#AE8F65' },
    { y0: 380,  y1: 900,  c: '#9F8057' },
    { y0: 900,  y1: 1750, c: '#8F724B' },   // 토양 중간층 — 기계가 묻힌 곳
    { y0: 1750, y1: 3400, c: '#7F633F' }
  ],

  plantX: [-250, 0, 250],

  machine: {
    shell:  { x: -330, y: 1255, w: 660, h: 340, r: 30 },
    cavity: { x: -298, y: 1288, w: 596, h: 274, r: 20 },
    inlet:  { topY: 1236, botY: 1352, topHW: 130, botHW: 78 },
    reelL:  { x: -195, y: 1445, r: 98 },
    reelR:  { x:  195, y: 1445, r: 98 },
    // 두 카트리지를 잇는 한 줄의 거름종이.
    // 양 끝은 카트리지 원 안쪽에서 끝나고, 카트리지가 그 위를 덮는다.
    paper:  { x: -195, y: 1360, w: 390, h: 56 },
    motor:  { x:  195, y: 1445, r: 58 }
  },

  zone: { x: -130, y: 1061, w: 260, h: 175 }
};

W.paperCX = W.machine.paper.x + W.machine.paper.w / 2;
W.paperCY = W.machine.paper.y + W.machine.paper.h / 2;

/* ---------- 카메라 프리셋 ---------- */
var CAM = {
  MENU:      { x: 0,   y: -230, z: 0.95 },
  PLANT:     { x: 0,   y: -60,  z: 1.15 },
  FERTILIZE: { x: 0,   y: -140, z: 1.05 },
  DESCEND:   { x: 0,   y: 1240, z: 1.00 },
  SPIN:      { x: 170, y: 1425, z: 1.40 },
  COLLECT:   { x: 0,   y: 1310, z: 0.84 },
  MEASURE:   { x: 0,   y: 1441, z: 3.40 },
  RESULT:    { x: 0,   y: 1330, z: 1.50 }
};

/* ---------- 씬 상태 ---------- */
var S = {
  plants: [
    { x: W.plantX[0], kind: 0, planted: false, grow: 0 },
    { x: W.plantX[1], kind: 1, planted: false, grow: 0 },
    { x: W.plantX[2], kind: 2, planted: false, grow: 0 }
  ],
  markerAlpha: 0,

  bag:      { x: 0, y: -520, angle: 0, alpha: 0, pouring: false },
  granules: [],
  rootIons: [],

  machineAlpha: 0,
  reelAngle: 0,
  reelSpin: 0,
  spinGlow: 0,
  spinProgress: 0,
  motorAlpha: 0,

  paperOffset: 0,
  paperColor: [250, 247, 242],
  paperGlow: 0,

  zoneAlpha: 0,
  zonePulse: 0,

  view: { x0: -1e6, x1: 1e6, y0: -1e6, y1: 1e6 },
  t: 0
};

/* ---------- 결정적 난수 (스페클 고정용) ---------- */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

var SPECKLES = (function(){
  var r = mulberry32(20260321), out = [];
  for (var i = 0; i < 520; i++){
    out.push({
      x: r() * 3600 - 1800,
      y: r() * 3300 + 30,
      s: 2 + r() * 5,
      a: 0.05 + r() * 0.10,
      w: r() < .5 ? 1 : 1.6
    });
  }
  return out;
})();

var PEBBLES = (function(){
  var r = mulberry32(778899), out = [];
  for (var i = 0; i < 90; i++){
    out.push({
      x: r() * 3400 - 1700,
      y: r() * 3200 + 80,
      rx: 7 + r() * 14,
      ry: 5 + r() * 9,
      rot: r() * Math.PI,
      a: 0.06 + r() * 0.07
    });
  }
  return out;
})();

var GRASS = (function(){
  var r = mulberry32(4242), out = [];
  for (var i = 0; i < 150; i++){
    out.push({ x: r() * 3400 - 1700, h: 9 + r() * 15, lean: (r() - .5) * 8 });
  }
  return out;
})();

/* =========================================================
   하늘 / 토양
   ========================================================= */
function drawSky(ctx){
  var g = ctx.createLinearGradient(0, -3400, 0, 0);
  g.addColorStop(0,   '#CDE7FF');
  g.addColorStop(0.55,'#E6F4FF');
  g.addColorStop(1,   '#F5FBFF');
  ctx.fillStyle = g;
  ctx.fillRect(-2400, -3400, 4800, 3400);
}

function drawClouds(ctx){
  var pts = [
    { x: -180, y: -330, s: 0.95, a: .66 },
    { x:  300, y: -430, s: 1.15, a: .60 },
    { x: -620, y: -560, s: 1.20, a: .70 },
    { x:  980, y: -620, s: 1.05, a: .55 },
    { x:  520, y: -790, s: 1.50, a: .48 },
    { x: -300, y:-1000, s: 1.30, a: .38 }
  ];
  for (var i = 0; i < pts.length; i++){
    var p = pts[i];
    var drift = Math.sin(S.t * 0.06 + i * 1.7) * 22;
    ctx.save();
    ctx.globalAlpha = p.a;
    ctx.fillStyle = '#FFFFFF';
    ctx.translate(p.x + drift, p.y);
    ctx.scale(p.s, p.s);
    ctx.beginPath();
    ctx.arc(-52, 6, 34, 0, 6.2832);
    ctx.arc(-8, -14, 46, 0, 6.2832);
    ctx.arc(44, 4, 32, 0, 6.2832);
    ctx.rect(-52, 6, 96, 24);
    ctx.fill();
    ctx.restore();
  }
}

function drawSoil(ctx, view){
  var i, L;

  for (i = 0; i < W.soil.length; i++){
    L = W.soil[i];
    if (L.y1 < view.y0 - 200 || L.y0 > view.y1 + 200) continue;
    ctx.fillStyle = L.c;
    ctx.fillRect(-2400, L.y0, 4800, L.y1 - L.y0);
  }

  // 층 경계 — 부드러운 파형
  ctx.save();
  ctx.strokeStyle = 'rgba(60,44,26,.16)';
  ctx.lineWidth = 3;
  for (i = 1; i < W.soil.length; i++){
    var y = W.soil[i].y0;
    if (y < view.y0 - 100 || y > view.y1 + 100) continue;
    ctx.beginPath();
    for (var x = -2400; x <= 2400; x += 60){
      var yy = y + Math.sin(x * 0.0042 + i * 2.1) * 11 + Math.sin(x * 0.011 + i) * 5;
      if (x === -2400) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // 자갈
  ctx.save();
  for (i = 0; i < PEBBLES.length; i++){
    var pb = PEBBLES[i];
    if (pb.y < view.y0 - 60 || pb.y > view.y1 + 60) continue;
    ctx.globalAlpha = pb.a;
    ctx.fillStyle = '#5C4A32';
    ctx.save();
    ctx.translate(pb.x, pb.y); ctx.rotate(pb.rot);
    ctx.beginPath(); ctx.ellipse(0, 0, pb.rx, pb.ry, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  // 미세 입자
  for (i = 0; i < SPECKLES.length; i++){
    var sp = SPECKLES[i];
    if (sp.y < view.y0 - 40 || sp.y > view.y1 + 40) continue;
    ctx.globalAlpha = sp.a;
    ctx.fillStyle = '#4A3A24';
    ctx.fillRect(sp.x, sp.y, sp.s, sp.s * sp.w);
  }
  ctx.restore();

  // 깊이감 — 아래로 갈수록 살짝 어둡게
  var dg = ctx.createLinearGradient(0, 900, 0, 3400);
  dg.addColorStop(0, 'rgba(30,50,70,0)');
  dg.addColorStop(1, 'rgba(30,50,70,.16)');
  ctx.fillStyle = dg;
  ctx.fillRect(-2400, 900, 4800, 2500);
}

function drawGrassLine(ctx, view){
  if (view.y0 > 120) return;
  ctx.save();
  ctx.fillStyle = '#7CC79B';
  ctx.fillRect(-2400, -9, 4800, 15);
  ctx.strokeStyle = '#5FB183';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (var i = 0; i < GRASS.length; i++){
    var g = GRASS[i];
    var sway = Math.sin(S.t * 1.1 + g.x * 0.01) * 2.5;
    ctx.beginPath();
    ctx.moveTo(g.x, -4);
    ctx.quadraticCurveTo(g.x + g.lean * .5 + sway, -4 - g.h * .6, g.x + g.lean + sway, -4 - g.h);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMidLayerLabel(ctx, view){
  var y = 980;
  if (y < view.y0 - 40 || y > view.y1 + 40) return;
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#3A2C18';
  ctx.font = '700 30px ' + FONT_SANS;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('토양 중간층', -820, y);
  ctx.restore();
}

/* =========================================================
   식물
   ========================================================= */
function drawPlantMarkers(ctx){
  if (S.markerAlpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = S.markerAlpha;
  for (var i = 0; i < S.plants.length; i++){
    var p = S.plants[i];
    if (p.planted) continue;

    ctx.fillStyle = 'rgba(30,111,217,.16)';
    ctx.beginPath();
    ctx.ellipse(p.x, -6, 48, 18, 0, 0, 6.2832);
    ctx.fill();

    ctx.strokeStyle = '#1E6FD9';
    ctx.lineWidth = 4;
    ctx.setLineDash([11, 9]);
    ctx.lineDashOffset = -S.t * 26;   // 한 방향으로만 흐른다
    ctx.beginPath();
    ctx.ellipse(p.x, -6, 48, 18, 0, 0, 6.2832);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x - 13, -36); ctx.lineTo(p.x + 13, -36);
    ctx.moveTo(p.x, -49);      ctx.lineTo(p.x, -23);
    ctx.stroke();
  }
  ctx.restore();
}

function leaf(ctx, len, wid, dir, color){
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(dir * len * .45, -wid, dir * len, -wid * .18);
  ctx.quadraticCurveTo(dir * len * .5, wid * .34, 0, 0);
  ctx.fill();
}

function drawPlant(ctx, p){
  if (!p.planted || p.grow <= 0) return;
  var g = p.grow;
  var sway = Math.sin(S.t * 1.3 + p.x * 0.01) * 0.045;

  ctx.save();
  ctx.translate(p.x, 0);
  ctx.rotate(sway * g);

  var stemC = '#3FA06E', leafA = '#54BE84', leafB = '#3EA36D';

  if (p.kind === 0){
    var h = 132 * g;
    ctx.strokeStyle = stemC; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, -h * .6, 0, -h); ctx.stroke();
    ctx.save(); ctx.translate(0, -h * .52); ctx.rotate(-0.34); leaf(ctx, 58 * g, 30 * g, -1, leafA); ctx.restore();
    ctx.save(); ctx.translate(0, -h * .72); ctx.rotate( 0.34); leaf(ctx, 62 * g, 32 * g,  1, leafB); ctx.restore();
    ctx.save(); ctx.translate(0, -h); leaf(ctx, 34 * g, 22 * g, -1, leafA); leaf(ctx, 34 * g, 22 * g, 1, leafA); ctx.restore();

  } else if (p.kind === 1){
    var h2 = 168 * g;
    ctx.strokeStyle = stemC; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-5, -h2 * .55, 0, -h2); ctx.stroke();
    ctx.save(); ctx.translate(0, -h2 * .38); ctx.rotate(-0.22); leaf(ctx, 76 * g, 42 * g, -1, leafB); ctx.restore();
    ctx.save(); ctx.translate(0, -h2 * .62); ctx.rotate( 0.20); leaf(ctx, 82 * g, 45 * g,  1, leafA); ctx.restore();
    ctx.save(); ctx.translate(0, -h2 * .86); ctx.rotate(-0.30); leaf(ctx, 66 * g, 37 * g, -1, leafA); ctx.restore();
    ctx.save(); ctx.translate(0, -h2); leaf(ctx, 40 * g, 26 * g, 1, leafB); ctx.restore();

  } else {
    var n = 6, h3 = 150 * g;
    for (var i = 0; i < n; i++){
      var a = (i / (n - 1) - .5) * 1.16;
      var hh = h3 * (0.72 + 0.28 * Math.cos(a * 1.5));
      ctx.strokeStyle = (i % 2 ? leafA : leafB);
      ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.sin(a) * hh * .45, -hh * .68,
                           Math.sin(a) * hh * 1.05, -hh * .88);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 뿌리
  ctx.save();
  ctx.globalAlpha = 0.30 * g;
  ctx.strokeStyle = '#7A6242'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (var k = -1; k <= 1; k++){
    ctx.beginPath();
    ctx.moveTo(p.x, 4);
    ctx.quadraticCurveTo(p.x + k * 34, 60 * g, p.x + k * 52, 118 * g);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlants(ctx){
  for (var i = 0; i < S.plants.length; i++) drawPlant(ctx, S.plants[i]);
}

/* =========================================================
   비료 봉지 / 알갱이
   ========================================================= */
function drawBag(ctx){
  var b = S.bag;
  if (b.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = b.alpha;
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

  shadowed(ctx, 26, 10, 'rgba(60,38,20,.28)', function(){
    var g = ctx.createLinearGradient(-56, -76, 56, 76);
    g.addColorStop(0, '#FBF6F0');
    g.addColorStop(1, '#EADDCE');
    ctx.fillStyle = g;
    roundRect(ctx, -56, -76, 112, 152, 14);
    ctx.fill();
  });

  ctx.fillStyle = '#8A5A3B';
  roundRect(ctx, -56, -76, 112, 42, 14);
  ctx.fill();
  ctx.fillRect(-56, -48, 112, 14);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 22px ' + FONT_SANS;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('질소', 0, -56);

  ctx.fillStyle = '#5C3D28';
  ctx.font = '800 27px ' + FONT_SANS;
  ctx.fillText('N', 0, -6);
  ctx.font = '700 17px ' + FONT_SANS;
  ctx.fillStyle = '#8A6A52';
  ctx.fillText('비료', 0, 24);

  ctx.strokeStyle = 'rgba(90,60,35,.20)';
  ctx.lineWidth = 2;
  roundRect(ctx, -56, -76, 112, 152, 14);
  ctx.stroke();

  ctx.restore();
}

/* 기울어진 봉지의 입구(좌상단 모서리) 위치 */
function bagSpout(){
  var b = S.bag, c = Math.cos(b.angle), s = Math.sin(b.angle);
  var lx = -56, ly = -76;
  return { x: b.x + lx * c - ly * s, y: b.y + lx * s + ly * c };
}

function updateGranules(dt){
  for (var i = S.granules.length - 1; i >= 0; i--){
    var g = S.granules[i];
    g.vy += 1500 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.life -= dt;
    if (g.y > 10){ g.y = 10; g.vy = 0; g.vx *= 0.7; }
    if (g.life <= 0) S.granules.splice(i, 1);
  }
}

function spawnGranules(x, y, n){
  for (var i = 0; i < n; i++){
    S.granules.push({
      x: x + rand(-16, 16), y: y,
      vx: rand(-290, -170), vy: rand(20, 120),
      r: rand(3.5, 7),
      life: rand(1.0, 1.9)
    });
  }
}

function drawGranules(ctx){
  ctx.save();
  for (var i = 0; i < S.granules.length; i++){
    var g = S.granules[i];
    ctx.globalAlpha = clamp(g.life, 0, 1) * .95;
    ctx.fillStyle = '#F0F5FA';
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(16,36,58,.16)'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.restore();
}

/* =========================================================
   기계
   ========================================================= */
/* 카트리지 — 감긴 종이는 원형 케이스에 덮여 보이지 않는다.
   기계는 전부 흰색. 형태는 외곽선과 그림자로만 구분한다. */
function drawReel(ctx, cx, cy, r, angle, highlight){
  ctx.save();
  ctx.translate(cx, cy);

  ctx.save();
  ctx.shadowColor = 'rgba(18,30,45,.34)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#DFE4E9';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(24,40,60,.34)'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.stroke();

  // 뚜껑 이음선
  ctx.strokeStyle = 'rgba(24,40,60,.20)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r - 13, 0, 6.2832); ctx.stroke();
  ctx.strokeStyle = 'rgba(24,40,60,.14)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, r - 22, 0, 6.2832); ctx.stroke();

  ctx.rotate(angle);

  // 회전이 보이도록 뚜껑의 표식
  ctx.fillStyle = 'rgba(24,40,60,.30)';
  roundRect(ctx, -6, -(r - 34), 12, 21, 6); ctx.fill();

  // 중심 허브
  ctx.fillStyle = '#8D97A3';
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = 'rgba(24,40,60,.32)'; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.fillStyle = '#DFE4E9';
  for (var k = 0; k < 3; k++){
    ctx.save(); ctx.rotate(k * 2.0944);
    roundRect(ctx, -4.5, -25, 9, 21, 4.5); ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  if (highlight > 0.01){
    ctx.save();
    ctx.globalAlpha = highlight * 0.9;
    ctx.strokeStyle = '#1E6FD9';
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 12]);
    ctx.lineDashOffset = -S.t * 40;
    ctx.beginPath(); ctx.arc(cx, cy, r + 18, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }
}

function drawMotor(ctx){
  if (S.motorAlpha <= 0.01) return;
  var m = W.machine.motor;
  ctx.save();
  ctx.translate(m.x, m.y);

  ctx.globalAlpha = S.motorAlpha * 0.16;
  ctx.fillStyle = '#1E6FD9';
  ctx.beginPath(); ctx.arc(0, 0, m.r + 8, 0, 6.2832); ctx.fill();

  ctx.globalAlpha = S.motorAlpha * 0.75;
  ctx.strokeStyle = '#1E6FD9';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, m.r, 0, 6.2832); ctx.stroke();

  ctx.rotate(S.reelAngle);
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (var i = 0; i < 4; i++){
    ctx.save(); ctx.rotate(i * Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -m.r + 9); ctx.stroke();
    roundRect(ctx, -13, -m.r + 6, 26, 16, 6);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#1E6FD9';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.2832); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = S.motorAlpha * 0.85;
  ctx.fillStyle = '#1E6FD9';
  ctx.font = '800 20px ' + FONT_SANS;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('모터', m.x, m.y + m.r + 26);
  ctx.restore();
}

/* 거름종이 — 두 카트리지 사이를 잇는 한 줄.
   양 끝은 카트리지 원 안쪽에서 끝나며, 그 위를 카트리지가 덮어
   종이가 카트리지에서 빠져나오는 것으로 읽힌다. */
function drawPaper(ctx){
  var p = W.machine.paper;

  ctx.save();

  ctx.fillStyle = cssRGB(S.paperColor);
  ctx.fillRect(p.x, p.y, p.w, p.h);

  // 이송 눈금
  ctx.save();
  ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
  ctx.fillStyle = 'rgba(70,52,34,.16)';
  var step = 40;
  var off = ((S.paperOffset % step) + step) % step;
  for (var t = -step; t < p.w + step; t += step){
    ctx.fillRect(p.x + t + off, p.y, 2.5, 6);
    ctx.fillRect(p.x + t + off, p.y + p.h - 6, 2.5, 6);
  }
  ctx.restore();

  // 위아래 가장자리만 아주 옅게
  var eg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
  eg.addColorStop(0,    'rgba(60,40,20,.10)');
  eg.addColorStop(0.14, 'rgba(60,40,20,0)');
  eg.addColorStop(0.86, 'rgba(60,40,20,0)');
  eg.addColorStop(1,    'rgba(60,40,20,.10)');
  ctx.fillStyle = eg;
  ctx.fillRect(p.x, p.y, p.w, p.h);

  ctx.strokeStyle = 'rgba(60,40,20,.18)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);       ctx.lineTo(p.x + p.w, p.y);
  ctx.moveTo(p.x, p.y + p.h); ctx.lineTo(p.x + p.w, p.y + p.h);
  ctx.stroke();

  ctx.restore();
}

function drawMachine(ctx){
  if (S.machineAlpha <= 0.01) return;
  var M = W.machine;

  ctx.save();
  ctx.globalAlpha = S.machineAlpha;

  // 외피 — 흰색
  shadowed(ctx, 44, 16, 'rgba(14,24,38,.40)', function(){
    ctx.fillStyle = '#C6CDD5';
    roundRect(ctx, M.shell.x, M.shell.y, M.shell.w, M.shell.h, M.shell.r);
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(24,40,60,.30)';
  ctx.lineWidth = 2.6;
  roundRect(ctx, M.shell.x, M.shell.y, M.shell.w, M.shell.h, M.shell.r);
  ctx.stroke();

  // 내부 공동 — 흰 부품이 떠 보이도록 중성 회색
  ctx.fillStyle = '#9AA3AE';
  roundRect(ctx, M.cavity.x, M.cavity.y, M.cavity.w, M.cavity.h, M.cavity.r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(24,40,60,.22)';
  ctx.lineWidth = 2;
  roundRect(ctx, M.cavity.x, M.cavity.y, M.cavity.w, M.cavity.h, M.cavity.r);
  ctx.stroke();

  // 시료 유입구
  var inl = M.inlet;
  ctx.beginPath();
  ctx.moveTo(-inl.topHW, inl.topY);
  ctx.lineTo( inl.topHW, inl.topY);
  ctx.lineTo( inl.botHW, inl.botY);
  ctx.lineTo(-inl.botHW, inl.botY);
  ctx.closePath();
  ctx.fillStyle = '#828C98';
  ctx.fill();
  ctx.strokeStyle = 'rgba(24,40,60,.34)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 종이를 먼저 깔고, 그 위를 카트리지가 덮는다
  drawPaper(ctx);
  drawReel(ctx, M.reelL.x, M.reelL.y, M.reelL.r, S.reelAngle, 0);
  drawReel(ctx, M.reelR.x, M.reelR.y, M.reelR.r, S.reelAngle, S.spinGlow);
  drawMotor(ctx);

  // 릴 라벨
  ctx.save();
  ctx.globalAlpha = S.machineAlpha * 0.62;
  ctx.fillStyle = '#2B3A4A';
  ctx.font = '700 19px ' + FONT_SANS;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('공급부', M.reelL.x, M.reelL.y + M.reelL.r + 22);
  if (S.motorAlpha < 0.2) ctx.fillText('회수부', M.reelR.x, M.reelR.y + M.reelR.r + 22);
  ctx.restore();

  // 회전 진행 링
  if (S.spinProgress > 0.001 && S.spinProgress < 0.999){
    ctx.save();
    ctx.translate(M.reelR.x, M.reelR.y);
    ctx.strokeStyle = 'rgba(30,111,217,.20)';
    ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, M.reelR.r + 30, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = '#2FA36B';
    ctx.beginPath();
    ctx.arc(0, 0, M.reelR.r + 30, -Math.PI/2, -Math.PI/2 + 6.2832 * S.spinProgress);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/* =========================================================
   판정 구역
   ========================================================= */
function drawZone(ctx){
  if (S.zoneAlpha <= 0.01) return;
  var z = W.zone;

  ctx.save();
  ctx.globalAlpha = S.zoneAlpha;

  ctx.fillStyle = 'rgba(247,251,255,' + (0.84 + 0.10 * S.zonePulse) + ')';
  roundRect(ctx, z.x, z.y, z.w, z.h, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(30,111,217,.80)';
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 11]);
  ctx.lineDashOffset = -S.t * 26;
  roundRect(ctx, z.x, z.y, z.w, z.h, 18);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(30,111,217,.88)';
  ctx.font = '800 19px ' + FONT_SANS;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('판정 구역', z.x + z.w / 2, z.y - 12);

  ctx.restore();
}

/* =========================================================
   전체 렌더
   ========================================================= */
function renderScene(ctx, cam, cw, ch){
  var view = cam.viewBounds(cw, ch);

  drawSky(ctx);
  if (view.y0 < -120) drawClouds(ctx);
  drawSoil(ctx, view);
  drawMidLayerLabel(ctx, view);
  drawGrassLine(ctx, view);

  if (view.y0 < 400){
    drawPlantMarkers(ctx);
    drawPlants(ctx);
    drawGranules(ctx);
    drawBag(ctx);
  }

  // 뿌리에 남은 질산염
  for (var i = 0; i < S.rootIons.length; i++){
    var ri = S.rootIons[i];
    drawIon(ctx, ri.x, ri.y, ri.r, 0, ri.alpha);
  }

  drawMachine(ctx);
  drawZone(ctx);
  Particles.draw(ctx);
}
