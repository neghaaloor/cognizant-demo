# GCP Deployment Runbook — Person 7

Cloud Run + IAM + Cloud Logging + Cloud Monitoring. That is the whole GCP scope
for this project. **Do not add more services to make it look bigger** — this is
already a meaningful cloud implementation for this use case.

---

## 0. Deploy in the right order

Do **not** start by deploying everything. Each step must pass before the next:

```
Local backend works       →  pytest passes, smoke_test.sh passes
        ↓
Pushed to GitHub          →  main is green
        ↓
Docker image builds       →  docker build succeeds locally
        ↓
Cloud Run deploy          →  revision serving
        ↓
/health returns 200       →  Cloud Run + Flask + SQLite all confirmed
        ↓
smoke_test.sh vs the URL  →  every endpoint works in the cloud
        ↓
Frontend connects         →  CORS set to the real origin
        ↓
Multi-device test         →  two phones, same scoreboard
        ↓
Web Speech (Person 3)     →  only now
```

If a step fails, fix it there. Never skip ahead — a voice bug and a CORS bug
look identical from the frontend.

---

## 1. One-time project setup

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com
```

---

## 2. Build and deploy

From the repository root (where the `Dockerfile` is):

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/scorekeeper

gcloud run deploy scorekeeper \
  --image gcr.io/YOUR_PROJECT_ID/scorekeeper \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --max-instances 1 \
  --memory 512Mi \
  --timeout 60
```

`--allow-unauthenticated` is required — the frontend calls this from a browser
with no GCP credentials.

Get the URL:

```bash
gcloud run services describe scorekeeper --region asia-south1 \
  --format='value(status.url)'
```

---

## 3. ⚠️ `--max-instances 1` is mandatory

**Read this before you deploy.**

SQLite is a single file on a single machine. Cloud Run will happily run several
instances of your container, and **each one gets its own separate copy of that
file**. The symptom is brutal to debug: a player adds a score, someone else
refreshes, and the score is gone — because their request hit a different
instance holding a different database.

```
      WITHOUT --max-instances 1              WITH --max-instances 1

   Phone A ──▶ Instance 1 ──▶ DB #1        Phone A ──┐
   Phone B ──▶ Instance 2 ──▶ DB #2        Phone B ──┼──▶ Instance ──▶ one DB
              scores diverge               Phone C ──┘      consistent
```

**Also know:** the database lives at `/tmp/scorekeeper.db`, because the Cloud Run
filesystem is read-only everywhere else. `/tmp` is in-memory and is **wiped when
the instance recycles** (after idle time or on redeploy). A game in progress
survives; data does not persist across restarts.

This is an accepted trade-off — **SQLite is a fixed requirement of the use
case.** Document it in your report as a known scalability limitation, and state
that a persistent managed database would be the future migration path. **Do not
switch to Firestore or Cloud SQL to "fix" it.**

Practical advice for the demo: do the run-through in one sitting, and re-seed
with `./scripts/smoke_test.sh` if the instance recycled.

---

## 4. Environment variables

Set on the service, not in code:

```bash
gcloud run services update scorekeeper --region asia-south1 \
  --set-env-vars "CORS_ORIGINS=https://your-frontend-origin,JSON_LOGS=true,LOG_LEVEL=INFO"
```

| Variable | Cloud Run value | Why |
|---|---|---|
| `DATABASE_PATH` | `/tmp/scorekeeper.db` | Only writable path (already in the Dockerfile) |
| `PORT` | injected by Cloud Run | Never hard-code it |
| `CORS_ORIGINS` | your frontend origin | `*` works but tighten before the final demo |
| `JSON_LOGS` | `true` | Makes Cloud Logging parse severity and fields |
| `LOG_LEVEL` | `INFO` | `DEBUG` while diagnosing |
| `ALLOW_NEGATIVE_SCORES` | `true` | Only change if the team decides otherwise |

---

## 5. Verify — before telling anyone the API is up

```bash
URL=$(gcloud run services describe scorekeeper --region asia-south1 --format='value(status.url)')

curl $URL/health                    # must be {"status":"ok","database":"connected"}
./scripts/smoke_test.sh $URL        # must print FAILED: 0
```

`/health` is meaningful because it actually runs `SELECT 1` against SQLite. A
green `/health` proves **Cloud Run + Flask + SQLite** all work. If it is green
and the frontend still fails, the problem is in the frontend request or CORS —
not the backend.

