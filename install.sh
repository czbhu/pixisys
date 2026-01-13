#!/bin/bash
set -e

echo "=========================================="
echo "  PixiSys Teljes Telepítő Script"
echo "  ERP + Invoice System"
echo "=========================================="
echo ""

# ===== DOMAIN KONFIGURÁCIÓ =====
# Kérdezz rá a domain beállításokra
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_FILE="$SCRIPT_DIR/.pixisys.conf"

# Színek
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📍 Domain konfiguráció${NC}"
echo ""

# Ellenőrizzük, van-e már mentett konfiguráció
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
    echo -e "${GREEN}Létező konfiguráció betöltve:${NC}"
    echo "  PixiERP:    $ERP_DOMAIN"
    echo "  PixInvoice: $INV_DOMAIN"
    echo "  HTTPS:      $USE_HTTPS"
    echo ""
    read -p "Használjam ezeket a beállításokat? (I/n): " USE_EXISTING
    if [ "$USE_EXISTING" = "n" ] || [ "$USE_EXISTING" = "N" ]; then
        # Új konfiguráció kérése
        bash "$SCRIPT_DIR/config.sh"
    fi
else
    # Első telepítés - alapértelmezett teszt környezet (te/ti.pixisys.eu)
    echo -e "${YELLOW}Első telepítés - domain konfiguráció${NC}"
    echo ""
    read -p "Szeretnéd módosítani a domain-eket? (i/N): " MODIFY_DOMAINS
    
    if [ "$MODIFY_DOMAINS" = "i" ] || [ "$MODIFY_DOMAINS" = "I" ]; then
        # Interaktív konfiguráció
        bash "$SCRIPT_DIR/config.sh"
    else
        # Alapértelmezett teszt környezet
        ERP_DOMAIN="te.pixisys.eu"
        INV_DOMAIN="ti.pixisys.eu"
        ERP_BACKEND_PORT="8003"
        INV_BACKEND_PORT="4001"
        USE_HTTPS="true"
        
        echo ""
        echo -e "${GREEN}✓ Alapértelmezett teszt környezet (te/ti.pixisys.eu)${NC}"
        echo -e "${YELLOW}  A rendszer localhost-on ÉS a domain-eken is működni fog.${NC}"
        
        # Mentés
        cat > "$CONFIG_FILE" <<EOF
# PixiSys Domain Konfiguráció
# Generálva: $(date)
ERP_DOMAIN="$ERP_DOMAIN"
INV_DOMAIN="$INV_DOMAIN"
ERP_BACKEND_PORT="$ERP_BACKEND_PORT"
INV_BACKEND_PORT="$INV_BACKEND_PORT"
USE_HTTPS="$USE_HTTPS"
EOF
    fi
fi

# Betöltjük a konfigurációt
if [ -f "$SCRIPT_DIR/config.sh" ]; then
    source "$SCRIPT_DIR/config.sh" --load-only
else
    echo -e "${RED}HIBA: config.sh nem található!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}📍 Telepítési konfiguráció:${NC}"
echo -e "  PixiERP Frontend:  ${GREEN}${ERP_FRONTEND_URL}${NC}"
echo -e "  PixiERP Backend:   ${GREEN}${ERP_BACKEND_URL}${NC}"
echo -e "  PixInvoice Frontend: ${GREEN}${INV_FRONTEND_URL}${NC}"
echo -e "  PixInvoice Backend:  ${GREEN}${INV_BACKEND_URL}${NC}"
echo ""

# Ellenőrző függvények
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗ $1 nem található${NC}"
        return 1
    else
        echo -e "${GREEN}✓ $1 megtalálva${NC}"
        return 0
    fi
}

print_header() {
    echo ""
    echo -e "${BLUE}=========================================="
    echo -e " $1"
    echo -e "==========================================${NC}"
    echo ""
}

# 0. Root ellenőrzés
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}Ne futtasd ezt a scriptet root-ként!${NC}"
    echo "Használd sudo-t csak ahol szükséges."
    exit 1
fi

# 1. Rendszerkövetelmények ellenőrzése
print_header "1. Rendszerkövetelmények ellenőrzése"

