// alarm.js — tiny wrapper around the alarm sound so timer.js and breaks.js share one instance.
let alarmAudio = null;
let alarmStopTimer = null;

export function buildAlarm() {
  try {
    alarmAudio = new Audio('./alarm.mp3');
    alarmAudio.volume = 0.8;
    alarmAudio.loop = true;
    alarmAudio.load();
  } catch (e) { alarmAudio = null; }
}
export function playAlarm(durationMs) {
  if (!alarmAudio) return;
  if (alarmStopTimer) { clearTimeout(alarmStopTimer); alarmStopTimer = null; }
  alarmAudio.currentTime = 0;
  alarmAudio.play().catch(() => {});
  if (durationMs && durationMs > 0) alarmStopTimer = setTimeout(stopAlarm, durationMs);
}
export function stopAlarm() {
  if (alarmStopTimer) { clearTimeout(alarmStopTimer); alarmStopTimer = null; }
  if (!alarmAudio) return;
  alarmAudio.pause();
  alarmAudio.currentTime = 0;
}
