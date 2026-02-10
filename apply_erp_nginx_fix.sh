#!/bin/bash
# apply_erp_nginx_fix.sh

SRC="/home/ceze/pixisys/nginx/erp.pixisys.eu.conf"
DEST="/etc/nginx/sites-available/erp.pixisys.eu.conf"

echo "Applying PixiERP Nginx Fix (Upload limit increase)..."
if [ ! -f "$SRC" ]; then
    echo "Error: Source file not found at $SRC"
    exit 1
fi

# Add client_max_body_size if not present
if ! grep -q "client_max_body_size" "$SRC"; then
    sed -i '/server_name erp.pixisys.eu;/a \    client_max_body_size 1000M;' "$SRC"
fi

echo "Backing up current config..."
if [ -f "$DEST" ]; then
    cp "$DEST" "${DEST}.bak"
fi

echo "Copying new config..."
cp "$SRC" "$DEST"

# Remove conflicting old config
if [ -L "/etc/nginx/sites-enabled/e.pixisys.eu.conf" ]; then
    echo "Removing conflicting e.pixisys.eu.conf..."
    rm /etc/nginx/sites-enabled/e.pixisys.eu.conf
fi

echo "Ensuring site is enabled..."
if [ ! -L "/etc/nginx/sites-enabled/erp.pixisys.eu.conf" ]; then
    ln -s "$DEST" "/etc/nginx/sites-enabled/erp.pixisys.eu.conf"
    echo "Symlink created."
else
    echo "Symlink already exists."
fi

echo "Reloading Nginx..."
systemctl reload nginx

echo "Done!"
