#!/bin/bash

# PixiSys Stop Script
echo "🛑 Stopping PixiSys services..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load domain/config if present
if [ -f "$SCRIPT_DIR/config.sh" ]; then
    source "$SCRIPT_DIR/config.sh" --load-only
fi

ERP_BACKEND_PORT="${ERP_BACKEND_PORT:-8003}"
INV_BACKEND_PORT="${INV_BACKEND_PORT:-4001}"
ERP_FRONTEND_PORT="${ERP_FRONTEND_PORT:-3000}"
INV_FRONTEND_PORT="${INV_FRONTEND_PORT:-3001}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to stop process by PID file
stop_by_pidfile() {
    local pidfile=$1
    local name=$2
    local pattern=$3
    
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            local cmd
            cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
            if echo "$cmd" | grep -Eq "$pattern"; then
                echo -e "${BLUE}Stopping $name (PID: $pid)...${NC}"
                kill -TERM "$pid" 2>/dev/null
                sleep 1
                if kill -0 "$pid" 2>/dev/null; then
                    echo -e "${RED}Force killing $name...${NC}"
                    kill -9 "$pid" 2>/dev/null
                fi
                echo -e "${GREEN}✅ $name stopped${NC}"
            else
                echo -e "${YELLOW}Skipping PID $pid from $pidfile (not matching $name).${NC}"
            fi
        else
            echo -e "${RED}$name (PID: $pid) is not running${NC}"
        fi
        rm -f "$pidfile"
    else
        echo -e "${RED}No PID file found for $name ($pidfile)${NC}"
    fi
}

# Function to kill by port if process matches expected pattern
kill_port_if_matches() {
    local port=$1
    local name=$2
    local pattern=$3
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [ -z "$pids" ]; then
        return
    fi
    for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
        if echo "$cmd" | grep -Eq "$pattern"; then
            echo -e "${BLUE}Killing $name on port $port (PID: $pid)...${NC}"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
            echo -e "${GREEN}✅ Port $port cleaned for $name${NC}"
        else
            echo -e "${YELLOW}Skipping PID $pid on port $port (not a PixiSys $name process).${NC}"
        fi
    done
}

kill_by_pattern() {
    local pattern=$1
    local name=$2
    local pids
    pids=$(pgrep -f "$pattern" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo -e "${BLUE}Stopping $name by pattern...${NC}"
        echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
        sleep 1
        pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs -r kill -9 2>/dev/null || true
        fi
    fi
}

# Stop using PID files
stop_by_pidfile "/tmp/pixierp_backend.pid" "ERP Backend" "gunicorn .*erp_system\\.asgi:application|daphne .*erp_system\\.asgi:application"
stop_by_pidfile "/tmp/pixinvoice_backend.pid" "Invoice Backend" "gunicorn .*invoice_system\\.wsgi:application|manage\\.py runserver .*:${INV_BACKEND_PORT}"
stop_by_pidfile "/tmp/pixierp_frontend.pid" "ERP Frontend" "react-scripts/scripts/start|webpack-dev-server|pixierp/frontend"
stop_by_pidfile "/tmp/pixinvoice_frontend.pid" "Invoice Frontend" "react-scripts/scripts/start|webpack-dev-server|pixinvoice/frontend"

# Pattern fallback only for known PixiSys services
kill_by_pattern "gunicorn .*erp_system\\.asgi:application" "ERP Backend"
kill_by_pattern "gunicorn .*invoice_system\\.wsgi:application" "Invoice Backend"
kill_by_pattern "daphne -b 0\\.0\\.0\\.0 -p ${ERP_BACKEND_PORT} erp_system\\.asgi:application" "ERP Backend daphne"
kill_by_pattern "manage.py runserver 0\\.0\\.0\\.0:${INV_BACKEND_PORT}" "Invoice Backend runserver"

# Fallback: kill by port numbers (from config or defaults)
echo ""
echo -e "${BLUE}Cleaning up ports (fallback)...${NC}"
kill_port_if_matches "$ERP_BACKEND_PORT" "ERP Backend" "gunicorn .*erp_system\\.asgi:application|daphne .*erp_system\\.asgi:application"
kill_port_if_matches "$INV_BACKEND_PORT" "Invoice Backend" "gunicorn .*invoice_system\\.wsgi:application|manage\\.py runserver .*:${INV_BACKEND_PORT}"
kill_port_if_matches "$ERP_FRONTEND_PORT" "ERP Frontend" "react-scripts/scripts/start|webpack-dev-server|pixierp/frontend"
kill_port_if_matches "$INV_FRONTEND_PORT" "Invoice Frontend" "react-scripts/scripts/start|webpack-dev-server|pixinvoice/frontend"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ PixiSys stopped successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
