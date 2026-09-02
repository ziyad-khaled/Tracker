// edit.js — the shared modal used to edit or delete a focus_sessions/breaks row.
import { state } from './state.js';
import { fmtFocusSec, parseMSS } from './utils.js';
import { refreshMetrics } from './metrics.js';

export function openEditModal(id, table) {
  state.editingTable = table || 'focus_sessions';
  if (!state.sb) { alert('Connect Supabase first'); return; }
  const modal = document.getElementById('edit-modal');
  modal.classList.remove('break-mode', 'focus-mode');
  modal.classList.add(state.editingTable === 'breaks' ? 'break-mode' : 'focus-mode');
  document.getElementById('edit-modal-title').textContent = state.editingTable === 'breaks' ? 'Edit Break' : 'Edit Session';
  state.editingSessionId = id;
  document.getElementById('edit-status').textContent = 'Loading...';
  modal.classList.add('show');

  state.sb.from(state.editingTable).select('*').eq('id', id).single().then(res => {
    if (res.error || !res.data) { document.getElementById('edit-status').textContent = '✗ Could not load'; return; }
    const s = res.data;
    document.getElementById('edit-id').value = s.id;
    document.getElementById('edit-date').value = s.session_date || '';
    document.getElementById('edit-seq').value = s.seq != null ? s.seq : '';
    document.getElementById('edit-start').value = s.start_time ? s.start_time.slice(0, 8) : '';
    document.getElementById('edit-end').value = s.end_time ? s.end_time.slice(0, 8) : '';
    const ssec = s.span_sec != null ? s.span_sec : null;
    const spanEl = document.getElementById('edit-span-sec');
    if (spanEl) spanEl.value = ssec != null ? fmtFocusSec(ssec) : '';
    const fsec = s.focus_sec != null ? s.focus_sec : (s.focus_min != null ? s.focus_min * 60 : null);
    const focEl = document.getElementById('edit-focus-sec');
    if (focEl) focEl.value = fsec != null ? fmtFocusSec(fsec) : '';
    document.getElementById('edit-project').value = s.project || '';
    document.getElementById('edit-task').value = s.task || '';
    document.getElementById('edit-energy').value = s.energy != null ? s.energy : '';
    document.getElementById('edit-note').value = s.note || s.break_note || '';
    document.getElementById('edit-break-acts').value = s.break_activities || '';
    document.getElementById('edit-returned').value = s.returned === true ? 'true' : s.returned === false ? 'false' : '';
    const catSel = document.getElementById('edit-cat');
    catSel.innerHTML = '<option value="">—</option>' + Object.keys(state.CAT).map(k => `<option value="${k}"${s.task_type === k ? ' selected' : ''}>${state.CAT[k].emoji} ${k}</option>`).join('');
    document.getElementById('edit-status').textContent = '';
  });
}

export function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('show');
  state.editingSessionId = null;
}

export async function saveEdit() {
  if (!state.sb || !state.editingSessionId) return;
  function fieldVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  const startVal = fieldVal('edit-start'), endVal = fieldVal('edit-end'), dateVal = fieldVal('edit-date');
  const focusSec = parseMSS(fieldVal('edit-focus-sec'));
  const spanSecRaw = fieldVal('edit-span-sec');
  let spanSec = spanSecRaw ? parseMSS(spanSecRaw) : null;
  if (!spanSec && startVal && endVal) {
    const s = startVal.split(':').map(Number), e = endVal.split(':').map(Number);
    const ss = s[0] * 3600 + (s[1] || 0) * 60 + (s[2] || 0);
    let es = e[0] * 3600 + (e[1] || 0) * 60 + (e[2] || 0);
    if (es < ss) es += 86400;
    spanSec = es - ss || null;
  }
  const ratio = (focusSec && spanSec) ? Math.round(focusSec / Math.max(spanSec, 1) * 100) : null;
  const retVal = fieldVal('edit-returned');
  const updates = { session_date: dateVal || null, start_time: startVal || null, end_time: endVal || null };
  if (state.editingTable === 'focus_sessions') {
    Object.assign(updates, {
      span_sec: spanSec, focus_sec: focusSec, ratio, seq: parseInt(fieldVal('edit-seq')) || null,
      project: fieldVal('edit-project') || null, task: fieldVal('edit-task') || null,
      task_type: fieldVal('edit-cat') || null, energy: parseInt(fieldVal('edit-energy')) || null,
      note: fieldVal('edit-note') || null
    });
  } else {
    const bDurSec = spanSec || null, bDurMin = bDurSec ? Math.floor(bDurSec / 60) : null;
    Object.assign(updates, {
      break_duration_min: bDurMin, break_activities: fieldVal('edit-break-acts') || null,
      returned: retVal === 'true' ? true : retVal === 'false' ? false : null, break_note: fieldVal('edit-note') || null
    });
  }
  document.getElementById('edit-status').textContent = 'Saving...';
  const res = await state.sb.from(state.editingTable).update(updates).eq('id', state.editingSessionId);
  if (res.error) {
    document.getElementById('edit-status').textContent = '✗ ' + res.error.message;
  } else {
    document.getElementById('edit-status').textContent = '✓ Saved';
    setTimeout(async () => {
      closeEditModal();
      const { loadLog } = await import('./log.js');
      loadLog();
      refreshMetrics();
    }, 600);
  }
}

export async function deleteSession() {
  if (!state.sb || !state.editingSessionId) return;
  if (!confirm('Delete permanently?')) return;
  const res = await state.sb.from(state.editingTable).delete().eq('id', state.editingSessionId);
  if (res.error) {
    document.getElementById('edit-status').textContent = '✗ ' + res.error.message;
  } else {
    closeEditModal();
    const { loadLog } = await import('./log.js');
    loadLog();
    refreshMetrics();
  }
}
