(function(){
  function norm(s){
    return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  }
  function teamAlias(s){
    var n=norm(s);
    var map={
      'usa':'usa','united states':'usa','united states of america':'usa','us':'usa',
      'australia':'australien','australien':'australien',
      'brazil':'brasilien','brasilien':'brasilien',
      'haiti':'haiti',
      'south korea':'sydkorea','korea republic':'sydkorea','sydkorea':'sydkorea',
      'mexico':'mexico','mexico city':'mexico',
      'qatar':'qatar','canada':'canada'
    };
    return map[n] || n;
  }
  function getRowHome(r){return r.homeTeam||r.home||r.home_team||r.homeName||r.hjemmehold||r.hjemme||r.team1||'';}
  function getRowAway(r){return r.awayTeam||r.away||r.away_team||r.awayName||r.udehold||r.ude||r.team2||'';}
  function rowHasScore(r){return r.status || r.homeScore!==undefined&&r.homeScore!=='' || r.awayScore!==undefined&&r.awayScore!=='';}
  function scoreIsFinished(r){return String(r.status||'').toLowerCase()==='finished' || String(r.status||'').toLowerCase()==='complete' || String(r.status||'').toLowerCase()==='completed' || (r.homeScore!==undefined&&r.homeScore!==''&&r.awayScore!==undefined&&r.awayScore!=='');}
  function normalizeStatus(s){
    var x=String(s||'').toLowerCase();
    if(x==='complete'||x==='completed') return 'finished';
    if(x==='scheduled') return 'upcoming';
    return s;
  }
  function findByTeams(home,away){
    var h=teamAlias(home), a=teamAlias(away);
    if(!h || !a || !window.DATA || !Array.isArray(window.DATA.matches)) return null;
    return window.DATA.matches.find(function(m){return teamAlias(m.homeTeam)===h && teamAlias(m.awayTeam)===a;}) || null;
  }
  function isPlausibleByTime(m,r){
    if(!scoreIsFinished(r)) return true;
    var dt=Date.parse(m.danishDateTime||'');
    if(isNaN(dt)) return true;
    // A match should not receive a final score before roughly two hours after kickoff.
    return Date.now() >= dt + 105*60*1000;
  }
  function applySafeLiveOverrides(rows){
    var updatedAt='';
    var byMatch={};
    var skipped=[];
    window.DATA.matches.forEach(function(m){byMatch[String(m.matchNumber)]=m;});
    rows.forEach(function(r){
      if(r.matchNumber==='meta'&&r.status==='generatedAt'){
        updatedAt=r.homeScore||r.awayScore||r.lastUpdated||updatedAt;
        return;
      }
      var rowHome=getRowHome(r), rowAway=getRowAway(r);
      var m=null;
      if(rowHome && rowAway){
        m=findByTeams(rowHome,rowAway);
        if(!m){skipped.push('holdpar ikke fundet: '+rowHome+' - '+rowAway); return;}
      } else {
        var id=String(r.matchNumber||'').trim();
        m=byMatch[id];
        if(!m) return;
        if(!isPlausibleByTime(m,r)){
          skipped.push('for tidlig resultatrække for kamp '+id+' ('+m.homeTeam+' - '+m.awayTeam+')');
          return;
        }
      }
      if(rowHome && rowAway && (teamAlias(rowHome)!==teamAlias(m.homeTeam) || teamAlias(rowAway)!==teamAlias(m.awayTeam))){
        skipped.push('hold mismatch for kamp '+m.matchNumber);
        return;
      }
      if(r.status) m.status=normalizeStatus(r.status);
      if(r.homeScore!==undefined&&r.homeScore!=='') m.homeScore=Number(r.homeScore);
      if(r.awayScore!==undefined&&r.awayScore!=='') m.awayScore=Number(r.awayScore);
      if(r.lastUpdated){m.lastUpdated=r.lastUpdated;updatedAt=r.lastUpdated;}
      ['homeScorers','awayScorers','scorers','goals'].forEach(function(k){if(r[k])m[k]=r[k];});
    });
    window.__VM_LIVE_GUARD__={updatedAt:updatedAt,skipped:skipped.slice(0,20)};
    if(updatedAt) window.DATA.meta.generatedAt=updatedAt;
    return updatedAt;
  }
  window.applyLiveOverrides = applySafeLiveOverrides;
})();
