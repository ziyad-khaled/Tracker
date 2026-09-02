// timer.js — the Pomodoro timer itself: mode switching, the tick loop,
// starting/ending sessions, the kill-switch gap monitor, and crash recovery.
import { STORAGE_KEYS, CIRC, MIN_SESSION_SEC } from './config.js';
import { state, settings, focusDateKey, isoDate } from './state.js';
import { fmt24, escHtml } from './utils.js';
import { dbInsertReturning } from './db.js';
import { renderProjects, renderTasks } from './projects.js';
import { renderCategoryChips } from './categories.js';
import { updateTaskDisplay, setSidebarEnergy } from './ui.js';
import { refreshMetrics } from './metrics.js';
import { stopAlarm, playAlarm } from './alarm.js';

// showBreakOverlay lives in breaks.js; imported lazily inside functions to
// avoid a hard circular-import ordering requirement at module-eval time.
import { showBreakOverlay } from './breaks.js';

export function setMode(m, preserveAlarm) {
  if (state.running) return;
  if (!preserveAlarm) stopAlarm();
  state.mode = m; state.inOvertime = false; state.pausedMs = 0; state.pauseStartMs = null;
  clearInterval(state.tickInterval); state.tickInterval = null;
  clearInterval(state.manualBreakTick); state.manualBreakTick = null;
  state.running = false;
  document.getElementById('manual-break-panel').style.display = 'none';
  state.manualBreakActs = [];
  document.getElementById('start-btn').textContent = 'START';
  document.getElementById('end-btn').classList.remove('show');
  document.getElementById('overtime-badge').classList.remove('show');
  document.getElementById('timer-display').style.color = '';
  document.getElementById('ring').style.stroke = m === 'pomodoro' ? 'var(--accent)' : 'var(--info)';
  document.getElementById('flow-hint').textContent = 'Start a session to begin tracking';
  document.getElementById('flow-hint').className = '';
  const mins = m === 'pomodoro' ? settings.pomodoro : m === 'short' ? settings.short : settings.long;
  state.timeLeft = state.totalSecs = mins * 60;
  renderClock(state.timeLeft, false);
  setRing(1);
  const labels = { pomodoro: 'POMODORO', short: 'SHORT BREAK', long: 'LONG BREAK' };
  document.getElementById('timer-label').textContent = labels[m];
  document.querySelectorAll('.mode-btn').forEach((b, i) => b.classList.toggle('active', ['pomodoro', 'short', 'long'][i] === m));
}

// Fix #2.1: setBreakMode now keeps timeLeft/totalSecs in sync with the
// displayed clock instead of leaving them stale until the overlay opens.
export function setBreakMode(type) {
  if (state.running) return;
  clearInterval(state.manualBreakTick); state.manualBreakTick = null;
  stopAlarm();
  document.querySelectorAll('.mode-btn').forEach((b, i) => b.classList.toggle('active', ['pomodoro', 'short', 'long'][i] === type));
  const breakSecs = (type === 'long' ? settings.long : settings.short) * 60;
  state.timeLeft = state.totalSecs = breakSecs;
  renderClock(breakSecs, false);
  document.getElementById('timer-display').style.color = '';
  document.getElementById('timer-label').textContent = type === 'long' ? 'LONG BREAK' : 'SHORT BREAK';
  document.getElementById('ring').style.stroke = 'var(--info)';
  setRing(1);
  document.getElementById('flow-hint').textContent = 'Press START BREAK to begin';
  document.getElementById('start-btn').textContent = 'START BREAK';
  document.getElementById('end-btn').classList.remove('show');
  document.getElementById('overtime-badge').classList.remove('show');
  document.getElementById('start-btn').dataset.breakType = type;
  state.mode = type;
}

function runManualBreak(type) {
  clearInterval(state.manualBreakTick); state.manualBreakTick = null;
  clearInterval(state.tickInterval); state.tickInterval = null;
  state.running = false;
  showBreakOverlay(type, false, true);
}

export function toggleTimer() {
  if (state.mode === 'short' || state.mode === 'long') { runManualBreak(state.mode); return; }
  if (state.running) pauseTimer(); else startTimer();
}

