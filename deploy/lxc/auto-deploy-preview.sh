#!/usr/bin/env bash
# Test-only: sync public GitHub main and atomically publish static Astro.
set -Eeuo pipefail
umask 022
REPO=/home/loucka/Loucka_weather
WEB=/srv/loucka-preview
LOCK="/tmp/loucka-preview-sync-$UID.lock"
if [[ "$(id -un)" != loucka ]]; then echo "Run as loucka" >&2; exit 1; fi
exec 9>"$LOCK"
flock -n 9 || exit 0
cd "$REPO"
if [[ "$(git symbolic-ref --quiet --short HEAD || true)" != main ]]; then
  echo "Local repository must be on main" >&2; exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked local edits detected; refusing to overwrite" >&2; exit 1
fi
git fetch --quiet origin main
git merge --ff-only origin/main
sha="$(git rev-parse HEAD)"
release="$WEB/releases/$sha"
if [[ -d "$release" && -L "$WEB/current" && "$(readlink -f "$WEB/current")" == "$release" ]]; then
  echo "No changes since $(printf %.12s "$sha")"; exit 0
fi
echo "Checking and building Fastify $(printf %.12s "$sha")"
cd "$REPO/api"
npm ci --no-audit --no-fund
npm test
echo "Checking and building Astro"
cd "$REPO/frontend"
npm ci --no-audit --no-fund
npm run check
npm test
npm run build
mkdir -p "$WEB/releases"
if [[ ! -d "$release" ]]; then
  tmp="$(mktemp -d "$WEB/releases/.building.XXXXXXXX")"
  trap 'rm -rf -- "$tmp"' EXIT
  cp -a dist/. "$tmp/"
  # Stamp the actual published commit and deploy time after all checks/builds pass.
  printf '{"schemaVersion":"1","branch":"main","commit":"%s","deployedAt":"%s"}\n' \
    "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp/deployment.json"
  # mktemp creates a 0700 directory. nginx (www-data) must traverse releases.
  chmod -R u=rwX,go=rX "$tmp"
  printf '%s\n' "$sha" > "$tmp/.source-commit"
  mv -T -- "$tmp" "$release"
  trap - EXIT
fi
ln -sfn "$release" "$WEB/.current.next"
mv -Tf "$WEB/.current.next" "$WEB/current"
echo "Published $(printf %.12s "$sha") to $WEB/current"
