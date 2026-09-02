// categories.js — session categories: local cache + Supabase app_config sync.
import { STORAGE_KEYS, DEFAULT_CATS, CAT_COLORS, CAT_COLOR_LABELS } from './config.js';
import { state } from './state.js';
import { escHtml, catRgba } from './utils.js';
import { dbConfigGet, dbConfigSet } from './db.js';
import { updateTaskDisplay } from './ui.js';
import { refreshMetrics } from './metrics.js';

function rebuildCatMap(arr) {
  state.CAT = {};
  arr.forEach(c => { state.CAT[c.name] = { emoji: c.emoji, col: c.col }; });
}

export function loadCategories() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.categories)); } catch (e) { /* ignore */ }
  if (stored && stored.length) {
    state.CAT = {};
    stored.forEach(c => { state.CAT[c.name] = { emoji: c.emoji || '📌', col: c.col || 'var(--muted)' }; });
  } else {
    rebuildCatMap(DEFAULT_CATS);
  }
  renderCategoryChips(); renderCategorySettings(); renderExcludeUI();

  dbConfigGet('ft_categories').then(remote => {
    if (remote && remote !== false && remote.length) {
      state.CAT = {};
      remote.forEach(c => { state.CAT[c.name] = { emoji: c.emoji || '📌', col: c.col || 'var(--muted)' }; });
      localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(remote));
      renderCategoryChips(); renderCategorySettings(); renderExcludeUI();
    } else if (remote === false) {
      saveCategories();
    }
  });
}
function saveCategories() {
  const arr = Object.keys(state.CAT).map(k => ({ name: k, emoji: state.CAT[k].emoji, col: state.CAT[k].col }));
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(arr));
  dbConfigSet('ft_categories', arr);
}

export function renderCategoryChips() {
  const grid = document.getElementById('cat-grid-dynamic');
  if (!grid) return;
  grid.innerHTML = Object.entries(state.CAT).map(([name, cat]) => {
    const isA = name === state.currentCat;
    const style = isA
      ? `border-color:${catRgba(cat.col, 0.7)};color:${catRgba(cat.col, 1)};background:${catRgba(cat.col, 0.12)};`
      : `border-color:${catRgba(cat.col, 0.25)};color:${catRgba(cat.col, 0.55)};`;
    return `<button class="cat-chip" data-cat="${escHtml(name)}" onclick="setCategory('${escHtml(name)}')" style="${style}"><span class="cat-emoji">${cat.emoji}</span>${escHtml(name)}</button>`;
  }).join('');
}
export function renderCategorySettings() {
  const list = document.getElementById('cat-settings-list');
  if (!list) return;
  list.innerHTML = Object.entries(state.CAT).map(([name, cat]) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <input type="text" class="input-field" value="${escHtml(cat.emoji)}" maxlength="2" style="width:44px;text-align:center;font-size:16px;padding:6px 4px;" onchange="updateCatEmoji('${escHtml(name)}',this.value)">
      <input type="text" class="input-field" value="${escHtml(name)}" style="flex:1;" onchange="renameCat('${escHtml(name)}',this.value)">
      <select class="input-field" style="width:90px;" onchange="updateCatColor('${escHtml(name)}',this.value)">
        ${CAT_COLORS.map((col, i) => `<option value="${col}"${cat.col === col ? ' selected' : ''}>${CAT_COLOR_LABELS[i]}</option>`).join('')}
      </select>
      <button class="proj-del" style="font-size:13px;" onclick="deleteCategory('${escHtml(name)}')">✕</button>
    </div>`).join('');
}
export function addCategory() {
  const inp = document.getElementById('new-cat-name'), ei = document.getElementById('new-cat-emoji');
  const name = inp.value.trim(), emoji = ei.value.trim() || '📌';
  if (!name || state.CAT[name]) return;
  state.CAT[name] = { emoji, col: 'var(--muted)' };
  saveCategories(); renderCategoryChips(); renderCategorySettings();
  inp.value = ''; ei.value = '';
}
export function deleteCategory(name) {
  if (Object.keys(state.CAT).length <= 1) return;
  delete state.CAT[name];
  if (state.currentCat === name) { state.currentCat = null; updateTaskDisplay(); }
  saveCategories(); renderCategoryChips(); renderCategorySettings();
}
export function renameCat(oldName, newName) {
  newName = newName.trim();
  if (!newName || newName === oldName || state.CAT[newName]) return;
  const val = state.CAT[oldName];
  delete state.CAT[oldName];
  state.CAT[newName] = val;
  if (state.currentCat === oldName) state.currentCat = newName;
  saveCategories(); renderCategoryChips(); renderCategorySettings();
}
export function updateCatEmoji(name, emoji) {
  if (!state.CAT[name]) return;
  state.CAT[name].emoji = emoji.trim() || '📌';
  saveCategories(); renderCategoryChips();
}
export function updateCatColor(name, col) {
  if (!state.CAT[name]) return;
  state.CAT[name].col = col;
  saveCategories(); renderCategoryChips();
}
export function setCategory(cat) {
  state.currentCat = cat;
  renderCategoryChips();
  updateTaskDisplay();
}

// ── Excluded-from-average categories ────────────────────────────
export function loadExcluded() {
  try { state.excludedFromAvg = JSON.parse(localStorage.getItem(STORAGE_KEYS.excluded) || '{}'); }
  catch (e) { state.excludedFromAvg = {}; }
  renderExcludeUI();
}
function saveExcluded() { localStorage.setItem(STORAGE_KEYS.excluded, JSON.stringify(state.excludedFromAvg)); }
export function toggleExcluded(cat) {
  if (state.excludedFromAvg[cat]) delete state.excludedFromAvg[cat];
  else state.excludedFromAvg[cat] = true;
  saveExcluded(); renderExcludeUI(); refreshMetrics();
  const analyticsPage = document.getElementById('page-analytics');
  if (analyticsPage && analyticsPage.classList.contains('active')) {
    import('./log.js').then(m => m.loadAnalytics());
  }
}
export function renderExcludeUI() {
  const el = document.getElementById('cat-exclude-chips');
  if (!el) return;
  el.innerHTML = Object.keys(state.CAT).map(k => {
    const excl = state.excludedFromAvg[k];
    const col = catRgba(state.CAT[k].col, excl ? 0.3 : 1);
    const bg = excl ? 'none' : catRgba(state.CAT[k].col, 0.12);
    const td = excl ? 'line-through' : 'none';
    return `<button onclick="toggleExcluded('${k}')" style="font-family:var(--mono);font-size:10px;padding:5px 10px;border-radius:var(--r);cursor:pointer;border:1px solid ${col};color:${col};background:${bg};text-decoration:${td};transition:all .15s;">${state.CAT[k].emoji} ${k}</button>`;
  }).join('');
}
