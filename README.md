# Focus Tracker — README v4

A personal deep-work session tracker built as a Progressive Web App (PWA).  
Every session, break, and daily check-in is stored in your own Supabase PostgreSQL database.  
Deployable to GitHub Pages. Installable as a standalone desktop app via Chrome.

---

## What's New in v4

### Three Separate Tables
Sessions, breaks, and daily check-ins are now stored in **three distinct tables** (`focus_sessions`, `breaks`, `daily_checkins`) instead of a single flat table. This makes SQL analysis far cleaner and allows querying break behaviour independently.

### Seconds-Precision Timing
`focus_min` and `span_min` are replaced by **`focus_sec`** and **`span_sec`** — raw seconds stored as integers. The UI displays them as `M:SS` throughout. No rounding loss, no ambiguity. Migration SQL is included in the Settings page.

### Projects & Tasks (Two-Level)
Sessions belong to a two-level structure. Create a **project** (e.g. "Kalamata Capital Group"), then add **tasks** inside it (e.g. "Tickets", "Reporting"). Selecting a task sets it as the active context for the session. Both project name and task name are saved to the database.

### DB-Synced Categories & Break Activities
Session categories and break activity chips are now saved to Supabase (`app_config` table) so they survive clearing the app or switching devices. Requires the `app_config` table to be created once (SQL in Settings).

### Daily Check-in Tab
A dedicated **Check-in** tab shows a 60-day history of sleep, wake time, and energy alongside session counts and focus totals for each day. Entries can be added or edited inline. The same data also appears as a third tab in the Log page.

### Configurable Weekly Average
The week start day (Saturday / Sunday / Monday) and the average divisor (active days only vs. full 7) are both configurable in Settings. The timer page and Analytics page both respect these settings.

### Overnight Sessions
Sessions recorded after midnight can optionally count as the **previous calendar day**. A "Midnight sessions" setting lets you choose: *Actual date* (default) or *Previous day* (sessions before 6 am count as the day before).

### Default Energy
Set a default energy level that pre-selects automatically at session start and resets after each session ends. Avoids every session defaulting silently to Medium.

### Manual Break Save
Pressing **Stop Break** on a manually triggered break now saves the break to the database immediately, the same as the overlay break's "Back to Work" button.

---

## Full Feature Set

### Timer — Flow Mode (default on)
When the countdown hits zero the ring turns amber and a **+overtime** counter starts. You stay in flow and press **End Session** yourself. The session records your real elapsed time. Disable Flow Mode in Settings for a hard stop with alarm.

### Alarm
When Flow Mode is **off**: the alarm fires at zero and keeps ringing until you press START for the next session.  
When Flow Mode is **on**: the alarm fires when you manually end a session (optional; mainly used for break end).  
Break alarm fires when the break countdown ends, and again when the break crosses the overdue threshold.

### Break Overlay (auto break)
After each session, a break overlay appears with:
- Break countdown clock
- One-tap **activity chips** (what you did during the break)
- Optional break note
- **Back to Work / Didn't Return / Urgent** end options
- Overdue warning when the break runs long

### Manual Break
Use the Short Break / Long Break mode buttons to start a break while the timer page is active. Activity chips appear below the timer. Press **Stop Break** to end and save.

### Daily Check-in
Opens automatically once per calendar day. Records:
- **Sleep hours** — how long you slept
- **Wake time** — when you got up
- **Energy level** — 🪫 Low / 😐 Medium / ⚡ High

Saved per date in `daily_checkins`. Also editable anytime from the Check-in tab or the Log → Check-ins tab.

### Session Categories
Fully customisable. Default set:

| Emoji | Category | When to use |
|-------|----------|-------------|
| 📚 | **Learn** | New knowledge — reading, videos, courses |
| 🔨 | **Build** | Hands-on creation — coding, designing |
| ✨ | **Refine** | Improving existing work — debugging, polishing |
| 🤝 | **Network** | Outreach — emails, coffee chats |
| 📨 | **Apply** | Active pursuit — submissions, job applications |

Add, rename, recolour, or delete categories from Settings. Changes sync to Supabase automatically.

### Break Activity Chips
Fully customisable. Default set: Phone Call📱, Food 🍽, Walk 🚶, Bathroom 🚿, Nap 😴, Reading 📖, Scrolling 📲 .  
Add, rename, or delete chips from Settings. Changes sync to Supabase automatically.

### Metrics (timer page)
| Metric | Description |
|--------|-------------|
| **Today** | Total focus time and session count for the current calendar day |
| **This Week avg/day** | Running average for the current week; divisor is configurable (active days or days elapsed) |
| **Last Week avg/day** | Full-week average; ▲/▼ delta vs this week |

### Analytics Tab
- Total sessions and total focus time (all time)
- This week avg/day and last week avg/day
- 14-day focus bar chart
- Category breakdown (focus time per category)
- Break activity frequency chart
- Categories excluded from average are respected

### Log Tab — three sub-tabs
**Focus Sessions** — editable table of all sessions, newest first. Edit or delete any row.  
**Breaks** — editable table of all breaks with activity, duration, and returned status.  
**Check-ins** — 60-day history of daily check-ins alongside session counts and focus totals.

