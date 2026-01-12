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
ERP_BACKEND_URL="${PROTOCOL}://${ERP_DOMAIN_NAME}:${ERP_BACKEND_PORT}"
INV_BACKEND_URL="${PROTOCOL}://${INV_DOMAIN_NAME}:${INV_BACKEND_PORT}"

# ALLOWED_HOSTS generálás - MINDIG tartalmazza localhost-ot ÉS a domain-t is
# Így működik localhost-on ÉS a domain-en is
ERP_ALLOWED_HOSTS="localhost,127.0.0.1,0.0.0.0,$ERP_DOMAIN_NAME"
INV_ALLOWED_HOSTS="localhost,127.0.0.1,0.0.0.0,$INV_DOMAIN_NAME"

# CSRF és CORS beállítások - mindkét protokoll és domain
if [ "$USE_HTTPS" = "true" ]; then
    ERP_CSRF_TRUSTED="http://localhost:3000,http://127.0.0.1:3000,https://$ERP_DOMAIN_NAME,http://$ERP_DOMAIN_NAME"
    ERP_CORS_ALLOWED="http://localhost:3000,http://127.0.0.1:3000,https://$ERP_DOMAIN_NAME,http://$ERP_DOMAIN_NAME"
else
    ERP_CSRF_TRUSTED="http://localhost:3000,http://127.0.0.1:3000,http://$ERP_DOMAIN_NAME"
    ERP_CORS_ALLOWED="http://localhost:3000,http://127.0.0.1:3000,http://$ERP_DOMAIN_NAME"
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
            sed -i "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=$ERP_BACKEND_URL|" "$SCRIPT_DIR/pixierp/frontend/.env"
            sed -i "s|^PORT=.*|PORT=${ERP_FRONTEND_PORT:-3000}|" "$SCRIPT_DIR/pixierp/frontend/.env"
            echo -e "${GREEN}✓ PixiERP frontend .env frissítve${NC}"
        fi
        
        # PixInvoice Backend .env
        if [ -f "$SCRIPT_DIR/pixinvoice/invoice_app/.env" ]; then
            sed -i "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=$INV_ALLOWED_HOSTS|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^FRONTEND_BASE_URL=.*|FRONTEND_BASE_URL=$INV_FRONTEND_URL|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^EMERGENCY_DOMAIN=.*|EMERGENCY_DOMAIN=$INV_FRONTEND_URL|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=$INV_FRONTEND_URL|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            sed -i "s|^BACKEND_URL=.*|BACKEND_URL=$INV_BACKEND_URL|" "$SCRIPT_DIR/pixinvoice/invoice_app/.env"
            echo -e "${GREEN}✓ PixInvoice backend .env frissítve${NC}"
        fi
        
        # PixInvoice Frontend .env
        if [ -f "$SCRIPT_DIR/pixinvoice/frontend/.env" ]; then
            sed -i "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=$INV_BACKEND_URL|" "$SCRIPT_DIR/pixinvoice/frontend/.env"
            sed -i "s|^PORT=.*|PORT=${INV_FRONTEND_PORT:-4000}|" "$SCRIPT_DIR/pixinvoice/frontend/.env"
            echo -e "${GREEN}✓ PixInvoice frontend .env frissítve${NC}"
        fi
        
        echo ""
        echo -e "${GREEN}✓ Összes .env fájl frissítve!${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  Ne felejtsd el újraindítani a szervereket:${NC}"
        echo "   cd pixierp && ./start.sh"
        echo "   cd pixinvoice && ./start.sh"
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
