/* =========================================================
   ranking.js — 랭킹 저장소

   서버(Postgres)를 기본으로 쓰되, 서버에 닿지 않으면
   그 노트북의 localStorage 로 떨어진다.
   부스에서 Wi-Fi 가 끊겨도 게임은 계속 돌아가야 한다.

   목록은 cache 에 담아 두고 화면은 동기적으로 그린다.
   갱신은 refresh() 로 비동기 처리한다.
   ========================================================= */

var Ranking = {
  KEY: 'nibinogi.ranking.v1',
  ADMIN_PW: 'dubai123',

  mode: 'local',      // 'server' | 'local'
  cache: [],          // 화면에 그릴 목록
  _checkSeq: 0,

  /* ===================================================== */
  isOnline: function(){ return Ranking.mode === 'server'; },

  _fail: function(where, e){
    if (Ranking.mode === 'server'){
      console.warn('[ranking] 서버 연결 실패 (' + where + ') → 로컬 저장으로 전환합니다', e && e.message);
      Ranking.mode = 'local';
      if (UI && UI.updateRankMode) UI.updateRankMode();
    }
  },

  _fetch: function(url, opt){
    opt = opt || {};
    opt.cache = 'no-store';
    // 부스에서 응답이 없을 때 무한정 기다리지 않는다
    if (typeof AbortController === 'function'){
      var ac = new AbortController();
      opt.signal = ac.signal;
      setTimeout(function(){ ac.abort(); }, 4000);
    }
    return fetch(url, opt).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  },

  /* 시작 시 한 번 — 서버가 살아 있고 DB 가 붙어 있는지 */
  init: function(){
    return Ranking._fetch('/api/health').then(function(j){
      Ranking.mode = (j && j.ok && j.db) ? 'server' : 'local';
    }).catch(function(){
      Ranking.mode = 'local';
    }).then(function(){
      return Ranking.refresh();
    });
  },

  /* ===================================================== */
  refresh: function(){
    if (Ranking.mode === 'server'){
      return Ranking._fetch('/api/ranking').then(function(j){
        Ranking.cache = (j && j.list) || [];
        return Ranking.cache;
      }).catch(function(e){
        Ranking._fail('refresh', e);
        Ranking.cache = Ranking._localSorted();
        return Ranking.cache;
      });
    }
    Ranking.cache = Ranking._localSorted();
    return Promise.resolve(Ranking.cache);
  },

  /* 렌더용 — 항상 동기 */
  sorted: function(){ return Ranking.cache; },

  /* ===================================================== */
  normalize: function(name){
    return String(name || '').trim().replace(/\s+/g, ' ');
  },

  /* 이름 중복 검사 — 비동기.
     늦게 도착한 응답이 최신 입력을 덮어쓰지 않도록 seq 로 거른다. */
  checkName: function(name){
    var n = Ranking.normalize(name);
    var seq = ++Ranking._checkSeq;

    if (!n) return Promise.resolve({ seq: seq, taken: false });

    if (Ranking.mode === 'server'){
      return Ranking._fetch('/api/name?n=' + encodeURIComponent(n))
        .then(function(j){ return { seq: seq, taken: !!(j && j.taken) }; })
        .catch(function(e){
          Ranking._fail('checkName', e);
          return { seq: seq, taken: Ranking._localTaken(n) };
        });
    }
    return Promise.resolve({ seq: seq, taken: Ranking._localTaken(n) });
  },

  isLatestCheck: function(seq){ return seq === Ranking._checkSeq; },

  /* ===================================================== */
  /* 점수 등록. 서버가 점수를 다시 계산해 저장한다. */
  submit: function(entry){
    if (Ranking.mode === 'server'){
      return Ranking._fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:  entry.name,
          conc:  entry.conc,
          truth: entry.truth
        })
      }).then(function(j){
        return Ranking.refresh().then(function(){ return j.id; });
      }).catch(function(e){
        Ranking._fail('submit', e);
        return Ranking._localAdd(entry);
      });
    }
    return Promise.resolve(Ranking._localAdd(entry));
  },

  /* ===================================================== */
  clearAll: function(pw){
    if (Ranking.mode === 'server'){
      return Ranking._fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pw: pw })
      }).then(function(){
        Ranking._localClear();
        return Ranking.refresh().then(function(){ return true; });
      }).catch(function(e){
        if (e && /403/.test(e.message)) return false;   // 비밀번호 틀림
        Ranking._fail('reset', e);
        Ranking._localClear();
        return Ranking.refresh().then(function(){ return true; });
      });
    }
    if (pw !== Ranking.ADMIN_PW) return Promise.resolve(false);
    Ranking._localClear();
    return Ranking.refresh().then(function(){ return true; });
  },

  /* =====================================================
     localStorage 폴백
     ===================================================== */
  _localLoad: function(){
    try {
      var raw = localStorage.getItem(Ranking.KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e){ return []; }
  },

  _localSave: function(list){
    try { localStorage.setItem(Ranking.KEY, JSON.stringify(list)); } catch (e){}
  },

  _localSorted: function(){
    var list = Ranking._localLoad();
    list.sort(function(a, b){
      if (b.score !== a.score) return b.score - a.score;
      if (a.absErr !== b.absErr) return a.absErr - b.absErr;
      return a.id - b.id;
    });
    return list;
  },

  _localTaken: function(n){
    var key = n.toLowerCase();
    var list = Ranking._localLoad();
    for (var i = 0; i < list.length; i++){
      if (Ranking.normalize(list[i].name).toLowerCase() === key) return true;
    }
    return false;
  },

  _localAdd: function(entry){
    var list = Ranking._localLoad();
    entry.id = Date.now();
    list.push(entry);
    Ranking._localSave(list);
    Ranking.cache = Ranking._localSorted();
    return entry.id;
  },

  _localClear: function(){
    try { localStorage.removeItem(Ranking.KEY); } catch (e){}
  }
};
