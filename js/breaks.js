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

export async function endBreak(returned) {
  stopAlarm();
  clearInterval(state.breakTick); state.breakTick = null;
  clearBreakSnapshot();
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
