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
STASH_CREATED=false
STASH_REF=""

restore_stashed_changes() {
    if [ "$STASH_CREATED" = true ]; then
        echo -e "${BLUE}↩ Lokális változások visszaállítása...${NC}"
        if git stash pop --index "$STASH_REF" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Lokális változások visszaállítva${NC}"
        else
            echo -e "${YELLOW}⚠️  A stash visszaállítás közben konfliktus lehetett.${NC}"
            echo -e "${YELLOW}   Ellenőrizd kézzel: git stash list && git stash pop${NC}"
        fi
        STASH_CREATED=false
    fi
}

trap restore_stashed_changes EXIT

run_pg_backup() {
    local db_name="$1"
    local db_user="$2"
    local db_host="$3"
    local db_port="$4"
    local db_password="$5"
    local backup_file="$6"

    if ! command -v pg_dump &> /dev/null; then
        return 2
    fi

    local -a dump_cmd=(pg_dump --no-password -h "$db_host" -p "$db_port" -U "$db_user" "$db_name")

    if [ -n "$db_password" ]; then
        if PGPASSWORD="$db_password" "${dump_cmd[@]}" > "$backup_file" 2>/dev/null; then
            return 0
        fi
    else
        if "${dump_cmd[@]}" > "$backup_file" 2>/dev/null; then
            return 0
        fi
    fi

    return 1
}

force_kill_backend_processes() {
    echo -e "${YELLOW}  • Régi backend process-ek kényszerített leállítása...${NC}"

    pkill -f "gunicorn erp_system.asgi:application" 2>/dev/null || true
    pkill -f "gunicorn invoice_system.wsgi:application" 2>/dev/null || true
    pkill -f "daphne -b 0.0.0.0 -p 8003" 2>/dev/null || true
    pkill -f "runserver 0.0.0.0:4001" 2>/dev/null || true
    pkill -f "runserver 0.0.0.0:8003" 2>/dev/null || true

    if command -v lsof &> /dev/null; then
        local pid
        pid=$(lsof -ti:8003 2>/dev/null || true)
        if [ -n "$pid" ]; then
            kill -9 $pid 2>/dev/null || true
        fi

        pid=$(lsof -ti:4001 2>/dev/null || true)
        if [ -n "$pid" ]; then
            kill -9 $pid 2>/dev/null || true
        fi
    fi
}

ensure_required_system_deps() {
    local -a required_pkgs=(
        python3
        python3-pip
        python3-venv
        python3-dev
        git
        redis-server
        nginx
        curl
        build-essential
        libpq-dev
        postgresql
        postgresql-contrib
        postgresql-client-16
        libpango-1.0-0
        libpangoft2-1.0-0
        libcairo2
        libgdk-pixbuf-2.0-0
        shared-mime-info
        fonts-dejavu-core
        certbot
        python3-certbot-nginx
    )
    local -a missing_pkgs=()

    for pkg in "${required_pkgs[@]}"; do
        if ! dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
            missing_pkgs+=("$pkg")
        fi
    done

    if [ ${#missing_pkgs[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ Minden kötelező rendszercsomag telepítve van${NC}"
        return 0
    fi

    echo -e "${YELLOW}⚠️  Hiányzó rendszercsomagok: ${missing_pkgs[*]}${NC}"
    echo -e "${BLUE}  • Hiányzó csomagok telepítése...${NC}"

    if [ "$EUID" -eq 0 ]; then
        apt-get update
        DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing_pkgs[@]}"
    else
        sudo apt-get update
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing_pkgs[@]}"
    fi

    echo -e "${GREEN}✓ Hiányzó rendszercsomagok telepítve${NC}"
}

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

echo -e "${BLUE}  • Rendszerfüggőségek ellenőrzése...${NC}"
ensure_required_system_deps

