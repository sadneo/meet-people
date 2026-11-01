#!/usr/bin/env sh
set -eu
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${API_IMAGE:?Set API_IMAGE to an immutable Artifact Registry image digest}"
: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Set SUPABASE_PUBLISHABLE_KEY}"
ENABLED=${EVENT_GROUP_WORKER_ENABLED:-false}
case "$ENABLED" in true|false) ;; *) exit 1 ;; esac

set -- --clear-secrets
if [ "$ENABLED" = true ]; then
  set -- "--set-secrets=EVENT_GROUP_WORKER_JWT=${WORKER_SECRET:-pebble-event-group-worker-jwt}:latest"
fi

gcloud run jobs deploy "${WORKER_JOB:-pebble-event-group-worker}" \
  --project="$GCP_PROJECT_ID" --region="${GCP_REGION:-us-east4}" \
  --image="$API_IMAGE" \
  --service-account="${WORKER_RUNTIME_ACCOUNT:-pebble-event-group-worker@$GCP_PROJECT_ID.iam.gserviceaccount.com}" \
  --command=node --args=dist/api/api/event-group-worker-main.js \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=300s \
  --cpu=1 --memory=512Mi \
  --set-env-vars="SUPABASE_URL=$SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY,EVENT_GROUP_WORKER_ID=${WORKER_JOB:-production-worker},EVENT_GROUP_WORKER_ENABLED=$ENABLED,MATCHMAKING_SCORING_ENABLED=$ENABLED" \
  "$@" --quiet
