#!/bin/bash

echo "Starting React frontend..."

# Free up port 4000 (frontend) if occupied
echo "Ensuring port 4000 is free..."
if command -v fuser >/dev/null 2>&1; then
  fuser -k -n tcp 4000 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  kill -9 $(lsof -t -i:4000) 2>/dev/null || true
else
  # Fallback using ss to extract PIDs
  PORT=4000
  PIDS=$(ss -ltnp 2>/dev/null | awk -v p=":"$PORT '$4 ~ p {print $6}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u)
  if [ -n "$PIDS" ]; then
    echo "Killing PIDs on port $PORT: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
  fi
fi

cd frontend

# Install dependencies
echo "Installing dependencies..."
npm install

# Start development server
echo "Starting React development server on http://localhost:4000"
PORT=4000 npm start
