"""Player validation.

Owner: Person 6.

Note on the player count: the spec (section 5) says there is NO fixed player
limit during setup. Config.MAX_PLAYERS is only a sanity ceiling (default 100)
so a runaway script cannot fill the table - it is not a game rule.
"""

from config import Config
from errors import (
    ApiError,
    DUPLICATE_PLAYER,
    INVALID_PLAYER_NAME,
    PLAYERS_LOCKED,
    TOO_MANY_PLAYERS,
)
from validators import scoreboard_validator


def validate_name(name):
    """Trim, then reject empty / non-text / over-long names."""
    if name is None or not isinstance(name, str):
        raise ApiError(
            INVALID_PLAYER_NAME,
            "Player name is required and must be text.",
            400,
        )

    cleaned = " ".join(name.split())  # collapse inner whitespace too
    if not cleaned:
        raise ApiError(
            INVALID_PLAYER_NAME,
            "Player name cannot be empty.",
            400,
        )

    if len(cleaned) > Config.MAX_PLAYER_NAME_LENGTH:
        raise ApiError(
            INVALID_PLAYER_NAME,
            f"Player name cannot be longer than "
            f"{Config.MAX_PLAYER_NAME_LENGTH} characters.",
            400,
        )
    return cleaned


def require_unique_name(existing_players, name, ignore_player_id=None):
    """Case-insensitive duplicate check.

    The database UNIQUE(scoreboard_id, name) constraint is case-SENSITIVE, so
    "rahul" and "Rahul" would both be accepted by SQLite. For a scoreboard read
    aloud at a table - and later driven by voice - that is a trap, so we block
    it here in the application layer.
    """
    target = name.casefold()
    for player in existing_players:
        if ignore_player_id is not None and player["id"] == ignore_player_id:
            continue
        if player["name"].casefold() == target:
            raise ApiError(
                DUPLICATE_PLAYER,
                f"A player named '{player['name']}' is already on this scoreboard.",
                409,
            )


def require_room_for_one_more(existing_players):
    if len(existing_players) >= Config.MAX_PLAYERS:
        raise ApiError(
            TOO_MANY_PLAYERS,
            f"This scoreboard already has the maximum of "
            f"{Config.MAX_PLAYERS} players.",
            409,
        )


def require_editable(scoreboard, action):
    """Roster changes are SETUP-only."""
    if not scoreboard_validator.can_edit_players(scoreboard):
        raise ApiError(
            PLAYERS_LOCKED,
            f"Cannot {action} once the scoreboard is "
            f"{scoreboard['status']}. The player list is locked after the "
            f"scoreboard starts.",
            409,
            details={"currentStatus": scoreboard["status"]},
        )
