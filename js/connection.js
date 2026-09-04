// connection.js — Supabase Settings-tab connection flow (separate from db.js,
// which only knows how to read/write once a client exists).
import { STORAGE_KEYS } from './config.js';
import { state } from './state.js';
import { setSupabaseClient, flushQueue } from './db.js';
import { refreshMetrics } from './metrics.js';
import { refreshRoutine } from './cycleEngine.js';
import { initCycle12Config, renderCycle12 } from './cycles12.js';
import { renderTrends } from './trends.js';

function setPill(cls, label) {
  document.getElementById('db-pill').className = 'db-pill ' + cls;
  document.getElementById('db-label').textContent = label;
}
function showConn(cls, text) {
  const el = document.getElementById('conn-msg');
  el.className = 'conn-msg show ' + cls;
  el.textContent = text;
}

export function connectSB(url, key, fb) {
  try {
    const client = supabase.createClient(url, key);
    client.from('focus_sessions').select('id', { count: 'exact', head: true }).then(res => {
      if (res.error) {
        setSupabaseClient(null);
        setPill('error', 'error');
        document.getElementById('setup-banner').classList.remove('hidden');
        if (fb) showConn('fail', '✗ ' + res.error.message);
      } else {
        setSupabaseClient(client);
        setPill('connected', 'connected');
        document.getElementById('setup-banner').classList.add('hidden');
        localStorage.setItem(STORAGE_KEYS.sbUrl, url);
        localStorage.setItem(STORAGE_KEYS.sbKey, key);
        if (fb) showConn('ok', '✓ Connected — ' + res.count + ' sessions');
        refreshMetrics(); flushQueue(); refreshRoutine();
        initCycle12Config().then(renderCycle12);
        renderTrends();
      }
    });
  } catch (e) {
    setSupabaseClient(null);
    if (fb) showConn('fail', '✗ Invalid credentials');
  }
}

export function initSupabase() {
  const url = localStorage.getItem(STORAGE_KEYS.sbUrl) || '';
  const key = localStorage.getItem(STORAGE_KEYS.sbKey) || '';
  if (url && key) {
    document.getElementById('sb-url').value = url;
    document.getElementById('sb-key').value = key;
    connectSB(url, key, false);
  } else {
    document.getElementById('setup-banner').classList.remove('hidden');
  }
}
export function testConnection() {
  const url = document.getElementById('sb-url').value.trim();
  const key = document.getElementById('sb-key').value.trim();
  if (!url || !key) { showConn('fail', 'Enter both URL and key'); return; }
  showConn('idle', 'Testing...');
  connectSB(url, key, true);
}
