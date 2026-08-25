# Board Game Scorekeeper — Backend

A lightweight, **game-agnostic** digital scorecard that replaces a paper score pad.

It does **not** know the rules of the game you are physically playing. It only
tracks players, rounds, points, totals, rankings, history and the winner.

**Stack:** HTML/CSS/JS (frontend) · Flask (backend) · SQLite (database) · GCP Cloud Run (hosting)

**Status:** Backend complete — 58 unit tests + 32 live API checks passing.
Persons 5 and 6 own this folder. Everyone else integrates against it.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [What is built](#2-what-is-built)
3. [Repository layout](#3-repository-layout)
4. [The API in one page](#4-the-api-in-one-page)
5. [**How each person connects their work**](#5-how-each-person-connects-their-work) ← start here if you are Person 1, 2, 3, 4, 7 or 8
6. [Rules the backend enforces](#6-rules-the-backend-enforces)
7. [Database schema](#7-database-schema)
8. [Troubleshooting](#8-troubleshooting)
9. [Team workflow](#9-team-workflow)

---

## 1. Quick start

```bash
git clone https://github.com/AbhiramNairYR/Cognizent-GCP.git
cd Cognizent-GCP
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/app.py
```

Server starts on **http://localhost:8080**. Verify it:

```bash
curl http://localhost:8080/health
```

```json
{ "status": "ok", "server": "running", "database": "connected" }
```

Run the tests:

```bash
cd backend && python -m pytest
```

Run the full game flow against a live server (create → players → start → rounds →
leaderboard → history → analysis → end → winner → reset):

```bash
./scripts/smoke_test.sh
```

> **Windows:** use `python -m venv .venv` then `.venv\Scripts\activate`.
> Everything else is identical.

---

## 2. What is built

| Area | Status |
|---|---|
| Scoreboard create / read / start / end / reset | Done |
| Players — add, rename, remove, unlimited during setup | Done |
| Rounds — create, list, current round, completeness tracking | Done |
| Scores — atomic submission, full validation | Done |
| Leaderboard with tie-aware ranking | Done |
| Round-by-round history grid | Done |
| Analysis, achievements, timeline | Done |
| Winner + draw handling | Done |
| `/health` that really queries SQLite | Done |
| Consistent JSON error contract | Done |
| Structured JSON logs for Cloud Logging | Done |
| Dockerfile for Cloud Run | Done |
| Voice (Web Speech) | **Phase 5 — after GCP is stable** |

---

## 3. Repository layout

```
Cognizent-GCP/
├── backend/                    ← Persons 5 + 6 own this
│   ├── app.py                    Flask entry point, /health, error handlers, CORS
│   ├── config.py                 All env-driven settings
│   ├── errors.py                 Error code catalogue + response shape
│   ├── logging_config.py         JSON logs for GCP Cloud Logging
│   ├── requirements.txt
│   ├── database/               ← Person 8 owns this
│   │   ├── schema.sql            The 4 tables
│   │   └── database.py           Connections, transactions, ping()
│   ├── routes/                 ← Person 5: HTTP layer only
│   │   ├── scoreboard_routes.py
│   │   ├── player_routes.py
│   │   ├── round_routes.py
│   │   ├── score_routes.py
│   │   └── analysis_routes.py
│   ├── services/               ← Person 5: business logic + SQL
│   │   ├── scoreboard_service.py
│   │   ├── player_service.py
│   │   ├── round_service.py
│   │   ├── score_service.py
│   │   ├── leaderboard_service.py
│   │   └── analysis_service.py
│   ├── validators/             ← Person 6: "is this allowed? is this valid?"
│   │   ├── scoreboard_validator.py
│   │   ├── player_validator.py
│   │   └── score_validator.py
│   └── tests/                    58 tests
├── docs/
│   ├── API_CONTRACT.md           Full request/response reference
│   ├── DEPLOYMENT.md             Person 7's GCP runbook
│   └── TROUBLESHOOTING.md        Layer-by-layer debugging
├── scripts/smoke_test.sh         End-to-end check against a running server
├── Dockerfile                    Cloud Run image
└── .env.example
```

**Where to add code, by folder:**

- New endpoint → `routes/` (thin) + `services/` (logic). Never put SQL in a route.
- New rule ("players can't do X") → `validators/`. Never inline a rule in a service.
- New table or query → `database/`.

---

## 4. The API in one page

Base URL: `http://localhost:8080` locally, or your Cloud Run URL.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Server + database health |
| `POST` | `/api/scoreboards` | Create a scoreboard (status `SETUP`) |
| `GET` | `/api/scoreboards/{id}` | Scoreboard + its players |
| `GET` | `/api/scoreboards/{id}/players` | List players |
| `POST` | `/api/scoreboards/{id}/players` | Add a player *(SETUP only)* |
| `PATCH` | `/api/scoreboards/{id}/players/{pid}` | Rename a player *(SETUP only)* |
| `DELETE` | `/api/scoreboards/{id}/players/{pid}` | Remove a player *(SETUP only)* |
| `POST` | `/api/scoreboards/{id}/start` | `SETUP → ACTIVE`, opens Round 1, locks roster |
| `GET` | `/api/scoreboards/{id}/rounds` | List all rounds |
| `GET` | `/api/scoreboards/{id}/rounds/current` | The round being played now |
| `POST` | `/api/scoreboards/{id}/rounds` | Open the next round |
| `POST` | `/api/scoreboards/{id}/rounds/{rid}/scores` | **Submit a round** |
| `GET` | `/api/scoreboards/{id}/leaderboard` | Ranked standings |
| `GET` | `/api/scoreboards/{id}/history` | R1/R2/R3/TOTAL grid |
| `GET` | `/api/scoreboards/{id}/analysis` | Stats + achievements + timeline |
| `GET` | `/api/scoreboards/{id}/summary` | Compact roll-up (cheap to poll) |
| `GET` | `/api/scoreboards/{id}/achievements` | Badges only |
| `GET` | `/api/scoreboards/{id}/timeline` | Narrative only |
| `POST` | `/api/scoreboards/{id}/end` | `ACTIVE → ENDED`, decides the winner |
| `POST` | `/api/scoreboards/{id}/reset` | Clear scores, keep players |

**Every success looks like this:**

```json
{ "success": true, "...": "endpoint-specific fields" }
```

**Every failure looks like this — no exceptions:**

```json
{
  "success": false,
  "error": "DUPLICATE_PLAYER",
  "message": "A player named 'Rahul' is already on this scoreboard."
}
```

> Branch your UI on **`error`** (a stable code), never on `message` (human text
> that may be reworded).

Full reference with every field: **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**

---

## 5. How each person connects their work

### The one file every frontend person needs

Create `frontend/js/api.js` and put **the base URL in exactly one place**, so
switching from localhost to Cloud Run is a one-line change:

```js
// frontend/js/api.js
const API_BASE = "http://localhost:8080";   // ← change to your Cloud Run URL

async function api(path, method = "GET", body = null) {
  const response = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });

  const data = await response.json();

  if (!data.success) {
    // data.error is the stable code, e.g. "DUPLICATE_PLAYER"
    throw Object.assign(new Error(data.message), { code: data.error });
  }
  return data;
}
```

Then every call is one line:

```js
const { scoreboard } = await api("/api/scoreboards", "POST", { name: "Friday Night" });
```

And error handling is uniform:

```js
try {
  await api(`/api/scoreboards/${id}/players`, "POST", { name });
} catch (err) {
  if (err.code === "DUPLICATE_PLAYER") showToast("That name is taken.");
  else if (err.code === "PLAYERS_LOCKED") showToast("Game already started.");
  else showToast(err.message);
}
```

---

### Person 1 — Setup / Lobby / QR / Game PIN

**Your flow:**

```js
// 1. Create the scoreboard when the host taps "Create Game"
const { scoreboard } = await api("/api/scoreboards", "POST", { name: "Friday Night" });
const scoreboardId = scoreboard.id;          // ← keep this; every other call needs it

// 2. Add each player as the host types a name
await api(`/api/scoreboards/${scoreboardId}/players`, "POST", { name: "Abhiram" });

// 3. Remove / rename during setup
await api(`/api/scoreboards/${scoreboardId}/players/${playerId}`, "DELETE");
await api(`/api/scoreboards/${scoreboardId}/players/${playerId}`, "PATCH", { name: "Abhiram" });

// 4. Refresh the lobby list
const { players, playerCount } = await api(`/api/scoreboards/${scoreboardId}/players`);

// 5. "START SCOREBOARD"
await api(`/api/scoreboards/${scoreboardId}/start`);   // → status ACTIVE, Round 1 open
```

**What you need to know:**

- **There is no player cap.** Keep adding until the host presses Start.
- Errors you must handle: `INVALID_PLAYER_NAME` (empty), `DUPLICATE_PLAYER`
  (case-insensitive — "rahul" clashes with "Rahul"), `NO_PLAYERS` (Start pressed
  with an empty roster).
- After `/start`, adding or removing players returns **`PLAYERS_LOCKED`** — hide
  those buttons once `status === "ACTIVE"`.
- **QR / Game PIN:** the backend has no PIN column today. The simplest approach
  that needs no backend change is to encode the **scoreboard id** in the QR/share
  URL — `https://your-frontend/join?scoreboard=12`. If the team decides it wants
  a short 6-digit PIN instead of the raw id, tell Person 5/6 and it is a small
  addition to the `scoreboards` table.

---

### Person 2 — Scoreboard / History / Winner / Animations

**Your flow:**

```js
// 1. Which round are we on, and who still needs a score?
const { round } = await api(`/api/scoreboards/${id}/rounds/current`);
// round.id, round.roundNumber, round.scores[], round.missingPlayers[], round.complete

// 2. "SUBMIT ROUND" — send every player at once
const result = await api(
  `/api/scoreboards/${id}/rounds/${round.id}/scores`,
  "POST",
  { scores: [
      { playerId: 1, points: 20 },
      { playerId: 2, points: 15 },
      { playerId: 3, points: 30 }
  ]}
);

// 3. The response ALREADY contains the new leaderboard — no second request
renderLeaderboard(result.leaderboard);   // [{ rank, playerId, name, score, roundsPlayed }]

// 4. Move to the next round
await api(`/api/scoreboards/${id}/rounds`, "POST");

// 5. "END GAME"
const final = await api(`/api/scoreboards/${id}/end`, "POST");
if (final.tie) showDraw(final.tiedPlayers);      // ← must handle this
else showWinner(final.winner);                   // { playerId, name, score, rank }

// 6. "REMATCH" — same players, scores cleared
await api(`/api/scoreboards/${id}/reset`, "POST");
```

**What you need to know:**

- **The leaderboard comes back with the submit response.** One request per round
  submit — do not fetch `/leaderboard` again straight after.
- `leaderboard` is **already sorted and ranked**. Do not re-sort or re-total in
  JS; the backend is the source of truth. Animate rows moving between the old
  and new order.
- **Ties share a rank and skip the next one:** `1, 2, 2, 4`.
- **`end` can return no winner.** On a draw, `winner` is `null`, `tie` is `true`,
  and `tiedPlayers` lists everyone level at the top. Your winner banner must have
  a "DRAW" state — the scoreboard deliberately refuses to invent a tie-breaker
  because it does not know the game's rules.
- History grid for your table:

```js
const { history } = await api(`/api/scoreboards/${id}/history`);
// history.roundNumbers        → [1, 2, 3]                (your column headers)
// history.players[i].name     → "Monish"
// history.players[i].rounds   → [30, 20, 30]  (aligned with roundNumbers; null = no entry)
// history.players[i].total    → 80
```

- **Multi-device sync:** poll `GET /api/scoreboards/{id}/summary` every 2–3 seconds
  while a round is open. It is the cheapest endpoint. No WebSockets in this build.

---

### Person 3 — Voice (Web Speech) — Phase 5

**Do not start until `/health` is green on Cloud Run and the frontend works
without voice.** Voice is an input/output layer, not a second scoring system.

```
Speech → Web Speech STT → your command parser → the SAME api() calls above → TTS
```

**Command → API mapping (use the exact endpoints Persons 1 and 2 already call):**

| Spoken | Call |
|---|---|
| "Add Rahul" | `POST /api/scoreboards/{id}/players` `{name:"Rahul"}` |
| "Rahul scored 25" | `POST /api/scoreboards/{id}/rounds/{rid}/scores` `{scores:[{playerId, points:25}]}` |
| "Submit round" / "Next round" | `POST /api/scoreboards/{id}/rounds` |
| "Show leaderboard" | `GET /api/scoreboards/{id}/leaderboard` |
| "End game" | `POST /api/scoreboards/{id}/end` |
| "Reset" / "Rematch" | `POST /api/scoreboards/{id}/reset` |

**Two things the backend already does for you:**

1. **One player at a time is allowed.** "Rahul scored 25" can post a single-entry
   `scores` array. The response tells you who is still missing:
   ```json
   { "roundComplete": false, "missingPlayers": [{ "playerId": 3, "name": "Monish" }] }
   ```
   Use `missingPlayers` to prompt: *"And Monish?"*
2. **Points may arrive as a string.** `"points": "25"` is accepted, so you do not
   have to cast STT output.

**You must map a spoken name → `playerId` yourself.** Fetch the roster once
(`GET /players`) and match case-insensitively. Never send a name where the API
expects a `playerId`.

**For TTS**, `GET /api/scoreboards/{id}/summary` gives you a ready-made line:
`summary.leader.name` and `summary.leader.score` → *"Monish is leading with 80 points."*
`GET /timeline` gives full sentences you can read aloud verbatim.

**Buttons must keep working with voice switched off.** Web Speech is
Chrome/Edge-only — feature-detect `window.SpeechRecognition ||
window.webkitSpeechRecognition` and hide the mic button if absent.

---

### Person 4 — Score Analysis / Achievements / Timeline

**The backend already computes all of this.** One call gets everything:

```js
const { analysis } = await api(`/api/scoreboards/${id}/analysis`);
```

`analysis.players[]` — one entry per player, sorted by rank:

| Field | Meaning |
|---|---|
| `rank`, `total`, `name`, `playerId` | Position and score |
| `average` | Points per round played |
| `bestRound` / `worstRound` | Highest / lowest single round |
| `consistency` | Std-dev of round scores — **lower = steadier** |
| `lastRound` | Most recent round's points |
| `trend` | Last round minus the one before (`+10`, `-5`, `null`) |
| `gapToLeader` | Points behind #1 (`0` for the leader) |
| `perRound` | `[20, 25, 10]` — `null` where no entry |
| `cumulative` | `[20, 45, 55]` — running total after each round |

`analysis.achievements[]` — only badges actually **earned** (nothing is faked):

`CURRENT_LEADER` 🏆 · `HIGHEST_ROUND` 🔥 · `BIGGEST_COMEBACK` 📈 ·
`MOST_IMPROVED` ⚡ · `MOST_CONSISTENT` 🎯 · `LED_MOST_ROUNDS` 👑

Each carries `{ code, icon, label, playerId, name, detail }` — render `icon` +
`label` + `detail` and you are done.

`analysis.timeline[]` — ready-written sentences:

```json
{ "round": 2, "type": "LEAD_CHANGE", "leaderName": "Monish",
  "message": "Monish moves into first place with 50 points." }
```

Types: `LEAD_TAKEN`, `LEAD_CHANGE`, `LEAD_EXTENDED`, `GAP_CLOSED`, `LEAD_HELD`, `TIE_AT_TOP`.

**Smaller endpoints if you only need one piece:** `/achievements`, `/timeline`,
`/summary`, `/analysis/players/{playerId}`.

**Why all achievements are points-only:** the scoreboard does not know the game.
It can say "Highest Scoring Round"; it can never say "Captured 5 territories".
If you want a new badge, it must be derivable from points alone — ask Person 5
to add it to `services/analysis_service.py` rather than computing it in JS, so
every screen agrees.

---

### Person 7 — GCP Cloud Run / IAM / Integration

Full runbook: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. The short version:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/scorekeeper
gcloud run deploy scorekeeper \
  --image gcr.io/PROJECT_ID/scorekeeper \
  --region asia-south1 \
  --allow-unauthenticated \
  --max-instances 1
```

Then prove the whole chain works before telling anyone the API is up:

```bash
curl https://YOUR-URL.run.app/health
./scripts/smoke_test.sh https://YOUR-URL.run.app
```

**Three things that will bite you:**

1. **`--max-instances 1` is not optional.** SQLite is one file on one instance.
   Two instances = two different databases and scores that vanish at random.
2. **The database lives in `/tmp` and is wiped when the instance recycles.**
   This is an accepted trade-off — SQLite is a fixed requirement of the use case.
   Document it; do not switch to Firestore or Cloud SQL to "fix" it.
3. **Set `CORS_ORIGINS`** to the real frontend origin before the demo, or the
   frontend team will see CORS errors that look like backend outages.

Logs are already structured JSON with a `severity` field, so Cloud Logging
filters work out of the box:

```
resource.type="cloud_run_revision" severity>=WARNING
```

---

### Person 8 — SQLite Database

You own `backend/database/`. The schema is live in
[`schema.sql`](backend/database/schema.sql) and tables are created automatically
on boot (`CREATE TABLE IF NOT EXISTS`), so a fresh clone just works.

**Two rules that must not be broken:**

1. **Never add a `total_score` column.** Totals are always `SUM(points)` over the
   `scores` table. A stored total is a total that will eventually disagree with
   the history the players can see on screen.
2. **`PRAGMA foreign_keys = ON` on every connection.** SQLite disables foreign
   keys by default, and without it every `ON DELETE CASCADE` silently does
   nothing. This is already handled in `database.py` — don't remove it.

Inspect the database directly:

```bash
sqlite3 backend/data/scorekeeper.db
.tables
.schema scores
SELECT p.name, SUM(s.points) FROM players p
  LEFT JOIN scores s ON s.player_id = p.id
  WHERE p.scoreboard_id = 1 GROUP BY p.id ORDER BY 2 DESC;
```

---

## 6. Rules the backend enforces

**Lifecycle** — every action is gated on the scoreboard's state:

```
SETUP ──start──▶ ACTIVE ──end──▶ ENDED
  │                 │               │
  add/remove/       create rounds   read-only
  rename players    submit scores   (reset to revive)
  NO scoring        roster LOCKED
```

**Validation** (all return the standard error shape):

| Rule | Error code |
|---|---|
| Player name must be non-empty text | `INVALID_PLAYER_NAME` |
| No duplicate names in one scoreboard (case-insensitive) | `DUPLICATE_PLAYER` |
| Roster changes only during SETUP | `PLAYERS_LOCKED` |
| Cannot start with zero players | `NO_PLAYERS` |
| Points must be a whole number (`"25"` ok, `20.5`/`true`/`"abc"` not) | `INVALID_SCORE` |
| Negative and zero points **are allowed** (configurable) | — |
| One score per player per round | `DUPLICATE_SCORE` |
| Cannot re-submit a fully-scored round | `ROUND_ALREADY_SUBMITTED` |
| Next round needs the current one complete | `ROUND_INCOMPLETE` |
| Round must belong to that scoreboard | `ROUND_NOT_IN_SCOREBOARD` |
| Player must belong to that scoreboard | `PLAYER_NOT_FOUND` |
| No scoring before start / after end | `SCOREBOARD_NOT_STARTED` / `SCOREBOARD_ALREADY_ENDED` |

**Atomic round submission.** A round with 10 players either writes all 10 scores
or none. If player 7's value is invalid, players 1–6 are rolled back too — there
is no such thing as a half-submitted round.

**Ties are reported honestly.** Equal top scores return `winner: null`,
`tie: true` and the tied players. The scoreboard does not know whether the real
game breaks ties by cards held or a coin flip, so it does not guess.

---

## 7. Database schema

Four tables. `scores` is the source of truth; everything else is derived.

```
scoreboards ──┬── players ──┐
              │             ├── scores
              └── rounds ───┘
```

| Table | Key columns | Notes |
|---|---|---|
| `scoreboards` | `id`, `name`, `status`, `current_round`, `winner_id` | One scorekeeping session |
| `players` | `id`, `scoreboard_id`, `name` | `UNIQUE(scoreboard_id, name)` |
| `rounds` | `id`, `scoreboard_id`, `round_number` | `UNIQUE(scoreboard_id, round_number)` |
| `scores` | `id`, `round_id`, `player_id`, `points` | `UNIQUE(round_id, player_id)` |

Deleting a scoreboard cascades to players → rounds → scores.

Leaderboard query (players with no scores still appear, on 0):

```sql
SELECT p.id, p.name, COALESCE(SUM(s.points), 0) AS total_score
  FROM players p
  LEFT JOIN scores s ON s.player_id = p.id
 WHERE p.scoreboard_id = ?
 GROUP BY p.id, p.name
 ORDER BY total_score DESC;
```

---

## 8. Troubleshooting

Full guide: **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**.

**Always debug in this order — never assume the database first:**

```
Frontend → HTTP request → Cloud Run → Flask → SQL → SQLite
```

| Symptom | First check |
|---|---|
| Frontend can't reach the API | `curl .../health`. Green = the problem is in the frontend request, not the backend |
| CORS error in DevTools | Set `CORS_ORIGINS` to the frontend origin and redeploy |
| `500` | Cloud Logging → find the `severity=ERROR` line → it has the stack trace and a `request_id` |
| `409` on a valid-looking call | You are in the wrong state. `GET /api/scoreboards/{id}` and read `status` |
| Scores disappear randomly | More than one Cloud Run instance. Redeploy with `--max-instances 1` |
| `curl` works, browser doesn't | CORS or a wrong `API_BASE` |

Every response carries an `X-Request-Id` header that matches the `request_id`
field in the logs — paste it to Person 7 and they can find your exact request.

**Who to ask:** Cloud Run/deploy → Person 7 · backend exception → Person 5/6 ·
SQL/schema → Person 8 · request shape → Person 1/2.

---

## 9. Team workflow

**Branches** — never push straight to `main`:

```
main            ← protected, always deployable
└── develop     ← integration
    ├── feature/ui-lobby         (Person 1)
    ├── feature/ui-scoreboard    (Person 2)
    ├── feature/voice            (Person 3)
    ├── feature/analytics        (Person 4)
    ├── feature/game-api         (Person 5)
    ├── feature/validation       (Person 6)
    ├── feature/gcp              (Person 7)
    └── feature/database         (Person 8)
```

```bash
git checkout develop && git pull
git checkout -b feature/your-part
# ...work...
git push -u origin feature/your-part      # then open a Pull Request
```

**Before every PR that touches `backend/`:**

```bash
cd backend && python -m pytest      # 58 tests must stay green
```

**Build order:**

| Phase | Who | Gate |
|---|---|---|
| 1 | Persons 5, 6, 8 — backend + SQLite | `pytest` + `smoke_test.sh` pass ✅ **done** |
| 2 | Persons 1, 2 — frontend against the API | Full game playable in a browser |
| 3 | Person 7 — GCP Cloud Run | `/health` green on the Cloud Run URL |
| 4 | Person 4 — analysis UI | Reads `/analysis` |
| 5 | Person 3 — Web Speech | Only after phase 3 is stable |

**The rule that keeps an 8-person project from falling apart:** the API contract
in [docs/API_CONTRACT.md](docs/API_CONTRACT.md) is fixed. If you need it changed,
raise it with Persons 5 and 6 and change it there first — never work around it
in your own layer.

---

**Frontend displays. Backend decides. SQLite stores. GCP hosts.**

---

## SQLite Database Setup

The backend uses SQLite as the persistent database for the scorekeeper application.

### Database Architecture

The database flow is:

    Flask API
        ↓
    Routes
        ↓
    Services
        ↓
    backend/database/database.py
        ↓
    SQLite
        ↓
    backend/data/scorekeeper.db

The SQLite database is initialized automatically when the backend starts.

### Database Files

The database implementation is located under:

    backend/
    └── database/
        ├── __init__.py
        ├── database.py
        └── schema.sql

The runtime SQLite database is created at:

    backend/data/scorekeeper.db

### Database Schema

The application uses four primary tables:

- `scoreboards` — stores scoreboard/game sessions and their status.
- `players` — stores players belonging to a scoreboard.
- `rounds` — stores rounds belonging to a scoreboard.
- `scores` — stores the score of each player for each round.

The relationship is:

    scoreboards
        ├── players
        └── rounds
              └── scores
                     └── players

### Source of Truth

The `scores` table is the source of truth for scoring.

Player totals are not stored in the `players` table. Totals are derived from the round-by-round scores using `SUM(points)`.

This prevents stored totals from becoming inconsistent with the actual score history.

### Database Constraints

The schema enforces:

- Foreign-key relationships.
- Unique player names within the same scoreboard.
- Unique round numbers within the same scoreboard.
- Only one score for a player in a particular round.
- Cascade deletion for dependent players, rounds, and scores.
- `winner_id` is set to `NULL` if the referenced player is deleted.

### SQLite Connection Layer

`backend/database/database.py` provides the common database access layer used by the services.

It provides:

- SQLite connection management.
- Flask request-scoped database connections.
- Foreign-key enforcement.
- WAL journal mode.
- Single-query helpers.
- Multi-row query helpers.
- Write/commit helpers.
- Transaction support.
- Database initialization.

Foreign keys are explicitly enabled on every connection:

    PRAGMA foreign_keys = ON

WAL mode is also enabled:

    PRAGMA journal_mode = WAL

### Transactions

Multi-step operations use database transactions to guarantee all-or-nothing writes.

For example, submitting scores for a round uses a transaction so that either all valid score entries are committed or the entire operation is rolled back.

### Local Setup

From the `backend` directory:

    python -m venv venv

Activate the virtual environment on Windows:

    .\venv\Scripts\Activate.ps1

Install dependencies:

    python -m pip install -r requirements.txt

Start the backend:

    python app.py

The backend automatically creates/initializes:

    backend/data/scorekeeper.db

A successful startup prints a message similar to:

    database ready at ...\backend\data\scorekeeper.db

### Verifying SQLite

The API can be used to verify that the application is writing to SQLite.

For example:

    POST /api/scoreboards

A scoreboard created through the API is persisted in `scorekeeper.db`.

The database can then be inspected directly using Python's built-in SQLite module:

    import sqlite3

    db = sqlite3.connect("./data/scorekeeper.db")

    rows = db.execute(
        "SELECT id, name, status, current_round, created_at "
        "FROM scoreboards"
    ).fetchall()

    for row in rows:
        print(row)

    db.close()

This confirms the complete flow:

    API
      ↓
    Flask
      ↓
    Service layer
      ↓
    database.py
      ↓
    SQLite
      ↓
    scorekeeper.db

### Important Development Notes

Do not commit the generated SQLite database file.

Do not commit the Python virtual environment.

The database schema and connection layer are committed to Git; the SQLite database file is generated locally when the application starts.

Services should use the existing database helpers rather than creating independent SQLite connections.