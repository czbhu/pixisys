#!/bin/bash

# PixiSys Complete Start Script (ERP + Invoice)
echo "🚀 Starting PixiSys (ERP + Invoice)..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Production mode flag (default: true for production)
PRODUCTION_MODE=${PRODUCTION_MODE:-true}
BUILD_ONLY=false

# Check for --build-only argument
if [[ "$1" == "--build-only" ]]; then
    BUILD_ONLY=true
    echo -e "${YELLOW}Argument --build-only detected: Skipping backend startup.${NC}"
fi

# Load domain configuration
if [ -f "$SCRIPT_DIR/config.sh" ]; then
    source "$SCRIPT_DIR/config.sh" --load-only
else
    # Fallback to localhost if no config
    ERP_FRONTEND_URL="http://localhost:3000"
    ERP_BACKEND_URL="http://localhost:8003"
    INV_FRONTEND_URL="http://localhost:4000"
    INV_BACKEND_URL="http://localhost:4001"
    ERP_BACKEND_PORT="8003"
    INV_BACKEND_PORT="4001"
fi

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# PID files
ERP_BACKEND_PIDFILE="/tmp/pixierp_backend.pid"
INVOICE_BACKEND_PIDFILE="/tmp/pixinvoice_backend.pid"
ERP_FRONTEND_PIDFILE="/tmp/pixierp_frontend.pid"
INVOICE_FRONTEND_PIDFILE="/tmp/pixinvoice_frontend.pid"
ERP_FRONTEND_PORT="${ERP_FRONTEND_PORT:-3000}"
INV_FRONTEND_PORT="${INV_FRONTEND_PORT:-3001}"

# Function to kill only expected PixiSys process on a port
kill_port_if_matches() {
    local port=$1
    local pattern=$2
    local name=$3
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [ -z "$pids" ]; then
        return
    fi

    for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
        if echo "$cmd" | grep -Eq "$pattern"; then
            echo -e "${YELLOW}Stopping $name on port $port (PID: $pid)...${NC}"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${RED}Force killing $name (PID: $pid)...${NC}"
                kill -9 "$pid" 2>/dev/null || true
            fi
        else
            echo -e "${YELLOW}Skipping PID $pid on port $port (not a PixiSys $name process).${NC}"
        fi
    done
}

kill_by_pidfile() {
    local pidfile=$1
    local name=$2
    local pattern=$3
    if [ -f "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile" 2>/dev/null)
        if [ ! -z "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            local cmd
            cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
            if echo "$cmd" | grep -Eq "$pattern"; then
                echo -e "${YELLOW}Stopping $name from PID file (PID: $pid)...${NC}"
                kill -TERM "$pid" 2>/dev/null || true
                sleep 1
                if kill -0 "$pid" 2>/dev/null; then
                    echo -e "${RED}$name did not stop gracefully, force killing PID: $pid${NC}"
                    kill -9 "$pid" 2>/dev/null || true
                fi
            else
                echo -e "${YELLOW}Skipping PID $pid from $pidfile (process does not match $name).${NC}"
            fi
        fi
        rm -f "$pidfile"
    fi
}

kill_by_pattern() {
    local pattern=$1
    local name=$2
    local pids
    pids=$(pgrep -f "$pattern" 2>/dev/null || true)
    if [ ! -z "$pids" ]; then
        echo -e "${YELLOW}Stopping stale $name process(es) by pattern...${NC}"
        echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
        sleep 1
        pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ ! -z "$pids" ]; then
            echo -e "${RED}Force killing stale $name process(es)...${NC}"
            echo "$pids" | xargs -r kill -9 2>/dev/null || true
        fi
    fi
}

