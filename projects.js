// projects.js — two-level project/task list, local-only (not synced to Supabase).
import { STORAGE_KEYS } from './config.js';
import { state } from './state.js';
import { escHtml } from './utils.js';

export function loadProjects() {
  try { state.projects = JSON.parse(localStorage.getItem(STORAGE_KEYS.projects) || '{}'); }
  catch (e) { state.projects = {}; }
  renderProjects();
}
function saveProjects() { localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(state.projects)); }

export function addProject() {
  const inp = document.getElementById('new-proj-input');
  const name = inp.value.trim();
  if (!name) return;
  const id = 'p_' + Date.now();
  state.projects[id] = { name, tasks: {} };
  saveProjects(); renderProjects(); inp.value = '';
  selectProject(id);
}
export function deleteProject(id) {
  delete state.projects[id];
  if (state.currentProject === id) {
    state.currentProject = null; state.currentTask = null;
    document.getElementById('task-section').style.display = 'none';
    window.dispatchEvent(new CustomEvent('ft:updateTaskDisplay'));
  }
  saveProjects(); renderProjects();
}
export function selectProject(id) {
  state.currentProject = id; state.currentTask = null;
  renderProjects(); renderTasks();
  document.getElementById('proj-name-lbl').textContent = state.projects[id] ? state.projects[id].name : '';
  document.getElementById('task-section').style.display = 'block';
  window.dispatchEvent(new CustomEvent('ft:updateTaskDisplay'));
}
export function addTask() {
  if (!state.currentProject || !state.projects[state.currentProject]) return;
  const inp = document.getElementById('new-task-input');
  const name = inp.value.trim();
  if (!name) return;
  const id = 't_' + Date.now();
  state.projects[state.currentProject].tasks[id] = name;
  saveProjects(); renderTasks(); inp.value = '';
  selectTask(id);
}
export function deleteTask(id) {
  if (!state.currentProject || !state.projects[state.currentProject]) return;
  delete state.projects[state.currentProject].tasks[id];
  if (state.currentTask === id) { state.currentTask = null; window.dispatchEvent(new CustomEvent('ft:updateTaskDisplay')); }
  saveProjects(); renderTasks();
}
export function selectTask(id) {
  state.currentTask = id; renderTasks();
  window.dispatchEvent(new CustomEvent('ft:updateTaskDisplay'));
}

export function renderProjects() {
  const list = document.getElementById('proj-list');
  const keys = Object.keys(state.projects);
  if (!keys.length) {
    list.innerHTML = '<div style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:4px 0;">No projects yet</div>';
    return;
  }
  list.innerHTML = keys.map(id => {
    const p = state.projects[id], isA = id === state.currentProject;
    return `<div style="display:flex;gap:4px;align-items:center;">
      <button class="proj-item${isA ? ' active' : ''}" onclick="selectProject('${id}')">
        <span class="proj-name">${escHtml(p.name)}</span>
        <span style="font-family:var(--mono);font-size:9px;color:var(--muted);">${Object.keys(p.tasks).length} tasks</span>
      </button>
      <button class="proj-del" onclick="deleteProject('${id}')">✕</button>
    </div>`;
  }).join('');
}
export function renderTasks() {
  const list = document.getElementById('task-list');
  if (!state.currentProject || !state.projects[state.currentProject]) { list.innerHTML = ''; return; }
  const tasks = state.projects[state.currentProject].tasks, keys = Object.keys(tasks);
  if (!keys.length) {
    list.innerHTML = '<div style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:4px 0;">No tasks yet</div>';
    return;
  }
  list.innerHTML = keys.map(id => {
    const isA = id === state.currentTask;
    return `<div style="display:flex;gap:4px;align-items:center;">
      <button class="task-item${isA ? ' active' : ''}" onclick="selectTask('${id}')">
        <span class="task-name-text">${escHtml(tasks[id])}</span>
      </button>
      <button class="task-del" onclick="deleteTask('${id}')">✕</button>
    </div>`;
  }).join('');
}
