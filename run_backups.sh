#!/bin/bash

# PixiSys Unified Backup Script
# Place this in crontab to run daily (e.g., at 02:00)
# 0 2 * * * /home/ceze/pixisys/run_backups.sh >> /home/ceze/pixisys/logs/backup.log 2>&1

WORKSPACE_DIR="/home/ceze/pixisys"
LOG_DIR="$WORKSPACE_DIR/logs"
mkdir -p "$LOG_DIR"

echo "========================================================"
echo "Starting Backup Run: $(date)"
echo "========================================================"

# 1. PixiERP Backup
echo "[PixiERP] Starting backup check..."
if [ -d "$WORKSPACE_DIR/pixierp" ]; then
    cd "$WORKSPACE_DIR/pixierp"
    if [ -d "venv" ]; then
        source venv/bin/activate
        # Run without interval argument to check all active configs
        python manage.py create_backup
        deactivate
    else
        echo "[PixiERP] Error: venv not found in $PWD!"
    fi
else
    echo "[PixiERP] Error: Directory not found!"
fi
echo "[PixiERP] Finished."

echo "--------------------------------------------------------"

# 2. PixInvoice Backup
echo "[PixInvoice] Starting backup check..."
if [ -d "$WORKSPACE_DIR/pixinvoice/invoice_app" ]; then
    cd "$WORKSPACE_DIR/pixinvoice/invoice_app"
    if [ -d "venv" ]; then
        source venv/bin/activate
        # Run without arguments to check all active configs
        python manage.py create_backup
        deactivate
    else
        echo "[PixInvoice] Error: venv not found in $PWD!"
    fi
else
    echo "[PixInvoice] Error: Directory not found!"
fi
echo "[PixInvoice] Finished."

echo "========================================================"
echo "Backup Run Completed: $(date)"
echo ""
