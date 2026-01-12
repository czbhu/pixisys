#!/bin/bash

# PixiSys Emergency Access Token Generator
# Generál emergency access tokeneket mindkét rendszerhez

set -e  # Exit on error

# ===== DOMAIN KONFIGURÁCIÓ BETÖLTÉSE =====
# Töltsd be a központi config fájlt
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -f "$SCRIPT_DIR/config.sh" ]; then
    source "$SCRIPT_DIR/config.sh" --load-only
else
    echo "HIBA: config.sh nem található!"
    echo "Használd a config.sh fájlt a domain beállításokhoz."
    exit 1
fi

# Színkódok
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default minutes
MINUTES=${1:-15}

echo ""
echo -e "${BLUE}========================================================================${NC}"
echo -e "${BLUE}  🔐 PixiSys Emergency Access Token Generator${NC}"
echo -e "${BLUE}========================================================================${NC}"
echo ""
echo -e "${YELLOW}⏰ Tokenek érvényessége: ${MINUTES} perc${NC}"
echo -e "${BLUE}🌐 Konfigurált domain-ek: ERP=${ERP_FRONTEND_URL}, INV=${INV_FRONTEND_URL}${NC}"
echo ""

# PixiERP Token
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  📊 PixiERP - Emergency Access Token${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd /home/pixi/pixisys_dev/pixisys/pixierp
source venv/bin/activate
EMERGENCY_DOMAIN="${ERP_FRONTEND_URL}" python manage.py generate_emergency_access --minutes $MINUTES 2>/dev/null || {
    echo -e "${RED}❌ Hiba a PixiERP token generálása során!${NC}"
    exit 1
}
deactivate

echo ""
echo ""

# PixInvoice Token
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🧾 PixInvoice - Emergency Access Token${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd /home/pixi/pixisys_dev/pixisys/pixinvoice/invoice_app
source venv/bin/activate
EMERGENCY_DOMAIN="${INV_FRONTEND_URL}" python manage.py generate_emergency_access --minutes $MINUTES 2>/dev/null || {
    echo -e "${RED}❌ Hiba a PixInvoice token generálása során!${NC}"
    exit 1
}
deactivate

echo ""
echo -e "${BLUE}========================================================================${NC}"
echo -e "${BLUE}  ✅ Tokenek sikeresen generálva!${NC}"
echo -e "${BLUE}========================================================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  FIGYELEM:${NC}"
echo -e "${YELLOW}  • A tokenek csak ${MINUTES} percig érvényesek${NC}"
echo -e "${YELLOW}  • Minden token csak egyszer használható${NC}"
echo -e "${YELLOW}  • Használat után automatikusan érvénytelenné válnak${NC}"
echo ""
echo -e "${GREEN}💡 Használat:${NC}"
echo -e "   Másold be a fenti URL-eket a böngésződbe"
echo -e "   Automatikusan be fogsz jelentkezni admin@pixisys.eu felhasználóként"
echo ""
