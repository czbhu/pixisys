#!/bin/bash

echo "Starting Django backend..."

# Free up port 8003 (backend) if occupied
echo "Ensuring port 8003 is free..."
if command -v fuser >/dev/null 2>&1; then
  fuser -k -n tcp 8003 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  kill -9 $(lsof -t -i:8003) 2>/dev/null || true
else
  # Fallback using ss to extract PIDs
  PORT=8003
  PIDS=$(ss -ltnp 2>/dev/null | awk -v p=":"$PORT '$4 ~ p {print $6}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u)
  if [ -n "$PIDS" ]; then
    echo "Killing PIDs on port $PORT: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
  fi
fi


set -e

# Backend start script
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "Python venv not found. Creating venv..."
  python3 -m venv venv
fi

source venv/bin/activate
pip -q install --upgrade pip
pip -q install -r requirements.txt

# Run migrations then start server
python manage.py migrate
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8003}
daphne -b ${HOST} -p ${PORT} erp_system.asgi:application