export function startTimer() {
  stopAlarm();
  if (state.mode !== 'pomodoro') { setMode('pomodoro'); setTimeout(startTimer, 50); return; }
  if (!state.sessionStart) {
    state.sessionStart = new Date();
    state.pausedMs = 0; state.pauseStartMs = null;
    state.seqToday++;
    startRecoveryInterval();
    noteFreshChainStartIfNeeded();
  } else if (state.pauseStartMs !== null) {
    state.pausedMs += Date.now() - state.pauseStartMs;
    state.pauseStartMs = null;
  }
  state.running = true;
  document.getElementById('start-btn').textContent = 'PAUSE';
  document.getElementById('end-btn').classList.add('show');
  document.getElementById('flow-hint').textContent = 'Running — hit "End Session" when ready';
  clearKillSwitchHint();
  state.tickInterval = setInterval(doTick, 500);
}

export function pauseTimer() {
  state.running = false;
  clearInterval(state.tickInterval); state.tickInterval = null;
  state.pauseStartMs = Date.now();
  saveRecoverySnapshot();
  document.getElementById('start-btn').textContent = 'RESUME';
  document.getElementById('flow-hint').textContent = 'Paused — resume or end the session';
}

export function resetTimer() {
  clearInterval(state.tickInterval); state.tickInterval = null;
  state.running = false; state.sessionStart = null;
  state.pausedMs = 0; state.pauseStartMs = null; state.inOvertime = false;
  // Fix #2.9: resetting an in-progress (never-counted) session no longer
  // decrements pomodoroCount — that counter is only ever incremented by
  // endSession(), so there is nothing to undo here.
  clearRecoverySnapshot();
  setMode('pomodoro');
}

export function endSession(keepAlarm) {
  // Fix #2.2: guard against ending a session that never started, which
  // previously fabricated a full-length "phantom" session.
  if (!state.sessionStart) {
    setMode('pomodoro', keepAlarm);
    return;
  }
  if (!keepAlarm) stopAlarm();
  clearInterval(state.tickInterval); state.tickInterval = null;
  clearRecoverySnapshot();
  state.running = false;
  state.pomodoroCount++;
  document.getElementById('start-btn').textContent = 'START';
  document.getElementById('end-btn').classList.remove('show');
  document.getElementById('overtime-badge').classList.remove('show');
  document.getElementById('timer-display').style.color = '';

  const end = new Date();
  const focusSec = wallElapsedSecs();
  const spanSec = Math.floor((end.getTime() - state.sessionStart.getTime()) / 1000);

  // Fix #2.10: sessions under a minute of real focus are almost always a
  // mis-click (start then immediately end) rather than real work — drop them
  // instead of saving a 0/near-0-minute row.
  if (focusSec < MIN_SESSION_SEC) {
    state.sessionStart = null; state.pausedMs = 0; state.pauseStartMs = null; state.inOvertime = false;
    document.getElementById('flow-hint').textContent = 'Session under a minute — not saved';
    document.getElementById('flow-hint').className = '';
    markLastFocusEnd();
    setMode('pomodoro', keepAlarm);
    refreshMetrics();
    window.dispatchEvent(new CustomEvent('ft:refreshRoutine'));
    return;
  }

  const ratio = Math.round(focusSec / Math.max(spanSec, 1) * 100);
  const otMin = Math.max(0, Math.floor(focusSec / 60) - settings.pomodoro);
  const sessNow = {
    session_date: focusDateKey(state.sessionStart), start_time: fmt24(state.sessionStart), end_time: fmt24(end),
    span_sec: spanSec, task_type: state.currentCat || null, focus_sec: focusSec, ratio,
    project: state.currentProject && state.projects[state.currentProject] ? state.projects[state.currentProject].name : null,
    task: state.currentTask && state.currentProject && state.projects[state.currentProject] ? state.projects[state.currentProject].tasks[state.currentTask] : null,
    seq: state.seqToday, energy: state.currentEnergy, note: document.getElementById('session-note').value.trim() || null, _otMin: otMin
  };
  state.pending = Object.assign({}, sessNow);
  state.sessionStart = null; state.pausedMs = 0; state.pauseStartMs = null; state.inOvertime = false;
  markLastFocusEnd();

  dbInsertReturning(sessNow).then(savedId => {
    state.lastSavedSessionId = savedId;
    const hint = document.getElementById('flow-hint');
    hint.textContent = savedId ? '✓ Saved — log break or start next session' : '✗ Save failed — check connection';
    hint.className = savedId ? '' : 'overtime';
    refreshMetrics();
    window.dispatchEvent(new CustomEvent('ft:refreshRoutine'));
  });

  if (settings.autoBreak) showBreakOverlay(state.pomodoroCount % settings.interval === 0 ? 'long' : 'short', keepAlarm);
  else setMode('pomodoro', keepAlarm);
}

