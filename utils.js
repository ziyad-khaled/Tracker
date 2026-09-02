// utils.js — pure helper functions (formatting, dates, escaping). No DOM, no state.
import { CAT_RGBA_MAP } from './config.js';

/** Escape a string for safe insertion into HTML text or a quoted attribute. */
export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Generate a client-side UUID for offline-queue idempotency. */
export function makeClientId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'cid-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

export function catRgba(col, alpha) {
  const rgb = CAT_RGBA_MAP[col];
  return rgb ? `rgba(${rgb},${alpha})` : col;
}

export function localDateKey(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function fmt24(d) { return d.toTimeString().slice(0, 8); }

export function formatDisplayDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function fmtFocusSec(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60), sec = s % 60;
  return m + ':' + String(sec).padStart(2, '0');
}

/** Parse an "M:SS" or "MM" string into whole seconds. Returns null on empty/invalid input. */
export function parseMSS(raw) {
  if (!raw) return null;
  const p = raw.split(':');
  if (p.length === 2) return (parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0)) || null;
  return (parseInt(p[0], 10) * 60) || null;
}

export function parseTimeOnDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const p = timeStr.split(':').map(Number);
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(p[0] || 0, p[1] || 0, p[2] || 0, 0);
  return d;
}

export function rtFmtTime(d) { return d ? d.toTimeString().slice(0, 5) : '—'; }
export function rtFmtWindow(win) { return win ? rtFmtTime(win.start) + ' → ' + rtFmtTime(win.end) : '—'; }
