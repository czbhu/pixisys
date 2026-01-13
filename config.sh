#!/bin/bash

# ===== PixiSys Domain Konfiguráció Manager =====
# Futtasd ezt a scriptet a domain beállítások konfigurálásához: ./config.sh

# Színek
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Config fájl elérési útja
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_FILE="$SCRIPT_DIR/.pixisys.conf"

# Ha paraméterként meghívják, akkor ne interaktív módban fusson
if [ "$1" = "--load-only" ]; then
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
    else
        # Alapértelmezett értékek ha nincs config fájl
        ERP_DOMAIN="localhost:3000"
        INV_DOMAIN="localhost:4000"
        ERP_BACKEND_PORT="8003"
        INV_BACKEND_PORT="4001"
        USE_HTTPS="false"
    fi
    
    # Továbbugrás a változók beállítására
    SKIP_INTERACTIVE=true
else
    SKIP_INTERACTIVE=false
fi

# ===== INTERAKTÍV KONFIGURÁCIÓ =====
if [ "$SKIP_INTERACTIVE" = "false" ]; then
    echo ""
    echo -e "${BLUE}=========================================="
    echo -e "  PixiSys Domain Konfiguráció"
    echo -e "==========================================${NC}"
    echo ""
    
    # Betöltjük a régi értékeket, ha léteznek
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
        echo -e "${GREEN}Jelenlegi konfiguráció betöltve.${NC}"
        echo ""
    fi
    
    echo -e "${YELLOW}Domain konfiguráció:${NC}"
    echo ""
    echo "Add meg a domain-eket, ahol a rendszer elérhető lesz."
    echo "A rendszer automatikusan hallgatni fog localhost-on ÉS a megadott domain-eken is."
    echo ""
    
    read -p "PixiERP domain [${ERP_DOMAIN:-te.pixisys.eu}]: " NEW_ERP_DOMAIN
    ERP_DOMAIN=${NEW_ERP_DOMAIN:-${ERP_DOMAIN:-te.pixisys.eu}}
    
    read -p "PixInvoice domain [${INV_DOMAIN:-ti.pixisys.eu}]: " NEW_INV_DOMAIN
    INV_DOMAIN=${NEW_INV_DOMAIN:-${INV_DOMAIN:-ti.pixisys.eu}}
    
    read -p "PixiERP backend port [${ERP_BACKEND_PORT:-8003}]: " NEW_ERP_BACKEND_PORT
    ERP_BACKEND_PORT=${NEW_ERP_BACKEND_PORT:-${ERP_BACKEND_PORT:-8003}}
    
    read -p "PixInvoice backend port [${INV_BACKEND_PORT:-4001}]: " NEW_INV_BACKEND_PORT
    INV_BACKEND_PORT=${NEW_INV_BACKEND_PORT:-${INV_BACKEND_PORT:-4001}}
    
    # HTTPS csak akkor, ha nem localhost domain
    if [[ "$ERP_DOMAIN" == "localhost"* ]] || [[ "$INV_DOMAIN" == "localhost"* ]]; then
        USE_HTTPS="false"
        echo ""
        echo -e "${YELLOW}⚠️  Localhost észlelve - HTTP mód${NC}"
    else
        read -p "HTTPS használata? (I/n) [${USE_HTTPS:-true}]: " USE_HTTPS_INPUT
        if [ "$USE_HTTPS_INPUT" = "n" ] || [ "$USE_HTTPS_INPUT" = "N" ]; then
            USE_HTTPS="false"
        else
            USE_HTTPS="true"
        fi
    fi
    
    echo ""
    echo -e "${GREEN}✓ Konfiguráció beállítva${NC}"
    
    # Konfiguráció mentése
    cat > "$CONFIG_FILE" <<EOF
# PixiSys Domain Konfiguráció
# Generálva: $(date)
# NE SZERKESZD MANUÁLISAN! Használd a ./config.sh scriptet!

ERP_DOMAIN="$ERP_DOMAIN"
INV_DOMAIN="$INV_DOMAIN"
ERP_BACKEND_PORT="$ERP_BACKEND_PORT"
INV_BACKEND_PORT="$INV_BACKEND_PORT"
USE_HTTPS="$USE_HTTPS"
EOF
    
    echo ""
    echo -e "${GREEN}✓ Konfiguráció mentve: ${CONFIG_FILE}${NC}"
