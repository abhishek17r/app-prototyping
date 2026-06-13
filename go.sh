#!/usr/bin/env bash
# Start the proto-kit server. Open http://localhost:4488 in a browser.
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "→ installing dependencies (one-time)…"
  npm install --silent
fi

exec node server.js
