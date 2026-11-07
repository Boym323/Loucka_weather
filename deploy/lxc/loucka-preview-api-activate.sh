#!/usr/bin/env bash
# Install root-owned at /usr/local/libexec, never execute from the writable repo.
# Called only after a successful staging build and publication.
set -Eeuo pipefail

web=/srv/loucka-preview
pending_marker=$web/.pending-commit
release_marker=$web/current/.source-commit
state_dir=/var/lib/loucka-weather-api
state_marker=$state_dir/active-commit
api_unit=loucka-weather-api.service
api_url=http://127.0.0.1:3100/api/v1

# The unprivileged build never publishes a new frontend before the backend is ready.
# Keep the last published release visible when a pending API activation fails.
pending=false
if [[ -f "$pending_marker" ]]; then
  commit=$(cat "$pending_marker")
  pending=true
else
  [[ -r "$release_marker" ]] || { echo "Published release marker not found" >&2; exit 1; }
  commit=$(cat "$release_marker")
fi
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid candidate commit marker" >&2; exit 1; }
release="$web/releases/$commit"
[[ -r "$release/.source-commit" && "$(cat "$release/.source-commit")" == "$commit" ]] || {
  echo "Candidate release does not match its commit: $commit" >&2; exit 1;
}
if [[ "$pending" == true ]]; then
  checked_out=$(runuser -u loucka -- git -C /home/loucka/Loucka_weather rev-parse HEAD)
  [[ "$checked_out" == "$commit" ]] || { echo "Pending release does not match checkout" >&2; exit 1; }
fi

api_ready() {
  curl --noproxy '*' --fail --silent --show-error --max-time 3 "$api_url/healthz" >/dev/null &&
  curl --noproxy '*' --fail --silent --show-error --max-time 3 "$api_url/readyz" |
    grep -Eq '"ready"[[:space:]]*:[[:space:]]*true'
}

# Read Git objects with the unprivileged repo owner; never execute repo code as root.
api_tree() {
  runuser -u loucka -- git -C /home/loucka/Loucka_weather rev-parse --verify "$1:api"
}
desired_tree=$(api_tree "$commit")
[[ "$desired_tree" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid API tree" >&2; exit 1; }

persist_active_commit() {
  install -d -o root -g root -m 0750 "$state_dir"
  tmp=$(mktemp "$state_dir/.active-commit.XXXXXXXX")
  trap 'rm -f -- "$tmp"' EXIT
  printf '%s\n' "$commit" > "$tmp"
  chmod 0640 "$tmp"
  mv -f -- "$tmp" "$state_marker"
  trap - EXIT
}

# Publish only after a healthy backend has been verified for this commit.
# All writes to the user-owned web tree occur as the unprivileged user.
publish_pending() {
  if [[ "$pending" != true ]]; then return 0; fi
  runuser -u loucka -- ln -sfn -- "$release" "$web/.current.next"
  runuser -u loucka -- mv -Tf -- "$web/.current.next" "$web/current"
  runuser -u loucka -- rm -f -- "$pending_marker"
  echo "Published healthy release $commit"
}

# A frontend-only/docs-only commit must not restart a healthy backend.
# Compare the actual Git api/ tree with the last activated release, not the full SHA.
if [[ -r "$state_marker" ]] && systemctl is-active --quiet "$api_unit" && api_ready; then
  active_commit=$(cat "$state_marker")
  if [[ "$active_commit" =~ ^[0-9a-f]{40}$ ]]; then
    active_tree=$(api_tree "$active_commit" 2>/dev/null || true)
    if [[ "$active_tree" == "$desired_tree" ]]; then
      publish_pending
    persist_active_commit
      echo "API unchanged and healthy ($desired_tree); no restart for $commit"
      exit 0
    fi
  fi
fi

# Restart only after npm ci, tests and TypeScript build have completed.
systemctl restart "$api_unit"
for attempt in {1..15}; do
  if systemctl is-active --quiet "$api_unit" && api_ready; then
    publish_pending
    persist_active_commit
    echo "API healthy for $commit"
    exit 0
  fi
  sleep 1
done

echo "API failed health/readiness checks after activation of $commit" >&2
journalctl -u "$api_unit" -n 20 --no-pager >&2 || true
exit 1
