#!/bin/bash

# Színek
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Jogosultság ellenőrzés
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Használat: ./adminpass.sh <email> <új_jelszó>"
    echo "Példa: ./adminpass.sh info@cegem.hu SzuperTitkosJelszo123"
    exit 1
fi

ADMIN_EMAIL="$1"
ADMIN_PASSWORD="$2"

echo -e "${BLUE}=== PixiSys Admin Jelszó Frissítő ===${NC}"
echo "User: $ADMIN_EMAIL"
echo ""

# 1. PixiERP Admin Frissítés
echo -e "${BLUE}1. PixiERP Admin frissítése...${NC}"
if [ -d "$SCRIPT_DIR/pixierp" ]; then
    (
        source "$SCRIPT_DIR/pixierp/venv/bin/activate"
        cd "$SCRIPT_DIR/pixierp"
        if python create_initial_admin.py "$ADMIN_EMAIL" "$ADMIN_PASSWORD"; then
             echo -e "${GREEN}✓ PixiERP admin sikeresen frissítve/létrehozva.${NC}"
        else
             echo -e "${RED}❌ Hiba a PixiERP admin frissítésekor!${NC}"
        fi
    )
else
    echo -e "${RED}Nem találom a pixierp könyvtárat!${NC}"
fi

# 2. PixiInvoice Admin Frissítés
echo -e "${BLUE}2. PixiInvoice Admin frissítése...${NC}"
if [ -d "$SCRIPT_DIR/pixinvoice/invoice_app" ]; then
    (
        source "$SCRIPT_DIR/pixinvoice/invoice_app/venv/bin/activate"
        cd "$SCRIPT_DIR/pixinvoice/invoice_app"
        if python create_initial_admin.py "$ADMIN_EMAIL" "$ADMIN_PASSWORD"; then
             echo -e "${GREEN}✓ PixiInvoice admin sikeresen frissítve/létrehozva.${NC}"
        else
             echo -e "${RED}❌ Hiba a PixiInvoice admin frissítésekor!${NC}"
        fi
    )
else
    echo -e "${RED}Nem találom a pixinvoice könyvtárat!${NC}"
fi

echo ""
echo -e "${GREEN}=== Kész! ===${NC}"
echo -e "Most próbálj meg bejelentkezni az új jelszóval."
echo -e "${YELLOW}Megjegyzés: Ha továbbra is 400 Bad Request hibát kapsz, indítsd újra a backendet: ./start.sh${NC}"
