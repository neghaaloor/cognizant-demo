"""Tournaments: a roster playing a series of boards.

ADDED for GameBoard.

A tournament stores only a name, a roster and a board type. Every game inside
it is an ordinary scoreboard carrying `tournament_id`, so the standings are
computed from the same `scores` rows the individual boards use. Nothing is
totalled twice, and a tournament table can never drift away from its games.

Like scoreboards, tournaments belong to an account and are invisible to every
other one.
"""

import json

import auth
from database import database as db
from errors import ApiError
from services import leaderboard_service, player_service, scoreboard_service

TOURNAMENT_NOT_FOUND = "TOURNAMENT_NOT_FOUND"
INVALID_TOURNAMENT = "INVALID_TOURNAMENT"

MIN_PLAYERS = 2
MAX_PLAYERS = 50


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def _clean_name(raw):
    if not isinstance(raw, str) or not raw.strip():
        raise ApiError(INVALID_TOURNAMENT, "A tournament needs a name.", 400)
    name = " ".join(raw.split())
    if len(name) > 80:
        raise ApiError(INVALID_TOURNAMENT, "That name is too long (max 80).", 400)
    return name


def _clean_roster(raw):
    """Trim, drop blanks, reject duplicates case-insensitively."""
    if not isinstance(raw, list):
        raise ApiError(INVALID_TOURNAMENT, "Players must be a list of names.", 400)

    roster, seen = [], set()
    for entry in raw:
        name = entry.get("name") if isinstance(entry, dict) else entry
        if not isinstance(name, str):
            continue
        name = " ".join(name.split())
        if not name:
            continue
        key = name.lower()
        if key in seen:
            raise ApiError(
                INVALID_TOURNAMENT,
                f"'{name}' is listed twice — every player needs a distinct name.",
                409,
            )
        seen.add(key)
        roster.append(name)

    if len(roster) < MIN_PLAYERS:
        raise ApiError(
            INVALID_TOURNAMENT,
            f"A tournament needs at least {MIN_PLAYERS} players.",
            400,
        )
    if len(roster) > MAX_PLAYERS:
        raise ApiError(
            INVALID_TOURNAMENT, f"That is more than {MAX_PLAYERS} players.", 409
        )
    return roster


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
def _row(tournament_id):
    owner_id = auth.require_user_id()
    row = db.query_one(
        "SELECT * FROM tournaments WHERE id = ? AND owner_id = ?",
        (tournament_id, owner_id),
    )
    if row is None:
        # 404 rather than 403 — we do not confirm other people's tournaments exist.
        raise ApiError(
            TOURNAMENT_NOT_FOUND, f"Tournament {tournament_id} does not exist.", 404
        )
    return dict(row)


def _games_of(tournament_id):
    rows = db.query_all(
        """SELECT * FROM scoreboards
            WHERE tournament_id = ?
         ORDER BY created_at ASC, id ASC""",
        (tournament_id,),
    )
    return [dict(row) for row in rows]


