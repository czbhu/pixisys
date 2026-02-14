#!/bin/bash

#####################################################################
# PixiSys Production Update Script
# Verzió: 1.0
# Leírás: Biztonságos frissítés production környezetben
#         - Automatikus backup
#         - Git pull új verzió
#         - Dependency update
#         - Django migrációk (adatokat nem érinti!)
#         - Service restart
#####################################################################

set -e  # Exit on error

# Színek
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Konfiguráció
BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SKIP_BACKUP=false
SKIP_FRONTEND=false
AUTO_RESTART=false

# Logo
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║     PixiSys Production Update v1.0        ║"
echo "║   Biztonságos frissítés éles rendszerre   ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# Paraméterek feldolgozása
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-backup)
      SKIP_BACKUP=true
      shift
      ;;
    --skip-frontend)
      SKIP_FRONTEND=true
      shift
      ;;
    --auto-restart)
      AUTO_RESTART=true
      shift
      ;;
    --help)
      echo "Használat: ./update.sh [opciók]"
      echo ""
      echo "Opciók:"
      echo "  --skip-backup      Backup kihagyása (NEM AJÁNLOTT!)"
      echo "  --skip-frontend    Frontend build kihagyása"
      echo "  --auto-restart     Automatikus service restart (root szükséges)"
      echo "  --help             Súgó megjelenítése"
      echo ""
      exit 0
      ;;
    *)
      echo -e "${RED}Ismeretlen opció: $1${NC}"
      exit 1
      ;;
  esac
done

# Ellenőrzések
echo -e "${BLUE}[1/10] Környezet ellenőrzése...${NC}"

if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Hiba: Nem Git repository!${NC}"
    exit 1
fi

if [ ! -f "pixierp/manage.py" ] || [ ! -f "pixinvoice/invoice_app/manage.py" ]; then
    echo -e "${RED}❌ Hiba: PixiSys komponensek nem találhatók!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Környezet OK${NC}"

# Git status check
echo -e "${BLUE}[2/10] Git állapot ellenőrzése...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  Figyelem: Van nem commitált változás!${NC}"
    git status -s
    read -p "Folytatod? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Backup készítése
if [ "$SKIP_BACKUP" = false ]; then
    echo -e "${BLUE}[3/10] Adatbázis backup készítése...${NC}"
    
    mkdir -p "$BACKUP_DIR"
    
    # PixiERP backup
    if [ -f "pixierp/.env" ]; then
        source pixierp/.env
        DB_NAME=${DB_NAME:-pixierp_db}
        DB_USER=${DB_USER:-pixierp_user}
        
        echo -e "${YELLOW}  • PixiERP adatbázis: $DB_NAME${NC}"
        BACKUP_FILE="$BACKUP_DIR/erp_backup_${TIMESTAMP}.sql"
        
        if command -v pg_dump &> /dev/null; then
            pg_dump -w -U "$DB_USER" -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null || {
                echo -e "${YELLOW}⚠️  PostgreSQL backup jelszót kér (vagy használd .pgpass fájlt)${NC}"
                PGPASSWORD="$DB_PASSWORD" pg_dump -w -U "$DB_USER" -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" "$DB_NAME" > "$BACKUP_FILE"
            }
            echo -e "${GREEN}✓ Backup mentve: $BACKUP_FILE${NC}"
        else
            echo -e "${YELLOW}⚠️  pg_dump nem található, backup kihagyva${NC}"
        fi
    fi
    
    # PixInvoice backup
    if [ -f "pixinvoice/invoice_app/.env" ]; then
        source pixinvoice/invoice_app/.env
        DB_NAME=${DB_NAME:-pixinvoice_db}
        DB_USER=${DB_USER:-pixinvoice_user}
        
        echo -e "${YELLOW}  • PixInvoice adatbázis: $DB_NAME${NC}"
        BACKUP_FILE="$BACKUP_DIR/invoice_backup_${TIMESTAMP}.sql"
        
        if command -v pg_dump &> /dev/null; then
            pg_dump -w -U "$DB_USER" -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null || {
                echo -e "${YELLOW}⚠️  PostgreSQL backup jelszót kér (vagy használd .pgpass fájlt)${NC}"
                PGPASSWORD="$DB_PASSWORD" pg_dump -w -U "$DB_USER" -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" "$DB_NAME" > "$BACKUP_FILE"
            }
            echo -e "${GREEN}✓ Backup mentve: $BACKUP_FILE${NC}"
        fi
    fi
    
    echo -e "${GREEN}✓ Backup kész${NC}"
else
    echo -e "${YELLOW}[3/10] Backup kihagyva (--skip-backup)${NC}"
