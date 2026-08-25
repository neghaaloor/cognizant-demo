"""Consistent error contract for the whole API.

Owner: Person 6 (validation / rules), used by Person 5's routes.

RULE FOR THE WHOLE TEAM
-----------------------
No endpoint ever invents its own error shape. Every failure - validation,
missing row, wrong state, crash - comes back as:

    {
        "success": false,
        "error":   "SCOREBOARD_NOT_FOUND",
        "message": "The requested scoreboard does not exist."
    }

The frontend (Person 1 / 2) switches on `error`, never on `message`.
`message` is human text and may be reworded at any time.
"""

from flask import jsonify

# ---------------------------------------------------------------------------
# Error code catalogue.
# Keep this list in sync with docs/API_CONTRACT.md - the frontend and the
# voice layer both branch on these strings.
# ---------------------------------------------------------------------------
SCOREBOARD_NOT_FOUND = "SCOREBOARD_NOT_FOUND"
SCOREBOARD_ALREADY_STARTED = "SCOREBOARD_ALREADY_STARTED"
SCOREBOARD_ALREADY_ENDED = "SCOREBOARD_ALREADY_ENDED"
SCOREBOARD_NOT_STARTED = "SCOREBOARD_NOT_STARTED"
INVALID_SCOREBOARD_STATE = "INVALID_SCOREBOARD_STATE"
INVALID_SCOREBOARD_NAME = "INVALID_SCOREBOARD_NAME"
NO_PLAYERS = "NO_PLAYERS"

PLAYER_NOT_FOUND = "PLAYER_NOT_FOUND"
DUPLICATE_PLAYER = "DUPLICATE_PLAYER"
INVALID_PLAYER_NAME = "INVALID_PLAYER_NAME"
TOO_MANY_PLAYERS = "TOO_MANY_PLAYERS"
PLAYERS_LOCKED = "PLAYERS_LOCKED"

ROUND_NOT_FOUND = "ROUND_NOT_FOUND"
ROUND_NOT_IN_SCOREBOARD = "ROUND_NOT_IN_SCOREBOARD"
ROUND_ALREADY_SUBMITTED = "ROUND_ALREADY_SUBMITTED"
ROUND_INCOMPLETE = "ROUND_INCOMPLETE"

INVALID_SCORE = "INVALID_SCORE"
DUPLICATE_SCORE = "DUPLICATE_SCORE"
NEGATIVE_SCORE_NOT_ALLOWED = "NEGATIVE_SCORE_NOT_ALLOWED"
SCORE_OUT_OF_RANGE = "SCORE_OUT_OF_RANGE"
EMPTY_SCORES = "EMPTY_SCORES"

INVALID_REQUEST = "INVALID_REQUEST"
INVALID_JSON = "INVALID_JSON"
NOT_FOUND = "NOT_FOUND"
METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
INTERNAL_ERROR = "INTERNAL_ERROR"
DATABASE_ERROR = "DATABASE_ERROR"


class ApiError(Exception):
    """Raise this anywhere below the route layer.

    app.py has a handler that turns it into the JSON contract above, so a
    service never needs to build a response itself:

        raise ApiError(SCOREBOARD_NOT_FOUND,
                       "The requested scoreboard does not exist.", 404)
    """

    def __init__(self, error, message, status=400, details=None):
        super().__init__(message)
        self.error = error
        self.message = message
        self.status = status
        self.details = details

    def to_payload(self):
        payload = {
            "success": False,
            "error": self.error,
            "message": self.message,
        }
        if self.details is not None:
            payload["details"] = self.details
        return payload

    def to_response(self):
        return jsonify(self.to_payload()), self.status


# ---------------------------------------------------------------------------
# Shorthand constructors for the failures we raise most often.
# ---------------------------------------------------------------------------
def scoreboard_not_found(scoreboard_id):
    return ApiError(
        SCOREBOARD_NOT_FOUND,
        f"Scoreboard {scoreboard_id} does not exist.",
        404,
    )


def player_not_found(player_id):
    return ApiError(
        PLAYER_NOT_FOUND,
        f"Player {player_id} does not exist on this scoreboard.",
        404,
    )


def round_not_found(round_id):
    return ApiError(
        ROUND_NOT_FOUND,
        f"Round {round_id} does not exist.",
        404,
    )


def bad_state(current_status, expected_status, action):
    """The scoreboard is in the wrong lifecycle state for this action."""
    code_by_status = {
        "SETUP": SCOREBOARD_NOT_STARTED,
        "ACTIVE": SCOREBOARD_ALREADY_STARTED,
        "ENDED": SCOREBOARD_ALREADY_ENDED,
    }
    return ApiError(
        code_by_status.get(current_status, INVALID_SCOREBOARD_STATE),
        f"Cannot {action} while the scoreboard is {current_status}. "
        f"It must be {expected_status}.",
        409,
        details={"currentStatus": current_status, "expectedStatus": expected_status},
    )


def success(payload=None, status=200):
    """Every successful response carries success: true plus its own fields."""
    body = {"success": True}
    if payload:
        body.update(payload)
    return jsonify(body), status
