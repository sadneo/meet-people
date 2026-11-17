#!/usr/bin/env sh
set -eu

supabase_bin="$(cd "$(dirname "$0")/.." && pwd)/node_modules/.bin/supabase"
if [ ! -x "$supabase_bin" ]; then
  echo 'Run pnpm install first.' >&2
  exit 1
fi

podman_socket="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock"

if [ -z "${DOCKER_HOST:-}" ] && [ -S "$podman_socket" ]; then
  export DOCKER_HOST="unix://$podman_socket"
fi

engine_socket="$podman_socket"
case "${DOCKER_HOST:-}" in
  unix://*) engine_socket="${DOCKER_HOST#unix://}" ;;
esac

# Podman's stdin-tar `cp` (how the Supabase CLI copies the db key file) breaks while another stack's db
# runs, so the CLI's docker calls go through a shim whenever they reach a Podman socket. Real Docker is untouched.
docker_bin="$(command -v docker 2>/dev/null || true)"
case "$engine_socket" in *podman*) podman_engine=1 ;; *) podman_engine= ;; esac
if [ -S "$engine_socket" ] && command -v podman >/dev/null 2>&1 &&
  { [ -n "$podman_engine" ] || [ -z "$docker_bin" ] || readlink -f "$docker_bin" | grep -qi podman || docker --version 2>&1 | grep -qi podman; }; then
  export CONTAINER_HOST="unix://$engine_socket"
  PATH="$(cd "$(dirname "$0")" && pwd)/lib/podman-remote:$PATH"
  export PATH
fi

exec "$supabase_bin" "$@"
