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
