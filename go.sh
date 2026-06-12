#!/usr/bin/env bash
# Start the local prototype server. Open http://localhost:4477 in a browser.
set -e
cd "$(dirname "$0")"
exec python3 -m http.server 4477
