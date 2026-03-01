#!/bin/bash

# PixiSys Daemon Starter - runs completely independent from terminal
# This script will be called by start.sh to spawn services

SCRIPT_DIR="$1"
PRODUCTION_MODE="$2"
ERP_BACKEND_PORT="$3"
INV_BACKEND_PORT="$4"
ERP_FRONTEND_PORT="${5:-3000}"
INV_FRONTEND_PORT="${6:-3001}"

cd "$SCRIPT_DIR"

# Function to check if port is in use and kill only expected process
kill_port_if_matches() {
    local port=$1
    local pattern=$2
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    [ -z "$pids" ] && return
    for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
        if echo "$cmd" | grep -Eq "$pattern"; then
            kill -TERM "$pid" 2>/dev/null || true
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
    done
}

# Kill any existing processes on our ports
kill_port_if_matches "$ERP_BACKEND_PORT" "gunicorn .*erp_system\\.asgi:application|daphne .*erp_system\\.asgi:application"
kill_port_if_matches "$INV_BACKEND_PORT" "gunicorn .*invoice_system\\.wsgi:application|manage\\.py runserver .*:${INV_BACKEND_PORT}"

if [ "$PRODUCTION_MODE" != "true" ]; then
    kill_port_if_matches "$ERP_FRONTEND_PORT" "react-scripts/scripts/start|webpack-dev-server|pixierp/frontend"
    kill_port_if_matches "$INV_FRONTEND_PORT" "react-scripts/scripts/start|webpack-dev-server|pixinvoice/frontend"
fi

# Start ERP Backend
cd "$SCRIPT_DIR/pixierp"
source venv/bin/activate
if [ "$PRODUCTION_MODE" = "true" ]; then
    gunicorn erp_system.asgi:application --bind 0.0.0.0:${ERP_BACKEND_PORT} -w 4 -k uvicorn.workers.UvicornWorker --timeout 120 --access-logfile - --error-logfile - > /tmp/pixierp_backend.log 2>&1 </dev/null &
else
    daphne -b 0.0.0.0 -p ${ERP_BACKEND_PORT} erp_system.asgi:application > /tmp/pixierp_backend.log 2>&1 </dev/null &
fi
echo $! > /tmp/pixierp_backend.pid
deactivate

# Start Invoice Backend
cd "$SCRIPT_DIR/pixinvoice/invoice_app"
source venv/bin/activate
if [ "$PRODUCTION_MODE" = "true" ]; then
    gunicorn invoice_system.wsgi:application --bind 0.0.0.0:${INV_BACKEND_PORT} -w 6 --timeout 120 --access-logfile - --error-logfile - > /tmp/pixinvoice_backend.log 2>&1 </dev/null &
else
    python manage.py runserver 0.0.0.0:${INV_BACKEND_PORT} > /tmp/pixinvoice_backend.log 2>&1 </dev/null &
fi
echo $! > /tmp/pixinvoice_backend.pid
deactivate

# Wait for backends
sleep 3

if [ "$PRODUCTION_MODE" != "true" ]; then
    # Start ERP Frontend
    cd "$SCRIPT_DIR/pixierp/frontend"
    PORT=${ERP_FRONTEND_PORT} BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true REACT_APP_API_URL=http://localhost:${ERP_BACKEND_PORT}/api/v1 npm start > /tmp/pixierp_frontend.log 2>&1 </dev/null &
    echo $! > /tmp/pixierp_frontend.pid
    
    # Start Invoice Frontend
    cd "$SCRIPT_DIR/pixinvoice/frontend"
    PORT=${INV_FRONTEND_PORT} BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true REACT_APP_API_URL= npm start > /tmp/pixinvoice_frontend.log 2>&1 </dev/null &
    echo $! > /tmp/pixinvoice_frontend.pid
fi
