/* =========================================================
   particles.js — 질산염 / 아질산염 이온 입자

   · 판정 구역 안에 있는지 매 프레임 검사해서 NO3- ↔ NO2- 가역 전환
   · 원-원 충돌로 서로 밀어냄
   · 전부 구역에 들어온 순간에만 일괄 페이드아웃
   ========================================================= */

var ION_R = 27;

/* 이동 가능 영역은 화면(카메라 뷰)에서 안쪽으로 들어온 사각형이다.
   고정 월드 좌표로 잡으면 화면 밖으로 나가 다시 못 잡는 일이 생긴다.
   아래 여백은 안내문·진행표시에 가리지 않도록 더 크게 잡는다. */
var EDGE_M   = 40;    // 화면 좌·우·위 여백 (px)
var EDGE_M_B = 150;   // 아래 여백 (px)

function playBounds(){
  var v = S.view;
  var z = v.zoom || 1;
  var mx = EDGE_M / z, mt = EDGE_M / z, mb = EDGE_M_B / z;
  var b = { x0: v.x0 + mx, x1: v.x1 - mx, y0: v.y0 + mt, y1: v.y1 - mb };
  // 창이 아주 작아도 뒤집히지 않게
  if (b.x1 < b.x0){ var cx = (v.x0 + v.x1) / 2; b.x0 = b.x1 = cx; }
  if (b.y1 < b.y0){ var cy = (v.y0 + v.y1) / 2; b.y0 = b.y1 = cy; }
  return b;
}

/* 기계는 통과할 수 없다 — 외피와 시료 유입구 */
var _machineRects = null;
function machineRects(){
  if (!_machineRects){
    var M = W.machine;
    _machineRects = [
      { x0: M.shell.x, y0: M.shell.y,
        x1: M.shell.x + M.shell.w, y1: M.shell.y + M.shell.h },
      { x0: -M.inlet.topHW, y0: M.inlet.topY,
        x1:  M.inlet.topHW, y1: M.inlet.botY }
    ];
  }
  return _machineRects;
}

/* 원이 사각형에 파고들면 밖으로 밀어낸다.
   중심까지 파고든 경우, 탈출 방향은 이동 가능 영역(B) 안에 떨어지는 것 중
   가장 얕은 쪽을 고른다. 그냥 최단 방향을 쓰면 화면 경계 밖으로 밀려나고
   경계 클램프가 다시 안으로 밀어 넣어 기계 안에 갇힌다. */
function pushOutOfRect(p, R, B){
  var cx = clamp(p.x, R.x0, R.x1);
  var cy = clamp(p.y, R.y0, R.y1);
  var dx = p.x - cx, dy = p.y - cy;
  var dd = dx * dx + dy * dy;

  if (dd > p.r * p.r) return;               // 닿지 않음

  if (dd > 1e-6){                            // 모서리·면 바깥
    var d = Math.sqrt(dd), nx = dx / d, ny = dy / d;
    p.x = cx + nx * p.r;
    p.y = cy + ny * p.r;
    var vn = p.vx * nx + p.vy * ny;
    if (vn < 0){ p.vx -= nx * vn; p.vy -= ny * vn; }
    return;
  }

  // 중심이 사각형 안
  var opts = [
    { d: p.x - R.x0, x: R.x0 - p.r, y: p.y, ax: 'x' },
    { d: R.x1 - p.x, x: R.x1 + p.r, y: p.y, ax: 'x' },
    { d: p.y - R.y0, x: p.x, y: R.y0 - p.r, ax: 'y' },
    { d: R.y1 - p.y, x: p.x, y: R.y1 + p.r, ax: 'y' }
  ];
  opts.sort(function(a, b){ return a.d - b.d; });

  var pick = null, eps = 0.5;
  for (var i = 0; i < opts.length; i++){
    var o = opts[i];
    if (!B){ pick = o; break; }
    if (o.x >= B.x0 + p.r - eps && o.x <= B.x1 - p.r + eps &&
        o.y >= B.y0 + p.r - eps && o.y <= B.y1 - p.r + eps){ pick = o; break; }
  }
  if (!pick) pick = opts[0];

  p.x = pick.x; p.y = pick.y;
  if (pick.ax === 'x') p.vx = 0; else p.vy = 0;
}