fi

# ===== AUTOMATIKUSAN GENERÁLT ÉRTÉKEK =====
# Ne módosítsd ezeket, automatikusan generálódnak a fenti értékekből

# Protokoll meghatározása
if [ "$USE_HTTPS" = "true" ]; then
    PROTOCOL="https"
else
    PROTOCOL="http"
fi

# Domain nevek (port nélkül)
ERP_DOMAIN_NAME="${ERP_DOMAIN%%:*}"
INV_DOMAIN_NAME="${INV_DOMAIN%%:*}"

# Frontend portok (ha localhost, különben elhagyható)
if [[ "$ERP_DOMAIN" == *":"* ]]; then
    ERP_FRONTEND_PORT="${ERP_DOMAIN##*:}"
else
    ERP_FRONTEND_PORT=""
fi

if [[ "$INV_DOMAIN" == *":"* ]]; then
    INV_FRONTEND_PORT="${INV_DOMAIN##*:}"
else
    INV_FRONTEND_PORT=""
fi

# Teljes URL-ek
ERP_FRONTEND_URL="${PROTOCOL}://${ERP_DOMAIN}"
INV_FRONTEND_URL="${PROTOCOL}://${INV_DOMAIN}"
# Backend URL-ek nginx-szel használva (port nélkül, nginx proxyzi)
ERP_BACKEND_URL="${PROTOCOL}://${ERP_DOMAIN_NAME}"
INV_BACKEND_URL="${PROTOCOL}://${INV_DOMAIN_NAME}"

# ALLOWED_HOSTS generálás - MINDIG tartalmazza localhost-ot ÉS mindkét domain-t
# Így működik localhost-on, mindkét domain-en, és kereszt-domain is
ERP_ALLOWED_HOSTS="localhost,127.0.0.1,0.0.0.0,$ERP_DOMAIN_NAME,$INV_DOMAIN_NAME"
INV_ALLOWED_HOSTS="localhost,127.0.0.1,0.0.0.0,$INV_DOMAIN_NAME,$ERP_DOMAIN_NAME"

# CSRF és CORS beállítások - mindkét protokoll és mindkét domain
# Így működik az ERP és Invoice közötti kommunikáció is
if [ "$USE_HTTPS" = "true" ]; then
    ERP_CSRF_TRUSTED="http://localhost:3000,http://127.0.0.1:3000,https://$ERP_DOMAIN_NAME,http://$ERP_DOMAIN_NAME,https://$INV_DOMAIN_NAME,http://$INV_DOMAIN_NAME"
    ERP_CORS_ALLOWED="http://localhost:3000,http://127.0.0.1:3000,https://$ERP_DOMAIN_NAME,http://$ERP_DOMAIN_NAME,https://$INV_DOMAIN_NAME,http://$INV_DOMAIN_NAME"
    INV_CSRF_TRUSTED="http://localhost:4000,http://127.0.0.1:4000,https://$INV_DOMAIN_NAME,http://$INV_DOMAIN_NAME,https://$ERP_DOMAIN_NAME,http://$ERP_DOMAIN_NAME"
    INV_CORS_ALLOWED="http://localhost:4000,http://127.0.0.1:4000,https://$INV_DOMAIN_NAME,http://$INV_DOMAIN_NAME,https://$ERP_DOMAIN_NAME,http://$ERP_DOMAIN_NAME"
else
    ERP_CSRF_TRUSTED="http://localhost:3000,http://127.0.0.1:3000,http://$ERP_DOMAIN_NAME,http://$INV_DOMAIN_NAME"
    ERP_CORS_ALLOWED="http://localhost:3000,http://127.0.0.1:3000,http://$ERP_DOMAIN_NAME,http://$INV_DOMAIN_NAME"
    INV_CSRF_TRUSTED="http://localhost:4000,http://127.0.0.1:4000,http://$INV_DOMAIN_NAME,http://$ERP_DOMAIN_NAME"
    INV_CORS_ALLOWED="http://localhost:4000,http://127.0.0.1:4000,http://$INV_DOMAIN_NAME,http://$ERP_DOMAIN_NAME"
fi

