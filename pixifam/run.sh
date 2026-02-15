#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt >/dev/null
export $(grep -v '^#' .env 2>/dev/null | xargs -r) || true
exec uvicorn app.main:app --host "${FAM_HOST:-0.0.0.0}" --port "${FAM_PORT:-8010}" --reload
