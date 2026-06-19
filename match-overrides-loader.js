(function(){
  function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  async function waitForApp(){
    for(var i=0;i<160;i++){
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
      if(row.homeTeam && row.homeTeam !== m.homeTeam) return;
      if(row.awayTeam && row.awayTeam !== m.awayTeam) return;
      if(row.status && row.status !== m.status){ m.status=row.status; changed++; }
      if(row.homeScore !== undefined && row.homeScore !== m.homeScore){ m.homeScore=row.homeScore; changed++; }
      if(row.awayScore !== undefined && row.awayScore !== m.awayScore){ m.awayScore=row.awayScore; changed++; }
      if(Array.isArray(row.goals) && row.goals.length){ m.goals=row.goals; changed += row.goals.length; }
    });
    return changed;
  }
  async function run(){
    var ready=await waitForApp();
    if(!ready) return;
    try{
      var res=await fetch('data/match-overrides.json',{cache:'no-store'});
      if(!res.ok) return;
      var payload=await res.json();
      var changed=merge(payload);
      if(changed){
        window.renderMatches();
        window.renderStandings && window.renderStandings();
        window.renderScorers();
      }
    }catch(e){ console.warn('Match overrides kunne ikke hentes', e); }
  }
  setTimeout(run, 1800);
  window.addEventListener('vmScorersLoaded', run, {once:true});
})();
