#!/bin/bash
set -euo pipefail
quiet_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
quiet_label='com.boostkit.quietfeed.companion'
quiet_key_service='com.boostkit.quietfeed.typesafe-api-key'
quiet_plist="$HOME/Library/LaunchAgents/$quiet_label.plist"
quiet_state="$HOME/Library/Application Support/QuietFeed"
quiet_uid="$(/usr/bin/id -u)"
quiet_account="$(/usr/bin/id -un)"

quiet_xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  printf '%s' "$value"
}

quiet_check_own_agent() {
  if [[ -f "$quiet_plist" ]] && ! /usr/bin/grep -Fq "<string>$(quiet_xml_escape "$quiet_root/mac/runner.sh")</string>" "$quiet_plist"; then
    printf '%s\n' 'Quiet Feed startup belongs to another folder. Disable it from that folder before moving this installation.' >&2
    exit 1
  fi
}