var C_NO3_FILL = [169, 113,  77];
var C_NO3_EDGE = [124,  76,  46];
var C_NO2_FILL = [235, 189,  62];
var C_NO2_EDGE = [186, 138,  26];

/* ---------------------------------------------------------
   이온 하나 그리기 (씬의 장식용 이온도 이걸 쓴다)
   t: 0 = NO3-, 1 = NO2-
   --------------------------------------------------------- */
function drawIon(ctx, x, y, r, t, alpha, flash){
  if (alpha <= 0.01) return;
  var fill = mixRGB(C_NO3_FILL, C_NO2_FILL, t);
  var edge = mixRGB(C_NO3_EDGE, C_NO2_EDGE, t);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (flash && flash > 0.01){
    ctx.globalAlpha = alpha * flash * 0.55;
    ctx.strokeStyle = cssRGB(C_NO2_EDGE);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r + 10 + (1 - flash) * 16, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  ctx.shadowColor = 'rgba(40,26,12,.28)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;

  var g = ctx.createRadialGradient(x - r * .34, y - r * .38, r * .12, x, y, r);
  g.addColorStop(0, cssRGB(mixRGB(fill, [255, 255, 255], 0.36)));
  g.addColorStop(1, cssRGB(fill));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = cssRGB(edge);
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();

  ctx.font = '800 ' + Math.round(r * 0.56) + 'px ' + FONT_SANS;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';

  if (t < 0.995){ ctx.globalAlpha = alpha * (1 - t); ctx.fillText('NO₃⁻', x, y + 1); }
  if (t > 0.005){ ctx.globalAlpha = alpha * t;       ctx.fillText('NO₂⁻', x, y + 1); }

  ctx.restore();
}

/* ========================================================= */
var Particles = {
  list: [],
  dragging: null,
  dragTarget: { x: 0, y: 0 },
  fading: false,

  clear: function(){
    Particles.list.length = 0;
    Particles.dragging = null;
    Particles.fading = false;
  },

  /* 즉시 조작 가능한 상태로 생성 (건너뛰기 등 예외 경로용) */
  spawn: function(n){
    Particles.clear();
    for (var i = 0; i < n; i++){
      var b = playBounds();
      Particles.list.push({
        x: rand(b.x0 + 60, b.x1 - 60),
        y: b.y0 - 90 - i * 78,
        vx: rand(-40, 40),
        vy: rand(430, 560),
        r: ION_R,
        t: 0,           // 0 = NO3-, 1 = NO2-
        inZone: false,
        alpha: 0,
        flash: 0,
        mode: 'active',
        entering: true,
        seed: rand(0, 6),
        delay: i * 0.16
      });
    }
  },

  /* 비료 살포 직후, 작물 뿌리에서 아래로 내려가기 시작하는 질산염.
     카메라가 이들을 앞질러 화면 위로 벗어나면 그 자리에 멈춰 대기한다. */
  spawnDescending: function(n, ox, oy){
    Particles.clear();
    for (var i = 0; i < n; i++){
      Particles.list.push({
        x: ox + rand(-95, 95),
        y: oy + rand(0, 70),
        vx: rand(-16, 16),
        vy: rand(170, 260),
        r: ION_R,
        t: 0,
        inZone: false,
        alpha: 0,
        flash: 0,
        mode: 'descend',
        entering: false,
        seed: rand(0, 6),
        delay: i * 0.12
      });
    }
  },

  /* 대기 중이던 바로 그 질산염들을 화면 위에서 다시 떨어뜨린다.
     새로 만들지 않는다. */
  release: function(){
    var list = Particles.list;
    if (!list.length){ Particles.spawn(Stages.ION_COUNT); return; }
    var b = playBounds();
    for (var i = 0; i < list.length; i++){
      var p = list[i];
      p.mode = 'active';
      p.entering = true;
      p.x = rand(b.x0 + 60, b.x1 - 60);
      p.y = b.y0 - 90 - i * 78;
      p.vx = rand(-30, 30);
      p.vy = rand(430, 560);
      p.t = 0;
      p.inZone = false;
      p.alpha = 1;
      p.flash = 0;
      p.delay = i * 0.14;
    }
  },

  countInZone: function(){
    var c = 0;
    for (var i = 0; i < Particles.list.length; i++) if (Particles.list[i].inZone) c++;
    return c;
  },

  activeCount: function(){
    var c = 0;
    for (var i = 0; i < Particles.list.length; i++) if (Particles.list[i].mode === 'active') c++;
    return c;
  },

  allInZone: function(){
    var n = Particles.activeCount();
    if (n === 0) return false;
    return Particles.countInZone() === n;
  },

  /* 커서 아래 입자 찾기 — 위에 그려진 것(뒤쪽 인덱스)부터 */
  pick: function(wx, wy){
    for (var i = Particles.list.length - 1; i >= 0; i--){
      var p = Particles.list[i];
      if (p.mode !== 'active' || p.alpha < 0.2) continue;
      var pad = p.r + 8;
      if (dist2(wx, wy, p.x, p.y) <= pad * pad) return p;
    }
    return null;
  },

  beginDrag: function(p, wx, wy){
    Particles.dragging = p;
    p.grabX = p.x - wx;
    p.grabY = p.y - wy;
    Particles.dragTarget.x = wx + p.grabX;
    Particles.dragTarget.y = wy + p.grabY;
    // 맨 위로
    var i = Particles.list.indexOf(p);
    if (i >= 0){ Particles.list.splice(i, 1); Particles.list.push(p); }
  },

  dragTo: function(wx, wy){
    if (!Particles.dragging) return;
    var p = Particles.dragging;
    Particles.dragTarget.x = wx + p.grabX;
    Particles.dragTarget.y = wy + p.grabY;
  },

  endDrag: function(){
    if (Particles.dragging){
      Particles.dragging.vx *= 0.45;
      Particles.dragging.vy *= 0.45;
    }
    Particles.dragging = null;
  },

  fadeOutAll: function(onDone){
    if (Particles.fading) return;
    Particles.fading = true;
    Particles.dragging = null;
    var snapshot = Particles.list.slice();
    for (var i = 0; i < snapshot.length; i++){
      (function(p, idx){
        Tweens.add({
          from: p.alpha, to: 0, dur: 0.42, delay: idx * 0.05,
          ease: Ease.inCubic,
          onUpdate: function(v){ p.alpha = v; p.y -= 0.9; }
        });
      })(snapshot[i], i);
    }
    Tweens.after(0.42 + snapshot.length * 0.05 + 0.05, function(){
      Particles.list.length = 0;
      if (onDone) onDone();
    }, 'ionFade');
  },

  update: function(dt){
    var list = Particles.list, i, j, p, q;
    var z = W.zone;
    var B = playBounds();
    var MR = machineRects();
    var newlyConverted = false;

    for (i = 0; i < list.length; i++){
      p = list[i];

      if (p.delay > 0){ p.delay -= dt; continue; }
      if (!Particles.fading && p.alpha < 1) p.alpha = Math.min(1, p.alpha + dt * 4.5);

      // 화면 위로 벗어난 채 대기 중
      if (p.mode === 'parked') continue;

      // 지하로 내려가는 중 — 조작 대상이 아니다
      if (p.mode === 'descend'){
        p.vy *= Math.pow(0.86, dt);
        p.x += p.vx * dt + Math.sin(p.y * 0.006 + p.seed) * 16 * dt;
        p.y += p.vy * dt;
        // 카메라가 앞질러 화면 위로 나가면 그대로 멈춘다
        if (p.y < S.view.y0 - 30){ p.mode = 'parked'; p.vx = 0; p.vy = 0; }
        continue;
      }

      if (p === Particles.dragging){
        // 커서를 스프링으로 추종 — 살짝의 관성
        var k = 340, d = 2 * Math.sqrt(340);
        p.vx += (k * (Particles.dragTarget.x - p.x) - d * p.vx) * dt;
        p.vy += (k * (Particles.dragTarget.y - p.y) - d * p.vy) * dt;
      } else {
        // 구역 안에 놓인 것은 약하게 붙잡아 둔다.
        // 충돌이나 잔여 속도로 저절로 빠져나가지 않게 하되,
        // 플레이어가 끌어내는 것은 그대로 가능하다.
        if (p.inZone && !Particles.fading){
          var zcx = z.x + z.w / 2, zcy = z.y + z.h / 2;
          p.vx += (zcx - p.x) * 2.0 * dt;
          p.vy += (zcy - p.y) * 2.0 * dt;
        }
        var f = Math.pow(p.entering ? 0.35 : 0.10, dt);
        p.vx *= f;
        p.vy *= f;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.entering && p.y > B.y0 + p.r) p.entering = false;

      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 2.2);
    }

    // 충돌
    for (i = 0; i < list.length; i++){
      for (j = i + 1; j < list.length; j++){
        p = list[i]; q = list[j];
        if (p.delay > 0 || q.delay > 0) continue;
        if (p.mode !== 'active' || q.mode !== 'active') continue;
        if (p.entering !== q.entering) continue;

        var dx = q.x - p.x, dy = q.y - p.y;
        var minD = p.r + q.r;
        var d2 = dx * dx + dy * dy;
        if (d2 <= 0.0001 || d2 >= minD * minD) continue;

        var dd = Math.sqrt(d2);
        var nx = dx / dd, ny = dy / dd;
        var overlap = minD - dd;

        var pFixed = (p === Particles.dragging);
        var qFixed = (q === Particles.dragging);
        var wp = pFixed ? 0 : (qFixed ? 1 : 0.5);
        var wq = qFixed ? 0 : (pFixed ? 1 : 0.5);

        p.x -= nx * overlap * wp;  p.y -= ny * overlap * wp;
        q.x += nx * overlap * wq;  q.y += ny * overlap * wq;

        // 접촉 — 파고드는 속도 성분만 없앤다. 튕기지 않는다.
        var rvx = q.vx - p.vx, rvy = q.vy - p.vy;
        var sep = rvx * nx + rvy * ny;
        if (sep < 0){
          var totalW = wp + wq;
          if (totalW > 0){
            p.vx += nx * sep * (wp / totalW); p.vy += ny * sep * (wp / totalW);
            q.vx -= nx * sep * (wq / totalW); q.vy -= ny * sep * (wq / totalW);
          }
        }
      }
    }

    // 경계 + 구역 판정
    for (i = 0; i < list.length; i++){
      p = list[i];
      if (p.delay > 0 || p.mode !== 'active') continue;

      // 기계는 어느 상태에서든 통과 못 한다
      for (var mi = 0; mi < MR.length; mi++) pushOutOfRect(p, MR[mi], B);

      if (!p.entering){
        // 화면 안쪽으로만. 튕기지 않고 멈춘다.
        var lo, hi;
        lo = B.x0 + p.r; hi = B.x1 - p.r;
        if (lo <= hi){
          if (p.x < lo){ p.x = lo; if (p.vx < 0) p.vx = 0; }
          if (p.x > hi){ p.x = hi; if (p.vx > 0) p.vx = 0; }
        }
        lo = B.y0 + p.r; hi = B.y1 - p.r;
        if (lo <= hi){
          if (p.y < lo){ p.y = lo; if (p.vy < 0) p.vy = 0; }
          if (p.y > hi){ p.y = hi; if (p.vy > 0) p.vy = 0; }
        }
      }

      if (!Particles.fading){
        var wasIn = p.inZone;
        var isIn = (p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h);

        // 한 번 들어온 것은 충돌에 밀려 나가지 않는다.
        // 구역 밖으로 빼내는 것은 플레이어만 할 수 있다.
        if (wasIn && !isIn && p !== Particles.dragging){
          p.x = clamp(p.x, z.x + p.r, z.x + z.w - p.r);
          p.y = clamp(p.y, z.y + p.r, z.y + z.h - p.r);
          p.vx = 0; p.vy = 0;
          isIn = true;
        }

        if (isIn && !wasIn){ p.flash = 1; newlyConverted = true; }
        p.inZone = isIn;

        // 환원 진행도 — 부드럽게
        var target = isIn ? 1 : 0;
        p.t = damp(p.t, target, 0.0009, dt);
        if (Math.abs(p.t - target) < 0.004) p.t = target;
      }
    }

    if (newlyConverted) S.zonePulse = 1;
    S.zonePulse = damp(S.zonePulse, 0, 0.02, dt);
  },

  draw: function(ctx){
    var list = Particles.list;
    for (var i = 0; i < list.length; i++){
      var p = list[i];
      if (p.delay > 0) continue;
      drawIon(ctx, p.x, p.y, p.r, p.t, p.alpha, p.flash);
    }
  }
};
