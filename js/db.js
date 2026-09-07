// db.js — the only module that talks to Supabase. Encapsulates the client,
// offline queue (with idempotency keys, fixing the duplicate-insert bug),
// and small app_config key/value helpers used for cross-device sync.
import { STORAGE_KEYS } from './config.js';
import { state } from './state.js';
import { makeClientId } from './utils.js';

export function loadOfflineQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.offlineQueue) || '[]');
    state.offlineQueue = Array.isArray(saved) ? saved : [];
  } catch (e) { state.offlineQueue = []; }
  updateOfflineBannerVisibility();
}
function persistOfflineQueue() {
  try { localStorage.setItem(STORAGE_KEYS.offlineQueue, JSON.stringify(state.offlineQueue)); }
  catch (e) { console.warn('offline queue persistence failed', e); }
}
function queueOffline(item) {
  state.offlineQueue.push(item);
  persistOfflineQueue();
  updateOfflineBannerVisibility();
}

// Single source of truth for the offline banner: previously this only
// reacted to the browser's own online/offline events, so a fully-
// connected browser whose writes kept failing for a DB-side reason
// (bad migration, RLS, expired key) queued silently forever with no
// visible signal at all -- exactly what happened with the client_id
// index bug. Now it also reacts to queue length.
export function updateOfflineBannerVisibility() {
  const bar = document.getElementById('offline-bar');
  if (!bar) return;
  if (!navigator.onLine) {
    bar.textContent = 'You are offline — sessions will sync when connection is restored';
    bar.classList.add('show');
  } else if (state.offlineQueue.length > 0) {
    bar.textContent = state.offlineQueue.length + ' item' + (state.offlineQueue.length !== 1 ? 's' : '') + " failed to save and haven't synced" + (state.lastSaveError ? ' — ' + state.lastSaveError : ' — check Settings connection');
    bar.classList.add('show');
  } else {
    bar.classList.remove('show');
  }
}

export function setSupabaseClient(client) { state.sb = client; }

/**
 * Insert a focus session and return its id.
 * Every row gets a client-generated `client_id` so retried inserts
 * (e.g. after a network error where the write actually succeeded)
 * can be upserted instead of creating a duplicate row. Requires the
 * `client_id` column + unique index from the migration SQL.
 */
export async function dbInsertReturning(sess) {
  const clientId = sess.client_id || makeClientId();
  const row = {
    client_id: clientId,
    session_date: sess.session_date, start_time: sess.start_time, end_time: sess.end_time,
    span_sec: sess.span_sec, task_type: sess.task_type, focus_sec: sess.focus_sec,
    ratio: sess.ratio, project: sess.project, task: sess.task,
    seq: sess.seq, energy: sess.energy, note: sess.note
  };
  if (!state.sb) { queueOffline(Object.assign({}, sess, { client_id: clientId })); return null; }
  const res = await state.sb.from('focus_sessions').upsert([row], { onConflict: 'client_id' }).select('id').single();
  if (res.error) {
    console.error('insert error:', res.error.message);
    state.lastSaveError = res.error.message;
    queueOffline(Object.assign({}, sess, { client_id: clientId }));
    return null;
  }
  state.lastSaveError = null;
  return res.data ? res.data.id : null;
}

export async function dbSave(sess) {
  const clientId = sess.client_id || makeClientId();
  const row = {
    client_id: clientId,
    session_date: sess.session_date,
    start_time: sess.start_time,
    end_time: sess.end_time,
    break_duration_min: sess.break_duration_min || null,
    break_activities: sess.break_activities || null,
    overdue: sess.overdue || false,
    returned: sess.returned,
    break_note: sess.break_note || null
  };
  if (!state.sb) { queueOffline(Object.assign({ _isBreak: true }, sess, { client_id: clientId })); return false; }
  const res = await state.sb.from('breaks').upsert([row], { onConflict: 'client_id' });
  if (res.error) {
    console.error('breaks insert error:', res.error.message);
    state.lastSaveError = res.error.message;
    queueOffline(Object.assign({ _isBreak: true }, sess, { client_id: clientId }));
    return false;
  }
  state.lastSaveError = null;
  return true;
}

export async function flushQueue() {
  if (!state.sb || !state.offlineQueue.length) return;
  while (state.sb && state.offlineQueue.length) {
    const item = state.offlineQueue[0];
    let failed = false;
    if (item._isBreak) {
      const brow = {
        client_id: item.client_id, session_date: item.session_date, start_time: item.start_time, end_time: item.end_time,
        break_duration_min: item.break_duration_min, break_activities: item.break_activities,
        overdue: item.overdue || false, returned: item.returned, break_note: item.break_note || null
      };
      const res = await state.sb.from('breaks').upsert([brow], { onConflict: 'client_id' });
      failed = !!res.error;
    } else {
      const frow = Object.assign({}, item);
      delete frow._otMin; delete frow._isBreak;
      const res2 = await state.sb.from('focus_sessions').upsert([frow], { onConflict: 'client_id' });
      failed = !!res2.error;
    }
    if (failed) { persistOfflineQueue(); updateOfflineBannerVisibility(); return; }
    state.offlineQueue.shift();
    persistOfflineQueue();
  }
  updateOfflineBannerVisibility();
}

export async function dbConfigGet(key) {
  if (!state.sb) return null;
  const res = await state.sb.from('app_config').select('value').eq('key', key).maybeSingle();
  if (res.error) return null;
  if (!res.data) return false;
  try { return JSON.parse(res.data.value); } catch (e) { return false; }
}
export async function dbConfigSet(key, val) {
  if (!state.sb) return;
  await state.sb.from('app_config').upsert([{ key, value: JSON.stringify(val) }], { onConflict: 'key' });
}

export async function fetchSessions(limit) {
  if (!state.sb) return [];
  limit = limit || 500;
  const [fRes, bRes] = await Promise.all([
    state.sb.from('focus_sessions').select('*').order('session_date', { ascending: false }).order('start_time', { ascending: false }).limit(limit),
    state.sb.from('breaks').select('*').order('session_date', { ascending: false }).order('start_time', { ascending: false }).limit(Math.floor(limit / 2))
  ]);
  const fRows = fRes.error ? [] : (fRes.data || []);
  const bRows = (bRes.error ? [] : (bRes.data || [])).map(b => Object.assign({ task_type: '_break', focus_sec: 0, ratio: 0 }, b));
  const all = fRows.concat(bRows);
  all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return all;
}
