"""Player endpoints - all roster changes are SETUP-only.

Owner: Person 5.

    GET    /api/scoreboards/<id>/players
    POST   /api/scoreboards/<id>/players             add
    PATCH  /api/scoreboards/<id>/players/<playerId>  rename
    DELETE /api/scoreboards/<id>/players/<playerId>  remove
"""

from flask import Blueprint, request

from errors import success
from services import player_service, scoreboard_service

bp = Blueprint("players", __name__, url_prefix="/api/scoreboards")


def _json_body():
    return request.get_json(silent=True) or {}


@bp.get("/<int:scoreboard_id>/players")
def list_players(scoreboard_id):
    scoreboard_service.get_scoreboard_row(scoreboard_id)  # 404 if unknown
    players = player_service.list_players(scoreboard_id)
    return success({"players": players, "playerCount": len(players)})


@bp.post("/<int:scoreboard_id>/players")
def add_player(scoreboard_id):
    """No fixed cap during setup - keep adding until START is pressed."""
    scoreboard = scoreboard_service.get_scoreboard_row(scoreboard_id)
    body = _json_body()
    player = player_service.add_player(scoreboard, body.get("name"), body.get("colour"))
    return success({"player": player}, 201)


@bp.patch("/<int:scoreboard_id>/players/<int:player_id>")
def rename_player(scoreboard_id, player_id):
    scoreboard = scoreboard_service.get_scoreboard_row(scoreboard_id)
    player = player_service.rename_player(
        scoreboard, player_id, _json_body().get("name")
    )
    return success({"player": player})


@bp.delete("/<int:scoreboard_id>/players/<int:player_id>")
def remove_player(scoreboard_id, player_id):
    scoreboard = scoreboard_service.get_scoreboard_row(scoreboard_id)
    return success(player_service.remove_player(scoreboard, player_id))