export function wallElapsedSecs() {
  if (!state.sessionStart) return 0;
  return Math.floor(((Date.now() - state.sessionStart.getTime()) - state.pausedMs) / 1000);
}

// ── Kill-switch: gap-since-last-focus tracking ───────────────────
export function markLastFocusEnd() {
  try { localStorage.setItem(STORAGE_KEYS.lastFocusEnd, String(Date.now())); } catch (e) { /* ignore */ }
}
function getLastFocusEndMs() {
  try { const v = localStorage.getItem(STORAGE_KEYS.lastFocusEnd); return v ? parseInt(v, 10) : null; } catch (e) { return null; }
}
function noteFreshChainStartIfNeeded() {
  const lastEnd = getLastFocusEndMs();
  if (!lastEnd) return;
  const gapMin = Math.round((Date.now() - lastEnd) / 60000);
  const kMin = settings.killSwitch || 17;
  if (gapMin >= kMin) {
    const noteEl = document.getElementById('session-note');
    const tag = '[fresh block after ' + gapMin + 'm gap]';
    if (noteEl && noteEl.value.indexOf(tag) === -1) noteEl.value = (noteEl.value ? noteEl.value + ' ' : '') + tag;
  }
}
function clearKillSwitchHint() {
  const el = document.getElementById('kill-switch-hint');
  if (!el) return;
  el.textContent = ''; el.className = '';
}
function killSwitchMonitorTick() {
  const el = document.getElementById('kill-switch-hint');
  if (!el) return;
  if (state.running || state.sessionStart) { el.textContent = ''; el.className = ''; return; }
  const overlayOpen = document.getElementById('break-overlay').classList.contains('show');
  if (overlayOpen) { el.textContent = ''; el.className = ''; return; } // break overlay has its own warning
  const lastEnd = getLastFocusEndMs();
  if (!lastEnd) { el.textContent = ''; el.className = ''; return; }
  const gapMin = (Date.now() - lastEnd) / 60000;
  const kMin = settings.killSwitch || 17;
  if (gapMin < 1) { el.textContent = ''; el.className = ''; return; }
  if (gapMin >= kMin) {
    el.textContent = '⚠ ' + Math.floor(gapMin) + 'm gap — this block is dead. Log it and start fresh, don\'t try to resume.';
    el.className = 'dead';
  } else {
    el.textContent = 'Gap since last focus: ' + Math.floor(gapMin) + 'm (kill-switch at ' + kMin + 'm)';
    el.className = '';
  }
}
// Fix #2.8: pause the monitor while the tab is hidden instead of updating
// (invisible) DOM every 15s regardless of visibility.
export function startKillSwitchMonitor() {
  clearInterval(state.killSwitchMonitorInterval);
  state.killSwitchMonitorInterval = setInterval(() => {
    if (document.hidden) return;
    killSwitchMonitorTick();
  }, 15000);
  killSwitchMonitorTick();
}

// ── Crash / tab-close recovery for an in-progress focus session ─
export function saveRecoverySnapshot() {
  if (!state.sessionStart) return;
  const snap = {
    v: 2,
    sessionStartMs: state.sessionStart.getTime(),
    pausedMs: state.pausedMs,
    pauseStartMs: state.pauseStartMs,
    running: state.running,
    mode: state.mode,
    seqToday: state.seqToday,
    pomodoroCount: state.pomodoroCount,
    sessionDate: focusDateKey(state.sessionStart),
    currentCat: state.currentCat,
    currentEnergy: state.currentEnergy,
    currentProjectId: state.currentProject,
    currentTaskId: state.currentTask,
    note: (document.getElementById('session-note') || {}).value || '',
    savedAt: Date.now()
  };
  localStorage.setItem(STORAGE_KEYS.recovery, JSON.stringify(snap));
}
function snapshotSpanSecs(snap) {
  if (!snap || !snap.sessionStartMs || !snap.savedAt) return 0;
  return Math.max(0, Math.floor((snap.savedAt - snap.sessionStartMs) / 1000));
}
function snapshotFocusSecs(snap) {
  if (!snap) return 0;
  let paused = Math.max(0, Number(snap.pausedMs) || 0);
  if (snap.pauseStartMs && snap.pauseStartMs < snap.savedAt) paused += snap.savedAt - snap.pauseStartMs;
  return Math.max(0, snapshotSpanSecs(snap) - Math.floor(paused / 1000));
}
export function clearRecoverySnapshot() {
  localStorage.removeItem(STORAGE_KEYS.recovery);
  if (state.recoveryInterval) { clearInterval(state.recoveryInterval); state.recoveryInterval = null; }
}
function startRecoveryInterval() {
  clearRecoverySnapshot();
  state.recoveryInterval = setInterval(saveRecoverySnapshot, 30000);
}

