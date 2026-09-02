// log.js — the Log page (sessions/breaks/check-ins tables), the Analytics
// page, and the standalone Check-in history tab.
import { state, settings, isoDate, focusDateKey } from './state.js';
import { catRgba, fmtFocusSec, localDateKey, formatDisplayDate } from './utils.js';
import { fetchSessions } from './db.js';
import { currentWeekBounds, weekBounds, weekTotal, weeklyAverageDivisor, weeklyAverageLabel } from './metrics.js';
import { loadMeta, saveMeta, updateCheckinSummary } from './ui.js';

export function switchLogTab(tab) {
  state.currentLogTab = tab;
  document.getElementById('tab-sessions').classList.toggle('active', tab === 'sessions');
  document.getElementById('tab-breaks').classList.toggle('active', tab === 'breaks');
  document.getElementById('tab-checkins-log').classList.toggle('active', tab === 'checkins');
  document.getElementById('sessions-table-wrap').style.display = tab === 'sessions' ? 'block' : 'none';
  document.getElementById('checkins-log-wrap').style.display = tab === 'checkins' ? 'block' : 'none';
  document.getElementById('breaks-table-wrap').style.display = tab === 'breaks' ? 'block' : 'none';
  if (tab === 'checkins') loadCheckinLogTab();
}

export async function loadLog() {
  document.getElementById('log-count').textContent = 'Loading...';
  if (!state.sb) return;
  const [fsRes, brRes] = await Promise.all([
    state.sb.from('focus_sessions').select('*').order('session_date', { ascending: false }).order('start_time', { ascending: false }).limit(500),
    state.sb.from('breaks').select('*').order('session_date', { ascending: false }).order('start_time', { ascending: false }).limit(500)
  ]);
  const fSess = fsRes.error ? [] : (fsRes.data || []);
  const bRows = brRes.error ? [] : (brRes.data || []);
  document.getElementById('log-count').textContent = fSess.length + ' sessions · ' + bRows.length + ' breaks';

  const checkinMap = {};
  const allDates = [...new Set(fSess.map(s => s.session_date))];
  if (allDates.length) {
    const cr = await state.sb.from('daily_checkins').select('date,sleep_hrs,wake_time').in('date', allDates);
    if (!cr.error && cr.data) cr.data.forEach(c => { checkinMap[c.date] = c; });
  }
  const eMap = { 1: '↓', 2: '→', 3: '↑' };

  const stbody = document.getElementById('sessions-tbody'), sempty = document.getElementById('sessions-empty');
  if (!fSess.length) { stbody.innerHTML = ''; sempty.style.display = 'block'; }
  else {
    sempty.style.display = 'none';
    stbody.innerHTML = fSess.map(s => {
      const ratio = s.ratio != null ? s.ratio : (s.span_sec > 0 ? Math.round((s.focus_sec || 0) / s.span_sec * 100) : 100);
      const rCls = ratio >= 85 ? 'badge-hi' : ratio >= 65 ? 'badge-mid' : 'badge-lo';
      const cat = s.task_type && state.CAT[s.task_type];
      const catHtml = cat
        ? '<span class="cat-tag" style="background:' + catRgba(cat.col, 0.1) + ';color:' + catRgba(cat.col, 1) + ';">' + cat.emoji + ' ' + s.task_type + '</span>'
        : '<span class="cat-tag cat-tag-default">' + (s.task_type || '—') + '</span>';
      const ci = checkinMap[s.session_date] || {};
      return '<tr><td><button class="edit-row-btn" onclick="openEditModal(\'' + s.id + '\',\'focus_sessions\')" title="Edit">✏</button></td>'
        + '<td>' + (s.session_date || '—') + '</td><td class="dim">' + (s.start_time ? s.start_time.slice(0, 5) : '—') + '</td>'
        + '<td class="dim">' + (s.end_time ? s.end_time.slice(0, 5) : '—') + '</td><td>' + (s.span_sec != null ? fmtFocusSec(s.span_sec) : '—') + '</td>'
        + '<td><b>' + (s.focus_sec != null ? fmtFocusSec(s.focus_sec) : '—') + '</b></td><td><span class="badge ' + rCls + '">' + ratio + '%</span></td>'
        + '<td class="dim">' + (s.project || '—') + '</td><td>' + (s.task || '—') + '</td><td>' + catHtml + '</td>'
        + '<td class="dim">' + (s.seq != null ? s.seq : '—') + '</td><td>' + (eMap[s.energy] || '—') + '</td>'
        + '<td class="dim">' + (ci.sleep_hrs || '—') + '</td><td class="dim">' + (ci.wake_time ? ci.wake_time.slice(0, 5) : '—') + '</td>'
        + '<td class="dim" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;">' + (s.note || '—') + '</td></tr>';
    }).join('');
  }

  const btbody = document.getElementById('breaks-tbody'), bempty = document.getElementById('breaks-empty');
  if (!bRows.length) { btbody.innerHTML = ''; bempty.style.display = 'block'; }
  else {
    bempty.style.display = 'none';
    btbody.innerHTML = bRows.map(b => {
      let status, statusCol;
      if (b.returned === true) { status = '✓ Returned'; statusCol = 'var(--accent)'; }
      else if (b.returned === false) { status = "✗ Didn't return"; statusCol = 'var(--danger)'; }
      else { status = '⚡ Urgent'; statusCol = 'var(--warn)'; }
      return '<tr style="background:rgba(95,180,255,0.03);"><td><button class="edit-row-btn" onclick="openEditModal(\'' + b.id + '\',\'breaks\')" title="Edit">✏</button></td>'
        + '<td>' + (b.session_date || '—') + '</td><td class="dim">' + (b.start_time ? b.start_time.slice(0, 5) : '—') + '</td>'
        + '<td class="dim">' + (b.end_time ? b.end_time.slice(0, 5) : '—') + '</td><td>' + (b.break_duration_min != null ? b.break_duration_min + 'm' : '—') + '</td>'
        + '<td class="dim" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;">' + (b.break_activities || '—') + '</td>'
        + '<td class="dim">' + (b.overdue ? '⚠ yes' : 'no') + '</td><td style="color:' + statusCol + ';font-family:var(--mono);font-size:11px;">' + status + '</td>'
        + '<td class="dim" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;">' + (b.break_note || '—') + '</td></tr>';
    }).join('');
  }
}

