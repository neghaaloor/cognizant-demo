# Troubleshooting

## The golden rule: debug in layer order

```
USER  →  FRONTEND  →  HTTP REQUEST  →  CLOUD RUN  →  FLASK  →  SQL  →  SQLITE
```

**Never assume the database is broken first.** In an 8-person project the cause
is almost always higher up: a wrong URL, a CORS header, or the scoreboard being
in the wrong state.

### Step 1 — always start here

```bash
curl https://YOUR-URL.run.app/health
```

```json
{ "status": "ok", "server": "running", "database": "connected" }
```

This runs a real `SELECT 1` against SQLite, so a green `/health` proves **Cloud
Run + Flask + SQLite are all fine**.

| `/health` result | What it means | Who owns it |
|---|---|---|
| `200` + `"connected"` | Backend is healthy — your problem is in the frontend request or CORS | Person 1/2 |
| `503` + `"error: ..."` | Flask is up, SQLite is not | Person 8 + Person 7 |
| No response / timeout | Cloud Run is not serving | Person 7 |
| Connection refused locally | Server isn't running | You |

### Step 2 — DevTools (F12) → Network

Find the failing request and check, in this order:

1. **Request URL** — is it the right base URL? A trailing slash or `http` vs
   `https` mismatch will fail.
2. **Status code** — see the table below.
3. **Request payload** — is it the shape in `API_CONTRACT.md`? Is
   `Content-Type: application/json` set?
4. **Response body** — the backend always explains itself in `error` + `message`.
5. **Console** — a CORS message means the request never reached your code.

### Step 3 — the logs

```bash
gcloud beta run services logs tail scorekeeper --region asia-south1
```

Every response carries an `X-Request-Id` header matching `jsonPayload.request_id`
in the logs. Copy it from DevTools and search:

```
jsonPayload.request_id="a1b2c3d4"
```

---

## Symptom → cause

### "The frontend can't reach the backend"

| Check | Fix |
|---|---|
| Is `/health` green? | If yes, the backend is fine — keep reading |
| Is `API_BASE` correct in your JS? | Cloud Run URL, `https`, no trailing slash |
| CORS error in the console? | See below |
| Server actually running locally? | `python backend/app.py` |
| Wrong port? | Local default is `8080` |

### CORS errors

```
Access to fetch at '...' has been blocked by CORS policy
```

The request never reached your Python code — the browser blocked it.

1. Set the frontend origin on the backend:
   ```bash
   gcloud run services update scorekeeper --region asia-south1 \
     --set-env-vars "CORS_ORIGINS=https://your-frontend-origin"
   ```
   Locally: `CORS_ORIGINS=* python backend/app.py`
2. `CORS_ORIGINS` must match the origin **exactly** — scheme, host and port,
   nothing more. `http://localhost:5500` ≠ `http://127.0.0.1:5500`.
3. Confirm the header is coming back:
   ```bash
   curl -I -X OPTIONS https://YOUR-URL.run.app/api/scoreboards \
     -H "Origin: https://your-frontend-origin"
   ```

> **`curl` works but the browser doesn't** — that is CORS, essentially always.
> `curl` doesn't enforce it.

### `400` — Invalid request

| `error` | Cause |
|---|---|
| `INVALID_JSON` | Body isn't valid JSON, or `Content-Type` is missing |
| `INVALID_REQUEST` | A required field is missing (`scores`, `playerId`, `points`) |
| `INVALID_SCORE` | Points aren't a whole number. `20.5`, `true`, `"abc"` are rejected; `"25"` is fine |
| `INVALID_PLAYER_NAME` | Empty or whitespace-only name |
| `EMPTY_SCORES` | `scores: []` |

```js
// Common mistake — missing header, so Flask won't parse the body
fetch(url, { method: "POST", body: JSON.stringify(data) });                    // ✗
fetch(url, { method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(data) });                                    // ✓
```

### `404` — Not found

| `error` | Cause |
|---|---|
| `NOT_FOUND` | The route doesn't exist — check the path against `API_CONTRACT.md` |
| `SCOREBOARD_NOT_FOUND` | Wrong id, or the instance restarted and wiped `/tmp` |
| `PLAYER_NOT_FOUND` | Player id belongs to a different scoreboard |
| `ROUND_NOT_FOUND` | Round id doesn't exist |

> If **every** scoreboard is suddenly a 404, the Cloud Run instance recycled and
> `/tmp` was wiped. Create a new scoreboard — this is the known SQLite trade-off.

