"""Accounts.

ADDED for GameBoard — the upstream scorekeeper has no notion of who owns a
scoreboard, so every sign-in saw every board. This module plus `owner_id` on
`scoreboards` is what keeps one person's history out of another's.

Sign-in is by name only. There is no password: this is a scoreboard for a table
of people in the same room, not a public service. What it does guarantee is
isolation — boards created by "Jhanavi" are never visible to "Rahul".
"""

import sqlite3

from database import database as db
from errors import ApiError

INVALID_USER_NAME = "INVALID_USER_NAME"
USER_NOT_FOUND = "USER_NOT_FOUND"

MAX_NAME_LENGTH = 40


def validate_name(name):
    """Trim, collapse inner whitespace, reject the empty and the absurd."""
    if name is None or not isinstance(name, str):
        raise ApiError(
            INVALID_USER_NAME,
            "A name is required to sign in.",
            status=400,
        )

    clean = " ".join(name.split())
    if not clean:
        raise ApiError(
            INVALID_USER_NAME,
            "A name is required to sign in.",
            status=400,
        )
    if len(clean) > MAX_NAME_LENGTH:
        raise ApiError(
            INVALID_USER_NAME,
            f"That name is too long (max {MAX_NAME_LENGTH} characters).",
            status=400,
        )
    return clean


def serialize(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "createdAt": row["created_at"],
    }


def get_user(user_id):
    """Raw lookup used by the auth guard. Returns None rather than raising."""
    if user_id is None:
        return None
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None
    row = db.query_one("SELECT * FROM users WHERE id = ?", (user_id,))
    return serialize(row) if row is not None else None


def require_user(user_id):
    user = get_user(user_id)
    if user is None:
        raise ApiError(
            USER_NOT_FOUND,
            "Sign in again — that account no longer exists.",
            status=401,
        )
    return user


def find_by_name(name):
    row = db.query_one(
        "SELECT * FROM users WHERE lower(name) = lower(?)", (name,)
    )
    return serialize(row) if row is not None else None


def sign_in(name):
    """Find the account, or create it on first use.

    Returns (user, created). Matching is case-insensitive so signing in as
    "jhanavi" reaches the same boards as "Jhanavi".
    """
    clean = validate_name(name)

    existing = find_by_name(clean)
    if existing is not None:
        return existing, False

    try:
        cursor = db.execute("INSERT INTO users (name) VALUES (?)", (clean,))
        return get_user(cursor.lastrowid), True
    except sqlite3.IntegrityError:
        # Lost a race with a concurrent sign-in of the same name — take theirs
        # rather than failing, since both people meant the same account.
        existing = find_by_name(clean)
        if existing is None:
            raise
        return existing, False
