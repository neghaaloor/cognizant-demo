"""Logging setup.

Owner: Person 5/6 to emit, Person 7 to read in Cloud Logging.

Cloud Logging parses a JSON line on stdout into a structured entry, and reads
the `severity` field to colour it and to drive alerts. Plain text still works,
but then every line shows up as INFO and you lose the ability to filter for
errors - which is exactly what you need during a 3 a.m. demo failure.

Set JSON_LOGS=false locally if you prefer readable text.
"""

import json
import logging
import sys

# Python level name -> the severity string Cloud Logging expects.
_SEVERITY = {
    "DEBUG": "DEBUG",
    "INFO": "INFO",
    "WARNING": "WARNING",
    "ERROR": "ERROR",
    "CRITICAL": "CRITICAL",
}

# LogRecord attributes we never copy into the JSON payload.
_RESERVED = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename",
    "funcName", "levelname", "levelno", "lineno", "module", "msecs",
    "message", "msg", "name", "pathname", "process", "processName",
    "relativeCreated", "stack_info", "thread", "threadName", "taskName",
}


class CloudLoggingFormatter(logging.Formatter):
    def format(self, record):
        entry = {
            "severity": _SEVERITY.get(record.levelname, "INFO"),
            "message": record.getMessage(),
            "logger": record.name,
        }

        # Anything passed via logger.info(..., extra={...}) rides along as a
        # structured field you can filter on in Cloud Logging.
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                entry[key] = value

        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(entry, default=str)


def configure_logging(app):
    level = getattr(logging, app.config["LOG_LEVEL"].upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    if app.config["JSON_LOGS"]:
        handler.setFormatter(CloudLoggingFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-8s %(name)s | %(message)s")
        )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Werkzeug's own request log would duplicate our after_request line.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)

    app.logger.handlers = [handler]
    app.logger.setLevel(level)
