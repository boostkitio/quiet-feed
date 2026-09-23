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
fi
if [[ -f "$quiet_plist" ]]; then /bin/rm "$quiet_plist"; fi
printf '%s\n' 'Automatic startup disabled. Your Keychain key, pairing and feedback remain saved.'