ALL_OK=true
check_command python3 || ALL_OK=false
check_command node || ALL_OK=false
check_command npm || ALL_OK=false
check_command psql || ALL_OK=false
check_command redis-cli || ALL_OK=false
check_command git || ALL_OK=false

if [ "$ALL_OK" = false ]; then
    echo ""
    echo -e "${YELLOW}Nem minden szükséges program elérhető.${NC}"
    echo ""
    echo "Telepítési parancsok Ubuntu/Debian-ra:"
    echo "  sudo apt update"
    echo "  sudo apt install -y python3 python3-pip python3-venv nodejs npm postgresql redis-server git"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
    echo ""
    read -p "Telepítsem most? (i/N): " INSTALL_DEPS
    if [ "$INSTALL_DEPS" = "i" ] || [ "$INSTALL_DEPS" = "I" ]; then
        sudo apt update
        sudo apt install -y python3 python3-pip python3-venv postgresql redis-server git build-essential libpq-dev
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
        sudo apt install -y libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0
        echo -e "${GREEN}✓ Függőségek telepítve${NC}"
    else
        exit 1
    fi
fi

# 2. PostgreSQL és Redis indítása
print_header "2. Szolgáltatások indítása"

echo "PostgreSQL és Redis indítása..."
sudo systemctl start postgresql || true
sudo systemctl start redis-server || true
sudo systemctl enable postgresql || true
sudo systemctl enable redis-server || true

echo -e "${GREEN}✓ Szolgáltatások elindítva${NC}"

# 3. Adatbázis konfiguráció
print_header "3. Adatbázis beállítások"

echo "PixiERP adatbázis beállítások:"
read -p "PixiERP adatbázis neve [pixierp_db]: " ERP_DB_NAME
ERP_DB_NAME=${ERP_DB_NAME:-pixierp_db}

read -p "PixiERP felhasználó [pixierp_user]: " ERP_DB_USER
ERP_DB_USER=${ERP_DB_USER:-pixierp_user}

read -sp "PixiERP jelszó [pixierp2026]: " ERP_DB_PASSWORD
echo ""
ERP_DB_PASSWORD=${ERP_DB_PASSWORD:-pixierp2026}

echo ""
echo "PixInvoice adatbázis beállítások:"
read -p "PixInvoice adatbázis neve [pixinvoice_db]: " INV_DB_NAME
INV_DB_NAME=${INV_DB_NAME:-pixinvoice_db}

read -p "PixInvoice felhasználó [pixinvoice_user]: " INV_DB_USER
INV_DB_USER=${INV_DB_USER:-pixinvoice_user}

read -sp "PixInvoice jelszó [pixinvoice2026]: " INV_DB_PASSWORD
echo ""
INV_DB_PASSWORD=${INV_DB_PASSWORD:-pixinvoice2026}

echo ""
echo -e "${YELLOW}Adatbázisok létrehozása...${NC}"

# PixiERP adatbázis
if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $ERP_DB_NAME; then
    sudo -u postgres psql <<EOF
CREATE DATABASE $ERP_DB_NAME;
CREATE USER $ERP_DB_USER WITH PASSWORD '$ERP_DB_PASSWORD';
ALTER ROLE $ERP_DB_USER SET client_encoding TO 'utf8';
ALTER ROLE $ERP_DB_USER SET default_transaction_isolation TO 'read committed';
ALTER ROLE $ERP_DB_USER SET timezone TO 'Europe/Budapest';
GRANT ALL PRIVILEGES ON DATABASE $ERP_DB_NAME TO $ERP_DB_USER;
EOF

    # PostgreSQL 15+ esetén
    PSQL_VERSION=$(psql --version | grep -oP '\d+' | head -1)
    if [ "$PSQL_VERSION" -ge 15 ]; then
        sudo -u postgres psql -d $ERP_DB_NAME -c "GRANT ALL ON SCHEMA public TO $ERP_DB_USER;" || true
    fi

    echo -e "${GREEN}✓ PixiERP adatbázis létrehozva${NC}"
else
    echo -e "${YELLOW}⚠ PixiERP adatbázis már létezik${NC}"
fi

# PixInvoice adatbázis
if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $INV_DB_NAME; then
    sudo -u postgres psql <<EOF
