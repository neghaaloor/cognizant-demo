"""Runtime configuration.

Everything here is environment-driven so the SAME code runs locally and on
GCP Cloud Run with no source edits (Person 7 only sets env vars).
"""

import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _as_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")


class Config:
    # ------------------------------------------------------------------
    # Database
    # ------------------------------------------------------------------
    # Local default lives inside backend/data/ (git-ignored).
    # On Cloud Run this MUST point at a writable path - the Dockerfile sets
    # DATABASE_PATH=/tmp/scorekeeper.db because the container filesystem is
    # read-only except for /tmp. See docs/DEPLOYMENT.md for why that means the
    # data is ephemeral.
    DATABASE_PATH = os.environ.get(
        "DATABASE_PATH", os.path.join(BASE_DIR, "data", "scorekeeper.db")
    )

    # Seconds sqlite3 waits on a locked database before raising.
    DATABASE_TIMEOUT = float(os.environ.get("DATABASE_TIMEOUT", "10"))

    # ------------------------------------------------------------------
    # Server
    # ------------------------------------------------------------------
    # Cloud Run injects PORT. Never hard-code 8080 anywhere else.
    PORT = int(os.environ.get("PORT", "8080"))
    HOST = os.environ.get("HOST", "0.0.0.0")
    DEBUG = _as_bool(os.environ.get("FLASK_DEBUG"), False)

    # ------------------------------------------------------------------
    # CORS
    # ------------------------------------------------------------------
    # The frontend (Person 1 / 2) is served from a different origin during
    # development, so the browser will pre-flight every POST.
    # "*" is fine for a college demo; tighten to the real frontend origin
    # before the final submission.
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

    # ------------------------------------------------------------------
    # Scoring rules (game-agnostic knobs owned by Person 6)
    # ------------------------------------------------------------------
    # We do NOT know the physical game, so negative points are legal by
    # default (penalties exist in plenty of card games). Set to false only if
    # the team decides the scoreboard should reject them.
    ALLOW_NEGATIVE_SCORES = _as_bool(os.environ.get("ALLOW_NEGATIVE_SCORES"), True)

    # Guard rails against a fat-finger / bad voice transcription.
    MIN_SCORE = int(os.environ.get("MIN_SCORE", "-100000"))
    MAX_SCORE = int(os.environ.get("MAX_SCORE", "100000"))

    # Section 5 of the spec: NO artificial player cap during setup.
    # This is only a sanity ceiling so a script cannot insert 10,000 players.
    MAX_PLAYERS = int(os.environ.get("MAX_PLAYERS", "100"))
    MAX_PLAYER_NAME_LENGTH = int(os.environ.get("MAX_PLAYER_NAME_LENGTH", "40"))
    MAX_SCOREBOARD_NAME_LENGTH = int(os.environ.get("MAX_SCOREBOARD_NAME_LENGTH", "80"))

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------
    # JSON logs are what Cloud Logging parses into structured entries.
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
    JSON_LOGS = _as_bool(os.environ.get("JSON_LOGS"), True)


class TestConfig(Config):
    """Used by backend/tests/. Each test run gets its own throw-away file.

    We use a real file rather than ":memory:" because every request opens its
    own sqlite3 connection, and an in-memory database would be invisible to the
    next connection.
    """

    import tempfile as _tempfile

    DATABASE_PATH = os.path.join(_tempfile.mkdtemp(prefix="scorekeeper-test-"), "test.db")
    DEBUG = True
    JSON_LOGS = False
