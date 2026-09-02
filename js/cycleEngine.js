// cycleEngine.js — the "Sweet-Spot" chain system.
// computeChains() is a pure function (sessions/settings in, chains out) so it
// can be unit-tested without a database, per the refactor plan's example.
import { state, settings, isoDate } from './state.js';
import { parseTimeOnDate, rtFmtTime, rtFmtWindow } from './utils.js';

const RT_MANUAL_KEY = 'ft_routine_manual';

function rtLoadAllManual() { try { return JSON.parse(localStorage.getItem(RT_MANUAL_KEY) || '{}'); } catch (e) { return {}; } }
function rtSaveAllManual(all) { localStorage.setItem(RT_MANUAL_KEY, JSON.stringify(all)); }
function rtDefaultManual() { return { manualInterruptions: [] }; }
function rtLoadManual(dateKey) {
  const all = rtLoadAllManual();
  if (!all[dateKey]) all[dateKey] = rtDefaultManual();
  const m = all[dateKey];
  if (!m.manualInterruptions) m.manualInterruptions = [];
  return m;
}
function rtSaveManual(dateKey, m) { const all = rtLoadAllManual(); all[dateKey] = m; rtSaveAllManual(all); }

/**
 * Pure chain-building logic.
 * @param {Array<{start_time:string,end_time:string,focus_sec:number}>} sessions - today's sessions, in start-time order
 * @param {string} today - ISO date string the sessions belong to
 * @param {object} opts - { killSwitchMin, cyclesPerChain, manualInterruptions, now, sessionInProgress }
 */
export function computeChains(sessions, today, opts) {
  const kMin = opts.killSwitchMin;
  const cyclesPerChain = opts.cyclesPerChain;
  const now = opts.now || new Date();

  const withTimes = sessions.map(s => ({
    start: parseTimeOnDate(today, s.start_time),
    end: parseTimeOnDate(today, s.end_time),
    focusMin: Math.floor((s.focus_sec || 0) / 60)
  })).filter(s => s.start && s.end);

  const gapAfter = (sessEnd, nextStart) => nextStart ? Math.max(0, (nextStart - sessEnd) / 60000) : null;

  const chains = [];
  let current = null;
  const interruptions = [];
  withTimes.forEach((s, i) => {
    if (!current) {
      current = { start: s.start, sessions: [s], focusMin: s.focusMin, cyclesCompleted: 0, dead: false };
    } else {
      const gapMin = gapAfter(withTimes[i - 1].end, s.start);
      if (gapMin != null && gapMin > 0.5) {
        interruptions.push({ min: Math.round(gapMin), at: withTimes[i - 1].end ? rtFmtTime(withTimes[i - 1].end) : '—', type: gapMin >= kMin ? 'long' : 'short' });
      }
      if (gapMin != null && gapMin >= kMin) {
        current.dead = true; current.end = withTimes[i - 1].end;
        chains.push(current);
        current = { start: s.start, sessions: [s], focusMin: s.focusMin, cyclesCompleted: 0, dead: false };
      } else {
        current.sessions.push(s); current.focusMin += s.focusMin;
      }
    }
  });
  if (current) { current.end = withTimes.length ? withTimes[withTimes.length - 1].end : current.start; chains.push(current); }

  (opts.manualInterruptions || []).forEach(m => {
    interruptions.push({ min: m.min, at: 'manual', type: m.min >= kMin ? 'long' : 'short', manual: true });
  });

  chains.forEach(c => { c.cyclesCompleted = Math.min(cyclesPerChain, c.sessions.length); });

  const result = {
    totalFocusMin: sessions.reduce((a, s) => a + Math.floor((s.focus_sec || 0) / 60), 0),
    chains,
    currentChain: chains.length ? chains[chains.length - 1] : null,
    interruptions,
    killSwitchActive: false,
    killSwitchGapMin: 0
  };

  if (withTimes.length && !opts.sessionInProgress) {
    const lastEnd = withTimes[withTimes.length - 1].end;
    const liveGapMin = (now - lastEnd.getTime()) / 60000;
    if (liveGapMin >= kMin) {
      result.killSwitchActive = true;
      result.killSwitchGapMin = Math.round(liveGapMin);
      if (result.currentChain) result.currentChain.dead = true;
    }
  }
  return result;
}

