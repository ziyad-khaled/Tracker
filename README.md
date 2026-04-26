# Focus Tracker — README v2

A personal deep-work session tracker built as a Progressive Web App (PWA).  
Stores every session in your own Supabase PostgreSQL database.  
Deployable to GitHub Pages. Installable as a desktop app via Chrome.

---

## What's New in v2

### Timer Overhaul — Flow Mode
The timer no longer forces you to stop at the preset target. When the countdown hits zero, the ring turns amber and a **+overtime** counter starts running. You stay in whatever state you're in and hit **End Session** yourself when you're done. The session records your real elapsed time, not the preset. Flow mode can be disabled in Settings for the original hard-stop behaviour.

### End Session Button
A red **End Session** button appears as soon as a session starts. This is the only way a Pomodoro ends — you, not the timer, decide when you're done.

### Break Alarm
When the break countdown reaches zero, the alarm fires. The same sound plays again if the break runs past the overdue threshold set in Settings.

### Daily Check-in Modal
Opens automatically once per calendar day, asking for sleep hours, wake time, and energy level. These values are saved once and attached to every session that day automatically — no re-entry per session.

### Session Categories
Five categories with consistent emoji anchors:

| Emoji | Category | When to use |
|-------|----------|-------------|
| 📚 | **Learn** | New knowledge — reading, videos, courses |
| 🔨 | **Build** | Hands-on creation — coding, designing |
| ✨ | **Refine** | Improving existing work — debugging, polishing |
| 🤝 | **Network** | Outreach — emails, coffee chats |
| 📨 | **Apply** | Active pursuit — submissions, job applications |

Colour-coded consistently across timer, log table, and analytics.

### Weekly Metrics (Sat–Fri, ÷ 7 days)
Three metric cells below the timer: **Today**, **This Week avg/day**, **Last Week avg/day** with a ▲/▼ delta. Week totals are divided by 7 (not active days) so consistency is rewarded. Week boundaries run Saturday → Friday.

### Break Activity Tracking + Alarm
Break overlay has one-tap activity chips. **Returned?** column in the log records whether you came back after each break — the key signal for identifying which activities kill your sessions.

### Offline Support + PWA Install
Sessions queue locally when offline and sync on reconnect. Installing via Chrome on GitHub Pages gives a standalone window with no browser bar.

---

## Setup

### 1. Create Supabase project
[supabase.com](https://supabase.com) → New project → wait ~2 min.

### 2. Create the sessions table
SQL Editor → New query → run:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT now(),
  session_date       DATE NOT NULL,
  start_time         TIME NOT NULL,
  end_time           TIME NOT NULL,
  span_min           INTEGER NOT NULL,
  focus_min          INTEGER NOT NULL,
  ratio              INTEGER,
  task               TEXT,
  task_type          TEXT,
  seq                INTEGER,
  energy             INTEGER,
  sleep_hrs          NUMERIC(3,1),
  wake_time          TIME,
  break_duration_min INTEGER,
  break_activities   TEXT,
  overdue            BOOLEAN DEFAULT false,
  returned           BOOLEAN,
  note               TEXT,
  break_note         TEXT
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable insert for anon" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable select for anon" ON sessions FOR SELECT USING (true);
```

### 3. Get API credentials
Settings → API → copy **Project URL** and **anon public key**.

### 4. Connect in app
Settings tab → paste both values → Test Connection.

### 5. Deploy to GitHub Pages
Upload files to a public repo → Settings → Pages → main branch → Save.  
URL: `https://yourusername.github.io/Tracker/`

### 6. Install as desktop app
Chrome → open the GitHub Pages URL → install icon in address bar → Install.

---

## Data Schema

| Column | Type | Description |
|--------|------|-------------|
| `session_date` | DATE | Date of session |
| `start_time` | TIME | Session start |
| `end_time` | TIME | Session end |
| `span_min` | INTEGER | Wall-clock minutes start→end |
| `focus_min` | INTEGER | Actual focused minutes (may exceed preset in flow mode) |
| `ratio` | INTEGER | focus ÷ span × 100 |
| `task` | TEXT | Free-text task description |
| `task_type` | TEXT | Learn / Build / Refine / Network / Apply |
| `seq` | INTEGER | Session number for that day |
| `energy` | INTEGER | 1=Low 2=Med 3=High |
| `sleep_hrs` | NUMERIC | Hours slept (from daily check-in) |
| `wake_time` | TIME | Wake time (from daily check-in) |
| `break_activities` | TEXT | Semicolon-separated activities during break |
| `break_duration_min` | INTEGER | Actual break length |
| `overdue` | BOOLEAN | Break ran past overdue threshold |
| `returned` | BOOLEAN | Did you come back after the break |
| `note` | TEXT | Session note |
| `break_note` | TEXT | Break note |

---

## Key SQL Queries

```sql
-- Weekly avg per day (÷7, Sat–Fri)
SELECT
  date_trunc('week', session_date + interval '2 days') - interval '2 days' AS week_sat,
  ROUND((SUM(focus_min) / 7.0)::NUMERIC, 1) AS avg_per_day_min
FROM sessions GROUP BY week_sat ORDER BY week_sat DESC LIMIT 4;

-- Break activity vs return rate
SELECT break_activities,
  COUNT(*) AS sessions,
  ROUND(AVG(CASE WHEN returned THEN 1 ELSE 0 END)::NUMERIC*100,1) AS return_pct
FROM sessions WHERE break_activities IS NOT NULL
GROUP BY break_activities ORDER BY sessions DESC;

-- Sleep vs performance
SELECT ROUND(sleep_hrs::NUMERIC,0) AS sleep_hrs,
  ROUND(AVG(focus_min)::NUMERIC,1) AS avg_focus,
  ROUND(AVG(ratio)::NUMERIC,1) AS avg_ratio
FROM sessions WHERE sleep_hrs IS NOT NULL
GROUP BY sleep_hrs ORDER BY sleep_hrs;

-- Flow sessions (overtime used)
SELECT session_date, task, focus_min, focus_min - 25 AS overtime_min
FROM sessions WHERE focus_min > 25 ORDER BY overtime_min DESC LIMIT 20;
```

---

## File Structure

```
focus-tracker/
├── index.html        ← entire app (self-contained)
├── manifest.json     ← PWA config
├── service-worker.js ← offline + install
├── README.md
└── icons/
    ├── icon-192.png
    └── icon-512.png
```
