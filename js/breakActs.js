// breakActs.js — customizable break-activity chips shown in the overlay & manual break panel.
import { STORAGE_KEYS, DEFAULT_BREAK_ACTS, RETIRED_ONE_OFF_BREAK_ACTS } from './config.js';
import { state } from './state.js';
import { escHtml } from './utils.js';
import { dbConfigGet, dbConfigSet } from './db.js';

function mergeDefaultBreakActs(list) {
  const merged = [], seen = {};
  (list || []).concat(DEFAULT_BREAK_ACTS).forEach(activity => {
    if (!activity || !activity.label) return;
    const key = activity.label.trim().toLowerCase();
    if (!key || seen[key] || RETIRED_ONE_OFF_BREAK_ACTS.has(key)) return;
    seen[key] = true;
    merged.push({ label: activity.label.trim(), emoji: (activity.emoji || '').trim() });
  });
  return merged;
}

export function loadBreakActs() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORAGE_KEYS.breakActs) || 'null'); } catch (e) { /* ignore */ }
  state.breakActsList = mergeDefaultBreakActs(s && s.length ? s : []);
  if (!s || state.breakActsList.length !== s.length) {
    localStorage.setItem(STORAGE_KEYS.breakActs, JSON.stringify(state.breakActsList));
  }
  renderBreakChips(); renderBreakActSettings();

  dbConfigGet('ft_break_acts').then(remote => {
    if (remote && remote !== false && remote.length) {
      const remoteMerged = mergeDefaultBreakActs(remote);
      state.breakActsList = remoteMerged;
      localStorage.setItem(STORAGE_KEYS.breakActs, JSON.stringify(remoteMerged));
      if (remoteMerged.length !== remote.length) saveBreakActs();
      renderBreakChips(); renderBreakActSettings();
    } else if (remote === false) {
      saveBreakActs();
    }
  });
}
function saveBreakActs() {
  localStorage.setItem(STORAGE_KEYS.breakActs, JSON.stringify(state.breakActsList));
  dbConfigSet('ft_break_acts', state.breakActsList);
}

function breakChipHtml(act, toggleFn) {
  const label = escHtml(act.label);
  // Uses data attributes + a single delegated-style inline call rather than
  // embedding the raw label inside a JS string literal.
  return `<button class="break-chip" data-act="${label}" data-fn="${toggleFn}" onclick="var a=this.dataset.act,f=this.dataset.fn;if(f==='toggleBreakAct')toggleBreakAct(this,a);else toggleManualBreakAct(this,a);">${act.emoji ? act.emoji + ' ' : ''}${label}</button>`;
}
export function renderBreakChips() {
  const overlay = document.getElementById('break-chips-dynamic');
  const manual = document.getElementById('manual-break-chips-dynamic');
  const html = state.breakActsList.map(a => breakChipHtml(a, 'toggleBreakAct')).join('');
  const htmlM = state.breakActsList.map(a => breakChipHtml(a, 'toggleManualBreakAct')).join('');
  if (overlay) overlay.innerHTML = html;
  if (manual) manual.innerHTML = htmlM;
}
export function renderBreakActSettings() {
  const list = document.getElementById('break-acts-settings-list');
  if (!list) return;
  list.innerHTML = state.breakActsList.map((a, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <input type="text" class="input-field" value="${escHtml(a.emoji || '')}" maxlength="2" style="width:44px;text-align:center;font-size:16px;padding:6px 4px;" onchange="updateBreakActEmoji(${i},this.value)">
      <input type="text" class="input-field" value="${escHtml(a.label)}" style="flex:1;" onchange="updateBreakActLabel(${i},this.value)">
      <button class="proj-del" style="font-size:13px;" onclick="deleteBreakAct(${i})">✕</button>
    </div>`).join('');
}
export function addBreakAct() {
  const inp = document.getElementById('new-break-act-name'), ei = document.getElementById('new-break-act-emoji');
  const label = inp.value.trim(), emoji = ei.value.trim() || '';
  if (!label) return;
  state.breakActsList.push({ label, emoji });
  saveBreakActs(); renderBreakChips(); renderBreakActSettings();
  inp.value = ''; ei.value = '';
}
export function deleteBreakAct(i) {
  state.breakActsList.splice(i, 1);
  saveBreakActs(); renderBreakChips(); renderBreakActSettings();
}
export function updateBreakActLabel(i, val) {
  val = val.trim(); if (!val) return;
  state.breakActsList[i].label = val;
  saveBreakActs(); renderBreakChips();
}
export function updateBreakActEmoji(i, val) {
  state.breakActsList[i].emoji = val.trim();
  saveBreakActs(); renderBreakChips();
}

export function toggleBreakAct(el, act) {
  const idx = state.breakActs.indexOf(act);
  if (idx >= 0) state.breakActs.splice(idx, 1); else state.breakActs.push(act);
  el.classList.toggle('active', state.breakActs.includes(act));
}
export function toggleManualBreakAct(el, act) {
  const idx = state.manualBreakActs.indexOf(act);
  if (idx >= 0) state.manualBreakActs.splice(idx, 1); else state.manualBreakActs.push(act);
  el.classList.toggle('active', state.manualBreakActs.includes(act));
}
