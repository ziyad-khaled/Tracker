// config.js — constants & defaults. No mutable app state lives here.

export const STORAGE_KEYS = {
  settings:     'ft_settings',
  daymeta:      'ft_daymeta',
  projects:     'ft_projects',
  categories:   'ft_categories',
  excluded:     'ft_excluded',
  breakActs:    'ft_break_acts',
  offlineQueue: 'ft_offline_queue',
  recovery:     'ft_recovery',
  breakRecovery:'ft_break_rec',
  openUrgentBreak:'ft_open_urgent_break',
  lastFocusEnd: 'ft_last_focus_end',
  routineManual:'ft_routine_manual',
  cycleAnchor:  'ft_cycle_anchor',
  cycleTargetH: 'ft_cycle_target_h',
  sbUrl:        'sb_url',
  sbKey:        'sb_key'
};

// 12-Week Year cycle anchor — backdated to when the focus practice
// actually started (mid-2021, per the Focus To-Do export history).
// Editable later from Settings; this is only the first-run default.
export const DEFAULT_CYCLE_ANCHOR = '2021-07-01';
export const DEFAULT_CYCLE_TARGET_HOURS = 42; // weekly focus-hours goal

export const CIRC = 2 * Math.PI * 120;

export const DEFAULT_BREAK_ACTS = [
  { label: 'Phone Call', emoji: '📱' }, { label: 'Eating',    emoji: '🍽' },
  { label: 'Walk',       emoji: '🚶' }, { label: 'Bathroom',  emoji: '🚿' },
  { label: 'Scrolling',  emoji: '📲' }, { label: 'Pray',      emoji: '🤲' },
  { label: 'YouTube',    emoji: '▶️' }, { label: 'Anime',     emoji: '🎬' },
  { label: 'AI',         emoji: '🤖' }, { label: 'Cleaning',  emoji: '🧹' },
  { label: 'Tea',        emoji: '🍵' }, { label: 'Training',  emoji: '🏋️' },
  { label: 'Quran',      emoji: '📖' }
];

export const RETIRED_ONE_OFF_BREAK_ACTS = new Set([
  'family time', 'orders', 'cv', 'getting ready', 'gomla market', 'kamal',
  'longer break', 'match', 'meal prep', 'playstation', 'salma', 'shower',
  'whatsapp', 'work finish'
]);

export const DEFAULT_CATS = [
  { name: 'Learn',  emoji: '📚', col: 'var(--info)'   },
  { name: 'Build',  emoji: '🔨', col: 'var(--accent)' },
  { name: 'Refine', emoji: '✨', col: 'var(--purple)' },
  { name: 'Work',   emoji: '🤝', col: 'var(--warn)'   },
  { name: 'Islam',  emoji: '🤲', col: 'var(--text)'   },
  { name: 'Apply',  emoji: '📨', col: 'var(--danger)' }
];

export const CAT_COLORS = ['var(--info)', 'var(--accent)', 'var(--purple)', 'var(--warn)', 'var(--danger)', 'var(--text)'];
export const CAT_COLOR_LABELS = ['Blue', 'Green', 'Purple', 'Orange', 'Red', 'White'];

export const CAT_RGBA_MAP = {
  'var(--info)':    '95,180,255',
  'var(--accent)':  '200,240,74',
  'var(--purple)':  '181,123,255',
  'var(--warn)':    '255,170,68',
  'var(--danger)':  '255,95,95',
  'var(--text)':    '232,232,226',
  'var(--muted)':   '85,85,85'
};

export const DEFAULT_SETTINGS = {
  pomodoro: 25, short: 5, long: 15, interval: 4, overdue: 3,
  timerMode: 'flow', autoBreak: false, autoPomo: false,
  avgMode: 'include', nightDate: 'prev', nightCutoff: 1, defEnergy: 0,
  ceilingMin: 260, cycleTarget: 41, cycleCap: 45, cycleBreak: 15,
  killSwitch: 17, chainKillSwitch: 45, cyclesPerChain: 3,
  streakMinFocusMin: 0
};

// Minimum focus length (seconds) worth saving as a real session (fixes #2.10)
export const MIN_SESSION_SEC = 60;
