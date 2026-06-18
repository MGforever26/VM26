(function(){
  function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  async function waitForApp(){
    for(var i=0;i<120;i++){
      if(window.DATA && Array.isArray(window.DATA.matches) && typeof window.renderMatches === 'function' && typeof window.getGoals === 'function') return true;
      await wait(100);
    }
    return false;
  }
  function safe(s){ return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function goalLine(g){
    var meta=[];
    if(g.minute) meta.push(g.minute);
    if(g.ownGoal) meta.push('selvmål');
    if(g.note) meta.push(g.note);
    return '<div class="goalPill"><span class="goalPlayer">'+safe(g.player)+'</span>'+(meta.length?'<span class="goalMinute">'+safe(meta.join(' · '))+'</span>':'')+'</div>';
  }
  function column(title, goals){
    var h='<div class="goalColumn"><div class="goalTeamTitle">'+safe(title)+'</div>';
    if(goals.length){ goals.forEach(function(g){ h += goalLine(g); }); }
    else { h += '<div class="goalEmpty">Ingen mål</div>'; }
    h+='</div>';
    return h;
  }
  function compactGoalsHtml(m){
    var goals = window.getGoals(m);
    var h='<div class="goalDetails compactGoalDetails">';
    if(goals.length){
      var home = goals.filter(function(g){ return g.team === m.homeTeam; });
      var away = goals.filter(function(g){ return g.team === m.awayTeam; });
      var other = goals.filter(function(g){ return g.team !== m.homeTeam && g.team !== m.awayTeam; });
      h+='<div class="compactGoalHeader">Målscorere</div>';
      h+='<div class="goalColumns">'+column(m.homeTeam, home)+column(m.awayTeam, away)+'</div>';
      if(other.length){
        h+='<div class="goalOther">';
        other.forEach(function(g){ h += goalLine(g); });
        h+='</div>';
      }
    } else if(m.status==='finished' && m.homeScore!=null){
      h+='<div class="compactGoalHeader">Målscorere</div><p class="empty compactEmpty">Målscorere er ikke lagt ind for denne kamp endnu.</p>';
    } else {
      h+='<div class="compactGoalHeader">Kampdetaljer</div><p class="empty compactEmpty">Målscorere vises her, når kampen er spillet og data er opdateret.</p>';
    }
    h+='<div class="detailMeta compactMeta">'+safe(m.stadium)+', '+safe(m.city)+' · '+safe(m.channel||'Kanal afventer')+'</div></div>';
    return h;
  }
  function compactCard(m){
    var score=(m.status==='finished'&&m.homeScore!=null)?' '+m.homeScore+' - '+m.awayScore:'';
    return '<details class="card '+(m.status==='finished'?'finished':'')+'"><summary class="matchSummary"><div class="meta"><span>'+safe(m.danishTime)+'</span><span>·</span><span>'+safe(m.group||m.stage)+'</span><span>·</span>'+window.channelBadge(m)+'</div><div class="teams">'+safe(m.homeTeam)+' - '+safe(m.awayTeam)+score+'</div><div class="venue">'+safe(m.stadium)+', '+safe(m.city)+' · Lokal tid '+safe(m.localTime)+'</div><div class="tapHint">Tryk for målscorere</div></summary>'+compactGoalsHtml(m)+'</details>';
  }
  async function apply(){
    var ready = await waitForApp();
    if(!ready) return;
    window.goalsHtml = compactGoalsHtml;
    window.card = compactCard;
    window.renderMatches();
  }
  apply();
})();
