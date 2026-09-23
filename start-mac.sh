#!/bin/bash
set -euo pipefail
if [[ "$(uname -s)" != 'Darwin' ]]; then
  printf '%s\n' 'This launcher runs on macOS. Use Start Quiet Feed.cmd on Windows.' >&2
  exit 1
fi
source "$(dirname "${BASH_SOURCE[0]}")/mac/common.sh"
if [[ ! -f "$quiet_root/dist/server.mjs" ]]; then
  printf '%s\n' 'Companion missing. Extract the complete Mac release ZIP first.' >&2
  exit 1
fi
node_path="$(command -v node || true)"
if [[ -z "$node_path" || ! -x "$node_path" ]]; then
  printf '%s\n' 'Node.js 24 or later is required. Install it, then run this launcher again.' >&2
  exit 1
fi
node_major="$("$node_path" -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 24 )); then
  printf '%s\n' 'Node.js 24 or later is required.' >&2
  exit 1
fi
quiet_check_own_agent
quiet_loaded=false
if /bin/launchctl print "gui/$quiet_uid/$quiet_label" >/dev/null 2>&1; then
  quiet_loaded=true
  if [[ ! -f "$quiet_plist" ]]; then
    printf '%s\n' 'Another Quiet Feed agent is running without this installation file. Stop it before continuing.' >&2
    exit 1
  fi
elif /usr/sbin/lsof -nP -iTCP:43127 -sTCP:LISTEN >/dev/null 2>&1; then
  printf '%s\n' 'Port 43127 is already used by another process. Stop that companion before starting Quiet Feed.' >&2
  exit 1
fi

# Keychain prompts on the first installation. The key never enters a command argument, plist or log.
if ! /usr/bin/security find-generic-password -a "$quiet_account" -s "$quiet_key_service" -w >/dev/null 2>&1; then
  printf '%s\n' 'Enter your own TypeSafe API key in the macOS Keychain prompt. It will be saved for future logins.'
  /usr/bin/security add-generic-password -a "$quiet_account" -s "$quiet_key_service" -w
fi
/bin/mkdir -p "$quiet_state" "$HOME/Library/LaunchAgents"
/bin/chmod 700 "$quiet_state"
umask 077
quiet_runner_xml="$(quiet_xml_escape "$quiet_root/mac/runner.sh")"
quiet_node_xml="$(quiet_xml_escape "$node_path")"
quiet_root_xml="$(quiet_xml_escape "$quiet_root")"
quiet_stdout_xml="$(quiet_xml_escape "$quiet_state/companion.log")"
quiet_stderr_xml="$(quiet_xml_escape "$quiet_state/companion-error.log")"
quiet_temp="$quiet_plist.$$.tmp"
trap 'rm -f "$quiet_temp"' EXIT
cat > "$quiet_temp" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$quiet_label</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$quiet_runner_xml</string><string>$quiet_node_xml</string></array>
  <key>WorkingDirectory</key><string>$quiet_root_xml</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$quiet_stdout_xml</string>
  <key>StandardErrorPath</key><string>$quiet_stderr_xml</string>
</dict></plist>
EOF
/usr/bin/plutil -lint "$quiet_temp" >/dev/null
if [[ "$quiet_loaded" == true ]]; then
  /bin/launchctl bootout "gui/$quiet_uid/$quiet_label"
fi
/bin/mv "$quiet_temp" "$quiet_plist"
trap - EXIT
/bin/chmod 600 "$quiet_plist"
/bin/launchctl bootstrap "gui/$quiet_uid" "$quiet_plist"
"$node_path" "$quiet_root/mac/connect.mjs" "$quiet_state" "$quiet_root/dist/extension"
printf '%s\n' 'Quiet Feed will start automatically when you sign in to this Mac.'
