# API Contract

**This document is the agreement between all 8 people.** The frontend, the voice
layer and the analysis layer all code against exactly what is written here.

If you need something changed, raise it with Persons 5 and 6 and change it *here
first* — do not work around it in your own layer.

Every example below is **real output** captured from the running server.

- Base URL (local): `http://localhost:8080`
- Base URL (GCP): your Cloud Run URL
- All request and response bodies are JSON. Send `Content-Type: application/json`.

---

## Response shape

**Success** — always carries `success: true`:

```json
{ "success": true, "scoreboard": { "...": "..." } }
```

**Failure** — always carries `success: false`, a stable `error` code, and human `message`:

```json
{
  "success": false,
  "error": "DUPLICATE_PLAYER",
  "message": "A player named 'Rahul' is already on this scoreboard."
}
```

Some errors add a `details` object with extra context (e.g. which players are
missing). **Branch on `error`, never on `message`.**

### HTTP status codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Created (scoreboard, player, round, scores) |
| `400` | Invalid request — bad types, missing fields, malformed JSON |
| `404` | Resource does not exist |
| `409` | Conflict — wrong lifecycle state, duplicate, locked roster |
| `500` | Server error (check Cloud Logging) |
| `503` | `/health` only — database unreachable |

### Error codes

| Code | HTTP | When |
|---|---|---|
| `SCOREBOARD_NOT_FOUND` | 404 | No scoreboard with that id |
| `SCOREBOARD_NOT_STARTED` | 409 | Action needs `ACTIVE`, scoreboard is `SETUP` |
| `SCOREBOARD_ALREADY_STARTED` | 409 | Action needs `SETUP`, scoreboard is `ACTIVE` |
| `SCOREBOARD_ALREADY_ENDED` | 409 | Scoreboard is `ENDED` and read-only |
| `NO_PLAYERS` | 409 | Start pressed with an empty roster |
| `PLAYER_NOT_FOUND` | 404 | Player id unknown, or on a different scoreboard |
| `DUPLICATE_PLAYER` | 409 | Name already taken (case-insensitive) |
| `INVALID_PLAYER_NAME` | 400 | Empty, whitespace-only, non-text, or too long |
| `PLAYERS_LOCKED` | 409 | Roster change attempted after start |
| `TOO_MANY_PLAYERS` | 409 | Sanity ceiling hit (default 100) |
| `ROUND_NOT_FOUND` | 404 | Round id unknown |
| `ROUND_NOT_IN_SCOREBOARD` | 409 | Round belongs to another scoreboard |
| `ROUND_ALREADY_SUBMITTED` | 409 | Every player already has a score in that round |
| `ROUND_INCOMPLETE` | 409 | Next round requested before the current one is finished |
| `INVALID_SCORE` | 400 | Points not a whole number |
| `DUPLICATE_SCORE` | 409 | Player scored twice in one round or one payload |
| `NEGATIVE_SCORE_NOT_ALLOWED` | 400 | Only if `ALLOW_NEGATIVE_SCORES=false` |
| `SCORE_OUT_OF_RANGE` | 400 | Outside `MIN_SCORE`..`MAX_SCORE` |
| `EMPTY_SCORES` | 400 | `scores` array is empty |
| `INVALID_REQUEST` | 400 | Missing or malformed field |
| `INVALID_JSON` | 400 | Body is not parseable JSON |
| `NOT_FOUND` | 404 | No route matches |
| `INTERNAL_ERROR` | 500 | Unhandled exception (a `requestId` is included) |
| `DATABASE_ERROR` | 500 | SQLite failure |

---

## Lifecycle

```
SETUP ──POST /start──▶ ACTIVE ──POST /end──▶ ENDED
                                                │
                          POST /reset ◀─────────┘
```

| State | Allowed | Blocked |
|---|---|---|
| `SETUP` | add / rename / remove players, start | any scoring |
| `ACTIVE` | create rounds, submit scores, read everything | roster changes |
| `ENDED` | reads only, reset | new scores |

---

## Health

### `GET /health`

Runs a real `SELECT 1` against SQLite. Returns `503` if the database is
unreachable. **This is the first thing to check when anything looks broken.**

```json
{
  "status": "ok",
  "server": "running",
  "database": "connected",
  "databasePath": "/tmp/scorekeeper.db"
}
```

