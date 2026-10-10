#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
beta_data="${AIADCAST_BETA_DATA_DIR:-$PWD/release/beta-runtime}"
mkdir -p "$beta_data"
export AIADCAST_BETA_DATA_DIR="$beta_data"
# Kernel lock releases after a crash. A second instance must never recover active jobs.
exec flock --nonblock --no-fork "$beta_data/server-process.lock" env AIADCAST_BETA_PROCESS_LOCKED=1 node --use-env-proxy server/beta-server.mjs
