"""Player CRUD - roster management during SETUP.

Owner: Person 5, rules from Person 6's player_validator.
"""

import sqlite3

from database import database as db
from errors import ApiError, DUPLICATE_PLAYER, player_not_found
from validators import player_validator as pv


def serialize(row):
    return {
        "id": row["id"],
        "scoreboardId": row["scoreboard_id"],
        "name": row["name"],
        # Added for GameBoard: the UI gives every player a colour.
        "colour": row["colour"] if "colour" in row.keys() else None,
        "joinedAt": row["joined_at"],
    }


def list_players(scoreboard_id):
    """Ordered by id so the roster keeps the order people were added in."""
    rows = db.query_all(
        "SELECT * FROM players WHERE scoreboard_id = ? ORDER BY id ASC",
        (scoreboard_id,),
    )
    return [serialize(row) for row in rows]


def get_player(scoreboard_id, player_id):
    row = db.query_one(
        "SELECT * FROM players WHERE id = ? AND scoreboard_id = ?",
        (player_id, scoreboard_id),
    )
    if row is None:
        raise player_not_found(player_id)
    return serialize(row)


def add_player(scoreboard, name, colour=None):
    """Add one player. SETUP only - the roster locks when the game starts.

    `scoreboard` is the row dict from scoreboard_service.get_scoreboard_row,
    passed in so we do not re-query it and do not create an import cycle.
    """
    pv.require_editable(scoreboard, "add a player")

    clean_name = pv.validate_name(name)
    existing = list_players(scoreboard["id"])
    pv.require_unique_name(existing, clean_name)
    pv.require_room_for_one_more(existing)

    try:
        cursor = db.execute(
            "INSERT INTO players (scoreboard_id, name, colour) VALUES (?, ?, ?)",
            (scoreboard["id"], clean_name, colour),
        )
    except sqlite3.IntegrityError:
        # The UNIQUE(scoreboard_id, name) constraint fired - two requests
        # raced with the same name. Report it as the same error the
        # application-level check would have produced.
        raise ApiError(
            DUPLICATE_PLAYER,
            f"A player named '{clean_name}' is already on this scoreboard.",
            409,
        )

    return get_player(scoreboard["id"], cursor.lastrowid)


def rename_player(scoreboard, player_id, name):
    """Fix a typo during SETUP (section 6 allows editing players there)."""
    pv.require_editable(scoreboard, "rename a player")

    get_player(scoreboard["id"], player_id)  # 404 if it is not ours
    clean_name = pv.validate_name(name)

    existing = list_players(scoreboard["id"])
    pv.require_unique_name(existing, clean_name, ignore_player_id=player_id)

    db.execute(
        "UPDATE players SET name = ? WHERE id = ? AND scoreboard_id = ?",
        (clean_name, player_id, scoreboard["id"]),
    )
    return get_player(scoreboard["id"], player_id)


def remove_player(scoreboard, player_id):
    """Remove a player. SETUP only.

    After the scoreboard starts this is blocked on purpose: deleting a player
    mid-game would cascade-delete their scores and silently rewrite history.
    """
    pv.require_editable(scoreboard, "remove a player")

    player = get_player(scoreboard["id"], player_id)
    db.execute(
        "DELETE FROM players WHERE id = ? AND scoreboard_id = ?",
        (player_id, scoreboard["id"]),
    )
    return {"removedPlayer": player}


def name_map(scoreboard_id):
    """{player_id: name} - used to build readable validation messages."""
    return {
        player["id"]: player["name"] for player in list_players(scoreboard_id)
    }
