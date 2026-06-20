(function(){
  function cleanMinute(v){
    var s=String(v||'').trim();
    if(!s) return '';
    var sm=s.match(/(\d+)\s*\+\s*(\d+)/);
    if(sm) return sm[1]+'+'+sm[2]+"'";
    var m=s.match(/\d+/);
    return m ? m[0]+"'" : '';
  }
  function parsePlainScorers(text, team){
    if(!text) return [];
    return String(text).split(/[;\n]+/).map(function(raw){
      var s=raw.trim();
      if(!s) return null;
      var minute='';
      var m=s.match(/(\d+\+?\d*)\s*['’]?/);
      if(m){ minute=m[1]+"'"; s=s.replace(m[0],'').trim(); }
      var own=/selvmål|own goal|\bog\b/i.test(s);
      s=s.replace(/\(?\s*(selvmål|own goal|og)\s*\)?/ig,'').replace(/^[-:,\s]+|[-:,\s]+$/g,'');
      return {team:team||'', player:s, minute:minute, ownGoal:own, note:own?'selvmål':''};
    }).filter(function(g){return g && g.player;});
  }
  function parseStructuredGoals(text){
    if(!text) return [];
    return String(text).split(/[;\n]+/).map(function(raw){
      var parts=raw.split('|').map(function(x){return x.trim();});
      if(parts.length < 3) return null;
      var note=parts[3] || '';
      var own=/selvmål|own goal|\bog\b/i.test(note) || /selvmål|own goal|\bog\b/i.test(parts[1]);
      return {team:parts[0], player:parts[1].replace(/\(?\s*(selvmål|own goal|og)\s*\)?/ig,'').trim(), minute:cleanMinute(parts[2]), ownGoal:own, note:own?'selvmål':note};
    }).filter(function(g){return g && g.team && g.player;});
  }
  function dedupe(goals){
    var seen={}, out=[];
    goals.forEach(function(g){
      var key=[g.team||'',g.player||'',g.minute||'',g.ownGoal?'og':''].join('|').toLowerCase();
      if(seen[key]) return;
      seen[key]=true;
      out.push(g);
    });
    return out;
  }
  window.parseScorerList = parsePlainScorers;
  window.getGoals = function(m){
    var goals=[];
    if(Array.isArray(m.goals)){
      m.goals.forEach(function(g){goals.push({team:g.team||'', player:g.player||g.name||'', minute:g.minute||'', note:g.note||'', ownGoal:!!g.ownGoal});});
    } else if(typeof m.goals==='string' && m.goals.indexOf('|') >= 0) {
      goals=goals.concat(parseStructuredGoals(m.goals));
    } else if(typeof m.goals==='string') {
      goals=goals.concat(parsePlainScorers(m.goals,''));
    }
    goals=goals.concat(parsePlainScorers(m.homeScorers, m.homeTeam));
    goals=goals.concat(parsePlainScorers(m.awayScorers, m.awayTeam));
    if(!goals.length && m.scorers){ goals=goals.concat(parsePlainScorers(m.scorers, '')); }
    return dedupe(goals).filter(function(g){return g.player;});
  };
  window.goalItemHtml = function(g){
    var meta=[];
    if(g.minute) meta.push(g.minute);
    if(g.ownGoal) meta.push('selvmål');
    if(g.note && !/selvmål/i.test(g.note)) meta.push(g.note);
    return '<div class="goalPill"><span class="goalPlayer">'+esc(g.player)+'</span><span class="goalMinute">'+esc(meta.join(' · '))+'</span></div>';
  };
})();