export function checkRecovery() {
  const raw = localStorage.getItem(STORAGE_KEYS.recovery);
  if (!raw) return;
  let snap;
  try { snap = JSON.parse(raw); } catch (e) { localStorage.removeItem(STORAGE_KEYS.recovery); return; }
  if (!snap.sessionStartMs || Date.now() - snap.sessionStartMs > 8 * 3600 * 1000) { localStorage.removeItem(STORAGE_KEYS.recovery); return; }

  const startDt = new Date(snap.sessionStartMs);
  const elapsed = snapshotFocusSecs(snap);
  const elMin = Math.floor(elapsed / 60), elSec = elapsed % 60;
  let proj = '', task = '';
  if (snap.currentProjectId && state.projects[snap.currentProjectId]) proj = state.projects[snap.currentProjectId].name;
  if (snap.currentTaskId && snap.currentProjectId && state.projects[snap.currentProjectId]) task = state.projects[snap.currentProjectId].tasks[snap.currentTaskId] || '';
  const energyLbl = ['', '🪫 Low', '😐 Med', '⚡ High'];

  // Fix #3.1 (XSS): every field here can contain user-entered text
  // (category names, project/task names, notes) so it is escaped before
  // going into innerHTML — the original built this string with raw
  // concatenation and no escaping.
  const parts = [
    'Started: <b>' + escHtml((snap.sessionDate || focusDateKey(startDt)) + ' ' + fmt24(startDt)) + '</b>',
    'Verified focus at interruption: <b>' + elMin + 'm ' + elSec + 's</b>',
    snap.currentCat ? 'Category: <b>' + escHtml(snap.currentCat) + '</b>' : '',
    proj ? 'Project: <b>' + escHtml(proj + (task ? ' / ' + task : '')) + '</b>' : '',
    snap.currentEnergy ? 'Energy: <b>' + energyLbl[snap.currentEnergy] + '</b>' : '',
    snap.note ? 'Note: <b>' + escHtml(snap.note) + '</b>' : ''
  ].filter(Boolean);
  document.getElementById('recovery-detail').innerHTML = parts.join(' &nbsp;·&nbsp; ');
  document.getElementById('recovery-banner').style.display = 'block';
  state.pendingRecovery = snap;
}

export function recoverSession() {
  const snap = state.pendingRecovery;
  if (!snap) return;
  document.getElementById('recovery-banner').style.display = 'none';
  state.sessionStart = new Date(snap.sessionStartMs);
  const verifiedFocus = snapshotFocusSecs(snap), nowMs = Date.now();
  state.pausedMs = Math.max(0, nowMs - snap.sessionStartMs - (verifiedFocus * 1000));
  state.pauseStartMs = nowMs;
  state.seqToday = snap.seqToday || 1;
  state.pomodoroCount = snap.pomodoroCount || 0;
  state.currentCat = snap.currentCat || null;
  state.currentEnergy = snap.currentEnergy || null;
  state.currentProject = snap.currentProjectId || null;
  state.currentTask = snap.currentTaskId || null;
  if (snap.note) document.getElementById('session-note').value = snap.note;
  if (state.currentEnergy) setSidebarEnergy(state.currentEnergy);
  if (state.currentCat) renderCategoryChips();
  renderProjects(); renderTasks(); updateTaskDisplay();
  const elapsed = verifiedFocus;
  state.running = false;
  document.getElementById('start-btn').textContent = 'RESUME';
  document.getElementById('end-btn').classList.add('show');
  document.getElementById('flow-hint').textContent = '⚡ Session recovered — resume or end';
  document.getElementById('flow-hint').className = 'overtime';
  if (elapsed >= state.totalSecs) {
    state.inOvertime = true;
    document.getElementById('overtime-badge').classList.add('show');
    document.getElementById('ring').style.stroke = 'var(--warn)';
    document.getElementById('timer-display').style.color = 'var(--warn)';
  }
  doTick();
  startRecoveryInterval();
  state.pendingRecovery = null;
}