# Git status check
echo -e "${BLUE}[2/10] Git állapot ellenőrzése...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  Figyelem: Van nem commitált változás!${NC}"
    git status -s

    if [[ -n $(git diff --name-only --diff-filter=U) ]]; then
        echo -e "${RED}❌ Nem lehet stash-elni, mert feloldatlan merge konfliktus van:${NC}"
        git diff --name-only --diff-filter=U | sed 's/^/   - /'
        echo -e "${YELLOW}   Előbb oldd fel a konfliktust, majd: git add <fájl> és futtasd újra az update.sh-t.${NC}"
        exit 1
    fi

    read -p "Folytatod? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi

    echo -e "${YELLOW}  • Lokális változások ideiglenes stash-be mentése...${NC}"
    STASH_ERR_FILE=$(mktemp)
    if git stash push -u -m "pixisys-update-autostash-${TIMESTAMP}" >/dev/null 2>"$STASH_ERR_FILE"; then
        STASH_CREATED=true
        STASH_REF=$(git stash list | head -n 1 | cut -d: -f1)
        echo -e "${GREEN}✓ Lokális változások stash-elve ($STASH_REF)${NC}"
        rm -f "$STASH_ERR_FILE"
    else
        echo -e "${RED}❌ Nem sikerült a lokális változásokat stash-elni.${NC}"
        if [[ -s "$STASH_ERR_FILE" ]]; then
            echo -e "${YELLOW}   Git hiba:${NC}"
            sed 's/^/   /' "$STASH_ERR_FILE"
        fi
        rm -f "$STASH_ERR_FILE"
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
        ERP_DB_NAME=${DB_NAME:-${POSTGRES_DB:-pixierp_db}}
        ERP_DB_USER=${DB_USER:-${POSTGRES_USER:-pixierp_user}}
        ERP_DB_PASSWORD=${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}
        ERP_DB_HOST=${DB_HOST:-${POSTGRES_HOST:-localhost}}
        ERP_DB_PORT=${DB_PORT:-${POSTGRES_PORT:-5432}}
        
        echo -e "${YELLOW}  • PixiERP adatbázis: $ERP_DB_NAME ($ERP_DB_HOST:$ERP_DB_PORT)${NC}"
        BACKUP_FILE="$BACKUP_DIR/erp_backup_${TIMESTAMP}.sql"

        if run_pg_backup "$ERP_DB_NAME" "$ERP_DB_USER" "$ERP_DB_HOST" "$ERP_DB_PORT" "$ERP_DB_PASSWORD" "$BACKUP_FILE"; then
            echo -e "${GREEN}✓ Backup mentve: $BACKUP_FILE${NC}"
        elif [ $? -eq 2 ]; then
            echo -e "${YELLOW}⚠️  pg_dump nem található, backup kihagyva${NC}"
        else
            echo -e "${YELLOW}⚠️  PixiERP backup sikertelen. Ellenőrizd a DB_* / POSTGRES_* változókat a pixierp/.env fájlban.${NC}"
        fi
    fi
    
    # PixInvoice backup
    if [ -f "pixinvoice/invoice_app/.env" ]; then
        source pixinvoice/invoice_app/.env
        INV_DB_NAME=${DB_NAME:-${POSTGRES_DB:-pixinvoice_db}}
        INV_DB_USER=${DB_USER:-${POSTGRES_USER:-pixinvoice_user}}
        INV_DB_PASSWORD=${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}
        INV_DB_HOST=${DB_HOST:-${POSTGRES_HOST:-localhost}}
        INV_DB_PORT=${DB_PORT:-${POSTGRES_PORT:-5432}}
        
        echo -e "${YELLOW}  • PixInvoice adatbázis: $INV_DB_NAME ($INV_DB_HOST:$INV_DB_PORT)${NC}"
        BACKUP_FILE="$BACKUP_DIR/invoice_backup_${TIMESTAMP}.sql"

        if run_pg_backup "$INV_DB_NAME" "$INV_DB_USER" "$INV_DB_HOST" "$INV_DB_PORT" "$INV_DB_PASSWORD" "$BACKUP_FILE"; then
            echo -e "${GREEN}✓ Backup mentve: $BACKUP_FILE${NC}"
        elif [ $? -eq 2 ]; then
            echo -e "${YELLOW}⚠️  pg_dump nem található, backup kihagyva${NC}"
        else
            echo -e "${YELLOW}⚠️  PixInvoice backup sikertelen. Ellenőrizd a DB_* / POSTGRES_* változókat a pixinvoice/invoice_app/.env fájlban.${NC}"
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
        if [ "$EUID" -eq 0 ]; then
            systemctl stop pixierp-backend pixinvoice-backend || true
        else
            sudo -n systemctl stop pixierp-backend pixinvoice-backend || true
        fi

        force_kill_backend_processes

        if [ "$EUID" -eq 0 ]; then
            systemctl start pixierp-backend pixinvoice-backend
            systemctl is-active --quiet pixierp-backend
            systemctl is-active --quiet pixinvoice-backend
        else
            sudo -n systemctl start pixierp-backend pixinvoice-backend
            sudo -n systemctl is-active --quiet pixierp-backend
            sudo -n systemctl is-active --quiet pixinvoice-backend
        fi

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Backendek újraindítva (Systemd, force-clean)${NC}"
        else
            echo -e "${RED}❌ A backend service-ek nem indultak el sikeresen restart után.${NC}"
            exit 1
        fi
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
