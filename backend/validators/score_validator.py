"""Score submission validation - the strictest layer in the backend.

Owner: Person 6.

Everything here runs BEFORE a single row is inserted (section 22 of the spec):
validate the whole payload first, then write it inside one transaction, so a
bad entry for player 7 can never leave players 1-6 half-saved.

Order of checks (cheapest and most specific first, so the error the frontend
gets points at the real problem):

    payload shape -> points type -> points range -> duplicates in payload
    -> round belongs to this scoreboard -> players belong to this scoreboard
    -> player already scored this round
"""

from config import Config
from errors import (
    ApiError,
    DUPLICATE_SCORE,
    EMPTY_SCORES,
    INVALID_REQUEST,
    INVALID_SCORE,
    NEGATIVE_SCORE_NOT_ALLOWED,
    PLAYER_NOT_FOUND,
    ROUND_NOT_IN_SCOREBOARD,
    SCORE_OUT_OF_RANGE,
)


def validate_points(raw_points, player_id=None):
    """Return a clean int, or raise.

    Accepted : 20, -10, 0, "25"  (HTML number inputs arrive as strings)
    Rejected : true, 20.5, "abc", None, ""

    `True` is rejected explicitly because in Python `isinstance(True, int)`
    is True, and a stray boolean would silently score 1 point.
    """
    where = f" for player {player_id}" if player_id is not None else ""

    if isinstance(raw_points, bool) or raw_points is None:
        raise ApiError(
            INVALID_SCORE, f"Points{where} must be a whole number.", 400
        )

    if isinstance(raw_points, int):
        points = raw_points
    elif isinstance(raw_points, float):
        if not raw_points.is_integer():
            raise ApiError(
                INVALID_SCORE,
                f"Points{where} must be a whole number, not {raw_points}.",
                400,
            )
        points = int(raw_points)
    elif isinstance(raw_points, str):
        try:
            points = int(raw_points.strip())
        except ValueError:
            raise ApiError(
                INVALID_SCORE,
                f"Points{where} must be a whole number, got '{raw_points}'.",
                400,
            )
    else:
        raise ApiError(
            INVALID_SCORE, f"Points{where} must be a whole number.", 400
        )

    # The scoreboard is game-agnostic: plenty of card games have penalties,
    # so negative points are legal unless the team turns them off.
    if points < 0 and not Config.ALLOW_NEGATIVE_SCORES:
        raise ApiError(
            NEGATIVE_SCORE_NOT_ALLOWED,
            f"Negative points{where} are not allowed on this scoreboard.",
            400,
        )

    if points < Config.MIN_SCORE or points > Config.MAX_SCORE:
        raise ApiError(
            SCORE_OUT_OF_RANGE,
            f"Points{where} must be between {Config.MIN_SCORE} and "
            f"{Config.MAX_SCORE}.",
            400,
        )

    return points


def validate_payload(body):
    """Unpack {"scores": [{"playerId": 1, "points": 20}, ...]}.

    Returns a list of (player_id, points) tuples, already type-checked and
    duplicate-free.
    """
    if not isinstance(body, dict):
        raise ApiError(INVALID_REQUEST, "Request body must be a JSON object.", 400)

    raw_scores = body.get("scores")
    if raw_scores is None:
        raise ApiError(
            INVALID_REQUEST,
            "Request body must contain a 'scores' array.",
            400,
        )

    if not isinstance(raw_scores, list):
        raise ApiError(INVALID_REQUEST, "'scores' must be an array.", 400)

    if not raw_scores:
        raise ApiError(
            EMPTY_SCORES,
            "'scores' cannot be empty - send at least one player's points.",
            400,
        )

    cleaned = []
    seen_player_ids = set()

    for index, entry in enumerate(raw_scores):
        if not isinstance(entry, dict):
            raise ApiError(
                INVALID_REQUEST,
                f"scores[{index}] must be an object with playerId and points.",
                400,
            )

        raw_player_id = entry.get("playerId", entry.get("player_id"))
        if raw_player_id is None:
            raise ApiError(
                INVALID_REQUEST, f"scores[{index}] is missing 'playerId'.", 400
            )

        try:
            player_id = int(raw_player_id)
        except (TypeError, ValueError):
            raise ApiError(
                INVALID_REQUEST,
                f"scores[{index}].playerId must be a number.",
                400,
            )

        # Same player twice in ONE request - the classic double-tap on the
        # submit button, or a voice command repeated.
        if player_id in seen_player_ids:
            raise ApiError(
                DUPLICATE_SCORE,
                f"Player {player_id} appears more than once in this submission.",
                409,
            )
        seen_player_ids.add(player_id)

        if "points" not in entry:
            raise ApiError(
                INVALID_REQUEST, f"scores[{index}] is missing 'points'.", 400
            )

        cleaned.append((player_id, validate_points(entry["points"], player_id)))

    return cleaned


def require_round_in_scoreboard(round_row, scoreboard_id):
    """Stops Round 3 of scoreboard #7 being scored through scoreboard #2."""
    if round_row["scoreboard_id"] != scoreboard_id:
        raise ApiError(
            ROUND_NOT_IN_SCOREBOARD,
            f"Round {round_row['id']} does not belong to scoreboard "
            f"{scoreboard_id}.",
            409,
        )


def require_players_in_scoreboard(player_ids, scoreboard_players):
    """Every playerId in the payload must be on THIS scoreboard."""
    valid_ids = {player["id"] for player in scoreboard_players}
    unknown = [pid for pid in player_ids if pid not in valid_ids]
    if unknown:
        raise ApiError(
            PLAYER_NOT_FOUND,
            f"These players are not on this scoreboard: "
            f"{', '.join(str(pid) for pid in unknown)}.",
            404,
            details={"unknownPlayerIds": unknown},
        )


def require_not_already_scored(player_ids, already_scored_ids, player_names):
    """A player holds at most one score per round (DB enforces it too).

    We check it here first so the caller gets DUPLICATE_SCORE with a readable
    message instead of a raw sqlite3.IntegrityError.
    """
    clashes = [pid for pid in player_ids if pid in already_scored_ids]
    if clashes:
        names = ", ".join(player_names.get(pid, str(pid)) for pid in clashes)
        raise ApiError(
            DUPLICATE_SCORE,
            f"Already scored in this round: {names}. "
            f"Submit the next round instead.",
            409,
            details={"playerIds": clashes},
        )
