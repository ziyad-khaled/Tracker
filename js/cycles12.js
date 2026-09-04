// cycles12.js — the "12-Week Year" trend view: a fixed 12-week block
// (anchored to when the focus practice started, not a rolling window),
// shown as 12 weekly bars against a weekly-hours goal, with pace and
// cycle-over-cycle navigation. Lives on the Analytics page.
import { state } from './state.js';
import { STORAGE_KEYS, DEFAULT_CYCLE_ANCHOR, DEFAULT_CYCLE_TARGET_HOURS } from './config.js';
import { dbConfigGet, dbConfigSet, fetchSessions } from './db.js';
import {
  currentCycleInfo, cycleInfoForNum, cycleWeekBounds,
  cycleWeeklyTotals, currentWeekIndexInCycle
} from './metrics.js';

// viewedCycleNum: which cycle the user is currently looking at via
// prev/next nav. null until first render, which defaults to "current".
let viewedCycleNum = null;

function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = JSON.parse(raw);
    return (v === null || v === undefined) ? fallback : v;
  } catch (e) { return fallback; }
}

export async function initCycle12Config() {
  state.cycleAnchor = loadLocal(STORAGE_KEYS.cycleAnchor, DEFAULT_CYCLE_ANCHOR);
  state.cycleTargetHours = loadLocal(STORAGE_KEYS.cycleTargetH, DEFAULT_CYCLE_TARGET_HOURS);

  // Pull remote copies (cross-device), same pattern as categories.js.
  const [remoteAnchor, remoteTarget] = await Promise.all([
    dbConfigGet(STORAGE_KEYS.cycleAnchor),
    dbConfigGet(STORAGE_KEYS.cycleTargetH)
  ]);
  if (remoteAnchor && remoteAnchor !== false) {
    state.cycleAnchor = remoteAnchor;
    localStorage.setItem(STORAGE_KEYS.cycleAnchor, JSON.stringify(remoteAnchor));
  } else if (remoteAnchor === false) {
    dbConfigSet(STORAGE_KEYS.cycleAnchor, state.cycleAnchor);
  }
  if (remoteTarget && remoteTarget !== false) {
    state.cycleTargetHours = remoteTarget;
    localStorage.setItem(STORAGE_KEYS.cycleTargetH, JSON.stringify(remoteTarget));
  } else if (remoteTarget === false) {
    dbConfigSet(STORAGE_KEYS.cycleTargetH, state.cycleTargetHours);
  }
  populateCycle12SettingsForm();
}

export function populateCycle12SettingsForm() {
  const a = document.getElementById('set-cycleAnchor');
  const t = document.getElementById('set-cycleTargetHours');
  if (a) a.value = state.cycleAnchor || DEFAULT_CYCLE_ANCHOR;
  if (t) t.value = state.cycleTargetHours || DEFAULT_CYCLE_TARGET_HOURS;
}

export function setCycleAnchor(dateKey) {
  if (!dateKey) return;
  state.cycleAnchor = dateKey;
  localStorage.setItem(STORAGE_KEYS.cycleAnchor, JSON.stringify(dateKey));
  dbConfigSet(STORAGE_KEYS.cycleAnchor, dateKey);
  viewedCycleNum = null; // snap back to "current" on re-anchor
  renderCycle12();
}
export function setCycleTargetHours(hrs) {
  const n = Math.max(1, Math.round(Number(hrs) || DEFAULT_CYCLE_TARGET_HOURS));
  state.cycleTargetHours = n;
  localStorage.setItem(STORAGE_KEYS.cycleTargetH, JSON.stringify(n));
  dbConfigSet(STORAGE_KEYS.cycleTargetH, n);
  renderCycle12();
}

export function shiftViewedCycle(delta) {
  const anchor = state.cycleAnchor || DEFAULT_CYCLE_ANCHOR;
  const base = viewedCycleNum || currentCycleInfo(anchor).cycleNum;
  viewedCycleNum = Math.max(1, base + delta);
  renderCycle12();
}
export function jumpToCurrentCycle() {
  viewedCycleNum = null;
  renderCycle12();
}

function fmtHrs(min) {
  const h = min / 60;
  return (Math.round(h * 10) / 10) + 'h';
}

