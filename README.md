# GameBoard

Voice-driven, game-agnostic scorekeeping with a React frontend and Flask + SQLite backend.
Create boards, manage players and rounds, track scores, view analysis, and run
tournaments from one local or Cloud Run deployment.

Each board belongs to the account that created it. Sign in with a name to keep
boards private and available across devices.

**Stack:** React + Vite (frontend) · Flask (backend) · SQLite (database) · GCP Cloud Run (hosting)

**Status:** Integrated full-stack application — 95 backend tests and the
production frontend build pass.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [What is built](#2-what-is-built)
3. [Repository layout](#3-repository-layout)
4. [The API in one page](#4-the-api-in-one-page)
5. [How the application works](#5-how-the-application-works)
6. [Rules the backend enforces](#6-rules-the-backend-enforces)
7. [Database schema](#7-database-schema)
8. [Troubleshooting](#8-troubleshooting)
9. [Development workflow](#9-development-workflow)

---

## 1. Quick start

```bash
git clone https://github.com/neghaaloor/cognizant-demo.git
cd cognizant-demo
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
npm install
npm run serve
```

The app and API start on **http://localhost:5055**. Verify the backend:

```bash
curl http://localhost:5055/health
```

```json
{ "status": "ok", "server": "running", "database": "connected" }
```

Run the backend tests:

```bash
cd backend && python -m pytest
```

Build the frontend without starting the server:

```bash
npm run build
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
| Voice (Web Speech) | Done |
| Accounts and private boards | Done |
| Tournament brackets | Done |

---

## 3. Repository layout

```
GameBoard/
├── backend/
│   ├── app.py, auth.py, config.py, errors.py, logging_config.py
│   ├── database/                 SQLite connection and schema
│   ├── routes/                   Flask blueprints for all API resources
│   ├── services/                 Business logic and data access
│   ├── validators/               Request validation rules
│   ├── tests/                    95 backend tests
│   ├── requirements.txt
│   └── pytest.ini
├── src/
│   ├── pages/                    Login, dashboard, games, history, analysis, tournaments
│   ├── boards/                   Six board display types and bracket engine
│   ├── components/               Shared UI, leaderboard, sidebar, and voice controls
│   ├── engines/                  Scoring and leaderboard calculations
│   ├── services/                 API, storage, speech, commentary, and voice commands
│   └── App.jsx, main.jsx, index.css
├── index.html                    Vite entry point
├── package.json                  Frontend scripts and dependencies
├── vite.config.js                Vite development proxy
├── tailwind.config.js
├── docs/                         API, deployment, and troubleshooting guides
├── scripts/smoke_test.sh         Authenticated end-to-end API check
├── Dockerfile                    Multi-stage frontend + Flask Cloud Run image
└── .env.example
```

Routes stay thin; business logic belongs in `services/`, validation belongs in
`validators/`, and schema/connection changes belong in `database/`.

---

## 4. The API in one page

Base URL: `http://localhost:5055` locally, or your Cloud Run URL.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Server + database health |
| `POST` | `/api/session` | Sign in or create an account by name |
| `GET` | `/api/session` | Validate the current account |
| `GET` | `/api/session/boards` | List boards owned by the current account |
| `POST` | `/api/scoreboards` | Create a scoreboard (status `SETUP`) |
| `GET` | `/api/scoreboards` | List the current account's scoreboards |
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
| `PUT` | `/api/scoreboards/{id}/rounds/{rid}/scores/{pid}` | Update one player's score |
| `GET` | `/api/scoreboards/{id}/scores` | List scores for a scoreboard |
| `GET` | `/api/scoreboards/{id}/leaderboard` | Ranked standings |
| `GET` | `/api/scoreboards/{id}/history` | R1/R2/R3/TOTAL grid |
| `GET` | `/api/scoreboards/{id}/analysis` | Stats + achievements + timeline |
| `GET` | `/api/scoreboards/{id}/summary` | Compact roll-up (cheap to poll) |
| `GET` | `/api/scoreboards/{id}/achievements` | Badges only |
| `GET` | `/api/scoreboards/{id}/timeline` | Narrative only |
| `POST` | `/api/scoreboards/{id}/end` | `ACTIVE → ENDED`, decides the winner |
| `POST` | `/api/scoreboards/{id}/reset` | Clear scores, keep players |
| `GET` | `/api/tournaments` | List the current account's tournaments |
| `POST` | `/api/tournaments` | Create a tournament |
| `GET` | `/api/tournaments/{id}` | Read a tournament |
| `PATCH` | `/api/tournaments/{id}` | Update a tournament |
| `POST` | `/api/tournaments/{id}/games` | Create a game in a tournament |
| `DELETE` | `/api/tournaments/{id}` | Delete a tournament |

Protected endpoints require the `X-User-Id` header returned by
`POST /api/session`. The frontend manages this automatically after sign-in.

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

## 5. How the application works

### Frontend API client

API requests are centralized in [`src/services/api.js`](src/services/api.js).
The client discovers the backend on startup; set `VITE_API_BASE` when a custom
API URL is required.

The API client also persists the signed-in account and adds its
`X-User-Id` header to protected requests.

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

### Game setup and lobby

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
  a short 6-digit PIN instead of the raw id, add it to the `scoreboards` table
  and expose it through the scoreboard routes and frontend API client.

---

### Scoring and game lifecycle

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

### Voice control (Web Speech)

Voice is an input/output layer, not a second scoring system.

```
Speech → Web Speech STT → your command parser → the SAME api() calls above → TTS
```

**Command → API mapping:**

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

### Score analysis, achievements, and timeline

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
If you want a new badge, it must be derivable from points alone. Add it to
`backend/services/analysis_service.py` rather than computing it in JS, so every
screen agrees.

---

### GCP Cloud Run deployment

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

### SQLite database

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

Six tables. `scores` is the source of truth for points; standings and analysis
are derived.

```
scoreboards ──┬── players ──┐
              │             ├── scores
              └── rounds ───┘
```

| Table | Key columns | Notes |
|---|---|---|
| `scoreboards` | `id`, `name`, `status`, `current_round`, `winner_id` | One scorekeeping session |
| `users` | `id`, `name` | Account that owns boards and tournaments |
| `tournaments` | `id`, `owner_id`, `name`, `players`, `status` | Series of scoreboard games |
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
field in the logs, which makes individual requests easy to trace.

---

## 9. Development workflow

Run the checks from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
npm install
cd backend && python -m pytest
cd .. && npm run build
./scripts/smoke_test.sh
```

For development with automatic reload, use `npm run dev`. This starts the API
on port `5055` and Vite on port `5173`. For a single production-like process,
use `npm run serve` and open `http://localhost:5055`.

The Docker image builds the frontend and serves it through Flask. Cloud Run
injects `PORT`; local Docker testing can use:

```bash
docker build -t cognizant-demo-local .
docker run --rm -p 8080:8080 -e PORT=8080 cognizant-demo-local
```

See [docs/API_CONTRACT.md](docs/API_CONTRACT.md) for request and response
details, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Cloud Run, and
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for diagnostics.

---

**Frontend displays. Backend decides. SQLite stores. GCP hosts.**
