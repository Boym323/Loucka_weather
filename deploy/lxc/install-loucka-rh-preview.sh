#!/usr/bin/env bash
# Manual, guarded opt-in setup for a LOCALHOST ONLY RH preview.
# No writes to MariaDB, no Nginx modifications and no changes to api.env.
set -euo pipefail
umask 077

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run as root on the development LXC." >&2; exit 1
fi
REPO=/home/loucka/Loucka_weather
UNIT=loucka-rh-preview.service
CONFIG=/etc/loucka-weather/rh-preview.env
ORIGINAL=/etc/loucka-weather/api.env
PACKAGE=/var/lib/loucka-qc/qc-rh-2022-dev-preview-c296d7dd830f733f.json
DIGEST=c296d7dd830f733f2b5563395fd6b33aafa76854ae1dc91b47746d297a267540
SIDE="$REPO/api/dist/src/dev-rh-preview-entry.js"

for executable in systemctl runuser openssl curl node ss; do
 command -v "$executable" >/dev/null || {
  echo "ERROR: missing required command $executable." >&2; exit 1;
 }
done
[[ -f "$ORIGINAL" && -f "$PACKAGE" && -f "$SIDE" ]] || {
 echo "ERROR: missing original API env, immutable package or compiled sidecar entry. Sync main and build API first." >&2; exit 1;
}
grep -qx 'WEATHER_DB_SCHEMA=pocasi-loucka.eu' "$ORIGINAL" || {
 echo "ERROR: source schema is not confirmed original archive." >&2; exit 1;
}
grep -qx 'WEATHER_STAGING_ENABLED=YES' "$ORIGINAL" || {
 echo "ERROR: staging mode is not enabled." >&2; exit 1;
}
[[ -f "$REPO/deploy/lxc/$UNIT" ]] || {
 echo "ERROR: sidecar unit not found in checked-out source." >&2; exit 1;
}

# No shell sourcing of systemd EnvironmentFile and no printing of DB credentials.
# SHA256 matches the JSON source-of-truth, not its file-level trailing newline.
runuser -u loucka -- /usr/bin/node --input-type=module -e '
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const f=process.argv[1],expected=process.argv[2];
const data=JSON.parse(readFileSync(f,"utf8"));
const sha=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
if(sha(data)!==expected||sha(data.records)!==data.recordsSha256||
 data.records.length!==5153||!data.records.every(row=>row.approved===false)){
 console.error("ERROR: immutable RH preview package verification failed.");
 process.exit(1);
}
console.log("Immutable RH package integrity: OK");
' "$PACKAGE" "$DIGEST"

# Refuse to replace another process on the sidecar port.
if ! systemctl is-active --quiet "$UNIT"; then
 if ss -H -ltn '( sport = :3101 )' | grep -q .; then
   echo "ERROR: port 3101 already occupied by a different process." >&2; exit 1;
 fi
fi

if [[ -e "$CONFIG" ]]; then
 [[ -f "$CONFIG" && ! -L "$CONFIG" && "$(stat -c '%a' "$CONFIG")" == 600 && "$(stat -c '%U:%G' "$CONFIG")" == "root:root" ]] || {
  echo "ERROR: existing rh-preview.env has unsafe owner or permissions." >&2; exit 1;
 }
 # On reinstall/retry, NEVER rotate or print the existing access token.
 echo "Existing private sidecar env preserved (no token rotation)."
else
 tmp=$(mktemp /etc/loucka-weather/.rh-preview.env.XXXXXXXX)
 trap 'rm -f "$tmp"' EXIT
 chmod 600 "$tmp"
 chown root:root "$tmp"
 token=$(openssl rand -hex 32)
 [[ $(printf %s "$token" | wc -c) -eq 64 ]] || {
  echo "ERROR: token generation failed." >&2; exit 1;
 }
 {
  printf 'WEATHER_DEV_PREVIEW_ENABLED=YES\n'
  printf 'WEATHER_DEV_PREVIEW_MODE=isolated_dev_only\n'
  printf 'WEATHER_DEV_PREVIEW_PACKAGE=%s\n' "$PACKAGE"
  printf 'WEATHER_DEV_PREVIEW_PACKAGE_SHA256=%s\n' "$DIGEST"
  printf 'WEATHER_DEV_PREVIEW_TOKEN=%s\n' "$token"
  printf 'HOST=127.0.0.1\n'
  printf 'PORT=3101\n'
  printf 'GW3000_LIVE_ENABLED=NO\n'
 } > "$tmp"
 mv "$tmp" "$CONFIG"
 trap - EXIT
 unset token
 echo "Created root-only sidecar env (token not shown)."
fi

# Fail closed on ANY error after starting installation, including failures of
# systemctl enable --now, interrupted readiness polling and failed HTTP smoke.
# Merely stopping a failed unit would leave it enabled for the next reboot.
cleanup_failed_install() {
  local result=$?
  if (( result != 0 )); then
    systemctl disable --now "$UNIT" >/dev/null 2>&1 || true
    echo "Private RH sidecar disabled after installation failure; original dev API unchanged." >&2
  fi
}
trap cleanup_failed_install EXIT
install -o root -g root -m 0644 \
 "$REPO/deploy/lxc/$UNIT" "/etc/systemd/system/$UNIT"
systemctl daemon-reload
systemctl enable --now "$UNIT"
for i in {1..12}; do
  if curl -fsS --max-time 2 http://127.0.0.1:3101/dev/rh-preview/readyz >/dev/null; then
    break
  fi
  sleep 1
done

echo "=== Isolated RH preview verification ==="
status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3101/dev/rh-preview/healthz || true)
auth=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
 'http://127.0.0.1:3101/api/v1/dev/preview/rh-history?from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z' || true)
readiness=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3101/dev/rh-preview/readyz || true)
original=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3100/api/v1/healthz || true)
page=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3101/dev/rh-preview || true)
echo "Sidecar healthz: HTTP $status"
echo "Sidecar readyz: HTTP $readiness"
echo "Sidecar UI: HTTP $page"
echo "Sidecar private data without token: HTTP $auth (expected 401)"
echo "Original dev API healthz: HTTP $original (expected 200)"
if [[ "$status" != 200 || "$readiness" != 200 || "$page" != 200 || "$auth" != 401 || "$original" != 200 ]]; then
 echo "ERROR: smoke checks failed. Stop only the sidecar and inspect its journal; original dev API was not altered." >&2
 exit 1
fi
trap - EXIT
echo "READY: local-only RH preview on 127.0.0.1:3101/dev/rh-preview"
echo "Connect from your workstation via an SSH local port forward. Token is in root-owned $CONFIG; never send it to chat."
