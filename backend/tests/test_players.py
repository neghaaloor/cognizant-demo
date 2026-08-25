"""Roster rules: unlimited during SETUP, locked once ACTIVE."""


def test_add_player(client, api):
    scoreboard = api.create_scoreboard()
    response = api.add_player(scoreboard["id"], "Abhiram")
    body = response.get_json()

    assert response.status_code == 201
    assert body["player"]["name"] == "Abhiram"
    assert body["player"]["scoreboardId"] == scoreboard["id"]


def test_no_fixed_player_limit_during_setup(client, api):
    """Section 5: the user keeps adding until they press START."""
    scoreboard = api.create_scoreboard()
    names = [
        "Abhiram", "Rahul", "Monish", "Arjun", "Karthik",
        "Anand", "Vishnu", "Sanjay", "Priya", "Meera", "Nikhil", "Divya",
    ]
    for name in names:
        assert api.add_player(scoreboard["id"], name).status_code == 201

    body = client.get(f"/api/scoreboards/{scoreboard['id']}/players").get_json()
    assert body["playerCount"] == len(names)


def test_empty_name_is_rejected(client, api):
    scoreboard = api.create_scoreboard()

    for bad_name in ["", "   ", None]:
        response = api.add_player(scoreboard["id"], bad_name)
        assert response.status_code == 400
        assert response.get_json()["error"] == "INVALID_PLAYER_NAME"


def test_duplicate_name_is_rejected(client, api):
    scoreboard = api.create_scoreboard()
    api.add_player(scoreboard["id"], "Rahul")

    response = api.add_player(scoreboard["id"], "Rahul")
    assert response.status_code == 409
    assert response.get_json()["error"] == "DUPLICATE_PLAYER"


def test_duplicate_check_ignores_case_and_padding(client, api):
    """'rahul', 'RAHUL' and ' Rahul ' are the same person at a real table."""
    scoreboard = api.create_scoreboard()
    api.add_player(scoreboard["id"], "Rahul")

    for variant in ["rahul", "RAHUL", "  Rahul  "]:
        response = api.add_player(scoreboard["id"], variant)
        assert response.status_code == 409, variant
        assert response.get_json()["error"] == "DUPLICATE_PLAYER"


def test_same_name_allowed_on_a_different_scoreboard(client, api):
    first = api.create_scoreboard()
    second = api.create_scoreboard()

    assert api.add_player(first["id"], "Rahul").status_code == 201
    assert api.add_player(second["id"], "Rahul").status_code == 201


def test_rename_during_setup(client, api):
    scoreboard = api.create_scoreboard()
    player_id = api.add_player(scoreboard["id"], "Abhram").get_json()["player"]["id"]

    response = client.patch(
        f"/api/scoreboards/{scoreboard['id']}/players/{player_id}",
        json={"name": "Abhiram"},
    )
    assert response.status_code == 200
    assert response.get_json()["player"]["name"] == "Abhiram"


def test_remove_during_setup(client, api):
    scoreboard = api.create_scoreboard()
    player_id = api.add_player(scoreboard["id"], "Arjun").get_json()["player"]["id"]

    response = client.delete(
        f"/api/scoreboards/{scoreboard['id']}/players/{player_id}"
    )
    assert response.status_code == 200

    body = client.get(f"/api/scoreboards/{scoreboard['id']}/players").get_json()
    assert body["playerCount"] == 0


def test_roster_is_locked_after_start(client, api):
    """Nobody joins in Round 4 - that would leave holes in the history."""
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])

    add = api.add_player(scoreboard_id, "Latecomer")
    assert add.status_code == 409
    assert add.get_json()["error"] == "PLAYERS_LOCKED"

    remove = client.delete(
        f"/api/scoreboards/{scoreboard_id}/players/{players['Rahul']}"
    )
    assert remove.status_code == 409
    assert remove.get_json()["error"] == "PLAYERS_LOCKED"


def test_removing_unknown_player_returns_404(client, api):
    scoreboard = api.create_scoreboard()
    response = client.delete(f"/api/scoreboards/{scoreboard['id']}/players/424242")

    assert response.status_code == 404
    assert response.get_json()["error"] == "PLAYER_NOT_FOUND"