CREATE DATABASE $INV_DB_NAME;
CREATE USER $INV_DB_USER WITH PASSWORD '$INV_DB_PASSWORD';
ALTER ROLE $INV_DB_USER SET client_encoding TO 'utf8';
ALTER ROLE $INV_DB_USER SET default_transaction_isolation TO 'read committed';
ALTER ROLE $INV_DB_USER SET timezone TO 'Europe/Budapest';
GRANT ALL PRIVILEGES ON DATABASE $INV_DB_NAME TO $INV_DB_USER;
EOF

    # PostgreSQL 15+ esetén
    if [ "$PSQL_VERSION" -ge 15 ]; then
        sudo -u postgres psql -d $INV_DB_NAME -c "GRANT ALL ON SCHEMA public TO $INV_DB_USER;" || true
    fi

    echo -e "${GREEN}✓ PixInvoice adatbázis létrehozva${NC}"
else
    echo -e "${YELLOW}⚠ PixInvoice adatbázis már létezik${NC}"
fi

# 4. PixiERP telepítése
print_header "4. PixiERP Backend telepítése"

cd pixierp

# Virtual environment
if [ ! -d "venv" ]; then
    echo "Python virtual environment létrehozása..."
    python3 -m venv venv
fi

source venv/bin/activate

# Függőségek
echo "Python függőségek telepítése (ez eltarthat pár percig)..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt

# .env fájl
if [ ! -f ".env" ]; then
    echo "Környezeti változók fájl létrehozása..."
    
    ERP_SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
    
    cat > .env <<EOF
# Django
SECRET_KEY=$ERP_SECRET_KEY
DEBUG=True

# Frontend base URL used in password reset emails
FRONTEND_BASE_URL=$ERP_FRONTEND_URL

# Emergency access domain (used by generate_emergency_access command)
# Dev: http://localhost:3000, Prod: https://erp.pixisys.eu or https://te.pixisys.eu
EMERGENCY_DOMAIN=$ERP_FRONTEND_URL

# Email (opcionális - hagyd üresen fejlesztéshez)
DEFAULT_FROM_EMAIL=no-reply@pixisys.eu
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=True

# Allowed hosts
ALLOWED_HOSTS=$ERP_ALLOWED_HOSTS
CSRF_TRUSTED_ORIGINS=$ERP_CSRF_TRUSTED
CORS_ALLOWED_ORIGINS=$ERP_CORS_ALLOWED

# Database
DB_NAME=$ERP_DB_NAME
DB_USER=$ERP_DB_USER
DB_PASSWORD=$ERP_DB_PASSWORD
DB_HOST=localhost
DB_PORT=5432

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Frontend
FRONTEND_URL=$ERP_FRONTEND_URL
EOF
    echo -e "${GREEN}✓ PixiERP .env létrehozva${NC}"
else
    echo -e "${YELLOW}⚠ PixiERP .env már létezik, kihagyás...${NC}"
fi

# Migrációk
echo "PixiERP adatbázis migrációk..."
python manage.py migrate

# Dev admin user létrehozása (DEBUG módban)
echo "Dev admin felhasználó létrehozása (admin@pixisys.eu)..."
python manage.py create_dev_admin || echo "⚠ create_dev_admin parancs nem elérhető vagy már létezik"

# Statikus fájlok
echo "Statikus fájlok gyűjtése..."
python manage.py collectstatic --noinput > /dev/null 2>&1 || true

# Admin user
echo ""
echo -e "${YELLOW}PixiERP Admin felhasználó létrehozása (hagyd üresen a kihagyáshoz)${NC}"
read -p "Admin username: " ERP_ADMIN_USER

if [ -n "$ERP_ADMIN_USER" ]; then
    read -p "Admin email: " ERP_ADMIN_EMAIL
    read -sp "Admin password: " ERP_ADMIN_PASS
    echo ""
    
    python manage.py shell <<PYEOF
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='$ERP_ADMIN_USER').exists():
    User.objects.create_superuser('$ERP_ADMIN_USER', '$ERP_ADMIN_EMAIL', '$ERP_ADMIN_PASS')
    print('PixiERP Admin létrehozva')
else:
    print('Felhasználó már létezik')
PYEOF
    echo -e "${GREEN}✓ PixiERP Admin felhasználó kész${NC}"
fi

deactivate
cd ..

echo -e "${GREEN}✓ PixiERP Backend telepítés kész${NC}"