if [ "$BUILD_ONLY" = "false" ]; then
    # Kill any existing processes on our ports
    echo "🧹 Cleaning up existing processes..."
    kill_by_pidfile "$ERP_BACKEND_PIDFILE" "ERP Backend" "gunicorn .*erp_system\\.asgi:application|daphne .*erp_system\\.asgi:application"
    kill_by_pidfile "$INVOICE_BACKEND_PIDFILE" "Invoice Backend" "gunicorn .*invoice_system\\.wsgi:application|manage\\.py runserver .*:${INV_BACKEND_PORT}"
    kill_by_pidfile "$ERP_FRONTEND_PIDFILE" "ERP Frontend" "react-scripts/scripts/start|webpack-dev-server|pixierp/frontend"
    kill_by_pidfile "$INVOICE_FRONTEND_PIDFILE" "Invoice Frontend" "react-scripts/scripts/start|webpack-dev-server|pixinvoice/frontend"

    kill_by_pattern "gunicorn erp_system\\.asgi:application --bind 0\\.0\\.0\\.0:${ERP_BACKEND_PORT}" "ERP Backend gunicorn"
    kill_by_pattern "gunicorn invoice_system\\.wsgi:application --bind 0\\.0\\.0\\.0:${INV_BACKEND_PORT}" "Invoice Backend gunicorn"
    kill_by_pattern "gunicorn .*erp_system\\.asgi:application" "ERP Backend gunicorn (broad match)"
    kill_by_pattern "gunicorn .*invoice_system\\.wsgi:application" "Invoice Backend gunicorn (broad match)"
    kill_by_pattern "daphne -b 0\\.0\\.0\\.0 -p ${ERP_BACKEND_PORT} erp_system\\.asgi:application" "ERP Backend daphne"
    kill_by_pattern "manage.py runserver 0\\.0\\.0\\.0:${INV_BACKEND_PORT}" "Invoice Backend runserver"

    kill_port_if_matches ${ERP_BACKEND_PORT} "gunicorn .*erp_system\\.asgi:application|daphne .*erp_system\\.asgi:application" "ERP Backend"
    kill_port_if_matches ${INV_BACKEND_PORT} "gunicorn .*invoice_system\\.wsgi:application|manage\\.py runserver .*:${INV_BACKEND_PORT}" "Invoice Backend"

    # In dev mode, also kill frontend dev server ports
    if [ "$PRODUCTION_MODE" != "true" ]; then
        kill_port_if_matches ${ERP_FRONTEND_PORT} "react-scripts/scripts/start|webpack-dev-server|pixierp/frontend" "ERP Frontend"
        kill_port_if_matches ${INV_FRONTEND_PORT} "react-scripts/scripts/start|webpack-dev-server|pixinvoice/frontend" "Invoice Frontend"
    fi

# Start ERP Backend (Daphne)
echo -e "${BLUE}📡 Starting ERP Backend (Daphne on port ${ERP_BACKEND_PORT})...${NC}"
cd "$SCRIPT_DIR/pixierp"
if [ ! -f "manage.py" ]; then
    echo -e "${RED}❌ Error: pixierp/manage.py not found${NC}"
    exit 1
fi

if [ ! -d "venv" ]; then
    echo -e "${RED}❌ Error: pixierp/venv not found. Run: python3 -m venv venv${NC}"
    exit 1
fi

source venv/bin/activate
echo -e "${BLUE}⚡ Starting ERP Backend (Gunicorn + Uvicorn on port ${ERP_BACKEND_PORT})...${NC}"
gunicorn erp_system.asgi:application --bind 0.0.0.0:${ERP_BACKEND_PORT} -w 4 -k uvicorn.workers.UvicornWorker --timeout 120 --access-logfile - --error-logfile - > /tmp/pixierp_backend.log 2>&1 &
ERP_BACKEND_PID=$!
echo "$ERP_BACKEND_PID" > "$ERP_BACKEND_PIDFILE"
echo -e "${GREEN}✅ ERP Backend started (PID: $ERP_BACKEND_PID)${NC}"
deactivate

# Start Invoice Backend
echo -e "${BLUE}📡 Starting Invoice Backend (port ${INV_BACKEND_PORT})...${NC}"
cd "$SCRIPT_DIR/pixinvoice/invoice_app"
if [ ! -f "manage.py" ]; then
    echo -e "${RED}❌ Error: pixinvoice/invoice_app/manage.py not found${NC}"
    exit 1
fi

if [ ! -d "venv" ]; then
    echo -e "${RED}❌ Error: pixinvoice/invoice_app/venv not found. Run: python3 -m venv venv${NC}"
    exit 1
fi

source venv/bin/activate
echo -e "${BLUE}⚡ Starting Invoice Backend (Gunicorn w/ 6 workers on port ${INV_BACKEND_PORT})...${NC}"
# Using 6 workers to maximize throughput for 12-core CPU on IO-bound tasks
gunicorn invoice_system.wsgi:application --bind 0.0.0.0:${INV_BACKEND_PORT} -w 6 --timeout 120 --access-logfile - --error-logfile - > /tmp/pixinvoice_backend.log 2>&1 &
INVOICE_BACKEND_PID=$!
echo "$INVOICE_BACKEND_PID" > "$INVOICE_BACKEND_PIDFILE"
echo -e "${GREEN}✅ Invoice Backend started (PID: $INVOICE_BACKEND_PID)${NC}"
deactivate

    # Wait for backends to start
    echo "⏳ Waiting for backends to initialize..."
    sleep 3
fi

# ========================================
# Frontend: Dev Mode (hot reload) vs Production (static build)
# ========================================

