"""Round progression and the history grid."""


def test_next_round_requires_the_current_one_to_be_complete(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul", "Monish"])
    round_id = api.current_round_id(scoreboard_id)
    api.submit(scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 20}])

    response = api.next_round(scoreboard_id)
    body = response.get_json()

    assert response.status_code == 409
    assert body["error"] == "ROUND_INCOMPLETE"
    assert {p["name"] for p in body["details"]["missingPlayers"]} == {"Rahul", "Monish"}


def test_next_round_advances_the_counter(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    api.play_round(scoreboard_id, {players["Abhiram"]: 20, players["Rahul"]: 15})

    response = api.next_round(scoreboard_id)
    assert response.status_code == 201
    assert response.get_json()["round"]["roundNumber"] == 2

    scoreboard = client.get(f"/api/scoreboards/{scoreboard_id}").get_json()["scoreboard"]
    assert scoreboard["currentRound"] == 2


def test_rounds_cannot_be_created_in_setup(client, api):
    scoreboard = api.create_scoreboard()
    api.add_player(scoreboard["id"], "Abhiram")

    response = api.next_round(scoreboard["id"])
    assert response.status_code == 409
    assert response.get_json()["error"] == "SCOREBOARD_NOT_STARTED"


def test_current_round_is_null_during_setup(client, api):
    scoreboard = api.create_scoreboard()
    body = client.get(f"/api/scoreboards/{scoreboard['id']}/rounds/current").get_json()

    assert body["round"] is None
    assert body["status"] == "SETUP"


def test_current_round_shows_who_is_still_missing(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    round_id = api.current_round_id(scoreboard_id)
    api.submit(scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 20}])

    body = client.get(f"/api/scoreboards/{scoreboard_id}/rounds/current").get_json()
    assert body["round"]["complete"] is False
    assert body["round"]["missingPlayers"][0]["name"] == "Rahul"
    assert body["round"]["scores"][0]["points"] == 20


def test_history_builds_the_full_grid(client, api):
    """The R1 / R2 / R3 / TOTAL table from the original requirement."""
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul", "Monish", "Arjun"])

    rounds = [
        {"Abhiram": 20, "Rahul": 15, "Monish": 30, "Arjun": 10},
        {"Abhiram": 25, "Rahul": 30, "Monish": 20, "Arjun": 15},
        {"Abhiram": 10, "Rahul": 20, "Monish": 30, "Arjun": 25},
    ]
    for index, points in enumerate(rounds):
        api.play_round(
            scoreboard_id,
            {players[name]: value for name, value in points.items()},
            advance=index < len(rounds) - 1,
        )

    history = client.get(
        f"/api/scoreboards/{scoreboard_id}/history"
    ).get_json()["history"]

    assert history["roundNumbers"] == [1, 2, 3]

    by_name = {entry["name"]: entry for entry in history["players"]}
    assert by_name["Monish"]["rounds"] == [30, 20, 30]
    assert by_name["Monish"]["total"] == 80
    assert by_name["Rahul"]["total"] == 65
    assert by_name["Abhiram"]["total"] == 55
    assert by_name["Arjun"]["total"] == 50

    # Sorted like the leaderboard.
    assert [entry["name"] for entry in history["players"]] == [
        "Monish", "Rahul", "Abhiram", "Arjun"
    ]


def test_history_marks_a_missing_entry_as_null(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    round_id = api.current_round_id(scoreboard_id)
    api.submit(scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 20}])

    history = client.get(
        f"/api/scoreboards/{scoreboard_id}/history"
    ).get_json()["history"]

    by_name = {entry["name"]: entry for entry in history["players"]}
    assert by_name["Rahul"]["rounds"] == [None]
    assert by_name["Rahul"]["total"] == 0
    assert history["rounds"][0]["complete"] is False
