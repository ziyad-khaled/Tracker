# Focus Tracker — README v3

A personal deep-work session tracker built as a Progressive Web App (PWA).  
Stores every session in your own Supabase PostgreSQL database.  
Deployable to GitHub Pages. Installable as a desktop app via Chrome.

---

## What's New in v3

### Projects & Tasks
Sessions now belong to a two-level structure. Create a **project** (e.g. "Data Analysis Portfolio"), then add **tasks** inside it (e.g. "Clean sales dataset", "Build Power BI dashboard"). Selecting a task sets it as the active context for the session — both project name and task name are saved to the database. Projects and tasks persist in local storage across sessions.

### Repeating Break Alarm
The alarm now loops continuously from the moment the break ends until you click "Back to Work" or "Skip Break". The 32-second automotive chime plays through then immediately restarts. A second alarm trigger fires when the break crosses the overdue threshold. The alarm stops the instant you return — it cannot bleed into your next focus session.

The alarm is served as an external `alarm.mp3` file keeping the HTML document under 75KB.

### Spacebar Shortcut
Press **Space** anywhere on the Timer page to start or pause the session. The shortcut is disabled automatically when focus is inside any text input, textarea, or select field so typing is never interrupted. The start button shows a tooltip on hover as a reminder.

### Running Weekly Average
The "This Week avg/day" metric now divides by **days elapsed in the current week**, not by 7. On Saturday (day 1 of the week) it divides by 1. On Sunday by 2. On Friday by 7. This means the number is always an honest daily average of what you've done so far — not an artificially deflated number that makes the start of the week discouraging.

Last week stays ÷7 always since it's a complete week, making the end-of-week comparison accurate.

| Day | Divides by |
|-----|-----------|
| Saturday | 1 |
| Sunday | 2 |
| Monday | 3 |
| Tuesday | 4 |
| Wednesday | 5 |
| Thursday | 6 |
| Friday | 7 |

---

## Full Feature Set

### Timer — Flow Mode
When the countdown hits zero, the ring turns amber and a **+overtime** counter starts. You stay in flow and hit **End Session** yourself. The session records your real elapsed time. Flow mode can be disabled in Settings for hard-stop behaviour.

### Daily Check-in Modal
Opens once per calendar day asking for sleep hours, wake time, and energy level. Saved once, attached to every session that day automatically.

### Session Categories
| Emoji | Category | When to use |
|-------|----------|-------------|
| 📚 | **Learn** | New knowledge — reading, videos, courses |
| 🔨 | **Build** | Hands-on creation — coding, designing |
| ✨ | **Refine** | Improving existing work — debugging, polishing |
| 🤝 | **Network** | Outreach — emails, coffee chats |
| 📨 | **Apply** | Active pursuit — submissions, job applications |

### Break Overlay
One-tap activity chips log what you did during the break. **Returned?** column records whether you came back — over time this answers which activities kill your return rate.

### Metrics Row (below timer)
- **Today** — total focus minutes and session count
- **This Week avg/day** — running average (÷ days elapsed, Sat→Fri)
- **Last Week avg/day** — ÷7, with ▲/▼ delta vs this week

### Offline Support + PWA Install
Sessions queue locally when offline and sync to Supabase on reconnect. Installing via Chrome on GitHub Pages gives a standalone desktop window with no browser bar.

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
  project            TEXT,
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

**If you already have a v2 table**, just add the project column:
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS project TEXT;
```

### 3. Get API credentials
Supabase → Settings → API → copy **Project URL** and **anon public key**.

### 4. Connect in app
Settings tab → paste both values → **Test Connection**.

### 5. Deploy to GitHub Pages
1. Create a public repo named `focus-tracker`
2. Upload all files from this zip (the files inside the folder, not the folder itself)
3. Repo **Settings → Pages → Source: main branch → root** → Save
4. Wait ~60 seconds → `https://yourusername.github.io/focus-tracker`

