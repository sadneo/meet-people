#!/usr/bin/env sh
set -eu
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GITHUB_REPOSITORY:?Set owner/repository}"
: "${GITHUB_REPOSITORY_ID:?Set the numeric GitHub repository ID}"
ENVIRONMENT=${DEPLOY_ENVIRONMENT:-production}
case "$ENVIRONMENT" in production) SUFFIX= ;; sandbox) SUFFIX=-sandbox ;; *) exit 1 ;; esac
REGION=us-east4
DEPLOYER="github-deployer$SUFFIX@$GCP_PROJECT_ID.iam.gserviceaccount.com"
RUNTIME="pebble-api$SUFFIX@$GCP_PROJECT_ID.iam.gserviceaccount.com"
PUSH="pebble-push-dispatcher$SUFFIX@$GCP_PROJECT_ID.iam.gserviceaccount.com"
# Account IDs are at most 30 characters, so sandbox shortens the scheduler name.
SCHEDULER_ID=pebble-worker-scheduler
if [ "$ENVIRONMENT" = sandbox ]; then SCHEDULER_ID=pebble-scheduler-sandbox; fi
SCHEDULER="$SCHEDULER_ID@$GCP_PROJECT_ID.iam.gserviceaccount.com"
REPOSITORY="meet-people$SUFFIX"
PROVIDER="github-actions$SUFFIX"
POOL="github$SUFFIX"
WORKER_ID=pebble-event-group-worker
if [ "$ENVIRONMENT" = sandbox ]; then WORKER_ID=pebble-worker-sandbox; fi
NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')

gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com monitoring.googleapis.com \
  cloudscheduler.googleapis.com fcm.googleapis.com \
  --project="$GCP_PROJECT_ID" --quiet
for name in "github-deployer$SUFFIX" "pebble-api$SUFFIX" "$WORKER_ID" "pebble-push-dispatcher$SUFFIX" "$SCHEDULER_ID"; do
  if ! gcloud iam service-accounts describe "$name@$GCP_PROJECT_ID.iam.gserviceaccount.com" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$name" --project="$GCP_PROJECT_ID" --quiet
  fi
done
if ! gcloud artifacts repositories describe "$REPOSITORY" --location="$REGION" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPOSITORY" --repository-format=docker --location="$REGION" --project="$GCP_PROJECT_ID" --quiet
fi
gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" --location="$REGION" --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:$DEPLOYER" --role=roles/artifactregistry.writer --condition=None --quiet >/dev/null
for role in roles/run.admin roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer roles/cloudscheduler.admin; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:$DEPLOYER" --role="$role" --condition=None --quiet >/dev/null
done
WORKER="$WORKER_ID@$GCP_PROJECT_ID.iam.gserviceaccount.com"
# Google Maps OAuth bills requests to the project, which needs serviceUsageConsumer.
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:$RUNTIME" --role=roles/serviceusage.serviceUsageConsumer --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:$PUSH" --role=roles/firebasecloudmessaging.admin --condition=None --quiet >/dev/null
for account in "$RUNTIME" "$WORKER" "$PUSH" "$SCHEDULER"; do
  gcloud iam service-accounts add-iam-policy-binding "$account" --project="$GCP_PROJECT_ID" \
    --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
done
# Secret values are populated separately from stdin; see docs/deployment.md.
grant_secret() {
  secret=$1; shift
  if ! gcloud secrets describe "$secret" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$secret" --replication-policy=automatic --project="$GCP_PROJECT_ID" --quiet
  fi
  for account in "$@"; do
    gcloud secrets add-iam-policy-binding "$secret" --project="$GCP_PROJECT_ID" \
      --member="serviceAccount:$account" --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
  done
}
grant_secret "pebble-supabase-service-role$SUFFIX" "$RUNTIME" "$PUSH"
grant_secret "pebble-event-group-worker-credentials-$ENVIRONMENT" "$WORKER"
grant_secret "pebble-google-maps-server-key-$ENVIRONMENT" "$RUNTIME"
grant_secret "pebble-search-location-signing-key-$ENVIRONMENT" "$RUNTIME"
if ! gcloud iam workload-identity-pools describe "$POOL" --location=global --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub $ENVIRONMENT" --project="$GCP_PROJECT_ID" --quiet
fi
REF_CONDITION="assertion.ref == 'refs/heads/main'"
if [ "$ENVIRONMENT" = sandbox ]; then REF_CONDITION="assertion.ref in ['refs/heads/main', 'refs/heads/dev']"; fi
CONDITION="assertion.repository_id == '$GITHUB_REPOSITORY_ID' && assertion.environment == '$ENVIRONMENT' && assertion.workflow_ref == '$GITHUB_REPOSITORY/.github/workflows/release.yml@' + assertion.ref && ($REF_CONDITION)"
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool="$POOL" --location=global --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
    --attribute-condition="$CONDITION" \
    --project="$GCP_PROJECT_ID" --quiet
else
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --workload-identity-pool="$POOL" --location=global \
    --attribute-condition="$CONDITION" \
    --project="$GCP_PROJECT_ID" --quiet
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --project="$GCP_PROJECT_ID" \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$GITHUB_REPOSITORY_ID" \
  --role=roles/iam.workloadIdentityUser --condition=None --quiet >/dev/null

gh variable set GCP_PROJECT_ID --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "$GCP_PROJECT_ID"
gh variable set GCP_REGION --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "$REGION"
gh variable set GAR_REPOSITORY --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "$REPOSITORY"
gh variable set GCP_DEPLOY_SA_EMAIL --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "$DEPLOYER"
gh variable set GCP_WIF_PROVIDER --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
gh variable set API_SERVICE --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "pebble-api$SUFFIX"
gh variable set API_RUNTIME_ACCOUNT --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "$RUNTIME"
gh variable set API_SECRET --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "pebble-supabase-service-role$SUFFIX"
gh variable set WORKER_JOB --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "pebble-event-group-worker$SUFFIX"
gh variable set WORKER_RUNTIME_ACCOUNT --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "$WORKER"
gh variable set FIREBASE_WEB_SITE_ID --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "$GCP_PROJECT_ID$SUFFIX"
MOBILE_SITE="$GCP_PROJECT_ID-mobile"
if [ "$ENVIRONMENT" = sandbox ]; then MOBILE_SITE="$GCP_PROJECT_ID-dev"; fi
gh variable set FIREBASE_MOBILE_SITE_ID --repo "$GITHUB_REPOSITORY" --env "$ENVIRONMENT" --body "$MOBILE_SITE"

if [ -z "$(gcloud monitoring uptime list-configs --project="$GCP_PROJECT_ID" --filter="displayName=pebble-api-health$SUFFIX" --format='value(name)')" ]; then
  gcloud monitoring uptime create "pebble-api-health$SUFFIX" --project="$GCP_PROJECT_ID" \
    --resource-type=uptime-url --resource-labels="host=$GCP_PROJECT_ID$SUFFIX.web.app,project_id=$GCP_PROJECT_ID" \
    --protocol=https --path=/api/health --validate-ssl=true --status-codes=200 \
    --matcher-content='"status":"ok"' --period=5 --timeout=30 \
    --regions=usa-iowa,usa-oregon,usa-virginia --quiet
fi