> Note: `/health` does **not** use the `success` envelope — monitoring tools
> expect a flat body.

---

## Scoreboards

### `POST /api/scoreboards` → `201`

Request (`name` is optional):

```json
{ "name": "Friday Night" }
```

Response:

```json
{
  "success": true,
  "scoreboard": {
    "id": 1,
    "name": "Friday Night",
    "status": "SETUP",
    "currentRound": 0,
    "winnerId": null,
    "createdAt": "2026-08-25 07:55:26",
    "startedAt": null,
    "endedAt": null,
    "players": [],
    "playerCount": 0
  }
}
```

**Keep `scoreboard.id` — every other call needs it.**

### `GET /api/scoreboards/{id}` → `200`

Same shape, with the current `players` array filled in.

### `GET /api/scoreboards?limit=50` → `200`

`{ "success": true, "scoreboards": [ ... ] }` — testing convenience.

### `POST /api/scoreboards/{id}/start` → `200`

No body. Sets `status: "ACTIVE"`, `currentRound: 1`, creates Round 1, and locks
the roster. The response adds `currentRoundId` so you can submit immediately.

```json
{
  "success": true,
  "scoreboard": {
    "id": 1, "name": "Friday Night", "status": "ACTIVE",
    "currentRound": 1, "currentRoundId": 1,
    "startedAt": "2026-08-25 07:55:26", "endedAt": null, "winnerId": null,
    "playerCount": 5,
    "players": [ { "id": 1, "name": "Abhiram", "scoreboardId": 1, "joinedAt": "..." } ]
  }
}
```

Errors: `NO_PLAYERS` (409), `SCOREBOARD_ALREADY_STARTED` (409).

### `POST /api/scoreboards/{id}/end` → `200`

No body. Computes the final standings and freezes the scoreboard.

```json
{
  "success": true,
  "winner": { "playerId": 3, "name": "Monish", "score": 80, "rank": 1, "roundsPlayed": 3 },
  "tie": false,
  "tiedPlayers": [],
  "roundsPlayed": 3,
  "leaderboard": [ "...full ranked list..." ],
  "scoreboard": { "status": "ENDED", "winnerId": 3, "endedAt": "2026-08-25 07:55:45" }
}
```

**On a draw** — `winner` is `null` and `winnerId` stays `null`:

```json
{
  "success": true,
  "winner": null,
  "tie": true,
  "tiedPlayers": [
    { "playerId": 3, "name": "Monish", "score": 100, "rank": 1 },
    { "playerId": 2, "name": "Rahul",  "score": 100, "rank": 1 }
  ]
}
```

The scoreboard does not know the real game's tie-breaker, so it refuses to
invent one. **Your winner screen must handle `tie: true`.**

### `POST /api/scoreboards/{id}/reset` → `200`

Clears scores, rounds and the winner. **Keeps the players.**

Request (optional):

```json
{ "mode": "REMATCH" }
```

| Mode | Result |
|---|---|
| `REMATCH` (default) | `status: ACTIVE`, fresh Round 1 — deal again immediately |
| `SETUP` | `status: SETUP`, `currentRound: 0` — roster becomes editable again |

### `DELETE /api/scoreboards/{id}` → `200`

Deletes the scoreboard and cascades to players, rounds and scores.

---

## Players

### `GET /api/scoreboards/{id}/players` → `200`

```json
{
  "success": true,
  "playerCount": 2,
  "players": [
    { "id": 1, "scoreboardId": 1, "name": "Abhiram", "joinedAt": "2026-08-25 07:55:26" },
    { "id": 2, "scoreboardId": 1, "name": "Rahul",   "joinedAt": "2026-08-25 07:55:26" }
  ]
}
```

### `POST /api/scoreboards/{id}/players` → `201`

**SETUP only. There is no player cap** — keep adding until Start is pressed.

```json
{ "name": "Karthik" }
```

```json
{
  "success": true,
  "player": { "id": 5, "scoreboardId": 1, "name": "Karthik", "joinedAt": "2026-08-25 07:55:26" }
}
```

Names are trimmed and inner whitespace collapsed. Duplicates are rejected
**case-insensitively**: `"rahul"`, `"RAHUL"` and `" Rahul "` all clash with `"Rahul"`.

