(function(){
  function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  async function waitForApp(){
    for(var i=0;i<120;i++){
      if(window.DATA && Array.isArray(window.DATA.matches) && typeof window.renderMatches === 'function' && typeof window.renderScorers === 'function') return true;
      await wait(100);
    }
    return false;
  }
  function merge(payload){
    if(!payload || !Array.isArray(payload.matches) || !window.DATA) return 0;
    var byMatch={};
    window.DATA.matches.forEach(function(m){ byMatch[String(m.matchNumber)] = m; });
    var changed=0;
    payload.matches.forEach(function(row){
      var m=byMatch[String(row.matchNumber)];
      if(!m) return;
      if(row.status && row.status !== m.status){ m.status=row.status; changed++; }
      if(row.homeScore !== undefined && row.homeScore !== null && row.homeScore !== m.homeScore){ m.homeScore=row.homeScore; changed++; }
      if(row.awayScore !== undefined && row.awayScore !== null && row.awayScore !== m.awayScore){ m.awayScore=row.awayScore; changed++; }
      if(Array.isArray(row.goals) && row.goals.length){ m.goals=row.goals; changed += row.goals.length; }
    });
    if(payload.generatedAt && window.DATA.meta) window.DATA.meta.espnScorersGeneratedAt=payload.generatedAt;
    return changed;
  }
  async function run(){
    var ready=await waitForApp();
    if(!ready) return;
    try{
      var res=await fetch('data/espn-scorers.json',{cache:'no-store'});
      if(!res.ok) return;
      var payload=await res.json();
      var changed=merge(payload);
      if(changed){
        window.renderMatches();
        window.renderStandings && window.renderStandings();
        window.renderScorers();
        window.dispatchEvent(new CustomEvent('vmScorersLoaded'));
      }
    }catch(e){ console.warn('ESPN scorerfil kunne ikke hentes', e); }
  }
  run();
})();
