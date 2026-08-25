"""Scoreboard-level validation and lifecycle rules.

Owner: Person 6.

The lifecycle this file guards:

    SETUP  --start-->  ACTIVE  --end-->  ENDED

    SETUP  : add / remove / rename players. NO scoring.
    ACTIVE : create rounds, submit scores. Player list is LOCKED.
    ENDED  : read-only. Only /reset can bring it back to life.
"""

from config import Config
from errors import (
    ApiError,
    INVALID_SCOREBOARD_NAME,
    NO_PLAYERS,
    bad_state,
)

SETUP = "SETUP"
ACTIVE = "ACTIVE"
ENDED = "ENDED"

VALID_STATUSES = (SETUP, ACTIVE, ENDED)


def validate_name(name):
    """The scoreboard name is optional - "Friday Night", or nothing at all."""
    if name is None:
        return None

    if not isinstance(name, str):
        raise ApiError(
            INVALID_SCOREBOARD_NAME,
            "Scoreboard name must be text.",
            400,
        )

    cleaned = name.strip()
    if not cleaned:
        return None

    if len(cleaned) > Config.MAX_SCOREBOARD_NAME_LENGTH:
        raise ApiError(
            INVALID_SCOREBOARD_NAME,
            f"Scoreboard name cannot be longer than "
            f"{Config.MAX_SCOREBOARD_NAME_LENGTH} characters.",
            400,
        )
    return cleaned


def require_status(scoreboard, expected, action):
    """Gate an action behind a lifecycle state.

    `scoreboard` is the dict returned by scoreboard_service.get_scoreboard_row.
    """
    if scoreboard["status"] != expected:
        raise bad_state(scoreboard["status"], expected, action)


def require_not_ended(scoreboard, action):
    if scoreboard["status"] == ENDED:
        raise bad_state(ENDED, "SETUP or ACTIVE", action)


def require_players(players):
    """You cannot start a scoreboard with nobody on it."""
    if not players:
        raise ApiError(
            NO_PLAYERS,
            "Add at least one player before starting the scoreboard.",
            409,
        )


def can_edit_players(scoreboard):
    """True only during SETUP - section 6 of the spec.

    Locking the roster at start time is what keeps the history consistent:
    nobody can appear in Round 4 with no scores for Rounds 1-3.
    """
    return scoreboard["status"] == SETUP
