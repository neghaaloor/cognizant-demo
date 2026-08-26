"""Tournament endpoints.

ADDED for GameBoard.

    GET    /api/tournaments              this account's tournaments
    POST   /api/tournaments              create one from a name, board type, roster
    GET    /api/tournaments/<id>         detail: games + standings
    POST   /api/tournaments/<id>/games   open the next game (a started board)
    PATCH  /api/tournaments/<id>         set status ACTIVE / ENDED
    DELETE /api/tournaments/<id>         remove it; its games survive
"""

from flask import Blueprint, request

from errors import success
from services import tournament_service

bp = Blueprint("tournaments", __name__, url_prefix="/api/tournaments")


def _body():
    return request.get_json(silent=True) or {}


@bp.get("")
@bp.get("/")
def list_tournaments():
    return success({"tournaments": tournament_service.list_tournaments()})


@bp.post("")
@bp.post("/")
def create_tournament():
    body = _body()
    tournament = tournament_service.create_tournament(
        body.get("name"),
        body.get("boardId"),
        body.get("boardName"),
        body.get("players"),
    )
    return success({"tournament": tournament}, 201)


@bp.get("/<int:tournament_id>")
def get_tournament(tournament_id):
    return success({"tournament": tournament_service.get_tournament(tournament_id)})


@bp.patch("/<int:tournament_id>")
def update_tournament(tournament_id):
    return success(
        {"tournament": tournament_service.set_status(tournament_id, _body().get("status"))}
    )


@bp.post("/<int:tournament_id>/games")
def add_game(tournament_id):
    """Returns the new board, already started, ready to be scored."""
    board = tournament_service.add_game(tournament_id, _body().get("name"))
    return success({"scoreboard": board}, 201)


@bp.delete("/<int:tournament_id>")
def delete_tournament(tournament_id):
    return success(tournament_service.delete_tournament(tournament_id))
