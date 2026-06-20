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

(function(){
  var officialRows=null;
  var officialSource='';
  var fallbackRender=null;
  var endpoints=[
    'https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/statistics?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=75&sort=goals:desc',
    'https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/statistics?region=us&lang=en&contentorigin=espn&page=1&limit=75&sort=goals:desc'
  ];
  function num(v){ if(v==null)return null; var n=Number(String(v).replace(/[^0-9.-]/g,'')); return isNaN(n)?null:n; }
  function nm(o){ return !o?'':(o.displayName||o.fullName||o.shortName||o.name||(o.athlete&&nm(o.athlete))||(o.player&&nm(o.player))||''); }
  function tm(o){ var t=o&&(o.team||o.club||o.competitor||(o.athlete&&o.athlete.team)); return t?(t.displayName||t.shortDisplayName||t.name||t.abbreviation||''):''; }
  function add(out,item,cat){
    var c=String(cat||item.name||item.displayName||'').toLowerCase();
    if(c && c.indexOf('goal')<0) return;
    var player=nm(item.athlete)||nm(item.player)||nm(item);
    var team=tm(item);
    var goals=num(item.value!=null?item.value:item.displayValue!=null?item.displayValue:item.total!=null?item.total:item.statValue);
    if(goals==null && item.stats && item.stats.goals!=null) goals=num(item.stats.goals);
    if(goals==null && item.statistics && item.statistics.goals!=null) goals=num(item.statistics.goals);
    if(player && goals!=null) out.push({player:player,team:team,goals:goals});
  }
  function scan(node,out,cat){
    if(!node)return;
    if(Array.isArray(node)){node.forEach(function(x){scan(x,out,cat)});return;}
    if(typeof node!=='object')return;
    var n=String(node.name||node.displayName||node.shortName||node.label||'');
    var local=/goal/i.test(n)?n:cat;
    ['leaders','athletes','items','entries'].forEach(function(k){ if(Array.isArray(node[k])) node[k].forEach(function(x){add(out,x,local); scan(x,out,local);}); });
    if(node.athlete||node.player) add(out,node,local);
    ['categories','stats','statistics','splits','children'].forEach(function(k){ if(node[k]) scan(node[k],out,local); });
  }
  function normalize(rows){
    var by={};
    rows.forEach(function(r){ if(!r.player||!r.goals)return; var k=(r.player+'|'+(r.team||'')).toLowerCase(); if(!by[k]||by[k].goals<r.goals)by[k]=r; });
    return Object.values(by).sort(function(a,b){return b.goals-a.goals||a.player.localeCompare(b.player,'da')}).slice(0,50);
  }
  function renderOfficial(){
    var el=document.getElementById('scorersList'); if(!el)return;
    if(officialRows&&officialRows.length){
      var h='<div class="scorerTable"><div class="scorerRow scorerHead"><span>Spiller</span><span>Hold</span><span>Mål</span></div>';
      officialRows.forEach(function(r){h+='<div class="scorerRow"><span>'+esc(r.player)+'</span><span>'+esc(r.team||'')+'</span><strong>'+esc(r.goals)+'</strong></div>';});
      h+='</div><p class="sourceLine">Komplet topscorerliste fra separat kilde: '+esc(officialSource)+'. Kampkortene bruger egne målscorerdata.</p>';
      el.innerHTML=h;
      return true;
    }
    return false;
  }
  async function fetchOfficial(){
    for(var i=0;i<endpoints.length;i++){
      try{
        var url=endpoints[i]+'&cacheBust='+Date.now();
        var res=await fetch(url,{cache:'no-store'});
        if(!res.ok) continue;
        var data=await res.json();
        var found=[]; scan(data,found,'');
        var rows=normalize(found);
        if(rows.length){
          officialRows=rows; officialSource='ESPN spillerstatistik';
          window.__VM_TOP_SCORERS__={status:'ok',source:officialSource,rows:rows,updatedAt:new Date().toISOString()};
          renderOfficial();
          return true;
        }
      }catch(e){ console.warn('Topscorer-kilde fejlede',e); }
    }
    window.__VM_TOP_SCORERS__={status:'fallback',source:'kampkort/liveark',rows:[],updatedAt:new Date().toISOString()};
    if(typeof fallbackRender==='function'){
      fallbackRender();
      var el=document.getElementById('scorersList');
      if(el){ var p=document.createElement('p'); p.className='sourceLine'; p.textContent='Foreløbig fallback: beregnet ud fra registrerede mål i kampkort/liveark, fordi den separate topscorerkilde ikke kunne hentes.'; el.appendChild(p); }
    }
    return false;
  }
  async function boot(){
    var ready=await waitForApp(); if(!ready)return;
    fallbackRender=window.renderScorers;
    window.renderScorers=function(){ if(!renderOfficial() && typeof fallbackRender==='function') fallbackRender(); };
    var intro=document.querySelector('#scorersView .muted');
    if(intro) intro.textContent='Hentes primært fra separat topscorer/statistik-kilde. Kampkortdata bruges kun som fallback.';
    fetchOfficial();
    setInterval(fetchOfficial,5*60*1000);
    window.addEventListener('focus',fetchOfficial);
    document.addEventListener('visibilitychange',function(){ if(!document.hidden)fetchOfficial(); });
  }
  boot();
})();
