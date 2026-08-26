"""Shared pytest fixtures.

Every test gets a brand-new SQLite file, so tests never see each other's data
and can run in any order.
"""

import os
import sys
import tempfile

import pytest

# Make backend/ importable when pytest is run from the repository root.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app  # noqa: E402
from config import Config  # noqa: E402


@pytest.fixture
def app(tmp_path):
    class TestConfig(Config):
        DATABASE_PATH = str(tmp_path / "test.db")
        DEBUG = False
        JSON_LOGS = False
        TESTING = True

    application = create_app(TestConfig)
    application.config["TESTING"] = True
    # Let ApiError reach our handler instead of pytest.
    application.config["PROPAGATE_EXCEPTIONS"] = False
    return application


@pytest.fixture
def client(app):
    """A signed-in test client.

    GameBoard added accounts: boards belong to a user and every scoreboard
    query is filtered by owner_id. The upstream tests were written before that
    existed, so the client signs in once and sends X-User-Id on every request.
    They then exercise exactly the same behaviour, just inside an account.

    Ownership itself is covered separately in test_accounts.py.
    """
    test_client = app.test_client()
    response = test_client.post("/api/session", json={"name": "Test Owner"})
    user_id = response.get_json()["user"]["id"]
    test_client.environ_base["HTTP_X_USER_ID"] = str(user_id)
    return test_client


@pytest.fixture
def other_client(app):
    """A second, unrelated account — used to prove boards are not shared."""
    test_client = app.test_client()
    response = test_client.post("/api/session", json={"name": "Someone Else"})
    user_id = response.get_json()["user"]["id"]
    test_client.environ_base["HTTP_X_USER_ID"] = str(user_id)
    return test_client


# ---------------------------------------------------------------------------
# Helpers that mirror how the frontend will actually call the API
# ---------------------------------------------------------------------------
@pytest.fixture
def api(client):
    class Api:
        def create_scoreboard(self, name="Test Night"):
            response = client.post("/api/scoreboards", json={"name": name})
            return response.get_json()["scoreboard"]

        def add_player(self, scoreboard_id, name):
            response = client.post(
                f"/api/scoreboards/{scoreboard_id}/players", json={"name": name}
            )
            return response

        def start(self, scoreboard_id):
            return client.post(f"/api/scoreboards/{scoreboard_id}/start")

        def current_round_id(self, scoreboard_id):
            response = client.get(f"/api/scoreboards/{scoreboard_id}/rounds/current")
            return response.get_json()["round"]["id"]

        def submit(self, scoreboard_id, round_id, scores):
            return client.post(
                f"/api/scoreboards/{scoreboard_id}/rounds/{round_id}/scores",
                json={"scores": scores},
            )

        def next_round(self, scoreboard_id):
            return client.post(f"/api/scoreboards/{scoreboard_id}/rounds")

        def leaderboard(self, scoreboard_id):
            response = client.get(f"/api/scoreboards/{scoreboard_id}/leaderboard")
            return response.get_json()["leaderboard"]

        def setup_game(self, names):
            """Create a scoreboard, add players, start it. Returns (id, {name: playerId})."""
            scoreboard = self.create_scoreboard()
            players = {}
            for name in names:
                response = self.add_player(scoreboard["id"], name)
                players[name] = response.get_json()["player"]["id"]
            self.start(scoreboard["id"])
            return scoreboard["id"], players

        def play_round(self, scoreboard_id, points_by_player_id, advance=False):
            round_id = self.current_round_id(scoreboard_id)
            response = self.submit(
                scoreboard_id,
                round_id,
                [
                    {"playerId": pid, "points": points}
                    for pid, points in points_by_player_id.items()
                ],
            )
            if advance:
                self.next_round(scoreboard_id)
            return response

    return Api()
