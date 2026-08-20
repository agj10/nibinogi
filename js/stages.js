/* =========================================================
   stages.js — 스테이지 상태머신
   ========================================================= */

var Stages = {
  current: 'BOOT',
  cam: null,
  playerName: '',

  truth: 0,
  truthA: 0,

  /* 스테이지 내부 상태 */
  _t: 0,
  _drag: null,          // 'bag' | 'reel' | 'ion' | null
  _reelLastAngle: 0,
  _omega: 0,
  _paperTarget: null,
  _collectDone: false,

  ION_COUNT: 5,

  /* 카트리지는 마우스가 돈 각도보다 느리게 돈다 (감속비).
     그래서 목표 속도에 도달하려면 실제로 열심히 돌려야 한다. */
  REEL_GEAR:      0.42,   // 마우스 각도 → 카트리지 각도
  SPIN_TARGET:    4.2,    // 이 각속도(rad/s) 이상을 유지해야 진행
  SPIN_FILL_RATE: 0.40,   // 초당 진행도 (약 2.5초 유지 필요)
  SPIN_DRAIN_RATE:0.55,

  /* ===================================================== */
  init: function(cam){
    Stages.cam = cam;

    UI.onStart = function(name){
      Stages.playerName = name;
      Stages.go('PLANT');
    };
    UI.onSkip    = function(){ Stages.skipToMeasure(); };
    UI.onConfirm = function(){ if (Stages.current === 'MEASURE') Stages.go('RESULT'); };
    UI.onEnd     = function(){ if (Stages.current === 'RESULT') Stages.go('RETURN'); };

    Stages.resetScene();
    cam.snapTo(CAM.MENU.x, CAM.MENU.y, CAM.MENU.z);
    Stages.go('MENU');
  },

  /* ===================================================== */
  resetScene: function(){
    Tweens.killAll();
    Particles.clear();

    for (var i = 0; i < S.plants.length; i++){
      S.plants[i].planted = false;
      S.plants[i].grow = 0;
    }
    S.markerAlpha = 0;
    S.bag.x = 0; S.bag.y = -560; S.bag.angle = 0; S.bag.alpha = 0; S.bag.pouring = false;
    S.bag.vx = 0; S.bag.vy = 0; S.bag.tx = 0; S.bag.ty = -560;
    S.granules.length = 0;
    S.rootIons.length = 0;

    S.machineAlpha = 0;
    S.reelAngle = 0;
    S.reelSpin = 0;
    S.spinGlow = 0;
    S.spinProgress = 0;
    S.motorAlpha = 0;

    S.paperOffset = 0;
    S.paperColor = PAPER_BASE.slice();
    S.paperGlow = 0;

    S.zoneAlpha = 0;
    S.zonePulse = 0;

    Stages._drag = null;
    Stages._omega = 0;
    Stages._collectDone = false;
    Stages._paperTarget = null;
  },

  /* ===================================================== */
  go: function(name){
    Stages.current = name;
    Stages._t = 0;
    Stages._drag = null;
    var cam = Stages.cam;

    switch (name){

      /* ---------------------------------------------- */
      case 'MENU':
        Stages.resetScene();
        cam.moveTo(CAM.MENU.x, CAM.MENU.y, CAM.MENU.z, { stiff: 46, zStiff: 40 });
        UI.showSkip(false);
        UI.showMeasure(false);
        UI.hideResult();
        UI.showMenu();      // 랭킹은 메뉴에서도 계속 떠 있는다
        UI.setHint('');
        UI.setProgress('');
        break;

      /* ---------------------------------------------- */
      case 'PLANT':
        UI.hideMenu();
        cam.moveTo(CAM.PLANT.x, CAM.PLANT.y, CAM.PLANT.z, { stiff: 34, zStiff: 30 });
        Tweens.add({ from: 0, to: 1, dur: .5, delay: .25,
                     onUpdate: function(v){ S.markerAlpha = v; }, tag: 'marker' });
        UI.showSkip(true);
        UI.setHint('표시된 자리를 클릭해 묘목을 심으세요');
        UI.setProgress('0 / 3');
        break;

      /* ---------------------------------------------- */
      case 'FERTILIZE':
        cam.moveTo(CAM.FERTILIZE.x, CAM.FERTILIZE.y, CAM.FERTILIZE.z, { stiff: 34, zStiff: 30 });
        UI.setProgress('');
        S.bag.x = 320; S.bag.y = -640;
        S.bag.tx = 320; S.bag.ty = -350;
        S.bag.vx = 0; S.bag.vy = 0;
        S.bag.angle = 0.12;
        Tweens.add({ from: 0, to: 1, dur: .45, delay: .15,
                     onUpdate: function(v){ S.bag.alpha = v; }, tag: 'bagIn' });
        UI.setHint('비료 봉지를 가운데 작물로 끌어 놓으세요');
        break;

      /* ---------------------------------------------- */
      case 'DESCEND':
        UI.setHint('질산염이 물을 따라 토양 아래로 이동합니다');
        // 느린 스프링 — 하강이 '이동'으로 읽히도록
        cam.moveTo(CAM.DESCEND.x, CAM.DESCEND.y, CAM.DESCEND.z, { stiff: 8, zStiff: 12 });
        Tweens.add({ from: 0, to: 1, dur: .7, delay: 1.1,
                     onUpdate: function(v){ S.machineAlpha = v; }, tag: 'machineIn' });
        Tweens.after(2.4, function(){ Stages.go('SPIN'); }, 'toSpin');
        break;

      /* ---------------------------------------------- */
      case 'SPIN':
        cam.moveTo(CAM.SPIN.x, CAM.SPIN.y, CAM.SPIN.z, { stiff: 26, zStiff: 24 });
        S.machineAlpha = 1;
        Tweens.add({ from: 0, to: 1, dur: .55, delay: .45,
                     onUpdate: function(v){ S.motorAlpha = v; }, tag: 'motorIn' });
        Tweens.add({ from: 0, to: 1, dur: .4, delay: .5,
                     onUpdate: function(v){ S.spinGlow = v; }, tag: 'glowIn' });
        UI.setHint('카트리지를 잡고 돌려 모터를 작동시키세요');
        break;

      /* ---------------------------------------------- */
      case 'COLLECT':
        cam.moveTo(CAM.COLLECT.x, CAM.COLLECT.y, CAM.COLLECT.z, { stiff: 22, zStiff: 20 });
        Tweens.add({ from: S.spinGlow, to: 0, dur: .4,
                     onUpdate: function(v){ S.spinGlow = v; }, tag: 'glowOut' });
        Tweens.add({ from: S.motorAlpha, to: 0, dur: .5,
                     onUpdate: function(v){ S.motorAlpha = v; }, tag: 'motorOut' });
        Tweens.add({ from: 0, to: 1, dur: .5, delay: .35,
                     onUpdate: function(v){ S.zoneAlpha = v; }, tag: 'zoneIn' });
        S.spinProgress = 0;
        Stages._collectDone = false;
        Tweens.after(.5, function(){ Particles.release(); }, 'ionSpawn');
        UI.setHint('질산염을 판정 구역으로 옮기세요');
        UI.setProgress('0 / ' + Stages.ION_COUNT);
        break;

      /* ---------------------------------------------- */
      case 'MEASURE':
        UI.showSkip(false);
        UI.setHint('');
        UI.setProgress('');
        cam.moveTo(CAM.MEASURE.x, CAM.MEASURE.y, CAM.MEASURE.z, { stiff: 20, zStiff: 16 });

        Tweens.add({ from: S.zoneAlpha, to: 0, dur: .35,
                     onUpdate: function(v){ S.zoneAlpha = v; }, tag: 'zoneOut' });
        Tweens.add({ from: S.reelSpin, to: 0, dur: .8, ease: Ease.outCubic,
                     onUpdate: function(v){ S.reelSpin = v; }, tag: 'reelStop' });

        Stages.truth  = rand(TARGET_MIN, TARGET_MAX);
        Stages.truthA = absorbanceAt(Stages.truth);
        UI.setMeasureValue(0);

        Tweens.after(.55, function(){ UI.showMeasure(true); }, 'sliderIn');

        // 슬라이더가 올라온 뒤 발색
        var from = S.paperColor.slice();
        var to   = rgbFromAbsorbance(Stages.truthA);
        Tweens.add({
          from: 0, to: 1, dur: 1.0, delay: 1.0, ease: Ease.outCubic,
          onUpdate: function(v){
            S.paperColor = mixRGB(from, to, v);
            S.paperGlow = v;
          },
          tag: 'develop'
        });
        break;

      /* ---------------------------------------------- */
      case 'RESULT':
        UI.showMeasure(false);
        cam.moveTo(CAM.RESULT.x, CAM.RESULT.y, CAM.RESULT.z, { stiff: 22, zStiff: 18 });

        // 종이는 계속 이송된다
        Tweens.add({ from: 0, to: 1.5, dur: 1.0, delay: .3,
                     onUpdate: function(v){ S.reelSpin = v; }, tag: 'reelResume' });

        // 결과 카드는 네트워크를 기다리지 않고 바로 띄운다.
        // 랭킹 등록은 그동안 뒤에서 진행된다.
        var res = Stages.score(UI.measureValue);
        Stages._lastId = null;

        Tweens.after(.35, function(){ UI.showResult(res); }, 'resIn');
        // 등록이 먼저 끝나면 그 id 로, 아직이면 나중에 다시 그린다.
        Tweens.after(.6,  function(){ UI.showSideRank(Stages._lastId); }, 'rankIn');

        Ranking.submit(res.entry).then(function(id){
          Stages._lastId = id;
          if (Stages.current === 'RESULT') UI.showSideRank(id);
        });
        break;

      /* ---------------------------------------------- */
      case 'RETURN':
        UI.hideResult();
        UI.hideSideRank();
        UI.setHint('');
        // 카메라가 아직 지하에 있는 동안 지상을 미리 비워 둔다.
        // 올라간 뒤 갑자기 사라지는 것이 보이지 않도록.
        for (var ri = 0; ri < S.plants.length; ri++){
          S.plants[ri].planted = false;
          S.plants[ri].grow = 0;
        }
        S.rootIons.length = 0;
        S.granules.length = 0;
        S.bag.alpha = 0;
        S.markerAlpha = 0;
        // 상승과 줌 복원을 동시에
        cam.moveTo(CAM.MENU.x, CAM.MENU.y, CAM.MENU.z, { stiff: 11, zStiff: 11 });
        Tweens.add({ from: S.machineAlpha, to: 0, dur: .6, delay: .3,
                     onUpdate: function(v){ S.machineAlpha = v; }, tag: 'machineOut' });
        Tweens.after(1.9, function(){ Stages.go('MENU'); }, 'toMenu');
        break;
    }
  },

  /* =====================================================
     채점 + 기록
     ===================================================== */
  /* 화면에 띄울 값을 계산한다. 저장은 Ranking.submit 이 맡는다.
     서버도 같은 js/util.js 로 다시 계산하므로 값이 어긋나지 않는다. */
  score: function(guess){
    var guessA = absorbanceAt(guess);
    var absErr = Math.abs(guessA - Stages.truthA);
    var sc = scoreFor(absErr);

    return {
      guess:  guess,
      guessA: guessA,
      truth:  Stages.truth,
      truthA: Stages.truthA,
      absErr: absErr,
      score:  sc,
      entry: {
        name:   Stages.playerName,
        score:  sc,
        conc:   guess,
        truth:  Stages.truth,
        absErr: absErr
      }
    };
  },

  /* =====================================================
     건너뛰기
     ===================================================== */
  skipToMeasure: function(){
    if (Stages.current === 'MEASURE' || Stages.current === 'RESULT' ||
        Stages.current === 'RETURN'  || Stages.current === 'MENU') return;

    Tweens.killAll();
    Particles.clear();

    for (var i = 0; i < S.plants.length; i++){ S.plants[i].planted = true; S.plants[i].grow = 1; }
    S.markerAlpha = 0;
    S.bag.alpha = 0;
    S.granules.length = 0;
    S.rootIons.length = 0;

    S.machineAlpha = 1;
    S.motorAlpha = 0;
    S.spinGlow = 0;
    S.spinProgress = 0;
    S.zoneAlpha = 0;
    S.reelSpin = 1.8;
    S.paperColor = PAPER_BASE.slice();
    S.paperGlow = 0;

    // 카메라가 컷 없이 미끄러져 들어가도록
    Stages.cam.moveTo(CAM.COLLECT.x, CAM.COLLECT.y, CAM.COLLECT.z, { stiff: 9, zStiff: 9 });
    Stages.go('MEASURE');
  },

  /* =====================================================
     업데이트
     ===================================================== */
  update: function(dt){
    Stages._t += dt;
    var i, p;

    /* --- 공통 시뮬레이션 ---
       드래그 중에는 마우스가 준 각도만 반영한다.
       여기서 각속도까지 함께 적분하면 마우스보다 빠르게 돌아간다. */
    if (Stages._drag !== 'reel'){
      S.reelAngle   += S.reelSpin * dt;
      S.paperOffset += S.reelSpin * 62 * dt;
      S.reelSpin *= Math.pow(0.42, dt);
      if (Math.abs(S.reelSpin) < 0.004) S.reelSpin = 0;
    }

    updateGranules(dt);

    // 식물 성장
    for (i = 0; i < S.plants.length; i++){
      p = S.plants[i];
      if (p.planted && p.grow < 1) p.grow = Math.min(1, p.grow + dt * 1.5);
    }

    // 뿌리 잔류 / 하강 질산염
    for (i = S.rootIons.length - 1; i >= 0; i--){
      var ri = S.rootIons[i];
      if (ri.delay > 0){ ri.delay -= dt; continue; }
      if (ri.alpha < 1) ri.alpha = Math.min(1, ri.alpha + dt * 3);
      if (ri.vy){
        ri.y += ri.vy * dt;
        ri.x += Math.sin(ri.y * 0.006 + ri.seed) * 14 * dt;
        if (ri.y > 1000) ri.alpha -= dt * 1.2;
        if (ri.alpha <= 0) S.rootIons.splice(i, 1);
      }
    }

    // 봉지
    if (S.bag.alpha > 0.01 && !S.bag.pouring){
      var k = 190, d = 2 * Math.sqrt(190);
      S.bag.vx += (k * (S.bag.tx - S.bag.x) - d * S.bag.vx) * dt;
      S.bag.vy += (k * (S.bag.ty - S.bag.y) - d * S.bag.vy) * dt;
      S.bag.x += S.bag.vx * dt;
      S.bag.y += S.bag.vy * dt;
      S.bag.angle = damp(S.bag.angle, clamp(S.bag.vx * 0.0016, -.28, .28), 0.002, dt);
    }

    Particles.update(dt);

    /* --- 스테이지별 --- */
    switch (Stages.current){

      case 'PLANT':
        var n = 0;
        for (i = 0; i < S.plants.length; i++) if (S.plants[i].planted) n++;
        UI.setProgress(n + ' / 3');
        if (n === 3 && !Stages._advancing){
          Stages._advancing = true;
          Tweens.after(.8, function(){
            Stages._advancing = false;
            if (Stages.current === 'PLANT') Stages.go('FERTILIZE');
          }, 'toFert');
        }
        break;

      case 'SPIN':
        // 진행도 — 마우스가 아니라 카트리지가 실제로 도는 속도로 판정
        var reelOmega = Math.abs(Stages._omega) * Stages.REEL_GEAR;
        var fast = reelOmega > Stages.SPIN_TARGET;
        S.spinProgress = clamp(S.spinProgress +
          (fast ? dt * Stages.SPIN_FILL_RATE : -dt * Stages.SPIN_DRAIN_RATE), 0, 1);
        if (Stages._drag !== 'reel') Stages._omega *= Math.pow(0.25, dt);
        if (S.spinProgress >= 1 && !Stages._advancing){
          Stages._advancing = true;
          S.reelSpin = Math.max(Math.abs(S.reelSpin), 2.2);
          Tweens.add({ from: S.reelSpin, to: 1.8, dur: .8,
                       onUpdate: function(v){ S.reelSpin = v; }, tag: 'reelSettle' });
          Tweens.after(.5, function(){
            Stages._advancing = false;
            if (Stages.current === 'SPIN') Stages.go('COLLECT');
          }, 'toCollect');
        }
        break;

      case 'COLLECT':
        S.reelSpin = damp(S.reelSpin, 1.8, 0.05, dt);
        if (!Stages._collectDone && Particles.list.length){
          UI.setProgress(Particles.countInZone() + ' / ' + Particles.list.length);
          if (Particles.allInZone()){
            Stages._collectDone = true;
            UI.setHint('환원된 아질산염이 종이에서 발색합니다');
            Tweens.after(.7, function(){
              Particles.fadeOutAll(function(){
                if (Stages.current === 'COLLECT') Stages.go('MEASURE');
              });
              UI.setProgress('');
            }, 'collectDone');
          }
        }
        break;

      case 'RESULT':
        S.reelSpin = damp(S.reelSpin, 1.5, 0.2, dt);
        break;
    }
  },

  /* =====================================================
     입력
     ===================================================== */
  onDown: function(w){
    var st = Stages.current, i, p;

    if (st === 'PLANT'){
      for (i = 0; i < S.plants.length; i++){
        p = S.plants[i];
        if (p.planted) continue;
        if (Math.abs(w.x - p.x) < 78 && w.y > -80 && w.y < 62){
          p.planted = true;
          p.grow = 0;
          Tweens.add({ from: 0, to: 1, dur: .75, ease: Ease.outBack,
                       onUpdate: function(v){ p.grow = v; } });
          return;
        }
      }
      return;
    }

    if (st === 'FERTILIZE'){
      if (S.bag.pouring) return;
      if (Math.abs(w.x - S.bag.x) < 76 && Math.abs(w.y - S.bag.y) < 96){
        Stages._drag = 'bag';
        Stages._grabX = S.bag.x - w.x;
        Stages._grabY = S.bag.y - w.y;
      }
      return;
    }

    if (st === 'SPIN'){
      var R = W.machine.reelR;
      var d = Math.sqrt(dist2(w.x, w.y, R.x, R.y));
      if (d > 26 && d < R.r + 30){
        Stages._drag = 'reel';
        Stages._reelLastAngle = Math.atan2(w.y - R.y, w.x - R.x);
      }
      return;
    }

    if (st === 'COLLECT'){
      var ion = Particles.pick(w.x, w.y);
      if (ion){ Stages._drag = 'ion'; Particles.beginDrag(ion, w.x, w.y); }
      return;
    }
  },

  onMove: function(w, dt){
    if (!Stages._drag) return;

    if (Stages._drag === 'bag'){
      S.bag.tx = clamp(w.x + Stages._grabX, -700, 700);
      S.bag.ty = clamp(w.y + Stages._grabY, -700, -60);

      // 작물 오른쪽 위로 가져오면 살포가 시작된다
      var target = { x: W.plantX[1] + 190, y: -285 };
      if (dist2(S.bag.x, S.bag.y, target.x, target.y) < 150 * 150){
        Stages.startPour();
      }
      return;
    }

    if (Stages._drag === 'reel'){
      var R = W.machine.reelR;
      var a = Math.atan2(w.y - R.y, w.x - R.x);
      var da = a - Stages._reelLastAngle;
      while (da >  Math.PI) da -= 6.2832;
      while (da < -Math.PI) da += 6.2832;
      Stages._reelLastAngle = a;

      var geared = da * Stages.REEL_GEAR;
      S.reelAngle   += geared;
      S.paperOffset += geared * 62;

      var inst = da / Math.max(dt, 0.001);
      Stages._omega = Stages._omega * 0.72 + inst * 0.28;
      // 손을 뗐을 때 이어질 관성
      S.reelSpin = clamp(Stages._omega * Stages.REEL_GEAR, -8, 8);
      return;
    }

    if (Stages._drag === 'ion'){
      Particles.dragTo(w.x, w.y);
      return;
    }
  },

  onUp: function(){
    if (Stages._drag === 'ion') Particles.endDrag();
    Stages._drag = null;
  },

  /* ===================================================== */
  startPour: function(){
    if (S.bag.pouring) return;
    S.bag.pouring = true;
    Stages._drag = null;
    UI.setHint('');

    var px = W.plantX[1] + 200;

    Tweens.add({ from: S.bag.angle, to: -1.0, dur: .55, ease: Ease.outCubic,
                 onUpdate: function(v){ S.bag.angle = v; }, tag: 'tilt' });
    Tweens.add({ from: S.bag.x, to: px, dur: .55, ease: Ease.outCubic,
                 onUpdate: function(v){ S.bag.x = v; }, tag: 'bagX' });
    Tweens.add({ from: S.bag.y, to: -300, dur: .55, ease: Ease.outCubic,
                 onUpdate: function(v){ S.bag.y = v; }, tag: 'bagY' });

    // 알갱이는 기울어진 봉지 입구에서 나온다
    var pours = 0;
    var pourTick = function(){
      var sp = bagSpout();
      spawnGranules(sp.x, sp.y, 5);
      pours++;
      if (pours < 13) Tweens.after(.09, pourTick, 'pour' + pours);
    };
    Tweens.after(.55, pourTick, 'pourStart');

    // 봉지 정리 + 질산염 생성
    Tweens.after(1.9, function(){
      Tweens.add({ from: 1, to: 0, dur: .45,
                   onUpdate: function(v){ S.bag.alpha = v; }, tag: 'bagOut' });
      Stages.spawnNitrate();
    }, 'pourEnd');

    Tweens.after(3.1, function(){
      if (Stages.current === 'FERTILIZE') Stages.go('DESCEND');
    }, 'toDescend');
  },

  spawnNitrate: function(){
    var px = W.plantX[1];

    // 작물이 흡수해 뿌리에 남는 것 — 장식
    for (var i = 0; i < 3; i++){
      S.rootIons.push({
        x: px + rand(-70, 70), y: rand(46, 118),
        r: 24, alpha: 0, vy: 0, delay: i * 0.1, seed: rand(0, 6)
      });
    }

    // 아래로 내려가는 것 — 나중에 판정 구역에서 모을 바로 그 입자들
    Particles.spawnDescending(Stages.ION_COUNT, px, 70);
  }
};

Stages._advancing = false;
Stages._lastId = null;
Stages._grabX = 0;
Stages._grabY = 0;
