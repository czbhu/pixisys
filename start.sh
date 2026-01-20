#!/bin/bash

# PixiSys Complete Start Script (ERP + Invoice)
echo "🚀 Starting PixiSys (ERP + Invoice)..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Production mode flag (default: true for production)
PRODUCTION_MODE=${PRODUCTION_MODE:-true}

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

# Only kill frontend ports in dev mode (production uses nginx)
if [ "$PRODUCTION_MODE" != "true" ]; then
    kill_port 3000  # ERP frontend (dev server)
    kill_port 4000  # Invoice frontend (dev server)
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
daphne -b 0.0.0.0 -p ${ERP_BACKEND_PORT} erp_system.asgi:application > /tmp/pixierp_backend.log 2>&1 &
ERP_BACKEND_PID=$!
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
python manage.py runserver 0.0.0.0:${INV_BACKEND_PORT} > /tmp/pixinvoice_backend.log 2>&1 &
INVOICE_BACKEND_PID=$!
echo -e "${GREEN}✅ Invoice Backend started (PID: $INVOICE_BACKEND_PID)${NC}"
deactivate

# Wait for backends to start
echo "⏳ Waiting for backends to initialize..."
sleep 3

if [ "$PRODUCTION_MODE" = "true" ]; then
    # Production mode: Build frontends for nginx
    echo -e "${BLUE}🏗️  Production Mode: Building frontends...${NC}"
    
    # Build ERP Frontend
    echo -e "${BLUE}Building ERP Frontend...${NC}"
    cd "$SCRIPT_DIR/pixierp/frontend"
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Error: pixierp/frontend/package.json not found${NC}"
        exit 1
    fi
    # Use relative API path so nginx can proxy to backend in production
    REACT_APP_API_URL="/api/v1" npm run build > /tmp/pixierp_build.log 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ ERP Frontend built successfully${NC}"
    else
        echo -e "${RED}❌ ERP Frontend build failed. Check /tmp/pixierp_build.log${NC}"
        exit 1
    fi
    
    # Build Invoice Frontend
    echo -e "${BLUE}Building Invoice Frontend...${NC}"
    cd "$SCRIPT_DIR/pixinvoice/frontend"
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Error: pixinvoice/frontend/package.json not found${NC}"
        exit 1
    fi
    # PixInvoice frontend expects endpoints like /api/companies, so leave base empty for same-origin
    REACT_APP_API_URL="" npm run build > /tmp/pixinvoice_build.log 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Invoice Frontend built successfully${NC}"
    else
        echo -e "${RED}❌ Invoice Frontend build failed. Check /tmp/pixinvoice_build.log${NC}"
        exit 1
    fi
    
    ERP_FRONTEND_PID="N/A (nginx serves build/)"
    INVOICE_FRONTEND_PID="N/A (nginx serves build/)"
    
else
    # Development mode: Start dev servers
    echo -e "${BLUE}💻 Development Mode: Starting dev servers...${NC}"
    
    # Start ERP Frontend
    echo -e "${BLUE}⚛️  Starting ERP Frontend (port ${ERP_FRONTEND_PORT})...${NC}"
    cd "$SCRIPT_DIR/pixierp/frontend"
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Error: pixierp/frontend/package.json not found${NC}"
        exit 1
    fi
    
    if [ ! -d "node_modules" ]; then
        echo -e "${RED}❌ Error: pixierp/frontend/node_modules not found. Run: npm install${NC}"
        exit 1
    fi
    
    PORT=${ERP_FRONTEND_PORT} BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true REACT_APP_API_URL=/api/v1 npm start > /tmp/pixierp_frontend.log 2>&1 &
    ERP_FRONTEND_PID=$!
    echo -e "${GREEN}✅ ERP Frontend started (PID: $ERP_FRONTEND_PID)${NC}"
    
    # Start Invoice Frontend
    echo -e "${BLUE}⚛️  Starting Invoice Frontend (port ${INV_FRONTEND_PORT})...${NC}"
    cd "$SCRIPT_DIR/pixinvoice/frontend"
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Error: pixinvoice/frontend/package.json not found${NC}"
        exit 1
    fi
    
    if [ ! -d "node_modules" ]; then
        echo -e "${RED}❌ Error: pixinvoice/frontend/node_modules not found. Run: npm install${NC}"
        exit 1
    fi
    
    PORT=${INV_FRONTEND_PORT} BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true REACT_APP_API_URL= npm start > /tmp/pixinvoice_frontend.log 2>&1 &
    INVOICE_FRONTEND_PID=$!
    echo -e "${GREEN}✅ Invoice Frontend started (PID: $INVOICE_FRONTEND_PID)${NC}"
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
    kill $ERP_BACKEND_PID $INVOICE_BACKEND_PID $ERP_FRONTEND_PID $INVOICE_FRONTEND_PID 2>/dev/null
    kill_port ${ERP_BACKEND_PORT}
    kill_port ${INV_BACKEND_PORT}
    kill_port ${ERP_FRONTEND_PORT}
    kill_port ${INV_FRONTEND_PORT}
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait
