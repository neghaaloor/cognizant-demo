"""Request-scoped account identity.

ADDED for GameBoard.

The upstream scorekeeper had no accounts, so every sign-in saw every board.
This module puts the caller's account on Flask's `g` for the life of the
request, and `scoreboard_service.get_scoreboard_row` filters on it. Because
every other service starts by calling that function, ownership cannot be
forgotten at an individual call site.

The account travels in an `X-User-Id` header, obtained from POST /api/session.
"""

from flask import g, request

from errors import ApiError
from services import user_service

UNAUTHENTICATED = "UNAUTHENTICATED"

HEADER = "X-User-Id"


def load_current_user():
    """`before_request` hook: resolve the header into an account, or None."""
    raw = request.headers.get(HEADER) or request.args.get("userId")
    user = user_service.get_user(raw) if raw else None
    g.current_user = user
    g.current_user_id = user["id"] if user else None


def current_user_id():
    return getattr(g, "current_user_id", None)


def require_user_id():
    """The account for this request, or 401.

    Raised as a normal ApiError so it comes back in the same envelope as every
    other failure and the frontend can branch on `error` as usual.
    """
    user_id = current_user_id()
    if user_id is None:
        raise ApiError(
            UNAUTHENTICATED,
            "Sign in to continue.",
            status=401,
        )
    return user_id
