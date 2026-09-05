// trends.js — three additions to the Analytics page: streak stat-cards
// (current + longest), a This Month vs Last Month rollup, and a
// GitHub-style focus heatmap over the last 12 weeks. All pure display —
// math lives in metrics.js (buildDayTotals, computeStreaks, monthBounds).
import { state, settings, workdayNow } from './state.js';
import { fetchSessions } from './db.js';
import { localDateKey } from './utils.js';
import {
  buildDayTotals, computeStreaks, monthBounds, currentMonthBounds, weekTotal,
  startOfMonday
} from './metrics.js';

function fmtMin(min) {
  return min >= 60 ? Math.floor(min / 60) + 'h ' + (min % 60) + 'm' : min + 'm';
}

// ── Streak + monthly stat-cards ──────────────────────────────────────
function renderStreakCards(dayTotals) {
  const { current, longest } = computeStreaks(dayTotals, settings.streakMinFocusMin);
  const curEl = document.getElementById('an-streak-current');
  const lngEl = document.getElementById('an-streak-longest');
  if (curEl) curEl.textContent = current ? current + 'd' : '0d';
  if (lngEl) lngEl.textContent = longest ? longest + 'd' : '0d';
  const sub = document.getElementById('an-streak-sub');
  if (sub) sub.textContent = settings.streakMinFocusMin > 0 ? '≥' + settings.streakMinFocusMin + 'm/day' : 'any focus counts';
}

function renderMonthCards(sessions) {
  const thisMonth = currentMonthBounds(), lastMonth = monthBounds(1);
  const tmTotal = weekTotal(sessions, thisMonth, state.excludedFromAvg);
  const lmTotal = weekTotal(sessions, lastMonth, state.excludedFromAvg);
  const tmEl = document.getElementById('an-thismonth'), tmSub = document.getElementById('an-thismonth-sub');
  const lmEl = document.getElementById('an-lastmonth'), lmSub = document.getElementById('an-lastmonth-sub');
  if (tmEl) tmEl.textContent = tmTotal ? fmtMin(tmTotal) : '—';
  if (tmSub) tmSub.textContent = thisMonth[0].slice(0, 7);
  if (lmEl) lmEl.textContent = lmTotal ? fmtMin(lmTotal) : '—';
  if (lmSub) lmSub.textContent = lastMonth[0].slice(0, 7);
  const dEl = document.getElementById('an-month-delta');
  if (dEl) {
    if (tmTotal && lmTotal) {
      const diff = tmTotal - lmTotal;
      if (diff > 0) { dEl.textContent = '▲ ' + fmtMin(diff) + ' vs last month'; dEl.className = 'stat-sub metric-up'; }
      else if (diff < 0) { dEl.textContent = '▼ ' + fmtMin(Math.abs(diff)) + ' vs last month'; dEl.className = 'stat-sub metric-down'; }
      else { dEl.textContent = '= same as last month'; dEl.className = 'stat-sub metric-same'; }
    } else {
      dEl.textContent = ''; dEl.className = 'stat-sub';
    }
  }
}

// ── Heatmap: 12 weeks (Mon-Sun columns of 7), relative intensity ────
function renderHeatmap(dayTotals) {
  const wrap = document.getElementById('heatmap-wrap');
  if (!wrap) return;
  const weeksBack = 12;
  const start = startOfMonday(workdayNow());
  start.setDate(start.getDate() - (weeksBack - 1) * 7);

  const cells = [];
  let maxMin = 1;
  const todayKey = localDateKey(workdayNow());
  for (let w = 0; w < weeksBack; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime());
      date.setDate(date.getDate() + w * 7 + d);
      const key = localDateKey(date);
      const min = dayTotals[key] || 0;
      if (key <= todayKey) maxMin = Math.max(maxMin, min);
      cells.push({ week: w, day: d, key, min, future: key > todayKey });
    }
  }

  function bucket(min) {
    if (min <= 0) return 0;
    const ratio = min / maxMin;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  }

  // Render column-major (week columns, 7 day rows) via CSS grid with
  // grid-auto-flow: column so the markup order matches visual columns.
  const html = cells.map(c => {
    if (c.future) return '<div class="heat-cell heat-future"></div>';
    const lvl = bucket(c.min);
    return '<div class="heat-cell heat-lvl' + lvl + '" title="' + c.key + ' · ' + fmtMin(c.min) + '"></div>';
  }).join('');

  wrap.innerHTML = '<div class="heat-grid">' + html + '</div>' +
    '<div class="heat-legend">Less <span class="heat-cell heat-lvl0"></span><span class="heat-cell heat-lvl1"></span><span class="heat-cell heat-lvl2"></span><span class="heat-cell heat-lvl3"></span><span class="heat-cell heat-lvl4"></span> More</div>';
}

export async function renderTrends() {
  if (!state.sb) return;
  const allRows = await fetchSessions(20000);
  const sessions = allRows.filter(s => s.task_type !== '_break');
  const dayTotals = buildDayTotals(sessions, state.excludedFromAvg);

  renderStreakCards(dayTotals);
  renderMonthCards(sessions);
  renderHeatmap(dayTotals);
}