Errors: `INVALID_PLAYER_NAME` (400), `DUPLICATE_PLAYER` (409), `PLAYERS_LOCKED` (409).

### `PATCH /api/scoreboards/{id}/players/{playerId}` → `200`

SETUP only. Body `{ "name": "Abhiram" }`. Returns the updated player.

### `DELETE /api/scoreboards/{id}/players/{playerId}` → `200`

SETUP only. Returns `{ "success": true, "removedPlayer": { ... } }`.

> Blocked after start on purpose: deleting a player mid-game would cascade-delete
> their scores and silently rewrite the history.

---

## Rounds

### `GET /api/scoreboards/{id}/rounds` → `200`

```json
{
  "success": true,
  "rounds": [
    { "id": 1, "scoreboardId": 1, "roundNumber": 1, "createdAt": "..." }
  ]
}
```

### `GET /api/scoreboards/{id}/rounds/current` → `200`

The round being played right now. **This is how the UI finds the `roundId` to
submit against.**

```json
{
  "success": true,
  "status": "ACTIVE",
  "round": {
    "id": 2,
    "scoreboardId": 1,
    "roundNumber": 2,
    "createdAt": "2026-08-25 07:55:35",
    "complete": true,
    "missingPlayers": [],
    "scores": [
      { "playerId": 1, "name": "Abhiram", "points": 25 },
      { "playerId": 2, "name": "Rahul",   "points": 30 }
    ]
  }
}
```

During `SETUP` there is no round yet:

```json
{ "success": true, "round": null, "status": "SETUP" }
```

### `POST /api/scoreboards/{id}/rounds` → `201`

No body. Opens the next round and advances `currentRound`.

```json
{ "success": true, "round": { "id": 3, "scoreboardId": 1, "roundNumber": 3, "createdAt": "..." } }
```

**The current round must be complete first**, otherwise `409 ROUND_INCOMPLETE`
with the names of who is missing:

```json
{
  "success": false,
  "error": "ROUND_INCOMPLETE",
  "message": "Round 1 is not finished yet. Still missing: Rahul, Monish.",
  "details": {
    "roundNumber": 1,
    "roundId": 1,
    "missingPlayers": [
      { "playerId": 2, "name": "Rahul" },
      { "playerId": 3, "name": "Monish" }
    ]
  }
}
```

### `GET /api/scoreboards/{id}/rounds/{roundId}` → `200`

One round in detail — same shape as `/rounds/current`.

---

## Scores

### `POST /api/scoreboards/{id}/rounds/{roundId}/scores` → `201`

**The most important endpoint.** Requires `status: ACTIVE`.

```json
{
  "scores": [
    { "playerId": 1, "points": 20 },
    { "playerId": 2, "points": 15 },
    { "playerId": 3, "points": 30 }
  ]
}
```

Response — **includes the refreshed leaderboard**, so one request does everything:

```json
{
  "success": true,
  "roundId": 1,
  "roundNumber": 1,
  "scoresRecorded": 5,
  "roundComplete": true,
  "missingPlayers": [],
  "leaderboard": [
    { "rank": 1, "playerId": 3, "name": "Monish",  "score": 30, "roundsPlayed": 1 },
    { "rank": 2, "playerId": 1, "name": "Abhiram", "score": 20, "roundsPlayed": 1 },
    { "rank": 3, "playerId": 2, "name": "Rahul",   "score": 15, "roundsPlayed": 1 }
  ]
}
```

**Rules:**

| Rule | Detail |
|---|---|
| **Atomic** | All scores are written, or none. One invalid entry rolls back the whole submission. |
| **Partial allowed** | Send one player at a time (the voice layer does). `roundComplete` and `missingPlayers` tell you what's left. |
| **Points** | Whole numbers. `20`, `-10`, `0` and the string `"25"` are all accepted. `20.5`, `true`, `"abc"` are rejected. |
| **Negatives** | Allowed by default — the scoreboard doesn't know the game, and penalties are common. |
| **One per player per round** | Enforced in code *and* by a database constraint. |