if [ "$PRODUCTION_MODE" != "true" ]; then
    # ---- DEV MODE: Start React dev servers + nginx proxy ----
    echo -e "${YELLOW}⚠️  Dev Mode: Starting React dev servers with hot reload${NC}"

    # Switch nginx to dev proxy configs
    echo -e "${BLUE}🔧 Switching nginx to dev proxy mode...${NC}"

    ERP_NGINX_CONF="/etc/nginx/sites-available/erp.pixisys.eu.conf"
    INV_NGINX_CONF="/etc/nginx/sites-available/inv.pixisys.eu.conf"

    # Backup production configs if not already backed up
    [ ! -f "${ERP_NGINX_CONF}.prod" ] && sudo cp "$ERP_NGINX_CONF" "${ERP_NGINX_CONF}.prod"
    [ ! -f "${INV_NGINX_CONF}.prod" ] && sudo cp "$INV_NGINX_CONF" "${INV_NGINX_CONF}.prod"

    # Copy dev configs
    sudo cp "$SCRIPT_DIR/nginx/erp.pixisys.eu.dev.conf" "$ERP_NGINX_CONF"
    sudo cp "$SCRIPT_DIR/nginx/inv.pixisys.eu.dev.conf" "$INV_NGINX_CONF"
    echo -e "${GREEN}  ✅ nginx switched to dev proxy mode${NC}"

    sudo nginx -t > /dev/null 2>&1 && sudo systemctl reload nginx
    echo -e "${GREEN}  ✅ nginx reloaded${NC}"

    # Start ERP frontend dev server
    echo -e "${BLUE}⚛️  Starting ERP Frontend dev server (port 3000)...${NC}"
    cd "$SCRIPT_DIR/pixierp/frontend"
    PORT=3000 BROWSER=none HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true WDS_SOCKET_PORT=0 REACT_APP_API_URL=/api/v1 REACT_APP_DEV_MODE=true npm start > /tmp/pixierp_frontend.log 2>&1 &
    ERP_FRONTEND_PID=$!
    echo "$ERP_FRONTEND_PID" > "$ERP_FRONTEND_PIDFILE"
    echo -e "${GREEN}✅ ERP Frontend dev server started (PID: $ERP_FRONTEND_PID)${NC}"

    # Start Invoice frontend dev server
    echo -e "${BLUE}⚛️  Starting Invoice Frontend dev server (port ${INV_FRONTEND_PORT})...${NC}"
    cd "$SCRIPT_DIR/pixinvoice/frontend"
    PORT=${INV_FRONTEND_PORT} BROWSER=none HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true WDS_SOCKET_PORT=0 REACT_APP_API_URL="" REACT_APP_DEV_MODE=true npm start > /tmp/pixinvoice_frontend.log 2>&1 &
    INVOICE_FRONTEND_PID=$!
    echo "$INVOICE_FRONTEND_PID" > "$INVOICE_FRONTEND_PIDFILE"
    echo -e "${GREEN}✅ Invoice Frontend dev server started (PID: $INVOICE_FRONTEND_PID)${NC}"

else
    # ---- PRODUCTION: Build static files for nginx ----
    echo -e "${BLUE}🏗️  Production Mode: Building frontends in parallel...${NC}"

    (
        echo -e "${BLUE}Building ERP Frontend...${NC}"
        cd "$SCRIPT_DIR/pixierp/frontend"
        if [ ! -f "package.json" ]; then
            echo -e "${RED}❌ Error: pixierp/frontend/package.json not found${NC}"
            exit 1
        fi
        GENERATE_SOURCEMAP=false REACT_APP_API_URL="/api/v1" npm run build > /tmp/pixierp_build.log 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ ERP Frontend built successfully${NC}"
        else
            echo -e "${RED}❌ ERP Frontend build failed. Check /tmp/pixierp_build.log${NC}"
            exit 1
        fi
    ) &
    PID_ERP=$!

    (
        echo -e "${BLUE}Building Invoice Frontend...${NC}"
        cd "$SCRIPT_DIR/pixinvoice/frontend"
        if [ ! -f "package.json" ]; then
            echo -e "${RED}❌ Error: pixinvoice/frontend/package.json not found${NC}"
            exit 1
        fi
        GENERATE_SOURCEMAP=false REACT_APP_API_URL="" npm run build > /tmp/pixinvoice_build.log 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Invoice Frontend built successfully${NC}"
        else
            echo -e "${RED}❌ Invoice Frontend build failed. Check /tmp/pixinvoice_build.log${NC}"
            exit 1
        fi
    ) &
    PID_INV=$!

    wait $PID_ERP
    STATUS_ERP=$?
    wait $PID_INV
    STATUS_INV=$?

    if [ $STATUS_ERP -ne 0 ] || [ $STATUS_INV -ne 0 ]; then
        echo -e "${RED}❌ One or more builds failed.${NC}"
        exit 1
    fi

    # Restore production nginx config if dev config was active
    ERP_NGINX_CONF="/etc/nginx/sites-available/erp.pixisys.eu.conf"
    INV_NGINX_CONF="/etc/nginx/sites-available/inv.pixisys.eu.conf"
    if [ -f "${ERP_NGINX_CONF}.prod" ]; then
        sudo cp "${ERP_NGINX_CONF}.prod" "$ERP_NGINX_CONF"
        echo -e "${GREEN}  ✅ ERP nginx restored to production mode${NC}"
    fi
    if [ -f "${INV_NGINX_CONF}.prod" ]; then
        sudo cp "${INV_NGINX_CONF}.prod" "$INV_NGINX_CONF"
        echo -e "${GREEN}  ✅ Invoice nginx restored to production mode${NC}"
    fi
    sudo nginx -t > /dev/null 2>&1 && sudo systemctl reload nginx

    ERP_FRONTEND_PID="N/A (nginx serves build/)"
    INVOICE_FRONTEND_PID="N/A (nginx serves build/)"
