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
function setStatus(t){byId('updated').textContent=t}
function channelBadge(m){var ch=m.channel||'Kanal afventer'; var pending=(ch==='Kanal afventer'||m.channelStatus==='pending_tv2'); return '<span class="badge '+(pending?'pending':'')+'">'+esc(ch)+'</span>'}
function card(m){var score=(m.status==='finished'&&m.homeScore!=null)?' '+m.homeScore+' - '+m.awayScore:''; return '<article class="card '+(m.status==='finished'?'finished':'')+'"><div class="meta"><span>'+esc(m.danishTime)+'</span><span>·</span><span>'+esc(m.group||m.stage)+'</span><span>·</span>'+channelBadge(m)+'</div><div class="teams">'+esc(m.homeTeam)+' - '+esc(m.awayTeam)+score+'</div><div class="venue">'+esc(m.stadium)+', '+esc(m.city)+' · Lokal tid '+esc(m.localTime)+'</div></article>'}
function renderMini(el,title,items){if(!el)return; var h='<div class="subhead">'+esc(title)+'</div>'; if(!items.length)h+='<p class="empty">Ingen kampe.</p>'; else items.forEach(function(m){h+=card(m)}); el.innerHTML=h}
function grouped(el,list){if(!el)return; if(!list.length){el.innerHTML='<p class="empty">Ingen kampe matcher valget.</p>'; return} var h='', cur=''; list.sort(sortAsc).forEach(function(m){if(m.danishDate!==cur){cur=m.danishDate; h+='<div class="dateHead">'+fmtDate(cur)+'</div>'} h+=card(m)}); el.innerHTML=h}
function unique(arr){var o={}; arr.forEach(function(x){if(x)o[x]=1}); return Object.keys(o).sort(function(a,b){return a.localeCompare(b,'da')})}
function addOptions(id,vals){var el=byId(id); if(!el)return; vals.forEach(function(v){var opt=document.createElement('option'); opt.value=v; opt.textContent=v; el.appendChild(opt)})}
function populateFilters(){var teams=[],stages=[],venues=[],channels=[]; DATA.matches.forEach(function(m){teams.push(m.homeTeam,m.awayTeam); stages.push(m.group||m.stage); venues.push(m.city,m.stadium); channels.push(m.channel||'Kanal afventer')}); addOptions('teamFilter',unique(teams)); addOptions('stageFilter',unique(stages)); addOptions('venueFilter',unique(venues)); addOptions('channelFilter',unique(channels))}
function val(id){var el=byId(id); return el?el.value:''}
function applyFilters(list){var team=val('teamFilter'),stage=val('stageFilter'),venue=val('venueFilter'),channel=val('channelFilter'); return list.filter(function(m){return (!team||m.homeTeam===team||m.awayTeam===team)&&(!stage||m.stage===stage||m.group===stage)&&(!venue||m.city===venue||m.stadium===venue)&&(!channel||(m.channel||'Kanal afventer')===channel)})}
function updateFilterSummary(){var parts=[]; ['teamFilter','stageFilter','venueFilter','channelFilter'].forEach(function(id){var v=val(id); if(v)parts.push(v)}); byId('filterSummary').textContent=parts.length?parts.join(' · '):'Vis filtre'}
function setPanelVisibility(){var simple=currentFilter==='all'&&!val('teamFilter')&&!val('stageFilter')&&!val('venueFilter')&&!val('channelFilter'); byId('nowNextPanel').style.display=simple?'block':'none'; byId('recentPanel').style.display=simple?'block':'none'}
function renderMatches(){var t=todayISO(0),tm=todayISO(1),all=DATA.matches.slice(); var today=all.filter(m=>m.danishDate===t).sort(sortAsc); var tomorrow=all.filter(m=>m.danishDate===tm).sort(sortAsc); var finished=all.filter(m=>m.status==='finished').sort(sortDesc); renderMini(byId('todayList'),'I dag',today); renderMini(byId('tomorrowList'),'I morgen',tomorrow); byId('recentResults').innerHTML=finished.slice(0,6).map(card).join('')||'<p class="empty">Ingen resultater endnu.</p>'; var list=all.filter(m=>m.status!=='finished'), title='Alle kommende kampe'; if(currentFilter==='today'){list=today; title='Kampe i dag'} if(currentFilter==='tomorrow'){list=tomorrow; title='Kampe i morgen'} if(currentFilter==='upcoming'){list=all.filter(m=>m.status!=='finished'); title='Alle kommende kampe'} if(currentFilter==='finished'){list=all.filter(m=>m.status==='finished'); title='Resultatarkiv'} if(currentFilter==='knockout'){list=all.filter(isKnockout); title='Slutspilskampe'} list=applyFilters(list); byId('listTitle').textContent=title; setPanelVisibility(); updateFilterSummary(); grouped(byId('matchList'),list)}
function renderStandings(){var groups=unique(DATA.matches.map(m=>m.group).filter(Boolean)); var h=''; groups.forEach(function(g){var teams={}; DATA.matches.filter(m=>m.group===g).forEach(function(m){[m.homeTeam,m.awayTeam].forEach(t=>{if(!teams[t])teams[t]={team:t,k:0,p:0,for:0,against:0,diff:0}}); if(m.status==='finished'&&m.homeScore!=null){var home=teams[m.homeTeam], away=teams[m.awayTeam]; home.k++; away.k++; home.for+=m.homeScore; home.against+=m.awayScore; away.for+=m.awayScore; away.against+=m.homeScore; if(m.homeScore>m.awayScore)home.p+=3; else if(m.homeScore<m.awayScore)away.p+=3; else{home.p++; away.p++} home.diff=home.for-home.against; away.diff=away.for-away.against;} }); var rows=Object.values(teams).sort((a,b)=>b.p-a.p||b.diff-a.diff||b.for-a.for||a.team.localeCompare(b.team,'da')); h+='<div class="standingGroup"><h3>'+esc(g)+'</h3><table class="standingTable"><thead><tr><th>Hold</th><th>K</th><th>P</th><th>Mål</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.team)+'</td><td>'+r.k+'</td><td>'+r.p+'</td><td>'+r.for+':'+r.against+'</td></tr>').join('')+'</tbody></table></div>'}); byId('standingsList').innerHTML=h}
function renderKnockout(){grouped(byId('knockoutList'),DATA.matches.filter(isKnockout))}
function fmtOdds(x){return x==null?'Opdateres':String(x).replace('.',',')}
function renderFavorites(){var h=''; (DATA.winnerFavorites||[]).forEach(function(f){h+='<article class="favoriteCard"><div class="favoriteTop"><strong>'+esc(f.team)+'</strong><span class="odds">Oddset '+esc(fmtOdds(f.oddsetOdds))+'</span></div><div class="venue">Prediction market: '+esc(f.predictionMarket||'Opdateres')+'</div><p class="muted">'+esc(f.comment||'')+'</p><div class="sourceLine">Kilde/ramme: Oddset-felt og prediction-market felt opdateres som markedsdata.</div></article>'}); byId('favoritesList').innerHTML=h||'<p class="empty">Ingen favoritdata.</p>'}
function renderRules(){byId('rulesList').innerHTML=
'<article class="ruleCard"><h3>Turneringsformat</h3><ul><li>48 hold er fordelt i 12 grupper med fire hold i hver.</li><li>Nummer 1 og 2 i hver gruppe går videre.</li><li>Derudover går de otte bedste treere videre, så slutspillet starter med 32 hold.</li></ul></article>'+ 
'<article class="ruleCard"><h3>Point og tiebreakers</h3><ul><li>Sejr giver 3 point, uafgjort 1 point, nederlag 0 point.</li><li>Ved lige point bruges først indbyrdes opgør mellem de hold, der står lige: point, målforskel og scorede mål i de indbyrdes kampe.</li><li>Hvis det stadig er lige, bruges samlet målforskel i alle gruppekampe og derefter flest scorede mål i alle gruppekampe.</li><li>Derefter bruges fair play score og til sidst FIFA rangering.</li></ul><div class="ruleNote">“Målrelaterede kriterier” betyder altså både målforskel og antal scorede mål, først i indbyrdes kampe og senere samlet i gruppen.</div></article>'+ 
'<article class="ruleCard"><h3>Slutspil</h3><ul><li>Fra sekstendedelsfinalerne skal alle kampe have en vinder.</li><li>Ved uafgjort efter 90 minutter spilles 2 x 15 minutters forlænget spilletid.</li><li>Er der stadig uafgjort, afgøres kampen på straffespark.</li></ul></article>'+ 
'<article class="ruleCard"><h3>Nye og kuriøse regler</h3><ul><li>Dommeren kan bruge en synlig femsekunders nedtælling ved forsinkede indkast og målspark.</li><li>Ved for langsom igangsættelse kan modstanderen få bolden eller hjørnespark afhængigt af situationen.</li><li>Udskiftede spillere skal som udgangspunkt forlade banen hurtigt; overskrides fristen, kan indskifteren blive forsinket.</li><li>VAR kan bruges bredere end tidligere, blandt andet ved flere typer kendelser omkring kort, identitet og situationer før mål eller dødbolde.</li><li>Fem udskiftninger er normalt rammen i ordinær spilletid; i forlænget spilletid gives der typisk en ekstra mulighed.</li></ul></article>'+ 
'<article class="ruleCard"><h3>Praktisk brug</h3><ul><li>Fanen Kampe er til hurtig mobilbrug.</li><li>Tabeller beregnes ud fra indtastede resultater.</li><li>Kanaler og odds bør opdateres løbende, når officielle kilder ændrer sig.</li></ul></article>'}

function renderStructure(){
var h='';
h+='<article class="ruleCard structureImageCard"><h3>Turneringsstruktur</h3>';
h+='<div class="structureImageShell"><img src="assets/structure.svg" alt="VM 2026 turneringsstruktur" loading="eager"></div>';
h+='<p class="structureHint">Swipe vandret for at se hele strukturen. Diagrammet er nu en separat SVG frem for en stor indlejret PNG.</p>';
h+='<div class="structureQuick"><div><strong>12 grupper</strong>Top 2 går videre.</div><div><strong>8 bedste treere</strong>Fylder de sidste pladser.</div><div><strong>Knockout</strong>Runde af 32 til finale.</div></div>';
h+='</article>';
byId('structureList').innerHTML=h;
}


function parseCSVLine(line){
  var out=[], cur='', inQ=false;
  for(var i=0;i<line.length;i++){
    var ch=line[i];
    if(ch==='"'){
      if(inQ && line[i+1]==='"'){cur+='"'; i++;}
      else inQ=!inQ;
    } else if(ch===',' && !inQ){
      out.push(cur); cur='';
    } else cur+=ch;
  }
  out.push(cur);
  return out;
}
function parseCSV(text){
  var lines=text.replace(/\r/g,'').split('\n').filter(function(x){return x.trim().length;});
  if(!lines.length) return [];
  var headers=parseCSVLine(lines[0]).map(function(h){return h.trim();});
  var rows=[];
  for(var i=1;i<lines.length;i++){
    var vals=parseCSVLine(lines[i]);
    var obj={};
    headers.forEach(function(h,idx){obj[h]=vals[idx]||''});
    rows.push(obj);
  }
  return rows;
}
function applyLiveOverrides(rows){
  var updatedAt = '';
  var byMatch = {};
  DATA.matches.forEach(function(m){ byMatch[String(m.matchNumber)] = m; });
  rows.forEach(function(r){
    if(r.matchNumber === 'meta' && r.status === 'generatedAt'){
      updatedAt = r.homeScore || r.awayScore || r.lastUpdated || updatedAt;
      return;
    }
    var id = String(r.matchNumber || '').trim();
    var m = byMatch[id];
    if(!m) return;
    if(r.status) m.status = r.status;
    if(r.homeScore !== '') m.homeScore = Number(r.homeScore);
    if(r.awayScore !== '') m.awayScore = Number(r.awayScore);
    if(r.lastUpdated) { m.lastUpdated = r.lastUpdated; updatedAt = r.lastUpdated; }
  });
  if(updatedAt) DATA.meta.generatedAt = updatedAt;
  return updatedAt;
}
async function loadLiveOverrides(){
  if(!LIVE_OVERRIDES_CSV_URL || LIVE_OVERRIDES_CSV_URL.indexOf('docs.google.com') === -1) return false;
  try{
    setStatus('Henter live data...');
    var url = LIVE_OVERRIDES_CSV_URL + (LIVE_OVERRIDES_CSV_URL.indexOf('?')>-1?'&':'?') + 'cacheBust=' + Date.now();
    var res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    var csv = await res.text();
    var rows = parseCSV(csv);
    if(!rows.length) throw new Error('Tom CSV');
    var updatedAt = applyLiveOverrides(rows);
    setStatus('Senest opdateret '+fmtUpdated(DATA.meta.generatedAt)+' · live data');
    return true;
  } catch(e){
    console.warn('Live data kunne ikke hentes', e);
    setStatus('Senest opdateret '+fmtUpdated(DATA.meta.generatedAt)+' · offline fallback');
    return false;
  }
}

function switchView(view, keepPosition){
  document.querySelectorAll('.tab').forEach(function(t){ t.classList.toggle('active', t.dataset.view===view); });
  document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
  var target = byId(view + 'View');
  if(target){ target.classList.add('active'); }
  if(!keepPosition){ window.scrollTo({top:0, behavior:'smooth'}); }
}

async function init(){
  await loadBaseData();
  await loadLiveOverrides();
  populateFilters();
  renderMatches();
  renderStandings();
  renderKnockout();
  renderStructure();
  renderFavorites();
  renderRules();
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',function(){switchView(this.dataset.view)}));
  document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',function(){document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active')); this.classList.add('active'); currentFilter=this.dataset.filter; switchView('matches',true); renderMatches(); byId('listPanel').scrollIntoView({behavior:'smooth',block:'start'})}));
  ['teamFilter','stageFilter','venueFilter','channelFilter'].forEach(id=>{var e=byId(id); if(e)e.addEventListener('change',function(){renderMatches(); byId('listPanel').scrollIntoView({behavior:'smooth',block:'start'})})});
  byId('clearFilters').addEventListener('click',function(){['teamFilter','stageFilter','venueFilter','channelFilter'].forEach(id=>byId(id).value=''); currentFilter='all'; document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.filter==='all')); renderMatches()});
  byId('filterToggle').addEventListener('click',function(){byId('filterShell').classList.toggle('open')});
}
init();