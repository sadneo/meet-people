#!/usr/bin/env sh
set -eu
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${API_IMAGE:?Set API_IMAGE to an immutable Artifact Registry image digest}"
: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Set SUPABASE_PUBLISHABLE_KEY}"

# Defaults preserve the existing manual production deployment command.
SERVICE=${API_SERVICE:-pebble-api}
REGION=${GCP_REGION:-us-east4}
ENV_VARS="SUPABASE_URL=$SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY"
SECRETS="SUPABASE_SERVICE_ROLE_KEY=${API_SECRET:-pebble-supabase-service-role}:latest"
ENV_FLAG=--set-env-vars
SECRET_FLAG=--set-secrets
set --
case "${DEPLOY_ENVIRONMENT:-production}" in
  sandbox)
    # Operator-provisioned resources, approved for sandbox only. No secret values in Git.
    [ "$GCP_PROJECT_ID" = cse416-meet-people ] &&
      [ "$REGION" = us-east4 ] &&
      [ "$SERVICE" = pebble-api-sandbox ] &&
      [ "${API_SECRET:-}" = pebble-supabase-service-role-sandbox ] &&
      [ "${API_RUNTIME_ACCOUNT:-}" = "pebble-api-sandbox@$GCP_PROJECT_ID.iam.gserviceaccount.com" ] &&
      [ "$SUPABASE_URL" = https://wixdiotkntapwrbibaom.supabase.co ] || {
        echo 'Sandbox Maps requires its approved sandbox service, database, identity and us-east4 network.' >&2
        exit 1
      }
    ENV_VARS="$ENV_VARS,GOOGLE_MAPS_STORAGE_APPROVED=true,GOOGLE_MAPS_REQUESTS_PER_DAY=2000"
    SECRETS="$SECRETS,GOOGLE_MAPS_SERVER_API_KEY=pebble-google-maps-server-key-sandbox:1,SEARCH_LOCATION_SIGNING_KEY=pebble-search-location-signing-key-sandbox:1"
    # Merge into existing sandbox settings rather than dropping other runtime configuration.
    ENV_FLAG=--update-env-vars
    SECRET_FLAG=--update-secrets
    set -- --network=pebble-sandbox-egress --subnet=pebble-sandbox-egress-us-east4 --vpc-egress=all-traffic
    ;;
  production)
    [ "$SERVICE" = pebble-api ] || { echo 'Production deployment requires pebble-api.' >&2; exit 1; }
    ;;
  *) echo 'Choose sandbox or production.' >&2; exit 1 ;;
esac
gcloud run deploy "$SERVICE" \
  --project="$GCP_PROJECT_ID" --region="$REGION" \
  --image="$API_IMAGE" \
  --service-account="${API_RUNTIME_ACCOUNT:-pebble-api@$GCP_PROJECT_ID.iam.gserviceaccount.com}" \
  --port=8080 --cpu=1 --memory=512Mi --concurrency=40 \
  --min=0 --max=2 --cpu-throttling --timeout=55s \
  "$ENV_FLAG=$ENV_VARS" \
  "$SECRET_FLAG=$SECRETS" \
  "$@" \
  --allow-unauthenticated --quiet
