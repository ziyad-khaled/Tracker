// state.js — single source of truth for mutable app state + settings.
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './config.js';
import { localDateKey } from './utils.js';

// ── Settings ─────────────────────────────────────────────────────
export let settings = Object.assign({}, DEFAULT_SETTINGS);

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
    Object.assign(settings, saved);
  } catch (e) { /* ignore corrupt data */ }

  settings.pomodoro = Math.min(120, Math.max(1, parseInt(settings.pomodoro) || 25));
  settings.short = Math.min(30, Math.max(1, parseInt(settings.short) || 5));
  settings.long = Math.min(60, Math.max(1, parseInt(settings.long) || 15));
  settings.interval = Math.min(10, Math.max(2, parseInt(settings.interval) || 4));
  settings.overdue = Math.min(20, Math.max(0, parseInt(settings.overdue) || 3));
  // timerMode: 'hard' (alarm + stop at target) | 'flow' (silent, count up
  // indefinitely past target) | 'hybrid' (silent past target like flow, but
  // alarms and force-stops at the cycleCap to prevent runaway overflow).
  // Migrates any pre-existing boolean `flowMode` setting on first load.
  if (!settings.timerMode) settings.timerMode = settings.flowMode === false ? 'hard' : 'flow';
  settings.timerMode = ['hard', 'flow', 'hybrid'].includes(settings.timerMode) ? settings.timerMode : 'flow';
  settings.autoBreak = settings.autoBreak === true;
  settings.autoPomo = settings.autoPomo === true;
  settings.avgMode = (settings.avgMode === 'exclude' || settings.avgMode === 'active') ? 'exclude' : 'include';
  // One-time migration: night-cutoff used to default to OFF ('actual', 4h),
  // which meant any session logged after midnight silently became a new
  // "day" -- breaking daily/weekly averages and same-day seq numbering for
  // a schedule that runs past midnight. Force the corrected default once;
  // after this it's a normal user-editable setting (Settings page already
  // exposes it) and won't be overwritten again.
  if (!settings._nightCutoffMigrated) {
    settings.nightDate = 'prev';
    settings.nightCutoff = 1;
    settings._nightCutoffMigrated = true;
  }
  settings.nightDate = settings.nightDate === 'prev' ? 'prev' : 'actual';
  settings.nightCutoff = isNaN(parseInt(settings.nightCutoff)) || parseInt(settings.nightCutoff) < 0 ? 4 : Math.min(8, parseInt(settings.nightCutoff));
  settings.defEnergy = [0, 1, 2, 3].includes(parseInt(settings.defEnergy)) ? parseInt(settings.defEnergy) : 0;
  settings.ceilingMin = parseInt(settings.ceilingMin) || 260;
  settings.cycleTarget = parseInt(settings.cycleTarget) || 41;
  settings.cycleCap = parseInt(settings.cycleCap) || 45;
  settings.cycleBreak = parseInt(settings.cycleBreak) || 15;
  settings.killSwitch = parseInt(settings.killSwitch) || 17;
  settings.chainKillSwitch = parseInt(settings.chainKillSwitch) || 45;
  settings.cyclesPerChain = parseInt(settings.cyclesPerChain) || 3;
  settings.streakMinFocusMin = Math.max(0, parseInt(settings.streakMinFocusMin) || 0);

  persistSettings();
  return settings;
}

export function persistSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

// ── Date helpers that depend on settings ────────────────────────
export function focusDateKey(date) {
  const d = new Date((date || new Date()).getTime());
  if (settings.nightDate === 'prev' && d.getHours() < (settings.nightCutoff != null ? settings.nightCutoff : 4)) {
    d.setDate(d.getDate() - 1);
  }
  return localDateKey(d);
}
export function isoDate() { return focusDateKey(new Date()); }

// The "workday-aware now" -- same date-shifting focusDateKey() applies to
// a session being saved, but returned as a Date (not a key string) so it
// can drive week/month/streak *boundary* math too. Without this, code
// that asks "what week/month is it right now" via a raw new Date() will
// disagree with the already-shifted session_date on late-night sessions
// -- e.g. at 12:30am (before the cutoff), a session's session_date
// correctly stays "yesterday", but a boundary check using new Date()
// still thinks it's the new calendar day, which can even push the
// session's week out of "this week" entirely at a Sun/Mon edge.
export function workdayNow() {
  const d = new Date();
  if (settings.nightDate === 'prev' && d.getHours() < (settings.nightCutoff != null ? settings.nightCutoff : 4)) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

// ── Central mutable runtime state ───────────────────────────────
// Kept as a plain object (rather than scattered globals) so all modules
// share one authoritative source and mutations are easy to trace.
export const state = {
  sb: null,
  mode: 'pomodoro',
  timeLeft: settings.pomodoro * 60,
  totalSecs: settings.pomodoro * 60,
  running: false,
  tickInterval: null,
  sessionStart: null,
  pausedMs: 0,
  pauseStartMs: null,
  inOvertime: false,
  pomodoroCount: 0,
  seqToday: 0,
  currentEnergy: null,
  currentCat: null,
  currentProject: null,
  currentTask: null,
  projects: {},
  pending: null,
  breakActs: [],
  breakStart: null,
  breakTick: null,
  breakTotalSecs: 0,
  snoozeCount: 0,
  manualBreakTick: null,
  manualBreakActs: [],
  overdueShown: false,
  breakAlarmFired: false,
  killSwitchShown: false,
  lastSavedSessionId: null,
  modalEnergy: null,
  ci2Energy: null,
  editingSessionId: null,
  editingTable: 'focus_sessions',
  currentLogTab: 'sessions',
  CAT: {},
  breakActsList: [],
  excludedFromAvg: {},
  offlineQueue: [],
  deferredInstall: null,
  killSwitchMonitorInterval: null,
  recoveryInterval: null,
  rtCache: null,
  pendingRecovery: null
};
