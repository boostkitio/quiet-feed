#!/bin/bash
set -euo pipefail
if [[ "$(uname -s)" != 'Darwin' ]]; then
  printf '%s\n' 'This control runs on macOS.' >&2
  exit 1
fi
source "$(dirname "${BASH_SOURCE[0]}")/mac/common.sh"
quiet_check_own_agent
if /bin/launchctl print "gui/$quiet_uid/$quiet_label" >/dev/null 2>&1; then
  /bin/launchctl bootout "gui/$quiet_uid/$quiet_label"
  printf '%s\n' 'Quiet Feed stopped until you run Start again or next sign in.'
else
  printf '%s\n' 'Quiet Feed is not running.'
fi