# 5. PixiERP Frontend
print_header "5. PixiERP Frontend telepítése"

cd pixierp/frontend

echo "Node.js függőségek telepítése (ez eltarthat pár percig)..."
npm install

# Frontend .env
if [ ! -f ".env" ]; then
    echo "PixiERP Frontend .env létrehozása..."
    echo "  REACT_APP_API_URL = $ERP_BACKEND_URL"
    cat > .env <<EOF
REACT_APP_API_URL=$ERP_BACKEND_URL
PORT=${ERP_FRONTEND_PORT:-3000}
EOF
    echo -e "${GREEN}✓ PixiERP Frontend .env létrehozva${NC}"
else
    echo -e "${YELLOW}⚠ PixiERP Frontend .env már létezik, kihagyás...${NC}"
    echo "  Jelenlegi REACT_APP_API_URL: $(grep REACT_APP_API_URL .env || echo 'nincs beállítva')"
fi

# Build (opcionális)
read -p "Készítsek production build-et? (i/N): " BUILD_ERP
if [ "$BUILD_ERP" = "i" ] || [ "$BUILD_ERP" = "I" ]; then
    echo "PixiERP Frontend build..."
    npm run build
    echo -e "${GREEN}✓ PixiERP Frontend build kész${NC}"
fi

cd ../..

# 6. PixInvoice telepítése
print_header "6. PixInvoice Backend telepítése"

cd pixinvoice/invoice_app

# Virtual environment
if [ ! -d "venv" ]; then
    echo "Python virtual environment létrehozása..."
    python3 -m venv venv
fi

source venv/bin/activate

# Függőségek
echo "Python függőségek telepítése..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt

# .env fájl
if [ ! -f ".env" ]; then
    echo "Környezeti változók fájl létrehozása..."
    
    INV_SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
    
    cat > .env <<EOF
# Django
SECRET_KEY=$INV_SECRET_KEY
DEBUG=True
ALLOWED_HOSTS=$INV_ALLOWED_HOSTS

# Database
DB_NAME=$INV_DB_NAME
DB_USER=$INV_DB_USER
DB_PASSWORD=$INV_DB_PASSWORD
DB_HOST=localhost
DB_PORT=5432

# SMTP Email (opcionális)
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=no-reply@pixisys.eu
FRONTEND_BASE_URL=$INV_FRONTEND_URL

# Emergency access domain (used by generate_emergency_access command)
# Dev: http://localhost:4000, Prod: https://inv.pixisys.eu or https://ti.pixisys.eu
EMERGENCY_DOMAIN=$INV_FRONTEND_URL

# URLs
FRONTEND_URL=$INV_FRONTEND_URL
BACKEND_URL=$INV_BACKEND_URL
EOF
    echo -e "${GREEN}✓ PixInvoice .env létrehozva${NC}"
else
    echo -e "${YELLOW}⚠ PixInvoice .env már létezik, kihagyás...${NC}"
fi

# Migrációk
echo "PixInvoice adatbázis migrációk..."
python manage.py migrate

# Dev admin user létrehozása (DEBUG módban)
echo "Dev admin felhasználó létrehozása (admin@pixisys.eu)..."
python manage.py create_dev_admin || echo "⚠ create_dev_admin parancs nem elérhető vagy már létezik"

# Statikus fájlok
echo "Statikus fájlok gyűjtése..."
python manage.py collectstatic --noinput > /dev/null 2>&1 || true

# Admin user
echo ""
echo -e "${YELLOW}PixInvoice Admin felhasználó létrehozása (hagyd üresen a kihagyáshoz)${NC}"
read -p "Admin username: " INV_ADMIN_USER

if [ -n "$INV_ADMIN_USER" ]; then
    read -p "Admin email: " INV_ADMIN_EMAIL
    read -sp "Admin password: " INV_ADMIN_PASS
    echo ""
    
    python manage.py shell <<PYEOF
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='$INV_ADMIN_USER').exists():
    User.objects.create_superuser('$INV_ADMIN_USER', '$INV_ADMIN_EMAIL', '$INV_ADMIN_PASS')
    print('PixInvoice Admin létrehozva')
else:
    print('Felhasználó már létezik')
