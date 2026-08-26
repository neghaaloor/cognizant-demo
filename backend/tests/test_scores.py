"""Score submission, validation and the atomic-transaction requirement."""


def test_submit_round_returns_updated_leaderboard(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul", "Monish"])
    round_id = api.current_round_id(scoreboard_id)

    response = api.submit(
        scoreboard_id,
        round_id,
        [
            {"playerId": players["Abhiram"], "points": 20},
            {"playerId": players["Rahul"], "points": 15},
            {"playerId": players["Monish"], "points": 30},
        ],
    )
    body = response.get_json()

    assert response.status_code == 201
    assert body["scoresRecorded"] == 3
    assert body["roundComplete"] is True
    assert body["missingPlayers"] == []
    # One request gives the UI everything it needs to re-render.
    assert body["leaderboard"][0]["name"] == "Monish"
    assert body["leaderboard"][0]["rank"] == 1


def test_zero_and_negative_points_are_accepted(client, api):
    """Game-agnostic: penalties are normal in plenty of card games."""
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    round_id = api.current_round_id(scoreboard_id)

    response = api.submit(
        scoreboard_id,
        round_id,
        [
            {"playerId": players["Abhiram"], "points": 0},
            {"playerId": players["Rahul"], "points": -25},
        ],
    )
    assert response.status_code == 201

    leaderboard = api.leaderboard(scoreboard_id)
    scores = {entry["name"]: entry["score"] for entry in leaderboard}
    assert scores == {"Abhiram": 0, "Rahul": -25}


def test_numeric_strings_are_accepted(client, api):
    """HTML number inputs post strings - do not make the UI cast them."""
    scoreboard_id, players = api.setup_game(["Abhiram"])
    round_id = api.current_round_id(scoreboard_id)

    response = api.submit(
        scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": "25"}]
    )
    assert response.status_code == 201
    assert api.leaderboard(scoreboard_id)[0]["score"] == 25


def test_non_numeric_points_are_rejected(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram"])
    round_id = api.current_round_id(scoreboard_id)

    for bad in ["abc", None, 20.5, True, [], {}]:
        response = api.submit(
            scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": bad}]
        )
        assert response.status_code == 400, bad
        assert response.get_json()["error"] == "INVALID_SCORE", bad


def test_same_player_twice_in_one_payload_is_rejected(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram"])
    round_id = api.current_round_id(scoreboard_id)

    response = api.submit(
        scoreboard_id,
        round_id,
        [
            {"playerId": players["Abhiram"], "points": 20},
            {"playerId": players["Abhiram"], "points": 40},
        ],
    )
    assert response.status_code == 409
    assert response.get_json()["error"] == "DUPLICATE_SCORE"


def test_scoring_twice_in_the_same_round_is_rejected(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    round_id = api.current_round_id(scoreboard_id)

    api.submit(scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 20}])
    response = api.submit(
        scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 5}]
    )

    assert response.status_code == 409
    assert response.get_json()["error"] == "DUPLICATE_SCORE"


def test_resubmitting_a_complete_round_is_rejected(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    round_id = api.current_round_id(scoreboard_id)
    api.submit(
        scoreboard_id,
        round_id,
        [{"playerId": players["Abhiram"], "points": 20},
         {"playerId": players["Rahul"], "points": 10}],
    )

    response = api.submit(
        scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 1}]
    )
    assert response.status_code == 409
    assert response.get_json()["error"] == "ROUND_ALREADY_SUBMITTED"


def test_player_from_another_scoreboard_is_rejected(client, api):
    first_id, first_players = api.setup_game(["Abhiram"])
    _, second_players = api.setup_game(["Outsider"])
    round_id = api.current_round_id(first_id)

    response = api.submit(
        first_id, round_id, [{"playerId": second_players["Outsider"], "points": 10}]
    )
    assert response.status_code == 404
    assert response.get_json()["error"] == "PLAYER_NOT_FOUND"


def test_round_from_another_scoreboard_is_rejected(client, api):
    first_id, first_players = api.setup_game(["Abhiram"])
    second_id, _ = api.setup_game(["Rahul"])
    other_round_id = api.current_round_id(second_id)

    response = api.submit(
        first_id, other_round_id, [{"playerId": first_players["Abhiram"], "points": 10}]
    )
    assert response.status_code == 409
    assert response.get_json()["error"] == "ROUND_NOT_IN_SCOREBOARD"


def test_submission_is_atomic(client, api):
    """Section 22: one bad entry must undo the whole submission.

    Player 3 is invalid, so players 1 and 2 must NOT be written either.
    """
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul", "Monish"])
    round_id = api.current_round_id(scoreboard_id)

    response = api.submit(
        scoreboard_id,
        round_id,
        [
            {"playerId": players["Abhiram"], "points": 20},
            {"playerId": players["Rahul"], "points": 15},
            {"playerId": players["Monish"], "points": "not-a-number"},
        ],
    )
    assert response.status_code == 400

    # Nothing at all was stored.
    leaderboard = api.leaderboard(scoreboard_id)
    assert all(entry["score"] == 0 for entry in leaderboard)

    scores = client.get(f"/api/scoreboards/{scoreboard_id}/scores").get_json()
    assert scores["scores"] == []


