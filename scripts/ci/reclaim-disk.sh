#!/usr/bin/env bash
set -euo pipefail
# Archive journeys build fresh installations; reclaim only if their disk is short.
for sdk in /usr/local/lib/android /usr/share/dotnet /usr/local/.ghcup; do
  available=$(df -Pk "$GITHUB_WORKSPACE" | awk 'NR == 2 { print $4 }')
  if (( available >= 20 * 1024 * 1024 )); then break; fi
  sudo rm -rf -- "$sdk"
done
df -h "$GITHUB_WORKSPACE"
