#!/bin/bash
# apply_inv_nginx_fix.sh

SRC="/home/ceze/pixisys/nginx/inv.pixisys.eu.conf"
DEST="/etc/nginx/sites-available/inv.pixisys.eu.conf"

echo "Applying PixInvoice Nginx Fix (Upload limit increase)..."
if [ ! -f "$SRC" ]; then
    echo "Error: Source file not found at $SRC"
    exit 1
fi

echo "Backing up current config..."
if [ -f "$DEST" ]; then
    cp "$DEST" "${DEST}.bak"
fi

echo "Copying new config..."
cp "$SRC" "$DEST"

# Remove conflicting old config
if [ -L "/etc/nginx/sites-enabled/i.pixisys.eu.conf" ]; then
    echo "Removing conflicting i.pixisys.eu.conf..."
    rm /etc/nginx/sites-enabled/i.pixisys.eu.conf
fi

echo "Ensuring site is enabled..."
if [ ! -L "/etc/nginx/sites-enabled/inv.pixisys.eu.conf" ]; then
    ln -s "$DEST" "/etc/nginx/sites-enabled/inv.pixisys.eu.conf"
    echo "Symlink created."
else
    echo "Symlink already exists."
fi

echo "Reloading Nginx..."
systemctl reload nginx

echo "Done!"