Errors: `INVALID_SCORE`, `EMPTY_SCORES`, `INVALID_REQUEST` (400);
`DUPLICATE_SCORE`, `ROUND_ALREADY_SUBMITTED`, `ROUND_NOT_IN_SCOREBOARD`,
`SCOREBOARD_NOT_STARTED`, `SCOREBOARD_ALREADY_ENDED` (409);
`PLAYER_NOT_FOUND`, `ROUND_NOT_FOUND` (404).

### `GET /api/scoreboards/{id}/scores` → `200`

Flat list of every score row — the raw feed.

```json
{
  "success": true,
  "scores": [
    { "id": 1, "roundId": 1, "roundNumber": 1, "playerId": 1, "name": "Abhiram",
      "points": 20, "createdAt": "..." }
  ]
}
```

---

## Leaderboard

### `GET /api/scoreboards/{id}/leaderboard` → `200`

Sorted highest first, already ranked. **Do not re-sort or re-total in JS.**

```json
{
  "success": true,
  "leaderboard": [
    { "rank": 1, "playerId": 3, "name": "Monish",  "score": 80, "roundsPlayed": 3 },
    { "rank": 2, "playerId": 2, "name": "Rahul",   "score": 65, "roundsPlayed": 3 },
    { "rank": 3, "playerId": 1, "name": "Abhiram", "score": 55, "roundsPlayed": 3 }
  ]
}
```

- Players with no scores yet still appear, on `score: 0`.
- **Ties share a rank and skip the next**: `1, 2, 2, 4`.

---

## History

### `GET /api/scoreboards/{id}/history` → `200`

The `R1 / R2 / R3 / TOTAL` grid from the original requirement.

```json
{
  "success": true,
  "history": {
    "roundNumbers": [1, 2],
    "rounds": [
      { "roundId": 1, "roundNumber": 1, "complete": true },
      { "roundId": 2, "roundNumber": 2, "complete": true }
    ],
    "players": [
      { "playerId": 3, "name": "Monish",  "rounds": [30, 20], "total": 50 },
      { "playerId": 1, "name": "Abhiram", "rounds": [20, 25], "total": 45 },
      { "playerId": 2, "name": "Rahul",   "rounds": [15, 30], "total": 45 },
      { "playerId": 5, "name": "Karthik", "rounds": [5, 35],  "total": 40 },
      { "playerId": 4, "name": "Arjun",   "rounds": [10, 15], "total": 25 }
    ]
  }
}
```

- `players[i].rounds` is **index-aligned with `roundNumbers`**.
- A `null` in `rounds` means that player has no entry for that round yet.
- Sorted by total, like the leaderboard.

---

## Analysis

### `GET /api/scoreboards/{id}/analysis` → `200`

Everything Person 4 needs in one call: `scoreboard`, `roundNumbers`,
`leaderboard`, `players`, `achievements`, `timeline`.

**`players[]`** — one entry per player, sorted by rank:

```json
{
  "playerId": 3,
  "name": "Monish",
  "rank": 1,
  "total": 80,
  "roundsPlayed": 3,
  "average": 26.67,
  "bestRound": 30,
  "worstRound": 20,
  "consistency": 4.71,
  "lastRound": 30,
  "trend": 10,
  "gapToLeader": 0,
  "perRound": [30, 20, 30],
  "cumulative": [30, 50, 80]
}
```

| Field | Meaning |
|---|---|
| `average` | Points per round played |
| `consistency` | Standard deviation of round scores — **lower is steadier** |
| `trend` | Last round minus the previous round (`null` before round 2) |
| `gapToLeader` | Points behind rank 1 (`0` for the leader) |
| `perRound` | Index-aligned with `roundNumbers`; `null` where no entry |
| `cumulative` | Running total after each round — ideal for a line chart |

**`achievements[]`** — only badges actually earned:

