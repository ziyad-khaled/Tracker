// settingsPage.js — wires the Settings page's form fields to state.settings.
// (state.js owns load/validate/persist; this module is the DOM glue.)
import { STORAGE_KEYS } from './config.js';
import { state, settings, persistSettings } from './state.js';
import { refreshMetrics } from './metrics.js';
import { refreshRoutine } from './cycleEngine.js';
import { renderClock, setRing } from './timer.js';
import { applyDefaultEnergy } from './ui.js';

export function populateSettingsForm() {
  document.getElementById('set-pomodoro').value = settings.pomodoro;
  document.getElementById('set-short').value = settings.short;
  document.getElementById('set-long').value = settings.long;
  document.getElementById('set-interval').value = settings.interval;
  document.getElementById('set-overdue').value = settings.overdue;
  document.getElementById('set-timerMode').value = settings.timerMode;
  document.getElementById('tog-autoBreak').classList.toggle('on', settings.autoBreak);
  document.getElementById('tog-autoPomo').classList.toggle('on', settings.autoPomo);
  document.getElementById('set-avgMode').value = settings.avgMode;
  document.getElementById('set-nightDate').value = settings.nightDate;
  const ncr = document.getElementById('set-nightCutoff'); if (ncr) ncr.value = settings.nightCutoff;
  const ncrr = document.getElementById('nightcutoff-row'); if (ncrr) ncrr.style.display = settings.nightDate === 'prev' ? 'flex' : 'none';
  document.getElementById('set-defEnergy').value = settings.defEnergy;
  const idMap = {
    'set-ceilingMin': settings.ceilingMin, 'set-cycleTarget': settings.cycleTarget, 'set-cycleCap': settings.cycleCap,
    'set-cycleBreak': settings.cycleBreak, 'set-killSwitch': settings.killSwitch, 'set-chainKillSwitch': settings.chainKillSwitch, 'set-cyclesPerChain': settings.cyclesPerChain
  };
  Object.keys(idMap).forEach(id => { const el = document.getElementById(id); if (el) el.value = idMap[id]; });
}

export function saveSettings() {
  settings.pomodoro = parseInt(document.getElementById('set-pomodoro').value) || 25;
  settings.short = parseInt(document.getElementById('set-short').value) || 5;
  settings.long = parseInt(document.getElementById('set-long').value) || 15;
  settings.interval = parseInt(document.getElementById('set-interval').value) || 4;
  settings.overdue = parseInt(document.getElementById('set-overdue').value) || 3;
  settings.timerMode = document.getElementById('set-timerMode').value || 'flow';
  settings.avgMode = document.getElementById('set-avgMode').value || 'include';
  settings.nightDate = document.getElementById('set-nightDate').value || 'actual';
  settings.nightCutoff = Math.min(8, Math.max(0, parseInt(document.getElementById('set-nightCutoff').value) || 4));
  settings.defEnergy = parseInt(document.getElementById('set-defEnergy').value) || 0;
  ['set-ceilingMin', 'set-cycleTarget', 'set-cycleCap', 'set-cycleBreak', 'set-killSwitch', 'set-chainKillSwitch', 'set-cyclesPerChain'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    settings[id.replace('set-', '')] = parseInt(el.value) || 0;
  });
  persistSettings();
  refreshRoutine();
  const overlayOpen = document.getElementById('break-overlay').classList.contains('show');
  if (!state.running && !overlayOpen && !state.manualBreakTick) {
    state.timeLeft = state.totalSecs = settings.pomodoro * 60;
    renderClock(state.timeLeft, false);
    setRing(1);
  }
  const ncr = document.getElementById('nightcutoff-row'); if (ncr) ncr.style.display = settings.nightDate === 'prev' ? 'flex' : 'none';
  if (state.sb) {
    refreshMetrics();
    const analyticsPage = document.getElementById('page-analytics');
    if (analyticsPage && analyticsPage.classList.contains('active')) import('./log.js').then(m => m.loadAnalytics());
  }
  if (!state.running && !state.sessionStart) applyDefaultEnergy();
}

export function toggleSetting(key) {
  settings[key] = !settings[key];
  document.getElementById('tog-' + key).classList.toggle('on', settings[key]);
  persistSettings();
}

export function clearLocalCache() {
  if (!confirm('Clear local cache? Supabase data is unaffected — categories and break activities will reload from the database.')) return;
  [STORAGE_KEYS.settings, STORAGE_KEYS.daymeta, STORAGE_KEYS.projects, STORAGE_KEYS.categories, STORAGE_KEYS.excluded, STORAGE_KEYS.breakActs]
    .forEach(k => localStorage.removeItem(k));
  location.reload();
}
