#!/usr/bin/env bash
# Staging-only, root-invoked, read-only evidence for GitHub issue #69.
# Does NOT restart systemd, load firewall rules, modify Git, or touch MariaDB.
set -u -o pipefail
export LC_ALL=C

errors=0
warnings=0
ok(){ printf 'PASS: %s\n' "$1"; }
warn(){ printf 'WARN: %s\n' "$1"; warnings=$((warnings+1)); }
fail(){ printf 'FAIL: %s\n' "$1"; errors=$((errors+1)); }
property(){ systemctl show --value -p "$2" "$1" 2>/dev/null || true; }

if [[ "$(id -u)" != 0 ]]; then
  printf 'ERROR: Run as root to inspect private nftables and the installed systemd unit.\n' >&2
  exit 2
fi

printf 'DEV OPERATIONS EVIDENCE UTC=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'Read-only checks; not a reboot, rollback or LAN isolation test.\n'

timer=loucka-preview-sync.timer
active="$(property "$timer" ActiveState)"
substate="$(property "$timer" SubState)"
next="$(property "$timer" NextElapseUSecMonotonic)"
last="$(property "$timer" LastTriggerUSec)"
installed="$(systemctl cat "$timer" 2>/dev/null || true)"
if [[ "$active" == active && "$substate" == waiting ]]; then
  ok 'Sync timer is active and waiting'
else
  fail 'Sync timer not active/waiting (inspect systemctl status)'
fi
if [[ -n "$next" && "$next" != infinity && "$next" != n/a && "$next" != 0 ]]; then
  ok 'Sync timer has a next monotonic trigger (verify future NEXT manually)'
else
  fail 'Sync timer has no scheduled next trigger'
fi
if [[ -n "$last" && "$last" != n/a && "$last" != infinity && "$last" != 0 ]]; then
  ok 'Sync timer has a previous trigger (correlate with journal)'
else
  warn 'No prior timer trigger confirmed'
fi
if grep -Fq 'OnActiveSec=45s' <<<"$installed" &&
   grep -Fq 'OnUnitInactiveSec=2min' <<<"$installed"; then
  ok 'Installed timer includes fixed rearming policy'
else
  fail 'Installed root-owned timer differs from expected rearming policy'
fi
printf '%s\n' 'Journal correlation (last 12 messages; do not publish private logs):'
journalctl -u "$timer" -u loucka-preview-sync.service -n 12 --no-pager --output=short-iso 2>/dev/null |
  sed -E 's/([0-9]{1,3}\.){3}[0-9]{1,3}/[private-ip]/g' || warn 'Journal is unavailable'

if [[ -f /etc/nftables.conf && -f /etc/nftables.d/loucka-preview-guard.nft ]] &&
   grep -Fq '/etc/nftables.d/loucka-preview-guard.nft' /etc/nftables.conf; then
  ok 'Persistent nftables guard include exists'
else
  fail 'Missing persistent nftables guard include'
fi
if nft -c -f /etc/nftables.conf >/dev/null 2>&1; then
  ok 'nftables configuration syntax valid (no reload performed)'
else
  fail 'nftables configuration syntax invalid/unreadable'
fi
if nft list table inet loucka_preview_guard >/dev/null 2>&1; then
  ok 'Runtime nftables guard table present'
else
  fail 'Runtime nftables guard table missing'
fi
warn 'Firewall persistence after actual LXC reboot and NPM-vs-untrusted TCP 8080 access still require separate tests'

local_meta=/srv/loucka-preview/current/deployment.json
public_url=https://dev.pocasi-loucka.eu/deployment.json
local_sha=
public_sha=
repo_sha=
if [[ -r "$local_meta" ]] && command -v jq >/dev/null 2>&1; then
  local_sha="$(jq -r '.commit // empty' "$local_meta" 2>/dev/null)"
  if [[ "$local_sha" =~ ^[0-9a-f]{40}$ ]]; then ok 'Local deployment metadata has a valid SHA'; else fail 'Missing/invalid local deployment SHA'; fi
else
  fail 'Local deployment metadata or jq unavailable'
fi
if [[ -d /home/loucka/Loucka_weather/.git ]]; then
  repo_sha="$(runuser -u loucka -- git -C /home/loucka/Loucka_weather rev-parse HEAD 2>/dev/null || true)"
  if [[ "$repo_sha" =~ ^[0-9a-f]{40}$ ]]; then ok 'Local repository commit readable'; else fail 'Local Git revision unavailable'; fi
else
  fail 'Repository not found on LXC'
fi
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  public_sha="$(curl --fail --silent --show-error --max-time 10 "$public_url" 2>/dev/null |
    jq -r '.commit // empty' 2>/dev/null || true)"
  if [[ "$public_sha" =~ ^[0-9a-f]{40}$ ]]; then ok 'Public deployment metadata available'; else fail 'Public deployment SHA unavailable'; fi
else
  fail 'curl or jq unavailable'
fi
if [[ -n "$local_sha" && "$local_sha" == "$public_sha" ]]; then
  ok 'Local and public deployment SHAs match'
else
  fail 'Local/public deployment mismatch'
fi
if [[ -n "$repo_sha" && "$repo_sha" == "$local_sha" ]]; then
  ok 'Checked-out Git SHA matches active deployment'
else
  warn 'Git HEAD and active deployment differ (pending sync/build or failure)'
fi
if [[ -e /srv/loucka-preview/.pending-commit ]]; then
  warn 'Pending deployment exists; inspect before declaring release healthy'
else
  ok 'No pending commit'
fi
if curl --fail --silent --show-error --max-time 6 http://127.0.0.1:3100/api/v1/readyz 2>/dev/null |
   jq -e '.ready == true' >/dev/null 2>&1; then
  ok 'Local Fastify readiness true'
else
  fail 'Local Fastify readiness not confirmed'
fi
printf 'Active release SHA: %s\n' "$local_sha"
printf 'Repo checkout SHA: %s\n' "$repo_sha"
printf 'Public release SHA: %s\n' "$public_sha"

printf '\nSUMMARY: %d FAIL; %d WARN\n' "$errors" "$warnings"
printf 'NOT VERIFIED: actual post-reboot firewall persistence, remote MariaDB ACL, full backend rollback or effective API account grants.\n'
if (( errors > 0 )); then exit 1; fi
exit 0