# ===== KONFIGURÁCIÓ MEGJELENÍTÉSE =====
if [ "$SKIP_INTERACTIVE" = "false" ]; then
    echo ""
    echo -e "${BLUE}=========================================="
    echo -e "  Konfiguráció összefoglalása"
    echo -e "==========================================${NC}"
    echo ""
    echo -e "  ${GREEN}PixiERP Frontend:${NC}  $ERP_FRONTEND_URL"
    echo -e "  ${GREEN}PixiERP Backend:${NC}   $ERP_BACKEND_URL"
    echo -e "  ${GREEN}PixInvoice Frontend:${NC} $INV_FRONTEND_URL"
    echo -e "  ${GREEN}PixInvoice Backend:${NC}  $INV_BACKEND_URL"
    echo -e "  ${GREEN}HTTPS:${NC}             $USE_HTTPS"
    echo ""
    
    read -p "Frissítsem a .env fájlokat ezekkel az értékekkel? (i/N): " UPDATE_ENV
    if [ "$UPDATE_ENV" = "i" ] || [ "$UPDATE_ENV" = "I" ]; then
        echo ""
        echo -e "${YELLOW}⚠️  .env fájlok frissítése...${NC}"
        
        # PixiERP Backend .env
        if [ -f "$SCRIPT_DIR/pixierp/.env" ]; then
            sed -i "s|^FRONTEND_BASE_URL=.*|FRONTEND_BASE_URL=$ERP_FRONTEND_URL|" "$SCRIPT_DIR/pixierp/.env"
            sed -i "s|^EMERGENCY_DOMAIN=.*|EMERGENCY_DOMAIN=$ERP_FRONTEND_URL|" "$SCRIPT_DIR/pixierp/.env"
            sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=$ERP_FRONTEND_URL|" "$SCRIPT_DIR/pixierp/.env"
            sed -i "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=$ERP_ALLOWED_HOSTS|" "$SCRIPT_DIR/pixierp/.env"
            sed -i "s|^CSRF_TRUSTED_ORIGINS=.*|CSRF_TRUSTED_ORIGINS=$ERP_CSRF_TRUSTED|" "$SCRIPT_DIR/pixierp/.env"
            sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=$ERP_CORS_ALLOWED|" "$SCRIPT_DIR/pixierp/.env"
            echo -e "${GREEN}✓ PixiERP backend .env frissítve${NC}"
        fi
        
        # PixiERP Frontend .env
        if [ -f "$SCRIPT_DIR/pixierp/frontend/.env" ]; then
            sed -i "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=/api/v1|" "$SCRIPT_DIR/pixierp/frontend/.env"
            sed -i "s|^PORT=.*|PORT=${ERP_FRONTEND_PORT:-3000}|" "$SCRIPT_DIR/pixierp/frontend/.env"
            echo -e "${GREEN}✓ PixiERP frontend .env frissítve (nginx proxy: /api/v1)${NC}"
        fi
        
        # PixInvoice Backend .env
        if [ -f "$SCRIPT_DIR/pixinvoice/invoice_app/.env" ]; then
            sed -i "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=$INV_ALLOWED_HOSTS|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^CSRF_TRUSTED_ORIGINS=.*|CSRF_TRUSTED_ORIGINS=$INV_CSRF_TRUSTED|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=$INV_CORS_ALLOWED|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^FRONTEND_BASE_URL=.*|FRONTEND_BASE_URL=$INV_FRONTEND_URL|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^EMERGENCY_DOMAIN=.*|EMERGENCY_DOMAIN=$INV_FRONTEND_URL|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=$INV_FRONTEND_URL|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^BACKEND_URL=.*|BACKEND_URL=$INV_BACKEND_URL|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            echo -e "${GREEN}✓ PixInvoice backend .env frissítve${NC}"
        fi
        
        # PixInvoice Frontend .env
        if [ -f "$SCRIPT_DIR/pixinvoice/frontend/.env" ]; then
            sed -i "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=/api|" "$SCRIPT_DIR/pixinvoice/frontend/.env"
            sed -i "s|^PORT=.*|PORT=${INV_FRONTEND_PORT:-4000}|" "$SCRIPT_DIR/pixinvoice/frontend/.env"
            echo -e "${GREEN}✓ PixInvoice frontend .env frissítve (nginx proxy: /api)${NC}"
        fi
        
        echo ""
        echo -e "${GREEN}✓ Összes .env fájl frissítve!${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  Ne felejtsd el újraindítani a szervereket:${NC}"
        echo "   cd pixierp && ./start.sh"
        echo "   cd pixinvoice && ./start.sh"
    fi
    
    # Nginx konfiguráció újragenerálása
    if [ ! "$ERP_DOMAIN" = "localhost:3000" ] && [ ! "$INV_DOMAIN" = "localhost:4000" ]; then
        echo ""
        
        # SSL konfiguráció detektálása
        ERP_HAS_SSL=false
        INV_HAS_SSL=false
        
        if [ -f "/etc/nginx/sites-enabled/${ERP_DOMAIN_NAME}.conf" ]; then
            if sudo grep -q "listen 443 ssl" "/etc/nginx/sites-enabled/${ERP_DOMAIN_NAME}.conf" 2>/dev/null; then
                ERP_HAS_SSL=true
                echo -e "${YELLOW}⚠️  ${ERP_DOMAIN_NAME} nginx config már tartalmaz SSL konfigurációt (certbot)${NC}"
            fi
        fi
        
        if [ -f "/etc/nginx/sites-enabled/${INV_DOMAIN_NAME}.conf" ]; then
            if sudo grep -q "listen 443 ssl" "/etc/nginx/sites-enabled/${INV_DOMAIN_NAME}.conf" 2>/dev/null; then
                INV_HAS_SSL=true
                echo -e "${YELLOW}⚠️  ${INV_DOMAIN_NAME} nginx config már tartalmaz SSL konfigurációt (certbot)${NC}"
            fi
        fi
        
        if [ "$ERP_HAS_SSL" = "true" ] || [ "$INV_HAS_SSL" = "true" ]; then
            echo -e "${RED}FIGYELEM: SSL konfiguráció található az nginx fájlokban!${NC}"
            echo "Ha újragenerálod, az SSL beállítások elvesznek és újra kell futtatni a certbot-ot."
            echo ""
        fi
        
        read -p "Generáljak újra Nginx konfigurációkat? (i/N): " REGEN_NGINX
        if [ "$REGEN_NGINX" = "i" ] || [ "$REGEN_NGINX" = "I" ]; then
            echo ""
            echo -e "${BLUE}📝 Nginx konfiguráció újragenerálása...${NC}"
            
            if [ "$ERP_HAS_SSL" = "true" ] || [ "$INV_HAS_SSL" = "true" ]; then
                echo -e "${YELLOW}⚠️  SSL konfiguráció el fog veszni! Újra kell majd futtatni:${NC}"
                echo "   sudo certbot --nginx -d ${ERP_DOMAIN_NAME}"
                echo "   sudo certbot --nginx -d ${INV_DOMAIN_NAME}"
                echo ""
                read -p "Biztosan folytatod? (i/N): " CONFIRM_REGEN
                if [ "$CONFIRM_REGEN" != "i" ] && [ "$CONFIRM_REGEN" != "I" ]; then
                    echo -e "${YELLOW}⚠️  Nginx újragenerálás megszakítva${NC}"
                    REGEN_NGINX="N"
                fi
            fi
        fi
        
        if [ "$REGEN_NGINX" = "i" ] || [ "$REGEN_NGINX" = "I" ]; then
            echo ""
            echo -e "${BLUE}📝 Nginx konfiguráció újragenerálása...${NC}"
            
            # PixiERP nginx konfig
            cat > "$SCRIPT_DIR/nginx/${ERP_DOMAIN_NAME}.conf" <<EOF
