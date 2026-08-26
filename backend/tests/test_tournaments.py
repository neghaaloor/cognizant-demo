"""Tournaments: a roster playing a series of boards.

Standings are aggregated from the real games, so these check that the table
matches the scores rather than keeping its own running total.
"""

import json


def make(client, name="Friday Night", players=("Alice", "Bob", "Cara"), board="scoresheet"):
    response = client.post(
        "/api/tournaments",
        json={"name": name, "boardId": board, "boardName": "Scoresheet",
              "players": list(players)},
    )
    return response


def play(client, tournament_id, points_by_name, finish=True):
    """Open the next game, score it, optionally end it."""
    board = client.post(f"/api/tournaments/{tournament_id}/games").get_json()["scoreboard"]
    ids = {p["name"]: p["id"] for p in board["players"]}
    round_id = board["currentRoundId"]
    for name, points in points_by_name.items():
        client.put(
            f"/api/scoreboards/{board['id']}/rounds/{round_id}/scores/{ids[name]}",
            json={"points": points},
        )
    if finish:
        client.post(f"/api/scoreboards/{board['id']}/end")
    return board


# ---------------------------------------------------------------------------
# Creating
# ---------------------------------------------------------------------------
def test_create_returns_the_tournament(client):
    response = make(client)
    body = response.get_json()

    assert response.status_code == 201
    assert body["success"] is True
    assert body["tournament"]["name"] == "Friday Night"
    assert body["tournament"]["players"] == ["Alice", "Bob", "Cara"]
    assert body["tournament"]["status"] == "ACTIVE"
    assert body["tournament"]["gameCount"] == 0


def test_a_created_tournament_is_listed(client):
    """The bug this was written for: creating one and never seeing it again."""
    make(client, name="Friday Night")
    listed = client.get("/api/tournaments").get_json()["tournaments"]
    assert [t["name"] for t in listed] == ["Friday Night"]


def test_everyone_is_on_the_table_before_any_game(client):
    tournament = make(client).get_json()["tournament"]
    standings = tournament["standings"]
    assert sorted(r["name"] for r in standings) == ["Alice", "Bob", "Cara"]
    assert all(r["points"] == 0 and r["gamesPlayed"] == 0 for r in standings)


def test_names_are_trimmed_and_blanks_dropped(client):
    body = make(client, players=["  Alice  ", "", "Bob", "   "]).get_json()
    assert body["tournament"]["players"] == ["Alice", "Bob"]


def test_rejects_a_blank_name(client):
    response = client.post("/api/tournaments", json={"name": "  ", "players": ["A", "B"]})
    assert response.status_code == 400
    assert response.get_json()["error"] == "INVALID_TOURNAMENT"


def test_rejects_fewer_than_two_players(client):
    response = make(client, players=["Solo"])
    assert response.status_code == 400


def test_rejects_duplicate_players(client):
    response = make(client, players=["Ann", "ANN"])
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Games and standings
# ---------------------------------------------------------------------------
def test_a_game_is_created_started_and_carries_the_roster(client):
    tournament_id = make(client).get_json()["tournament"]["id"]
    response = client.post(f"/api/tournaments/{tournament_id}/games")
    board = response.get_json()["scoreboard"]

    assert response.status_code == 201
    assert board["status"] == "ACTIVE"           # ready to score immediately
    assert board["currentRoundId"] is not None
    assert sorted(p["name"] for p in board["players"]) == ["Alice", "Bob", "Cara"]
    assert board["tournamentId"] == tournament_id


def test_standings_aggregate_across_games(client):
    tournament_id = make(client).get_json()["tournament"]["id"]
    play(client, tournament_id, {"Alice": 30, "Bob": 20, "Cara": 10})
    play(client, tournament_id, {"Alice": 5, "Bob": 40, "Cara": 15})

    tournament = client.get(f"/api/tournaments/{tournament_id}").get_json()["tournament"]
    table = {r["name"]: r for r in tournament["standings"]}

    assert tournament["gameCount"] == 2
    assert table["Alice"]["points"] == 35
    assert table["Bob"]["points"] == 60
    assert table["Cara"]["points"] == 25
    assert table["Alice"]["wins"] == 1
    assert table["Bob"]["wins"] == 1
    assert table["Cara"]["wins"] == 0
    assert all(r["gamesPlayed"] == 2 for r in table.values())
    assert [r["name"] for r in tournament["standings"]] == ["Bob", "Alice", "Cara"]


def test_an_unfinished_game_scores_but_awards_no_win(client):
    tournament_id = make(client).get_json()["tournament"]["id"]
    play(client, tournament_id, {"Alice": 30, "Bob": 20, "Cara": 10}, finish=False)

    tournament = client.get(f"/api/tournaments/{tournament_id}").get_json()["tournament"]
    table = {r["name"]: r for r in tournament["standings"]}
    assert table["Alice"]["points"] == 30
    assert table["Alice"]["wins"] == 0, "a game still in progress has no winner yet"


def test_a_drawn_game_awards_no_win(client):
    """The scoreboard refuses to invent a tie-breaker, so neither does the table."""
    tournament_id = make(client).get_json()["tournament"]["id"]
    play(client, tournament_id, {"Alice": 20, "Bob": 20, "Cara": 5})

    tournament = client.get(f"/api/tournaments/{tournament_id}").get_json()["tournament"]
    table = {r["name"]: r for r in tournament["standings"]}
    assert table["Alice"]["wins"] == 0
    assert table["Bob"]["wins"] == 0


def test_standings_share_a_rank_on_a_tie(client):
    tournament_id = make(client).get_json()["tournament"]["id"]
    play(client, tournament_id, {"Alice": 20, "Bob": 20, "Cara": 5})

    ranks = {
        r["name"]: r["rank"]
        for r in client.get(f"/api/tournaments/{tournament_id}").get_json()["tournament"]["standings"]
    }
    assert ranks["Alice"] == ranks["Bob"] == 1
    assert ranks["Cara"] == 3, "a shared rank skips the next one"


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
def test_finishing_blocks_new_games(client):
    tournament_id = make(client).get_json()["tournament"]["id"]
    client.patch(f"/api/tournaments/{tournament_id}", json={"status": "ENDED"})

    response = client.post(f"/api/tournaments/{tournament_id}/games")
    assert response.status_code == 409


def test_deleting_keeps_the_games(client):
    tournament_id = make(client).get_json()["tournament"]["id"]
    play(client, tournament_id, {"Alice": 10, "Bob": 5, "Cara": 1})

    client.delete(f"/api/tournaments/{tournament_id}")
    assert client.get("/api/tournaments").get_json()["tournaments"] == []
    # The board itself is still there — deleting a series is not deleting history.
    assert len(client.get("/api/scoreboards").get_json()["scoreboards"]) == 1


# ---------------------------------------------------------------------------
# Ownership
# ---------------------------------------------------------------------------
def test_tournaments_are_private_to_an_account(client, other_client):
    tournament_id = make(client).get_json()["tournament"]["id"]

    assert other_client.get("/api/tournaments").get_json()["tournaments"] == []
    assert other_client.get(f"/api/tournaments/{tournament_id}").status_code == 404
    assert other_client.post(f"/api/tournaments/{tournament_id}/games").status_code == 404
    assert other_client.delete(f"/api/tournaments/{tournament_id}").status_code == 404


def test_anonymous_cannot_touch_tournaments(app):
    anonymous = app.test_client()
    assert anonymous.get("/api/tournaments").status_code == 401
    assert anonymous.post("/api/tournaments", json={"name": "x", "players": ["a", "b"]}).status_code == 401
