var DATA = null;
var LIVE_OVERRIDES_CSV_URL = 'https://docs.google.com/spreadsheets/d/1fD9MCOrVhq_Iz-bl0Oky7Dji9J3BiHtNoyaocZNg05Y/gviz/tq?tqx=out:csv&gid=237773151';
var currentFilter = 'all';

async function loadBaseData(){
  setStatus('Henter kampdata...');
  var res=await fetch('data/vm2026-data.json',{cache:'no-store'});
  if(!res.ok) throw new Error('HTTP '+res.status);
  DATA=await res.json();
  setStatus('Senest opdateret '+fmtUpdated(DATA.meta.generatedAt)+' · grunddata');
}
function byId(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmtDate(iso){try{var d=new Date(iso+'T12:00:00');return d.toLocaleDateString('da-DK',{weekday:'long',day:'numeric',month:'long'})}catch(e){return iso}}
function fmtUpdated(iso){try{var d=new Date(iso);return d.toLocaleDateString('da-DK',{day:'numeric',month:'long'})+' kl. '+d.toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})}catch(e){return iso||''}}
function todayISO(offset){
  var cph = new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Copenhagen'}));
  cph.setDate(cph.getDate()+offset);
  var y=cph.getFullYear();
  var m=String(cph.getMonth()+1).padStart(2,'0');
  var d=String(cph.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+d;
}
function isKnockout(m){return !m.group || !/^Gruppe /.test(m.stage||'')}
function sortAsc(a,b){return (a.danishDateTime||'').localeCompare(b.danishDateTime||'')}
function sortDesc(a,b){return (b.danishDateTime||'').localeCompare(a.danishDateTime||'')}
function setStatus(t){var el=byId('updated'); if(el) el.textContent=t}
function channelBadge(m){var ch=m.channel||'Kanal afventer'; var pending=(ch==='Kanal afventer'||m.channelStatus==='pending_tv2'); return '<span class="badge '+(pending?'pending':'')+'">'+esc(ch)+'</span>'}
function parseScorerList(text, team){
  if(!text) return [];
  return String(text).split(/[;|]/).map(function(raw){
    var s=raw.trim();
    if(!s) return null;
    var minute='';
    var m=s.match(/(\d+\+?\d*)\s*['’]?/);
    if(m){ minute=m[1]+"'"; s=s.replace(m[0],'').trim(); }
    s=s.replace(/^[-:,\s]+|[-:,\s]+$/g,'');
    return {team:team||'', player:s, minute:minute};
  }).filter(Boolean);
}
function getGoals(m){
  var goals=[];
  if(Array.isArray(m.goals)){
    m.goals.forEach(function(g){goals.push({team:g.team||'', player:g.player||g.name||'', minute:g.minute||'', note:g.note||'', ownGoal:!!g.ownGoal});});
  } else if(typeof m.goals==='string') {
    goals=goals.concat(parseScorerList(m.goals,''));
  }
  goals=goals.concat(parseScorerList(m.homeScorers, m.homeTeam));
  goals=goals.concat(parseScorerList(m.awayScorers, m.awayTeam));
  if(!goals.length && m.scorers){ goals=goals.concat(parseScorerList(m.scorers, '')); }
  return goals.filter(function(g){return g.player;});
}
function goalsHtml(m){
  var goals=getGoals(m);
  var h='<div class="goalDetails">';
  if(goals.length){
    h+='<div class="detailTitle">Målscorere</div><ul class="goalList">';
    goals.forEach(function(g){h+='<li><span>'+esc(g.player)+'</span><em>'+esc((g.team?g.team+' · ':'')+(g.minute||'')+(g.ownGoal?' · selvmål':'')+(g.note?' · '+g.note:''))+'</em></li>'});
    h+='</ul>';
  } else if(m.status==='finished' && m.homeScore!=null){
    h+='<div class="detailTitle">Målscorere</div><p class="empty">Målscorere er ikke lagt ind for denne kamp endnu.</p>';
  } else {
    h+='<div class="detailTitle">Kampdetaljer</div><p class="empty">Målscorere vises her, når kampen er spillet og data er opdateret.</p>';
  }
  h+='<div class="detailMeta">'+esc(m.stadium)+', '+esc(m.city)+' · '+esc(m.channel||'Kanal afventer')+'</div></div>';
  return h;
}
function card(m){var score=(m.status==='finished'&&m.homeScore!=null)?' '+m.homeScore+' - '+m.awayScore:''; return '<details class="card '+(m.status==='finished'?'finished':'')+'"><summary class="matchSummary"><div class="meta"><span>'+esc(m.danishTime)+'</span><span>·</span><span>'+esc(m.group||m.stage)+'</span><span>·</span>'+channelBadge(m)+'</div><div class="teams">'+esc(m.homeTeam)+' - '+esc(m.awayTeam)+score+'</div><div class="venue">'+esc(m.stadium)+', '+esc(m.city)+' · Lokal tid '+esc(m.localTime)+'</div><div class="tapHint">Tryk for målscorere</div></summary>'+goalsHtml(m)+'</details>'}
function renderMini(el,title,items){if(!el)return; var h='<div class="subhead">'+esc(title)+'</div>'; if(!items.length)h+='<p class="empty">Ingen kampe.</p>'; else items.forEach(function(m){h+=card(m)}); el.innerHTML=h}
function grouped(el,list){if(!el)return; if(!list.length){el.innerHTML='<p class="empty">Ingen kampe matcher valget.</p>'; return} var h='', cur=''; list.sort(sortAsc).forEach(function(m){if(m.danishDate!==cur){cur=m.danishDate; h+='<div class="dateHead">'+fmtDate(cur)+'</div>'} h+=card(m)}); el.innerHTML=h}
function unique(arr){var o={}; arr.forEach(function(x){if(x)o[x]=1}); return Object.keys(o).sort(function(a,b){return a.localeCompare(b,'da')})}
function addOptions(id,vals){var el=byId(id); if(!el)return; vals.forEach(function(v){var opt=document.createElement('option'); opt.value=v; opt.textContent=v; el.appendChild(opt)})}
function populateFilters(){var teams=[],stages=[],venues=[],channels=[]; DATA.matches.forEach(function(m){teams.push(m.homeTeam,m.awayTeam); stages.push(m.group||m.stage); venues.push(m.city,m.stadium); channels.push(m.channel||'Kanal afventer')}); addOptions('teamFilter',unique(teams)); addOptions('stageFilter',unique(stages)); addOptions('venueFilter',unique(venues)); addOptions('channelFilter',unique(channels))}
function val(id){var el=byId(id); return el?el.value:''}
function applyFilters(list){var team=val('teamFilter'),stage=val('stageFilter'),venue=val('venueFilter'),channel=val('channelFilter'); return list.filter(function(m){return (!team||m.homeTeam===team||m.awayTeam===team)&&(!stage||m.stage===stage||m.group===stage)&&(!venue||m.city===venue||m.stadium===venue)&&(!channel||(m.channel||'Kanal afventer')===channel)})}
function updateFilterSummary(){var parts=[]; ['teamFilter','stageFilter','venueFilter','channelFilter'].forEach(function(id){var v=val(id); if(v)parts.push(v)}); byId('filterSummary').textContent=parts.length?parts.join(' · '):'Vis filtre'}
function setPanelVisibility(){var simple=currentFilter==='all'&&!val('teamFilter')&&!val('stageFilter')&&!val('venueFilter')&&!val('channelFilter'); byId('nowNextPanel').style.display=simple?'block':'none'; byId('recentPanel').style.display=simple?'block':'none'}
function renderMatches(){var t=todayISO(0),tm=todayISO(1),all=DATA.matches.slice(); var today=all.filter(function(m){return m.danishDate===t}).sort(sortAsc); var tomorrow=all.filter(function(m){return m.danishDate===tm}).sort(sortAsc); var finished=all.filter(function(m){return m.status==='finished'}).sort(sortDesc); renderMini(byId('todayList'),'I dag',today); renderMini(byId('tomorrowList'),'I morgen',tomorrow); byId('recentResults').innerHTML=finished.slice(0,6).map(card).join('')||'<p class="empty">Ingen resultater endnu.</p>'; var list=all.filter(function(m){return m.status!=='finished'}), title='Alle kommende kampe'; if(currentFilter==='today'){list=today; title='Kampe i dag'} if(currentFilter==='tomorrow'){list=tomorrow; title='Kampe i morgen'} if(currentFilter==='upcoming'){list=all.filter(function(m){return m.status!=='finished'}); title='Alle kommende kampe'} if(currentFilter==='finished'){list=all.filter(function(m){return m.status==='finished'}); title='Resultatarkiv'} if(currentFilter==='knockout'){list=all.filter(isKnockout); title='Slutspilskampe'} list=applyFilters(list); byId('listTitle').textContent=title; setPanelVisibility(); updateFilterSummary(); grouped(byId('matchList'),list)}
function renderStandings(){var groups=unique(DATA.matches.map(function(m){return m.group}).filter(Boolean)); var h=''; groups.forEach(function(g){var teams={}; DATA.matches.filter(function(m){return m.group===g}).forEach(function(m){[m.homeTeam,m.awayTeam].forEach(function(t){if(!teams[t])teams[t]={team:t,k:0,p:0,for:0,against:0,diff:0}}); if(m.status==='finished'&&m.homeScore!=null){var home=teams[m.homeTeam], away=teams[m.awayTeam]; home.k++; away.k++; home.for+=m.homeScore; home.against+=m.awayScore; away.for+=m.awayScore; away.against+=m.homeScore; if(m.homeScore>m.awayScore)home.p+=3; else if(m.homeScore<m.awayScore)away.p+=3; else{home.p++; away.p++} home.diff=home.for-home.against; away.diff=away.for-away.against;} }); var rows=Object.values(teams).sort(function(a,b){return b.p-a.p||b.diff-a.diff||b.for-a.for||a.team.localeCompare(b.team,'da')}); h+='<div class="standingGroup"><h3>'+esc(g)+'</h3><table class="standingTable"><thead><tr><th>Hold</th><th>K</th><th>P</th><th>Mål</th></tr></thead><tbody>'+rows.map(function(r){return '<tr><td>'+esc(r.team)+'</td><td>'+r.k+'</td><td>'+r.p+'</td><td>'+r.for+':'+r.against+'</td></tr>'}).join('')+'</tbody></table></div>'}); byId('standingsList').innerHTML=h}
function renderKnockout(){grouped(byId('knockoutList'),DATA.matches.filter(isKnockout))}
function fmtOdds(x){return x==null?'Opdateres':String(x).replace('.',',')}
function renderFavorites(){var h=''; (DATA.winnerFavorites||[]).forEach(function(f){h+='<article class="favoriteCard"><div class="favoriteTop"><strong>'+esc(f.team)+'</strong><span class="odds">Oddset '+esc(fmtOdds(f.oddsetOdds))+'</span></div><div class="venue">Prediction market: '+esc(f.predictionMarket||'Opdateres')+'</div><p class="muted">'+esc(f.comment||'')+'</p><div class="sourceLine">Kilde/ramme: Oddset-felt og prediction-market felt opdateres som markedsdata.</div></article>'}); byId('favoritesList').innerHTML=h||'<p class="empty">Ingen favoritdata.</p>'}
function renderRules(){byId('rulesList').innerHTML=
'<article class="ruleCard"><h3>Turneringsformat</h3><ul><li>48 hold er fordelt i 12 grupper med fire hold i hver.</li><li>Nummer 1 og 2 i hver gruppe går videre.</li><li>Derudover går de otte bedste treere videre, så slutspillet starter med 32 hold.</li></ul></article>'+ 
'<article class="ruleCard"><h3>Point og tiebreakers</h3><ul><li>Sejr giver 3 point, uafgjort 1 point, nederlag 0 point.</li><li>Ved lige point bruges først indbyrdes opgør mellem de hold, der står lige: point, målforskel og scorede mål i de indbyrdes kampe.</li><li>Hvis det stadig er lige, bruges samlet målforskel i alle gruppekampe og derefter flest scorede mål i alle gruppekampe.</li><li>Derefter bruges fair play score og til sidst FIFA rangering.</li></ul><div class="ruleNote">“Målrelaterede kriterier” betyder altså både målforskel og antal scorede mål, først i indbyrdes kampe og senere samlet i gruppen.</div></article>'+ 
'<article class="ruleCard"><h3>Advarsler og karantæner</h3><ul><li>To gule kort i forskellige kampe giver karantæne i næste kamp.</li><li>Gule kort nulstilles efter gruppespillet.</li><li>Gule kort nulstilles igen efter kvartfinalerne.</li><li>Rødt kort giver som udgangspunkt karantæne i næste kamp og kan udløse længere straf.</li></ul><div class="ruleNote">Praktisk konsekvens: et gult kort fra gruppespillet bæres ikke med ind i knockoutfasen.</div></article>'+ 
'<article class="ruleCard"><h3>Slutspil</h3><ul><li>Fra sekstendedelsfinalerne skal alle kampe have en vinder.</li><li>Ved uafgjort efter 90 minutter spilles 2 x 15 minutters forlænget spilletid.</li><li>Er der stadig uafgjort, afgøres kampen på straffespark.</li></ul></article>'+ 
'<article class="ruleCard"><h3>Nye og kuriøse regler</h3><ul><li>Dommeren kan bruge en synlig femsekunders nedtælling ved forsinkede indkast og målspark.</li><li>Ved for langsom igangsættelse kan modstanderen få bolden eller hjørnespark afhængigt af situationen.</li><li>Udskiftede spillere skal som udgangspunkt forlade banen hurtigt; overskrides fristen, kan indskifteren blive forsinket.</li><li>VAR kan bruges bredere end tidligere, blandt andet ved flere typer kendelser omkring kort, identitet og situationer før mål eller dødbolde.</li><li>Fem udskiftninger er normalt rammen i ordinær spilletid; i forlænget spilletid gives der typisk en ekstra mulighed.</li></ul></article>'+ 
'<article class="ruleCard"><h3>Praktisk brug</h3><ul><li>Fanen Kampe er til hurtig mobilbrug.</li><li>Tabeller beregnes ud fra indtastede resultater.</li><li>Kanaler og målscorere kan opdateres løbende, når officielle kilder ændrer sig.</li></ul></article>'}
function collectGoalRows(){var rows=[];(DATA.matches||[]).forEach(function(m){getGoals(m).forEach(function(g){var name=(g.player||'').replace(/\s*\((selvmål|own goal|og)\)\s*/i,'').trim(); if(!name||g.ownGoal||/selvmål|own goal|\bog\b/i.test(g.player)) return; rows.push({player:name,team:g.team||'',match:m.homeTeam+' - '+m.awayTeam});});});return rows}
function renderScorers(){var el=byId('scorersList'); if(!el)return; var counts={}; collectGoalRows().forEach(function(g){var key=g.player+'|'+g.team; if(!counts[key])counts[key]={player:g.player,team:g.team,goals:0}; counts[key].goals++;}); var rows=Object.values(counts).sort(function(a,b){return b.goals-a.goals||a.player.localeCompare(b.player,'da')}); if(!rows.length){el.innerHTML='<p class="empty">Topscorerlisten vises her, når målscorerdata er lagt ind i kampene eller livearket.</p>'; return;} var h='<div class="scorerTable"><div class="scorerRow scorerHead"><span>Spiller</span><span>Hold</span><span>Mål</span></div>'; rows.forEach(function(r){h+='<div class="scorerRow"><span>'+esc(r.player)+'</span><span>'+esc(r.team||'')+'</span><strong>'+r.goals+'</strong></div>'}); h+='</div><p class="sourceLine">Beregnet ud fra målscorere på kampkortene.</p>'; el.innerHTML=h}
function renderStructure(){
var h='';
h+='<article class="ruleCard structureImageCard"><h3>Turneringsstruktur</h3>';
h+='<div class="structureImageShell"><img src="assets/structure.svg" alt="VM 2026 turneringsstruktur" loading="eager"></div>';
h+='<p class="structureHint">Swipe vandret for at se hele strukturen. Diagrammet er nu en separat SVG frem for en stor indlejret PNG.</p>';
h+='<div class="structureQuick"><div><strong>12 grupper</strong>Top 2 går videre.</div><div><strong>8 bedste treere</strong>Fylder de sidste pladser.</div><div><strong>Knockout</strong>Runde af 32 til finale.</div></div>';
h+='</article>';
byId('structureList').innerHTML=h;
}
function parseCSVLine(line){var out=[],cur='',inQ=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}else if(ch===','&&!inQ){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;}
function parseCSV(text){var lines=text.replace(/\r/g,'').split('\n').filter(function(x){return x.trim().length;});if(!lines.length)return[];var headers=parseCSVLine(lines[0]).map(function(h){return h.trim();});var rows=[];for(var i=1;i<lines.length;i++){var vals=parseCSVLine(lines[i]);var obj={};headers.forEach(function(h,idx){obj[h]=vals[idx]||''});rows.push(obj);}return rows;}
function applyLiveOverrides(rows){var updatedAt='';var byMatch={};DATA.matches.forEach(function(m){byMatch[String(m.matchNumber)]=m;});rows.forEach(function(r){if(r.matchNumber==='meta'&&r.status==='generatedAt'){updatedAt=r.homeScore||r.awayScore||r.lastUpdated||updatedAt;return;}var id=String(r.matchNumber||'').trim();var m=byMatch[id];if(!m)return;if(r.status)m.status=r.status;if(r.homeScore!==undefined&&r.homeScore!=='')m.homeScore=Number(r.homeScore);if(r.awayScore!==undefined&&r.awayScore!=='')m.awayScore=Number(r.awayScore);if(r.lastUpdated){m.lastUpdated=r.lastUpdated;updatedAt=r.lastUpdated;}['homeScorers','awayScorers','scorers','goals'].forEach(function(k){if(r[k])m[k]=r[k];});});if(updatedAt)DATA.meta.generatedAt=updatedAt;return updatedAt;}
async function loadLiveOverrides(){if(!LIVE_OVERRIDES_CSV_URL||LIVE_OVERRIDES_CSV_URL.indexOf('docs.google.com')===-1)return false;try{setStatus('Henter live data...');var url=LIVE_OVERRIDES_CSV_URL+(LIVE_OVERRIDES_CSV_URL.indexOf('?')>-1?'&':'?')+'cacheBust='+Date.now();var res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);var csv=await res.text();var rows=parseCSV(csv);if(!rows.length)throw new Error('Tom CSV');applyLiveOverrides(rows);setStatus('Senest opdateret '+fmtUpdated(DATA.meta.generatedAt)+' · live data');return true;}catch(e){console.warn('Live data kunne ikke hentes',e);setStatus('Senest opdateret '+fmtUpdated(DATA.meta.generatedAt)+' · offline fallback');return false;}}
function switchView(view,keepPosition){document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.view===view);});document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active');});var target=byId(view+'View');if(target){target.classList.add('active');}if(!keepPosition){window.scrollTo({top:0,behavior:'smooth'});}}
async function init(){await loadBaseData();await loadLiveOverrides();populateFilters();renderMatches();renderStandings();renderKnockout();renderStructure();renderFavorites();renderRules();renderScorers();document.querySelectorAll('.tab').forEach(function(b){b.addEventListener('click',function(){switchView(this.dataset.view)})});document.querySelectorAll('.chip').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.chip').forEach(function(c){c.classList.remove('active')});this.classList.add('active');currentFilter=this.dataset.filter;switchView('matches',true);renderMatches();byId('listPanel').scrollIntoView({behavior:'smooth',block:'start'})})});['teamFilter','stageFilter','venueFilter','channelFilter'].forEach(function(id){var e=byId(id);if(e)e.addEventListener('change',function(){renderMatches();byId('listPanel').scrollIntoView({behavior:'smooth',block:'start'})})});byId('clearFilters').addEventListener('click',function(){['teamFilter','stageFilter','venueFilter','channelFilter'].forEach(function(id){byId(id).value=''});currentFilter='all';document.querySelectorAll('.chip').forEach(function(c){c.classList.toggle('active',c.dataset.filter==='all')});renderMatches()});byId('filterToggle').addEventListener('click',function(){byId('filterShell').classList.toggle('open')});}
init();
