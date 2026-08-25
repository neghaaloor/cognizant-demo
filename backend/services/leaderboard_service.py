"""Totals, ranking and winner determination.

Owner: Person 5, tie rules from Person 6.

THE key rule (section 15 of the spec): totals are always derived with SUM()
over the `scores` table. We never keep a `total_score` column, so a stored
total can never disagree with the history the users can see.
"""

from database import database as db

# LEFT JOIN so a player with no scores yet shows up with 0 rather than
# vanishing from the leaderboard.
_TOTALS_SQL = """
    SELECT p.id            AS player_id,
           p.name          AS name,
           COALESCE(SUM(s.points), 0) AS total_score,
           COUNT(s.id)     AS rounds_played
      FROM players p
      LEFT JOIN scores s ON s.player_id = p.id
     WHERE p.scoreboard_id = ?
     GROUP BY p.id, p.name
     ORDER BY total_score DESC, p.id ASC
"""


def get_totals(scoreboard_id):
    rows = db.query_all(_TOTALS_SQL, (scoreboard_id,))
    return [
        {
            "playerId": row["player_id"],
            "name": row["name"],
            "score": row["total_score"],
            "roundsPlayed": row["rounds_played"],
        }
        for row in rows
    ]


def assign_ranks(entries):
    """Standard competition ranking: 1, 2, 2, 4.

    Two players tied on 80 both get rank 2, and the next player gets rank 4.
    `entries` must already be sorted highest score first.
    """
    ranked = []
    previous_score = None
    previous_rank = 0

    for index, entry in enumerate(entries, start=1):
        if previous_score is not None and entry["score"] == previous_score:
            rank = previous_rank  # tie - share the rank
        else:
            rank = index
            previous_rank = rank
            previous_score = entry["score"]

        item = dict(entry)
        item["rank"] = rank
        ranked.append(item)

    return ranked


def get_leaderboard(scoreboard_id):
    """Sorted, ranked standings - the authoritative version of the truth.

    The frontend re-orders its rows from this; it must not compute its own
    totals from local state.
    """
    return assign_ranks(get_totals(scoreboard_id))


def determine_winner(leaderboard):
    """Who won - or honestly report a draw.

    Section 29: a game-agnostic scoreboard must NOT invent a tie-breaker. We
    do not know whether the physical game breaks ties by cards held, by time,
    or by a coin flip. So on a tie we return winner=null and name everyone who
    is level at the top; the UI shows "DRAW".

    Note we take the HIGHEST score as the win condition. Golf-style
    lowest-wins games are out of scope for this build.
    """
    if not leaderboard:
        return {"winner": None, "tie": False, "tiedPlayers": []}

    top_score = leaderboard[0]["score"]
    leaders = [entry for entry in leaderboard if entry["score"] == top_score]

    if len(leaders) > 1:
        return {"winner": None, "tie": True, "tiedPlayers": leaders}

    return {"winner": leaders[0], "tie": False, "tiedPlayers": []}


def get_cumulative_by_round(scoreboard_id):
    """Running totals after each round - the input for analysis and timeline.

    Returns:
        {
          "roundNumbers": [1, 2, 3],
          "players": {
              player_id: {
                  "name": "Monish",
                  "perRound":    [30, 20, 30],   # None where no entry
                  "cumulative":  [30, 50, 80],
              }
          }
        }
    """
    rounds = db.query_all(
        "SELECT id, round_number FROM rounds WHERE scoreboard_id = ? "
        "ORDER BY round_number ASC",
        (scoreboard_id,),
    )
    round_numbers = [row["round_number"] for row in rounds]

    players = db.query_all(
        "SELECT id, name FROM players WHERE scoreboard_id = ? ORDER BY id ASC",
        (scoreboard_id,),
    )

    score_rows = db.query_all(
        """SELECT r.round_number, s.player_id, s.points
             FROM rounds r
             JOIN scores s ON s.round_id = r.id
            WHERE r.scoreboard_id = ?""",
        (scoreboard_id,),
    )

    lookup = {}
    for row in score_rows:
        lookup[(row["player_id"], row["round_number"])] = row["points"]

    result = {}
    for player in players:
        per_round = []
        cumulative = []
        running = 0
        for number in round_numbers:
            points = lookup.get((player["id"], number))
            per_round.append(points)
            running += points or 0
            cumulative.append(running)

        result[player["id"]] = {
            "name": player["name"],
            "perRound": per_round,
            "cumulative": cumulative,
        }

    return {"roundNumbers": round_numbers, "players": result}