/** Fetches today's sessions/breaks and runs them through computeChains(). */
export async function computeRoutineState() {
  const today = isoDate();
  const manual = rtLoadManual(today);
  const base = { today, manual, totalFocusMin: 0, chains: [], currentChain: null, interruptions: [], killSwitchActive: false, killSwitchGapMin: 0 };
  if (!state.sb) return base;

  const [sessRes] = await Promise.all([
    state.sb.from('focus_sessions').select('id,start_time,end_time,focus_sec').eq('session_date', today).order('start_time', { ascending: true })
  ]);
  const sessions = sessRes.error ? [] : (sessRes.data || []);

  const computed = computeChains(sessions, today, {
    killSwitchMin: settings.killSwitch || 17,
    cyclesPerChain: settings.cyclesPerChain || 3,
    manualInterruptions: manual.manualInterruptions,
    sessionInProgress: !!state.sessionStart
  });

  return Object.assign(base, computed);
}

export async function refreshRoutine() {
  state.rtCache = await computeRoutineState();
  renderRoutineSummary(state.rtCache);
  const page = document.getElementById('page-routine');
  if (page && page.classList.contains('active')) renderRoutinePage(state.rtCache);
}
window.addEventListener('ft:refreshRoutine', refreshRoutine);

export function renderRoutineSummary(rState) {
  const ceil = settings.ceilingMin || 260;
  const pct = Math.min(100, Math.round((rState.totalFocusMin / ceil) * 100));
  const fill = document.getElementById('rt-sum-ceilbar');
  if (fill) { fill.style.width = pct + '%'; fill.className = 'cy-bar-fill' + (pct >= 100 ? ' danger' : pct >= 85 ? ' warn' : ''); }
  const sub = document.getElementById('rt-sum-ceilsub');
  if (sub) sub.textContent = rState.totalFocusMin + ' / ' + ceil + 'm ceiling';
  const shiftEl = document.getElementById('rt-sum-shift'), winEl = document.getElementById('rt-sum-window');
  if (!shiftEl) return;
  const chain = rState.currentChain;
  if (!chain) { shiftEl.textContent = 'No chain started'; winEl.textContent = '—'; return; }
  const cyclesPerChain = settings.cyclesPerChain || 3;
  if (rState.killSwitchActive) shiftEl.textContent = '⚠ Chain dead (' + rState.killSwitchGapMin + 'm gap)';
  else shiftEl.textContent = Math.min(chain.cyclesCompleted, cyclesPerChain) + ' / ' + cyclesPerChain + ' cycles · ' + chain.focusMin + 'm focus';
  winEl.textContent = rtFmtWindow({ start: chain.start, end: chain.end });
}

