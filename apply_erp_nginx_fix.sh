#!/bin/bash
# apply_erp_nginx_fix.sh - Fix redirect loop by adding X-Forwarded-Proto header

SRC="/home/ceze/pixisys/nginx/erp.pixisys.eu.conf.fixed"
DEST="/etc/nginx/sites-available/erp.pixisys.eu.conf"

echo "=== Applying PixiERP Nginx Fix (Redirect Loop) ==="

if [ ! -f "$SRC" ]; then
    echo "Error: Fixed config not found at $SRC"
    exit 1
fi

echo "1. Backing up current config..."
if [ -f "$DEST" ]; then
    cp "$DEST" "${DEST}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "   Backup saved"
fi

echo "2. Copying fixed config..."
cp "$SRC" "$DEST"

echo "3. Testing nginx configuration..."
nginx -t
if [ $? -ne 0 ]; then
    echo "ERROR: Nginx configuration test failed!"
    exit 1
fi

echo "4. Reloading nginx..."
systemctl reload nginx

echo ""
echo "=== SUCCESS ==="
echo "✓ Nginx configuration updated"
echo "✓ X-Forwarded-Proto header added to /api/ location"
echo "✓ Redirect loop should now be fixed"
echo ""
echo "Verifying fix:"
grep -A 10 "location /api/" "$DEST" | grep "X-Forwarded-Proto" && echo "✓ Header confirmed in config!" || echo "✗ Header missing!"

echo ""
echo "Done! Refresh your browser to test."