PYEOF
    echo -e "${GREEN}✓ PixInvoice Admin felhasználó kész${NC}"
fi

deactivate
cd ../..

echo -e "${GREEN}✓ PixInvoice Backend telepítés kész${NC}"

# 7. PixInvoice Frontend
print_header "7. PixInvoice Frontend telepítése"

cd pixinvoice/frontend

echo "Node.js függőségek telepítése..."
npm install

# Frontend .env
if [ ! -f ".env" ]; then
    echo "PixInvoice Frontend .env létrehozása..."
    echo "  REACT_APP_API_URL = $INV_BACKEND_URL"
    cat > .env <<EOF
REACT_APP_API_URL=$INV_BACKEND_URL
PORT=${INV_FRONTEND_PORT:-4000}
EOF
    echo -e "${GREEN}✓ PixInvoice Frontend .env létrehozva${NC}"
else
    echo -e "${YELLOW}⚠ PixInvoice Frontend .env már létezik, kihagyás...${NC}"
    echo "  Jelenlegi REACT_APP_API_URL: $(grep REACT_APP_API_URL .env || echo 'nincs beállítva')"
fi

# Build (opcionális)
read -p "Készítsek production build-et? (i/N): " BUILD_INV
if [ "$BUILD_INV" = "i" ] || [ "$BUILD_INV" = "I" ]; then
    echo "PixInvoice Frontend build..."
    npm run build
    echo -e "${GREEN}✓ PixInvoice Frontend build kész${NC}"
fi

cd ../..

# 8. Összefoglaló
print_header "Telepítés sikeresen befejeződött!"

echo -e "${GREEN}✓ PixiERP és PixInvoice sikeresen telepítve!${NC}"
echo ""
echo "=========================================="
echo -e "${BLUE}Indítási parancsok:${NC}"
echo "=========================================="
echo ""
echo -e "${YELLOW}1. PixiERP indítása:${NC}"
echo "   Backend:"
echo "     cd pixierp"
echo "     source venv/bin/activate"
echo "     python manage.py runserver 0.0.0.0:8003"
echo ""
echo "   Frontend (másik terminálban):"
echo "     cd pixierp/frontend"
echo "     PORT=3000 npm start"
echo ""
echo "   Vagy használd a gyors indítót:"
echo "     cd pixierp && ./start_backend.sh"
echo "     cd pixierp && ./start_frontend.sh"
echo ""
echo -e "${YELLOW}2. PixInvoice indítása:${NC}"
echo "   Backend:"
echo "     cd pixinvoice/invoice_app"
echo "     source venv/bin/activate"
echo "     python manage.py runserver 0.0.0.0:4001"
echo ""
echo "   Frontend (másik terminálban):"
echo "     cd pixinvoice/frontend"
echo "     PORT=4000 npm start"
echo ""
echo "   Vagy használd a gyors indítót:"
echo "     cd pixinvoice && ./start_backend.sh"
echo "     cd pixinvoice && ./start_frontend.sh"
echo ""
echo -e "${YELLOW}3. Mindkettő egyszerre (root könyvtárból):${NC}"
echo "     ./start.sh"
echo ""
echo "=========================================="
echo -e "${BLUE}Elérhetőségek:${NC}"
echo "=========================================="
echo ""
echo "PixiERP:"
echo "  - Frontend: http://localhost:3000"
echo "  - Backend: http://localhost:8003"
echo "  - Admin: http://localhost:8003/admin"
echo ""
echo "PixInvoice:"
echo "  - Frontend: http://localhost:4000"
echo "  - Backend: http://localhost:4001"
echo "  - Admin: http://localhost:4001/admin"
echo ""
echo "=========================================="
echo ""

# ===== NGINX KONFIGURÁCIÓ GENERÁLÁSA =====
if [ ! "$ERP_DOMAIN" = "localhost:3000" ] && [ ! "$INV_DOMAIN" = "localhost:4000" ]; then
    echo ""
    read -p "Generáljak Nginx konfigurációkat a domain-ekhez? (i/N): " GEN_NGINX
    if [ "$GEN_NGINX" = "i" ] || [ "$GEN_NGINX" = "I" ]; then
        echo ""
        echo -e "${BLUE}📝 Nginx konfiguráció generálása...${NC}"
        
        # PixiERP nginx konfig
        cat > "$SCRIPT_DIR/nginx/${ERP_DOMAIN_NAME}.conf" <<EOF
