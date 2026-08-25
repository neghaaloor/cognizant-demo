"""/health must prove Flask AND SQLite are alive - not just return "ok"."""


def test_health_reports_database_connected(client):
    response = client.get("/health")
    body = response.get_json()

    assert response.status_code == 200
    assert body["status"] == "ok"
    assert body["server"] == "running"
    assert body["database"] == "connected"


def test_index_is_useful_in_a_browser(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.get_json()["health"] == "/health"


def test_unknown_route_returns_the_standard_error_shape(client):
    response = client.get("/api/does-not-exist")
    body = response.get_json()

    assert response.status_code == 404
    assert body["success"] is False
    assert body["error"] == "NOT_FOUND"
    assert "message" in body


def test_cors_headers_are_present(client):
    """Without these the frontend sees a CORS error, not the real problem."""
    response = client.get("/health")
    assert response.headers["Access-Control-Allow-Origin"] == "*"
