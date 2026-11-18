#!/usr/bin/env sh
set -eu
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${API_IMAGE:?Set API_IMAGE to an immutable Artifact Registry image digest}"
: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Set SUPABASE_PUBLISHABLE_KEY}"

# Both environments deploy identically; only resource names differ.
case "${DEPLOY_ENVIRONMENT:-}" in
  sandbox) SUFFIX=-sandbox ;;
  production) SUFFIX= ;;
  *) echo 'Choose sandbox or production.' >&2; exit 1 ;;
esac
ENVIRONMENT=$DEPLOY_ENVIRONMENT
SERVICE=pebble-api$SUFFIX
REGION=${GCP_REGION:-us-east4}
RUNTIME="$SERVICE@$GCP_PROJECT_ID.iam.gserviceaccount.com"
DATABASE=$(node --input-type=module -e "import { supabaseRefs } from '$(cd "$(dirname "$0")" && pwd)/configure-deployment.mjs'; console.log('https://' + supabaseRefs['$ENVIRONMENT'] + '.supabase.co')")
[ "$GCP_PROJECT_ID" = cse416-meet-people ] && [ "$REGION" = us-east4 ] && [ "$SUPABASE_URL" = "$DATABASE" ] &&
  [ "${API_SERVICE:-$SERVICE}" = "$SERVICE" ] &&
  [ "${API_SECRET:-pebble-supabase-service-role$SUFFIX}" = "pebble-supabase-service-role$SUFFIX" ] &&
  [ "${API_RUNTIME_ACCOUNT:-$RUNTIME}" = "$RUNTIME" ] || {
    echo "$ENVIRONMENT requires its own project, region, database, API service, secret and identity." >&2
    exit 1
  }

# Update only settings managed here; preserve unrelated runtime configuration.
gcloud run deploy "$SERVICE" \
  --project="$GCP_PROJECT_ID" --region="$REGION" \
  --image="$API_IMAGE" \
  --service-account="$RUNTIME" \
  --port=8080 --cpu=1 --memory=512Mi --concurrency=40 \
  --min=0 --max=2 --cpu-throttling --timeout=55s \
  "--update-env-vars=SUPABASE_URL=$SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY,GOOGLE_MAPS_STORAGE_APPROVED=true,GOOGLE_MAPS_REQUESTS_PER_DAY=200,GOOGLE_MAPS_OAUTH_PROJECT=$GCP_PROJECT_ID" \
  "--update-secrets=SUPABASE_SERVICE_ROLE_KEY=pebble-supabase-service-role$SUFFIX:latest,GOOGLE_MAPS_SERVER_API_KEY=pebble-google-maps-server-key-$ENVIRONMENT:1,SEARCH_LOCATION_SIGNING_KEY=pebble-search-location-signing-key-$ENVIRONMENT:1" \
  "--network=pebble-$ENVIRONMENT-egress" "--subnet=pebble-$ENVIRONMENT-egress-$REGION" --vpc-egress=all-traffic \
  --allow-unauthenticated --quiet