export function renderRoutinePage(rState) {
  const kMin = settings.killSwitch || 17;
  const cycleTarget = settings.cycleTarget || 41;
  const cycleCap = settings.cycleCap || 45;
  const cyclesPerChain = settings.cyclesPerChain || 3;
  const chain = rState.currentChain;

  const banners = [];
  if (rState.killSwitchActive) banners.push({ cls: 'danger', html: '💀 Block dead — ' + rState.killSwitchGapMin + 'm gap since your last focus session (kill-switch is ' + kMin + 'm). Don\'t try to resume it: log it and start a fresh chain.' });
  else if (!chain) banners.push({ cls: 'info', html: 'Start your first Pomodoro to begin today\'s first chain.' });
  else if (chain.cyclesCompleted >= cyclesPerChain) banners.push({ cls: 'ok', html: '✓ Chain complete — ' + chain.focusMin + 'm focused across ' + chain.cyclesCompleted + ' cycles. Take a longer break before starting a new chain.' });
  if (rState.totalFocusMin >= (settings.ceilingMin || 260)) banners.push({ cls: 'danger', html: '🛑 Daily focus ceiling reached — stop here to protect tomorrow.' });
  document.getElementById('rt-banners').innerHTML = banners.map(b => `<div class="cy-banner ${b.cls}"><span>${b.html}</span></div>`).join('');

  const ceil = settings.ceilingMin || 260;
  const pct = Math.min(100, Math.round((rState.totalFocusMin / ceil) * 100));
  document.getElementById('rt-ceil-val').textContent = rState.totalFocusMin;
  document.getElementById('rt-ceil-max').textContent = ' / ' + ceil + ' min ceiling';
  const cfill = document.getElementById('rt-ceil-fill');
  cfill.style.width = pct + '%';
  cfill.style.background = pct >= 100 ? 'var(--danger)' : pct >= 85 ? 'var(--warn)' : 'var(--accent)';
  document.getElementById('rt-anchor-lbl').textContent = chain ? ('Current chain started at ' + rtFmtTime(chain.start)) : 'No chain started yet today';

  for (let i = 1; i <= 3; i++) {
    const card = document.getElementById('shift-card-' + i);
    const statusEl = document.getElementById('shift' + i + '-status');
    const winEl = document.getElementById('shift' + i + '-window');
    const minEl = document.getElementById('shift' + i + '-min');
    const sess = chain && chain.sessions[i - 1];
    const min = sess ? sess.focusMin : 0;
    let cls = 'locked', label = 'Pending', windowTxt = '—';
    if (sess) {
      windowTxt = rtFmtTime(sess.start) + ' → ' + (sess.end ? rtFmtTime(sess.end) : '—');
      if (min >= cycleTarget) { cls = 'done'; label = 'Complete'; }
      else { cls = 'active'; label = 'In progress'; }
    } else if (chain && !rState.killSwitchActive && chain.sessions.length === i - 1) {
      cls = 'active'; label = 'Up next';
    }
    if (rState.killSwitchActive && chain && chain.sessions.length < i) { cls = 'dead'; label = 'Dead'; }
    card.className = 'cycle-card' + (cls === 'active' ? ' active' : cls === 'dead' ? ' dead' : cls === 'locked' ? ' locked' : '');
    statusEl.outerHTML = `<span class="cycle-status ${cls}" id="shift${i}-status">${label}</span>`;
    winEl.textContent = 'Window: ' + windowTxt;
    minEl.innerHTML = min + `<span> / ${cycleTarget}m target (cap ${cycleCap}m)</span>`;
  }

  const chainsEl = document.getElementById('chains-list');
  if (rState.chains.length) {
    chainsEl.innerHTML = rState.chains.map((c, idx) => {
      const label = (idx === rState.chains.length - 1) ? 'Current' : 'Chain ' + (idx + 1);
      const statusTxt = c.dead
        ? '⚠ broke after ' + c.cyclesCompleted + ' cycle' + (c.cyclesCompleted !== 1 ? 's' : '') + ' (' + c.focusMin + 'm)'
        : (c.cyclesCompleted >= cyclesPerChain ? '✓ complete — ' + c.cyclesCompleted + ' cycles, ' + c.focusMin + 'm' : c.cyclesCompleted + '/' + cyclesPerChain + ' cycles so far, ' + c.focusMin + 'm');
      return `<div class="chain-item${c.dead ? ' dead-chain' : ''}"><span>${label} · ${rtFmtTime(c.start)} → ${rtFmtTime(c.end)}</span><span>${statusTxt}</span></div>`;
    }).join('');
  } else {
    chainsEl.innerHTML = '<span style="color:var(--muted);font-family:var(--mono);font-size:11px;">No chain started yet today.</span>';
  }

  const ilog = document.getElementById('interrupt-log');
  if (rState.interruptions.length) {
    ilog.innerHTML = rState.interruptions.map(i =>
      `<div class="interrupt-log-item${i.type === 'long' ? ' long' : ''}"><span>${i.type === 'long' ? '💀 Kill-switch' : 'Short gap'}${i.manual ? ' (manual)' : ' at ' + i.at}</span><span>${i.min}m</span></div>`
    ).join('');
  } else {
    ilog.innerHTML = '<span style="color:var(--muted);font-family:var(--mono);font-size:11px;">No interruptions detected today.</span>';
  }

  const bestChain = rState.chains.reduce((best, c) => (!best || c.cyclesCompleted > best.cyclesCompleted) ? c : best, null);
  const noCapBreach = rState.chains.every(c => c.sessions.every(s => s.focusMin <= cycleCap + 2));
  const checks = [
    { met: !!bestChain && bestChain.cyclesCompleted >= cyclesPerChain, label: 'Completed at least one full ' + cyclesPerChain + '-cycle chain today' },
    { met: noCapBreach, label: 'No block exceeded the ' + cycleCap + '-minute hard cap' },
    { met: rState.totalFocusMin > 0 && rState.totalFocusMin <= (settings.ceilingMin || 260), label: 'Total focus within the daily ceiling (' + rState.totalFocusMin + 'm)' },
    { met: !rState.killSwitchActive, label: 'No chain currently dead from a kill-switch gap' }
  ];
  document.getElementById('perfect-day-checklist').innerHTML = checks.map(c =>
    `<div class="perfect-check${c.met ? ' met' : ''}">${c.met ? '✓' : '○'} ${c.label}</div>`
  ).join('');
}

export function rtLogManualInterruption() {
  const inp = document.getElementById('rt-manual-interrupt-min');
  const min = parseInt(inp.value) || 0;
  if (min <= 0) return;
  const m = rtLoadManual(isoDate());
  m.manualInterruptions.push({ min, ts: Date.now() });
  rtSaveManual(isoDate(), m);
  inp.value = '';
  refreshRoutine();
}
