"""Score submission - the transactional heart of the backend.

Owner: Person 5 (writes) + Person 6 (validation + transaction rules).

The whole flow, and the order matters:

    1. scoreboard exists?                      -> 404 SCOREBOARD_NOT_FOUND
    2. scoreboard ACTIVE?                      -> 409 SCOREBOARD_NOT_STARTED /
                                                      SCOREBOARD_ALREADY_ENDED
    3. round exists and belongs to it?         -> 404 / 409
    4. payload well-formed, points are ints?   -> 400 INVALID_SCORE
    5. no duplicate players inside payload?    -> 409 DUPLICATE_SCORE
    6. all players belong to the scoreboard?   -> 404 PLAYER_NOT_FOUND
    7. nobody already scored this round?       -> 409 DUPLICATE_SCORE
    8. --- only now --- BEGIN, insert all, COMMIT

Nothing is written until every check has passed.
"""

from database import database as db
from errors import ApiError, ROUND_ALREADY_SUBMITTED
from services import leaderboard_service, player_service, round_service, scoreboard_service
from validators import score_validator as sc
from validators import scoreboard_validator as sv


def submit_scores(scoreboard_id, round_id, body):
    """Record points for one round. All-or-nothing.

    Partial submissions are allowed on purpose: the UI's SUBMIT ROUND button
    sends everybody at once, but the voice layer ("Monish scored 25") will send
    one player at a time. Either way a player can only be scored once per
    round, and the round is not "complete" until everyone has an entry.
    """
    # --- 1 & 2: the scoreboard must exist and be ACTIVE -------------------
    scoreboard = scoreboard_service.get_scoreboard_row(scoreboard_id)
    sv.require_status(scoreboard, sv.ACTIVE, "submit scores")

    # --- 3: the round must be ours ---------------------------------------
    round_row = round_service.get_round_row(round_id)
    sc.require_round_in_scoreboard(round_row, scoreboard_id)

    # --- 4 & 5: payload shape, types, in-payload duplicates ---------------
    entries = sc.validate_payload(body)
    player_ids = [player_id for player_id, _ in entries]

    # --- 6: every player belongs to this scoreboard -----------------------
    players = player_service.list_players(scoreboard_id)
    sc.require_players_in_scoreboard(player_ids, players)

    # --- 7: nobody in this payload has already scored this round ----------
    already = round_service.scored_player_ids(round_id)
    if already and len(already) >= len(players):
        raise ApiError(
            ROUND_ALREADY_SUBMITTED,
            f"Round {round_row['round_number']} already has a score for every "
            f"player. Create the next round before submitting again.",
            409,
            details={"roundId": round_id, "roundNumber": round_row["round_number"]},
        )
    sc.require_not_already_scored(
        player_ids, already, {p["id"]: p["name"] for p in players}
    )

    # --- 8: one transaction, all rows or none -----------------------------
    with db.transaction() as connection:
        for player_id, points in entries:
            connection.execute(
                "INSERT INTO scores (round_id, player_id, points) VALUES (?, ?, ?)",
                (round_id, player_id, points),
            )

    # Return the updated standings so the UI needs exactly one request per
    # submit - no follow-up call to /leaderboard.
    leaderboard = leaderboard_service.get_leaderboard(scoreboard_id)
    missing = round_service.players_missing_scores(scoreboard_id, round_id)

    return {
        "roundId": round_id,
        "roundNumber": round_row["round_number"],
        "scoresRecorded": len(entries),
        "roundComplete": not missing,
        "missingPlayers": missing,
        "leaderboard": leaderboard,
    }


def get_scores(scoreboard_id):
    """Every score row of the scoreboard - the raw history feed."""
    scoreboard_service.get_scoreboard_row(scoreboard_id)

    rows = db.query_all(
        """SELECT s.id, s.points, s.created_at,
                  r.id AS round_id, r.round_number,
                  p.id AS player_id, p.name
             FROM scores s
             JOIN rounds  r ON r.id = s.round_id
             JOIN players p ON p.id = s.player_id
            WHERE r.scoreboard_id = ?
            ORDER BY r.round_number ASC, p.id ASC""",
        (scoreboard_id,),
    )

    return [
        {
            "id": row["id"],
            "roundId": row["round_id"],
            "roundNumber": row["round_number"],
            "playerId": row["player_id"],
            "name": row["name"],
            "points": row["points"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# ADDED for GameBoard: set / adjust one player's score in a round.
#
# The upstream contract only submits a round once, which fits a scoresheet
# perfectly. The running-total boards (Leaderboard, Scoreboard, Counter,
# Sports) need to correct a number or nudge it by a delta, over and over,
# which POST /scores rejects as DUPLICATE_SCORE by design.
#
# These write to the same `scores` table, so totals are still SUM() over the
# round-by-round history — nothing is cached and nothing can drift.
# ---------------------------------------------------------------------------
def set_score(scoreboard_id, round_id, player_id, points, mode="SET"):
    """Write a player's score for one round.

    mode SET    -> points becomes the value
    mode ADJUST -> points is added to whatever is already there
    """
    scoreboard = scoreboard_service.get_scoreboard_row(scoreboard_id)
    sv.require_status(scoreboard, sv.ACTIVE, "change a score")

    round_row = round_service.get_round_row(round_id)
    sc.require_round_in_scoreboard(round_row, scoreboard_id)

    players = player_service.list_players(scoreboard_id)
    sc.require_players_in_scoreboard([player_id], players)

    value = sc.validate_points(points)

    mode = (mode or "SET").upper()
    if mode not in ("SET", "ADJUST"):
        raise ApiError(
            "INVALID_REQUEST",
            "mode must be either 'SET' or 'ADJUST'.",
            400,
        )

    # One atomic UPSERT rather than SELECT-then-INSERT/UPDATE.
    #
    # Read-then-write raced: two writes to the same cell (a blur and an Enter,
    # or two quick +1 taps) both saw "no row yet", both INSERTed, and the second
    # hit UNIQUE(round_id, player_id) as a 500. Letting SQLite resolve the
    # conflict makes it race-free, and ADJUST becomes a real atomic increment,
    # so rapid taps can no longer lose an update either.
    if mode == "ADJUST":
        upsert = """
            INSERT INTO scores (round_id, player_id, points) VALUES (?, ?, ?)
            ON CONFLICT (round_id, player_id)
            DO UPDATE SET points = scores.points + excluded.points
        """
    else:
        upsert = """
            INSERT INTO scores (round_id, player_id, points) VALUES (?, ?, ?)
            ON CONFLICT (round_id, player_id)
            DO UPDATE SET points = excluded.points
        """

    with db.transaction() as connection:
        connection.execute(upsert, (round_id, player_id, value))
        row = connection.execute(
            "SELECT points FROM scores WHERE round_id = ? AND player_id = ?",
            (round_id, player_id),
        ).fetchone()
        value = row["points"]
        # Range-check the settled total. Raising in here rolls the write back.
        sc.validate_points(value, player_id)

    round_state = round_service.get_round_detail(scoreboard_id, round_id)
    return {
        "roundId": round_id,
        "roundNumber": round_row["round_number"],
        "playerId": player_id,
        "points": value,
        "roundComplete": round_state["complete"],
        "missingPlayers": round_state["missingPlayers"],
        "leaderboard": leaderboard_service.get_leaderboard(scoreboard_id),
    }
