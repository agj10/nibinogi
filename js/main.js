/* =========================================================
   main.js — 부트스트랩, 렌더 루프, 포인터 입력
   ========================================================= */

(function(){

  var canvas, ctx, cam;
  var cw = 0, ch = 0, dpr = 1;
  var lastT = 0, lastMoveT = 0;

  /* ===================================================== */
  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width  = cw + 'px';
    canvas.style.height = ch + 'px';
  }

  /* ===================================================== */
  function toWorld(ev){
    var rect = canvas.getBoundingClientRect();
    return cam.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top, cw, ch);
  }

  function hoverCursor(w){
    var st = Stages.current, i, p;

    if (st === 'PLANT'){
      for (i = 0; i < S.plants.length; i++){
        p = S.plants[i];
        if (!p.planted && Math.abs(w.x - p.x) < 78 && w.y > -80 && w.y < 62) return 'pointer';
      }
      return 'default';
    }
    if (st === 'FERTILIZE'){
      if (!S.bag.pouring && S.bag.alpha > .5 &&
          Math.abs(w.x - S.bag.x) < 76 && Math.abs(w.y - S.bag.y) < 96) return 'grab';
      return 'default';
    }
    if (st === 'SPIN'){
      var R = W.machine.reelR;
      var d = Math.sqrt(dist2(w.x, w.y, R.x, R.y));
      if (d > 26 && d < R.r + 30) return 'grab';
      return 'default';
    }
    if (st === 'COLLECT'){
      return Particles.pick(w.x, w.y) ? 'grab' : 'default';
    }
    return 'default';
  }

  /* ===================================================== */
  function bindPointer(){
    canvas.addEventListener('pointerdown', function(ev){
      ev.preventDefault();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e){}
      lastMoveT = performance.now();
      Stages.onDown(toWorld(ev));
      canvas.style.cursor = Stages._drag ? 'grabbing' : canvas.style.cursor;
    });

    canvas.addEventListener('pointermove', function(ev){
      var now = performance.now();
      var dt = clamp((now - lastMoveT) / 1000, 0.001, 0.1);
      lastMoveT = now;
      var w = toWorld(ev);

      if (Stages._drag){
        Stages.onMove(w, dt);
        canvas.style.cursor = 'grabbing';
      } else {
        canvas.style.cursor = hoverCursor(w);
      }
    });

    var up = function(ev){
      Stages.onUp();
      canvas.style.cursor = hoverCursor(toWorld(ev));
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('blur', function(){ Stages.onUp(); });
  }

  /* ===================================================== */
  function frame(now){
    requestAnimationFrame(frame);

    if (!lastT) lastT = now;
    var dt = clamp((now - lastT) / 1000, 0, 1 / 20);
    lastT = now;

    S.t += dt;
    S.view = cam.viewBounds(cw, ch);   // 입자가 화면 밖으로 나갔는지 판정용

    Tweens.update(dt);
    Stages.update(dt);
    cam.update(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    ctx.save();
    cam.apply(ctx, cw, ch);
    renderScene(ctx, cam, cw, ch);
    ctx.restore();
  }

  /* ===================================================== */
  function boot(){
    canvas = document.getElementById('scene');
    ctx = canvas.getContext('2d');
    cam = new Camera();

    resize();
    window.addEventListener('resize', resize);

    UI.init();
    Stages.init(cam);

    // 서버가 살아 있는지 확인하고 랭킹을 받아온다.
    // 실패하면 이 노트북의 localStorage 로 동작한다.
    Ranking.init().then(function(){
      UI.showSideRank(null);
      if (UI.validateName) UI.validateName();
      console.log('[ranking] 모드:', Ranking.mode);
    });
    bindPointer();

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
