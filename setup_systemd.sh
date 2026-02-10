#!/bin/bash
set -e

# Configuration
USER="ceze"
GROUP="ceze"
BASE_DIR="/home/ceze/pixisys"
ERP_DIR="${BASE_DIR}/pixierp"
INV_DIR="${BASE_DIR}/pixinvoice/invoice_app"

echo "Creating systemd service files..."

# --- PixiERP Backend Service ---
cat <<EOF | sudo tee /etc/systemd/system/pixierp-backend.service
[Unit]
Description=PixiERP Backend Service
After=network.target postgresql.service redis-server.service

[Service]
User=${USER}
Group=${GROUP}
WorkingDirectory=${ERP_DIR}
Environment="PATH=${ERP_DIR}/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=${ERP_DIR}/venv/bin/gunicorn erp_system.asgi:application --bind 0.0.0.0:8003 -w 4 -k uvicorn.workers.UvicornWorker --timeout 120 --access-logfile - --error-logfile -
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "✓ Created /etc/systemd/system/pixierp-backend.service"

# --- PixInvoice Backend Service ---
cat <<EOF | sudo tee /etc/systemd/system/pixinvoice-backend.service
[Unit]
Description=PixInvoice Backend Service
After=network.target postgresql.service

[Service]
User=${USER}
Group=${GROUP}
WorkingDirectory=${INV_DIR}
Environment="PATH=${INV_DIR}/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=${INV_DIR}/venv/bin/gunicorn invoice_system.wsgi:application --bind 0.0.0.0:4001 -w 6 --timeout 120 --access-logfile - --error-logfile -
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "✓ Created /etc/systemd/system/pixinvoice-backend.service"

# Reload and Enable
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "Enabling services..."
sudo systemctl enable pixierp-backend
sudo systemctl enable pixinvoice-backend

echo "Starting services..."
# Stop any manually running instances first (optional, but good practice since start.sh might have started them)
pkill -f "gunicorn erp_system.asgi" || true
pkill -f "gunicorn invoice_system.wsgi" || true
pkill -f "daphne" || true
pkill -f "manage.py runserver" || true

sudo systemctl restart pixierp-backend
sudo systemctl restart pixinvoice-backend

echo "✓ Services started and enabled for auto-restart!"
sudo systemctl status pixierp-backend pixinvoice-backend --no-pager
