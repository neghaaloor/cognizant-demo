# ============================================================================
# Board Game Scorekeeper - container image for GCP Cloud Run
# Owner: Person 7
#
# Build & deploy:
#   gcloud builds submit --tag gcr.io/PROJECT_ID/scorekeeper
#   gcloud run deploy scorekeeper \
#       --image gcr.io/PROJECT_ID/scorekeeper \
#       --region asia-south1 \
#       --allow-unauthenticated \
#       --max-instances 1          # <-- see the note on SQLite below
# ============================================================================

FROM python:3.11-slim

# Faster, quieter, no .pyc clutter in the image.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so Docker can cache this layer between code changes.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Only the backend goes in the image. The frontend is static and is served
# separately (or from a bucket) - it does not belong in the API container.
COPY backend/ /app/

# ---------------------------------------------------------------------------
# SQLite on Cloud Run
# ---------------------------------------------------------------------------
# The container filesystem is read-only except /tmp, so the database file
# lives there. /tmp is an in-memory tmpfs: the data is WIPED when the instance
# is recycled, and two instances would each hold their own separate copy.
#
# That is acceptable for this project because SQLite is a fixed requirement of
# the use case - but deploy with --max-instances 1 so all traffic hits the same
# instance and the same file. See docs/DEPLOYMENT.md.
ENV DATABASE_PATH=/tmp/scorekeeper.db \
    PORT=8080 \
    JSON_LOGS=true \
    LOG_LEVEL=INFO

EXPOSE 8080

# Cloud Run injects $PORT; never hard-code it.
# 1 worker keeps every request on one process, which is what a single SQLite
# file wants. Threads give us concurrency without a second copy of the DB
# handle pool.
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 60 app:app
