// ui.js — small cross-cutting UI helpers that don't belong to one feature module.
import { STORAGE_KEYS } from './config.js';
import { state, settings, isoDate } from './state.js';
import { catRgba, formatDisplayDate } from './utils.js';

export function updateTaskDisplay() {
  let taskName = '';
  if (state.currentProject && state.currentTask && state.projects[state.currentProject]) {
    taskName = state.projects[state.currentProject].tasks[state.currentTask] || '';
  }
  document.getElementById('task-name-shown').textContent = taskName || '—';
  const pill = document.getElementById('task-cat-pill');
  if (state.currentCat && state.CAT[state.currentCat]) {
    const col = state.CAT[state.currentCat].col;
    pill.textContent = state.CAT[state.currentCat].emoji + ' ' + state.currentCat;
    pill.className = 'task-cat-pill';
    pill.style.borderColor = catRgba(col, 0.6);
    pill.style.color = catRgba(col, 1);
    pill.style.background = catRgba(col, 0.1);
  } else {
    pill.textContent = 'no category';
    pill.className = 'task-cat-pill';
    pill.style.borderColor = ''; pill.style.color = ''; pill.style.background = '';
  }
}
window.addEventListener('ft:updateTaskDisplay', updateTaskDisplay);

export function setSidebarEnergy(e) {
  state.currentEnergy = e;
  document.querySelectorAll('.energy-btn[data-e]').forEach(b => b.classList.toggle('active', parseInt(b.dataset.e) === e));
}
export function applyDefaultEnergy() {
  if (settings.defEnergy > 0) setSidebarEnergy(settings.defEnergy);
  else {
    state.currentEnergy = null;
    document.querySelectorAll('.energy-btn[data-e]').forEach(b => b.classList.remove('active'));
  }
}

export function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelector(`.nav-tab[onclick="showPage('${id}')"]`).classList.add('active');
  window.dispatchEvent(new CustomEvent('ft:pageShown', { detail: { id } }));
}

// ── Daily check-in modal (first-run-of-the-day prompt) ──────────
export function loadMeta() { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.daymeta) || '{}'); } catch (e) { return {}; } }
export function saveMeta(m) { localStorage.setItem(STORAGE_KEYS.daymeta, JSON.stringify(m)); }

export function showCheckinModal() {
  document.getElementById('checkin-date-sub').textContent = formatDisplayDate(isoDate());
  document.getElementById('ci-wake').value = new Date().toTimeString().slice(0, 5);
  document.getElementById('checkin-modal').classList.add('show');
}
export function setModalEnergy(e) {
  state.modalEnergy = e;
  document.querySelectorAll('.ci-energy-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.e) === e));
}
export function saveCheckin() {
  const sleep = document.getElementById('ci-sleep').value;
  const wake = document.getElementById('ci-wake').value;
  const meta = loadMeta();
  meta[isoDate()] = { sleep, wake, energy: state.modalEnergy, done: true };
  saveMeta(meta);
  state.currentEnergy = state.modalEnergy;
  document.getElementById('checkin-modal').classList.remove('show');
  updateCheckinSummary(meta[isoDate()]);
  window.dispatchEvent(new CustomEvent('ft:refreshRoutine'));
  if (state.sb) {
    state.sb.from('daily_checkins')
      .upsert([{ date: isoDate(), sleep_hrs: sleep ? parseFloat(sleep) : null, wake_time: wake || null, energy: state.modalEnergy || null }], { onConflict: 'date' })
      .then(res => { if (res.error) console.warn('checkin upsert:', res.error.message); });
  }
}
export function skipCheckin() {
  const meta = loadMeta();
  if (!meta[isoDate()]) meta[isoDate()] = {};
  meta[isoDate()].done = true;
  saveMeta(meta);
  document.getElementById('checkin-modal').classList.remove('show');
}
export function updateCheckinSummary(data) {
  if (!data) return;
  const el = { 1: '↓ Low', 2: '→ Medium', 3: '↑ High' };
  document.getElementById('cs-sleep').textContent = data.sleep ? 'Sleep: ' + data.sleep + 'h' : 'Sleep: —';
  document.getElementById('cs-wake').textContent = data.wake ? 'Wake: ' + data.wake : 'Wake: —';
  document.getElementById('cs-energy').textContent = data.energy ? 'Energy: ' + el[data.energy] : 'Energy: —';
  document.getElementById('checkin-summary').style.display = 'block';
}
export function checkDailyCheckin() {
  const meta = loadMeta(), td = meta[isoDate()];
  if (td && td.done) { state.currentEnergy = td.energy || null; updateCheckinSummary(td); }
  else setTimeout(showCheckinModal, 500);
}