export async function exportCSV() {
  if (!state.sb) { alert('Connect Supabase first.'); return; }
  const [fsRes, brRes] = await Promise.all([
    state.sb.from('focus_sessions').select('*').order('session_date', { ascending: false }).limit(10000),
    state.sb.from('breaks').select('*').order('session_date', { ascending: false }).limit(10000)
  ]);
  const fSess = fsRes.data || [], bRows = brRes.data || [];
  if (!fSess.length && !bRows.length) { alert('No data to export.'); return; }
  const fh = ['Date', 'Start', 'End', 'Span(min)', 'Focus(M:SS)', 'Focus(min)', 'Ratio(%)', 'Project', 'Task', 'Category', 'Seq#', 'Energy', 'Note'];
  const fRows = fSess.map(s => [s.session_date, s.start_time, s.end_time, s.span_sec != null ? fmtFocusSec(s.span_sec) : '—',
    s.focus_sec ? fmtFocusSec(s.focus_sec) : '—', Math.floor((s.focus_sec || 0) / 60), s.ratio, s.project || '', s.task || '',
    s.task_type || '', s.seq, s.energy || '', (s.note || '').replace(/,/g, ';')].map(v => '"' + (v != null ? v : '') + '"').join(','));
  const bh = ['Date', 'Start', 'End', 'Duration(min)', 'Activities', 'Overdue', 'Status', 'Note'];
  const bRows2 = bRows.map(b => {
    const st = b.returned === true ? 'Returned' : b.returned === false ? 'Didnt return' : 'Urgent';
    return [b.session_date, b.start_time, b.end_time, b.break_duration_min || 0, b.break_activities || '', b.overdue ? 'yes' : 'no', st, (b.break_note || '').replace(/,/g, ';')].map(v => '"' + (v != null ? v : '') + '"').join(',');
  });
  const csv = '=== FOCUS SESSIONS ===\n' + [fh.join(',')].concat(fRows).join('\n') + '\n\n=== BREAKS ===\n' + [bh.join(',')].concat(bRows2).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'focus-tracker-' + isoDate() + '.csv';
  a.click();
}