export async function renderCycle12() {
  const wrap = document.getElementById('cycle12-wrap');
  if (!wrap || !state.sb) return;
  const anchor = state.cycleAnchor || DEFAULT_CYCLE_ANCHOR;
  const targetHrs = state.cycleTargetHours || DEFAULT_CYCLE_TARGET_HOURS;
  const targetMin = targetHrs * 60;

  const nowInfo = currentCycleInfo(anchor);
  const info = viewedCycleNum ? cycleInfoForNum(anchor, viewedCycleNum) : nowInfo;
  const isCurrentCycle = info.cycleNum === nowInfo.cycleNum;

  const allRows = await fetchSessions(20000);
  const sessions = allRows.filter(s => s.task_type !== '_break');

  const weeks = cycleWeekBounds(info.start);
  const totals = cycleWeeklyTotals(sessions, weeks, state.excludedFromAvg);
  const activeWeekIdx = isCurrentCycle ? currentWeekIndexInCycle(info.start, info.end) : -1;
  const maxMin = Math.max.apply(null, totals.concat([targetMin, 1]));

  const goalLinePct = Math.min(100, Math.round((targetMin / maxMin) * 100));

  const bars = totals.map((min, i) => {
    const knownFuture = isCurrentCycle && activeWeekIdx >= 0 && i > activeWeekIdx;
    const h = Math.round((min / maxMin) * 100);
    const hitGoal = min >= targetMin;
    const barCls = knownFuture ? 'bar cy12-bar-future' : (hitGoal ? 'bar cy12-bar-hit' : 'bar');
    const label = 'Week ' + (i + 1) + ' · ' + weeks[i][0].slice(5) + '→' + weeks[i][1].slice(5) + ' · ' + fmtHrs(min);
    return '<div class="bar-col">' +
      '<div class="' + barCls + '" style="height:' + (knownFuture ? 2 : Math.max(2, h)) + 'px" title="' + label + '"></div>' +
      '<div class="bar-lbl">' + (i + 1) + '</div>' +
      '</div>';
  }).join('');

  const cumSoFar = activeWeekIdx >= 0 ? totals.slice(0, activeWeekIdx + 1).reduce((a, b) => a + b, 0) : totals.reduce((a, b) => a + b, 0);
  const weeksSoFar = activeWeekIdx >= 0 ? activeWeekIdx + 1 : 12;
  const cumTarget = weeksSoFar * targetMin;
  const pacePct = cumTarget ? Math.round((cumSoFar / cumTarget) * 100) : 0;

  let paceLine;
  if (!isCurrentCycle) {
    const totalAll = totals.reduce((a, b) => a + b, 0);
    const totalTarget = 12 * targetMin;
    const finalPct = totalTarget ? Math.round((totalAll / totalTarget) * 100) : 0;
    paceLine = 'Completed cycle · ' + fmtHrs(totalAll) + ' / ' + fmtHrs(totalTarget) + ' goal · ' + finalPct + '%';
  } else if (activeWeekIdx < 0) {
    paceLine = 'Cycle ' + info.cycleNum + ' hasn\'t started yet';
  } else {
    paceLine = 'Week ' + (activeWeekIdx + 1) + ' of 12 · ' + fmtHrs(cumSoFar) + ' / ' + fmtHrs(cumTarget) + ' pace · ' + pacePct + '%';
  }

  wrap.innerHTML =
    '<div class="cy12-head">' +
      '<button class="btn-ghost cy12-nav" onclick="shiftViewedCycle(-1)">← Prev</button>' +
      '<div class="cy12-title">Cycle ' + info.cycleNum + ' &middot; ' + info.start + ' → ' + info.end + (isCurrentCycle ? ' (current)' : '') + '</div>' +
      '<button class="btn-ghost cy12-nav" onclick="shiftViewedCycle(1)">Next →</button>' +
    '</div>' +
    '<div class="bar-chart cy12-chart" style="position:relative;">' +
      '<div class="cy12-goal-line" style="bottom:' + goalLinePct + '%;" title="Goal: ' + fmtHrs(targetMin) + '/week"></div>' +
      bars +
    '</div>' +
    '<div class="cy12-pace">' + paceLine + '</div>' +
    (isCurrentCycle ? '' : '<button class="cy-link" onclick="jumpToCurrentCycle()">Back to current cycle →</button>');
}
