(function(){
  function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  async function waitForApp(){
    for(var i=0;i<160;i++){
      if(window.DATA && Array.isArray(window.DATA.matches) && typeof window.renderMatches === 'function' && typeof window.renderScorers === 'function') return true;
      await wait(100);
    }
    return false;
  }
  function fixKnownScheduleErrors(){
    if(!window.DATA || !Array.isArray(window.DATA.matches)) return 0;
    var changed=0;
    window.DATA.matches.forEach(function(m){
      if(m.homeTeam==='Tunesien' && m.awayTeam==='Japan'){
        if(m.danishDate!=='2026-06-21'){m.danishDate='2026-06-21'; changed++;}
        if(m.danishTime!=='06:00'){m.danishTime='06:00'; changed++;}
        if(m.danishDateTime!=='2026-06-21T06:00:00+02:00'){m.danishDateTime='2026-06-21T06:00:00+02:00'; changed++;}
        if(m.localDate!=='2026-06-21'){m.localDate='2026-06-21'; changed++;}
        if(m.localTime!=='00:00'){m.localTime='00:00'; changed++;}
        if(m.localDateTime!=='2026-06-21T00:00:00-04:00'){m.localDateTime='2026-06-21T00:00:00-04:00'; changed++;}
      }
    });
    return changed;
  }
  function sameValue(a,b){ return JSON.stringify(a)===JSON.stringify(b); }
  function merge(payload){
    if(!payload || !Array.isArray(payload.matches) || !window.DATA) return 0;
    var byMatch={};
    window.DATA.matches.forEach(function(m){ byMatch[String(m.matchNumber)] = m; });
    var fields=[
      'status','stage','group','homeTeam','awayTeam','homeScore','awayScore',
      'danishDate','danishTime','danishDateTime','localDate','localTime','localDateTime',
      'stadium','city','country','channel','channelStatus','lastUpdated','source',
      'homeScorers','awayScorers','scorers','goals'
    ];
    var changed=0;
    payload.matches.forEach(function(row){
      var id=String(row.matchNumber||'');
      if(!id) return;
      var m=byMatch[id];
      if(!m){
        var copy=Object.assign({}, row);
        window.DATA.matches.push(copy);
        byMatch[id]=copy;
        changed++;
        return;
      }
      fields.forEach(function(k){
        if(row[k]!==undefined && !sameValue(row[k],m[k])){
          m[k]=row[k];
          changed++;
        }
      });
    });
    if(payload.generatedAt && window.DATA.meta && window.DATA.meta.generatedAt!==payload.generatedAt){
      window.DATA.meta.generatedAt=payload.generatedAt;
      changed++;
    }
    return changed;
  }
  async function run(){
    var ready=await waitForApp();
    if(!ready) return;
    var changed=fixKnownScheduleErrors();
    try{
      var res=await fetch('data/match-overrides.json',{cache:'no-store'});
      if(res.ok){
        var payload=await res.json();
        changed += merge(payload);
      }
    }catch(e){ console.warn('Match overrides kunne ikke hentes', e); }
    if(changed){
      window.renderMatches();
      window.renderStandings && window.renderStandings();
      window.renderKnockout && window.renderKnockout();
      window.renderScorers();
    }
  }
  setTimeout(run, 1800);
  window.addEventListener('vmScorersLoaded', run, {once:true});
})();

(function(){
  var fallbackRender=null;
  async function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  async function waitForApp(){
    for(var i=0;i<160;i++){
      if(window.DATA && Array.isArray(window.DATA.matches) && typeof window.renderScorers === 'function') return true;
      await wait(100);
    }
    return false;
  }
  function updateIntro(){
    var intro=document.querySelector('#scorersView .muted');
    if(intro) intro.textContent='Beregnes foreløbigt ud fra registrerede mål i livearket. Separat komplet topscorerkilde er ikke aktiv, før den er verificeret.';
  }
  async function boot(){
    var ready=await waitForApp(); if(!ready)return;
    fallbackRender=window.renderScorers;
    window.renderScorers=function(){
      if(typeof fallbackRender==='function') fallbackRender();
      var el=document.getElementById('scorersList');
      if(el && !el.querySelector('.topScorerCaveat')){
        var p=document.createElement('p');
        p.className='sourceLine topScorerCaveat';
        p.textContent='Foreløbig liste: beregnet ud fra registrerede mål i livearket. Ikke en officiel komplet Golden Boot-liste endnu.';
        el.appendChild(p);
      }
    };
    updateIntro();
    window.renderScorers();
  }
  boot();
})();
