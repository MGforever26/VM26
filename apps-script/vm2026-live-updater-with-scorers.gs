const SPREADSHEET_ID = '1fD9MCOrVhq_Iz-bl0Oky7Dji9J3BiHtNoyaocZNg05Y';
const LIVE_SHEET = 'Sheet1';
const FIXTURE_KEY_SHEET = 'Fixture key';
const AUDIT_SHEET = 'Result audit';
const CPH_TZ = 'Europe/Copenhagen';

function installWorldCupUpdater() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'updateWorldCupResults') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateWorldCupResults').timeBased().everyMinutes(5).create();
  updateWorldCupResults();
}

function updateWorldCupResults() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const live = ss.getSheetByName(LIVE_SHEET);
  const fixtures = readFixtureKey_(ss.getSheetByName(FIXTURE_KEY_SHEET));
  ensureLiveHeaders_(live);

  const existing = readExistingLiveRows_(live);
  const nowIso = Utilities.formatDate(new Date(), CPH_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const outputByMatch = Object.assign({}, existing.byMatch);
  let changed = false;

  fixtures.forEach(function(fx) {
    if (!fx.eventId) return;
    const summary = fetchEspnSummary_(fx.eventId);
    if (!summary) return;

    const comp = getCompetition_(summary);
    if (!comp || !Array.isArray(comp.competitors)) return;
    const status = comp.status && comp.status.type ? comp.status.type : {};
    const isComplete = status.completed === true || /final|full time|complete/i.test(String(status.description || status.detail || status.name || ''));
    if (!isComplete) return;

    const scores = getScores_(comp, fx);
    if (!scores) return;

    const expectedGoals = Number(scores.homeScore) + Number(scores.awayScore);
    const goals = getGoalsFromSummary_(summary, fx);
    const scorerFields = buildScorerFields_(goals, expectedGoals, fx);

    const oldRow = outputByMatch[String(fx.matchNumber)] || {};
    const nextRow = {
      matchNumber: String(fx.matchNumber),
      status: 'finished',
      homeScore: String(scores.homeScore),
      awayScore: String(scores.awayScore),
      lastUpdated: nowIso,
      note: fx.homeTeam + ' - ' + fx.awayTeam + '; ESPN structured scoreboard',
      homeScorers: scorerFields.homeScorers || oldRow.homeScorers || '',
      awayScorers: scorerFields.awayScorers || oldRow.awayScorers || '',
      scorers: scorerFields.scorers || oldRow.scorers || '',
      goals: scorerFields.goals || oldRow.goals || ''
    };

    if (!sameRow_(oldRow, nextRow)) {
      outputByMatch[String(fx.matchNumber)] = nextRow;
      appendAudit_(ss, nowIso, 'update finished match', fx.matchNumber, fx.homeTeam + ' - ' + fx.awayTeam, scores.homeScore + '-' + scores.awayScore, scorerFields.goals || 'no verified scorer data', 'ESPN summary/scoreboard', 'Sheet1 A:J');
      changed = true;
    }
  });

  if (changed || !existing.hasCorrectHeaders) writeLiveRows_(live, outputByMatch, nowIso);
  else writeMetaOnly_(live, nowIso);
}

function ensureLiveHeaders_(sheet) {
  const headers = ['matchNumber','status','homeScore','awayScore','lastUpdated','note','homeScorers','awayScorers','scorers','goals'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function readExistingLiveRows_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0] || [];
  const idx = {};
  headers.forEach(function(h, i) { idx[h] = i; });
  const required = ['matchNumber','status','homeScore','awayScore','lastUpdated','note','homeScorers','awayScorers','scorers','goals'];
  const hasCorrectHeaders = required.every(function(h) { return idx[h] !== undefined; });
  const byMatch = {};
  values.slice(1).forEach(function(row) {
    const matchNumber = row[idx.matchNumber] || row[0];
    if (!matchNumber || matchNumber === 'meta') return;
    byMatch[String(matchNumber)] = {
      matchNumber: String(matchNumber),
      status: row[idx.status] || row[1] || '',
      homeScore: row[idx.homeScore] || row[2] || '',
      awayScore: row[idx.awayScore] || row[3] || '',
      lastUpdated: row[idx.lastUpdated] || row[4] || '',
      note: row[idx.note] || row[5] || '',
      homeScorers: row[idx.homeScorers] || '',
      awayScorers: row[idx.awayScorers] || '',
      scorers: row[idx.scorers] || '',
      goals: row[idx.goals] || ''
    };
  });
  return { byMatch: byMatch, hasCorrectHeaders: hasCorrectHeaders };
}

