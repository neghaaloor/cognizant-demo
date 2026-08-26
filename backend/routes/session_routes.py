"""Sign-in.

ADDED for GameBoard.

    POST /api/session          sign in by name (creates the account on first use)
    GET  /api/session          who am I (validates a stored X-User-Id)
    GET  /api/session/boards   every board this account owns

There is no password. The name is the account: sign in with the same name on
another device and your boards are there. What this does enforce is that boards
belong to exactly one account and are never visible to another.
"""

from flask import Blueprint, request

import auth
from errors import success
from services import scoreboard_service, user_service

bp = Blueprint("session", __name__, url_prefix="/api/session")


@bp.post("")
@bp.post("/")
def sign_in():
    body = request.get_json(silent=True) or {}
    user, created = user_service.sign_in(body.get("name"))
    return success(
        {
            "user": user,
            "created": created,
            "boards": scoreboard_service.list_scoreboards_for_owner(user["id"]),
        },
        201 if created else 200,
    )


@bp.get("")
@bp.get("/")
def whoami():
    user_id = auth.require_user_id()
    return success({"user": user_service.require_user(user_id)})


@bp.get("/boards")
def my_boards():
    """Only this account's boards — the whole point of the ownership layer."""
    user_id = auth.require_user_id()
    limit = request.args.get("limit", default=100, type=int)
    return success(
        {"boards": scoreboard_service.list_scoreboards_for_owner(user_id, limit)}
    )
