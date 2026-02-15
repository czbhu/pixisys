#!/bin/bash

# PixiSys Status Script
echo "🔍 Checking PixiSys services status..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check process by PID file
check_by_pidfile() {
    local pidfile=$1
    local name=$2
    
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${GREEN}✅ $name is running (PID: $pid)${NC}"
            return 0
        else
            echo -e "${RED}❌ $name is NOT running (stale PID file: $pid)${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ $name - no PID file found${NC}"
        return 1
    fi
}

# Function to check port
check_port() {
    local port=$1
    local name=$2
    local pid=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo -e "${GREEN}   Port $port: active (PID: $pid)${NC}"
        return 0
    else
        echo -e "${RED}   Port $port: inactive${NC}"
        return 1
    fi
}

echo ""
echo -e "${BLUE}=== Backend Services ===${NC}"
check_by_pidfile "/tmp/pixierp_backend.pid" "ERP Backend"
check_port 8003 "ERP Backend"

echo ""
check_by_pidfile "/tmp/pixinvoice_backend.pid" "Invoice Backend"
check_port 4001 "Invoice Backend"

echo ""
echo -e "${BLUE}=== Frontend Services ===${NC}"
check_by_pidfile "/tmp/pixierp_frontend.pid" "ERP Frontend"
check_port 3000 "ERP Frontend"

echo ""
check_by_pidfile "/tmp/pixinvoice_frontend.pid" "Invoice Frontend"
check_port 4000 "Invoice Frontend"

echo ""
echo -e "${BLUE}=== Logs ===${NC}"
echo "   ERP Backend:      tail -f /tmp/pixierp_backend.log"
echo "   Invoice Backend:  tail -f /tmp/pixinvoice_backend.log"
echo "   ERP Frontend:     tail -f /tmp/pixierp_frontend.log"
echo "   Invoice Frontend: tail -f /tmp/pixinvoice_frontend.log"
echo ""
