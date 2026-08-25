"""Scoreboard lifecycle: SETUP -> ACTIVE -> ENDED, plus reset."""


def test_new_scoreboard_starts_in_setup(client):
    response = client.post("/api/scoreboards", json={"name": "Friday Night"})
    body = response.get_json()

    assert response.status_code == 201
    assert body["success"] is True
    assert body["scoreboard"]["status"] == "SETUP"
    assert body["scoreboard"]["currentRound"] == 0
    assert body["scoreboard"]["name"] == "Friday Night"
    assert body["scoreboard"]["players"] == []


def test_scoreboard_name_is_optional(client):
    response = client.post("/api/scoreboards", json={})
    assert response.status_code == 201
    assert response.get_json()["scoreboard"]["name"] is None


def test_missing_scoreboard_returns_404(client):
    response = client.get("/api/scoreboards/9999")
    body = response.get_json()

    assert response.status_code == 404
    assert body["error"] == "SCOREBOARD_NOT_FOUND"


def test_start_requires_at_least_one_player(client, api):
    scoreboard = api.create_scoreboard()
    response = api.start(scoreboard["id"])

    assert response.status_code == 409
    assert response.get_json()["error"] == "NO_PLAYERS"


def test_start_activates_and_opens_round_one(client, api):
    scoreboard = api.create_scoreboard()
    api.add_player(scoreboard["id"], "Abhiram")

    response = api.start(scoreboard["id"])
    body = response.get_json()["scoreboard"]

    assert response.status_code == 200
    assert body["status"] == "ACTIVE"
    assert body["currentRound"] == 1
    assert body["startedAt"] is not None

    rounds = client.get(f"/api/scoreboards/{scoreboard['id']}/rounds").get_json()
    assert len(rounds["rounds"]) == 1
    assert rounds["rounds"][0]["roundNumber"] == 1


def test_cannot_start_twice(client, api):
    scoreboard_id, _ = api.setup_game(["Abhiram"])
    response = api.start(scoreboard_id)

    assert response.status_code == 409
    assert response.get_json()["error"] == "SCOREBOARD_ALREADY_STARTED"


def test_end_returns_winner_and_locks_the_scoreboard(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul", "Monish"])
    api.play_round(
        scoreboard_id,
        {players["Abhiram"]: 20, players["Rahul"]: 15, players["Monish"]: 30},
    )

    response = client.post(f"/api/scoreboards/{scoreboard_id}/end")
    body = response.get_json()

    assert response.status_code == 200
    assert body["tie"] is False
    assert body["winner"]["name"] == "Monish"
    assert body["winner"]["score"] == 30
    assert body["scoreboard"]["status"] == "ENDED"
    assert body["scoreboard"]["endedAt"] is not None
    assert body["roundsPlayed"] == 1


def test_ended_scoreboard_rejects_new_scores(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    round_id = api.current_round_id(scoreboard_id)
    api.submit(
        scoreboard_id,
        round_id,
        [{"playerId": players["Abhiram"], "points": 10},
         {"playerId": players["Rahul"], "points": 5}],
    )
    client.post(f"/api/scoreboards/{scoreboard_id}/end")

    response = api.submit(
        scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 99}]
    )

    assert response.status_code == 409
    assert response.get_json()["error"] == "SCOREBOARD_ALREADY_ENDED"


def test_tie_returns_no_winner(client, api):
    """A generic scoreboard must not invent a tie-breaker."""
    scoreboard_id, players = api.setup_game(["Monish", "Rahul", "Arjun"])
    api.play_round(
        scoreboard_id,
        {players["Monish"]: 100, players["Rahul"]: 100, players["Arjun"]: 40},
    )

    body = client.post(f"/api/scoreboards/{scoreboard_id}/end").get_json()

    assert body["tie"] is True
    assert body["winner"] is None
    assert {p["name"] for p in body["tiedPlayers"]} == {"Monish", "Rahul"}
    assert body["scoreboard"]["winnerId"] is None


def test_reset_clears_scores_but_keeps_players(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    api.play_round(scoreboard_id, {players["Abhiram"]: 20, players["Rahul"]: 15})
    client.post(f"/api/scoreboards/{scoreboard_id}/end")

    response = client.post(f"/api/scoreboards/{scoreboard_id}/reset")
    body = response.get_json()["scoreboard"]

    assert response.status_code == 200
    # Players survive...
    assert len(body["players"]) == 2
    assert {p["name"] for p in body["players"]} == {"Abhiram", "Rahul"}
    # ...scores, rounds and the winner do not.
    assert body["status"] == "ACTIVE"
    assert body["currentRound"] == 1
    assert body["winnerId"] is None

    leaderboard = api.leaderboard(scoreboard_id)
    assert all(entry["score"] == 0 for entry in leaderboard)

    history = client.get(f"/api/scoreboards/{scoreboard_id}/history").get_json()
    assert history["history"]["roundNumbers"] == [1]


def test_reset_in_setup_mode_reopens_the_roster(client, api):
    scoreboard_id, _ = api.setup_game(["Abhiram", "Rahul"])
    client.post(f"/api/scoreboards/{scoreboard_id}/reset", json={"mode": "SETUP"})

    body = client.get(f"/api/scoreboards/{scoreboard_id}").get_json()["scoreboard"]
    assert body["status"] == "SETUP"
    assert body["currentRound"] == 0

    # The roster is editable again.
    response = api.add_player(scoreboard_id, "Monish")
    assert response.status_code == 201