function writeLiveRows_(sheet, byMatch, nowIso) {
  const headers = ['matchNumber','status','homeScore','awayScore','lastUpdated','note','homeScorers','awayScorers','scorers','goals'];
  const rows = Object.keys(byMatch).sort(function(a, b) { return Number(a) - Number(b); }).map(function(k) {
    const r = byMatch[k];
    return headers.map(function(h) { return r[h] || ''; });
  });
  rows.push(['meta','generatedAt',nowIso,'','','Apps Script ESPN structured updater','','','','']);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function writeMetaOnly_(sheet, nowIso) {
  const values = sheet.getDataRange().getDisplayValues();
  let metaRow = -1;
  for (let i = 1; i < values.length; i++) if (values[i][0] === 'meta') metaRow = i + 1;
  if (metaRow === -1) metaRow = sheet.getLastRow() + 1;
  sheet.getRange(metaRow, 1, 1, 10).setValues([['meta','generatedAt',nowIso,'','','Apps Script ESPN structured updater','','','','']]);
}

function readFixtureKey_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0];
  const idx = {};
  headers.forEach(function(h, i) { idx[h] = i; });
  return values.slice(1).map(function(r) {
    const sourceKey = r[idx.sourceKey] || '';
    const m = String(sourceKey).match(/ESPN\s+(\d+)/i);
    return { matchNumber: r[idx.matchNumber], homeTeam: r[idx.homeTeam], awayTeam: r[idx.awayTeam], eventId: m ? m[1] : '' };
  }).filter(function(x) { return x.matchNumber && x.homeTeam && x.awayTeam; });
}

function fetchEspnSummary_(eventId) {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=' + encodeURIComponent(eventId) + '&cacheBust=' + Date.now();
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return null;
    return JSON.parse(res.getContentText());
  } catch (e) { return null; }
}

function getCompetition_(summary) {
  if (summary.header && summary.header.competitions && summary.header.competitions[0]) return summary.header.competitions[0];
  if (summary.competitions && summary.competitions[0]) return summary.competitions[0];
  return null;
}

function normalize_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function teamAlias_(s) {
  const n = normalize_(s);
  const map = {
    'usa':'united states','united states':'united states','united states of america':'united states',
    'australien':'australia','australia':'australia',
    'skotland':'scotland','scotland':'scotland',
    'marokko':'morocco','morocco':'morocco',
    'brasilien':'brazil','brazil':'brazil',
    'haiti':'haiti','tyrkiet':'turkiye','turkey':'turkiye','turkiye':'turkiye',
    'paraguay':'paraguay','mexico':'mexico','sydkorea':'south korea','south korea':'south korea','korea republic':'south korea',
    'canada':'canada','qatar':'qatar','netherlands':'netherlands','holland':'netherlands','sweden':'sweden',
    'germany':'germany','tyskland':'germany','ivory coast':'ivory coast','elfenbenskysten':'ivory coast',
    'ecuador':'ecuador','curacao':'curacao'
  };
  return map[n] || n;
}

