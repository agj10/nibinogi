/* =========================================================
   ui.js — DOM 오버레이 전체
   ========================================================= */

var UI = {
  el: {},

  /* stages.js 가 붙이는 콜백 */
  onStart:   null,
  onSkip:    null,
  onConfirm: null,
  onEnd:     null,

  measureValue: 0,
  _dragging: false,
  _hintText: '',
  _hintTimer: null,

  /* ===================================================== */
  init: function(){
    var $ = function(id){ return document.getElementById(id); };
    var e = UI.el;

    e.menu        = $('menu');
    e.nameInput   = $('nameInput');
    e.startBtn    = $('startBtn');
    e.nameHint    = $('nameHint');

    e.hintBar     = $('hintBar');
    e.hintText    = $('hintText');
    e.progressPill= $('progressPill');
    e.progressText= $('progressText');
    e.skipBtn     = $('skipBtn');

    e.measure     = $('measure');
    e.track       = $('track');
    e.handle      = $('handle');
    e.handleKnob  = $('handleKnob');
    e.trackFill   = $('trackFill');
    e.valInput    = $('valInput');
    e.confirmBtn  = $('confirmBtn');
    e.refRow      = $('refRow');

    e.result      = $('result');
    e.rcSwatchGuess = $('rcSwatchGuess');
    e.rcConcGuess   = $('rcConcGuess');
    e.rcAbsGuess    = $('rcAbsGuess');
    e.rcSwatchTruth = $('rcSwatchTruth');
    e.rcConcTruth   = $('rcConcTruth');
    e.rcAbsTruth    = $('rcAbsTruth');
    e.rcErr       = $('rcErr');
    e.rcScore     = $('rcScore');
    e.endBtn      = $('endBtn');

    e.sideRank    = $('sideRank');
    e.rankListSide= $('rankListSide');
    e.sideRankCount = $('sideRankCount');

    e.adminModal  = $('adminModal');
    e.adminBox    = $('adminBox');
    e.adminPw     = $('adminPw');
    e.adminOk     = $('adminOk');
    e.adminCancel = $('adminCancel');

    UI.buildRefs();
    UI.bindMenu();
    UI.bindSlider();
    UI.bindButtons();
    UI.bindAdmin();
    UI.setMeasureValue(0);
  },

  /* ===================================================== */
  bindMenu: function(){
    var e = UI.el;

    // 중복 검사는 서버에 물어보므로 비동기다.
    // 확인이 끝나기 전에는 시작 버튼을 잠가 둔다.
    var timer = null;

    var setState = function(ok, msg, error){
      e.startBtn.disabled = !ok;
      UI.setNameHint(msg || '');
      e.nameInput.classList.toggle('is-error', !!error);
      UI._nameOK = ok;
    };

    var validate = function(){
      clearTimeout(timer);
      var n = Ranking.normalize(e.nameInput.value);

      if (!n){ setState(false, '', false); return; }
      if (n.length < 1){ setState(false, '', false); return; }

      setState(false, '확인 중…', false);
      timer = setTimeout(function(){
        Ranking.checkName(n).then(function(r){
          // 그 사이 더 입력했으면 이 결과는 버린다
          if (!Ranking.isLatestCheck(r.seq)) return;
          if (Ranking.normalize(e.nameInput.value) !== n) return;
          if (r.taken) setState(false, '이미 등록된 이름입니다', true);
          else         setState(true, '', false);
        });
      }, 280);
    };

    UI.validateName = validate;
    UI._nameOK = false;

    e.nameInput.addEventListener('input', validate);
    e.nameInput.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' && UI._nameOK) UI.startPressed();
    });
    e.startBtn.addEventListener('click', function(){
      if (UI._nameOK) UI.startPressed();
      else {
        e.nameInput.classList.remove('shake');
        void e.nameInput.offsetWidth;
        e.nameInput.classList.add('shake');
        e.nameInput.focus();
      }
    });
  },

  startPressed: function(){
    var name = Ranking.normalize(UI.el.nameInput.value);
    if (!name || !UI._nameOK) return;
    if (UI.onStart) UI.onStart(name);
  },

  setNameHint: function(txt){
    UI.el.nameHint.textContent = txt;
    UI.el.nameHint.classList.toggle('is-on', !!txt);
  },

  renderRank: function(listEl, countEl, highlightId){
    var list = Ranking.sorted();
    if (countEl){
      var label = list.length ? list.length + '명' : '';
      if (!Ranking.isOnline()) label = (label ? label + ' · ' : '') + '이 기기에만 저장';
      countEl.textContent = label;
    }

    if (!list.length){
      listEl.innerHTML = '<div class="rank-empty">아직 기록이 없습니다</div>';
      return;
    }

    var html = '', i, r, left;
    for (i = 0; i < list.length; i++){
      r = list[i];
      if (i < 3){
        left = '<div class="medal medal-' + (i + 1) + '">' + (i + 1) + '</div>';
      } else {
        left = '<div class="rank-num">' + (i + 1) + '</div>';
      }
      var me = (highlightId != null && String(r.id) === String(highlightId)) ? ' is-me' : '';
      var sw = colorForConc(r.conc !== undefined ? r.conc : 0);
      html += '<div class="rank-row' + me + '" data-id="' + r.id + '">'
            +   left
            +   '<div class="rank-name">' + UI.escape(r.name) + '</div>'
            +   '<div class="rank-swatch" style="background:' + sw + '"></div>'
            +   '<div class="rank-score">' + Number(r.score).toFixed(1) + '%</div>'
            + '</div>';
    }
    listEl.innerHTML = html;

    if (highlightId != null){
      var row = listEl.querySelector('.rank-row.is-me');
      if (row){
        setTimeout(function(){
          var top = row.offsetTop - listEl.clientHeight / 2 + row.offsetHeight / 2;
          listEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }, 420);
      }
    }
  },

  escape: function(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  },

  /* ===================================================== */
  bindSlider: function(){
    var e = UI.el;

    var valueFromEvent = function(ev){
      var rect = e.track.getBoundingClientRect();
      var p = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
      return CONC_MIN + (CONC_MAX - CONC_MIN) * p;
    };

    var pendingX = null, rafId = 0;

    var flush = function(){
      rafId = 0;
      if (pendingX === null) return;
      UI.setMeasureValue(pendingX);
      pendingX = null;
    };

    var onDown = function(ev){
      if (ev.target === e.valInput) return;
      ev.preventDefault();
      UI._dragging = true;
      // 드래그 중에는 트랜지션을 꺼서 커서를 그대로 따라가게 한다
      e.handle.classList.add('is-dragging');
      e.handleKnob.classList.add('is-drag');
      UI.setMeasureValue(valueFromEvent(ev));
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    var onMove = function(ev){
      if (!UI._dragging) return;
      // 프레임당 한 번만 반영 — pointermove 가 프레임보다 잦아도 끊기지 않는다
      pendingX = valueFromEvent(ev);
      if (!rafId) rafId = requestAnimationFrame(flush);
    };
    var onUp = function(){
      UI._dragging = false;
      if (rafId){ cancelAnimationFrame(rafId); rafId = 0; }
      flush();
      e.handle.classList.remove('is-dragging');
      e.handleKnob.classList.remove('is-drag');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    e.track.addEventListener('pointerdown', onDown);

    // 직접 입력
    e.valInput.addEventListener('input', function(){
      var v = parseFloat(e.valInput.value);
      if (isNaN(v)) return;
      UI.setMeasureValue(clamp(v, CONC_MIN, CONC_MAX), true);
    });
    e.valInput.addEventListener('focus', function(){ e.valInput.select(); });
    e.valInput.addEventListener('blur', function(){
      e.valInput.value = fmtConc(UI.measureValue);
    });
    e.valInput.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter'){ e.valInput.blur(); }
      ev.stopPropagation();
    });
  },

  /* 실제 실험에서 만든 표준용액 농도를 색 견본으로 늘어놓는다.
     슬라이더 자체에는 색을 두지 않는다. */
  buildRefs: function(){
    var pts = REF_CONCS.filter(function(c){
      return c >= CONC_MIN && c <= CONC_MAX;
    });
    var html = '';
    for (var i = 0; i < pts.length; i++){
      var c = pts[i];
      var pct = invLerp(CONC_MIN, CONC_MAX, c) * 100;
      html += '<div class="ref" data-c="' + c + '" style="left:' + pct + '%">'
            +   '<span class="ref-swatch" style="background:' + colorForConc(c) + '"></span>'
            +   '<span class="ref-label">' + c + '</span>'
            + '</div>';
    }
    UI.el.refRow.innerHTML = html;

    // 견본을 누르면 그 농도로 맞춘다
    UI.el.refRow.addEventListener('pointerdown', function(ev){
      var el = ev.target.closest ? ev.target.closest('.ref') : null;
      if (!el) return;
      ev.preventDefault();
      UI.setMeasureValue(parseFloat(el.getAttribute('data-c')));
    });
  },

  /* fromInput 이면 입력창 텍스트를 덮어쓰지 않는다 */
  setMeasureValue: function(v, fromInput){
    v = clamp(v, CONC_MIN, CONC_MAX);
    UI.measureValue = v;

    var pct = invLerp(CONC_MIN, CONC_MAX, v) * 100;
    UI.el.handle.style.left = pct + '%';
    UI.el.trackFill.style.width = pct + '%';
    if (!fromInput) UI.el.valInput.value = fmtConc(v);
  },

  /* ===================================================== */
  bindButtons: function(){
    UI.el.skipBtn.addEventListener('click', function(){ if (UI.onSkip) UI.onSkip(); });
    UI.el.confirmBtn.addEventListener('click', function(){ if (UI.onConfirm) UI.onConfirm(); });
    UI.el.endBtn.addEventListener('click', function(){ if (UI.onEnd) UI.onEnd(); });
  },

  /* ===================================================== */
  bindAdmin: function(){
    var e = UI.el;

    window.addEventListener('keydown', function(ev){
      if (ev.ctrlKey && ev.altKey && (ev.key === 'd' || ev.key === 'D' || ev.code === 'KeyD')){
        if (Stages.current !== 'MENU') return;
        ev.preventDefault();
        UI.openAdmin();
      }
      if (ev.key === 'Escape' && e.adminModal.classList.contains('is-in')) UI.closeAdmin();
    });

    e.adminCancel.addEventListener('click', UI.closeAdmin);
    e.adminOk.addEventListener('click', UI.tryAdmin);
    e.adminPw.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter') UI.tryAdmin();
      ev.stopPropagation();
    });
    e.adminModal.addEventListener('pointerdown', function(ev){
      if (ev.target === e.adminModal) UI.closeAdmin();
    });
  },

  openAdmin: function(){
    UI.el.adminPw.value = '';
    UI.el.adminModal.classList.add('is-in');
    setTimeout(function(){ UI.el.adminPw.focus(); }, 60);
  },

  closeAdmin: function(){
    UI.el.adminModal.classList.remove('is-in');
  },

  tryAdmin: function(){
    var pw = UI.el.adminPw.value;
    UI.el.adminOk.disabled = true;
    Ranking.clearAll(pw).then(function(ok){
      UI.el.adminOk.disabled = false;
      if (ok){
        UI.renderRank(UI.el.rankListSide, UI.el.sideRankCount, null);
        if (UI.validateName) UI.validateName();
        UI.closeAdmin();
      } else {
        UI.el.adminBox.classList.remove('shake');
        void UI.el.adminBox.offsetWidth;
        UI.el.adminBox.classList.add('shake');
        UI.el.adminPw.value = '';
        UI.el.adminPw.focus();
      }
    });
  },

  /* 온라인/오프라인 표시 갱신 */
  updateRankMode: function(){
    UI.renderRank(UI.el.rankListSide, UI.el.sideRankCount, null);
  },

  /* =====================================================
     표시 토글
     ===================================================== */
  showMenu: function(){
    // 다음 사람이 바로 이어서 하도록 이름은 비워 둔다
    UI.el.nameInput.value = '';
    UI._nameOK = false;
    UI.el.startBtn.disabled = true;
    UI.el.menu.classList.add('is-in');
    UI.showSideRank(null);
    // 다른 노트북에서 올라온 기록을 반영한다
    Ranking.refresh().then(function(){ UI.showSideRank(null); });
  },
  hideMenu: function(){
    UI.el.menu.classList.remove('is-in');
    UI.hideSideRank();
  },

  setHint: function(txt){
    if (txt === UI._hintText) return;
    UI._hintText = txt;
    var e = UI.el;
    clearTimeout(UI._hintTimer);

    if (!txt){ e.hintBar.classList.remove('is-in'); return; }

    if (e.hintBar.classList.contains('is-in')){
      e.hintBar.classList.remove('is-in');
      UI._hintTimer = setTimeout(function(){
        e.hintText.textContent = txt;
        e.hintBar.classList.add('is-in');
      }, 220);
    } else {
      e.hintText.textContent = txt;
      e.hintBar.classList.add('is-in');
    }
  },

  setProgress: function(txt){
    var e = UI.el;
    if (!txt){ e.progressPill.classList.remove('is-in'); return; }
    e.progressText.textContent = txt;
    e.progressPill.classList.add('is-in');
  },

  showSkip: function(on){ UI.el.skipBtn.classList.toggle('is-in', !!on); },

  showMeasure: function(on){ UI.el.measure.classList.toggle('is-in', !!on); },

  showResult: function(data){
    var e = UI.el;
    e.rcSwatchGuess.style.background = colorForConc(data.guess);
    e.rcConcGuess.textContent = fmtConc(data.guess) + ' mg/L';
    e.rcAbsGuess.textContent  = 'A = ' + fmtAbs(data.guessA);

    e.rcSwatchTruth.style.background = colorForConc(data.truth);
    e.rcConcTruth.textContent = fmtConc(data.truth) + ' mg/L';
    e.rcAbsTruth.textContent  = 'A = ' + fmtAbs(data.truthA);

    e.rcErr.textContent   = fmtAbs(data.absErr);
    e.rcScore.textContent = data.score.toFixed(1) + '%';

    e.result.classList.add('is-in');
  },
  hideResult: function(){ UI.el.result.classList.remove('is-in'); },

  showSideRank: function(highlightId){
    UI.renderRank(UI.el.rankListSide, UI.el.sideRankCount, highlightId);
    UI.el.sideRank.classList.add('is-in');
  },
  hideSideRank: function(){ UI.el.sideRank.classList.remove('is-in'); }
};