### `409` — Conflict (you are in the wrong state)

**This is the most common confusing error, and it is almost never a bug.**

```bash
curl $BASE/api/scoreboards/1     # look at "status"
```

| `error` | Meaning | Fix |
|---|---|---|
| `SCOREBOARD_NOT_STARTED` | Scoring before start | `POST /start` first |
| `SCOREBOARD_ALREADY_STARTED` | Roster change after start | Hide those buttons when `ACTIVE` |
| `SCOREBOARD_ALREADY_ENDED` | Writing to a finished game | `POST /reset` to play again |
| `PLAYERS_LOCKED` | Add/remove after start | By design — the roster locks at start |
| `NO_PLAYERS` | Start with an empty roster | Add someone first |
| `DUPLICATE_PLAYER` | Name taken (case-insensitive) | "rahul" clashes with "Rahul" |
| `DUPLICATE_SCORE` | Player already scored this round | Create the next round |
| `ROUND_ALREADY_SUBMITTED` | Every player already scored | `POST /rounds` for the next one |
| `ROUND_INCOMPLETE` | Next round before finishing this one | Read `details.missingPlayers` |
| `ROUND_NOT_IN_SCOREBOARD` | Round belongs to another scoreboard | You cached a stale `roundId` |

> **Stale `roundId` is a classic.** After `POST /rounds`, refresh from
> `GET /rounds/current` — don't keep using the old one.

### `500` — Server error

Follow: `500` → Cloud Logging → backend exception → the query → the input data.

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" severity>=ERROR' --limit 20 --freshness 1h
```

The response includes a `requestId`; search `jsonPayload.request_id="..."` for
the stack trace. `INTERNAL_ERROR` → Person 5/6. `DATABASE_ERROR` → Person 8.

### Scores disappear at random

**Cause:** more than one Cloud Run instance. Each has its own SQLite file.

```bash
gcloud run services update scorekeeper --region asia-south1 --max-instances 1
```

See [DEPLOYMENT.md §3](DEPLOYMENT.md#3---max-instances-1-is-mandatory).

### Everything vanished after a while

`/tmp` is in-memory and is wiped when the instance recycles. Expected on Cloud
Run with SQLite. Start a fresh scoreboard.

### Leaderboard looks wrong

It is computed as `SUM(points)` at read time, so it cannot drift. Check the raw data:

```bash
curl $BASE/api/scoreboards/1/scores     # every score row
curl $BASE/api/scoreboards/1/history    # the grid
```

Two things that look like bugs but aren't:

- **Ties share a rank and skip the next**: `1, 2, 2, 4` is correct.
- **Players with no scores appear on 0** — that is deliberate, so nobody vanishes
  from the board.

If the numbers are right in `/scores` but wrong on screen, the UI is re-sorting
or re-totalling locally. **Don't** — render `/leaderboard` as given.

### Locally: `ModuleNotFoundError: No module named 'flask'`

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### Locally: "database is locked"

Two processes are writing to the same file. Stop the extra server:

```bash
pkill -f "backend/app.py"
```

### Tests pass but the API misbehaves

Tests use a fresh database each run; your local file has old data. Reset it:

```bash
rm -f backend/data/scorekeeper.db*
python backend/app.py        # schema is recreated on boot
```

---

## Inspect the database directly

```bash
sqlite3 backend/data/scorekeeper.db
```

```sql
.tables
SELECT id, name, status, current_round FROM scoreboards;
SELECT * FROM players WHERE scoreboard_id = 1;

-- Compute the leaderboard by hand to compare with the API
SELECT p.name, COALESCE(SUM(s.points), 0) AS total
  FROM players p LEFT JOIN scores s ON s.player_id = p.id
 WHERE p.scoreboard_id = 1
 GROUP BY p.id ORDER BY total DESC;

-- Foreign keys must be ON, or cascades silently do nothing
PRAGMA foreign_keys;      -- expect 1
```

---

## Who owns what

| Problem | Person |
|---|---|
| Cloud Run, deploy, IAM, CORS config, logs | 7 |
| Backend exception, validation, API behaviour | 5 / 6 |
| SQL, schema, constraints | 8 |
| Request shape, UI state, rendering | 1 / 2 |
| Voice commands | 3 |
| Analysis rendering | 4 |

**Include these three things when reporting a problem**, or you'll be asked for
them anyway:

1. The **request** — method, full URL, body
2. The **response** — status code and the full JSON (`error` code included)
3. The **`X-Request-Id`** header from DevTools