### 6. Install as desktop app
Open the GitHub Pages URL in Chrome → click the install icon (⊕) in the address bar → **Install**.

---

## Data Schema

| Column | Type | Description |
|--------|------|-------------|
| `session_date` | DATE | Date of session |
| `start_time` | TIME | Session start (HH:MM:SS) |
| `end_time` | TIME | Session end |
| `span_min` | INTEGER | Wall-clock minutes start→end |
| `focus_min` | INTEGER | Actual focused minutes (may exceed preset in flow mode) |
| `ratio` | INTEGER | focus ÷ span × 100 |
| `project` | TEXT | Project name |
| `task` | TEXT | Task name within the project |
| `task_type` | TEXT | Learn / Build / Refine / Network / Apply |
| `seq` | INTEGER | Session sequence number for that day |
| `energy` | INTEGER | 1=Low, 2=Medium, 3=High |
| `sleep_hrs` | NUMERIC | Hours slept (from daily check-in) |
| `wake_time` | TIME | Wake time (from daily check-in) |
| `break_activities` | TEXT | Semicolon-separated break activities |
| `break_duration_min` | INTEGER | Actual break length in minutes |
| `overdue` | BOOLEAN | Break ran past the overdue threshold |
| `returned` | BOOLEAN | Whether you came back after the break |
| `note` | TEXT | Session note |
| `break_note` | TEXT | Break note |

---

## Key SQL Queries

```sql
-- Weekly running average (÷7 for past weeks)
SELECT
  date_trunc('week', session_date + interval '2 days') - interval '2 days' AS week_sat,
  SUM(focus_min) AS total_min,
  ROUND((SUM(focus_min) / 7.0)::NUMERIC, 1) AS avg_per_day_min
FROM sessions GROUP BY week_sat ORDER BY week_sat DESC LIMIT 4;

-- Focus by project and category
SELECT project, task_type,
  COUNT(*) AS sessions,
  SUM(focus_min) AS total_min,
  ROUND(AVG(ratio)::NUMERIC, 1) AS avg_ratio
FROM sessions GROUP BY project, task_type ORDER BY total_min DESC;

-- Break activity vs return rate
SELECT break_activities,
  COUNT(*) AS sessions,
  ROUND(AVG(CASE WHEN returned THEN 1 ELSE 0 END)::NUMERIC*100, 1) AS return_pct,
  ROUND(AVG(break_duration_min)::NUMERIC, 1) AS avg_break_min
FROM sessions WHERE break_activities IS NOT NULL
GROUP BY break_activities ORDER BY sessions DESC;

-- Sleep vs performance
SELECT ROUND(sleep_hrs::NUMERIC, 0) AS sleep_hrs,
  COUNT(*) AS sessions,
  ROUND(AVG(focus_min)::NUMERIC, 1) AS avg_focus,
  ROUND(AVG(ratio)::NUMERIC, 1) AS avg_ratio
FROM sessions WHERE sleep_hrs IS NOT NULL
GROUP BY sleep_hrs ORDER BY sleep_hrs;

-- Flow sessions (overtime used)
SELECT session_date, project, task, focus_min,
  focus_min - 25 AS overtime_min
FROM sessions WHERE focus_min > 25 ORDER BY overtime_min DESC LIMIT 20;
```

---

## File Structure

```
focus-tracker/
├── index.html          ← main app (~71 KB)
├── alarm.mp3           ← break alarm sound (external, not embedded)
├── manifest.json       ← PWA config
├── service-worker.js   ← offline caching + install prompt
├── README.md
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Tech Stack

- Vanilla HTML / CSS / JS — no framework, no build step
- [Supabase JS v2](https://supabase.com/docs/reference/javascript) for PostgreSQL database
- Service Worker for offline support, PWA install, and asset caching
- GitHub Pages for hosting (HTTPS required for PWA install and audio)