export async function loadAnalytics() {
  if (!state.sb) return;
  const allRows = await fetchSessions(10000);
  if (!allRows.length) return;
  const sessions = allRows.filter(s => s.task_type !== '_break');
  const breaks = allRows.filter(s => s.task_type === '_break');
  const totalFocus = sessions.reduce((a, s) => a + Math.floor((s.focus_sec || 0) / 60), 0);
  document.getElementById('an-sessions').textContent = sessions.length;
  document.getElementById('an-focus').textContent = totalFocus >= 60 ? Math.floor(totalFocus / 60) + 'h ' + (totalFocus % 60) + 'm' : totalFocus + 'm';

  const thisWeek = currentWeekBounds(), lastWeek = weekBounds(1);
  const twTotal = weekTotal(sessions, thisWeek, state.excludedFromAvg);
  const lwTotal = weekTotal(sessions, lastWeek, state.excludedFromAvg);
  const twActiveDays = new Set(sessions.filter(s => s.session_date >= thisWeek[0] && s.session_date <= thisWeek[1] && !state.excludedFromAvg[s.task_type]).map(s => s.session_date)).size;
  const lwActiveDays = new Set(sessions.filter(s => s.session_date >= lastWeek[0] && s.session_date <= lastWeek[1] && !state.excludedFromAvg[s.task_type]).map(s => s.session_date)).size;
  const twDivisor = weeklyAverageDivisor(twActiveDays, true);
  const lwDivisor = weeklyAverageDivisor(lwActiveDays, false);
  const twAvg = Math.round(twTotal / twDivisor), lwAvg = Math.round(lwTotal / lwDivisor);
  document.getElementById('an-thisweek').textContent = twAvg ? twAvg + 'm' : '—';
  document.getElementById('an-thisweek-sub').textContent = thisWeek[0].slice(5) + ' → ' + thisWeek[1].slice(5) + ' · total ' + twTotal + 'm · ' + weeklyAverageLabel(twDivisor, twActiveDays);
  document.getElementById('an-lastweek').textContent = lwAvg ? lwAvg + 'm' : '—';
  document.getElementById('an-lastweek-sub').textContent = lastWeek[0].slice(5) + ' → ' + lastWeek[1].slice(5) + ' · total ' + lwTotal + 'm · ' + weeklyAverageLabel(lwDivisor, lwActiveDays);

  const daily = {};
  sessions.forEach(s => { if (s.session_date) daily[s.session_date] = (daily[s.session_date] || 0) + Math.floor((s.focus_sec || 0) / 60); });
  const days = Object.entries(daily).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-14);
  const maxM = Math.max.apply(null, days.map(d => d[1]).concat([1]));
  document.getElementById('focus-bars').innerHTML = days.length
    ? days.map(d => { const h = Math.round(d[1] / maxM * 100); return '<div class="bar-col"><div class="bar" style="height:' + h + 'px" title="' + d[0] + ': ' + d[1] + 'min"></div><div class="bar-lbl">' + d[0].slice(5) + '</div></div>'; }).join('')
    : '<span style="color:var(--muted);font-family:var(--mono);font-size:11px;">No data</span>';

  const catMin = {};
  Object.keys(state.CAT).forEach(k => { catMin[k] = 0; });
  sessions.forEach(s => { if (s.task_type && state.CAT[s.task_type]) catMin[s.task_type] += Math.floor((s.focus_sec || 0) / 60); });
  document.getElementById('cat-breakdown').innerHTML = Object.entries(catMin).map(([cat, min]) => {
    const h = min >= 60 ? Math.floor(min / 60) + 'h ' + (min % 60) + 'm' : min + 'm';
    return '<div class="cat-an-card"><div class="cat-an-icon">' + state.CAT[cat].emoji + '</div><div class="cat-an-lbl">' + cat + '</div><div class="cat-an-val" style="color:' + state.CAT[cat].col + '">' + h + '</div></div>';
  }).join('');

  const acts = {};
  breaks.forEach(s => { (s.break_activities || '').split('; ').filter(Boolean).forEach(a => { acts[a] = (acts[a] || 0) + 1; }); });
  const ae = Object.entries(acts).sort((a, b) => b[1] - a[1]);
  document.getElementById('break-breakdown').innerHTML = ae.length
    ? ae.map(e => '<div class="break-card"><div class="break-card-lbl">' + e[0] + '</div><div class="break-card-val">' + e[1] + '</div></div>').join('')
    : '<span style="color:var(--muted);font-family:var(--mono);font-size:11px;">No break data yet</span>';
}