def test_partial_submission_is_allowed_and_tracked(client, api):
    """The voice layer will send one player at a time."""
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul", "Monish"])
    round_id = api.current_round_id(scoreboard_id)

    body = api.submit(
        scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 20}]
    ).get_json()

    assert body["roundComplete"] is False
    assert {p["name"] for p in body["missingPlayers"]} == {"Rahul", "Monish"}


def test_scores_cannot_be_submitted_before_start(client, api):
    scoreboard = api.create_scoreboard()
    api.add_player(scoreboard["id"], "Abhiram")

    # No round exists yet in SETUP, so this is a 404 on the round...
    response = api.submit(scoreboard["id"], 1, [{"playerId": 1, "points": 10}])
    assert response.status_code in (404, 409)
    assert response.get_json()["error"] in (
        "ROUND_NOT_FOUND", "SCOREBOARD_NOT_STARTED"
    )


def test_empty_scores_array_is_rejected(client, api):
    scoreboard_id, _ = api.setup_game(["Abhiram"])
    round_id = api.current_round_id(scoreboard_id)

    response = api.submit(scoreboard_id, round_id, [])
    assert response.status_code == 400
    assert response.get_json()["error"] == "EMPTY_SCORES"


def test_missing_scores_key_is_rejected(client, api):
    scoreboard_id, _ = api.setup_game(["Abhiram"])
    round_id = api.current_round_id(scoreboard_id)

    response = client.post(
        f"/api/scoreboards/{scoreboard_id}/rounds/{round_id}/scores", json={}
    )
    assert response.status_code == 400
    assert response.get_json()["error"] == "INVALID_REQUEST"


# ---------------------------------------------------------------------------
# set_score (GameBoard addition) — the running-total boards write here
# ---------------------------------------------------------------------------
def test_set_score_writes_and_overwrites(client, api):
    board_id, players = api.setup_game(["Ana", "Ben"])
    round_id = api.current_round_id(board_id)
    ana = players["Ana"]

    first = client.put(
        f"/api/scoreboards/{board_id}/rounds/{round_id}/scores/{ana}",
        json={"points": 25},
    )
    assert first.status_code == 200
    assert first.get_json()["points"] == 25

    # Writing the same cell again must overwrite, not raise a duplicate error.
    again = client.put(
        f"/api/scoreboards/{board_id}/rounds/{round_id}/scores/{ana}",
        json={"points": 40},
    )
    assert again.status_code == 200
    assert again.get_json()["points"] == 40


def test_repeated_writes_to_one_cell_never_conflict(client, api):
    """Regression: a blur and an Enter both firing used to race into a 500.

    Read-then-insert let two writes both decide the row did not exist yet, and
    the second violated UNIQUE(round_id, player_id).
    """
    board_id, players = api.setup_game(["Ana", "Ben"])
    round_id = api.current_round_id(board_id)
    ana = players["Ana"]

    for points in (5, 5, 12, 12, 0, 7):
        response = client.put(
            f"/api/scoreboards/{board_id}/rounds/{round_id}/scores/{ana}",
            json={"points": points},
        )
        assert response.status_code == 200, response.get_json()

    board = client.get(f"/api/scoreboards/{board_id}/leaderboard").get_json()
    ana_row = next(r for r in board["leaderboard"] if r["playerId"] == ana)
    assert ana_row["score"] == 7


def test_adjust_accumulates_atomically(client, api):
    """ADJUST is an increment in SQL, so rapid taps cannot lose an update."""
    board_id, players = api.setup_game(["Ana", "Ben"])
    round_id = api.current_round_id(board_id)
    ana = players["Ana"]

    for _ in range(10):
        response = client.put(
            f"/api/scoreboards/{board_id}/rounds/{round_id}/scores/{ana}",
            json={"points": 3, "mode": "ADJUST"},
        )
        assert response.status_code == 200

    assert response.get_json()["points"] == 30

    # ...and downward.
    client.put(
        f"/api/scoreboards/{board_id}/rounds/{round_id}/scores/{ana}",
        json={"points": -12, "mode": "ADJUST"},
    )
    board = client.get(f"/api/scoreboards/{board_id}/leaderboard").get_json()
    ana_row = next(r for r in board["leaderboard"] if r["playerId"] == ana)
    assert ana_row["score"] == 18


def test_set_score_rejects_a_bad_mode(client, api):
    board_id, players = api.setup_game(["Ana", "Ben"])
    round_id = api.current_round_id(board_id)
    response = client.put(
        f"/api/scoreboards/{board_id}/rounds/{round_id}/scores/{players['Ana']}",
        json={"points": 5, "mode": "MULTIPLY"},
    )
    assert response.status_code == 400


def test_set_score_rejects_a_foreign_player(client, api):
    board_id, _ = api.setup_game(["Ana", "Ben"])
    other_id, other_players = api.setup_game(["Zoe"])
    round_id = api.current_round_id(board_id)

    response = client.put(
        f"/api/scoreboards/{board_id}/rounds/{round_id}/scores/{other_players['Zoe']}",
        json={"points": 5},
    )
    assert response.status_code == 404
    assert response.get_json()["error"] == "PLAYER_NOT_FOUND"
