(function(){
  function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }

  async function waitForApp(){
    for(var i=0;i<100;i++){
      if(window.DATA && Array.isArray(window.DATA.matches) && typeof window.renderMatches === 'function' && typeof window.renderScorers === 'function') return true;
      await wait(100);
    }
    return false;
  }

  function mergeScorerData(payload){
    if(!payload || !Array.isArray(payload.matches) || !window.DATA || !Array.isArray(window.DATA.matches)) return 0;
    var byMatch = {};
    window.DATA.matches.forEach(function(m){ byMatch[String(m.matchNumber)] = m; });
    var count = 0;
    payload.matches.forEach(function(row){
      var m = byMatch[String(row.matchNumber)];
      if(!m) return;
      if(Array.isArray(row.goals)) { m.goals = row.goals; count += row.goals.length; }
      if(row.homeScorers) m.homeScorers = row.homeScorers;
      if(row.awayScorers) m.awayScorers = row.awayScorers;
      if(row.scorers) m.scorers = row.scorers;
    });
    if(payload.generatedAt && window.DATA.meta) window.DATA.meta.scorersGeneratedAt = payload.generatedAt;
    return count;
  }

  async function loadScorers(){
    var ready = await waitForApp();
    if(!ready) return;
    try{
      var res = await fetch('data/scorers.json', {cache:'no-store'});
      if(!res.ok) return;
      var payload = await res.json();
      var count = mergeScorerData(payload);
      if(count){
        window.renderMatches();
        window.renderScorers();
        window.dispatchEvent(new CustomEvent('vmScorersLoaded'));
      }
    } catch(e){
      console.warn('Målscorerdata kunne ikke hentes', e);
    }
  }

  loadScorers();
})();