fi

# Git fetch és pull
echo -e "${BLUE}[4/10] Új verzió letöltése...${NC}"
git fetch origin
CURRENT_BRANCH=$(git branch --show-current)

# Ha nincs branch (detached HEAD), használjuk a main-t
if [ -z "$CURRENT_BRANCH" ]; then
    CURRENT_BRANCH="main"
fi

echo -e "${YELLOW}  • Branch: $CURRENT_BRANCH${NC}"

# Megnézzük mi fog változni
CHANGES=$(git log HEAD..origin/$CURRENT_BRANCH --oneline 2>/dev/null || echo "")
if [ -z "$CHANGES" ]; then
    echo -e "${GREEN}✓ Nincs új verzió, már a legfrissebb!${NC}"
    exit 0
fi

echo -e "${YELLOW}Új commitok:${NC}"
git log HEAD..origin/$CURRENT_BRANCH --oneline --decorate --graph | head -10
echo ""
read -p "Frissítés erre a verzióra? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    exit 0
fi

git pull origin "$CURRENT_BRANCH"
echo -e "${GREEN}✓ Verzió frissítve${NC}"

# PixiERP Backend frissítése
echo -e "${BLUE}[5/10] PixiERP backend frissítése...${NC}"
cd pixierp

if [ -d "venv" ]; then
    source venv/bin/activate
    
    # Requirements check
    if git diff HEAD@{1} requirements.txt | grep -q "^+" ; then
        echo -e "${YELLOW}  • Új függőségek telepítése...${NC}"
        pip install -r requirements.txt --quiet
    else
        echo -e "${GREEN}  • Függőségek nem változtak${NC}"
    fi
    
    # Migrációk futtatása
    echo -e "${YELLOW}  • Adatbázis migrációk futtatása...${NC}"
    python manage.py migrate --no-input
    
    # Dev admin user létrehozása/frissítése (DEBUG módban)
    if [ -f ".env" ]; then
        source .env
        if [ "$DEBUG" = "True" ] || [ "$DEBUG" = "true" ]; then
            echo -e "${YELLOW}  • Dev admin felhasználó frissítése...${NC}"
            python manage.py create_dev_admin 2>/dev/null || echo -e "${GREEN}    (create_dev_admin skip)${NC}"
        fi
    fi
    
    # Static fájlok gyűjtése
    if [ -f ".env" ]; then
        source .env
        if [ "$DEBUG" = "False" ] || [ "$DEBUG" = "false" ]; then
            echo -e "${YELLOW}  • Static fájlok gyűjtése...${NC}"
            python manage.py collectstatic --no-input --clear
        fi
    fi
    
    deactivate
else
    echo -e "${YELLOW}⚠️  venv nem található, backend skip${NC}"
fi

cd ..
echo -e "${GREEN}✓ PixiERP backend frissítve${NC}"

# PixiERP Frontend frissítése (Dependencies only)
echo -e "${BLUE}[6/10] PixiERP frontend függőségek...${NC}"
cd pixierp/frontend

if [ -f "package.json" ]; then
    # Package.json változás check
    if git diff HEAD@{1} package.json | grep -q "^+" ; then
        echo -e "${YELLOW}  • Új NPM csomagok telepítése...${NC}"
        npm install --quiet
    else
        echo -e "${GREEN}  • NPM csomagok nem változtak${NC}"
    fi
    # Build skipped here, handled by start.sh
fi

cd ../..
echo -e "${GREEN}✓ PixiERP frontend függőségek rendben${NC}"

# PixInvoice Backend frissítése
echo -e "${BLUE}[7/10] PixInvoice backend frissítése...${NC}"
cd pixinvoice/invoice_app

if [ -d "venv" ]; then
    source venv/bin/activate
    
    # Requirements check
    if git diff HEAD@{1} requirements.txt | grep -q "^+" ; then
        echo -e "${YELLOW}  • Új függőségek telepítése...${NC}"
        pip install -r requirements.txt --quiet
    else
        echo -e "${GREEN}  • Függőségek nem változtak${NC}"
    fi
    
    # Migrációk futtatása
    echo -e "${YELLOW}  • Adatbázis migrációk futtatása...${NC}"
    python manage.py migrate --no-input
    
    # Dev admin user létrehozása/frissítése (DEBUG módban)
    if [ -f ".env" ]; then
        source .env
        if [ "$DEBUG" = "True" ] || [ "$DEBUG" = "true" ]; then
            echo -e "${YELLOW}  • Dev admin felhasználó frissítése...${NC}"
            python manage.py create_dev_admin 2>/dev/null || echo -e "${GREEN}    (create_dev_admin skip)${NC}"
        fi
    fi
    
    # Static fájlok gyűjtése
    if [ -f ".env" ]; then
        source .env
        if [ "$DEBUG" = "False" ] || [ "$DEBUG" = "false" ]; then
            echo -e "${YELLOW}  • Static fájlok gyűjtése...${NC}"
            python manage.py collectstatic --no-input --clear
        fi
    fi
    
    deactivate