### Edit Modal
Smart modal that shows only the fields relevant to the row type:
- **Focus session**: Date, Seq, Start/End, Span M:SS, Focus M:SS, Project, Task, Category, Energy, Note
- **Break**: Date, Start/End, Energy, Returned, Break Activities, Note
- Span recalculates from Start/End automatically if the Span field is left blank on save

### Offline Support
Sessions and breaks queue locally when offline. On reconnect, the queue flushes automatically to Supabase.

### CSV Export
Downloads all focus sessions as a `.csv` file (Log tab → Export button).

### PWA Install
Installable from Chrome as a standalone desktop app with no address bar.

---

## Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| Pomodoro length | 25 min | Timer target duration |
| Short break | 5 min | Short break length |
| Long break | 15 min | Long break length |
| Long break interval | Every 4 sessions | When to trigger a long break |
| Overdue threshold | 3 min | How long over break before overdue alert fires |
| Flow Mode | On | Timer continues past zero instead of hard-stopping |
| Auto break | Off | Break overlay opens automatically after session ends |
| Auto-start Pomodoro | Off | Timer starts automatically after break ends |
| Week starts on | Saturday | Used for all weekly average calculations |
| Weekly avg divisor | Active days | Divide weekly total by active days or full 7 |
| Midnight sessions | Actual date | Sessions after midnight count as actual or previous day |
| Default energy | None | Energy level pre-selected at session start |

---

## Setup

