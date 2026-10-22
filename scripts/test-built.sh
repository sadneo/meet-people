#!/usr/bin/env sh
set -eu
PORT=3101 node --env-file-if-exists=.env.local dist/api/api/server.js &
api_pid=$!
API_PORT=3101 VITE_PREVIEW_PORT=3100 node node_modules/vite/bin/vite.js preview &
web_pid=$!
trap 'kill "$api_pid" "$web_pid" 2>/dev/null || true' EXIT INT TERM
attempt=0
until curl --fail --silent http://127.0.0.1:3100/api/health >/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || exit 1
  sleep 1
done
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm exec playwright test --config playwright.built.config.ts "$@"