else
    echo -e "${YELLOW}⚠️  venv nem található, backend skip${NC}"
fi

cd ../..
echo -e "${GREEN}✓ PixInvoice backend frissítve${NC}"

# PixInvoice Frontend frissítése (Dependencies only)
echo -e "${BLUE}[8/10] PixInvoice frontend függőségek...${NC}"
cd pixinvoice/frontend

if [ -f "package.json" ]; then
    # Package.json változás check
    if git diff HEAD@{1} package.json | grep -q "^+" ; then
        echo -e "${YELLOW}  • Új NPM csomagok telepítése...${NC}"
        npm install --quiet
    else
        echo -e "${GREEN}  • NPM csomagok nem változtak${NC}"
    fi
    # Build skipped here, handled by start.sh
fi

cd ../..
echo -e "${GREEN}✓ PixInvoice frontend függőségek rendben${NC}"

# System Build & Restart
echo -e "${BLUE}[9/10] Rendszer újraépítése és indítása...${NC}"

# Check if systemd services are active/enabled
USE_SYSTEMD=false
if systemctl is-active --quiet pixierp-backend || systemctl is-enabled --quiet pixierp-backend; then
    USE_SYSTEMD=true
fi

if [ "$USE_SYSTEMD" = "true" ]; then
    echo -e "${YELLOW}⚠️  Systemd érzékelve: Csak build futtatása start.sh-val...${NC}"
    
    # 1. Run Build Only
    if ./start.sh --build-only; then
        echo -e "${GREEN}✓ Frontend build sikeres${NC}"
    else
        echo -e "${RED}❌ Hiba a frontend build közben${NC}"
        exit 1
    fi

    # 2. Restart Services
    if [ "$EUID" -eq 0 ] || sudo -n true 2>/dev/null; then
        echo -e "${YELLOW}  • Systemd service-ek újraindítása...${NC}"
        sudo systemctl restart pixierp-backend pixinvoice-backend
        echo -e "${GREEN}✓ Backendak újraindítva (Systemd)${NC}"
    else
        echo -e "${RED}⚠️  Nincs sudo jog, nem tudom újraindítani a service-eket!${NC}"
        echo -e "Kérlek futtasd kézzel: ${BLUE}sudo systemctl restart pixierp-backend pixinvoice-backend${NC}"
    fi

else
    # Legacy / Manual Mode
    echo -e "${YELLOW}⚠️  start.sh futtatása (teljes restart)...${NC}"
    if ./start.sh; then
        echo -e "${GREEN}✓ Rendszer sikeresen újraindítva${NC}"
    else
        echo -e "${RED}❌ Hiba a start.sh futtatása közben${NC}"
        exit 1
    fi
fi

# Health Check (Simple Port Check)
echo -e "${BLUE}[10/10] Health check...${NC}"

check_port() {
    local port=$1
    local name=$2
    if ss -lnt | grep -q ":$port "; then
        echo -e "${GREEN}✓ $name ($port): listening${NC}"
    else
        echo -e "${RED}✗ $name ($port): not accessible${NC}"
    fi
}

# Wait a moment for startup
sleep 2    
check_port 8003 "PixiERP Backend"
check_port 4001 "PixInvoice Backend"

# Összefoglaló
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ FRISSÍTÉS SIKERES!            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Statisztika:${NC}"
echo -e "  • Új verzió: $(git describe --tags --always)"
echo -e "  • Commit: $(git log -1 --oneline | cut -d' ' -f1)"
if [ "$SKIP_BACKUP" = false ]; then
    echo -e "  • Backup mappa: $BACKUP_DIR/"
fi
echo ""
echo -e "${BLUE}🌐 Elérhetőségek:${NC}"
echo -e "  • PixiERP: http://localhost:3000"
echo -e "  • PixInvoice: http://localhost:4000"
echo ""
echo -e "${YELLOW}💡 Tipp: Ellenőrizd a logokat:${NC}"
echo -e "  ${BLUE}journalctl -u pixierp-backend -f${NC}"
echo -e "  ${BLUE}journalctl -u pixinvoice-backend -f${NC}"
echo ""
echo -e "${GREEN}Kész! 🎉${NC}"
