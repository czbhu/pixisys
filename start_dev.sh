#!/bin/bash

# PixiSys Development Mode Starter
# Egyszerű wrapper a start.sh development módban történő indításához

echo "🚀 Starting PixiSys in DEVELOPMENT mode..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run start.sh in development mode
export PRODUCTION_MODE=false
exec "$SCRIPT_DIR/start.sh"
