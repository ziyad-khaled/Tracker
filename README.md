# Focus Tracker

A personal deep-work session tracker built as a Progressive Web App (PWA). Tracks every Pomodoro session with break activity logging, sleep/energy check-ins, and stores everything in a Supabase PostgreSQL database for analysis.

## Features

- **Pomodoro timer** with short and long break modes
- **Break overlay** — tap what you did on the break (Phone, Food, Walk, Scrolling, etc.) with optional note
- **Overdue alert** — warns when a break runs longer than expected
- **"Returned?"** tracking — logs whether you came back after the break
- **Daily check-in** — sleep hours, wake time, energy level (persists per day)
- **Task logging** — task name + type (Learning / Practice / Review / Project / Job Hunt)
- **Supabase backend** — real PostgreSQL database; connect Power BI or query with SQL directly
- **Offline support** — sessions queue locally and sync when reconnected
- **CSV export** — download all sessions as a spreadsheet anytime
- **Installable PWA** — install from Chrome as a desktop app with no address bar

## Setup

### 1. Create Supabase project

Go to [supabase.com](https://supabase.com) → New project → wait ~2 minutes.

### 2. Create the sessions table

In Supabase → **SQL Editor** → New query → paste and run:

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

### 3. Get your credentials

Supabase sidebar → **Settings → API**:
- Copy **Project URL** (e.g. `https://xxxx.supabase.co`)
- Copy **anon / public** key (`eyJ...`)

### 4. Connect in the app

Open the app → **Settings tab** → paste both values → **Test Connection**.

### 5. Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to repo **Settings → Pages**
3. Set source to **main branch / root**
4. Your app is live at `https://yourusername.github.io/focus-tracker`

### 6. Install as desktop app

Open the GitHub Pages URL in Chrome → look for the install icon (⊕) in the address bar → click **Install**. The app opens in its own window with no browser chrome.

## Data Schema

| Column | Type | Description |
|--------|------|-------------|
| `session_date` | DATE | Date of session |
| `start_time` | TIME | Session start (HH:MM:SS) |
| `end_time` | TIME | Session end |
| `span_min` | INTEGER | Total wall-clock minutes |
| `focus_min` | INTEGER | Pure focus minutes (Pomodoro length) |
| `ratio` | INTEGER | focus / span × 100 |
| `task` | TEXT | What you worked on |
| `task_type` | TEXT | Learning / Practice / Review / Project / Job Hunt |
| `seq` | INTEGER | Session number for that day |
| `energy` | INTEGER | 1=Low, 2=Medium, 3=High |
| `sleep_hrs` | NUMERIC | Hours slept the night before |
| `wake_time` | TIME | Time you woke up |
| `break_activities` | TEXT | Semicolon-separated break activities |
| `break_duration_min` | INTEGER | Actual break length in minutes |
| `overdue` | BOOLEAN | Whether break ran past the overdue threshold |
| `returned` | BOOLEAN | Whether you came back after the break |
| `note` | TEXT | Session note |
| `break_note` | TEXT | Break note |

## Useful SQL Queries

```sql
-- Daily focus totals
SELECT session_date, SUM(focus_min) AS total_min, ROUND(AVG(ratio)::NUMERIC,1) AS avg_ratio
FROM sessions GROUP BY session_date ORDER BY session_date DESC LIMIT 14;

-- Which break activity kills return rate
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
```

## Tech Stack

- Vanilla HTML/CSS/JS — no framework, no build step
- [Supabase JS v2](https://supabase.com/docs/reference/javascript) for database
- Service Worker for offline caching and PWA install
- GitHub Pages for hosting
