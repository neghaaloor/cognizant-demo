"""The section 43 milestone, end to end.

    Create -> Add players -> Start -> Round -> Submit -> Leaderboard
    -> History -> Analysis -> End -> Winner -> Reset

If this test passes, the backend is ready for the frontend team to integrate.
"""


def test_the_whole_game(client):
    # 1. Create the scoreboard -------------------------------------------
    response = client.post("/api/scoreboards", json={"name": "Friday Night"})
    assert response.status_code == 201
    scoreboard_id = response.get_json()["scoreboard"]["id"]

    # 2. Add players (no cap during setup) --------------------------------
    names = ["Abhiram", "Rahul", "Monish", "Arjun", "Karthik"]
    player_ids = {}
    for name in names:
        created = client.post(
            f"/api/scoreboards/{scoreboard_id}/players", json={"name": name}
        )
        assert created.status_code == 201
        player_ids[name] = created.get_json()["player"]["id"]

    # 3. Start -> ACTIVE, Round 1 open, roster locked ----------------------
    started = client.post(f"/api/scoreboards/{scoreboard_id}/start").get_json()
    assert started["scoreboard"]["status"] == "ACTIVE"
    assert started["scoreboard"]["currentRound"] == 1

    # 4-6. Play three rounds ----------------------------------------------
    all_rounds = [
        {"Abhiram": 20, "Rahul": 15, "Monish": 30, "Arjun": 10, "Karthik": 5},
        {"Abhiram": 25, "Rahul": 30, "Monish": 20, "Arjun": 15, "Karthik": 35},
        {"Abhiram": 10, "Rahul": 20, "Monish": 30, "Arjun": 25, "Karthik": 15},
    ]
    for index, points in enumerate(all_rounds):
        current = client.get(
            f"/api/scoreboards/{scoreboard_id}/rounds/current"
        ).get_json()["round"]

        submitted = client.post(
            f"/api/scoreboards/{scoreboard_id}/rounds/{current['id']}/scores",
            json={
                "scores": [
                    {"playerId": player_ids[name], "points": value}
                    for name, value in points.items()
                ]
            },
        )
        assert submitted.status_code == 201
        assert submitted.get_json()["roundComplete"] is True

        if index < len(all_rounds) - 1:
            nxt = client.post(f"/api/scoreboards/{scoreboard_id}/rounds")
            assert nxt.status_code == 201

    # 7. Leaderboard -------------------------------------------------------
    leaderboard = client.get(
        f"/api/scoreboards/{scoreboard_id}/leaderboard"
    ).get_json()["leaderboard"]
    totals = {entry["name"]: entry["score"] for entry in leaderboard}
    assert totals == {
        "Abhiram": 55, "Rahul": 65, "Monish": 80, "Arjun": 50, "Karthik": 55
    }
    assert leaderboard[0]["name"] == "Monish"

    # 8. History -----------------------------------------------------------
    history = client.get(
        f"/api/scoreboards/{scoreboard_id}/history"
    ).get_json()["history"]
    assert history["roundNumbers"] == [1, 2, 3]
    assert len(history["players"]) == 5

    # 9. Analysis ----------------------------------------------------------
    analysis = client.get(
        f"/api/scoreboards/{scoreboard_id}/analysis"
    ).get_json()["analysis"]
    assert len(analysis["players"]) == 5
    assert len(analysis["timeline"]) == 3
    assert analysis["achievements"]

    # 10. End -> winner ----------------------------------------------------
    ended = client.post(f"/api/scoreboards/{scoreboard_id}/end").get_json()
    assert ended["winner"]["name"] == "Monish"
    assert ended["winner"]["score"] == 80
    assert ended["tie"] is False
    assert ended["scoreboard"]["status"] == "ENDED"

    # 11. Reset -> same players, clean slate -------------------------------
    reset = client.post(f"/api/scoreboards/{scoreboard_id}/reset").get_json()
    assert reset["scoreboard"]["status"] == "ACTIVE"
    assert reset["scoreboard"]["currentRound"] == 1
    assert {p["name"] for p in reset["scoreboard"]["players"]} == set(names)

    fresh = client.get(
        f"/api/scoreboards/{scoreboard_id}/leaderboard"
    ).get_json()["leaderboard"]
    assert all(entry["score"] == 0 for entry in fresh)


def test_cascade_delete_removes_everything(client, api):
    """Deleting a scoreboard must not leave orphan players / rounds / scores."""
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    api.play_round(scoreboard_id, {players["Abhiram"]: 10, players["Rahul"]: 20})

    assert client.delete(f"/api/scoreboards/{scoreboard_id}").status_code == 200
    assert client.get(f"/api/scoreboards/{scoreboard_id}").status_code == 404
    assert client.get(f"/api/scoreboards/{scoreboard_id}/players").status_code == 404