// ── Shared helper for both the Log→Check-ins tab and the Check-in page ──
async function buildCheckinRows(sinceDays) {
  const since = new Date(); since.setDate(since.getDate() - sinceDays);
  const sinceStr = localDateKey(since);
  const [ciRes, sessRes] = await Promise.all([
    state.sb.from('daily_checkins').select('*').gte('date', sinceStr).order('date', { ascending: false }),
    state.sb.from('focus_sessions').select('session_date,focus_sec').gte('session_date', sinceStr)
  ]);
  const ciRows = ciRes.data || [], sessRows = sessRes.data || [];
  const sessMap = {};
  sessRows.forEach(s => {
    if (!sessMap[s.session_date]) sessMap[s.session_date] = { count: 0, focusSec: 0 };
    sessMap[s.session_date].count++;
    sessMap[s.session_date].focusSec += (s.focus_sec || 0);
  });
  const allDates = new Set([...ciRows.map(r => r.date), ...Object.keys(sessMap)]);
  const sortedDates = Array.from(allDates).sort().reverse();
  const ciByDate = {};
  ciRows.forEach(r => { ciByDate[r.date] = r; });
  return { sortedDates, ciByDate, sessMap };
}
function renderCheckinRows(sortedDates, ciByDate, sessMap, editHandlerAttr) {
  const energyLabel = ['', '🪫 Low', '😐 Med', '⚡ High'];
  const energyColor = ['', '#e57373', '#9e9e9e', 'var(--accent)'];
  return sortedDates.map(d => {
    const ci = ciByDate[d] || {}, sd = sessMap[d] || { count: 0, focusSec: 0 };
    const eLabel = ci.energy ? energyLabel[ci.energy] || '' : '—';
    const eColor = ci.energy ? energyColor[ci.energy] || 'var(--muted)' : 'var(--muted)';
    const isToday = d === isoDate();
    return '<tr style="' + (isToday ? 'background:rgba(255,255,255,.03)' : '') + '">'
      + '<td style="font-family:var(--mono);font-size:11px;">' + (isToday ? '<span style="color:var(--accent);margin-right:4px;">●</span>' : '') + formatDisplayDate(d) + '</td>'
      + '<td style="font-family:var(--mono);font-size:11px;">' + (ci.sleep_hrs != null ? ci.sleep_hrs + 'h' : '—') + '</td>'
      + '<td style="font-family:var(--mono);font-size:11px;">' + (ci.wake_time ? ci.wake_time.slice(0, 5) : '—') + '</td>'
      + '<td style="font-family:var(--mono);font-size:11px;color:' + eColor + ';">' + eLabel + '</td>'
      + '<td style="font-family:var(--mono);font-size:11px;color:var(--muted);">' + (sd.count ? sd.count : '—') + '</td>'
      + '<td style="font-family:var(--mono);font-size:11px;">' + (sd.focusSec ? fmtFocusSec(sd.focusSec) : '—') + '</td>'
      + '<td><button data-ci-date="' + d + '" onclick="' + editHandlerAttr + '" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:4px 6px;" title="Edit">✎</button></td>'
      + '</tr>';
  }).join('');
}

