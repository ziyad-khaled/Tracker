// main.js — application bootstrap. Loaded as the single <script type="module">
// in index.html. Responsible for: PWA/install/offline plumbing, keyboard
// shortcuts, the init() sequence, and exposing the functions referenced by
// inline onclick="..." handlers in the markup onto `window` (see note below).
import { state, loadSettings } from './state.js';
import { loadOfflineQueue, flushQueue } from './db.js';
import * as connection from './connection.js';
import * as settingsPage from './settingsPage.js';
import * as projects from './projects.js';
import * as categories from './categories.js';
import * as breakActs from './breakActs.js';
import * as ui from './ui.js';
import * as timer from './timer.js';
import * as breaks from './breaks.js';
import * as cycleEngine from './cycleEngine.js';
import * as metrics from './metrics.js';
import * as log from './log.js';
import * as edit from './edit.js';
import { buildAlarm } from './alarm.js';
import * as cycles12 from './cycles12.js';
import * as trends from './trends.js';

// ── Expose functions referenced by inline onclick="..." attributes ──────
// The markup was left largely as-is (rewriting every handler to addEventListener
// + data attributes was out of scope for this pass — see README/refactor notes),
// so the functions each handler calls must exist on `window`. This is the one
// place that does that, keeping the "leakage" of globals contained to a single
// file instead of scattered `var` declarations everywhere.
Object.assign(window, {
  showPage: ui.showPage,
  setModalEnergy: ui.setModalEnergy,
  saveCheckin: ui.saveCheckin,
  skipCheckin: ui.skipCheckin,
  setSidebarEnergy: ui.setSidebarEnergy,

  setMode: timer.setMode,
  setBreakMode: timer.setBreakMode,
  toggleTimer: timer.toggleTimer,
  endSession: timer.endSession,
  resetTimer: timer.resetTimer,
  recoverSession: timer.recoverSession,
  saveRecoveredSession: timer.saveRecoveredSession,
  dismissRecovery: timer.dismissRecovery,

  snoozeBreak: breaks.snoozeBreak,
  endBreak: breaks.endBreak,
  saveManualBreak: breaks.saveManualBreak,

  addProject: projects.addProject,
  deleteProject: projects.deleteProject,
  selectProject: projects.selectProject,
  addTask: projects.addTask,
  deleteTask: projects.deleteTask,
  selectTask: projects.selectTask,

  setCategory: categories.setCategory,
  addCategory: categories.addCategory,
  deleteCategory: categories.deleteCategory,
  renameCat: categories.renameCat,
  updateCatEmoji: categories.updateCatEmoji,
  updateCatColor: categories.updateCatColor,
  toggleTimerViewMode: ui.toggleTimerViewMode,

  shiftViewedCycle: cycles12.shiftViewedCycle,
  jumpToCurrentCycle: cycles12.jumpToCurrentCycle,
  setCycleAnchor: cycles12.setCycleAnchor,
  setCycleTargetHours: cycles12.setCycleTargetHours,
  toggleExcluded: categories.toggleExcluded,

  toggleBreakAct: breakActs.toggleBreakAct,
  toggleManualBreakAct: breakActs.toggleManualBreakAct,
  addBreakAct: breakActs.addBreakAct,
  deleteBreakAct: breakActs.deleteBreakAct,
  updateBreakActLabel: breakActs.updateBreakActLabel,
  updateBreakActEmoji: breakActs.updateBreakActEmoji,

  rtLogManualInterruption: cycleEngine.rtLogManualInterruption,
  toggleKillSwitchDisabled: cycleEngine.toggleKillSwitchDisabled,

  exportCSV: log.exportCSV,
  loadLog: log.loadLog,
  switchLogTab: log.switchLogTab,
  openCheckinForm: log.openCheckinForm,
  saveCheckinInline: log.saveCheckinInline,
  setCi2Energy: log.setCi2Energy,

  openEditModal: edit.openEditModal,
  closeEditModal: edit.closeEditModal,
  saveEdit: edit.saveEdit,
  deleteSession: edit.deleteSession,

  testConnection: connection.testConnection,
  saveSettings: settingsPage.saveSettings,
  toggleSetting: settingsPage.toggleSetting,
  clearLocalCache: settingsPage.clearLocalCache
});

// ── Service worker / install prompt ──────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredInstall = e;
  document.getElementById('install-banner').classList.add('show');
});
document.getElementById('install-btn').addEventListener('click', async () => {
  if (!state.deferredInstall) return;
  state.deferredInstall.prompt();
  const r = await state.deferredInstall.userChoice;
  if (r.outcome === 'accepted') document.getElementById('install-banner').classList.remove('show');
  state.deferredInstall = null;
});
document.getElementById('dismiss-install').addEventListener('click', () => {
  document.getElementById('install-banner').classList.remove('show');
});

// ── Online/offline ────────────────────────────────────────────────
window.addEventListener('online', () => { document.getElementById('offline-bar').classList.remove('show'); flushQueue(); });
window.addEventListener('offline', () => { document.getElementById('offline-bar').classList.add('show'); });

// ── Visibility / keyboard shortcuts ─────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.sessionStart && state.running) timer.saveRecoverySnapshot();
  if (document.visibilityState === 'visible' && state.running) timer.doTick();
});
window.addEventListener('keydown', (event) => {
  if (event.key !== ' ' && event.code !== 'Space') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  timer.toggleTimer();
});

// showPage() also needs to trigger the per-page data loads that used to be
// inline in the monolith's showPage() function.
window.addEventListener('ft:pageShown', async (e) => {
  const id = e.detail.id;
  if (id === 'log') log.loadLog();
  if (id === 'analytics') { log.loadAnalytics(); cycles12.renderCycle12(); trends.renderTrends(); }
  if (id === 'checkins') log.loadCheckinHistory();
  if (id === 'routine') cycleEngine.refreshRoutine();
});

// ── Boot sequence ────────────────────────────────────────────────
(function init() {
  try {
    const raw = JSON.parse(localStorage.getItem('ft_settings') || '{}');
    if ((raw.short && raw.short > 30) || (raw.long && raw.long > 60)) localStorage.removeItem('ft_settings');
  } catch (e) { localStorage.removeItem('ft_settings'); }

  buildAlarm();
  loadOfflineQueue();
  loadSettings();
  settingsPage.populateSettingsForm();
  categories.loadCategories();
  categories.loadExcluded();
  cycles12.initCycle12Config();
  projects.loadProjects();
  breakActs.loadBreakActs();
  ui.applyDefaultEnergy();
  ui.applyTimerViewMode();
  timer.checkRecovery();
  breaks.checkBreakRecovery();
  breaks.renderOpenUrgentHint();
  timer.setRing(1);
  connection.initSupabase();
  ui.checkDailyCheckin();
  cycleEngine.refreshRoutine();
  timer.startKillSwitchMonitor();
  if (!navigator.onLine) document.getElementById('offline-bar').classList.add('show');
})();
