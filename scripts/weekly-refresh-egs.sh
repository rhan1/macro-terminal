#!/bin/bash

# Configure a predictable shell environment for launchd.
set -euo pipefail
PATH="/opt/homebrew/bin:$PATH"

# Pin all paths to the repository root and log file.
REPO_DIR="/Users/razakhan/Documents/Projects/macro-terminal"
LOG_FILE="$REPO_DIR/data/refresh-log.txt"
cd "$REPO_DIR"
exec >>"$LOG_FILE" 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') ====="

# Run the existing refresh command and stop on scraper failure.
if ! npm run refresh-egs; then
  echo "refresh failed"
  exit 1
fi

# Exit cleanly when nothing changed under data/.
if [[ -z "$(/usr/bin/git status --porcelain -- data/)" ]]; then
  echo "no change"
  exit 0
fi

# Stage only generated data and create a dated commit.
/usr/bin/git add data/
commit_date="$(date '+%Y-%m-%d')"
/usr/bin/git commit -m "weekly: refresh egs snapshot $commit_date" -- data/

# Select the personal GitHub account before pushing.
/opt/homebrew/bin/gh auth switch --user rhan1 >/dev/null 2>&1 || true

# Push the refresh commit and record the resulting revision.
/usr/bin/git push origin main
commit_sha="$(/usr/bin/git rev-parse HEAD)"
echo "pushed $commit_sha"
