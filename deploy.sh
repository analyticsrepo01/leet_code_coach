#!/usr/bin/env bash
set -euo pipefail

PROJECT=${PROJECT:?Set PROJECT environment variable}
REGION=${REGION:-us-central1}
SERVICE_NAME=${SERVICE_NAME:-livecoach}
LIVE_MODEL=${LIVE_MODEL:-gemini-live-2.5-flash-native-audio}
LIVE_VOICE=${LIVE_VOICE:-Puck}
CHAT_MODEL=${CHAT_MODEL:-gemini-4-argon}
CHAT_LOCATION=${CHAT_LOCATION:-global}
TARGET_FIRM=${TARGET_FIRM:-a top quant trading firm}
AVATAR_PROJECT_ID=${AVATAR_PROJECT_ID:-}
ACCESS_TOKEN=${ACCESS_TOKEN:-leetcode2026}
AUTH_FLAG="--allow-unauthenticated"
if [[ "${REQUIRE_IAM_AUTH:-false}" == "true" ]]; then
  AUTH_FLAG="--no-allow-unauthenticated"
fi

echo "Deploying ${SERVICE_NAME} to Cloud Run in project ${PROJECT} (${REGION})..."

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --timeout 3600 \
  --session-affinity \
  --min-instances 1 \
  --max-instances 3 \
  --cpu 2 \
  --memory 2Gi \
  --concurrency 20 \
  --no-cpu-throttling \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},LIVE_MODEL=${LIVE_MODEL},LIVE_VOICE=${LIVE_VOICE},CHAT_MODEL=${CHAT_MODEL},CHAT_LOCATION=${CHAT_LOCATION},TARGET_FIRM=${TARGET_FIRM},AVATAR_PROJECT_ID=${AVATAR_PROJECT_ID},ACCESS_TOKEN=${ACCESS_TOKEN}" \
  ${AUTH_FLAG} \
  --quiet

URL=$(gcloud run services describe "${SERVICE_NAME}" --project "${PROJECT}" --region "${REGION}" --format 'value(status.url)')
echo "Deployed successfully: ${URL}"
