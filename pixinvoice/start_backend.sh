#!/bin/bash

echo "Starting Django backend..."

# Free up port 4001 (backend) if occupied
echo "Ensuring port 4001 is free..."
if command -v fuser >/dev/null 2>&1; then
  fuser -k -n tcp 4001 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  kill -9 $(lsof -t -i:4001) 2>/dev/null || true
else
  # Fallback using ss to extract PIDs
  PORT=4001
  PIDS=$(ss -ltnp 2>/dev/null | awk -v p=":"$PORT '$4 ~ p {print $6}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u)
  if [ -n "$PIDS" ]; then
    echo "Killing PIDs on port $PORT: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
  fi
fi

cd invoice_app

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Run migrations
echo "Running migrations..."
python manage.py migrate

# Start server
HOST=${HOST:-127.0.0.1}
PORT=${PORT:-4001}
echo "Starting Django server on http://${HOST}:${PORT}"
python manage.py runserver ${HOST}:${PORT}
