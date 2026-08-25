"""Round management - Round 1, Round 2, ... within one scoreboard.

Owner: Person 5.
"""

from database import database as db
from errors import round_not_found
from services import player_service


def serialize(row):
    return {
        "id": row["id"],
        "scoreboardId": row["scoreboard_id"],
        "roundNumber": row["round_number"],
        "createdAt": row["created_at"],
    }


def list_rounds(scoreboard_id):
    rows = db.query_all(
        "SELECT * FROM rounds WHERE scoreboard_id = ? ORDER BY round_number ASC",
        (scoreboard_id,),
    )
    return [serialize(row) for row in rows]


def get_round_row(round_id):
    row = db.query_one("SELECT * FROM rounds WHERE id = ?", (round_id,))
    if row is None:
        raise round_not_found(round_id)
    return dict(row)


def get_round_by_number(scoreboard_id, round_number):
    """Returns None instead of raising - callers decide what a gap means."""
    row = db.query_one(
        "SELECT * FROM rounds WHERE scoreboard_id = ? AND round_number = ?",
        (scoreboard_id, round_number),
    )
    return dict(row) if row else None


def count_rounds(scoreboard_id):
    row = db.query_one(
        "SELECT COUNT(*) AS total FROM rounds WHERE scoreboard_id = ?",
        (scoreboard_id,),
    )
    return row["total"]


def create_next_round(scoreboard_id, current_round_number):
    """Open round N+1 and move the scoreboard's pointer to it.

    The caller (round_routes) has already checked that the scoreboard is
    ACTIVE and that the current round is complete.
    """
    next_number = current_round_number + 1

    with db.transaction() as connection:
        cursor = connection.execute(
            "INSERT INTO rounds (scoreboard_id, round_number) VALUES (?, ?)",
            (scoreboard_id, next_number),
        )
        connection.execute(
            "UPDATE scoreboards SET current_round = ? WHERE id = ?",
            (next_number, scoreboard_id),
        )
        new_round_id = cursor.lastrowid

    return serialize(get_round_row(new_round_id))


def scored_player_ids(round_id):
    """Who already has a score in this round."""
    rows = db.query_all("SELECT player_id FROM scores WHERE round_id = ?", (round_id,))
    return {row["player_id"] for row in rows}


def players_missing_scores(scoreboard_id, round_id):
    """Players on the scoreboard with no score row in this round yet.

    Empty list == the round is complete.
    """
    rows = db.query_all(
        """SELECT p.id, p.name
             FROM players p
            WHERE p.scoreboard_id = ?
              AND p.id NOT IN (SELECT player_id FROM scores WHERE round_id = ?)
            ORDER BY p.id ASC""",
        (scoreboard_id, round_id),
    )
    return [{"playerId": row["id"], "name": row["name"]} for row in rows]


def is_round_complete(scoreboard_id, round_id):
    return not players_missing_scores(scoreboard_id, round_id)


def get_round_detail(scoreboard_id, round_id):
    """One round with every player's entry - powers the round view / edit UI."""
    round_row = get_round_row(round_id)
    scores = db.query_all(
        """SELECT s.player_id, s.points, p.name
             FROM scores s
             JOIN players p ON p.id = s.player_id
            WHERE s.round_id = ?
            ORDER BY p.id ASC""",
        (round_id,),
    )
    detail = serialize(round_row)
    detail["scores"] = [
        {"playerId": row["player_id"], "name": row["name"], "points": row["points"]}
        for row in scores
    ]
    detail["missingPlayers"] = players_missing_scores(scoreboard_id, round_id)
    detail["complete"] = not detail["missingPlayers"]
    return detail


def get_history(scoreboard_id):
    """The full round-by-round grid the original requirement asks for.

        PLAYER    R1   R2   R3   TOTAL
        Abhiram   20   25   10     55

    Returns rounds as a list of numbers plus one entry per player holding
    that player's points per round (null where they have no entry) and the
    running total. The frontend renders it straight into a table.
    """
    rounds = list_rounds(scoreboard_id)
    players = player_service.list_players(scoreboard_id)

    rows = db.query_all(
        """SELECT r.round_number, s.player_id, s.points
             FROM rounds r
             JOIN scores s ON s.round_id = r.id
            WHERE r.scoreboard_id = ?
            ORDER BY r.round_number ASC""",
        (scoreboard_id,),
    )

    # {player_id: {round_number: points}}
    by_player = {player["id"]: {} for player in players}
    for row in rows:
        if row["player_id"] in by_player:
            by_player[row["player_id"]][row["round_number"]] = row["points"]

    round_numbers = [rnd["roundNumber"] for rnd in rounds]

    history = []
    for player in players:
        points_by_round = by_player[player["id"]]
        per_round = [points_by_round.get(number) for number in round_numbers]
        history.append(
            {
                "playerId": player["id"],
                "name": player["name"],
                # index i corresponds to rounds[i]
                "rounds": per_round,
                "total": sum(value for value in per_round if value is not None),
            }
        )

    # Highest total first, so the table reads like the leaderboard.
    history.sort(key=lambda entry: entry["total"], reverse=True)

    return {
        "rounds": [
            {
                "roundId": rnd["id"],
                "roundNumber": rnd["roundNumber"],
                "complete": is_round_complete(scoreboard_id, rnd["id"]),
            }
            for rnd in rounds
        ],
        "roundNumbers": round_numbers,
        "players": history,
    }
