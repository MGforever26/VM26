(function(){
  var OFFICIAL_ROWS = null;
  var OFFICIAL_STATUS = 'loading';
  var OFFICIAL_SOURCE = '';
  var fallbackRender = window.renderScorers;
  var endpoints = [
    'https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/statistics?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=75&sort=goals:desc',
    'https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/statistics?region=us&lang=en&contentorigin=espn&page=1&limit=75&sort=goals:desc',
    'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/types/2/leaders?lang=en&region=us'
  ];
  function safeNumber(v){
    if(v==null) return null;
    var n=Number(String(v).replace(/[^0-9.-]/g,''));
    return isNaN(n) ? null : n;
  }
  function nameOf(obj){
    if(!obj) return '';
    return obj.displayName || obj.fullName || obj.shortName || obj.name || (obj.athlete && nameOf(obj.athlete)) || (obj.player && nameOf(obj.player)) || '';
  }
  function teamOf(obj){
    if(!obj) return '';
    var t=obj.team || obj.club || obj.competitor || (obj.athlete && obj.athlete.team) || {};
    return t.displayName || t.shortDisplayName || t.name || t.abbreviation || '';
  }
  function addLeader(out, item, categoryName){
    var cat=String(categoryName||item.name||item.displayName||item.shortName||'').toLowerCase();
    if(cat && !/goal/.test(cat)) return;
    var player=nameOf(item.athlete)||nameOf(item.player)||nameOf(item);
    var team=teamOf(item);
    var goals=safeNumber(item.value!=null?item.value:item.displayValue!=null?item.displayValue:item.total!=null?item.total:item.statValue);
    if(goals==null && item.stats && item.stats.goals!=null) goals=safeNumber(item.stats.goals);
    if(goals==null && item.statistics && item.statistics.goals!=null) goals=safeNumber(item.statistics.goals);
    if(!player || goals==null) return;
    out.push({player:player,team:team,goals:goals});
  }
  function scanForLeaders(node, out, categoryName){
    if(!node) return;
    if(Array.isArray(node)){node.forEach(function(x){scanForLeaders(x,out,categoryName)});return;}
    if(typeof node!=='object') return;
    var localCat=categoryName;
    var n=String(node.name||node.displayName||node.shortName||node.label||'');
    if(/goal/i.test(n)) localCat=n;
    if(Array.isArray(node.leaders)) node.leaders.forEach(function(l){addLeader(out,l,localCat)});
    if(Array.isArray(node.athletes)) node.athletes.forEach(function(l){addLeader(out,l,localCat)});
    if(Array.isArray(node.items)) node.items.forEach(function(l){addLeader(out,l,localCat)});
    if(Array.isArray(node.entries)) node.entries.forEach(function(l){addLeader(out,l,localCat)});
    if(node.athlete || node.player) addLeader(out,node,localCat);
    ['categories','stats','statistics','splits','children','leaders'].forEach(function(k){
      if(node[k] && node[k]!==node) scanForLeaders(node[k],out,localCat);
    });
  }
  function normalizeRows(rows){
    var byKey={};
    rows.forEach(function(r){
      if(!r.player || !r.goals) return;
      var key=(r.player+'|'+(r.team||'')).toLowerCase();
      if(!byKey[key] || byKey[key].goals<r.goals) byKey[key]=r;
    });
    return Object.values(byKey).sort(function(a,b){return b.goals-a.goals||a.player.localeCompare(b.player,'da')}).slice(0,50);
  }
  async function fetchOfficial(){
    OFFICIAL_STATUS='loading';
    for(var i=0;i<endpoints.length;i++){
      try{
        var url=endpoints[i]+(endpoints[i].indexOf('?')>-1?'&':'?')+'cacheBust='+Date.now();
        var res=await fetch(url,{cache:'no-store'});
        if(!res.ok) continue;
        var data=await res.json();
        var found=[];
        scanForLeaders(data,found,'');
        var rows=normalizeRows(found);
        if(rows.length){
          OFFICIAL_ROWS=rows;
          OFFICIAL_STATUS='ok';
          OFFICIAL_SOURCE='ESPN spillerstatistik';
          window.__VM_TOP_SCORERS__={status:OFFICIAL_STATUS,source:OFFICIAL_SOURCE,rows:rows,updatedAt:new Date().toISOString()};
          if(typeof window.renderScorers==='function') window.renderScorers();
          return true;
        }
      }catch(e){
        console.warn('Topscorer-kilde fejlede', e);
      }
    }
    OFFICIAL_STATUS='fallback';
    window.__VM_TOP_SCORERS__={status:OFFICIAL_STATUS,source:'fallback kampdata',rows:OFFICIAL_ROWS||[],updatedAt:new Date().toISOString()};
    if(typeof window.renderScorers==='function') window.renderScorers();
    return false;
  }
  window.renderScorers=function(){
    var el=document.getElementById('scorersList');
    if(!el) return;
    if(OFFICIAL_ROWS && OFFICIAL_ROWS.length){
      var h='<div class="scorerTable"><div class="scorerRow scorerHead"><span>Spiller</span><span>Hold</span><span>Mål</span></div>';
      OFFICIAL_ROWS.forEach(function(r){h+='<div class="scorerRow"><span>'+esc(r.player)+'</span><span>'+esc(r.team||'')+'</span><strong>'+esc(r.goals)+'</strong></div>'});
      h+='</div><p class="sourceLine">Komplet topscorerliste fra separat kilde: '+esc(OFFICIAL_SOURCE)+'. Kampkortene bruger fortsat egne målscorerdata.</p>';
      el.innerHTML=h;
      return;
    }
    if(typeof fallbackRender==='function') fallbackRender();
    var note=document.createElement('p');
    note.className='sourceLine';
    note.textContent='Foreløbig fallback: beregnet ud fra registrerede mål i kampkort/liveark, fordi den separate topscorerkilde ikke kunne hentes.';
    el.appendChild(note);
  };
  fetchOfficial();
  setInterval(fetchOfficial, 5*60*1000);
  window.addEventListener('focus', fetchOfficial);
  document.addEventListener('visibilitychange', function(){if(!document.hidden) fetchOfficial();});
})();