def serialize(row, games=None):
    payload = {
        "id": row["id"],
        "name": row["name"],
        "boardId": row["board_id"],
        "boardName": row["board_name"],
        "players": json.loads(row["players"] or "[]"),
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
    if games is not None:
        payload["games"] = games
        payload["gameCount"] = len(games)
    return payload


def _standings(tournament_id, roster):
    """Aggregate every game in the tournament, by player name.

    Players are per-scoreboard rows, so the name is what identifies someone
    across games. Everyone on the roster appears, including people who have not
    played yet — a table that hides them is a table that lies.
    """
    table = {
        name: {
            "name": name,
            "points": 0,
            "gamesPlayed": 0,
            "wins": 0,
            "best": None,
        }
        for name in roster
    }

    for game in _games_of(tournament_id):
        leaderboard = leaderboard_service.get_leaderboard(game["id"])
        if not leaderboard:
            continue

        finished = game["status"] == "ENDED"
        top_score = leaderboard[0]["score"]
        # A shared top score is a draw: nobody takes the win.
        winners = [r["name"] for r in leaderboard if r["score"] == top_score]
        outright = winners[0] if finished and len(winners) == 1 else None

        for entry in leaderboard:
            name = entry["name"]
            row = table.setdefault(
                name,
                {"name": name, "points": 0, "gamesPlayed": 0, "wins": 0, "best": None},
            )
            row["points"] += entry["score"]
            row["gamesPlayed"] += 1
            if row["best"] is None or entry["score"] > row["best"]:
                row["best"] = entry["score"]
            if outright == name:
                row["wins"] += 1

    standings = sorted(
        table.values(),
        key=lambda r: (-r["points"], -r["wins"], r["name"].lower()),
    )

    # Ties share a rank and skip the next, matching the leaderboard's rule.
    rank = 0
    previous = None
    for index, row in enumerate(standings, start=1):
        key = (row["points"], row["wins"])
        if key != previous:
            rank = index
            previous = key
        row["rank"] = rank

    return standings


def get_tournament(tournament_id):
    row = _row(tournament_id)
    roster = json.loads(row["players"] or "[]")

    games = []
    for game in _games_of(tournament_id):
        leaderboard = leaderboard_service.get_leaderboard(game["id"])
        games.append(
            {
                "id": game["id"],
                "name": game["name"],
                "status": game["status"],
                "boardId": game["board_id"],
                "createdAt": game["created_at"],
                "leaderboard": leaderboard,
                "winner": (
                    leaderboard[0]["name"]
                    if game["status"] == "ENDED"
                    and leaderboard
                    and len(
                        [r for r in leaderboard if r["score"] == leaderboard[0]["score"]]
                    )
                    == 1
                    else None
                ),
            }
        )

    payload = serialize(row, games)
    payload["standings"] = _standings(tournament_id, roster)
    return payload


def list_tournaments():
    owner_id = auth.require_user_id()
    rows = db.query_all(
        """SELECT * FROM tournaments
            WHERE owner_id = ?
         ORDER BY created_at DESC, id DESC""",
        (owner_id,),
    )

    result = []
    for row in rows:
        row = dict(row)
        roster = json.loads(row["players"] or "[]")
        games = _games_of(row["id"])
        payload = serialize(row, [{"id": g["id"], "status": g["status"]} for g in games])
        payload["standings"] = _standings(row["id"], roster)
        result.append(payload)
    return result


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------
def create_tournament(name, board_id, board_name, players):
    owner_id = auth.require_user_id()
    clean_name = _clean_name(name)
    roster = _clean_roster(players)

    cursor = db.execute(
        """INSERT INTO tournaments (owner_id, name, board_id, board_name, players)
           VALUES (?, ?, ?, ?, ?)""",
        (
            owner_id,
            clean_name,
            board_id or "scoresheet",
            board_name,
            json.dumps(roster),
        ),
    )
    return get_tournament(cursor.lastrowid)


def delete_tournament(tournament_id):
    _row(tournament_id)  # ownership check
    owner_id = auth.require_user_id()
    # Games survive on their own; they simply stop belonging to a tournament.
    changes = db.execute(
        "DELETE FROM tournaments WHERE id = ? AND owner_id = ?",
        (tournament_id, owner_id),
    ).changes
    return {"deleted": changes > 0}


def set_status(tournament_id, status):
    _row(tournament_id)
    status = (status or "").upper()
    if status not in ("ACTIVE", "ENDED"):
        raise ApiError(INVALID_TOURNAMENT, "status must be ACTIVE or ENDED.", 400)
    db.execute(
        "UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, tournament_id),
    )
    return get_tournament(tournament_id)


def add_game(tournament_id, name=None):
    """Open the next game: a normal board, pre-filled with the roster.

    It is created and started here so the caller can score it immediately —
    the roster is fixed by the tournament, so there is nothing to add in SETUP.
    """
    row = _row(tournament_id)
    if row["status"] == "ENDED":
        raise ApiError(
            INVALID_TOURNAMENT, "This tournament has finished.", 409
        )

    roster = json.loads(row["players"] or "[]")
    played = len(_games_of(tournament_id))

    board = scoreboard_service.create_scoreboard(
        name or f"{row['name']} — Game {played + 1}",
        board_id=row["board_id"],
        board_name=row["board_name"],
        config={},
    )

    db.execute(
        "UPDATE scoreboards SET tournament_id = ? WHERE id = ?",
        (tournament_id, board["id"]),
    )

    board_row = scoreboard_service.get_scoreboard_row(board["id"])
    for player_name in roster:
        player_service.add_player(board_row, player_name)

    started = scoreboard_service.start_scoreboard(board["id"])
    db.execute(
        "UPDATE tournaments SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (tournament_id,),
    )
    return started
