#!/usr/bin/env sh
set -eu
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${API_IMAGE:?Set API_IMAGE to an immutable Artifact Registry image digest}"
: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Set SUPABASE_PUBLISHABLE_KEY}"
# Proxies that add an X-Forwarded-For entry (see docs/events-backend.md); set
# LOG_CLIENT_IP=1 for one deploy to measure it. --set-env-vars replaces every value.
TRUST_PROXY_HOPS="${TRUST_PROXY_HOPS:-1}"
case "$TRUST_PROXY_HOPS" in [0-5]) ;; *) echo "TRUST_PROXY_HOPS must be 0-5" >&2; exit 1 ;; esac
case "${LOG_CLIENT_IP:-}" in ''|1) ;; *) echo "LOG_CLIENT_IP must be empty or 1" >&2; exit 1 ;; esac

# Region/service must match the checked-in Firebase rewrite.
gcloud run deploy pebble-api \
  --project="$GCP_PROJECT_ID" --region=us-east4 \
  --image="$API_IMAGE" \
  --service-account="pebble-api@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --port=8080 --cpu=1 --memory=512Mi --concurrency=40 \
  --min=0 --max=2 --cpu-throttling --timeout=55s \
  --set-env-vars="SUPABASE_URL=$SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY,TRUST_PROXY_HOPS=$TRUST_PROXY_HOPS${LOG_CLIENT_IP:+,LOG_CLIENT_IP=$LOG_CLIENT_IP}" \
  --set-secrets=SUPABASE_SERVICE_ROLE_KEY=pebble-supabase-service-role:latest \
  --allow-unauthenticated --quiet