# PixiERP - ${ERP_DOMAIN_NAME}
# Generálva: $(date)
# NE SZERKESZD MANUÁLISAN! Használd az install.sh vagy config.sh scripteket!

server {
    listen 80;
    server_name ${ERP_DOMAIN_NAME} www.${ERP_DOMAIN_NAME};

    # Redirect HTTP to HTTPS (uncomment when SSL is configured)
    # return 301 https://\$server_name\$request_uri;

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
        
        # Timeout settings
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
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    # Django admin static files
    location ~ ^/(admin|api-auth)/.*\.(?:css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        proxy_pass http://localhost:${ERP_BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Media files
    location /media/ {
        alias ${SCRIPT_DIR}/pixierp/media/;
        expires 7d;
    }

    # Frontend - React app
    location / {
        proxy_pass http://localhost:${ERP_FRONTEND_PORT:-3000};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/${ERP_DOMAIN_NAME}-access.log;
    error_log /var/log/nginx/${ERP_DOMAIN_NAME}-error.log;
}
EOF
        echo -e "${GREEN}✓ ${ERP_DOMAIN_NAME}.conf létrehozva${NC}"
        
        # PixInvoice nginx konfig
        cat > "$SCRIPT_DIR/nginx/${INV_DOMAIN_NAME}.conf" <<EOF
# PixInvoice - ${INV_DOMAIN_NAME}
# Generálva: $(date)
# NE SZERKESZD MANUÁLISAN! Használd az install.sh vagy config.sh scripteket!

server {
    listen 80;
    server_name ${INV_DOMAIN_NAME} www.${INV_DOMAIN_NAME};

    # Redirect HTTP to HTTPS (uncomment when SSL is configured)
    # return 301 https://\$server_name\$request_uri;

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
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Django admin static files
    location ~ ^/(admin|api-auth)/.*\.(?:css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        proxy_pass http://localhost:${INV_BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Media files
    location /media/ {
        alias ${SCRIPT_DIR}/pixinvoice/invoice_app/media/;
        expires 7d;
    }

    # Frontend - React app
    location / {
        proxy_pass http://localhost:${INV_FRONTEND_PORT:-4000};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/${INV_DOMAIN_NAME}-access.log;
    error_log /var/log/nginx/${INV_DOMAIN_NAME}-error.log;
}
EOF
        echo -e "${GREEN}✓ ${INV_DOMAIN_NAME}.conf létrehozva${NC}"
        
        echo ""
        echo -e "${YELLOW}📋 Nginx telepítési lépések:${NC}"
        echo ""
        echo "1. Másold a konfigurációkat az nginx mappába:"
        echo "   sudo cp $SCRIPT_DIR/nginx/${ERP_DOMAIN_NAME}.conf /etc/nginx/sites-available/"
        echo "   sudo cp $SCRIPT_DIR/nginx/${INV_DOMAIN_NAME}.conf /etc/nginx/sites-available/"
        echo ""
        echo "2. Engedélyezd a site-okat:"
        echo "   sudo ln -s /etc/nginx/sites-available/${ERP_DOMAIN_NAME}.conf /etc/nginx/sites-enabled/"
        echo "   sudo ln -s /etc/nginx/sites-available/${INV_DOMAIN_NAME}.conf /etc/nginx/sites-enabled/"
        echo ""
        echo "3. Teszteld a konfigurációt:"
        echo "   sudo nginx -t"
        echo ""
        echo "4. Újraindítás:"
        echo "   sudo systemctl reload nginx"
        echo ""
        
        read -p "Szeretnéd most telepíteni az Nginx konfigurációkat? (i/N): " INSTALL_NGINX
        if [ "$INSTALL_NGINX" = "i" ] || [ "$INSTALL_NGINX" = "I" ]; then
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
            else
                echo -e "${RED}❌ Nginx konfiguráció hibás!${NC}"
                echo "Ellenőrizd a fenti hibaüzeneteket."
            fi
        fi
    fi
fi

echo ""
echo -e "${GREEN}Sikeres telepítést kívánunk!${NC}"
echo -e "${BLUE}További információk: INSTALL.md${NC}"
echo ""
