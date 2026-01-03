#!/bin/bash
set -e

# Frontend start script
cd "$(dirname "$0")/frontend"

# Install dependencies only if not already installed (speeds up repeated starts)
if [ ! -d node_modules ]; then
  echo "[frontend] node_modules not found. Installing dependencies..."
  if [ -f package-lock.json ]; then
    npm ci || npm install
  else
    npm install
  fi
else
  echo "[frontend] Dependencies present. Skipping npm install."
fi

# Pick a free port starting at 3000 to avoid interactive prompts
pick_port() {
  local p=${1:-3000}
  for try in $(seq 0 20); do
    local cand=$((p+try))
    if ! (command -v fuser >/dev/null 2>&1 && fuser -n tcp $cand >/dev/null 2>&1); then
      echo $cand
      return 0
    fi
  done
  echo $p
}

export PORT=${PORT:-$(pick_port 3000)}
export BROWSER=${BROWSER:-none}
echo "[frontend] Starting dev server on port ${PORT}..."

npm start
