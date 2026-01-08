#!/bin/bash

echo "Starting PixInvoice..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Start backend in background
echo "Starting backend..."
nohup ./start_backend.sh > /tmp/pixinvoice_backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Wait a bit for backend to start
sleep 3

# Check if backend is running
if ps -p $BACKEND_PID > /dev/null; then
    echo "✓ Backend is running"
else
    echo "✗ Backend failed to start. Check /tmp/pixinvoice_backend.log"
    exit 1
fi

echo ""
echo "PixInvoice backend started successfully!"
echo "Backend log: /tmp/pixinvoice_backend.log"
echo ""
echo "To start the frontend (in development mode):"
echo "  ./start_frontend.sh"
echo ""
echo "Backend URL: http://0.0.0.0:4001"
echo "API URL: http://0.0.0.0:4001/api/"
echo ""
