Focus Tracker — README v5
A personal deep-work session tracker built as a Progressive Web App (PWA).
Every session, break, and daily check-in is stored in your own Supabase PostgreSQL database.
Deployable to GitHub Pages. Installable as a standalone desktop app via Chrome.

## What's New in v5 (Refactor)

v5 follows the code-review/refactor plan and changes **how the app is built**, not
what it does day-to-day — your data, tables, and workflow are unaffected.

### Modularized codebase
`index.html` used to be a single ~2,700-line file containing markup, CSS, and
all JavaScript. It's now split into:

```
index.html            ← markup only
css/styles.css         ← all styles, unchanged visually
js/
  config.js            ← constants & defaults (no mutable state)
  state.js              ← the one central state object + settings load/persist
  utils.js              ← pure helpers: date/time formatting, escHtml, etc.
  db.js                  ← the only module that talks to Supabase directly;
                            owns the offline queue
  connection.js          ← Settings-tab "connect to Supabase" flow
  projects.js            ← project/task list (local only)
  categories.js          ← session categories (CRUD + Supabase app_config sync)
  breakActs.js           ← break-activity chips (CRUD + Supabase app_config sync)
  timer.js               ← the Pomodoro timer: modes, ticking, session
                            lifecycle, kill-switch monitor, crash recovery
  breaks.js               ← the break overlay, manual breaks, break recovery
  cycleEngine.js          ← the Sweet-Spot chain system; computeChains() is a
                            pure function you can unit-test without a database
  metrics.js              ← weekly-average math + the Today/This Week/Last Week row
  log.js                  ← Log tab, Analytics tab, Check-in history
  edit.js                 ← the shared "edit session/break" modal
  ui.js                   ← small shared DOM helpers (task display, daily
                            check-in modal, page nav)
  settingsPage.js         ← Settings-page form wiring
  alarm.js                ← the alarm sound, shared by timer.js and breaks.js
  main.js                 ← app bootstrap: wires everything together and is
                            the only file that assigns handlers onto `window`
                            (see note below)
```

`alarm.mp3`, `manifest.json`, `service-worker.js`, and `icons/` are unchanged —
keep your existing copies of those files alongside the new `index.html`,
`css/`, and `js/` folders.

**A note on inline `onclick="..."` handlers:** the markup still uses the same
`onclick="doThing()"` attributes as before rather than being rewritten to full
event delegation (a bigger change than this pass covered). Because the app is
now ES modules — which don't leak names onto `window` automatically — `main.js`
explicitly re-exposes the handful of functions the markup calls. That keeps
all of the "global" surface area in one clearly-labeled place instead of
scattered `var` declarations, and is a reasonable middle ground short of a
full markup rewrite.

### Security fix: XSS in the crash-recovery banner
The "unsaved session detected" banner used to build its message with raw
string concatenation and `innerHTML`, so a category, project, task, or note
containing HTML could inject a script when the recovery banner rendered.
Every user-entered field going into that banner is now escaped
(`timer.js` → `checkRecovery()`).

### Bug fixes from the review
- **Phantom sessions**: ending a session that was never started (e.g. an
  accidental click before pressing Start) no longer fabricates a
  full-length session — `endSession()` now no-ops in that case.
- **Sub-minute sessions**: a session under 60 seconds of real focus (an
  immediate start-then-end) is no longer saved as a 0-ish-minute row.
- **`setBreakMode` clock desync**: switching to a break mode now updates
  `timeLeft`/`totalSecs` immediately instead of leaving them stale until
  the break overlay opens.
- **`snoozeBreak` no longer relies on the implicit global `event`** — the
  button element is passed in explicitly, so it also works if ever called
  programmatically.
- **`resetTimer` no longer decrements a session counter** that was never
  incremented for the session being reset — the old code assumed a "current"
  session had already been counted and quietly drifted `pomodoroCount` down.
- **Kill-switch monitor pauses while the tab is hidden** instead of updating
  invisible DOM every 15 seconds regardless of visibility.
- **Offline queue idempotency**: every focus session and break now carries a
  client-generated `client_id`. Retried writes (e.g. the network call failed
  but the row actually landed) are `upsert`d on that id instead of creating a
  duplicate row. **Requires the migration SQL below** (adds a `client_id`
  column + unique index to both tables) — until you run it, writes will error
  and fall back to the offline queue, which is safe but means the idempotency
  fix isn't active yet.

### Testable cycle logic
`computeChains()` in `cycleEngine.js` is now a pure function — sessions and
settings in, chain data out — separated from the Supabase fetch that used to
be baked into the same function, per the review's refactor example.

## Migration SQL (run once)

In addition to the `app_config` table and `focus_min`/`span_min` migrations
from v4 (still below), v5 needs the `client_id` idempotency columns:

```sql
ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS client_id text;
CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_client_id_key ON focus_sessions(client_id) WHERE client_id IS NOT NULL;

ALTER TABLE breaks ADD COLUMN IF NOT EXISTS client_id text;
CREATE UNIQUE INDEX IF NOT EXISTS breaks_client_id_key ON breaks(client_id) WHERE client_id IS NOT NULL;
```

This is also included in the in-app Settings → Migration SQL block.

## Known follow-ups (not done in this pass)

Per the original review, these are still open if you want to keep going:
- Replacing inline `onclick` handlers with real event delegation.
- LocalStorage schema validation (corrupted `localStorage` values are still
  handled with try/catch but not validated against a schema).
- Combining the separate today/this-week/last-week metric queries into fewer
  round trips.
- Automated tests for `computeChains()` and the other now-pure helpers.

---

## Full Feature Set (unchanged from v4)

