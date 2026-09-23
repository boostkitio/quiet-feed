#!/bin/bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
node_path="${1:?Node path missing}"
export QUIET_FEED_STATE_DIR="$quiet_state"
export TYPESAFE_API_KEY="$(/usr/bin/security find-generic-password -a "$quiet_account" -s "$quiet_key_service" -w)"
if [[ -z "$TYPESAFE_API_KEY" ]]; then
  printf '%s\n' 'Saved TypeSafe key is unavailable. Run start-mac.sh from Terminal.' >&2
  exit 1
fi
exec "$node_path" "$quiet_root/dist/server.mjs"
