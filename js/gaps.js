// gaps.js — an unplanned, unexpected stretch of unaccounted time, as
// opposed to a Break (planned upfront, expected duration or at least a
// deliberate Urgent flag, activities chosen before or during it). A Gap
// is detected retroactively, the moment the NEXT session starts, and its
// activities/note (if any) are logged AFTER the fact -- you weren't
// tracking anything at the time, you're just accounting for it now.
import { state, settings, focusDateKey } from './state.js';
import { fmt24 } from './utils.js';
import { dbSave } from './db.js';
import { renderBreakChips } from './breakActs.js';

// Called once, right as a fresh session starts (see timer.js's
// startTimer()), with the same "last logged activity end" timestamp
// noteFreshChainStartIfNeeded() already uses. markLastFocusEnd() is now
// called at the end of EVERY properly-logged break path too (not just
// session end), so a gap here means nothing was logged in between --
// not that a break happened to run long.
export function checkForUnloggedGap(lastEndMs, sessionStartDate) {
  if (!lastEndMs) return;
  const gapMin = Math.round((sessionStartDate.getTime() - lastEndMs) / 60000);
  const kMin = settings.killSwitch || 17;
  if (gapMin < kMin) return;
  state.pendingGap = {
    gapMin,
    session_date: focusDateKey(new Date(lastEndMs)),
    start_time: fmt24(new Date(lastEndMs)),
    end_time: fmt24(sessionStartDate)
  };
  showGapPrompt(state.pendingGap);
}

export function showGapPrompt(gap) {
  const bar = document.getElementById('gap-prompt');
  const textEl = document.getElementById('gap-prompt-text');
  const form = document.getElementById('gap-form');
  const note = document.getElementById('gap-note');
  if (!bar || !textEl || !form) return;
  textEl.textContent = gap.gapMin + 'm unaccounted before this session — log what happened?';
  state.gapActs = [];
  renderBreakChips();
  if (note) note.value = '';
  form.style.display = 'none';
  bar.classList.add('show');
}
export function hideGapPrompt() {
  const bar = document.getElementById('gap-prompt');
  if (bar) bar.classList.remove('show');
  state.pendingGap = null;
}
export function openGapForm() {
  const form = document.getElementById('gap-form');
  if (form) form.style.display = 'block';
}
export function dismissGap() {
  hideGapPrompt();
}
export async function saveGap() {
  if (!state.pendingGap) return;
  const g = state.pendingGap;
  const noteEl = document.getElementById('gap-note');
  const row = {
    session_date: g.session_date, start_time: g.start_time, end_time: g.end_time,
    break_duration_min: g.gapMin,
    break_activities: state.gapActs.length ? state.gapActs.join('; ') : null,
    break_note: (noteEl && noteEl.value.trim()) || null,
    overdue: false, returned: true, is_gap: true
  };
  const ok = await dbSave(row);
  hideGapPrompt();
  const hint = document.getElementById('flow-hint');
  if (hint && !state.running) {
    hint.textContent = ok ? '✓ Gap logged' : '✗ Gap save failed — ' + (state.lastSaveError || 'check connection');
    hint.className = ok ? '' : 'overtime';
  }
}
