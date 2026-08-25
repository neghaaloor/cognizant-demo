"""Scoreboard lifecycle: create, read, start, end, reset.

Owner: Person 5 (data access) with the rules enforced by Person 6's validators.
"""

from database import database as db
from errors import ApiError, ROUND_INCOMPLETE, scoreboard_not_found
from services import leaderboard_service, player_service, round_service
from validators import scoreboard_validator as sv


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
def get_scoreboard_row(scoreboard_id):
    """Raw row, or 404. Every other service starts by calling this."""
    row = db.query_one("SELECT * FROM scoreboards WHERE id = ?", (scoreboard_id,))
    if row is None:
        raise scoreboard_not_found(scoreboard_id)
    return dict(row)


def serialize(row, players=None):
    """The scoreboard shape the frontend receives everywhere."""
    payload = {
        "id": row["id"],
        "name": row["name"],
        "status": row["status"],
        "currentRound": row["current_round"],
        "winnerId": row["winner_id"],
        "createdAt": row["created_at"],
        "startedAt": row["started_at"],
        "endedAt": row["ended_at"],
    }
    if players is not None:
        payload["players"] = players
        payload["playerCount"] = len(players)
    return payload


def get_scoreboard(scoreboard_id):
    """Scoreboard + its players - what GET /api/scoreboards/{id} returns."""
    row = get_scoreboard_row(scoreboard_id)
    players = player_service.list_players(scoreboard_id)
    return serialize(row, players)


def list_scoreboards(limit=50):
    """Convenience listing. Handy for the team while testing with curl."""
    rows = db.query_all(
        "SELECT * FROM scoreboards ORDER BY created_at DESC, id DESC LIMIT ?",
        (limit,),
    )
    return [serialize(dict(row)) for row in rows]


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------
def create_scoreboard(name):
    """A new session always begins in SETUP with round 0 and no players."""
    clean_name = sv.validate_name(name)
    cursor = db.execute(
        "INSERT INTO scoreboards (name, status, current_round) VALUES (?, 'SETUP', 0)",
        (clean_name,),
    )
    return get_scoreboard(cursor.lastrowid)


def start_scoreboard(scoreboard_id):
    """SETUP -> ACTIVE. Locks the roster and opens Round 1.

        check exists -> check SETUP -> check >=1 player
        -> status ACTIVE -> current_round 1 -> create Round 1
    """
    row = get_scoreboard_row(scoreboard_id)
    sv.require_status(row, sv.SETUP, "start the scoreboard")

    players = player_service.list_players(scoreboard_id)
    sv.require_players(players)

    with db.transaction() as connection:
        connection.execute(
            """UPDATE scoreboards
                  SET status = 'ACTIVE',
                      current_round = 1,
                      started_at = CURRENT_TIMESTAMP
                WHERE id = ?""",
            (scoreboard_id,),
        )
        connection.execute(
            "INSERT INTO rounds (scoreboard_id, round_number) VALUES (?, 1)",
            (scoreboard_id,),
        )

    scoreboard = get_scoreboard(scoreboard_id)
    scoreboard["currentRoundId"] = round_service.get_round_by_number(
        scoreboard_id, 1
    )["id"]
    return scoreboard


def end_scoreboard(scoreboard_id):
    """ACTIVE -> ENDED. Computes the winner and freezes everything.

    Tie handling (section 29): a generic scoreboard must NOT invent a
    tie-breaker, because it does not know the rules of the physical game.
    On a tie we return winner=null, tie=true and the list of tied players.
    """
    row = get_scoreboard_row(scoreboard_id)
    sv.require_status(row, sv.ACTIVE, "end the scoreboard")

    leaderboard = leaderboard_service.get_leaderboard(scoreboard_id)
    result = leaderboard_service.determine_winner(leaderboard)

    with db.transaction() as connection:
        connection.execute(
            """UPDATE scoreboards
                  SET status = 'ENDED',
                      ended_at = CURRENT_TIMESTAMP,
                      winner_id = ?
                WHERE id = ?""",
            # winner_id stays NULL on a draw - that is the honest answer.
            (result["winner"]["playerId"] if result["winner"] else None, scoreboard_id),
        )

    return {
        "scoreboard": get_scoreboard(scoreboard_id),
        "leaderboard": leaderboard,
        "winner": result["winner"],
        "tie": result["tie"],
        "tiedPlayers": result["tiedPlayers"],
        "roundsPlayed": round_service.count_rounds(scoreboard_id),
    }