fi

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ PixiSys Started Successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}ERP System:${NC}"
echo "   Frontend:  ${ERP_FRONTEND_URL}"
echo "   Backend:   ${ERP_BACKEND_URL}"
echo "   Admin:     ${ERP_BACKEND_URL}/admin"
echo ""
echo -e "${BLUE}Invoice System:${NC}"
echo "   Frontend:  ${INV_FRONTEND_URL}"
echo "   Backend:   ${INV_BACKEND_URL}"
echo "   Admin:     ${INV_BACKEND_URL}/admin"
echo ""
echo -e "${BLUE}Process IDs:${NC}"
echo "   ERP Backend:      $ERP_BACKEND_PID"
echo "   Invoice Backend:  $INVOICE_BACKEND_PID"
echo "   ERP Frontend:     $ERP_FRONTEND_PID"
echo "   Invoice Frontend: $INVOICE_FRONTEND_PID"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo "   ERP Backend:      tail -f /tmp/pixierp_backend.log"
echo "   Invoice Backend:  tail -f /tmp/pixinvoice_backend.log"
echo "   ERP Frontend:     tail -f /tmp/pixierp_frontend.log"
echo "   Invoice Frontend: tail -f /tmp/pixinvoice_frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${RED}🛑 Stopping all services...${NC}"
    kill_by_pidfile "$ERP_BACKEND_PIDFILE" "ERP Backend" "gunicorn .*erp_system\\.asgi:application|daphne .*erp_system\\.asgi:application"
    kill_by_pidfile "$INVOICE_BACKEND_PIDFILE" "Invoice Backend" "gunicorn .*invoice_system\\.wsgi:application|manage\\.py runserver .*:${INV_BACKEND_PORT}"
    kill_by_pidfile "$ERP_FRONTEND_PIDFILE" "ERP Frontend" "react-scripts/scripts/start|webpack-dev-server|pixierp/frontend"
    kill_by_pidfile "$INVOICE_FRONTEND_PIDFILE" "Invoice Frontend" "react-scripts/scripts/start|webpack-dev-server|pixinvoice/frontend"
    rm -f "$ERP_BACKEND_PIDFILE" "$INVOICE_BACKEND_PIDFILE" "$ERP_FRONTEND_PIDFILE" "$INVOICE_FRONTEND_PIDFILE"
    kill_port_if_matches ${ERP_BACKEND_PORT} "gunicorn .*erp_system\\.asgi:application|daphne .*erp_system\\.asgi:application" "ERP Backend"
    kill_port_if_matches ${INV_BACKEND_PORT} "gunicorn .*invoice_system\\.wsgi:application|manage\\.py runserver .*:${INV_BACKEND_PORT}" "Invoice Backend"

    # If dev mode was active, restore production nginx configs
    if [ "$PRODUCTION_MODE" != "true" ]; then
        kill_port_if_matches ${ERP_FRONTEND_PORT} "react-scripts/scripts/start|webpack-dev-server|pixierp/frontend" "ERP Frontend"
        kill_port_if_matches ${INV_FRONTEND_PORT} "react-scripts/scripts/start|webpack-dev-server|pixinvoice/frontend" "Invoice Frontend"
        ERP_NGINX_CONF="/etc/nginx/sites-available/erp.pixisys.eu.conf"
        INV_NGINX_CONF="/etc/nginx/sites-available/inv.pixisys.eu.conf"
        if [ -f "${ERP_NGINX_CONF}.prod" ]; then
            sudo cp "${ERP_NGINX_CONF}.prod" "$ERP_NGINX_CONF"
        fi
        if [ -f "${INV_NGINX_CONF}.prod" ]; then
            sudo cp "${INV_NGINX_CONF}.prod" "$INV_NGINX_CONF"
        fi
        sudo nginx -t > /dev/null 2>&1 && sudo systemctl reload nginx
        echo -e "${GREEN}  ✅ nginx restored to production mode${NC}"
    fi

    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait
