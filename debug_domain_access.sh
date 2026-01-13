#!/bin/bash

# PixiSys Domain Access Debug Script
# Run this script on the server where domain access is not working

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}PixiSys Domain Access Debug${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. Check config.sh
echo -e "${BLUE}[1] Checking config.sh configuration...${NC}"
if [ -f "$SCRIPT_DIR/config.sh" ]; then
    echo -e "${GREEN}✓ config.sh exists${NC}"
    source "$SCRIPT_DIR/config.sh" --load-only 2>/dev/null
    echo "   ERP_DOMAIN: $ERP_DOMAIN"
    echo "   INV_DOMAIN: $INV_DOMAIN"
    echo "   ERP_FRONTEND_URL: $ERP_FRONTEND_URL"
    echo "   ERP_BACKEND_URL: $ERP_BACKEND_URL"
    echo "   INV_FRONTEND_URL: $INV_FRONTEND_URL"
    echo "   INV_BACKEND_URL: $INV_BACKEND_URL"
else
    echo -e "${RED}✗ config.sh not found!${NC}"
    echo -e "${YELLOW}  Run: cd $SCRIPT_DIR && ./config.sh${NC}"
fi
echo ""

# 2. Check DNS resolution
echo -e "${BLUE}[2] Checking DNS resolution...${NC}"
for domain in "$ERP_DOMAIN" "$INV_DOMAIN"; do
    if [ -n "$domain" ]; then
        if host "$domain" >/dev/null 2>&1; then
            IP=$(host "$domain" | grep "has address" | awk '{print $4}' | head -1)
            echo -e "${GREEN}✓ $domain resolves to $IP${NC}"
        else
            echo -e "${RED}✗ $domain does not resolve${NC}"
            echo -e "${YELLOW}  Check /etc/hosts or DNS settings${NC}"
        fi
    fi
done
echo ""

# 3. Check nginx
echo -e "${BLUE}[3] Checking nginx...${NC}"
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo -e "${GREEN}✓ nginx is running${NC}"
else
    echo -e "${RED}✗ nginx is not running${NC}"
    echo -e "${YELLOW}  Run: sudo systemctl start nginx${NC}"
fi

if sudo nginx -t >/dev/null 2>&1; then
    echo -e "${GREEN}✓ nginx configuration is valid${NC}"
else
    echo -e "${RED}✗ nginx configuration has errors${NC}"
    echo -e "${YELLOW}  Run: sudo nginx -t${NC}"
fi

# Check if domain configs exist
for domain in "$ERP_DOMAIN" "$INV_DOMAIN"; do
    if [ -n "$domain" ]; then
        if [ -L "/etc/nginx/sites-enabled/${domain}.conf" ]; then
            echo -e "${GREEN}✓ /etc/nginx/sites-enabled/${domain}.conf exists${NC}"
        elif [ -f "/etc/nginx/sites-available/${domain}.conf" ]; then
            echo -e "${YELLOW}⚠ /etc/nginx/sites-available/${domain}.conf exists but not enabled${NC}"
            echo -e "${YELLOW}  Run: sudo ln -sf /etc/nginx/sites-available/${domain}.conf /etc/nginx/sites-enabled/${NC}"
        else
            echo -e "${RED}✗ nginx config for $domain not found${NC}"
            echo -e "${YELLOW}  Run: ./config.sh (option 4 to regenerate nginx)${NC}"
        fi
    fi
done
echo ""

# 4. Check listening ports
echo -e "${BLUE}[4] Checking listening ports...${NC}"
PORTS=("3000:ERP Frontend" "8003:ERP Backend" "4000:Invoice Frontend" "4001:Invoice Backend")
for port_info in "${PORTS[@]}"; do
    PORT="${port_info%%:*}"
    NAME="${port_info#*:}"
    if ss -tlnp 2>/dev/null | grep -q ":$PORT " || netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
        echo -e "${GREEN}✓ Port $PORT ($NAME) is listening${NC}"
    else
        echo -e "${RED}✗ Port $PORT ($NAME) is NOT listening${NC}"
        echo -e "${YELLOW}  Services may not be running. Check: ./start.sh${NC}"
    fi
done
echo ""

# 5. Check backend binding addresses
echo -e "${BLUE}[5] Checking backend binding addresses...${NC}"
if ps aux | grep -q "[d]aphne -b 0.0.0.0"; then
    echo -e "${GREEN}✓ ERP Backend (Daphne) is bound to 0.0.0.0${NC}"
elif ps aux | grep -q "[d]aphne"; then
    echo -e "${YELLOW}⚠ ERP Backend (Daphne) is running but may be bound to 127.0.0.1${NC}"
    echo -e "${YELLOW}  Check: ps aux | grep daphne${NC}"
else
    echo -e "${RED}✗ ERP Backend (Daphne) is not running${NC}"
fi

if ps aux | grep -q "runserver 0.0.0.0:4001"; then
    echo -e "${GREEN}✓ Invoice Backend is bound to 0.0.0.0:4001${NC}"
elif ps aux | grep -q "runserver.*4001"; then
    echo -e "${YELLOW}⚠ Invoice Backend is running but may be bound to 127.0.0.1${NC}"
    echo -e "${YELLOW}  Check: ps aux | grep runserver${NC}"
else
    echo -e "${RED}✗ Invoice Backend is not running${NC}"
fi
echo ""

# 6. Check .env files
echo -e "${BLUE}[6] Checking .env configurations...${NC}"
# ERP Backend
if [ -f "$SCRIPT_DIR/pixierp/.env" ]; then
    echo -e "${GREEN}✓ pixierp/.env exists${NC}"
    ALLOWED_HOSTS=$(grep "^ALLOWED_HOSTS=" "$SCRIPT_DIR/pixierp/.env" | cut -d= -f2)
    echo "   ALLOWED_HOSTS=$ALLOWED_HOSTS"
    if echo "$ALLOWED_HOSTS" | grep -q "$ERP_DOMAIN"; then
        echo -e "${GREEN}   ✓ ERP_DOMAIN ($ERP_DOMAIN) is in ALLOWED_HOSTS${NC}"
    else
        echo -e "${RED}   ✗ ERP_DOMAIN ($ERP_DOMAIN) is NOT in ALLOWED_HOSTS${NC}"
        echo -e "${YELLOW}   Run: ./install.sh or manually edit pixierp/.env${NC}"
    fi
else
    echo -e "${RED}✗ pixierp/.env not found${NC}"
fi

# ERP Frontend
if [ -f "$SCRIPT_DIR/pixierp/frontend/.env" ]; then
    echo -e "${GREEN}✓ pixierp/frontend/.env exists${NC}"
    API_URL=$(grep "^REACT_APP_API_URL=" "$SCRIPT_DIR/pixierp/frontend/.env" | cut -d= -f2)
    echo "   REACT_APP_API_URL=$API_URL"
else
    echo -e "${RED}✗ pixierp/frontend/.env not found${NC}"
fi

# Invoice Backend
if [ -f "$SCRIPT_DIR/pixinvoice/invoice_app/.env" ]; then
    echo -e "${GREEN}✓ pixinvoice/invoice_app/.env exists${NC}"
    ALLOWED_HOSTS=$(grep "^ALLOWED_HOSTS=" "$SCRIPT_DIR/pixinvoice/invoice_app/.env" | cut -d= -f2)
    echo "   ALLOWED_HOSTS=$ALLOWED_HOSTS"
    if echo "$ALLOWED_HOSTS" | grep -q "$INV_DOMAIN"; then
        echo -e "${GREEN}   ✓ INV_DOMAIN ($INV_DOMAIN) is in ALLOWED_HOSTS${NC}"
    else
        echo -e "${RED}   ✗ INV_DOMAIN ($INV_DOMAIN) is NOT in ALLOWED_HOSTS${NC}"
        echo -e "${YELLOW}   Run: ./install.sh or manually edit pixinvoice/invoice_app/.env${NC}"
    fi
else
    echo -e "${RED}✗ pixinvoice/invoice_app/.env not found${NC}"
fi

# Invoice Frontend
if [ -f "$SCRIPT_DIR/pixinvoice/frontend/.env" ]; then
    echo -e "${GREEN}✓ pixinvoice/frontend/.env exists${NC}"
    API_URL=$(grep "^REACT_APP_API_URL=" "$SCRIPT_DIR/pixinvoice/frontend/.env" | cut -d= -f2)
    echo "   REACT_APP_API_URL=$API_URL"
else
    echo -e "${RED}✗ pixinvoice/frontend/.env not found${NC}"
fi
echo ""

# 7. Check firewall
echo -e "${BLUE}[7] Checking firewall...${NC}"
if command -v ufw >/dev/null 2>&1; then
    if sudo ufw status | grep -q "Status: active"; then
        echo -e "${YELLOW}⚠ UFW firewall is active${NC}"
        echo "   Checking port rules:"
        for port in 80 443 3000 4000 8003 4001; do
            if sudo ufw status | grep -q "$port"; then
                echo -e "${GREEN}   ✓ Port $port allowed${NC}"
            else
                echo -e "${RED}   ✗ Port $port not allowed${NC}"
                echo -e "${YELLOW}     Run: sudo ufw allow $port${NC}"
            fi
        done
    else
        echo -e "${GREEN}✓ UFW firewall is inactive${NC}"
    fi
else
    echo "   UFW not installed, checking firewalld..."
    if systemctl is-active --quiet firewalld 2>/dev/null; then
        echo -e "${YELLOW}⚠ firewalld is active${NC}"
        echo -e "${YELLOW}   Check rules: sudo firewall-cmd --list-all${NC}"
    else
        echo -e "${GREEN}✓ No active firewall detected${NC}"
    fi
fi
echo ""

# 8. Check nginx error logs
echo -e "${BLUE}[8] Recent nginx errors (last 20 lines)...${NC}"
if [ -n "$ERP_DOMAIN" ] && [ -f "/var/log/nginx/${ERP_DOMAIN}-error.log" ]; then
    echo -e "${BLUE}--- $ERP_DOMAIN errors ---${NC}"
    sudo tail -20 "/var/log/nginx/${ERP_DOMAIN}-error.log" 2>/dev/null | grep -v "^\s*$" || echo "   No recent errors"
fi
if [ -n "$INV_DOMAIN" ] && [ -f "/var/log/nginx/${INV_DOMAIN}-error.log" ]; then
    echo -e "${BLUE}--- $INV_DOMAIN errors ---${NC}"
    sudo tail -20 "/var/log/nginx/${INV_DOMAIN}-error.log" 2>/dev/null | grep -v "^\s*$" || echo "   No recent errors"
fi
echo ""

# 9. Test local connections
echo -e "${BLUE}[9] Testing local connections...${NC}"
for port in 3000 8003 4000 4001; do
    if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://localhost:$port" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ localhost:$port is reachable${NC}"
    else
        echo -e "${RED}✗ localhost:$port is NOT reachable${NC}"
    fi
done
echo ""

# Summary and recommendations
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Recommendations:${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}If domain access fails:${NC}"
echo "1. Verify DNS/hosts file points domain to this server's IP"
echo "2. Ensure all services are running: ./start.sh"
echo "3. Check ALLOWED_HOSTS in .env files includes your domain"
echo "4. Verify nginx configs are generated: ./config.sh (option 4)"
echo "5. Reload nginx: sudo systemctl reload nginx"
echo "6. Check firewall allows HTTP (80) and HTTPS (443)"
echo "7. Review nginx error logs above for specific errors"
echo ""
echo -e "${YELLOW}Quick fix commands:${NC}"
echo "   ./config.sh          # Reconfigure domains"
echo "   ./install.sh         # Reinstall and regenerate configs"
echo "   ./start.sh           # (Re)start all services"
echo ""
