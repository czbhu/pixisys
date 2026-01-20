#!/bin/bash
# apply_nginx_fix.sh

SRC="/home/ceze/pixisys/nginx/erp.pixisys.eu.conf"
DEST="/etc/nginx/sites-available/erp.pixisys.eu.conf"

echo "Applying Nginx Fix..."
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

echo "Testing config..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Reloading Nginx..."
    systemctl reload nginx
    echo "Done! check connection."
else
    echo "Nginx config test failed! Reverting..."
    if [ -f "${DEST}.bak" ]; then
        mv "${DEST}.bak" "$DEST"
    fi
    exit 1
fi