# PixiERP - ${ERP_DOMAIN_NAME}
# Generálva: $(date)
# NE SZERKESZD MANUÁLISAN! Használd az install.sh vagy config.sh scripteket!

server {
    listen 80;
    server_name ${ERP_DOMAIN_NAME};

    # Backend API
    location /api/ {
        proxy_pass http://localhost:${ERP_BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /ws/ {
        proxy_pass http://127.0.0.1:${ERP_BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }

    # Django admin static files
    location ~ ^/(admin|api-auth)/.*\.(?:css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        proxy_pass http://localhost:${ERP_BACKEND_PORT};
    }

    # Media files
    location /media/ {
        alias ${SCRIPT_DIR}/pixierp/media/;
        expires 7d;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:${ERP_FRONTEND_PORT:-3000};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    access_log /var/log/nginx/${ERP_DOMAIN_NAME}-access.log;
    error_log /var/log/nginx/${ERP_DOMAIN_NAME}-error.log;
}
EOF
            
            # PixInvoice nginx konfig
            cat > "$SCRIPT_DIR/nginx/${INV_DOMAIN_NAME}.conf" <<EOF
# PixInvoice - ${INV_DOMAIN_NAME}
# Generálva: $(date)
# NE SZERKESZD MANUÁLISAN! Használd az install.sh vagy config.sh scripteket!

server {
    listen 80;
    server_name ${INV_DOMAIN_NAME};

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:${INV_BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Django admin static files
    location ~ ^/(admin|api-auth)/.*\.(?:css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        proxy_pass http://localhost:${INV_BACKEND_PORT};
    }

    # Media files
    location /media/ {
        alias ${SCRIPT_DIR}/pixinvoice/invoice_app/media/;
        expires 7d;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:${INV_FRONTEND_PORT:-4000};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    access_log /var/log/nginx/${INV_DOMAIN_NAME}-access.log;
    error_log /var/log/nginx/${INV_DOMAIN_NAME}-error.log;
}
EOF
            
            echo -e "${GREEN}✓ Nginx konfigurációk létrehozva:${NC}"
            echo "  - nginx/${ERP_DOMAIN_NAME}.conf"
            echo "  - nginx/${INV_DOMAIN_NAME}.conf"
            echo ""
            echo -e "${YELLOW}📋 Telepítés:${NC}"
            echo "  sudo cp nginx/${ERP_DOMAIN_NAME}.conf /etc/nginx/sites-available/"
            echo "  sudo cp nginx/${INV_DOMAIN_NAME}.conf /etc/nginx/sites-available/"
            echo "  sudo ln -sf /etc/nginx/sites-available/${ERP_DOMAIN_NAME}.conf /etc/nginx/sites-enabled/"
            echo "  sudo ln -sf /etc/nginx/sites-available/${INV_DOMAIN_NAME}.conf /etc/nginx/sites-enabled/"
            echo "  sudo nginx -t && sudo systemctl reload nginx"
            echo ""
            
            read -p "Telepítsem most az Nginx konfigurációkat és indítsam újra? (i/N): " INSTALL_NOW
            if [ "$INSTALL_NOW" = "i" ] || [ "$INSTALL_NOW" = "I" ]; then
                echo ""
                echo -e "${BLUE}🔧 Nginx konfiguráció telepítése...${NC}"
                sudo cp "$SCRIPT_DIR/nginx/${ERP_DOMAIN_NAME}.conf" /etc/nginx/sites-available/
                sudo cp "$SCRIPT_DIR/nginx/${INV_DOMAIN_NAME}.conf" /etc/nginx/sites-available/
                sudo ln -sf /etc/nginx/sites-available/${ERP_DOMAIN_NAME}.conf /etc/nginx/sites-enabled/
                sudo ln -sf /etc/nginx/sites-available/${INV_DOMAIN_NAME}.conf /etc/nginx/sites-enabled/
                
                echo -e "${BLUE}🧪 Nginx konfiguráció tesztelése...${NC}"
                if sudo nginx -t; then
                    echo -e "${GREEN}✓ Nginx konfiguráció helyes${NC}"
                    echo -e "${BLUE}🔄 Nginx újratöltése...${NC}"
                    sudo systemctl reload nginx
                    echo -e "${GREEN}✓ Nginx sikeresen újratöltve${NC}"
                    
                    # SSL tanúsítvány ellenőrzés/kérés
                    if [ "$USE_HTTPS" = "true" ]; then
                        echo ""
                        echo -e "${BLUE}🔐 SSL tanúsítvány ellenőrzés...${NC}"
                        
                        ERP_CERT_EXISTS=false
                        INV_CERT_EXISTS=false
                        
                        # Ellenőrzés: létezik-e a tanúsítvány mappa (certbot -0001, -0002 suffixekkel is működik)
                        if sudo test -d "/etc/letsencrypt/live/${ERP_DOMAIN_NAME}" || sudo test -d "/etc/letsencrypt/live/${ERP_DOMAIN_NAME}-0001"; then
                            echo -e "${GREEN}✓ ${ERP_DOMAIN_NAME} SSL tanúsítvány megtalálva${NC}"
                            ERP_CERT_EXISTS=true
                        else
                            echo -e "${YELLOW}⚠️  ${ERP_DOMAIN_NAME} SSL tanúsítvány nem található${NC}"
                        fi
                        
                        if sudo test -d "/etc/letsencrypt/live/${INV_DOMAIN_NAME}" || sudo test -d "/etc/letsencrypt/live/${INV_DOMAIN_NAME}-0001"; then
                            echo -e "${GREEN}✓ ${INV_DOMAIN_NAME} SSL tanúsítvány megtalálva${NC}"
                            INV_CERT_EXISTS=true
                        else
                            echo -e "${YELLOW}⚠️  ${INV_DOMAIN_NAME} SSL tanúsítvány nem található${NC}"
                        fi
                        
                        if [ "$ERP_CERT_EXISTS" = "false" ] || [ "$INV_CERT_EXISTS" = "false" ]; then
                            echo ""
                            echo -e "${BLUE}Szeretnél SSL tanúsítványt kérni a hiányzó domain(ek)hez?${NC}"
                            
                            # Certbot telepítése ha nincs
                            if ! command -v certbot &> /dev/null; then
                                echo -e "${YELLOW}⚠️  certbot nincs telepítve${NC}"
                                read -p "Telepítsem a certbot-ot? (i/N): " INSTALL_CERTBOT
                                if [ "$INSTALL_CERTBOT" = "i" ] || [ "$INSTALL_CERTBOT" = "I" ]; then
                                    echo -e "${BLUE}📦 certbot telepítése...${NC}"
                                    sudo apt update
                                    sudo apt install -y certbot python3-certbot-nginx
                                    echo -e "${GREEN}✓ certbot telepítve${NC}"
                                fi
                            fi
                            
                            if command -v certbot &> /dev/null; then
                                read -p "Kérjek SSL tanúsítványokat? (i/N): " REQUEST_SSL
                                if [ "$REQUEST_SSL" = "i" ] || [ "$REQUEST_SSL" = "I" ]; then
                                    read -p "Email cím (Let's Encrypt értesítésekhez): " SSL_EMAIL
                                    
                                    if [ "$ERP_CERT_EXISTS" = "false" ]; then
                                        echo ""
                                        echo -e "${BLUE}🔐 SSL tanúsítvány kérés: ${ERP_DOMAIN_NAME}${NC}"
                                        if sudo certbot --nginx -d ${ERP_DOMAIN_NAME} --non-interactive --agree-tos --email "$SSL_EMAIL"; then
                                            echo -e "${GREEN}✓ ${ERP_DOMAIN_NAME} SSL tanúsítvány telepítve${NC}"
                                        else
                                            echo -e "${RED}❌ ${ERP_DOMAIN_NAME} SSL tanúsítvány kérés sikertelen${NC}"
                                        fi
                                    fi
                                    
                                    if [ "$INV_CERT_EXISTS" = "false" ]; then
                                        echo ""
                                        echo -e "${BLUE}🔐 SSL tanúsítvány kérés: ${INV_DOMAIN_NAME}${NC}"
                                        if sudo certbot --nginx -d ${INV_DOMAIN_NAME} --non-interactive --agree-tos --email "$SSL_EMAIL"; then
                                            echo -e "${GREEN}✓ ${INV_DOMAIN_NAME} SSL tanúsítvány telepítve${NC}"
                                        else
                                            echo -e "${RED}❌ ${INV_DOMAIN_NAME} SSL tanúsítvány kérés sikertelen${NC}"
                                        fi
                                    fi
                                fi
                            fi
                        fi
                    fi
                else
                    echo -e "${RED}❌ Nginx konfiguráció hibás!${NC}"
                    echo "Ellenőrizd a fenti hibaüzeneteket."
                fi
            fi
        fi
    fi
    
    echo ""
    echo -e "${GREEN}=========================================="
    echo -e "  Konfiguráció kész!"
    echo -e "==========================================${NC}"
    echo ""
    echo "A beállításokat bármikor módosíthatod:"
    echo "  ./config.sh"
    echo ""
fi

# Debug kiírás (opcionális)
if [ "${PIXISYS_CONFIG_DEBUG:-false}" = "true" ]; then
    echo "=== PixiSys Domain Configuration ==="
    echo "ERP Frontend:  $ERP_FRONTEND_URL"
    echo "ERP Backend:   $ERP_BACKEND_URL"
    echo "INV Frontend:  $INV_FRONTEND_URL"
    echo "INV Backend:   $INV_BACKEND_URL"
    echo "Use HTTPS:     $USE_HTTPS"
    echo "==================================="
fi
