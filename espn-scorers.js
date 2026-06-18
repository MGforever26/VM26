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
    var pools = [play.athletesInvolved, play.participants, play.involvedAthletes];
    for(var i=0;i<pools.length;i++){
      var arr=pools[i];
      if(Array.isArray(arr) && arr.length){
        for(var j=0;j<arr.length;j++){
          var a=arr[j];
          if(a && a.displayName) return a.displayName;
          if(a && a.athlete && a.athlete.displayName) return a.athlete.displayName;
          if(a && a.player && a.player.displayName) return a.player.displayName;
        }
      }
    }
    var txt = play.text || play.shortText || play.displayText || '';
    var m = txt.match(/^([^,(]+)\s*(?:\(|,|scores|scored|Goal)/i);
    return m ? m[1].trim() : txt.trim();
  }
  function isGoalPlay(play){
    var t = norm([play.type && play.type.text, play.type && play.type.name, play.text, play.shortText, play.displayText].join(' '));
    return /\bgoal\b/.test(t) || /own goal/.test(t) || /penalty/.test(t);
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
          [c.team.displayName, c.team.shortDisplayName, c.team.name, c.team.abbreviation].forEach(function(n){ if(n) map[norm(n)] = side; });
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
      var names=[play.team.displayName, play.team.shortDisplayName, play.team.name, play.team.abbreviation];
      for(var i=0;i<names.length;i++){ if(names[i] && teamMap[norm(names[i])]) return teamMap[norm(names[i])]; }
    }
    return '';
  }
  function collectPlays(summary){
    var plays=[];
    ['scoringPlays','scoringplays'].forEach(function(k){ if(Array.isArray(summary[k])) plays=plays.concat(summary[k]); });
    if(summary.drives && Array.isArray(summary.drives.previous)){
      summary.drives.previous.forEach(function(d){ if(Array.isArray(d.plays)) plays=plays.concat(d.plays); });
    }
    var comp=getCompetition(summary);
    if(comp && Array.isArray(comp.details)) plays=plays.concat(comp.details);
    if(summary.competitions && summary.competitions[0] && Array.isArray(summary.competitions[0].details)) plays=plays.concat(summary.competitions[0].details);
    return plays;
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
  async function fetchEspnGoals(match){
    var id=ESPN_EVENT_BY_MATCH[String(match.matchNumber)];
    if(!id) return [];
    var url='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event='+encodeURIComponent(id);
    var res=await fetch(url,{cache:'no-store'});
    if(!res.ok) return [];
    var summary=await res.json();
    return goalsFromSummary(summary, match);
  }
  async function run(){
    var ready=await waitForApp();
    if(!ready) return;
    var changed=false;
    var matches=window.DATA.matches.filter(function(m){return m.status==='finished' && m.homeScore!=null;});
    for(var i=0;i<matches.length;i++){
      var m=matches[i];
      try{
        var goals=await fetchEspnGoals(m);
        var expected=Number(m.homeScore||0)+Number(m.awayScore||0);
        if(goals.length && goals.length===expected){
          m.goals=goals;
          changed=true;
        }
      }catch(e){ console.warn('ESPN scorere kunne ikke hentes for kamp '+m.matchNumber, e); }
    }
    if(changed){
      window.renderMatches();
      window.renderScorers();
    }
  }
  run();
})();
