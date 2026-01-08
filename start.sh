#!/bin/bash

# PixiSys Complete Start Script (ERP + Invoice)
echo "🚀 Starting PixiSys (ERP + Invoice)..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if port is in use and kill the process
kill_port() {
    local port=$1
    local pid=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo -e "${RED}Port $port is in use (PID: $pid), killing it...${NC}"
        kill -9 $pid 2>/dev/null
        sleep 1
    fi
}

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
kill_port 8003  # ERP backend (Daphne)
kill_port 4001  # Invoice backend
kill_port 3000  # ERP frontend
kill_port 4000  # Invoice frontend

# Start ERP Backend (Daphne)
echo -e "${BLUE}📡 Starting ERP Backend (Daphne on port 8003)...${NC}"
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
daphne -b 0.0.0.0 -p 8003 erp_system.asgi:application > /tmp/pixierp_backend.log 2>&1 &
ERP_BACKEND_PID=$!
echo -e "${GREEN}✅ ERP Backend started (PID: $ERP_BACKEND_PID)${NC}"
deactivate

# Start Invoice Backend
echo -e "${BLUE}📡 Starting Invoice Backend (port 4001)...${NC}"
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
python manage.py runserver 127.0.0.1:4001 > /tmp/pixinvoice_backend.log 2>&1 &
INVOICE_BACKEND_PID=$!
echo -e "${GREEN}✅ Invoice Backend started (PID: $INVOICE_BACKEND_PID)${NC}"
deactivate

# Wait for backends to start
echo "⏳ Waiting for backends to initialize..."
sleep 3

# Start ERP Frontend
echo -e "${BLUE}⚛️  Starting ERP Frontend (port 3000)...${NC}"
cd "$SCRIPT_DIR/pixierp/frontend"
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: pixierp/frontend/package.json not found${NC}"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo -e "${RED}❌ Error: pixierp/frontend/node_modules not found. Run: npm install${NC}"
    exit 1
fi

BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true REACT_APP_API_URL=/api/v1 npm start > /tmp/pixierp_frontend.log 2>&1 &
ERP_FRONTEND_PID=$!
echo -e "${GREEN}✅ ERP Frontend started (PID: $ERP_FRONTEND_PID)${NC}"

# Start Invoice Frontend
echo -e "${BLUE}⚛️  Starting Invoice Frontend (port 4000)...${NC}"
cd "$SCRIPT_DIR/pixinvoice/frontend"
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: pixinvoice/frontend/package.json not found${NC}"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo -e "${RED}❌ Error: pixinvoice/frontend/node_modules not found. Run: npm install${NC}"
    exit 1
fi

BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true REACT_APP_API_URL=http://localhost:4001 npm start > /tmp/pixinvoice_frontend.log 2>&1 &
INVOICE_FRONTEND_PID=$!
echo -e "${GREEN}✅ Invoice Frontend started (PID: $INVOICE_FRONTEND_PID)${NC}"

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ PixiSys Started Successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}ERP System:${NC}"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:8003"
echo "   Admin:     http://localhost:8003/admin"
echo ""
echo -e "${BLUE}Invoice System:${NC}"
echo "   Frontend:  http://localhost:4000"
echo "   Backend:   http://localhost:4001"
echo "   Admin:     http://localhost:4001/admin"
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
    kill $ERP_BACKEND_PID $INVOICE_BACKEND_PID $ERP_FRONTEND_PID $INVOICE_FRONTEND_PID 2>/dev/null
    kill_port 8003
    kill_port 4001
    kill_port 3000
    kill_port 4000
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait
