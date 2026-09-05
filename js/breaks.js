// breaks.js — the full-screen break overlay, manual breaks, and break-specific
// crash recovery. timer.js imports showBreakOverlay() from here to open the
// overlay; this module hands control back to the timer (setMode, markLastFocusEnd,
// startTimer) via dynamic import() inside its functions instead of a top-level
// import, which avoids turning that relationship into a circular import.
import { STORAGE_KEYS } from './config.js';
import { state, settings, focusDateKey } from './state.js';
import { fmt24 } from './utils.js';
import { dbSave } from './db.js';
import { refreshMetrics } from './metrics.js';
import { stopAlarm, playAlarm } from './alarm.js';

export function showBreakOverlay(type, preserveAlarm, isManual) {
  clearInterval(state.breakTick); state.breakTick = null;
  if (!preserveAlarm) stopAlarm();
  document.getElementById('break-overlay').classList.add('show');
  document.getElementById('break-title').textContent = (isManual ? 'Manual ' : '') + (type === 'long' ? 'Long Break' : 'Short Break');
  const otMin = state.pending ? (state.pending._otMin || 0) : 0;
  const focMin = state.pending ? Math.floor((state.pending.focus_sec || 0) / 60) : 0;
  const seq = state.pending ? (state.pending.seq || 0) : 0;
  let sub = isManual ? 'Manual break · choose activities and log your return outcome' : 'Session #' + seq + ' · <b>' + focMin + '</b> min focused';
  if (!isManual && otMin > 0) sub += ' <span class="ot">(+' + otMin + 'm flow)</span>';
  document.getElementById('break-sub').innerHTML = sub;
  document.getElementById('break-note').value = '';
  document.getElementById('save-msg').textContent = '';
  document.getElementById('save-msg').className = 'save-msg';
  document.querySelectorAll('#break-chips-dynamic .break-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('snooze-log').textContent = '';
  document.querySelectorAll('.btn-snooze').forEach(b => b.classList.remove('snoozed'));
  state.breakActs = []; state.overdueShown = false; state.breakAlarmFired = false; state.killSwitchShown = false; state.snoozeCount = 0;
  document.getElementById('overdue-warn').classList.remove('show');
  document.getElementById('killswitch-warn').classList.remove('show');
  document.getElementById('break-clock').className = 'break-clock';
  state.breakTotalSecs = (type === 'long' ? settings.long : settings.short) * 60;
  state.breakStart = new Date();
  saveBreakSnapshot(type, []);

  function tickBreak() {
    const el = Math.floor((Date.now() - state.breakStart.getTime()) / 1000), left = state.breakTotalSecs - el;
    if (el > 0 && el % 30 === 0) saveBreakSnapshot(type, state.breakActs);
    const abs = Math.abs(left), mm = String(Math.floor(abs / 60)).padStart(2, '0'), ss = String(abs % 60).padStart(2, '0');
    document.getElementById('break-clock').textContent = (left < 0 ? '+' : '') + mm + ':' + ss;
    if (left <= 0 && !state.breakAlarmFired) { state.breakAlarmFired = true; playAlarm(); document.getElementById('break-clock').className = 'break-clock ended'; }
    if (left <= -(settings.overdue * 60) && !state.overdueShown) { state.overdueShown = true; document.getElementById('overdue-warn').classList.add('show'); playAlarm(); }
    const killSec = (settings.killSwitch || 17) * 60;
    if (el >= killSec && !state.killSwitchShown) {
      state.killSwitchShown = true;
      document.getElementById('killswitch-warn').classList.add('show');
      document.getElementById('break-clock').className = 'break-clock dead';
      playAlarm();
    }
  }
  tickBreak();
  state.breakTick = setInterval(tickBreak, 500);
}

// Fix #2.4: takes the button element explicitly instead of relying on the
// deprecated global `event` object, so it works even if called programmatically.
export function snoozeBreak(btnEl, extraMin) {
  state.breakTotalSecs += extraMin * 60;
  state.snoozeCount++;
  state.breakAlarmFired = false;
  stopAlarm();
  document.getElementById('break-clock').className = 'break-clock';
  const label = 'Snooze +' + extraMin + 'm';
  if (!state.breakActs.includes(label)) state.breakActs.push(label);
  const baseMins = document.getElementById('break-title').textContent === 'Long Break' ? settings.long : settings.short;
  const totalExtra = Math.round(state.breakTotalSecs / 60) - baseMins;
  document.getElementById('snooze-log').textContent = '⏰ Snoozed ' + state.snoozeCount + '× · +' + totalExtra + 'm added';
  if (btnEl) btnEl.classList.add('snoozed');
}

export async function saveManualBreak() {
  clearInterval(state.manualBreakTick); state.manualBreakTick = null;
  stopAlarm();
  const breakEnd = new Date();
  const bDurSec = state.breakStart ? Math.floor((breakEnd.getTime() - state.breakStart.getTime()) / 1000) : 0;
  const bDurMin = Math.floor(bDurSec / 60);
  document.getElementById('start-btn').textContent = 'START BREAK';
  document.getElementById('flow-hint').textContent = 'Break saved — start next session';
  document.getElementById('manual-break-panel').style.display = 'none';
  if (bDurSec > 5) {
    const breakRow = {
      session_date: focusDateKey(state.breakStart || breakEnd),
      start_time: state.breakStart ? fmt24(state.breakStart) : fmt24(new Date()),
      end_time: fmt24(breakEnd),
      break_activities: state.manualBreakActs.length ? state.manualBreakActs.join('; ') : null,
      break_note: null, break_duration_min: bDurMin, overdue: false, returned: true
    };
    await dbSave(breakRow);
  }
  state.manualBreakActs = [];
  document.querySelectorAll('#manual-break-chips-dynamic .break-chip').forEach(c => c.classList.remove('active'));
  clearBreakSnapshot();
  const { setMode } = await import('./timer.js');
  setMode('pomodoro');
}

const OPEN_URGENT_KEY = STORAGE_KEYS.openUrgentBreak;

// ── "Urgent" breaks — unknown duration at the moment you flag it ────
// Unlike a normal break (planned duration, ends when you click a
// button) or "Didn't Return" (also ends at button-click time), an
// Urgent break's real length isn't known upfront -- e.g. "I need to
// walk the dog, no idea how long." So instead of finalizing end_time
// at click time, we park it and let the NEXT real focus session's
// start be the true end -- whatever that turns out to be.
export function saveOpenUrgentBreak(data) {
  const existing = loadOpenUrgentBreak();
  if (existing) {
    // One's already open (e.g. two Urgent taps with no session in
    // between) -- the original break never actually ended, so keep its
    // start time and just widen the notes rather than restarting the clock.
    data = {
      startMs: existing.startMs,
      session_date: existing.session_date,
      start_time: existing.start_time,
      break_activities: [existing.break_activities, data.break_activities].filter(Boolean).join('; ') || null,
      break_note: [existing.break_note, data.break_note].filter(Boolean).join(' ') || null
    };
  }
  try { localStorage.setItem(OPEN_URGENT_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  renderOpenUrgentHint();
}
export function loadOpenUrgentBreak() {
  try { const raw = localStorage.getItem(OPEN_URGENT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
export function clearOpenUrgentBreak() {
  try { localStorage.removeItem(OPEN_URGENT_KEY); } catch (e) { /* ignore */ }
}

// Small persistent reminder so an open Urgent break isn't invisible --
// shown on the idle screen (flow-hint gets overwritten the moment a
// session actually starts, which is exactly when this resolves anyway).
export function renderOpenUrgentHint() {
  const pending = loadOpenUrgentBreak();
  const hint = document.getElementById('flow-hint');
  if (!hint || state.running) return;
  if (pending) {
    const since = new Date(pending.startMs);
    hint.textContent = '⚡ Urgent break open since ' + fmt24(since).slice(0, 5) + ' — will log once your next session starts';
    hint.className = 'overtime';
  } else if (hint.className === 'overtime' && hint.textContent.indexOf('Urgent break open') === 0) {
    hint.textContent = 'Start a session to begin tracking'; hint.className = '';
  }
}

// Called right as the next real focus session starts. This is the
// whole point of Urgent: its span is whatever it actually took, not a
// guess made at button-click time.
export async function finalizeOpenUrgentBreakIfAny(sessionStartDate) {
  const pending = loadOpenUrgentBreak();
  if (!pending) return;
  clearOpenUrgentBreak();
  const durSec = Math.max(0, Math.floor((sessionStartDate.getTime() - pending.startMs) / 1000));
  const breakRow = {
    session_date: pending.session_date,
    start_time: pending.start_time,
    end_time: fmt24(sessionStartDate),
    break_activities: pending.break_activities,
    break_note: pending.break_note,
    break_duration_min: Math.floor(durSec / 60),
    overdue: false,
    returned: null
  };
  await dbSave(breakRow);
  renderOpenUrgentHint();
}

export async function endBreak(returned) {
  stopAlarm();
  clearInterval(state.breakTick); state.breakTick = null;
  clearBreakSnapshot();

  if (returned === null) {
    // Urgent -- park it instead of finalizing now; see saveOpenUrgentBreak.
    saveOpenUrgentBreak({
      startMs: state.breakStart ? state.breakStart.getTime() : Date.now(),
      session_date: focusDateKey(state.breakStart || new Date()),
      start_time: state.breakStart ? fmt24(state.breakStart) : fmt24(new Date()),
      break_activities: state.breakActs.length ? state.breakActs.join('; ') : null,
      break_note: (document.getElementById('break-note').value.trim() || null)
    });
    const msg = document.getElementById('save-msg');
    msg.textContent = '⚡ Urgent — duration will be logged once your next session starts';
    msg.className = 'save-msg saved';
    const { markLastFocusEnd, setMode } = await import('./timer.js');
    markLastFocusEnd();
    setTimeout(async () => {
      document.getElementById('break-overlay').classList.remove('show');
      state.pending = null; state.running = false; state.sessionStart = null;
      state.pausedMs = 0; state.pauseStartMs = null; state.inOvertime = false;
      state.timeLeft = settings.pomodoro * 60; state.totalSecs = settings.pomodoro * 60; state.mode = 'pomodoro';
      setMode('pomodoro');
      const { applyDefaultEnergy } = await import('./ui.js');
      applyDefaultEnergy();
      refreshMetrics();
      window.dispatchEvent(new CustomEvent('ft:refreshRoutine'));
      renderOpenUrgentHint();
    }, 800);
    return;
  }

  const breakEnd = new Date();
  const bDurSec = state.breakStart ? Math.floor((breakEnd.getTime() - state.breakStart.getTime()) / 1000) : 0;
  const bDurMin = Math.floor(bDurSec / 60);
  const wasKilled = bDurSec >= ((settings.killSwitch || 17) * 60);
  const breakRow = {
    session_date: focusDateKey(state.breakStart || breakEnd),
    start_time: state.breakStart ? fmt24(state.breakStart) : fmt24(new Date()),
    end_time: fmt24(breakEnd),
    break_activities: state.breakActs.length ? state.breakActs.join('; ') : null,
    break_note: (document.getElementById('break-note').value.trim() || null),
    break_duration_min: bDurMin, overdue: state.overdueShown, returned
  };
  if (wasKilled) breakRow.break_note = (breakRow.break_note ? breakRow.break_note + ' ' : '') + '[dead block — ' + bDurMin + 'm gap ≥ kill-switch]';
  const msg = document.getElementById('save-msg');
  msg.textContent = 'Saving break...'; msg.className = 'save-msg saving';
  const ok = await dbSave(breakRow);
  state.lastSavedSessionId = null;
  if (ok) { msg.textContent = wasKilled ? '✓ Dead block logged — start fresh below' : '✓ Break logged'; msg.className = 'save-msg saved'; }
  else { msg.textContent = navigator.onLine ? '✗ Failed — queued' : '✗ Offline — will sync'; msg.className = 'save-msg failed'; }

  const { markLastFocusEnd, setMode } = await import('./timer.js');
  markLastFocusEnd();
  setTimeout(async () => {
    document.getElementById('break-overlay').classList.remove('show');
    state.pending = null; state.running = false; state.sessionStart = null;
    state.pausedMs = 0; state.pauseStartMs = null; state.inOvertime = false;
    state.timeLeft = settings.pomodoro * 60; state.totalSecs = settings.pomodoro * 60; state.mode = 'pomodoro';
    setMode('pomodoro');
    const { applyDefaultEnergy } = await import('./ui.js');
    applyDefaultEnergy();
    refreshMetrics();
    window.dispatchEvent(new CustomEvent('ft:refreshRoutine'));
    if (settings.autoPomo && returned === true && !wasKilled) {
      const { startTimer } = await import('./timer.js');
      setTimeout(startTimer, 300);
    }
  }, 800);
}

// ── Break snapshot for crash / tab-close recovery ─────────────────
export function saveBreakSnapshot(type, acts) {
  if (!state.breakStart) return;
  try {
    localStorage.setItem(STORAGE_KEYS.breakRecovery, JSON.stringify({
      v: 1, startMs: state.breakStart.getTime(), type: type || state.mode, acts: (acts || []).slice(), savedAt: Date.now()
    }));
  } catch (e) { /* ignore */ }
}
export function clearBreakSnapshot() { try { localStorage.removeItem(STORAGE_KEYS.breakRecovery); } catch (e) { /* ignore */ } }

export function checkBreakRecovery() {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEYS.breakRecovery); } catch (e) { return; }
  if (!raw) return;
  let snap;
  try { snap = JSON.parse(raw); } catch (e) { clearBreakSnapshot(); return; }
  if (!snap || !snap.startMs || Date.now() - snap.startMs > 2 * 3600 * 1000) { clearBreakSnapshot(); return; }
  const dur = Math.floor((snap.savedAt - snap.startMs) / 1000);
  const mm = Math.floor(dur / 60), ss = dur % 60;
  const hint = document.getElementById('flow-hint');
  if (!hint) return;
  hint.textContent = '⚠ Interrupted break (' + mm + 'm ' + ss + 's) — click to save or dismiss';
  hint.className = 'overtime';
  hint.style.cursor = 'pointer';
  hint.onclick = () => {
    clearBreakSnapshot(); hint.style.cursor = ''; hint.onclick = null;
    const d2 = Math.floor((snap.savedAt - snap.startMs) / 1000);
    if (confirm('Save interrupted break to database? Duration: ' + Math.floor(d2 / 60) + 'm ' + Math.floor(d2 % 60) + 's. Activities: ' + (snap.acts && snap.acts.length ? snap.acts.join(', ') : 'none'))) {
      const bS = new Date(snap.startMs), bE = new Date(snap.savedAt);
      dbSave({
        session_date: focusDateKey(bS), start_time: bS.toTimeString().slice(0, 8), end_time: bE.toTimeString().slice(0, 8),
        break_duration_min: Math.floor(d2 / 60), break_activities: snap.acts && snap.acts.length ? snap.acts.join('; ') : null,
        break_note: '[recovered after close/crash]', overdue: false, returned: false
      }).then(ok => {
        hint.textContent = ok ? '✓ Break recovered and saved' : '✗ Recovery failed — check connection';
        hint.className = ok ? '' : 'overtime';
        if (ok) setTimeout(() => { hint.textContent = 'Start a session to begin tracking'; hint.className = ''; }, 3000);
      });
    } else {
      hint.textContent = 'Start a session to begin tracking'; hint.className = '';
    }
  };
}
