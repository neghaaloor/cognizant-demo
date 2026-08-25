"""Leaderboard ranking, analysis, achievements and timeline."""

import pytest


@pytest.fixture
def played_game(api):
    """The worked example from the spec.

        Round 1  Abhiram 20  Rahul 15  Monish 30  Arjun 10
        Round 2  Abhiram 25  Rahul 30  Monish 20  Arjun 15
        Round 3  Abhiram 10  Rahul 20  Monish 30  Arjun 25

        Totals   Monish 80, Rahul 65, Abhiram 55, Arjun 50
    """
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
    return scoreboard_id, players


def test_leaderboard_matches_the_worked_example(client, played_game, api):
    scoreboard_id, _ = played_game
    leaderboard = api.leaderboard(scoreboard_id)

    assert [(e["name"], e["score"], e["rank"]) for e in leaderboard] == [
        ("Monish", 80, 1),
        ("Rahul", 65, 2),
        ("Abhiram", 55, 3),
        ("Arjun", 50, 4),
    ]


def test_players_with_no_scores_still_appear(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Rahul"])
    round_id = api.current_round_id(scoreboard_id)
    api.submit(scoreboard_id, round_id, [{"playerId": players["Abhiram"], "points": 20}])

    leaderboard = api.leaderboard(scoreboard_id)
    assert len(leaderboard) == 2
    assert leaderboard[1]["name"] == "Rahul"
    assert leaderboard[1]["score"] == 0


def test_ties_share_a_rank_and_skip_the_next(client, api):
    """Standard competition ranking: 1, 2, 2, 4."""
    scoreboard_id, players = api.setup_game(["A", "B", "C", "D"])
    api.play_round(
        scoreboard_id,
        {players["A"]: 50, players["B"]: 30, players["C"]: 30, players["D"]: 10},
    )

    ranks = {e["name"]: e["rank"] for e in api.leaderboard(scoreboard_id)}
    assert ranks == {"A": 1, "B": 2, "C": 2, "D": 4}


def test_analysis_statistics(client, played_game):
    scoreboard_id, _ = played_game
    analysis = client.get(
        f"/api/scoreboards/{scoreboard_id}/analysis"
    ).get_json()["analysis"]

    by_name = {p["name"]: p for p in analysis["players"]}

    monish = by_name["Monish"]
    assert monish["total"] == 80
    assert monish["rank"] == 1
    assert monish["average"] == pytest.approx(26.67, abs=0.01)
    assert monish["bestRound"] == 30
    assert monish["worstRound"] == 20
    assert monish["gapToLeader"] == 0
    assert monish["perRound"] == [30, 20, 30]
    assert monish["cumulative"] == [30, 50, 80]

    # Everyone else is measured against the leader.
    assert by_name["Rahul"]["gapToLeader"] == 15
    assert by_name["Arjun"]["gapToLeader"] == 30
    # Round-over-round movement: Arjun went 15 -> 25.
    assert by_name["Arjun"]["trend"] == 10


def test_achievements_are_generic_and_earned(client, played_game):
    scoreboard_id, _ = played_game
    achievements = client.get(
        f"/api/scoreboards/{scoreboard_id}/achievements"
    ).get_json()["achievements"]

    codes = {a["code"] for a in achievements}
    assert "CURRENT_LEADER" in codes
    assert "HIGHEST_ROUND" in codes

    leader = next(a for a in achievements if a["code"] == "CURRENT_LEADER")
    assert leader["name"] == "Monish"
    assert leader["icon"] == "🏆"


def test_no_achievements_before_any_score(client, api):
    scoreboard_id, _ = api.setup_game(["Abhiram", "Rahul"])
    achievements = client.get(
        f"/api/scoreboards/{scoreboard_id}/achievements"
    ).get_json()["achievements"]

    # Never award a leader when nobody has scored anything.
    assert achievements == []


def test_timeline_tracks_the_lead(client, played_game):
    scoreboard_id, _ = played_game
    timeline = client.get(
        f"/api/scoreboards/{scoreboard_id}/timeline"
    ).get_json()["timeline"]

    assert len(timeline) == 3
    assert timeline[0]["round"] == 1
    # Monish leads from round 1 (30) and never loses it.
    assert timeline[0]["leaderName"] == "Monish"
    assert timeline[0]["type"] == "LEAD_TAKEN"
    assert all(event["leaderName"] == "Monish" for event in timeline)


def test_timeline_reports_a_lead_change(client, api):
    scoreboard_id, players = api.setup_game(["Abhiram", "Monish"])
    # Round 1: Abhiram ahead. Round 2: Monish overtakes.
    api.play_round(
        scoreboard_id, {players["Abhiram"]: 30, players["Monish"]: 10}, advance=True
    )
    api.play_round(scoreboard_id, {players["Abhiram"]: 5, players["Monish"]: 40})

    timeline = client.get(
        f"/api/scoreboards/{scoreboard_id}/timeline"
    ).get_json()["timeline"]

    assert timeline[0]["leaderName"] == "Abhiram"
    assert timeline[1]["type"] == "LEAD_CHANGE"
    assert timeline[1]["leaderName"] == "Monish"


def test_summary_endpoint(client, played_game):
    scoreboard_id, _ = played_game
    body = client.get(f"/api/scoreboards/{scoreboard_id}/summary").get_json()

    assert body["roundsPlayed"] == 3
    assert body["playerCount"] == 4
    assert body["totalPointsScored"] == 250
    assert body["leader"]["name"] == "Monish"
    assert body["tie"] is False


def test_analysis_for_a_single_player(client, played_game, api):
    scoreboard_id, players = played_game
    body = client.get(
        f"/api/scoreboards/{scoreboard_id}/analysis/players/{players['Rahul']}"
    ).get_json()

    assert body["player"]["name"] == "Rahul"
    assert body["player"]["total"] == 65
    assert body["player"]["rank"] == 2
