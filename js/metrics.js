// metrics.js — weekly bounds/averages and the "Today / This Week / Last Week" row.
import { state, settings, isoDate } from './state.js';
import { localDateKey } from './utils.js';

export function startOfMonday(date) {
  const d = new Date((date || new Date()).getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export function weekBounds(offsetWeeks) {
  const start = startOfMonday(new Date());
  start.setDate(start.getDate() - (offsetWeeks || 0) * 7);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return [localDateKey(start), localDateKey(end)];
}
export function currentWeekBounds() {
  return [localDateKey(startOfMonday(new Date())), localDateKey(new Date())];
}
export function daysInCurrentWeek() { return ((new Date().getDay() + 6) % 7) + 1; }
export function weeklyAverageDivisor(activeDays, isCurrentWeek) {
  if (settings.avgMode === 'exclude') return Math.max(1, activeDays);
  return isCurrentWeek ? daysInCurrentWeek() : 7;
}
export function weeklyAverageLabel(divisor, activeDays) {
  return settings.avgMode === 'exclude'
    ? 'inactive days ignored · ' + activeDays + ' active'
    : 'inactive days count as zero · ÷' + divisor;
}
export function weekTotal(sessions, bounds, exclude) {
  let total = 0;
  sessions.forEach(s => {
    if (s.session_date >= bounds[0] && s.session_date <= bounds[1]) {
      if (!exclude || !exclude[s.task_type]) total += Math.floor((s.focus_sec || 0) / 60);
    }
  });
  return total;
}

// ── 12-Week Year cycle math ──────────────────────────────────────────
// A "cycle" is a fixed 12-week (84-day) block anchored to CYCLE_ANCHOR
// (not a rolling last-12-weeks window). Cycle 1 = anchor..anchor+83d,
// Cycle 2 = anchor+84d..anchor+167d, etc. Weeks within a cycle always
// start on the anchor's weekday, not necessarily Monday.
export const CYCLE_LENGTH_WEEKS = 12;
export const CYCLE_LENGTH_DAYS = CYCLE_LENGTH_WEEKS * 7;

function parseLocalDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(); dt.setHours(0, 0, 0, 0);
  dt.setFullYear(y, m - 1, d);
  return dt;
}
function addDays(date, n) {
  const d = new Date(date.getTime()); d.setDate(d.getDate() + n); return d;
}

// Given the anchor date key and "now", return which cycle number we're
// in (1-indexed) and that cycle's [startKey, endKey] bounds.
export function currentCycleInfo(anchorKey, now) {
  const anchor = parseLocalDate(anchorKey);
  const today = now || new Date();
  const daysSince = Math.floor((today.setHours(0, 0, 0, 0) - anchor.getTime()) / 86400000);
  const cycleNum = Math.max(1, Math.floor(daysSince / CYCLE_LENGTH_DAYS) + 1);
  const cycleStart = addDays(anchor, (cycleNum - 1) * CYCLE_LENGTH_DAYS);
  const cycleEnd = addDays(cycleStart, CYCLE_LENGTH_DAYS - 1);
  return { cycleNum, start: localDateKey(cycleStart), end: localDateKey(cycleEnd) };
}

// Bounds for an arbitrary cycle number (for prev/next navigation).
export function cycleInfoForNum(anchorKey, cycleNum) {
  const anchor = parseLocalDate(anchorKey);
  const cycleStart = addDays(anchor, (cycleNum - 1) * CYCLE_LENGTH_DAYS);
  const cycleEnd = addDays(cycleStart, CYCLE_LENGTH_DAYS - 1);
  return { cycleNum, start: localDateKey(cycleStart), end: localDateKey(cycleEnd) };
}

// 12 [startKey, endKey] pairs, one per week of the given cycle.
export function cycleWeekBounds(cycleStartKey) {
  const start = parseLocalDate(cycleStartKey);
  const weeks = [];
  for (let i = 0; i < CYCLE_LENGTH_WEEKS; i++) {
    const wStart = addDays(start, i * 7);
    const wEnd = addDays(wStart, 6);
    weeks.push([localDateKey(wStart), localDateKey(wEnd)]);
  }
  return weeks;
}

// Sum focus minutes per week for the given sessions, respecting the
// same excludedFromAvg category filter used elsewhere.
export function cycleWeeklyTotals(sessions, weekBoundsArr, exclude) {
  return weekBoundsArr.map(bounds => weekTotal(sessions, bounds, exclude));
}

// Which week index (0-based, 0..11) "today" falls in for a given cycle,
// or -1 if today is outside this cycle (past cycle, or future cycle).
export function currentWeekIndexInCycle(cycleStartKey, cycleEndKey, now) {
  const todayKey = localDateKey(now || new Date());
  if (todayKey < cycleStartKey || todayKey > cycleEndKey) return -1;
  const start = parseLocalDate(cycleStartKey);
  const days = Math.floor((parseLocalDate(todayKey) - start) / 86400000);
  return Math.floor(days / 7);
}

export async function refreshMetrics() {
  if (!state.sb) return;
  const today = isoDate(), thisWeek = currentWeekBounds(), lastWeek = weekBounds(1);

  const todayRes = await state.sb.from('focus_sessions').select('focus_sec').eq('session_date', today);
  const todaySess = todayRes.data || [];
  const todayMin = todaySess.reduce((a, s) => a + Math.floor((s.focus_sec || 0) / 60), 0);
  state.seqToday = todaySess.length;
  document.getElementById('m-today').textContent = todayMin + 'm';
  document.getElementById('m-today-sub').textContent = state.seqToday + ' session' + (state.seqToday !== 1 ? 's' : '');

  const twRes = await state.sb.from('focus_sessions').select('focus_sec,session_date,task_type').gte('session_date', thisWeek[0]).lte('session_date', thisWeek[1]);
  const twData = twRes.data || [];
  const twTotal = twData.reduce((a, s) => !state.excludedFromAvg[s.task_type] ? a + Math.floor((s.focus_sec || 0) / 60) : a, 0);
  const twActiveDays = new Set(twData.filter(s => !state.excludedFromAvg[s.task_type]).map(s => s.session_date)).size;
  const twDivisor = weeklyAverageDivisor(twActiveDays, true);
  const twAvg = Math.round(twTotal / twDivisor);
  document.getElementById('m-thisweek').textContent = twTotal ? twAvg + 'm' : '—';
  document.getElementById('m-thisweek-sub').textContent = thisWeek[0].slice(5) + ' → ' + thisWeek[1].slice(5) + ' · total ' + twTotal + 'm · ' + weeklyAverageLabel(twDivisor, twActiveDays);

  const lwRes = await state.sb.from('focus_sessions').select('focus_sec,session_date,task_type').gte('session_date', lastWeek[0]).lte('session_date', lastWeek[1]);
  const lwData = lwRes.data || [];
  const lwTotal = lwData.reduce((a, s) => !state.excludedFromAvg[s.task_type] ? a + Math.floor((s.focus_sec || 0) / 60) : a, 0);
  const lwDays = {};
  lwData.forEach(s => { if (!state.excludedFromAvg[s.task_type]) lwDays[s.session_date] = 1; });
  const lwActiveDays = Object.keys(lwDays).length;
  const lwDivisor = weeklyAverageDivisor(lwActiveDays, false);
  const lwAvg = Math.round(lwTotal / lwDivisor);
  document.getElementById('m-lastweek').textContent = lwTotal ? lwAvg + 'm' : '—';
  document.getElementById('m-lastweek-sub').textContent = lwTotal
    ? lastWeek[0].slice(5) + ' → ' + lastWeek[1].slice(5) + ' · total ' + lwTotal + 'm · ' + weeklyAverageLabel(lwDivisor, lwActiveDays)
    : 'no sessions';

  const dEl = document.getElementById('m-week-delta');
  if (twAvg && lwAvg) {
    const diff = twAvg - lwAvg;
    if (diff > 0) { dEl.textContent = '▲ ' + diff + 'm vs last week'; dEl.className = 'metric-cell-sub metric-up'; }
    else if (diff < 0) { dEl.textContent = '▼ ' + Math.abs(diff) + 'm vs last week'; dEl.className = 'metric-cell-sub metric-down'; }
    else { dEl.textContent = '= same as last week'; dEl.className = 'metric-cell-sub metric-same'; }
  } else {
    dEl.textContent = 'vs last week'; dEl.className = 'metric-cell-sub';
  }
}
