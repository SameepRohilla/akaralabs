#!/usr/bin/env bash
# Runs the standalone build the way the container does.
#
# `next start` does NOT work with output: standalone, so this is how you test
# a production build locally. The static assets are staged into a temp dir and
# swapped in, so a failure part-way through never leaves the server running
# with no CSS or JS.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .next/standalone/server.js ]; then
  echo "No standalone build found. Run: npm run build" >&2
  exit 1
fi

stage() {
  local src=$1 dest=$2
  rm -rf "$dest.new"
  cp -r "$src" "$dest.new"
  rm -rf "$dest.old"
  [ -e "$dest" ] && mv "$dest" "$dest.old"
  mv "$dest.new" "$dest"
  rm -rf "$dest.old"
}

stage public .next/standalone/public
stage .next/static .next/standalone/.next/static

set -a
[ -f .env.local ] && . ./.env.local
set +a

export PORT="${PORT:-3000}"
echo "==> serving the standalone build on :$PORT"
exec node .next/standalone/server.js