### 1. Create Supabase project
Go to [supabase.com](https://supabase.com) → New project → wait ~2 minutes for provisioning.

### 2. Create the three tables
Supabase → **SQL Editor** → New query → paste and run:

```sql
-- ── focus_sessions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_sessions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now(),
  session_date DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  span_sec     INT4,
  focus_sec    INT4,
  ratio        INT4,
  project      TEXT,
  task         TEXT,
  task_type    TEXT,
  seq          INT4,
  energy       INT4,
  note         TEXT
);
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON focus_sessions FOR ALL USING (true) WITH CHECK (true);

-- ── breaks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS breaks (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT now(),
  session_date       DATE,
  start_time         TIME,
  end_time           TIME,
  break_duration_min INT4,
  break_activities   TEXT,
  overdue            BOOLEAN DEFAULT false,
  returned           BOOLEAN,
  break_note         TEXT
);
ALTER TABLE breaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON breaks FOR ALL USING (true) WITH CHECK (true);

-- ── daily_checkins ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_checkins (
  date         DATE PRIMARY KEY,
  sleep_hrs    NUMERIC(3,1),
  wake_time    TIME,
  energy       INT4,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON daily_checkins FOR ALL USING (true) WITH CHECK (true);

-- ── app_config (categories & break chips sync) ────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON app_config FOR ALL USING (true) WITH CHECK (true);
```

### 3. Get your credentials
Supabase sidebar → **Settings → API**:
- **Project URL** — `https://xxxx.supabase.co`
- **anon / public key** — `eyJ...`

### 4. Connect in the app
Open the app → **Settings tab** → paste both values → **Test Connection**.  
A green "connected" pill confirms the link. Session count is shown.

### 5. Deploy to GitHub Pages
1. Create a public repo (e.g. `focus-tracker`)
2. Upload `index.html`, `alarm.mp3`, `manifest.json`, `service-worker.js`, and the `icons/` folder
3. Repo **Settings → Pages → Source: main branch → root** → Save
4. Live at `https://yourusername.github.io/focus-tracker` in ~60 seconds

### 6. Install as desktop app
Open the GitHub Pages URL in Chrome → install icon (⊕) in the address bar → **Install**.  
The app opens in its own window — no browser bar, no tabs, feels native.

---

## Data Schema

### `focus_sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `created_at` | TIMESTAMPTZ | Row creation timestamp |
| `session_date` | DATE | Calendar date of the session |
| `start_time` | TIME | Session start (HH:MM:SS) |
| `end_time` | TIME | Session end (HH:MM:SS) |
| `span_sec` | INT4 | Wall-clock seconds from start → end |
| `focus_sec` | INT4 | Actual focused seconds (real elapsed, not preset) |
| `ratio` | INT4 | `focus_sec ÷ span_sec × 100` |
| `project` | TEXT | Project name |
| `task` | TEXT | Task name within the project |
| `task_type` | TEXT | Session category (Learn / Build / Refine / …) |
| `seq` | INT4 | Session sequence number for that calendar day |
| `energy` | INT4 | 1 = Low, 2 = Medium, 3 = High |
| `note` | TEXT | Free-text session note |

### `breaks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `created_at` | TIMESTAMPTZ | Row creation timestamp |
| `session_date` | DATE | Calendar date of the break |
| `start_time` | TIME | Break start |
| `end_time` | TIME | Break end |
| `break_duration_min` | INT4 | Actual break length in minutes |
| `break_activities` | TEXT | Semicolon-separated activities (e.g. `Walk; Phone`) |
| `overdue` | BOOLEAN | Break ran past the overdue threshold |
| `returned` | BOOLEAN | Whether you came back after the break |
| `break_note` | TEXT | Free-text break note |

### `daily_checkins`

| Column | Type | Description |
|--------|------|-------------|
| `date` | DATE | Primary key — one row per calendar day |
| `sleep_hrs` | NUMERIC(3,1) | Hours slept the previous night |
| `wake_time` | TIME | Time you woke up |
| `energy` | INT4 | 1 = Low, 2 = Medium, 3 = High |
| `created_at` | TIMESTAMPTZ | First entry timestamp |
| `updated_at` | TIMESTAMPTZ | Last edit timestamp |

### `app_config`

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT | Primary key — `ft_categories` or `ft_break_acts` |
| `value` | TEXT | JSON-serialised array of category/chip objects |
| `updated_at` | TIMESTAMPTZ | Last sync timestamp |

---

## Key SQL Queries

```sql
-- Daily focus totals (last 14 days)
SELECT
  session_date,
  COUNT(*) AS sessions,
  SUM(focus_sec) / 60 AS total_min,
  ROUND(AVG(ratio)::NUMERIC, 1) AS avg_ratio
FROM focus_sessions
GROUP BY session_date
ORDER BY session_date DESC
LIMIT 14;

-- Weekly average per day (active-days divisor, Sat–Fri weeks)
SELECT
  date_trunc('week', session_date + interval '2 days') - interval '2 days' AS week_sat,
  COUNT(DISTINCT session_date) AS active_days,
  SUM(focus_sec) / 60 AS total_min,
  ROUND((SUM(focus_sec) / 60.0 / COUNT(DISTINCT session_date))::NUMERIC, 1) AS avg_per_active_day
FROM focus_sessions
GROUP BY week_sat
ORDER BY week_sat DESC
LIMIT 8;

-- Focus by project and category
SELECT
  project,
  task_type,
  COUNT(*) AS sessions,
  SUM(focus_sec) / 60 AS total_min,
  ROUND(AVG(ratio)::NUMERIC, 1) AS avg_ratio
FROM focus_sessions
WHERE project IS NOT NULL
GROUP BY project, task_type
ORDER BY total_min DESC;

-- Break activity vs return rate
SELECT
  break_activities,
  COUNT(*) AS n,
  ROUND(AVG(CASE WHEN returned THEN 1 ELSE 0 END)::NUMERIC * 100, 1) AS return_pct,
  ROUND(AVG(break_duration_min)::NUMERIC, 1) AS avg_break_min
FROM breaks
WHERE break_activities IS NOT NULL
GROUP BY break_activities
ORDER BY n DESC;

-- Sleep vs focus performance
SELECT
  ROUND(dc.sleep_hrs::NUMERIC, 0) AS sleep_hrs,
  COUNT(*) AS sessions,
  ROUND(AVG(fs.focus_sec / 60.0)::NUMERIC, 1) AS avg_focus_min,
  ROUND(AVG(fs.ratio)::NUMERIC, 1) AS avg_ratio
FROM focus_sessions fs
JOIN daily_checkins dc ON dc.date = fs.session_date
WHERE dc.sleep_hrs IS NOT NULL
GROUP BY sleep_hrs
ORDER BY sleep_hrs;

-- Energy vs productivity
SELECT
  dc.energy,
  COUNT(*) AS sessions,
  ROUND(AVG(fs.focus_sec / 60.0)::NUMERIC, 1) AS avg_focus_min,
  ROUND(AVG(fs.ratio)::NUMERIC, 1) AS avg_ratio
FROM focus_sessions fs
JOIN daily_checkins dc ON dc.date = fs.session_date
WHERE dc.energy IS NOT NULL
GROUP BY dc.energy
ORDER BY dc.energy;

-- Longest flow sessions (overtime used)
SELECT
  session_date,
  project,
  task,
  ROUND(focus_sec / 60.0, 1) AS focus_min,
  ROUND(focus_sec / 60.0, 1) - 25 AS overtime_min
FROM focus_sessions
WHERE focus_sec > 25 * 60
ORDER BY focus_sec DESC
LIMIT 20;

-- Days with no break return (full drill-down)
SELECT
  b.session_date,
  b.break_activities,
  b.break_duration_min,
  b.break_note
FROM breaks b
WHERE b.returned = false
ORDER BY b.session_date DESC;
```

---

## File Structure

```
focus-tracker/
├── index.html          ← entire app (~85 KB, single file)
├── alarm.mp3           ← break alarm sound (external)
├── manifest.json       ← PWA manifest
├── service-worker.js   ← offline caching + install prompt
├── README.md
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Keyboard Shortcut

**Space** — start or pause the timer from anywhere on the Timer page.  
Disabled automatically when focus is inside a text input, textarea, or select field.

---

## Tech Stack

- Vanilla HTML / CSS / JS — no framework, no build step
- [Supabase JS v2](https://supabase.com/docs/reference/javascript) for PostgreSQL
- Service Worker for offline support, caching, and PWA install prompt
- GitHub Pages for hosting (HTTPS required for PWA install and audio)
