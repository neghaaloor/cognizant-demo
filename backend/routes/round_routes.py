"""Round endpoints.

Owner: Person 5, gate conditions from Person 6.

    GET  /api/scoreboards/<id>/rounds              list all rounds
    POST /api/scoreboards/<id>/rounds              open the next round
    GET  /api/scoreboards/<id>/rounds/current      the round being played now
    GET  /api/scoreboards/<id>/rounds/<roundId>    one round in detail
"""

from flask import Blueprint

from errors import success, round_not_found
from services import round_service, scoreboard_service
from validators import scoreboard_validator as sv

bp = Blueprint("rounds", __name__, url_prefix="/api/scoreboards")


@bp.get("/<int:scoreboard_id>/rounds")
def list_rounds(scoreboard_id):
    scoreboard_service.get_scoreboard_row(scoreboard_id)
    return success({"rounds": round_service.list_rounds(scoreboard_id)})


@bp.post("/<int:scoreboard_id>/rounds")
def create_round(scoreboard_id):
    """Open Round N+1.

        scoreboard exists -> status ACTIVE -> current round complete
        -> insert round N+1 -> current_round = N+1

    The completeness check is what keeps the history grid rectangular: no
    round can start while somebody still has no entry in the previous one.
    """
    scoreboard = scoreboard_service.get_scoreboard_row(scoreboard_id)
    sv.require_status(scoreboard, sv.ACTIVE, "create a round")

    scoreboard_service.require_current_round_complete(
        scoreboard_id, scoreboard["current_round"]
    )

    new_round = round_service.create_next_round(
        scoreboard_id, scoreboard["current_round"]
    )
    return success({"round": new_round}, 201)


@bp.get("/<int:scoreboard_id>/rounds/current")
def get_current_round(scoreboard_id):
    """Whatever round the players are filling in right now.

    Returns round: null while the scoreboard is still in SETUP.
    """
    scoreboard = scoreboard_service.get_scoreboard_row(scoreboard_id)
    current = round_service.get_round_by_number(
        scoreboard_id, scoreboard["current_round"]
    )
    if current is None:
        return success({"round": None, "status": scoreboard["status"]})

    return success(
        {
            "round": round_service.get_round_detail(scoreboard_id, current["id"]),
            "status": scoreboard["status"],
        }
    )


@bp.get("/<int:scoreboard_id>/rounds/<int:round_id>")
def get_round(scoreboard_id, round_id):
    scoreboard_service.get_scoreboard_row(scoreboard_id)
    detail = round_service.get_round_detail(scoreboard_id, round_id)
    if detail["scoreboardId"] != scoreboard_id:
        raise round_not_found(round_id)
    return success({"round": detail})
