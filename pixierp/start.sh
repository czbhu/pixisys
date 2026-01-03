#!/bin/bash

# PixiERP Start Script
echo "🚀 Starting PixiERP..."

# Check if we're in the right directory
if [ ! -f "manage.py" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    echo "   Expected: project root containing manage.py (e.g., /wb2/pixierp)"
    exit 1
fi

# Start Django backend
echo "📡 Starting Django backend..."
source venv/bin/activate
python manage.py runserver 127.0.0.1:8005 &
DJANGO_PID=$!

# Wait a moment for Django to start
sleep 3

# Start React frontend
echo "⚛️  Starting React frontend..."
cd frontend
npm start &
REACT_PID=$!

echo "✅ PixiERP started!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8005"
echo "   Admin:    http://localhost:8005/admin"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for user to stop
wait