def reset_scoreboard(scoreboard_id, mode="REMATCH"):
    """Quick reset - clear the scores, KEEP the players (the original ask).

    Two modes, because "rematch" can mean two reasonable things:

      REMATCH (default) : straight back to ACTIVE on a fresh Round 1.
                          Same players, deal again.
      SETUP             : back to SETUP so the roster can be edited first
                          (somebody left, somebody new joined).

    Deleting the rounds cascades to the scores, so one DELETE clears the whole
    history. winner_id is cleared first to avoid pointing at a stale result.
    """
    row = get_scoreboard_row(scoreboard_id)
    mode = (mode or "REMATCH").upper()
    if mode not in ("REMATCH", "SETUP"):
        raise ApiError(
            "INVALID_REQUEST",
            "reset mode must be either 'REMATCH' or 'SETUP'.",
            400,
        )

    players = player_service.list_players(scoreboard_id)
    if mode == "REMATCH":
        sv.require_players(players)

    with db.transaction() as connection:
        connection.execute(
            "UPDATE scoreboards SET winner_id = NULL WHERE id = ?", (scoreboard_id,)
        )
        # ON DELETE CASCADE removes every score attached to these rounds.
        connection.execute(
            "DELETE FROM rounds WHERE scoreboard_id = ?", (scoreboard_id,)
        )

        if mode == "REMATCH":
            connection.execute(
                """UPDATE scoreboards
                      SET status = 'ACTIVE',
                          current_round = 1,
                          started_at = CURRENT_TIMESTAMP,
                          ended_at = NULL
                    WHERE id = ?""",
                (scoreboard_id,),
            )
            connection.execute(
                "INSERT INTO rounds (scoreboard_id, round_number) VALUES (?, 1)",
                (scoreboard_id,),
            )
        else:
            connection.execute(
                """UPDATE scoreboards
                      SET status = 'SETUP',
                          current_round = 0,
                          started_at = NULL,
                          ended_at = NULL
                    WHERE id = ?""",
                (scoreboard_id,),
            )

    scoreboard = get_scoreboard(scoreboard_id)
    scoreboard["resetMode"] = mode
    if mode == "REMATCH":
        scoreboard["currentRoundId"] = round_service.get_round_by_number(
            scoreboard_id, 1
        )["id"]
    return scoreboard


def delete_scoreboard(scoreboard_id):
    """Cascades to players -> rounds -> scores. Mostly a test/cleanup helper."""
    get_scoreboard_row(scoreboard_id)
    db.execute("DELETE FROM scoreboards WHERE id = ?", (scoreboard_id,))
    return {"deletedScoreboardId": scoreboard_id}


# ---------------------------------------------------------------------------
# Shared rule used by round creation
# ---------------------------------------------------------------------------
def require_current_round_complete(scoreboard_id, current_round_number):
    """A round is COMPLETE when every player on the scoreboard has a score.

    This is what stops Round 4 opening while three people still have no entry
    for Round 3 - which would silently corrupt the history table.
    """
    if current_round_number < 1:
        return

    round_row = round_service.get_round_by_number(scoreboard_id, current_round_number)
    if round_row is None:
        return

    missing = round_service.players_missing_scores(scoreboard_id, round_row["id"])
    if missing:
        raise ApiError(
            ROUND_INCOMPLETE,
            f"Round {current_round_number} is not finished yet. Still missing: "
            f"{', '.join(player['name'] for player in missing)}.",
            409,
            details={
                "roundNumber": current_round_number,
                "roundId": round_row["id"],
                "missingPlayers": missing,
            },
        )