export async function loadCheckinLogTab() {
  const tbody = document.getElementById('ci-log-body');
  if (!tbody) return;
  if (!state.sb) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px;padding:2rem;">Connect Supabase to load.</td></tr>'; return; }
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px;padding:1rem;">Loading…</td></tr>';
  const { sortedDates, ciByDate, sessMap } = await buildCheckinRows(60);
  if (!sortedDates.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px;padding:2rem;">No data yet.</td></tr>'; return; }
  tbody.innerHTML = renderCheckinRows(sortedDates, ciByDate, sessMap, "openCheckinForm(this.dataset.ciDate);showPage('checkins')");
}

export async function loadCheckinHistory() {
  const tbody = document.getElementById('ci-history-body');
  if (!tbody) return;
  if (!state.sb) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px;padding:2rem;">Connect Supabase to load history.</td></tr>'; return; }
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px;padding:1.5rem;">Loading…</td></tr>';
  const { sortedDates, ciByDate, sessMap } = await buildCheckinRows(60);
  if (!sortedDates.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px;padding:2rem;">No data yet.</td></tr>'; return; }
  tbody.innerHTML = renderCheckinRows(sortedDates, ciByDate, sessMap, "openCheckinForm(this.dataset.ciDate)");
}

export function setCi2Energy(e) {
  state.ci2Energy = e;
  document.querySelectorAll('[data-e2]').forEach(b => b.classList.toggle('active', parseInt(b.dataset.e2) === e));
}

export function openCheckinForm(dateStr) {
  const d = dateStr || isoDate();
  document.getElementById('ci-form-date-label').textContent = 'Check-in for ' + formatDisplayDate(d);
  document.getElementById('ci2-sleep').value = '';
  document.getElementById('ci2-wake').value = new Date().toTimeString().slice(0, 5);
  state.ci2Energy = null;
  document.querySelectorAll('[data-e2]').forEach(b => b.classList.remove('active'));
  if (dateStr && state.sb) {
    state.sb.from('daily_checkins').select('*').eq('date', dateStr).maybeSingle().then(r => {
      if (r.data) {
        if (r.data.sleep_hrs) document.getElementById('ci2-sleep').value = r.data.sleep_hrs;
        if (r.data.wake_time) document.getElementById('ci2-wake').value = r.data.wake_time.slice(0, 5);
        if (r.data.energy) {
          state.ci2Energy = r.data.energy;
          document.querySelectorAll('[data-e2]').forEach(b => b.classList.toggle('active', parseInt(b.dataset.e2) === r.data.energy));
        }
      }
    });
  }
  document.getElementById('ci-inline-form').dataset.editDate = d;
  document.getElementById('ci-inline-form').style.display = 'block';
  document.getElementById('ci-inline-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export async function saveCheckinInline() {
  const d = document.getElementById('ci-inline-form').dataset.editDate || isoDate();
  const sleep = document.getElementById('ci2-sleep').value;
  const wake = document.getElementById('ci2-wake').value;
  const meta = loadMeta();
  meta[d] = Object.assign(meta[d] || {}, { sleep, wake, energy: state.ci2Energy, done: true });
  saveMeta(meta);
  if (d === isoDate()) updateCheckinSummary(meta[d]);
  document.getElementById('ci-inline-form').style.display = 'none';
  if (state.sb) {
    const res = await state.sb.from('daily_checkins').upsert([{ date: d, sleep_hrs: sleep ? parseFloat(sleep) : null, wake_time: wake || null, energy: state.ci2Energy || null }], { onConflict: 'date' });
    if (res.error) console.warn('checkin upsert:', res.error.message);
  }
  loadCheckinHistory();
}
