// weekdayTargets.js — day-of-week-aware floor/target/stretch focus goals
// (report finding: Monday averages 3.22 hrs, Saturday 1.40 -- one flat
// daily target always misrepresents most of the week) and the "Today's
// Target" status band showing where today's actual focus stands against
// its own weekday's band.
import { state } from './state.js';
import { STORAGE_KEYS, DEFAULT_WEEKDAY_TARGETS } from './config.js';
import { dbConfigGet, dbConfigSet } from './db.js';
import { workdayNow } from './state.js';

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.weekdayTargets);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULT_WEEKDAY_TARGETS)); }

export async function initWeekdayTargets() {
  state.weekdayTargets = loadLocal() || cloneDefaults();
  const remote = await dbConfigGet(STORAGE_KEYS.weekdayTargets);
  if (remote && remote !== false) {
    state.weekdayTargets = remote;
    localStorage.setItem(STORAGE_KEYS.weekdayTargets, JSON.stringify(remote));
  } else if (remote === false) {
    dbConfigSet(STORAGE_KEYS.weekdayTargets, state.weekdayTargets);
  }
  populateWeekdayTargetsForm();
  renderTodayBand();
}

export function setWeekdayTarget(dow, field, value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (!state.weekdayTargets) state.weekdayTargets = cloneDefaults();
  if (!state.weekdayTargets[dow]) state.weekdayTargets[dow] = { floor: 0, target: 0, stretch: 0 };
  state.weekdayTargets[dow][field] = n;
  localStorage.setItem(STORAGE_KEYS.weekdayTargets, JSON.stringify(state.weekdayTargets));
  dbConfigSet(STORAGE_KEYS.weekdayTargets, state.weekdayTargets);
  renderTodayBand();
}

export function populateWeekdayTargetsForm() {
  const t = state.weekdayTargets || DEFAULT_WEEKDAY_TARGETS;
  for (let dow = 0; dow <= 6; dow++) {
    ['floor', 'target', 'stretch'].forEach(field => {
      const el = document.getElementById('wt-' + dow + '-' + field);
      if (el) el.value = (t[dow] && t[dow][field] != null) ? t[dow][field] : DEFAULT_WEEKDAY_TARGETS[dow][field];
    });
  }
}

function fmtMin(min) {
  return min >= 60 ? Math.floor(min / 60) + 'h ' + (min % 60) + 'm' : min + 'm';
}

// Today's status against its own weekday's band -- reads
// state.todayFocusMin (set by metrics.js's refreshMetrics(), no extra
// fetch here) compared to state.weekdayTargets[today's dow].
export function renderTodayBand() {
  const wrap = document.getElementById('today-target-band');
  if (!wrap) return;
  const dow = workdayNow().getDay();
  const t = (state.weekdayTargets || DEFAULT_WEEKDAY_TARGETS)[dow] || DEFAULT_WEEKDAY_TARGETS[dow];
  const min = state.todayFocusMin || 0;

  const floorDone = min >= t.floor;
  const targetDone = min >= t.target;
  const stretchDone = min >= t.stretch;

  let statusLine;
  if (stretchDone) statusLine = '🔥 Stretch reached — ' + fmtMin(min);
  else if (targetDone) statusLine = 'Target met · ' + fmtMin(t.stretch - min) + ' to stretch';
  else if (floorDone) statusLine = 'Floor met · ' + fmtMin(t.target - min) + ' to target';
  else statusLine = fmtMin(t.floor - min) + ' to floor';

  const pct = Math.min(100, Math.round((min / Math.max(t.stretch, 1)) * 100));
  const floorPct = Math.min(100, Math.round((t.floor / Math.max(t.stretch, 1)) * 100));
  const targetPct = Math.min(100, Math.round((t.target / Math.max(t.stretch, 1)) * 100));

  wrap.innerHTML =
    '<div class="wt-head"><span>' + DOW_NAMES[dow] + ' · ' + fmtMin(min) + ' so far</span>' +
    '<span class="dim">' + fmtMin(t.floor) + ' / ' + fmtMin(t.target) + ' / ' + fmtMin(t.stretch) + '</span></div>' +
    '<div class="wt-track">' +
      '<div class="wt-fill' + (stretchDone ? ' wt-stretch' : targetDone ? ' wt-target' : floorDone ? ' wt-floor' : '') + '" style="width:' + pct + '%;"></div>' +
      '<div class="wt-mark" style="left:' + floorPct + '%;" title="Floor"></div>' +
      '<div class="wt-mark" style="left:' + targetPct + '%;" title="Target"></div>' +
    '</div>' +
    '<div class="wt-status">' + statusLine + '</div>';
}
