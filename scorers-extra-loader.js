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
    var count=0;
    payload.matches.forEach(function(row){
      var m=byMatch[String(row.matchNumber)];
      if(!m) return;
      if(Array.isArray(row.goals)){ m.goals=row.goals; count += row.goals.length; }
      if(row.status) m.status=row.status;
      if(row.homeScore !== undefined) m.homeScore=row.homeScore;
      if(row.awayScore !== undefined) m.awayScore=row.awayScore;
    });
    return count;
  }
  async function run(){
    var ready=await waitForApp();
    if(!ready) return;
    try{
      var res=await fetch('data/scorers-extra.json',{cache:'no-store'});
      if(!res.ok) return;
      var payload=await res.json();
      var count=merge(payload);
      if(count){ window.renderMatches(); window.renderScorers(); window.dispatchEvent(new CustomEvent('vmScorersLoaded')); }
    }catch(e){ console.warn('Ekstra målscorerdata kunne ikke hentes', e); }
  }
  window.addEventListener('vmScorersLoaded', run, {once:true});
  setTimeout(run, 2500);
})();