```json
[
  { "code": "CURRENT_LEADER",   "icon": "🏆", "label": "Current Leader",
    "playerId": 3, "name": "Monish",  "detail": "80 points" },
  { "code": "HIGHEST_ROUND",    "icon": "🔥", "label": "Highest Scoring Round",
    "playerId": 5, "name": "Karthik", "detail": "35 points in a single round" },
  { "code": "BIGGEST_COMEBACK", "icon": "📈", "label": "Biggest Comeback",
    "playerId": 5, "name": "Karthik", "detail": "Climbed from #5 to #3" },
  { "code": "MOST_IMPROVED",    "icon": "⚡", "label": "Most Improved",
    "playerId": 5, "name": "Karthik", "detail": "+30 points over the previous round" },
  { "code": "MOST_CONSISTENT",  "icon": "🎯", "label": "Most Consistent",
    "playerId": 3, "name": "Monish",  "detail": "Spread of only 4.71 points per round" },
  { "code": "LED_MOST_ROUNDS",  "icon": "👑", "label": "Led the Most Rounds",
    "playerId": 3, "name": "Monish",  "detail": "Top of the board after 3 rounds" }
]
```

Nothing is faked — before anyone has scored, this is `[]`. All achievements are
derived from points only, because the scoreboard does not know the game.

**`timeline[]`** — ready-to-display sentences:

```json
[
  { "round": 1, "type": "LEAD_TAKEN",    "leaderId": 3, "leaderName": "Monish",
    "playerIds": [3],    "message": "Monish takes the lead with 30 points." },
  { "round": 2, "type": "GAP_CLOSED",    "leaderId": 3, "leaderName": "Monish",
    "playerIds": [1, 3], "message": "Abhiram closes the gap to 5 points." },
  { "round": 3, "type": "LEAD_EXTENDED", "leaderId": 3, "leaderName": "Monish",
    "playerIds": [3],    "message": "Monish extends the lead to 15 points." }
]
```

Types: `LEAD_TAKEN`, `LEAD_CHANGE`, `LEAD_EXTENDED`, `GAP_CLOSED`, `LEAD_HELD`, `TIE_AT_TOP`.

### `GET /api/scoreboards/{id}/summary` → `200`

Compact roll-up — **the cheapest endpoint, use it for polling and for TTS lines.**

```json
{
  "success": true,
  "roundsPlayed": 3,
  "playerCount": 5,
  "totalPointsScored": 305,
  "leader": { "rank": 1, "playerId": 3, "name": "Monish", "score": 80, "roundsPlayed": 3 },
  "tie": false,
  "tiedPlayers": [],
  "scoreboard": { "id": 1, "status": "ACTIVE", "currentRound": 3, "...": "..." }
}
```

### `GET /api/scoreboards/{id}/achievements` → `200`

`{ "success": true, "achievements": [ ... ] }`

### `GET /api/scoreboards/{id}/timeline` → `200`

`{ "success": true, "timeline": [ ... ] }`

### `GET /api/scoreboards/{id}/analysis/players/{playerId}` → `200`

`{ "success": true, "player": { ...one entry from analysis.players... } }`

---

## Multi-device sync

There are no WebSockets in this build (deliberately — it stays within the agreed
stack). To keep several phones in sync, **poll**:

```js
setInterval(async () => {
  const summary = await api(`/api/scoreboards/${id}/summary`);
  updateHeader(summary.leader, summary.scoreboard.currentRound);
}, 3000);
```

Poll `/summary` (small) rather than `/analysis` (large). Stop polling once
`scoreboard.status === "ENDED"`.

---

## Full worked example

```bash
BASE=http://localhost:8080

# Create
curl -X POST $BASE/api/scoreboards \
  -H "Content-Type: application/json" -d '{"name":"Friday Night"}'

# Add players
curl -X POST $BASE/api/scoreboards/1/players \
  -H "Content-Type: application/json" -d '{"name":"Abhiram"}'
curl -X POST $BASE/api/scoreboards/1/players \
  -H "Content-Type: application/json" -d '{"name":"Monish"}'

# Start
curl -X POST $BASE/api/scoreboards/1/start

# Submit round 1
curl -X POST $BASE/api/scoreboards/1/rounds/1/scores \
  -H "Content-Type: application/json" \
  -d '{"scores":[{"playerId":1,"points":20},{"playerId":2,"points":30}]}'

# Next round
curl -X POST $BASE/api/scoreboards/1/rounds

# Reads
curl $BASE/api/scoreboards/1/leaderboard
curl $BASE/api/scoreboards/1/history
curl $BASE/api/scoreboards/1/analysis

# End and rematch
curl -X POST $BASE/api/scoreboards/1/end
curl -X POST $BASE/api/scoreboards/1/reset
```

Or run the whole thing at once: `./scripts/smoke_test.sh`
