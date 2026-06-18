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
  function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  async function waitForApp(){
    for(var i=0;i<120;i++){
      if(window.DATA && Array.isArray(window.DATA.matches) && typeof window.renderMatches === 'function' && typeof window.renderScorers === 'function') return true;
      await wait(100);
    }
    return false;
  }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
  function clockToMinute(clock){
    if(!clock) return '';
    var d = clock.displayValue || clock.display || clock.text || '';
    if(d && /\d/.test(d)) return String(d).replace(/\s/g,'').replace(/[’′]/g,"'");
    if(typeof clock.value === 'number'){
      var min = Math.ceil(clock.value/60);
      return min ? String(min)+"'" : '';
    }
    return '';
  }
  function firstPlayer(play){
    var pools = [play.athletesInvolved, play.participants, play.involvedAthletes, play.athletes];
    for(var i=0;i<pools.length;i++){
      var arr=pools[i];
      if(Array.isArray(arr) && arr.length){
        for(var j=0;j<arr.length;j++){
          var a=arr[j];
          if(a && a.displayName) return a.displayName;
          if(a && a.fullName) return a.fullName;
          if(a && a.athlete && a.athlete.displayName) return a.athlete.displayName;
          if(a && a.athlete && a.athlete.fullName) return a.athlete.fullName;
          if(a && a.player && a.player.displayName) return a.player.displayName;
        }
      }
    }
    var txt = play.text || play.shortText || play.displayText || '';
    var m = txt.match(/^([^,(]+)\s*(?:\(|,|scores|scored|goal|Goal)/i);
    return m ? m[1].trim() : txt.trim();
  }
  function isGoalPlay(play){
    if(play.scoringPlay === true) return true;
    if(Number(play.scoreValue||0) > 0) return true;
    var t = norm([play.type && play.type.text, play.type && play.type.name, play.text, play.shortText, play.displayText].join(' '));
    return /\bgoal\b/.test(t) || /own goal/.test(t);
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
        if(c.team){
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
    if(play.team){
      if(play.team.id && teamMap[String(play.team.id)]) return teamMap[String(play.team.id)];
      var names=[play.team.displayName, play.team.shortDisplayName, play.team.name, play.team.abbreviation, play.team.location];
      for(var i=0;i<names.length;i++){ if(names[i] && teamMap[norm(names[i])]) return teamMap[norm(names[i])]; }
    }
    return '';
  }
  function collectPlays(summary){
    var plays=[];
    ['scoringPlays','scoringplays','plays'].forEach(function(k){ if(Array.isArray(summary[k])) plays=plays.concat(summary[k]); });
    if(summary.drives && Array.isArray(summary.drives.previous)){
      summary.drives.previous.forEach(function(d){ if(Array.isArray(d.plays)) plays=plays.concat(d.plays); });
    }
    var comp=getCompetition(summary);
    if(comp && Array.isArray(comp.details)) plays=plays.concat(comp.details);
    if(summary.competitions && summary.competitions[0] && Array.isArray(summary.competitions[0].details)) plays=plays.concat(summary.competitions[0].details);
    return plays;
  }
  function updateMatchStatusAndScore(summary, match){
    var comp=getCompetition(summary), changed=false;
    if(!comp) return false;
    if(comp.status && comp.status.type){
      var type=comp.status.type;
      var nextStatus = type.completed ? 'finished' : (type.state === 'in' || type.name === 'STATUS_IN_PROGRESS' ? 'live' : match.status);
      if(nextStatus && nextStatus !== match.status){ match.status = nextStatus; changed = true; }
    }
    if(Array.isArray(comp.competitors)){
      comp.competitors.forEach(function(c){
        var score = c.score !== undefined && c.score !== null && c.score !== '' ? Number(c.score) : null;
        if(score === null || isNaN(score)) return;
        if(c.homeAway === 'home' && match.homeScore !== score){ match.homeScore = score; changed = true; }
        if(c.homeAway === 'away' && match.awayScore !== score){ match.awayScore = score; changed = true; }
      });
    }
    return changed;
  }
  function goalsFromSummary(summary, match){
    var teamMap=buildTeamMap(summary, match);
    var goals=[];
    collectPlays(summary).forEach(function(play){
      if(!play || !isGoalPlay(play)) return;
      var player=firstPlayer(play);
      if(!player) return;
      var text=[play.text, play.shortText, play.displayText].join(' ');
      goals.push({
        team: teamForPlay(play, teamMap),
        player: player,
        minute: clockToMinute(play.clock),
        ownGoal: /own goal|selvmål/i.test(text),
        note: /penalty|straffe/i.test(text) ? 'straffe' : ''
      });
    });
    return goals;
  }
  function shouldCheck(match){
    if(!ESPN_EVENT_BY_MATCH[String(match.matchNumber)]) return false;
    if(match.status === 'finished' || match.status === 'live') return true;
    if(match.homeScore !== null && match.homeScore !== undefined) return true;
    var dt = Date.parse(match.danishDateTime || '');
    if(!isNaN(dt)) return dt <= Date.now() + 4*60*60*1000;
    return false;
  }
  async function fetchSummary(match){
    var id=ESPN_EVENT_BY_MATCH[String(match.matchNumber)];
    var url='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event='+encodeURIComponent(id)+'&cacheBust='+Date.now();
    var res=await fetch(url,{cache:'no-store'});
    if(!res.ok) return null;
    return await res.json();
  }
  async function refreshFromEspn(){
    if(running) return;
    var ready=await waitForApp();
    if(!ready) return;
    running=true;
    lastRun=Date.now();
    var changed=false;
    var matches=window.DATA.matches.filter(shouldCheck);
    for(var i=0;i<matches.length;i++){
      var m=matches[i];
      try{
        var summary=await fetchSummary(m);
        if(!summary) continue;
        if(updateMatchStatusAndScore(summary, m)) changed=true;
        var goals=goalsFromSummary(summary, m);
        var expected=Number(m.homeScore||0)+Number(m.awayScore||0);
        if(goals.length && (!expected || goals.length===expected)){
          m.goals=goals;
          changed=true;
        }
      }catch(e){ console.warn('ESPN scorere kunne ikke hentes for kamp '+m.matchNumber, e); }
    }
    if(changed){
      window.renderMatches();
      window.renderStandings && window.renderStandings();
      window.renderScorers();
    }
    running=false;
  }
  function scheduleSoon(){ setTimeout(refreshFromEspn, 1200); }
  window.addEventListener('vmScorersLoaded', scheduleSoon);
  window.addEventListener('focus', function(){ if(Date.now()-lastRun > 60000) refreshFromEspn(); });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && Date.now()-lastRun > 60000) refreshFromEspn(); });
  setTimeout(refreshFromEspn, 3500);
  setInterval(refreshFromEspn, 5*60*1000);
})();
