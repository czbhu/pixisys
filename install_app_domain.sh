#!/bin/bash
# app.pixisys.eu (kassza app) nginx telepítése - futtasd sudo-val:
#   sudo bash /home/ceze/pixisys/install_app_domain.sh
# Előfeltétel: app.pixisys.eu A rekord → erre a szerverre (81.182.255.57)
set -e
cp /home/ceze/pixisys/nginx/app.pixisys.eu.conf /etc/nginx/sites-available/app.pixisys.eu.conf
ln -sf /etc/nginx/sites-available/app.pixisys.eu.conf /etc/nginx/sites-enabled/app.pixisys.eu.conf
nginx -t
systemctl reload nginx
echo "OK - HTTP működik. HTTPS tanúsítvány:"
echo "  sudo certbot --nginx -d app.pixisys.eu"
