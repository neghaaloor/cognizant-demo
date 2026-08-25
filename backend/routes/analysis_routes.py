"""Analysis endpoints - consumed by Person 4.

    GET /api/scoreboards/<id>/analysis                  stats + achievements + timeline
    GET /api/scoreboards/<id>/analysis/players/<pid>    one player's card
    GET /api/scoreboards/<id>/summary                   compact roll-up
    GET /api/scoreboards/<id>/achievements              badges only
    GET /api/scoreboards/<id>/timeline                  narrative only

The split endpoints exist so the UI can poll something small (summary) without
recomputing the whole analysis on every refresh.
"""

from flask import Blueprint

from errors import success
from services import analysis_service

bp = Blueprint("analysis", __name__, url_prefix="/api/scoreboards")


@bp.get("/<int:scoreboard_id>/analysis")
def get_analysis(scoreboard_id):
    return success({"analysis": analysis_service.get_analysis(scoreboard_id)})


@bp.get("/<int:scoreboard_id>/analysis/players/<int:player_id>")
def get_player_analysis(scoreboard_id, player_id):
    return success(
        {"player": analysis_service.get_player_analysis(scoreboard_id, player_id)}
    )


@bp.get("/<int:scoreboard_id>/summary")
def get_summary(scoreboard_id):
    return success(analysis_service.get_summary(scoreboard_id))


@bp.get("/<int:scoreboard_id>/achievements")
def get_achievements(scoreboard_id):
    analysis = analysis_service.get_analysis(scoreboard_id)
    return success({"achievements": analysis["achievements"]})


@bp.get("/<int:scoreboard_id>/timeline")
def get_timeline(scoreboard_id):
    analysis = analysis_service.get_analysis(scoreboard_id)
    return success({"timeline": analysis["timeline"]})
