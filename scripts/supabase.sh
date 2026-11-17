#!/usr/bin/env sh
set -eu

podman_socket="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock"

if [ -z "${DOCKER_HOST:-}" ] && [ -S "$podman_socket" ]; then
  export DOCKER_HOST="unix://$podman_socket"
fi

# Local-mode `podman cp` (what the Supabase CLI uses for the db key file) fails with a broken pipe
# while another stack's db runs; the same call through the API service works. Real Docker is untouched.
docker_bin="$(command -v docker 2>/dev/null || true)"
if [ -S "$podman_socket" ] && command -v podman >/dev/null 2>&1 &&
  { [ -z "$docker_bin" ] || readlink -f "$docker_bin" | grep -qi podman || docker --version 2>&1 | grep -qi podman; }; then
  export CONTAINER_HOST="unix://$podman_socket"
  PATH="$(cd "$(dirname "$0")" && pwd)/lib/podman-remote:$PATH"
  export PATH
fi

pnpm exec supabase "$@"
