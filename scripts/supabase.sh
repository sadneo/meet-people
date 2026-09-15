#!/usr/bin/env sh
set -eu

podman_socket="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock"

if [ -z "${DOCKER_HOST:-}" ] && [ -S "$podman_socket" ]; then
  export DOCKER_HOST="unix://$podman_socket"
fi

pnpm exec supabase "$@"
