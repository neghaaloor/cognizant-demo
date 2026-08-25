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


@bp.get("/<int:scoreboard_id>/scores")
def get_scores(scoreboard_id):
    return success({"scores": score_service.get_scores(scoreboard_id)})
