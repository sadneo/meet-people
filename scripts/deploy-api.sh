#!/usr/bin/env sh
set -eu
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${API_IMAGE:?Set API_IMAGE to an immutable Artifact Registry image digest}"
: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Set SUPABASE_PUBLISHABLE_KEY}"

# Defaults preserve the existing manual production deployment command.
SERVICE=${API_SERVICE:-pebble-api}
gcloud run deploy "$SERVICE" \
  --project="$GCP_PROJECT_ID" --region="${GCP_REGION:-us-east4}" \
  --image="$API_IMAGE" \
  --service-account="${API_RUNTIME_ACCOUNT:-pebble-api@$GCP_PROJECT_ID.iam.gserviceaccount.com}" \
  --port=8080 --cpu=1 --memory=512Mi --concurrency=40 \
  --min=0 --max=2 --cpu-throttling --timeout=55s \
  --set-env-vars="SUPABASE_URL=$SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=${API_SECRET:-pebble-supabase-service-role}:latest" \
  --allow-unauthenticated --quiet
