#!/usr/bin/env sh
set -eu
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GITHUB_REPOSITORY:?Set owner/repository}"
: "${GITHUB_REPOSITORY_ID:?Set the numeric GitHub repository ID}"
REGION=us-east4
DEPLOYER="github-deployer@$GCP_PROJECT_ID.iam.gserviceaccount.com"
RUNTIME="pebble-api@$GCP_PROJECT_ID.iam.gserviceaccount.com"
NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')

gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com monitoring.googleapis.com \
  --project="$GCP_PROJECT_ID" --quiet
for name in github-deployer pebble-api; do
  if ! gcloud iam service-accounts describe "$name@$GCP_PROJECT_ID.iam.gserviceaccount.com" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$name" --project="$GCP_PROJECT_ID" --quiet
  fi
done
if ! gcloud artifacts repositories describe meet-people --location="$REGION" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create meet-people --repository-format=docker --location="$REGION" --project="$GCP_PROJECT_ID" --quiet
fi
gcloud artifacts repositories add-iam-policy-binding meet-people --location="$REGION" --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:$DEPLOYER" --role=roles/artifactregistry.writer --condition=None --quiet >/dev/null
for role in roles/run.admin roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:$DEPLOYER" --role="$role" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
if ! gcloud secrets describe pebble-supabase-service-role --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud secrets create pebble-supabase-service-role --replication-policy=automatic --project="$GCP_PROJECT_ID" --quiet
fi
gcloud secrets add-iam-policy-binding pebble-supabase-service-role --project="$GCP_PROJECT_ID" \
  --member="serviceAccount:$RUNTIME" --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
if ! gcloud iam workload-identity-pools describe github --location=global --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create github --location=global --display-name='GitHub releases' --project="$GCP_PROJECT_ID" --quiet
fi
if ! gcloud iam workload-identity-pools providers describe github-actions --workload-identity-pool=github --location=global --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc github-actions --location=global --workload-identity-pool=github \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
    --attribute-condition="assertion.repository_id == '$GITHUB_REPOSITORY_ID' && assertion.ref.startsWith('refs/tags/v')" \
    --project="$GCP_PROJECT_ID" --quiet
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --project="$GCP_PROJECT_ID" \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository_id/$GITHUB_REPOSITORY_ID" \
  --role=roles/iam.workloadIdentityUser --condition=None --quiet >/dev/null

gh variable set GCP_PROJECT_ID --repo "$GITHUB_REPOSITORY" --body "$GCP_PROJECT_ID"
gh variable set GCP_REGION --repo "$GITHUB_REPOSITORY" --body "$REGION"
gh variable set GAR_REPOSITORY --repo "$GITHUB_REPOSITORY" --body meet-people
gh variable set GCP_DEPLOY_SA_EMAIL --repo "$GITHUB_REPOSITORY" --body "$DEPLOYER"
gh variable set GCP_WIF_PROVIDER --repo "$GITHUB_REPOSITORY" --body "projects/$NUMBER/locations/global/workloadIdentityPools/github/providers/github-actions"
gh variable set FIREBASE_HOSTING_SITE_ID --repo "$GITHUB_REPOSITORY" --body "$GCP_PROJECT_ID"

if [ -z "$(gcloud monitoring uptime list-configs --project="$GCP_PROJECT_ID" --filter='displayName=pebble-api-health' --format='value(name)')" ]; then
  gcloud monitoring uptime create pebble-api-health --project="$GCP_PROJECT_ID" \
    --resource-type=uptime-url --resource-labels="host=$GCP_PROJECT_ID.web.app,project_id=$GCP_PROJECT_ID" \
    --protocol=https --path=/api/health --validate-ssl=true --status-codes=200 \
    --matcher-content='"status":"ok"' --period=5 --timeout=30 \
    --regions=usa-iowa,usa-oregon,usa-virginia --quiet
fi