export async function saveRecoveredSession() {
  const snap = state.pendingRecovery;
  if (!snap) return;
  document.getElementById('recovery-banner').style.display = 'none';
  const startDt = new Date(snap.sessionStartMs);
  const savedAt = new Date(snap.savedAt);
  const focusSec = snapshotFocusSecs(snap);
  const spanSec = snapshotSpanSecs(snap);
  const ratio = Math.round(focusSec / Math.max(spanSec, 1) * 100);
  const proj = snap.currentProjectId && state.projects[snap.currentProjectId] ? state.projects[snap.currentProjectId].name : null;
  const task = snap.currentTaskId && snap.currentProjectId && state.projects[snap.currentProjectId] ? state.projects[snap.currentProjectId].tasks[snap.currentTaskId] : null;
  const sessRow = {
    session_date: snap.sessionDate || focusDateKey(startDt), start_time: fmt24(startDt), end_time: fmt24(savedAt),
    span_sec: spanSec, focus_sec: focusSec, ratio,
    project: proj || null, task: task || null, task_type: snap.currentCat || null,
    seq: snap.seqToday || null, energy: snap.currentEnergy || null,
    note: (snap.note || '') + (snap.note ? ' [recovered]' : '[recovered — crash]')
  };
  clearRecoverySnapshot();
  state.pendingRecovery = null;
  const id = await dbInsertReturning(sessRow);
  markLastFocusEnd();
  const hint = document.getElementById('flow-hint');
  hint.textContent = id ? '✓ Recovered session saved to DB' : '✗ Save failed — check connection';
  hint.className = id ? '' : 'overtime';
  refreshMetrics();
}

export function dismissRecovery() {
  document.getElementById('recovery-banner').style.display = 'none';
  clearRecoverySnapshot();
  state.pendingRecovery = null;
}

// ── Tick loop & clock rendering ──────────────────────────────────
let tickCount = 0;
export function doTick() {
  tickCount++;
  if (tickCount % 60 === 0) saveRecoverySnapshot();
  const elapsed = wallElapsedSecs(), remaining = state.totalSecs - elapsed;
  if (remaining > 0) {
    setRing(remaining / state.totalSecs);
    renderClock(remaining, false);
  } else {
    if (!state.inOvertime) {
      if (settings.flowMode) {
        state.inOvertime = true;
        document.getElementById('overtime-badge').classList.add('show');
        document.getElementById('ring').style.stroke = 'var(--warn)';
        document.getElementById('timer-display').style.color = 'var(--warn)';
        document.getElementById('flow-hint').textContent = 'Target reached — keep going or end when ready';
        document.getElementById('flow-hint').className = 'overtime';
      } else {
        endSession(false);
        playAlarm(2000);
        return;
      }
    }
    const ot = elapsed - state.totalSecs;
    setRing(Math.min(1, ot / state.totalSecs));
    renderClock(ot, true);
  }
  const focusMin = Math.floor(elapsed / 60);
  const capMin = settings.cycleCap || 45;
  if (focusMin >= capMin) {
    document.getElementById('flow-hint').textContent = '🛑 ' + capMin + 'm cap reached — end this block now, your data shows wasted time jumps sharply past this.';
    document.getElementById('flow-hint').className = 'overtime';
    document.getElementById('ring').style.stroke = 'var(--danger)';
  }
}
export function renderClock(secs, isOt) {
  const abs = Math.abs(secs), m = String(Math.floor(abs / 60)).padStart(2, '0'), s = String(abs % 60).padStart(2, '0');
  document.getElementById('timer-display').textContent = (isOt ? '+' : '') + m + ':' + s;
  document.title = (isOt ? '+' : '') + m + ':' + s + ' · Focus';
}
export function setRing(r) {
  const ring = document.getElementById('ring');
  ring.style.strokeDasharray = CIRC;
  ring.style.strokeDashoffset = CIRC * (1 - Math.max(0, Math.min(1, r)));
}
