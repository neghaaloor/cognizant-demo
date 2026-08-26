"""Score endpoints.

Owner: Person 5 (route) + Person 6 (everything the service validates).

    POST /api/scoreboards/<id>/rounds/<roundId>/scores   submit a round
    GET  /api/scoreboards/<id>/scores                    raw score feed

Request body:

    {
      "scores": [
        {"playerId": 1, "points": 20},
        {"playerId": 2, "points": 15},
        {"playerId": 3, "points": 30}
      ]
    }

The response carries the refreshed leaderboard, so the UI updates the
standings from the same request that submitted the round.
"""

from flask import Blueprint, request

from errors import success
from services import score_service

bp = Blueprint("scores", __name__, url_prefix="/api/scoreboards")


@bp.post("/<int:scoreboard_id>/rounds/<int:round_id>/scores")
def submit_scores(scoreboard_id, round_id):
    body = request.get_json(silent=True) or {}
    result = score_service.submit_scores(scoreboard_id, round_id, body)
    return success(result, 201)


@bp.put("/<int:scoreboard_id>/rounds/<int:round_id>/scores/<int:player_id>")
def set_score(scoreboard_id, round_id, player_id):
    """Set or nudge one player's score. ADDED for GameBoard.

    Body: {"points": 25}                  -> that player now has 25
          {"points": 5, "mode": "ADJUST"} -> add 5 to whatever they had

    POST /scores is a one-shot round submission and refuses a second write for
    the same player. The running-total boards need to keep changing a number,
    so they use this instead. Same table, same SUM()-derived totals.
    """
    body = request.get_json(silent=True) or {}
    result = score_service.set_score(
        scoreboard_id, round_id, player_id, body.get("points"), body.get("mode")
    )
    return success(result)


@bp.get("/<int:scoreboard_id>/scores")
def get_scores(scoreboard_id):
    return success({"scores": score_service.get_scores(scoreboard_id)})
