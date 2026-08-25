"""Board Game Scorekeeper - Flask application entry point.

Owners: Person 5 (core APIs) and Person 6 (validation, rules, error contract).

Run locally:
    cd backend
    python app.py

Run the way Cloud Run does:
    gunicorn --bind :8080 --workers 1 --threads 8 app:app
"""

import logging
import sqlite3
import time
import uuid

from flask import Flask, g, jsonify, request

from config import Config
from database import database as db
from errors import (
    ApiError,
    DATABASE_ERROR,
    INTERNAL_ERROR,
    INVALID_JSON,
    METHOD_NOT_ALLOWED,
    NOT_FOUND,
)
from logging_config import configure_logging
from routes import (
    analysis_routes,
    player_routes,
    round_routes,
    score_routes,
    scoreboard_routes,
)

log = logging.getLogger("scorekeeper")


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    configure_logging(app)

    # Tables are created on boot. CREATE TABLE IF NOT EXISTS makes this safe
    # to run on every cold start of a Cloud Run container.
    db.init_db(app)
    log.info("database ready at %s", app.config["DATABASE_PATH"])

    # A connection is opened lazily per request and always closed here.
    app.teardown_appcontext(db.close_db)

    register_request_hooks(app)
    register_error_handlers(app)
    register_health(app)

    app.register_blueprint(scoreboard_routes.bp)
    app.register_blueprint(player_routes.bp)
    app.register_blueprint(round_routes.bp)
    app.register_blueprint(score_routes.bp)
    app.register_blueprint(analysis_routes.bp)

    return app


# ---------------------------------------------------------------------------
# CORS + request logging
# ---------------------------------------------------------------------------
def register_request_hooks(app):
    """CORS is done by hand so the project stays on plain Flask.

    Without this the browser blocks every call from the frontend origin, and
    the symptom Person 1/2 will see in DevTools is a CORS error rather than a
    backend error - see docs/TROUBLESHOOTING.md.
    """

    @app.before_request
    def start_timer():
        g.request_id = request.headers.get("X-Request-Id", str(uuid.uuid4())[:8])
        g.started_at = time.time()

    @app.before_request
    def handle_preflight():
        # The browser sends OPTIONS before any POST carrying JSON.
        if request.method == "OPTIONS":
            return _apply_cors(app, app.make_default_options_response())

    @app.after_request
    def finish(response):
        response = _apply_cors(app, response)
        response.headers["X-Request-Id"] = getattr(g, "request_id", "-")

        duration_ms = int((time.time() - getattr(g, "started_at", time.time())) * 1000)
        # One structured line per request - this is what Person 7 reads in
        # Cloud Logging when the frontend reports "the API is broken".
        log.info(
            "%s %s -> %s (%sms)",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
            extra={
                "http_method": request.method,
                "http_path": request.path,
                "http_status": response.status_code,
                "duration_ms": duration_ms,
                "request_id": getattr(g, "request_id", "-"),
            },
        )
        return response


def _apply_cors(app, response):
    origins = app.config["CORS_ORIGINS"]
    origin = request.headers.get("Origin")

    if origins == "*":
        response.headers["Access-Control-Allow-Origin"] = "*"
    elif origin and origin in [item.strip() for item in origins.split(",")]:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"

    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PATCH, DELETE, OPTIONS"
    )
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Request-Id"
    response.headers["Access-Control-Max-Age"] = "3600"
    return response


# ---------------------------------------------------------------------------
# Error handling - one shape for every failure
# ---------------------------------------------------------------------------
def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(error):
        # Expected, well-described failures: wrong state, bad input, 404.
        log.warning(
            "%s %s -> %s: %s",
            request.method,
            request.path,
            error.error,
            error.message,
            extra={"error_code": error.error, "request_id": getattr(g, "request_id", "-")},
        )
        return error.to_response()

    @app.errorhandler(400)
    def handle_bad_request(error):
        return (
            jsonify(
                {
                    "success": False,
                    "error": INVALID_JSON,
                    "message": "The request body could not be parsed. Send valid "
                               "JSON with Content-Type: application/json.",
                }
            ),
            400,
        )

    @app.errorhandler(404)
    def handle_not_found(error):
        return (
            jsonify(
                {
                    "success": False,
                    "error": NOT_FOUND,
                    "message": f"No route matches {request.method} {request.path}.",
                }
            ),
            404,
        )

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        return (
            jsonify(
                {
                    "success": False,
                    "error": METHOD_NOT_ALLOWED,
                    "message": f"{request.method} is not allowed on {request.path}.",
                }
            ),
            405,
        )

    @app.errorhandler(sqlite3.Error)
    def handle_database_error(error):
        # The database itself failed - disk, lock, or a broken query.
        log.exception(
            "database error on %s %s", request.method, request.path,
            extra={"request_id": getattr(g, "request_id", "-")},
        )
        return (
            jsonify(
                {
                    "success": False,
                    "error": DATABASE_ERROR,
                    "message": "A database error occurred. Check /health and the "
                               "server logs.",
                }
            ),
            500,
        )

    @app.errorhandler(Exception)
    def handle_unexpected(error):
        # Anything we did not anticipate. The stack trace goes to the logs,
        # never to the client.
        log.exception(
            "unhandled error on %s %s", request.method, request.path,
            extra={"request_id": getattr(g, "request_id", "-")},
        )
        return (
            jsonify(
                {
                    "success": False,
                    "error": INTERNAL_ERROR,
                    "message": "Something went wrong on the server.",
                    "requestId": getattr(g, "request_id", "-"),
                }
            ),
            500,
        )


# ---------------------------------------------------------------------------
# Health check - the first thing to hit when anything looks broken
# ---------------------------------------------------------------------------
def register_health(app):
    @app.get("/health")
    def health():
        """Proves three layers at once: Cloud Run, Flask, SQLite.

        It really runs `SELECT 1` against the database rather than just
        reporting "ok", so a green /health means the whole chain works.
        Returns 503 (not 500) when the database is unreachable, so Cloud Run
        treats the instance as unhealthy.
        """
        database_state = "connected"
        status_code = 200

        try:
            if not db.ping():
                database_state = "unreachable"
                status_code = 503
        except sqlite3.Error as exc:
            log.exception("health check failed")
            database_state = f"error: {exc.__class__.__name__}"
            status_code = 503

        return (
            jsonify(
                {
                    "status": "ok" if status_code == 200 else "degraded",
                    "server": "running",
                    "database": database_state,
                    "databasePath": app.config["DATABASE_PATH"],
                }
            ),
            status_code,
        )

    @app.get("/")
    def index():
        """Tiny landing page so a browser hit on the Cloud Run URL is useful."""
        return jsonify(
            {
                "service": "Board Game Scorekeeper API",
                "status": "running",
                "health": "/health",
                "docs": "See docs/API_CONTRACT.md in the repository.",
            }
        )


app = create_app()

if __name__ == "__main__":
    log.info("starting on %s:%s", Config.HOST, Config.PORT)
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
