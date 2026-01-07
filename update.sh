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
            pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null || {
                echo -e "${YELLOW}⚠️  PostgreSQL backup jelszót kér (vagy használd .pgpass fájlt)${NC}"
                PGPASSWORD="" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
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
            pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null || {
                echo -e "${YELLOW}⚠️  PostgreSQL backup jelszót kér (vagy használd .pgpass fájlt)${NC}"
                PGPASSWORD="" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
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
echo -e "${YELLOW}  • Branch: $CURRENT_BRANCH${NC}"

# Megnézzük mi fog változni
CHANGES=$(git log HEAD..origin/$CURRENT_BRANCH --oneline)
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

# PixiERP Frontend frissítése
if [ "$SKIP_FRONTEND" = false ]; then
    echo -e "${BLUE}[6/10] PixiERP frontend frissítése...${NC}"
    cd pixierp/frontend
    
    if [ -f "package.json" ]; then
        # Package.json változás check
        if git diff HEAD@{1} package.json | grep -q "^+" ; then
            echo -e "${YELLOW}  • Új NPM csomagok telepítése...${NC}"
            npm install --quiet
        else
            echo -e "${GREEN}  • NPM csomagok nem változtak${NC}"
        fi
        
        # Production build check
        if [ -f "../../pixierp/.env" ]; then
            source ../../pixierp/.env
            if [ "$DEBUG" = "False" ] || [ "$DEBUG" = "false" ]; then
                echo -e "${YELLOW}  • Production build...${NC}"
                npm run build
            fi
        fi
    fi
    
    cd ../..
    echo -e "${GREEN}✓ PixiERP frontend frissítve${NC}"
else
    echo -e "${YELLOW}[6/10] Frontend build kihagyva (--skip-frontend)${NC}"
fi

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

# PixInvoice Frontend frissítése
if [ "$SKIP_FRONTEND" = false ]; then
    echo -e "${BLUE}[8/10] PixInvoice frontend frissítése...${NC}"
    cd pixinvoice/frontend
    
    if [ -f "package.json" ]; then
        # Package.json változás check
        if git diff HEAD@{1} package.json | grep -q "^+" ; then
            echo -e "${YELLOW}  • Új NPM csomagok telepítése...${NC}"
            npm install --quiet
        else
            echo -e "${GREEN}  • NPM csomagok nem változtak${NC}"
        fi
        
        # Production build check
        if [ -f "../../pixinvoice/invoice_app/.env" ]; then
            source ../../pixinvoice/invoice_app/.env
            if [ "$DEBUG" = "False" ] || [ "$DEBUG" = "false" ]; then
                echo -e "${YELLOW}  • Production build...${NC}"
                npm run build
            fi
        fi
    fi
    
    cd ../..
    echo -e "${GREEN}✓ PixInvoice frontend frissítve${NC}"
else
    echo -e "${YELLOW}[8/10] Frontend build kihagyva (--skip-frontend)${NC}"
fi

# Service restart
echo -e "${BLUE}[9/10] Service újraindítás...${NC}"

if [ "$AUTO_RESTART" = true ]; then
    if [ "$EUID" -eq 0 ]; then
        echo -e "${YELLOW}  • PixiERP backend restart...${NC}"
        systemctl restart pixierp-backend || echo -e "${YELLOW}⚠️  pixierp-backend service nem található${NC}"
        
        echo -e "${YELLOW}  • PixInvoice backend restart...${NC}"
        systemctl restart pixinvoice-backend || echo -e "${YELLOW}⚠️  pixinvoice-backend service nem található${NC}"
        
        echo -e "${YELLOW}  • Nginx reload...${NC}"
        systemctl reload nginx || echo -e "${YELLOW}⚠️  nginx service nem található${NC}"
        
        echo -e "${GREEN}✓ Services újraindítva${NC}"
    else
        echo -e "${YELLOW}⚠️  Nem root user, service restart kihagyva${NC}"
        echo -e "${YELLOW}  Futtasd: sudo systemctl restart pixierp-backend pixinvoice-backend${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Manuális restart szükséges:${NC}"
    echo ""
    echo -e "${BLUE}  sudo systemctl restart pixierp-backend${NC}"
    echo -e "${BLUE}  sudo systemctl restart pixinvoice-backend${NC}"
    echo -e "${BLUE}  sudo systemctl reload nginx${NC}"
    echo ""
fi

# Health check
echo -e "${BLUE}[10/10] Health check...${NC}"

check_service() {
    local service=$1
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo -e "${GREEN}✓ $service: running${NC}"
        return 0
    else
        echo -e "${RED}✗ $service: stopped${NC}"
        return 1
    fi
}

if [ "$AUTO_RESTART" = true ] && [ "$EUID" -eq 0 ]; then
    check_service "pixierp-backend"
    check_service "pixinvoice-backend"
    check_service "nginx"
else
    echo -e "${YELLOW}⚠️  Health check kihagyva (használd --auto-restart flag-et)${NC}"
fi

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
