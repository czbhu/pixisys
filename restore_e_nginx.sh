#!/bin/bash
# restore_e_nginx.sh

CONF="/etc/nginx/sites-available/e.pixisys.eu.conf"

echo "Restoring e.pixisys.eu Nginx config..."

if [ ! -f "$CONF" ]; then
    echo "Error: $CONF not found!"
    exit 1
fi

# Add client_max_body_size if not present
if ! grep -q "client_max_body_size" "$CONF"; then
    echo "Adding upload limit..."
    sed -i '/server_name e.pixisys.eu;/a \    client_max_body_size 1000M;' "$CONF"
fi

# Enable site
echo "Enabling site..."
ln -s -f "$CONF" "/etc/nginx/sites-enabled/e.pixisys.eu.conf"

# Reload Nginx
echo "Reloading Nginx..."
systemctl reload nginx

echo "Done!"
