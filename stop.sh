#!/bin/bash

# PixiSys Stop Script
echo "🛑 Stopping PixiSys services..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to stop process by PID file
stop_by_pidfile() {
    local pidfile=$1
    local name=$2
    
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${BLUE}Stopping $name (PID: $pid)...${NC}"
            kill "$pid" 2>/dev/null
            sleep 1
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${RED}Force killing $name...${NC}"
                kill -9 "$pid" 2>/dev/null
            fi
            echo -e "${GREEN}✅ $name stopped${NC}"
        else
            echo -e "${RED}$name (PID: $pid) is not running${NC}"
        fi
        rm -f "$pidfile"
    else
        echo -e "${RED}No PID file found for $name ($pidfile)${NC}"
    fi
}

# Function to kill by port
kill_port() {
    local port=$1
    local name=$2
    local pid=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo -e "${BLUE}Killing process on port $port ($name)...${NC}"
        kill -9 $pid 2>/dev/null
        echo -e "${GREEN}✅ Port $port freed${NC}"
    fi
}

# Stop using PID files
stop_by_pidfile "/tmp/pixierp_backend.pid" "ERP Backend"
stop_by_pidfile "/tmp/pixinvoice_backend.pid" "Invoice Backend"
stop_by_pidfile "/tmp/pixierp_frontend.pid" "ERP Frontend"
stop_by_pidfile "/tmp/pixinvoice_frontend.pid" "Invoice Frontend"

# Fallback: kill by port numbers (from config or defaults)
echo ""
echo -e "${BLUE}Cleaning up ports (fallback)...${NC}"
kill_port 8003 "ERP Backend"
kill_port 4001 "Invoice Backend"
kill_port 3000 "ERP Frontend"
kill_port 4000 "Invoice Frontend"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ PixiSys stopped successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
