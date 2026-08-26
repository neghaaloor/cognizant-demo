"""SQLite access layer.

Owner: Person 8, consumed by Person 5's services.

Two things matter here and they cause most beginner SQLite bugs:

1. FOREIGN KEYS ARE OFF BY DEFAULT in SQLite. Without `PRAGMA foreign_keys=ON`
   on EVERY connection, our ON DELETE CASCADE rules silently do nothing.
2. One connection per request, closed at the end of the request. sqlite3
   connections are not safe to share between threads by default.
"""

import os
import sqlite3

from flask import current_app, g

SCHEMA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")


def _connect(db_path, timeout):
    directory = os.path.dirname(db_path)
    if directory:
        os.makedirs(directory, exist_ok=True)

    connection = sqlite3.connect(db_path, timeout=timeout)
    # Rows behave like dicts: row["name"] instead of row[1].
    connection.row_factory = sqlite3.Row
    # Enforce our ON DELETE CASCADE / REFERENCES rules.
    connection.execute("PRAGMA foreign_keys = ON")
    # WAL lets readers work while a writer holds the lock - it keeps the
    # leaderboard polling from Person 2's UI from blocking a round submit.
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def get_db():
    """The connection for the current request, created on first use."""
    if "db" not in g:
        g.db = _connect(
            current_app.config["DATABASE_PATH"],
            current_app.config["DATABASE_TIMEOUT"],
        )
    return g.db


def close_db(exception=None):
    """Registered as a teardown handler in app.py."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


# Columns added to an existing table, as (table, column, definition).
# CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so a
# database created before one of these shipped would be missing the column.
_ADDED_COLUMNS = [
    ("scoreboards", "owner_id", "INTEGER"),
    ("scoreboards", "board_id", "TEXT NOT NULL DEFAULT 'scoresheet'"),
    ("scoreboards", "board_name", "TEXT"),
    ("scoreboards", "config", "TEXT NOT NULL DEFAULT '{}'"),
    ("scoreboards", "board_state", "TEXT"),
    ("scoreboards", "tournament_id", "INTEGER"),
    ("players", "colour", "TEXT"),
]


def _migrate(connection):
    for table, column, definition in _ADDED_COLUMNS:
        existing = {
            row["name"]
            for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if not existing:
            continue  # table not created yet; the schema script will handle it
        if column not in existing:
            connection.execute(
                f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
            )


def init_db(app):
    """Create the tables if they do not exist. Safe to run on every boot."""
    with open(SCHEMA_FILE, "r", encoding="utf-8") as handle:
        schema_sql = handle.read()

    connection = _connect(app.config["DATABASE_PATH"], app.config["DATABASE_TIMEOUT"])
    try:
        connection.executescript(schema_sql)
        _migrate(connection)
        connection.commit()
    finally:
        connection.close()


def ping():
    """Health check: prove we can actually talk to the file, not just open it.

    `SELECT 1` is what /health runs. If this raises, the problem is SQLite,
    not Flask and not Cloud Run.
    """
    row = get_db().execute("SELECT 1 AS ok").fetchone()
    return row is not None and row["ok"] == 1


# ---------------------------------------------------------------------------
# Small query helpers so services never repeat cursor boilerplate.
# ---------------------------------------------------------------------------
def query_one(sql, params=()):
    return get_db().execute(sql, params).fetchone()


def query_all(sql, params=()):
    return get_db().execute(sql, params).fetchall()


def execute(sql, params=()):
    """Single write + commit. For multi-statement writes use transaction()."""
    db = get_db()
    cursor = db.execute(sql, params)
    db.commit()
    return cursor


def row_to_dict(row):
    return dict(row) if row is not None else None


def rows_to_list(rows):
    return [dict(row) for row in rows]


class transaction:
    """All-or-nothing writes - the requirement from section 22 of the spec.

    Submitting a round for 10 players must not leave 4 scores written and 6
    missing. Used as:

        with transaction() as db:
            for score in scores:
                db.execute("INSERT INTO scores ...", ...)

    Any exception inside the block rolls the whole thing back, so a validation
    failure on player 7 undoes players 1-6.
    """

    def __enter__(self):
        self.db = get_db()
        # sqlite3 opens an implicit transaction on the first write; we start
        # one explicitly so that even pure-read-then-write blocks are atomic.
        self.db.execute("BEGIN")
        return self.db

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type is None:
            self.db.commit()
        else:
            self.db.rollback()
        # Returning False re-raises the original exception, which app.py's
        # error handler turns into the standard JSON error body.
        return False
