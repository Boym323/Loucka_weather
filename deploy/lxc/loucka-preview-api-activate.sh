#!/usr/bin/env bash
# Install root-owned at /usr/local/libexec, never execute from the writable repo.
# Called only after a successful staging build and publication.
set -Eeuo pipefail

release_marker=/srv/loucka-preview/current/.source-commit
state_dir=/var/lib/loucka-weather-api
state_marker=$state_dir/active-commit
api_unit=loucka-weather-api.service
api_url=http://127.0.0.1:3100/api/v1

[[ -r "$release_marker" ]] || { echo "Published release marker not found" >&2; exit 1; }
commit=$(cat "$release_marker")
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid published commit marker" >&2; exit 1; }

api_ready() {
  curl --noproxy '*' --fail --silent --show-error --max-time 3 "$api_url/healthz" >/dev/null &&
  curl --noproxy '*' --fail --silent --show-error --max-time 3 "$api_url/readyz" |
    grep -Eq '"ready"[[:space:]]*:[[:space:]]*true'
}

# The sync timer runs frequently: do not interrupt live SSE clients without need.
if [[ -r "$state_marker" ]] && [[ "$(cat "$state_marker")" == "$commit" ]] &&
   systemctl is-active --quiet "$api_unit" && api_ready; then
  echo "API already healthy for $commit"
  exit 0
fi

# Restart only after npm ci, tests and TypeScript build have completed.
systemctl restart "$api_unit"
for attempt in {1..15}; do
  if systemctl is-active --quiet "$api_unit" && api_ready; then
    install -d -o root -g root -m 0750 "$state_dir"
    tmp=$(mktemp "$state_dir/.active-commit.XXXXXXXX")
    trap 'rm -f -- "$tmp"' EXIT
    printf '%s\n' "$commit" > "$tmp"
    chmod 0640 "$tmp"
    mv -f -- "$tmp" "$state_marker"
    trap - EXIT
    echo "API healthy for $commit"
    exit 0
  fi
  sleep 1
done

echo "API failed health/readiness checks after activation of $commit" >&2
journalctl -u "$api_unit" -n 20 --no-pager >&2 || true
exit 1