---

## 6. IAM — least privilege

**Do not give everyone Owner.**

| Who | Role | Why |
|---|---|---|
| The Cloud Run runtime service account | `roles/logging.logWriter` | Write logs. That's all it needs — the app talks to no other GCP service |
| Person 7 (you) | `roles/run.admin`, `roles/cloudbuild.builds.editor`, `roles/iam.serviceAccountUser` | Deploy |
| Persons 1–6, 8 | `roles/run.viewer`, `roles/logging.viewer` | Read logs to debug their own layer |

Create a dedicated runtime account rather than using the default:

```bash
gcloud iam service-accounts create scorekeeper-run \
  --display-name "Scorekeeper Cloud Run runtime"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member "serviceAccount:scorekeeper-run@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/logging.logWriter"

gcloud run services update scorekeeper --region asia-south1 \
  --service-account scorekeeper-run@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

Give teammates read access:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member "user:teammate@example.com" --role "roles/logging.viewer"
```

**Never commit a service account key.** `.gitignore` already blocks
`service-account*.json` and `gcp-key*.json`. Cloud Run uses the attached service
account automatically — you do not need a key file at all.

---

## 7. Cloud Logging

The app already emits structured JSON with a `severity` field, so filters work
immediately.

```bash
# Live tail
gcloud beta run services logs tail scorekeeper --region asia-south1

# Errors only, last hour
gcloud logging read \
  'resource.type="cloud_run_revision"
   resource.labels.service_name="scorekeeper"
   severity>=ERROR' \
  --limit 50 --freshness 1h
```

Useful filters in the Cloud Console Logs Explorer:

| Goal | Filter |
|---|---|
| All errors | `severity>=ERROR` |
| One specific request | `jsonPayload.request_id="a1b2c3d4"` |
| Slow requests | `jsonPayload.duration_ms>1000` |
| A failing endpoint | `jsonPayload.http_path="/api/scoreboards/1/leaderboard"` |
| Validation rejections | `jsonPayload.error_code="DUPLICATE_PLAYER"` |
| Failed requests | `jsonPayload.http_status>=400` |

**Every API response carries an `X-Request-Id` header** that matches
`jsonPayload.request_id`. When a teammate reports a failure, ask for that id and
you can find their exact request instantly.

---

## 8. Cloud Monitoring

Create an uptime check against `/health` (Console → Monitoring → Uptime checks):

- Path `/health`, every 5 minutes, alert after 2 failures
- Notify the team channel or your email

Worth watching: request count, request latency (p95), instance count (should
stay at 1), container memory, and the 5xx rate.

---

## 9. Rollback

```bash
# List revisions
gcloud run revisions list --service scorekeeper --region asia-south1

# Send all traffic back to a known-good one
gcloud run services update-traffic scorekeeper --region asia-south1 \
  --to-revisions scorekeeper-00003-abc=100
```

Test a new revision without exposing it to the team first:

```bash
gcloud run deploy scorekeeper --image gcr.io/PROJECT/scorekeeper --no-traffic --tag next
# gives you https://next---scorekeeper-xxx.run.app to test in isolation
```

---

## 10. Test the container locally first

Cheaper and faster than debugging a failed deploy:

```bash
docker build -t scorekeeper .
docker run -p 8080:8080 -e PORT=8080 scorekeeper
curl http://localhost:8080/health
./scripts/smoke_test.sh
```

If it works here and fails on Cloud Run, the difference is environment
variables, IAM, or the port — not the code.

---

## Deployment checklist

- [ ] `pytest` passes locally (58 tests)
- [ ] `./scripts/smoke_test.sh` passes locally
- [ ] `docker build` succeeds and the container serves `/health`
- [ ] APIs enabled on the GCP project
- [ ] Deployed **with `--max-instances 1`**
- [ ] `/health` returns 200 on the Cloud Run URL
- [ ] `./scripts/smoke_test.sh <cloud-run-url>` prints `FAILED: 0`
- [ ] `CORS_ORIGINS` set to the real frontend origin
- [ ] Dedicated runtime service account with only `logging.logWriter`
- [ ] Teammates have `logging.viewer` (nobody has Owner)
- [ ] Uptime check on `/health`
- [ ] Cloud Run URL shared with Persons 1–4
- [ ] SQLite ephemerality noted in the project report