function getScores_(comp, fx) {
  let home = null, away = null;
  (comp.competitors || []).forEach(function(c) {
    if (c.homeAway === 'home') home = c;
    if (c.homeAway === 'away') away = c;
  });
  if (!home || !away) return null;
  const espnHome = teamAlias_(home.team && (home.team.displayName || home.team.shortDisplayName || home.team.name || home.team.location));
  const espnAway = teamAlias_(away.team && (away.team.displayName || away.team.shortDisplayName || away.team.name || away.team.location));
  if (espnHome !== teamAlias_(fx.homeTeam) || espnAway !== teamAlias_(fx.awayTeam)) return null;
  return { homeScore: Number(home.score), awayScore: Number(away.score) };
}

function collectPossibleGoalPlays_(summary) {
  const plays = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const txt = [node.text, node.shortText, node.displayText, node.type && node.type.text, node.type && node.type.name].join(' ');
    if (node.scoringPlay === true || /\bgoal\b|own goal/i.test(txt)) plays.push(node);
    Object.keys(node).forEach(function(k) {
      if (['athlete','player','team','type'].indexOf(k) >= 0) return;
      if (typeof node[k] === 'object') walk(node[k]);
    });
  }
  walk(summary.scoringPlays || summary.scoringplays || []);
  walk(summary.plays || []);
  walk(summary.commentary || []);
  const comp = getCompetition_(summary);
  if (comp) { walk(comp.details || []); walk(comp.plays || []); walk(comp.commentary || []); }
  const seen = {}, out = [];
  plays.forEach(function(p) {
    const key = [p.id, p.text || p.shortText || p.displayText, JSON.stringify(p.clock || p.time || '')].join('|');
    if (seen[key]) return;
    seen[key] = true;
    out.push(p);
  });
  return out;
}

function cleanMinute_(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const stoppage = s.match(/(\d+)\s*\+\s*(\d+)/);
  if (stoppage) return stoppage[1] + '+' + stoppage[2] + "'";
  const m = s.match(/\d+/);
  return m ? m[0] + "'" : '';
}

