#!/usr/bin/env bash
# Read-only LXC audit; never modifies GW3000, WeeWX, systemd or MariaDB.
set -u
API=http://127.0.0.1:3100
SITE=https://dev.pocasi-loucka.eu
CAM_DIR=/var/lib/loucka-camera
failures=0
section(){ printf '\n=== %s ===\n' "$*"; }
warning(){ printf 'WARN: %s\n' "$*"; }
critical(){ printf 'FAIL: %s\n' "$*"; failures=$((failures+1)); }
checked_json(){
 local name="$1" url="$2" body
 if ! body="$(curl --fail --silent --show-error --max-time 12 "$url")"; then
  warning "$name unavailable at configured source";return 1
 fi
 if ! printf '%s' "$body" | jq -e '.schemaVersion=="1"' >/dev/null 2>&1; then
  warning "$name returned invalid schemaVersion";return 1
 fi
 printf '%s\n' "$body" | jq -c '{schemaVersion,status,state,ready,checkedAt,source,components}' | head -c 2200
 printf '\n'
 return 0
}
section "Build and public deployment"
if [[ -r /srv/loucka-preview/current/deployment.json ]]; then
 jq -c '{branch,commit,deployedAt}' /srv/loucka-preview/current/deployment.json || true
else critical 'staging deployment metadata missing';fi
if [[ -d /home/loucka/Loucka_weather/.git ]]; then
 # Git 2.35+ correctly refuses a root read of an untrusted user's worktree.
 # Run the read-only command as the repository owner, not via safe.directory.
 if [[ "$(id -u)" -eq 0 ]]; then
  repo_commit="$(runuser -u loucka -- git -C /home/loucka/Loucka_weather rev-parse HEAD)" ||
   warning 'Cannot read repository revision as loucka'
  runuser -u loucka -- git -C /home/loucka/Loucka_weather log -1 --format='Repository %h %cs' ||
   warning 'Cannot read repository metadata as loucka'
 else
  repo_commit="$(git -C /home/loucka/Loucka_weather rev-parse HEAD)" ||
   warning 'Repository is not accessible to the current user'
  git -C /home/loucka/Loucka_weather log -1 --format='Repository %h %cs' ||
   warning 'Cannot read repository metadata'
 fi
 if [[ -n "${repo_commit:-}" && -r /srv/loucka-preview/current/deployment.json ]]; then
  deployed_commit="$(jq -r '.commit // empty' /srv/loucka-preview/current/deployment.json)"
  if [[ "$repo_commit" != "$deployed_commit" ]]; then
   warning 'Checked-out repository differs from the version currently deployed (may be a pending sync)'
  else
   printf 'Repository and deployment commit match\n'
  fi
 fi
fi
section "Local API, sources and recent readings"
checked_json 'API readiness' "$API/api/v1/readyz" || critical 'local readiness unreachable'
checked_json 'Source monitor' "$API/api/v1/monitor/status" || warning 'source monitor API failed'
checked_json 'GW3000 observation' "$API/api/v1/live/current" || warning 'GW3000 live API failed'
checked_json 'Camera archive' "$API/api/v1/camera/archive" || warning 'camera archive API failed'
checked_json 'Preliminary climate records' "$API/api/v1/climate/records" || warning 'records API failed'
section "Public routing, version and lightweight response times (not load test)"
for route in /deployment.json /api/v1/readyz /api/v1/live/current /api/v1/monitor/status; do
 curl -L --silent --show-error --output /dev/null --max-time 14 \
  --write-out "$route HTTP %{http_code} in %{time_total}s\n" "$SITE$route" || warning "public route $route failed"
done
section "systemd timers (no changes)"
for unit in loucka-gw3000-http-pull.timer loucka-monitor.timer loucka-camera-collect.timer loucka-alerts-collect.timer; do
 state="$(systemctl is-active "$unit" 2>/dev/null || true)"
 enabled="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
 printf '%s: active=%s enabled=%s\n' "$unit" "$state" "$enabled"
 if [[ "$state" != active ]]; then warning "$unit is not active"; fi
done
section "Camera archive, FFmpeg and first real MP4"
if command -v ffmpeg >/dev/null 2>&1; then
 ffmpeg -version 2>/dev/null | head -n 1
else warning 'FFmpeg not installed; JPEG works but MP4 cannot be generated';fi
if [[ -r "$CAM_DIR/index.json" ]]; then
 jq -c '{frames:(.frames|length),videos:(.videos|length),updatedAt}' "$CAM_DIR/index.json" || warning 'Invalid camera index'
else warning 'Camera index unavailable';fi
if [[ -d "$CAM_DIR/timelapse" ]]; then
 find "$CAM_DIR/timelapse" -maxdepth 1 -type f -name '*.mp4' -printf '%f %s bytes\n' | sort | tail -n 10
else warning 'No MP4 directory yet';fi
if [[ -d "$CAM_DIR" ]]; then du -sh "$CAM_DIR" 2>/dev/null || true;fi
section "Resource headroom and network exposure"
df -h / /srv/loucka-preview 2>/dev/null || df -h /
free -h || true
ss -lntp 2>/dev/null | grep -E '(:3100|:3102|:8080)[[:space:]]' || true
if ss -lnt 2>/dev/null | grep -Eq '0\.0\.0\.0:3102[[:space:]]'; then
 critical 'optional push collector exposes TCP 3102 on all IPv4 interfaces'
fi
section "Backup and security boundaries"
printf '%s\n' 'Cannot certify Proxmox/PBS backup schedules, external firewall/NPM policies, or restore tests inside LXC.'
printf '%s\n' 'Verify backups and restore from Proxmox; do not change GW3000 or production WeeWX.'
section "Result"
if ((failures));then
 printf 'Read-only audit found %d critical blocker(s)\n' "$failures"
 exit 1
fi
printf 'Read-only audit: no critical local-blocker among checked conditions. Warnings require review.\n'
