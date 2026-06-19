(function(){
  var ESPN_EVENT_BY_MATCH = {
    1:'66456904', 2:'66456906', 3:'66456916', 4:'66456940', 5:'66456930', 6:'66456942',
    7:'66456928', 8:'66456918', 9:'66457072', 10:'66457070', 11:'66456968', 12:'66456970',
    13:'66456996', 14:'66456994', 15:'66456984', 16:'66456982', 17:'66457006', 18:'66457008',
    19:'66457018', 20:'66457020', 21:'66457044', 22:'66457042', 23:'66457030', 24:'66457032',
    25:'66456910', 26:'66456922', 27:'66456920', 28:'66456908', 29:'66456932', 30:'66456934',
    31:'66456946', 32:'66456944', 33:'66456972', 34:'66457074', 35:'66457076', 36:'66456974',
    37:'66456998', 38:'66456986', 39:'66457000', 40:'66456988', 41:'66457022', 42:'66457010',
    43:'66457012', 44:'66457024', 45:'66457034', 46:'66457046', 47:'66457048', 48:'66457036',
    49:'66456924', 50:'66456926', 51:'66456936', 52:'66456938', 53:'66456912', 54:'66456914',
    55:'66457078', 56:'66457080', 57:'66456976', 58:'66456978', 59:'66456948', 60:'66456950',
    61:'66457014', 62:'66457016', 63:'66457002', 64:'66457004', 65:'66456990', 66:'66456992',
    67:'66457050', 68:'66457052', 69:'66457038', 70:'66457040', 71:'66457026', 72:'66457028'
  };

  var running = false;
  var lastRun = 0;
  window.__VM_ESPN_SCORER_STATUS__ = { lastRun: null, checked: 0, applied: 0, skipped: 0, errors: [] };

  function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  async function waitForApp(){
    for(var i=0;i<160;i++){
      if(window.DATA && Array.isArray(window.DATA.matches) && typeof window.renderMatches === 'function' && typeof window.renderScorers === 'function') return true;
      await wait(100);
    }
    return false;
  }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
  function cleanMinute(v){
    if(v === null || v === undefined) return '';
    var s = String(v).trim();
    if(!s) return '';
    var stoppage = s.match(/(\d+)\s*\+\s*(\d+)/);
    if(stoppage) return stoppage[1]+'+'+stoppage[2]+"'";
    var m = s.match(/\d+/);
    return m ? m[0]+"'" : '';
  }
  function clockToMinute(play){
    var candidates = [play.clock, play.time, play.periodClock, play.displayTime, play.timeDisplay, play.minute];
    for(var i=0;i<candidates.length;i++){
      var c=candidates[i];
      if(!c) continue;
      if(typeof c === 'object'){
        var d = c.displayValue || c.display || c.text || c.shortDisplayValue || '';
        var cd = cleanMinute(d);
        if(cd) return cd;
        if(typeof c.value === 'number' && c.value > 0) return Math.ceil(c.value/60)+"'";
      } else {
        var x = cleanMinute(c);
        if(x) return x;
      }
    }
    var text = play.text || play.shortText || play.displayText || '';
    var tm = text.match(/\b(\d{1,3})(?:\s*\+\s*(\d{1,2}))?['’]/);
    if(tm) return tm[1]+(tm[2]?'+'+tm[2]:'')+"'";
    return '';
  }
  function firstPlayer(play){
    var direct = [play.athlete, play.player, play.scorer, play.shooter];
    for(var d=0; d<direct.length; d++){
      var node=direct[d];
      if(node && (node.displayName || node.fullName || node.shortName)) return node.displayName || node.fullName || node.shortName;
    }
    var pools = [play.athletesInvolved, play.participants, play.involvedAthletes, play.athletes];
    for(var i=0;i<pools.length;i++){
      var arr=pools[i];
      if(Array.isArray(arr)){
        for(var j=0;j<arr.length;j++){
          var a=arr[j];
          if(!a) continue;
          if(a.displayName || a.fullName || a.shortName) return a.displayName || a.fullName || a.shortName;
          if(a.athlete && (a.athlete.displayName || a.athlete.fullName || a.athlete.shortName)) return a.athlete.displayName || a.athlete.fullName || a.athlete.shortName;
          if(a.player && (a.player.displayName || a.player.fullName || a.player.shortName)) return a.player.displayName || a.player.fullName || a.player.shortName;
        }
      }
    }
    var txt = play.text || play.shortText || play.displayText || '';
    var m = txt.match(/^([^,(]+?)\s*(?:\(|,| scores| scored| Goal| goal)/i);
    return m ? m[1].trim() : '';
  }
  function isGoalPlay(play){
    if(play.scoringPlay === true) return true;
    var type = play.type || {};
    var blob = [type.text, type.name, type.displayName, play.text, play.shortText, play.displayText].join(' ');
    var n = norm(blob);
    if(n.indexOf('own goal') >= 0) return true;
    if(/\bgoal\b/.test(n) && n.indexOf('goalkeeper') === -1) return true;
    return false;
  }
  function getCompetition(summary){
    if(summary.header && summary.header.competitions && summary.header.competitions[0]) return summary.header.competitions[0];
    if(summary.competitions && summary.competitions[0]) return summary.competitions[0];
    return null;
  }
  function buildTeamMap(summary, match){
    var comp=getCompetition(summary), map={};
    if(comp && Array.isArray(comp.competitors)){
      comp.competitors.forEach(function(c){
        var side = c.homeAway === 'home' ? match.homeTeam : c.homeAway === 'away' ? match.awayTeam : '';
        if(c.team && side){
          if(c.team.id) map[String(c.team.id)] = side;
          [c.team.displayName, c.team.shortDisplayName, c.team.name, c.team.abbreviation, c.team.location].forEach(function(n){ if(n) map[norm(n)] = side; });
        }
      });
    }
    map[norm(match.homeTeam)] = match.homeTeam;
    map[norm(match.awayTeam)] = match.awayTeam;
    return map;
  }
  function teamForPlay(play, teamMap){
    var team = play.team || play.competitor || {};
    if(team){
      if(team.id && teamMap[String(team.id)]) return teamMap[String(team.id)];
      var names=[team.displayName, team.shortDisplayName, team.name, team.abbreviation, team.location];
      for(var i=0;i<names.length;i++){ if(names[i] && teamMap[norm(names[i])]) return teamMap[norm(names[i])]; }
    }
    var text = norm([play.text, play.shortText, play.displayText].join(' '));
    if(text.indexOf(norm(window.DATA && window.DATA.homeTeam)) >= 0) return '';
    Object.keys(teamMap).forEach(function(k){});
    return '';
  }
  function collectPlays(summary){
    var plays=[];
    ['scoringPlays','scoringplays','plays','commentary'].forEach(function(k){ if(Array.isArray(summary[k])) plays=plays.concat(summary[k]); });
    var comp=getCompetition(summary);
    if(comp){ ['details','plays','commentary'].forEach(function(k){ if(Array.isArray(comp[k])) plays=plays.concat(comp[k]); }); }
    if(summary.competitions && summary.competitions[0]){
      ['details','plays','commentary'].forEach(function(k){ if(Array.isArray(summary.competitions[0][k])) plays=plays.concat(summary.competitions[0][k]); });
    }
    var seen={}, out=[];
    plays.forEach(function(p){
      if(!p || typeof p !== 'object') return;
      var key=[p.id, p.text || p.shortText || p.displayText, JSON.stringify(p.clock || p.time || '')].join('|');
      if(seen[key]) return;
      seen[key]=true; out.push(p);
    });
    return out;
  }
  function goalsFromSummary(summary, match){
    var teamMap=buildTeamMap(summary, match);
    var goals=[];
    collectPlays(summary).forEach(function(play){
      if(!isGoalPlay(play)) return;
      var player=firstPlayer(play);
      var minute=clockToMinute(play);
      if(!player || !minute) return;
      var text=[play.text, play.shortText, play.displayText].join(' ');
      var team=teamForPlay(play, teamMap);
      if(!team){
        var n=norm(text);
        if(n.indexOf(norm(match.homeTeam)) >= 0) team=match.homeTeam;
        else if(n.indexOf(norm(match.awayTeam)) >= 0) team=match.awayTeam;
      }
      if(!team) return;
      goals.push({
        team: team,
        player: player,
        minute: minute,
        ownGoal: /own goal|selvmål/i.test(text),
        note: /penalty|straffe/i.test(text) ? 'straffe' : ''
      });
    });
    return goals;
  }
  function shouldCheck(match){
    if(!ESPN_EVENT_BY_MATCH[String(match.matchNumber)]) return false;
    var total = Number(match.homeScore || 0) + Number(match.awayScore || 0);
    if(total > 0) return true;
    var dt = Date.parse(match.danishDateTime || '');
    return !isNaN(dt) && dt <= Date.now() + 2*60*60*1000;
  }
  async function fetchSummary(match){
    var id=ESPN_EVENT_BY_MATCH[String(match.matchNumber)];
    var url='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event='+encodeURIComponent(id)+'&cacheBust='+Date.now();
    var res=await fetch(url,{cache:'no-store'});
    if(!res.ok) return null;
    return await res.json();
  }
  async function refreshScorersOnly(){
    if(running) return;
    var ready=await waitForApp();
    if(!ready) return;
    running=true;
    lastRun=Date.now();
    var changed=false, checked=0, applied=0, skipped=0, errors=[];
    var matches=window.DATA.matches.filter(shouldCheck);
    for(var i=0;i<matches.length;i++){
      var m=matches[i];
      checked++;
      try{
        var expected=Number(m.homeScore||0)+Number(m.awayScore||0);
        if(!expected){ skipped++; continue; }
        var summary=await fetchSummary(m);
        if(!summary){ skipped++; continue; }
        var goals=goalsFromSummary(summary, m);
        if(goals.length === expected && goals.every(function(g){ return g.minute && (g.team===m.homeTeam || g.team===m.awayTeam); })){
          m.goals=goals;
          changed=true;
          applied++;
        } else {
          skipped++;
        }
      }catch(e){ errors.push('kamp '+m.matchNumber+': '+(e && e.message ? e.message : String(e))); }
    }
    window.__VM_ESPN_SCORER_STATUS__ = { lastRun: new Date().toISOString(), checked: checked, applied: applied, skipped: skipped, errors: errors.slice(0,5) };
    if(changed){
      window.renderMatches();
      window.renderScorers();
    }
    running=false;
  }
  function scheduleSoon(){ setTimeout(refreshScorersOnly, 1500); }
  window.addEventListener('vmScorersLoaded', scheduleSoon);
  window.addEventListener('focus', function(){ if(Date.now()-lastRun > 60000) refreshScorersOnly(); });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && Date.now()-lastRun > 60000) refreshScorersOnly(); });
  setTimeout(refreshScorersOnly, 4500);
  setInterval(refreshScorersOnly, 5*60*1000);
})();
