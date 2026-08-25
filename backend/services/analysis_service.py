"""Score analysis, achievements and timeline.

Owner: Person 5 computes it, Person 4 renders it.

Everything here is derived from the `scores` table alone - no new storage.
Because the scoreboard is game-agnostic it can only ever talk about POINTS,
never about game events. So we ship "Highest Scoring Round", never
"Captured 5 territories".
"""

from services import leaderboard_service, round_service, scoreboard_service


def _mean(values):
    return round(sum(values) / len(values), 2) if values else 0


def _stdev(values):
    """Population standard deviation - our consistency measure."""
    if len(values) < 2:
        return 0.0
    average = sum(values) / len(values)
    variance = sum((value - average) ** 2 for value in values) / len(values)
    return round(variance ** 0.5, 2)


def _rank_order(cumulative_at_round):
    """[(player_id, total)] sorted best first, for one point in time."""
    return sorted(cumulative_at_round.items(), key=lambda item: (-item[1], item[0]))


def get_analysis(scoreboard_id):
    """Per-player statistics + achievements + timeline in one response.

    The frontend can use any part of it independently:
        analysis.players      -> the stats cards
        analysis.achievements -> the badges
        analysis.timeline     -> the round-by-round narrative
    """
    scoreboard_row = scoreboard_service.get_scoreboard_row(scoreboard_id)
    leaderboard = leaderboard_service.get_leaderboard(scoreboard_id)
    progression = leaderboard_service.get_cumulative_by_round(scoreboard_id)

    round_numbers = progression["roundNumbers"]
    per_player = progression["players"]

    leader_score = leaderboard[0]["score"] if leaderboard else 0
    rank_by_player = {entry["playerId"]: entry["rank"] for entry in leaderboard}

    # ------------------------------------------------------------------
    # Per-player statistics
    # ------------------------------------------------------------------
    players_analysis = []
    for entry in leaderboard:
        player_id = entry["playerId"]
        data = per_player.get(player_id, {"perRound": [], "cumulative": []})
        scored = [points for points in data["perRound"] if points is not None]

        # Round-over-round movement: how did the last round compare to the
        # one before it?
        trend = None
        if len(scored) >= 2:
            trend = scored[-1] - scored[-2]

        players_analysis.append(
            {
                "playerId": player_id,
                "name": entry["name"],
                "rank": entry["rank"],
                "total": entry["score"],
                "roundsPlayed": len(scored),
                "average": _mean(scored),
                "bestRound": max(scored) if scored else None,
                "worstRound": min(scored) if scored else None,
                "consistency": _stdev(scored),  # lower = steadier
                "lastRound": scored[-1] if scored else None,
                "trend": trend,
                # 0 for the leader, positive = points behind the leader
                "gapToLeader": leader_score - entry["score"],
                "perRound": data["perRound"],
                "cumulative": data["cumulative"],
            }
        )

    return {
        "scoreboard": scoreboard_service.serialize(scoreboard_row),
        "roundNumbers": round_numbers,
        "leaderboard": leaderboard,
        "players": players_analysis,
        "achievements": build_achievements(players_analysis, progression),
        "timeline": build_timeline(progression),
    }


# ---------------------------------------------------------------------------
# Achievements - generic, points-only (section 26)
# ---------------------------------------------------------------------------
def build_achievements(players_analysis, progression):
    """Return the badges that are actually earned. Never invent a winner.

    Every achievement is skipped rather than faked when there is not enough
    data (e.g. no comeback exists after a single round).
    """
    achievements = []
    if not players_analysis:
        return achievements

    round_numbers = progression["roundNumbers"]
    per_player = progression["players"]

    def award(code, icon, label, player, detail):
        achievements.append(
            {
                "code": code,
                "icon": icon,
                "label": label,
                "playerId": player["playerId"],
                "name": player["name"],
                "detail": detail,
            }
        )

    scored_players = [p for p in players_analysis if p["roundsPlayed"] > 0]
    if not scored_players:
        return achievements

    # 🏆 Current Leader - only when there is a clear one.
    leaders = [p for p in players_analysis if p["rank"] == 1]
    if len(leaders) == 1:
        award(
            "CURRENT_LEADER", "🏆", "Current Leader", leaders[0],
            f"{leaders[0]['total']} points",
        )

    # 🔥 Highest Scoring Round
    best = max(scored_players, key=lambda p: p["bestRound"])
    if best["bestRound"] is not None:
        award(
            "HIGHEST_ROUND", "🔥", "Highest Scoring Round", best,
            f"{best['bestRound']} points in a single round",
        )

    # 📈 Biggest Comeback - largest climb from a player's worst position.
    if len(round_numbers) >= 2:
        best_climb = None
        for player in scored_players:
            worst_rank = 1
            for index in range(len(round_numbers)):
                snapshot = {
                    pid: data["cumulative"][index]
                    for pid, data in per_player.items()
                }
                order = _rank_order(snapshot)
                position = next(
                    i for i, (pid, _) in enumerate(order, start=1)
                    if pid == player["playerId"]
                )
                worst_rank = max(worst_rank, position)

            climb = worst_rank - player["rank"]
            if climb > 0 and (best_climb is None or climb > best_climb[1]):
                best_climb = (player, climb, worst_rank)

        if best_climb:
            player, climb, worst_rank = best_climb
            award(
                "BIGGEST_COMEBACK", "📈", "Biggest Comeback", player,
                f"Climbed from #{worst_rank} to #{player['rank']}",
            )

    # ⚡ Most Improved - biggest jump between two consecutive rounds.
    best_jump = None
    for player in scored_players:
        scored = [pts for pts in player["perRound"] if pts is not None]
        for i in range(1, len(scored)):
            jump = scored[i] - scored[i - 1]
            if jump > 0 and (best_jump is None or jump > best_jump[1]):
                best_jump = (player, jump)
    if best_jump:
        award(
            "MOST_IMPROVED", "⚡", "Most Improved", best_jump[0],
            f"+{best_jump[1]} points over the previous round",
        )

    # 🎯 Most Consistent - lowest spread, needs at least 2 scored rounds.
    steady = [p for p in scored_players if p["roundsPlayed"] >= 2]
    if len(steady) >= 2:
        most_consistent = min(steady, key=lambda p: p["consistency"])
        award(
            "MOST_CONSISTENT", "🎯", "Most Consistent", most_consistent,
            f"Spread of only {most_consistent['consistency']} points per round",
        )

    # 👑 Led the Most Rounds
    if round_numbers:
        lead_counts = {}
        for index in range(len(round_numbers)):
            snapshot = {
                pid: data["cumulative"][index] for pid, data in per_player.items()
            }
            order = _rank_order(snapshot)
            if order and order[0][1] != 0:
                top_score = order[0][1]
                tied_leaders = [pid for pid, total in order if total == top_score]
                if len(tied_leaders) == 1:
                    lead_counts[tied_leaders[0]] = lead_counts.get(tied_leaders[0], 0) + 1

        if lead_counts:
            top_player_id = max(lead_counts, key=lead_counts.get)
            rounds_led = lead_counts[top_player_id]
            player = next(
                (p for p in players_analysis if p["playerId"] == top_player_id), None
            )
            if player and rounds_led > 1:
                award(
                    "LED_MOST_ROUNDS", "👑", "Led the Most Rounds", player,
                    f"Top of the board after {rounds_led} rounds",
                )

    return achievements


