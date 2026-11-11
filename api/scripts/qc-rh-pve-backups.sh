#!/usr/bin/env bash
# Read-only listing of Proxmox VE container IDs and storage backup volume names.
# Run on a Proxmox VE HOST, never use as an LXC "restore" script.
set -Eeuo pipefail
export LC_ALL=C
LIMIT=80
VMID=""
if [[ "${1:-}" == "--vmid" ]]; then
  [[ $# -eq 2 && "${2:-}" =~ ^[1-9][0-9]{1,6}$ ]] || {
    printf '%s\n' 'Usage: qc-rh-pve-backups.sh [--vmid NUMBER]' >&2
    exit 2
  }
  VMID="$2"
elif [[ $# -ne 0 ]]; then
  printf '%s\n' 'Usage: qc-rh-pve-backups.sh [--vmid NUMBER]' >&2
  exit 2
fi
for program in pvesm pct timeout awk; do
  command -v "$program" >/dev/null || {
    printf 'Missing program: %s (run on Proxmox VE host)\n' "$program" >&2
    exit 2
  }
done
printf '%s\n' '=== Proxmox VE: readable metadata only ==='
printf '%s\n' '=== Containers, identify the OLD weather LXC VMID ==='
if ! timeout 15s pct list; then
  printf '%s\n' 'WARNING: container list unavailable' >&2
fi
printf '%s\n' '=== Stores supporting content=backup ==='
if ! STORE_STATUS="$(timeout 25s pvesm status --content backup)"; then
  printf '%s\n' 'ERROR: unable to read backup storage metadata (no configuration changed)' >&2
  exit 1
fi
printf '%s\n' "$STORE_STATUS"
STORES="$(printf '%s\n' "$STORE_STATUS" | awk 'NR>1 && $1 ~ /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/ { print $1 }')"
if [[ -z "$STORES" ]]; then
  printf '%s\n' 'No readable Proxmox backup stores reported; PBS or NAS may be managed separately.'
  exit 0
fi
seen=0
while IFS= read -r storage; do
  [[ -n "$storage" ]] || continue
  seen=$((seen + 1))
  if (( seen > 30 )); then
    printf '%s\n' 'STOP: limit 30 backup stores reached'
    break
  fi
  printf '\n=== Backups on storage: %s ===\n' "$storage"
  if [[ -n "$VMID" ]]; then
    if ! result="$(timeout 35s pvesm list "$storage" --content backup --vmid "$VMID")"; then
      printf '%s\n' 'WARNING: store inaccessible or VMID has no readable backups'
      continue
    fi
  else
    if ! result="$(timeout 35s pvesm list "$storage" --content backup)"; then
      printf '%s\n' 'WARNING: store inaccessible or no readable backup list'
      continue
    fi
  fi
  printf '%s\n' "$result" | awk -v max="$LIMIT" 'NR <= max'
  total="$(printf '%s\n' "$result" | awk 'END { print NR }')"
  if (( total > LIMIT )); then
    printf '[TRUNCATED] Showing first %d of %d output lines; use --vmid N to narrow.\n' "$LIMIT" "$total"
  fi
done <<< "$STORES"
printf '\n%s\n' 'Read-only completed. Listing a backup DOES NOT confirm that it contains original 2022 RH.'
printf '%s\n' 'No restore/extract/import/mount/VM modifications were executed.'