function clockToMinute_(play) {
  const candidates = [play.clock, play.time, play.periodClock, play.displayTime, play.timeDisplay, play.minute];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c) continue;
    if (typeof c === 'object') {
      const d = c.displayValue || c.display || c.text || c.shortDisplayValue || '';
      const cd = cleanMinute_(d);
      if (cd) return cd;
      if (typeof c.value === 'number' && c.value > 0) return Math.ceil(c.value / 60) + "'";
    } else {
      const x = cleanMinute_(c);
      if (x) return x;
    }
  }
  const text = play.text || play.shortText || play.displayText || '';
  const tm = text.match(/\b(\d{1,3})(?:\s*\+\s*(\d{1,2}))?['’]/);
  if (tm) return tm[1] + (tm[2] ? '+' + tm[2] : '') + "'";
  return '';
}

function firstPlayer_(play) {
  const direct = [play.athlete, play.player, play.scorer, play.shooter];
  for (let d = 0; d < direct.length; d++) {
    const node = direct[d];
    if (node && (node.displayName || node.fullName || node.shortName)) return node.displayName || node.fullName || node.shortName;
  }
  const pools = [play.athletesInvolved, play.participants, play.involvedAthletes, play.athletes];
  for (let i = 0; i < pools.length; i++) {
    const arr = pools[i];
    if (!Array.isArray(arr)) continue;
    for (let j = 0; j < arr.length; j++) {
      const a = arr[j];
      if (!a) continue;
      if (a.displayName || a.fullName || a.shortName) return a.displayName || a.fullName || a.shortName;
      if (a.athlete && (a.athlete.displayName || a.athlete.fullName || a.athlete.shortName)) return a.athlete.displayName || a.athlete.fullName || a.athlete.shortName;
      if (a.player && (a.player.displayName || a.player.fullName || a.player.shortName)) return a.player.displayName || a.player.fullName || a.player.shortName;
    }
  }
  const txt = play.text || play.shortText || play.displayText || '';
  const m = txt.match(/^([^,(]+?)\s*(?:\(|,| scores| scored| Goal| goal)/i);
  return m ? m[1].trim() : '';
}

function buildTeamMap_(summary, fx) {
  const comp = getCompetition_(summary);
  const map = {};
  if (comp && Array.isArray(comp.competitors)) {
    comp.competitors.forEach(function(c) {
      const side = c.homeAway === 'home' ? fx.homeTeam : c.homeAway === 'away' ? fx.awayTeam : '';
      if (!side || !c.team) return;
      if (c.team.id) map[String(c.team.id)] = side;
      [c.team.displayName, c.team.shortDisplayName, c.team.name, c.team.abbreviation, c.team.location].forEach(function(n) { if (n) map[teamAlias_(n)] = side; });
    });
  }
  map[teamAlias_(fx.homeTeam)] = fx.homeTeam;
  map[teamAlias_(fx.awayTeam)] = fx.awayTeam;
  return map;
}

function teamForPlay_(play, teamMap, fx) {
  const team = play.team || play.competitor || {};
  if (team) {
    if (team.id && teamMap[String(team.id)]) return teamMap[String(team.id)];
    const names = [team.displayName, team.shortDisplayName, team.name, team.abbreviation, team.location];
    for (let i = 0; i < names.length; i++) if (names[i] && teamMap[teamAlias_(names[i])]) return teamMap[teamAlias_(names[i])];
  }
  const text = normalize_([play.text, play.shortText, play.displayText].join(' '));
  if (text.indexOf(normalize_(fx.homeTeam)) >= 0 || text.indexOf(teamAlias_(fx.homeTeam)) >= 0) return fx.homeTeam;
  if (text.indexOf(normalize_(fx.awayTeam)) >= 0 || text.indexOf(teamAlias_(fx.awayTeam)) >= 0) return fx.awayTeam;
  return '';
}

function getGoalsFromSummary_(summary, fx) {
  const teamMap = buildTeamMap_(summary, fx);
  const out = [];
  collectPossibleGoalPlays_(summary).forEach(function(play) {
    const player = firstPlayer_(play);
    const minute = clockToMinute_(play);
    const team = teamForPlay_(play, teamMap, fx);
    const text = [play.text, play.shortText, play.displayText].join(' ');
    if (!player || !minute || !team) return;
    out.push({ team: team, player: player, minute: minute, ownGoal: /own goal|selvmål/i.test(text) });
  });
  const seen = {}, deduped = [];
  out.forEach(function(g) {
    const key = [teamAlias_(g.team), g.player, g.minute, g.ownGoal ? 'og' : ''].join('|').toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    deduped.push(g);
  });
  return deduped;
}

function scorerText_(g) { return g.player + ' ' + g.minute + (g.ownGoal ? ' selvmål' : ''); }

function buildScorerFields_(goals, expectedGoals, fx) {
  if (!goals || goals.length !== expectedGoals || goals.some(function(g) { return !g.team || !g.player || !g.minute; })) {
    return { homeScorers: '', awayScorers: '', scorers: '', goals: '' };
  }
  const home = goals.filter(function(g) { return teamAlias_(g.team) === teamAlias_(fx.homeTeam); }).map(scorerText_);
  const away = goals.filter(function(g) { return teamAlias_(g.team) === teamAlias_(fx.awayTeam); }).map(scorerText_);
  return {
    homeScorers: home.join('; '),
    awayScorers: away.join('; '),
    scorers: goals.map(scorerText_).join('; '),
    goals: goals.map(function(g) { return [g.team, g.player, g.minute, g.ownGoal ? 'selvmål' : ''].join('|').replace(/\|$/,''); }).join('; ')
  };
}

function sameRow_(a, b) {
  const keys = ['matchNumber','status','homeScore','awayScore','note','homeScorers','awayScorers','scorers','goals'];
  return keys.every(function(k) { return String(a[k] || '') === String(b[k] || ''); });
}

function appendAudit_(ss, ts, action, matchNumber, match, score, scorers, source, note) {
  const sh = ss.getSheetByName(AUDIT_SHEET);
  if (!sh) return;
  sh.appendRow([ts, action, matchNumber, match, score, scorers, source, note]);
}