# ---------------------------------------------------------------------------
# Timeline - the story of the scoreboard, told only through points
# ---------------------------------------------------------------------------
def build_timeline(progression):
    """One narrative event per round, derived from the cumulative totals.

    Round 1  Abhiram takes the lead.
    Round 2  Monish moves into first place.
    Round 3  Rahul closes the gap to 5 points.
    Round 4  Monish extends the lead to 20 points.
    """
    round_numbers = progression["roundNumbers"]
    per_player = progression["players"]

    if not round_numbers or not per_player:
        return []

    timeline = []
    previous_leader_id = None
    previous_gap = None

    for index, round_number in enumerate(round_numbers):
        snapshot = {pid: data["cumulative"][index] for pid, data in per_player.items()}
        order = _rank_order(snapshot)

        # Nobody has scored anything yet - no story to tell.
        if not order or all(total == 0 for _, total in order):
            continue

        leader_id, leader_total = order[0]
        tied = [pid for pid, total in order if total == leader_total]
        runner_up_total = order[1][1] if len(order) > 1 else leader_total
        gap = leader_total - runner_up_total

        leader_name = per_player[leader_id]["name"]

        if len(tied) > 1:
            names = " and ".join(per_player[pid]["name"] for pid in tied)
            event = {
                "type": "TIE_AT_TOP",
                "message": f"{names} are level at the top on {leader_total} points.",
                "playerIds": tied,
            }
        elif previous_leader_id is None:
            event = {
                "type": "LEAD_TAKEN",
                "message": f"{leader_name} takes the lead with {leader_total} points.",
                "playerIds": [leader_id],
            }
        elif leader_id != previous_leader_id:
            event = {
                "type": "LEAD_CHANGE",
                "message": f"{leader_name} moves into first place with "
                           f"{leader_total} points.",
                "playerIds": [leader_id],
            }
        elif previous_gap is not None and gap > previous_gap:
            event = {
                "type": "LEAD_EXTENDED",
                "message": f"{leader_name} extends the lead to {gap} points.",
                "playerIds": [leader_id],
            }
        elif previous_gap is not None and gap < previous_gap:
            chaser_id = order[1][0] if len(order) > 1 else leader_id
            chaser_name = per_player[chaser_id]["name"]
            event = {
                "type": "GAP_CLOSED",
                "message": f"{chaser_name} closes the gap to {gap} points.",
                "playerIds": [chaser_id, leader_id],
            }
        else:
            event = {
                "type": "LEAD_HELD",
                "message": f"{leader_name} stays in front on {leader_total} points.",
                "playerIds": [leader_id],
            }

        event["round"] = round_number
        event["leaderId"] = leader_id
        event["leaderName"] = leader_name
        timeline.append(event)

        previous_leader_id = leader_id if len(tied) == 1 else None
        previous_gap = gap

    return timeline


def get_player_analysis(scoreboard_id, player_id):
    """Stats for one player - the per-player card in Person 4's UI."""
    analysis = get_analysis(scoreboard_id)
    for player in analysis["players"]:
        if player["playerId"] == player_id:
            return player

    from errors import player_not_found

    raise player_not_found(player_id)


def get_summary(scoreboard_id):
    """A compact roll-up. Also the natural source for TTS lines later on."""
    scoreboard_row = scoreboard_service.get_scoreboard_row(scoreboard_id)
    leaderboard = leaderboard_service.get_leaderboard(scoreboard_id)
    result = leaderboard_service.determine_winner(leaderboard)

    total_points = sum(entry["score"] for entry in leaderboard)
    rounds_played = round_service.count_rounds(scoreboard_id)

    return {
        "scoreboard": scoreboard_service.serialize(scoreboard_row),
        "roundsPlayed": rounds_played,
        "playerCount": len(leaderboard),
        "totalPointsScored": total_points,
        "leader": leaderboard[0] if leaderboard else None,
        "tie": result["tie"],
        "tiedPlayers": result["tiedPlayers"],
    }
