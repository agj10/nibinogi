/* =========================================================
   ranking.js — localStorage 랭킹

   정렬: 점수 내림차순 → 흡광도 오차 오름차순 → 먼저 기록한 순
   ========================================================= */

var Ranking = {
  KEY: 'nibinogi.ranking.v1',
  ADMIN_PW: 'dubai123',

  load: function(){
    try {
      var raw = localStorage.getItem(Ranking.KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e){
      return [];
    }
  },

  save: function(list){
    try { localStorage.setItem(Ranking.KEY, JSON.stringify(list)); }
    catch (e){ /* 저장 불가여도 플레이는 계속된다 */ }
  },

  sorted: function(){
    var list = Ranking.load();
    list.sort(function(a, b){
      if (b.score !== a.score) return b.score - a.score;
      if (a.absErr !== b.absErr) return a.absErr - b.absErr;
      return a.ts - b.ts;
    });
    return list;
  },

  normalize: function(name){
    return String(name || '').trim().replace(/\s+/g, ' ');
  },

  exists: function(name){
    var n = Ranking.normalize(name).toLowerCase();
    if (!n) return false;
    var list = Ranking.load();
    for (var i = 0; i < list.length; i++){
      if (Ranking.normalize(list[i].name).toLowerCase() === n) return true;
    }
    return false;
  },

  add: function(entry){
    var list = Ranking.load();
    list.push(entry);
    Ranking.save(list);
    return entry;
  },

  clearAll: function(){
    try { localStorage.removeItem(Ranking.KEY); } catch (e){}
  }
};
