"""Scoreboard endpoints.

Owner: Person 5.

    POST   /api/scoreboards                 create (status SETUP)
    GET    /api/scoreboards                 list (testing convenience)
    GET    /api/scoreboards/<id>            scoreboard + players
    POST   /api/scoreboards/<id>/start      SETUP  -> ACTIVE, opens Round 1
    POST   /api/scoreboards/<id>/end        ACTIVE -> ENDED, decides the winner
    POST   /api/scoreboards/<id>/reset      clear scores, keep players
    GET    /api/scoreboards/<id>/leaderboard
    GET    /api/scoreboards/<id>/history
    DELETE /api/scoreboards/<id>            delete everything (cleanup)
"""

from flask import Blueprint, request

from errors import success
from services import leaderboard_service, round_service, scoreboard_service

bp = Blueprint("scoreboards", __name__, url_prefix="/api/scoreboards")


def _json_body():
    """Tolerate an absent / empty body - several of these endpoints need none."""
    return request.get_json(silent=True) or {}


@bp.post("")
@bp.post("/")
def create_scoreboard():
    body = _json_body()
    scoreboard = scoreboard_service.create_scoreboard(body.get("name"))
    return success({"scoreboard": scoreboard}, 201)


@bp.get("")
@bp.get("/")
def list_scoreboards():
    limit = request.args.get("limit", default=50, type=int)
    return success({"scoreboards": scoreboard_service.list_scoreboards(limit)})


@bp.get("/<int:scoreboard_id>")
def get_scoreboard(scoreboard_id):
    return success({"scoreboard": scoreboard_service.get_scoreboard(scoreboard_id)})


@bp.post("/<int:scoreboard_id>/start")
def start_scoreboard(scoreboard_id):
    """Locks the roster and creates Round 1 in one transaction."""
    return success({"scoreboard": scoreboard_service.start_scoreboard(scoreboard_id)})


@bp.post("/<int:scoreboard_id>/end")
def end_scoreboard(scoreboard_id):
    """Returns winner OR tie: true with the tied players - never a fake winner."""
    return success(scoreboard_service.end_scoreboard(scoreboard_id))


@bp.post("/<int:scoreboard_id>/reset")
def reset_scoreboard(scoreboard_id):
    """Quick reset / rematch.

    Body (optional): {"mode": "REMATCH"}  -> straight back to ACTIVE, Round 1
                     {"mode": "SETUP"}    -> back to SETUP so the roster can
                                             be edited first
    """
    mode = _json_body().get("mode", "REMATCH")
    return success({"scoreboard": scoreboard_service.reset_scoreboard(scoreboard_id, mode)})


@bp.get("/<int:scoreboard_id>/leaderboard")
def get_leaderboard(scoreboard_id):
    scoreboard_service.get_scoreboard_row(scoreboard_id)  # 404 if unknown
    return success(
        {"leaderboard": leaderboard_service.get_leaderboard(scoreboard_id)}
    )


@bp.get("/<int:scoreboard_id>/history")
def get_history(scoreboard_id):
    """The R1 / R2 / R3 / TOTAL grid required by the original use case."""
    scoreboard_service.get_scoreboard_row(scoreboard_id)
    return success({"history": round_service.get_history(scoreboard_id)})


@bp.delete("/<int:scoreboard_id>")
def delete_scoreboard(scoreboard_id):
    return success(scoreboard_service.delete_scoreboard(scoreboard_id))