### Timer — Flow Mode (default on)
When the countdown hits zero the ring turns amber and a +overtime counter starts. You stay in flow and press End Session yourself. The session records your real elapsed time. Disable Flow Mode in Settings for a hard stop with alarm.

### Alarm
When Flow Mode is off: the alarm fires at zero and keeps ringing until you press START for the next session.
When Flow Mode is on: the alarm fires when you manually end a session (optional; mainly used for break end).
Break alarm fires when the break countdown ends, and again when the break crosses the overdue threshold.

### Break Overlay (auto break)
After each session, a break overlay appears with:
- Break countdown clock
- One-tap activity chips (what you did during the break)
- Optional break note
- Back to Work / Didn't Return / Urgent end options
- Overdue warning when the break runs long

### Manual Break
Use the Short Break / Long Break mode buttons to start a break while the timer page is active. Activity chips appear below the timer. Press Stop Break to end and save.

### Daily Check-in
Opens automatically once per calendar day. Records sleep hours, wake time, energy level. Saved per date in `daily_checkins`. Also editable anytime from the Check-in tab or the Log → Check-ins tab.

### Session Categories
Fully customisable, synced to Supabase via `app_config`.

### Break Activity Chips
Fully customisable, synced to Supabase via `app_config`.

### Metrics (timer page)
Today / This Week avg/day / Last Week avg/day, with a configurable weekly average divisor.

### Analytics Tab
Total sessions/focus time, weekly averages, 14-day bar chart, category breakdown, break activity frequency.

### Log Tab — three sub-tabs
Focus Sessions, Breaks, Check-ins — all editable via the shared edit modal.

### Offline Support
Sessions and breaks queue locally when offline, with idempotent (client_id-based) sync on reconnect.

### CSV Export
Log tab → Export button.

### PWA Install
Installable from Chrome as a standalone desktop app with no address bar.

## Setup

### 1. Create Supabase project
Go to supabase.com → New project → wait ~2 minutes for provisioning.

### 2. Create the tables
Supabase → SQL Editor → New query → paste and run:

```sql
-- ── focus_sessions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_sessions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now(),
  client_id    TEXT,
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
CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_client_id_key ON focus_sessions(client_id) WHERE client_id IS NOT NULL;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON focus_sessions FOR ALL USING (true) WITH CHECK (true);

-- ── breaks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS breaks (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT now(),
  client_id          TEXT,
  session_date       DATE,
  start_time         TIME,
  end_time           TIME,
  break_duration_min INT4,
  break_activities   TEXT,
  overdue            BOOLEAN DEFAULT false,
  returned           BOOLEAN,
  break_note         TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS breaks_client_id_key ON breaks(client_id) WHERE client_id IS NOT NULL;
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

If you're upgrading from a v4 database that already has these tables, just
run the `client_id` migration block from the "Migration SQL" section above
instead of the full `CREATE TABLE` statements.

### 3. Get your credentials
Supabase sidebar → Settings → API: Project URL, anon/public key.

### 4. Connect in the app
Open the app → Settings tab → paste both values → Test Connection.

### 5. Deploy to GitHub Pages
Push `index.html`, `css/`, `js/`, `alarm.mp3`, `manifest.json`,
`service-worker.js`, and `icons/` to a public repo → Settings → Pages →
Source: main branch → root → Save. Live at
`https://yourusername.github.io/focus-tracker` in ~60 seconds.

### 6. Install as desktop app
Open the GitHub Pages URL in Chrome → install icon (⊕) in the address bar → Install.

## Data Schema

See the v4 schema tables below — unchanged except for the new `client_id`
column on `focus_sessions` and `breaks`.

### focus_sessions
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| client_id | TEXT | Client-generated idempotency key (new in v5) |
| created_at | TIMESTAMPTZ | Row creation timestamp |
| session_date | DATE | Calendar date of the session |
| start_time | TIME | Session start (HH:MM:SS) |
| end_time | TIME | Session end (HH:MM:SS) |
| span_sec | INT4 | Wall-clock seconds from start → end |
| focus_sec | INT4 | Actual focused seconds |
| ratio | INT4 | focus_sec ÷ span_sec × 100 |
| project | TEXT | Project name |
| task | TEXT | Task name within the project |
| task_type | TEXT | Session category |
| seq | INT4 | Session sequence number for that calendar day |
| energy | INT4 | 1 = Low, 2 = Medium, 3 = High |
| note | TEXT | Free-text session note |

### breaks
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| client_id | TEXT | Client-generated idempotency key (new in v5) |
| created_at | TIMESTAMPTZ | Row creation timestamp |
| session_date | DATE | Calendar date of the break |
| start_time | TIME | Break start |
| end_time | TIME | Break end |
| break_duration_min | INT4 | Actual break length in minutes |
| break_activities | TEXT | Semicolon-separated activities |
| overdue | BOOLEAN | Break ran past the overdue threshold |
| returned | BOOLEAN | Whether you came back after the break |
| break_note | TEXT | Free-text break note |

### daily_checkins
| Column | Type | Description |
|---|---|---|
| date | DATE | Primary key |
| sleep_hrs | NUMERIC(3,1) | Hours slept |
| wake_time | TIME | Time you woke up |
| energy | INT4 | 1 = Low, 2 = Medium, 3 = High |

### app_config
| Column | Type | Description |
|---|---|---|
| key | TEXT | `ft_categories` or `ft_break_acts` |
| value | TEXT | JSON-serialised array |

## Keyboard Shortcut
Space — start or pause the timer from anywhere on the Timer page (disabled while focus is in a text field).

## Tech Stack
Vanilla HTML / CSS / JS (ES modules, no build step) — Supabase JS v2 for
PostgreSQL — Service Worker for offline support & PWA install — GitHub Pages
for hosting.
