"""Accounts and board ownership.

These cover the bug this layer exists to fix: signing in as a different person
used to show the previous person's history. A board must belong to exactly one
account and be invisible — not merely hidden — to every other account.
"""


def sign_in(client, name):
    response = client.post("/api/session", json={"name": name})
    body = response.get_json()
    return body["user"], response.status_code


def as_user(app, user_id):
    client = app.test_client()
    client.environ_base["HTTP_X_USER_ID"] = str(user_id)
    return client


# ---------------------------------------------------------------------------
# Sign-in
# ---------------------------------------------------------------------------
def test_sign_in_creates_an_account(client):
    user, status = sign_in(client, "Jhanavi")
    assert status == 201
    assert user["name"] == "Jhanavi"
    assert isinstance(user["id"], int)


def test_same_name_is_the_same_account(client):
    first, _ = sign_in(client, "Jhanavi")
    again, status = sign_in(client, "Jhanavi")
    assert status == 200
    assert again["id"] == first["id"]


def test_sign_in_is_case_and_space_insensitive(client):
    first, _ = sign_in(client, "Jhanavi")
    for variant in ("jhanavi", "JHANAVI", "  Jhanavi  "):
        again, _ = sign_in(client, variant)
        assert again["id"] == first["id"], variant


def test_different_names_are_different_accounts(client):
    a, _ = sign_in(client, "Jhanavi")
    b, _ = sign_in(client, "Rahul")
    assert a["id"] != b["id"]


def test_blank_name_is_rejected(client):
    for bad in ("", "   ", None):
        response = client.post("/api/session", json={"name": bad})
        assert response.status_code == 400
        assert response.get_json()["error"] == "INVALID_USER_NAME"


# ---------------------------------------------------------------------------
# Authentication is required
# ---------------------------------------------------------------------------
def test_anonymous_cannot_list_boards(app):
    anonymous = app.test_client()
    response = anonymous.get("/api/scoreboards")
    assert response.status_code == 401
    assert response.get_json()["error"] == "UNAUTHENTICATED"


def test_anonymous_cannot_create_a_board(app):
    anonymous = app.test_client()
    response = anonymous.post("/api/scoreboards", json={"name": "Sneaky"})
    assert response.status_code == 401


def test_unknown_user_id_is_rejected(app):
    stranger = app.test_client()
    stranger.environ_base["HTTP_X_USER_ID"] = "999999"
    response = stranger.get("/api/scoreboards")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Isolation — the actual bug
# ---------------------------------------------------------------------------
def test_history_is_not_shared_between_accounts(app, client, other_client):
    client.post("/api/scoreboards", json={"name": "Jhanavi's Quiz"})
    client.post("/api/scoreboards", json={"name": "Jhanavi's Cards"})

    mine = client.get("/api/scoreboards").get_json()["scoreboards"]
    theirs = other_client.get("/api/scoreboards").get_json()["scoreboards"]

    assert len(mine) == 2
    assert theirs == [], "a different account must not see these boards"


def test_a_new_account_starts_with_an_empty_history(app, client):
    client.post("/api/scoreboards", json={"name": "Existing Board"})

    fresh = app.test_client()
    user = fresh.post("/api/session", json={"name": "Brand New"}).get_json()
    assert user["boards"] == []

    fresh.environ_base["HTTP_X_USER_ID"] = str(user["user"]["id"])
    assert fresh.get("/api/scoreboards").get_json()["scoreboards"] == []


def test_another_account_cannot_read_your_board(client, other_client):
    board = client.post("/api/scoreboards", json={"name": "Private"}).get_json()[
        "scoreboard"
    ]

    response = other_client.get(f"/api/scoreboards/{board['id']}")
    # 404 rather than 403: we do not confirm that a board we will not show exists.
    assert response.status_code == 404
    assert response.get_json()["error"] == "SCOREBOARD_NOT_FOUND"


def test_another_account_cannot_write_to_your_board(client, other_client):
    board = client.post("/api/scoreboards", json={"name": "Private"}).get_json()[
        "scoreboard"
    ]
    board_id = board["id"]

    blocked = [
        other_client.post(f"/api/scoreboards/{board_id}/players", json={"name": "Mallory"}),
        other_client.post(f"/api/scoreboards/{board_id}/start"),
        other_client.patch(f"/api/scoreboards/{board_id}", json={"name": "Hijacked"}),
        other_client.delete(f"/api/scoreboards/{board_id}"),
        other_client.post(f"/api/scoreboards/{board_id}/rounds"),
    ]
    for response in blocked:
        assert response.status_code == 404, response.get_json()

    # ...and the board is untouched.
    still = client.get(f"/api/scoreboards/{board_id}").get_json()["scoreboard"]
    assert still["name"] == "Private"
    assert still["players"] == []


def test_another_account_cannot_read_derived_views(client, other_client):
    board_id = client.post("/api/scoreboards", json={"name": "Private"}).get_json()[
        "scoreboard"
    ]["id"]

    for path in ("leaderboard", "history", "analysis", "summary", "scores", "players",
                 "rounds", "achievements", "timeline"):
        response = other_client.get(f"/api/scoreboards/{board_id}/{path}")
        assert response.status_code == 404, path


def test_signing_back_in_returns_your_own_boards(app, client):
    client.post("/api/scoreboards", json={"name": "Mine A"})
    client.post("/api/scoreboards", json={"name": "Mine B"})

    # Same person, brand-new device: no local state at all.
    new_device = app.test_client()
    body = new_device.post("/api/session", json={"name": "Test Owner"}).get_json()

    names = sorted(board["name"] for board in body["boards"])
    assert names == ["Mine A", "Mine B"]


def test_board_carries_its_owner_and_type(client):
    board = client.post(
        "/api/scoreboards",
        json={"name": "Quiz", "boardId": "leaderboard", "boardName": "Leaderboard",
              "config": {"step": 1, "targetScore": 50}},
    ).get_json()["scoreboard"]

    assert board["boardId"] == "leaderboard"
    assert board["boardName"] == "Leaderboard"
    assert board["config"] == {"step": 1, "targetScore": 50}
    assert board["ownerId"] is not None


def test_board_type_defaults_to_scoresheet(client):
    board = client.post("/api/scoreboards", json={"name": "Plain"}).get_json()[
        "scoreboard"
    ]
    assert board["boardId"] == "scoresheet"
