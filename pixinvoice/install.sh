#!/bin/bash
set -e

echo "=========================================="
echo "  PixInvoice Gyors Telepítő Script"
echo "=========================================="
echo ""

# Színek
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ellenőrző függvények
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}HIBA: $1 nem található. Kérlek telepítsd először.${NC}"
        return 1
    else
        echo -e "${GREEN}✓ $1 megtalálva${NC}"
        return 0
    fi
}

# 1. Rendszerkövetelmények ellenőrzése
echo "1. Rendszerkövetelmények ellenőrzése..."
echo "----------------------------------------"

ALL_OK=true
check_command python3 || ALL_OK=false
check_command node || ALL_OK=false
check_command npm || ALL_OK=false
check_command psql || ALL_OK=false
check_command git || ALL_OK=false

if [ "$ALL_OK" = false ]; then
    echo ""
    echo -e "${RED}Nem minden szükséges program elérhető.${NC}"
    echo "Telepítsd a hiányzó programokat:"
    echo "  sudo apt install -y python3 python3-pip python3-venv nodejs npm postgresql git"
    exit 1
fi

echo ""

# 2. Adatbázis konfiguráció
echo "2. Adatbázis beállítások"
echo "----------------------------------------"
read -p "Adatbázis neve [pixinvoice_db]: " DB_NAME
DB_NAME=${DB_NAME:-pixinvoice_db}

read -p "Adatbázis felhasználó [pixinvoice_user]: " DB_USER
DB_USER=${DB_USER:-pixinvoice_user}

read -sp "Adatbázis jelszó [pixinvoice2026]: " DB_PASSWORD
echo ""
DB_PASSWORD=${DB_PASSWORD:-pixinvoice2026}

read -p "Adatbázis host [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-localhost}

echo ""
echo -e "${YELLOW}Adatbázis létrehozása...${NC}"

# Ellenőrizzük, hogy létezik-e már az adatbázis
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${YELLOW}Az adatbázis már létezik: $DB_NAME${NC}"
    read -p "Törlöd és újra létrehozod? (i/N): " RECREATE_DB
    if [ "$RECREATE_DB" = "i" ] || [ "$RECREATE_DB" = "I" ]; then
        sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
        sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;"
    else
        echo "Meglévő adatbázis használata..."
    fi
fi

# Adatbázis és user létrehozása
if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    sudo -u postgres psql <<EOF
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
ALTER ROLE $DB_USER SET client_encoding TO 'utf8';
ALTER ROLE $DB_USER SET default_transaction_isolation TO 'read committed';
ALTER ROLE $DB_USER SET timezone TO 'Europe/Budapest';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

    # PostgreSQL 15+ esetén
    PSQL_VERSION=$(psql --version | grep -oP '\d+' | head -1)
    if [ "$PSQL_VERSION" -ge 15 ]; then
        sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
    fi

    echo -e "${GREEN}✓ Adatbázis sikeresen létrehozva${NC}"
else
    echo -e "${GREEN}✓ Adatbázis használatra kész${NC}"
fi

echo ""

# 3. Backend telepítése
echo "3. Backend telepítése"
echo "----------------------------------------"

cd invoice_app

# Virtual environment létrehozása
if [ ! -d "venv" ]; then
    echo "Python virtual environment létrehozása..."
    python3 -m venv venv
fi

# Aktiválás
source venv/bin/activate

# Függőségek telepítése
echo "Python függőségek telepítése..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt

# .env fájl létrehozása
if [ ! -f ".env" ]; then
    echo "Környezeti változók fájl létrehozása..."
    
    # Secret key generálása
    SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
    
    cat > .env <<EOF
SECRET_KEY=$SECRET_KEY
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0

DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_HOST=$DB_HOST
DB_PORT=5432

FRONTEND_URL=http://localhost:4000
BACKEND_URL=http://localhost:4001
EOF
    echo -e "${GREEN}✓ .env fájl létrehozva${NC}"
else
    echo -e "${YELLOW}.env fájl már létezik, kihagyás...${NC}"
fi

# Migrációk futtatása
echo "Adatbázis migrációk futtatása..."
python manage.py migrate

# Statikus fájlok gyűjtése
echo "Statikus fájlok gyűjtése..."
python manage.py collectstatic --noinput > /dev/null 2>&1

# Superuser létrehozása
echo ""
echo -e "${YELLOW}Admin felhasználó létrehozása (hagyd üresen a kihagyáshoz)${NC}"
read -p "Admin username: " ADMIN_USER

if [ -n "$ADMIN_USER" ]; then
    read -p "Admin email: " ADMIN_EMAIL
    read -sp "Admin password: " ADMIN_PASS
    echo ""
    
    python manage.py shell <<EOF
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='$ADMIN_USER').exists():
    User.objects.create_superuser('$ADMIN_USER', '$ADMIN_EMAIL', '$ADMIN_PASS')
    print('Superuser létrehozva')
else:
    print('Felhasználó már létezik')
EOF
    echo -e "${GREEN}✓ Admin felhasználó létrehozva${NC}"
fi

deactivate
cd ..

echo -e "${GREEN}✓ Backend telepítés kész${NC}"
echo ""

# 4. Frontend telepítése
echo "4. Frontend telepítése"
echo "----------------------------------------"

cd frontend

# Node modulok telepítése
echo "Node.js függőségek telepítése (ez eltarthat pár percig)..."
npm install

# Frontend .env (opcionális)
if [ ! -f ".env" ]; then
    cat > .env <<EOF
REACT_APP_API_URL=http://localhost:4001
PORT=4000
EOF
    echo -e "${GREEN}✓ Frontend .env létrehozva${NC}"
fi

# Build létrehozása (opcionális fejlesztésben)
read -p "Készítsek production build-et? (i/N): " BUILD_PROD
if [ "$BUILD_PROD" = "i" ] || [ "$BUILD_PROD" = "I" ]; then
    echo "Production build készítése..."
    npm run build
    echo -e "${GREEN}✓ Production build kész${NC}"
fi

cd ..

echo -e "${GREEN}✓ Frontend telepítés kész${NC}"
echo ""

# 5. Összefoglaló
echo "=========================================="
echo "  Telepítés sikeresen befejeződött!"
echo "=========================================="
echo ""
echo "Backend indítása:"
echo "  cd invoice_app"
echo "  source venv/bin/activate"
echo "  python manage.py runserver 0.0.0.0:4001"
echo ""
echo "Vagy használd a scriptet:"
echo "  ./start_backend.sh"
echo ""
echo "Frontend indítása (másik terminálban):"
echo "  cd frontend"
echo "  PORT=4000 npm start"
echo ""
echo "Vagy használd a scriptet:"
echo "  ./start_frontend.sh"
echo ""
echo "Admin felület: http://localhost:4001/admin"
echo "Alkalmazás: http://localhost:4000"
echo ""
echo -e "${GREEN}Sikeres telepítést!${NC}"
