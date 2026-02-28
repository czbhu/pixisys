#!/bin/bash
# PixiSys Telepítő Script
# v2.0 - Javított verzió (2025-01-30)

# Használat:
# git pull origin main
# chmod +x install.sh
# ./install.sh

# Hibakezelés: Bármilyen hiba esetén álljon le a script, kivéve ha kezelve van
set -e

# Avoid interactive prompts from apt/dpkg (e.g. PostgreSQL cluster upgrade)
export DEBIAN_FRONTEND=noninteractive
export APT_LISTCHANGES_FRONTEND=none
APT_NONINTERACTIVE_OPTS=("-y" "-o" "Dpkg::Options::=--force-confdef" "-o" "Dpkg::Options::=--force-confold")

REQUIRED_SYSTEM_PACKAGES=(
    python3 python3-pip python3-venv python3-dev
    git redis-server nginx curl build-essential
    libpq-dev postgresql postgresql-contrib postgresql-client-16
    libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 shared-mime-info fonts-dejavu-core
    certbot python3-certbot-nginx
)

# Színek definiálása
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_FILE="$SCRIPT_DIR/install_debug.log"

# Logolás indítása: stdout és stderr is menjen a logba is
exec > >(tee -i "$LOG_FILE") 2>&1

echo -e "${BLUE}=== PixiSys Telepítő Indítása ===${NC}"
echo "Log file: $LOG_FILE"

# 1. Root jogosultság ellenőrzése (User kérés: ne fusson root-ként)
if [ "$EUID" -eq 0 ]; then
   echo -e "${RED}HIBA: Ezt a scriptet NEM szabad root-ként futtatni!${NC}"
   echo "Kérlek, futtasd normál felhasználóként (pl. pixisys), aki rendelkezik sudo joggal."
   echo "Ok: A virtualenv és a fájlok jogosultságai hibásak lesznek, ha root-ként futtatod."
   exit 1
fi

# Sudo jogosultság bekérése az elején
echo -e "${BLUE}Sudo jogosultság ellenőrzése...${NC}"
if ! sudo -v; then
    echo -e "${RED}HIBA: Nincs sudo jogosultságod vagy hibás jelszó.${NC}"
    exit 1
fi

# Folyamatos sudo frissítés a háttérben, hogy ne járjon le a session
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

# Függvények
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${YELLOW}$1 nincs telepítve.${NC}"
        return 1
    else
        echo -e "${GREEN}✓ $1 telepítve ($( $1 --version 2>/dev/null | head -n 1 ))${NC}"
        return 0
    fi
}

install_system_deps() {
    echo -e "${BLUE}📦 Rendszerfüggőségek telepítése (apt)...${NC}"
    sudo apt-get update
    # Hozzáadjuk a build-essential-t, python3-dev-et, libpq-dev-et, postgresql-client-16-ot
    echo "PostgreSQL repository hozzáadása..."
    sudo install -d /usr/share/postgresql-common/pgdg
    sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
    sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
    sudo apt-get update

    local -a missing_pkgs=()
    for pkg in "${REQUIRED_SYSTEM_PACKAGES[@]}"; do
        if ! dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
            missing_pkgs+=("$pkg")
        fi
    done

    if [ ${#missing_pkgs[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ Minden rendszerfüggőség telepítve van${NC}"
        return 0
    fi

    echo -e "${YELLOW}Hiányzó rendszercsomagok: ${missing_pkgs[*]}${NC}"
    # Use non-interactive apt options to prevent interactive prompts during install
    sudo DEBIAN_FRONTEND=${DEBIAN_FRONTEND} APT_LISTCHANGES_FRONTEND=${APT_LISTCHANGES_FRONTEND} \
         apt-get "${APT_NONINTERACTIVE_OPTS[@]}" install "${missing_pkgs[@]}"
}

setup_nodejs() {
    # Node verzió ellenőrzése
    local CURRENT_NODE_VER=0
    if command -v node &> /dev/null; then
        # v18.20.4 -> 18
        CURRENT_NODE_VER=$(node -v | cut -d. -f1 | tr -d 'v')
    fi
    
    if [ "$CURRENT_NODE_VER" -lt 20 ]; then
        echo -e "${BLUE}Node.js frissítése/telepítése (20.x)... (Jelenlegi: v$CURRENT_NODE_VER)${NC}"
           curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
           sudo DEBIAN_FRONTEND=${DEBIAN_FRONTEND} APT_LISTCHANGES_FRONTEND=${APT_LISTCHANGES_FRONTEND} \
               apt-get "${APT_NONINTERACTIVE_OPTS[@]}" install nodejs
    else
        echo -e "${GREEN}✓ Node.js verzió megfelelő (v$CURRENT_NODE_VER)${NC}"
    fi

    # NPM frissítés
    if command -v npm &> /dev/null; then
        echo -e "${BLUE}npm frissítése...${NC}"
        sudo npm install -g npm@latest
        # React Scripts globális telepítést nem erőltetjük, inkább lokális build
    fi
}

setup_venv() {
    local TARGET_DIR="$1"
    local VENV_DIR="$TARGET_DIR/venv"
    echo -e "${BLUE}🐍 Virtualenv konfigurálása: $TARGET_DIR${NC}"
    
    if [ ! -d "$TARGET_DIR" ]; then
        echo -e "${RED}  HIBA: A könyvtár nem létezik: $TARGET_DIR${NC}"
        return 1
    fi

    # Ha már létezik
    if [ -d "$VENV_DIR" ]; then
        echo -e "${YELLOW}  A venv mappa már létezik, kihagyjuk az újraalkotást.${NC}"
    else
        echo -e "${BLUE}  Virtualenv létrehozása...${NC}"
        python3 -m venv "$VENV_DIR"
    fi
    
    # Aktiválás és telepítés
    # Al-shellben futtatjuk, hogy ne zavarja meg a globális környezetet
    (
        source "$VENV_DIR/bin/activate"
        # Fontos: setuptools telepítése a 'pkg_resources' hibák elkerülésére
        pip install --upgrade pip setuptools wheel
        
        if [ -f "$TARGET_DIR/requirements.txt" ]; then
            echo -e "${BLUE}  Függőségek telepítése...${NC}"
            pip install -r "$TARGET_DIR/requirements.txt"
        else
            echo -e "${RED}  HIBA: requirements.txt nem található itt: $TARGET_DIR${NC}"
        fi
    )
}

build_frontend() {
    local APP_DIR="$1"
    echo -e "${BLUE}⚛️  Frontend build: $APP_DIR${NC}"
    
    if [ ! -d "$APP_DIR" ]; then
        echo -e "${RED}  HIBA: A könyvtár nem létezik: $APP_DIR${NC}"
        return
    fi
    
    pushd "$APP_DIR" > /dev/null
    
    # Clean install a node_modules hibák elkerülésére
    # Csak akkor töröljük, ha baj van, vagy első futás?
    # A 'npm ci' a package-lock.json alapján telepít tiszta lappal
    if [ -f "package-lock.json" ]; then
        echo -e "${BLUE}  npm ci futtatása (clean install)...${NC}"
        npm ci
    else
        echo -e "${BLUE}  npm install futtatása...${NC}"
        npm install
    fi
    
    echo -e "${BLUE}  Build folyamat start...${NC}"
    # React scripts check
    # A package.json-ban a 'build' script használja a react-scripts-et.
    # Ha git zip-ből jöttünk, a git describe hiba lehet, de ezt az npm install elvileg megoldja
    # vagy a scriptben kellene kezelni. 
    # Az npm run build futtatása a biztos teszt.
    
    if npm run build; then
        echo -e "${GREEN}  ✓ Build sikeres${NC}"
    else
        echo -e "${RED}  HIBA: Build sikertelen! Próbáljuk megfixálni a react-scripts hibát...${NC}"
        # Fallback: install react-scripts explicitly if missing
        npm install react-scripts --save-dev
        if npm run build; then
             echo -e "${GREEN}  ✓ Build sikeres (második próba)${NC}"
        else
             echo -e "${RED}  VÉGZETES HIBA: A build második próbálkozásra sem sikerült.${NC}"
             exit 1
        fi
    fi
    
    popd > /dev/null
}

setup_backup_cron() {
    local CRON_SCHEDULE="0 2 * * *"
    local CRON_CMD="/bin/bash $SCRIPT_DIR/run_backups.sh >> $SCRIPT_DIR/logs/backup.log 2>&1"
    local CRON_JOB="$CRON_SCHEDULE $CRON_CMD"

    echo -e "${BLUE}⏰ Automatikus backup cron beállítása...${NC}"

    chmod +x "$SCRIPT_DIR/run_backups.sh"
    mkdir -p "$SCRIPT_DIR/logs"

    local EXISTING_CRONTAB
    EXISTING_CRONTAB=$(crontab -l 2>/dev/null || true)

    if echo "$EXISTING_CRONTAB" | grep -Fq "$CRON_CMD"; then
        echo -e "${GREEN}✓ Backup cron már be van állítva.${NC}"
        return
    fi

    {
        if [ -n "$EXISTING_CRONTAB" ]; then
            echo "$EXISTING_CRONTAB"
        fi
        echo "$CRON_JOB"
    } | crontab -

    echo -e "${GREEN}✓ Backup cron létrehozva: $CRON_SCHEDULE${NC}"
}

# --- Fő folyamat ---

echo -e "${BLUE}Rendszer előkészítése...${NC}"
install_system_deps
setup_nodejs

# Konfiguráció betöltése
if [ -f config.sh ]; then
    # --load-only kapcsolóval hívjuk meg, hogy ne induljon el a belső interaktív mód
    source config.sh --load-only
fi

# Interaktív mód csak ha nincs beállítva változó
if [ -z "$ERP_DOMAIN_NAME" ]; then
    # Kompatibilitás
    if [ -n "$ERP_DOMAIN" ]; then
        ERP_DOMAIN_NAME="$ERP_DOMAIN"
    else
        echo ""
        echo "Add meg az ERP domaint (pl. erp.ceze.hu vagy 192.168.x.x)!"
        read -p "ERP Domain: " ERP_DOMAIN_NAME
    fi
fi

if [ -z "$INV_DOMAIN_NAME" ]; then
    if [ -n "$INV_DOMAIN" ]; then
        INV_DOMAIN_NAME="$INV_DOMAIN"
    else
        read -p "Számlázó Domain (inv...): " INV_DOMAIN_NAME
    fi
fi

# Mentés configba
echo "ERP_DOMAIN_NAME=\"$ERP_DOMAIN_NAME\"" > config.sh
echo "INV_DOMAIN_NAME=\"$INV_DOMAIN_NAME\"" >> config.sh
# Aliasok
echo "ERP_DOMAIN=\"$ERP_DOMAIN_NAME\"" >> config.sh
echo "INV_DOMAIN=\"$INV_DOMAIN_NAME\"" >> config.sh
chmod +x config.sh

# --- .env Setup ---
echo -e "${BLUE}🔧 Environment (.env) fájlok létrehozása...${NC}"

# PixiERP .env
ERP_ENV_FILE="$SCRIPT_DIR/pixierp/.env"
echo "Creating $ERP_ENV_FILE..."
# Dinamikus CORS/CSRF generálás a short domainekre is
ERP_SHORT_DOMAIN="e.${ERP_DOMAIN_NAME#*.}"
if [[ "$ERP_DOMAIN_NAME" == "erp.pixisys.eu" ]]; then
    ERP_SHORT_DOMAIN="e.pixisys.eu"
fi
# Also always include public PixiSys aliases as fallbacks
ERP_FALLBACKS="erp.pixisys.eu,e.pixisys.eu"

cat > "$ERP_ENV_FILE" << EOF
DEBUG=False
SECRET_KEY=$(openssl rand -base64 50)
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,${ERP_DOMAIN_NAME},${ERP_SHORT_DOMAIN},${ERP_FALLBACKS}
CORS_ALLOWED_ORIGINS=https://${ERP_DOMAIN_NAME},http://${ERP_DOMAIN_NAME},https://${ERP_SHORT_DOMAIN},http://${ERP_SHORT_DOMAIN},https://erp.pixisys.eu,http://erp.pixisys.eu,https://e.pixisys.eu,http://e.pixisys.eu
CSRF_TRUSTED_ORIGINS=https://${ERP_DOMAIN_NAME},http://${ERP_DOMAIN_NAME},https://${ERP_SHORT_DOMAIN},http://${ERP_SHORT_DOMAIN},https://erp.pixisys.eu,http://erp.pixisys.eu,https://e.pixisys.eu,http://e.pixisys.eu
DATA_UPLOAD_MAX_MEMORY_SIZE=1048576000
FILE_UPLOAD_MAX_MEMORY_SIZE=1048576000
EOF


# PixiInvoice .env
INV_ENV_FILE="$SCRIPT_DIR/pixinvoice/invoice_app/.env"
echo "Creating $INV_ENV_FILE..."
INV_SHORT_DOMAIN="i.${INV_DOMAIN_NAME#*.}"
if [[ "$INV_DOMAIN_NAME" == "inv.pixisys.eu" ]]; then
    INV_SHORT_DOMAIN="i.pixisys.eu"
fi

# Also always include public PixiSys aliases as fallbacks
INV_FALLBACKS="inv.pixisys.eu,i.pixisys.eu"

cat > "$INV_ENV_FILE" << EOF
DEBUG=False
SECRET_KEY=$(openssl rand -base64 50)
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,${INV_DOMAIN_NAME},${INV_SHORT_DOMAIN},${INV_FALLBACKS}
CORS_ALLOWED_ORIGINS=https://${INV_DOMAIN_NAME},http://${INV_DOMAIN_NAME},https://${INV_SHORT_DOMAIN},http://${INV_SHORT_DOMAIN},https://inv.pixisys.eu,http://inv.pixisys.eu,https://i.pixisys.eu,http://i.pixisys.eu
CSRF_TRUSTED_ORIGINS=https://${INV_DOMAIN_NAME},http://${INV_DOMAIN_NAME},https://${INV_SHORT_DOMAIN},http://${INV_SHORT_DOMAIN},https://inv.pixisys.eu,http://inv.pixisys.eu,https://i.pixisys.eu,http://i.pixisys.eu
DATA_UPLOAD_MAX_MEMORY_SIZE=1048576000
FILE_UPLOAD_MAX_MEMORY_SIZE=1048576000
EOF

# Backend telepítések
echo -e "${BLUE}🚀 PixiERP Backend előkészítése...${NC}"
setup_venv "$SCRIPT_DIR/pixierp"

echo -e "${BLUE}🚀 PixiInvoice Backend előkészítése...${NC}"
# PixiInvoice requirements a venv mappában szokott lenni? Nem, az invoice_app alatt.
setup_venv "$SCRIPT_DIR/pixinvoice/invoice_app"

# Adatbázis migrációk és Admin létrehozása
echo ""
echo -e "${BLUE}👤 Adminisztrátor létrehozása és Adatbázis inicializálás...${NC}"
echo "Add meg a rendszeradminisztrátor (szuperfelhasználó) adatait."
echo "Ez a felhasználó teljes hozzáférést kap az ERP-hez és a Számlázóhoz is."
echo ""

read -p "Admin Email: " ADMIN_EMAIL
# Jelszó bekérése rejtve
unset ADMIN_PASSWORD
while [ -z "$ADMIN_PASSWORD" ]; do
    read -s -p "Admin Jelszó: " ADMIN_PASSWORD
    echo ""
    read -s -p "Jelszó megerősítése: " ADMIN_PASSWORD_CONFIRM
    echo ""
    if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
        echo -e "${RED}A jelszavak nem egyeznek! Próbáld újra.${NC}"
        ADMIN_PASSWORD=""
    fi
done

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
    # 1. PixiERP Migráció és User
    echo -e "${BLUE}PixiERP adatbázis migráció...${NC}"
    (
        source "$SCRIPT_DIR/pixierp/venv/bin/activate"
        cd "$SCRIPT_DIR/pixierp"
        
        # Dependency check fix for system-wide vs venv issues
        pip install --upgrade pip setuptools wheel
        pip install -r requirements.txt
        
        python manage.py migrate --noinput
        
        echo -e "${BLUE}PixiERP admin és jogosultságok létrehozása...${NC}"
        # A create_initial_admin.py már tartalmazza a jogosultságok és a jwt route-ok javítását
        python create_initial_admin.py "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
    )
    
    # 2. PixiInvoice Migráció és User
    echo -e "${BLUE}PixiInvoice adatbázis migráció...${NC}"
    (
        source "$SCRIPT_DIR/pixinvoice/invoice_app/venv/bin/activate"
        cd "$SCRIPT_DIR/pixinvoice/invoice_app"
        
        pip install --upgrade pip setuptools wheel
        pip install -r requirements.txt
        
        python manage.py migrate --noinput
        
        echo -e "${BLUE}PixiInvoice admin és jogosultságok létrehozása...${NC}"
        python create_initial_admin.py "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
    )
    
    echo -e "${GREEN}✓ Adminisztrátor létrehozva mindkét rendszerben.${NC}"
else
    echo -e "${YELLOW}⚠️  Admin adatok hiányosak, felhasználó létrehozása kihagyva.${NC}"
fi



# Frontend telepítések
echo -e "${BLUE}🚀 PixiERP Frontend build...${NC}"
build_frontend "$SCRIPT_DIR/pixierp/frontend"

echo -e "${BLUE}🚀 PixiInvoice Frontend build...${NC}"
build_frontend "$SCRIPT_DIR/pixinvoice/frontend"


# Nginx konfiguráció
echo -e "${BLUE}🔧 Nginx konfigurálása...${NC}"

# Jogosultságok biztosítása (Current User)
sudo chown -R $USER:$USER "$SCRIPT_DIR"

# Ensure nginx (www-data) can read frontend build files and keep group permissions
sudo chgrp -R www-data "$SCRIPT_DIR/pixinvoice/frontend/build" "$SCRIPT_DIR/pixierp/frontend/build" 2>/dev/null || true
sudo find "$SCRIPT_DIR/pixinvoice/frontend/build" -type d -exec chmod 2755 {} \; 2>/dev/null || true
sudo find "$SCRIPT_DIR/pixinvoice/frontend/build" -type f -exec chmod 0644 {} \; 2>/dev/null || true
sudo find "$SCRIPT_DIR/pixierp/frontend/build" -type d -exec chmod 2755 {} \; 2>/dev/null || true
sudo find "$SCRIPT_DIR/pixierp/frontend/build" -type f -exec chmod 0644 {} \; 2>/dev/null || true

# Ensure nginx enforces a large upload limit globally in case vhost templates miss it
if [ ! -f /etc/nginx/conf.d/client_max_body_size.conf ]; then
    sudo tee /etc/nginx/conf.d/client_max_body_size.conf > /dev/null <<'NGINXEOF'
client_max_body_size 1000M;
NGINXEOF
fi

# Nginx hozzáférés biztosítása a home könyvtárhoz
echo -e "${BLUE}Jogosultságok ellenőrzése Nginx számára...${NC}"
# A home könyvtárnak legalább 'execute' joggal kell rendelkeznie 'others' számára,
# hogy az Nginx (www-data) be tudjon lépni.
HOME_PERM=$(stat -c "%a" "$HOME")
if [[ "$HOME_PERM" != *1 ]] && [[ "$HOME_PERM" != *5 ]] && [[ "$HOME_PERM" != *7 ]]; then
    echo -e "${YELLOW}⚠️  A home könyvtár ($HOME) túl szigorú jogosultságokkal rendelkezik ($HOME_PERM).${NC}"
    echo -e "${YELLOW}   Az Nginx nem fogja elérni a static fájlokat (500 Internal Server Error).${NC}"
    echo -e "${BLUE}   Jogosultság javítása (o+x)...${NC}"
    chmod o+x "$HOME"
fi

# Biztosítjuk, hogy a frontend build fájlok olvashatóak legyenek
find "$SCRIPT_DIR/pixierp/frontend/build" -type d -exec chmod 755 {} \; 2>/dev/null || true
find "$SCRIPT_DIR/pixierp/frontend/build" -type f -exec chmod 644 {} \; 2>/dev/null || true
find "$SCRIPT_DIR/pixinvoice/frontend/build" -type d -exec chmod 755 {} \; 2>/dev/null || true
find "$SCRIPT_DIR/pixinvoice/frontend/build" -type f -exec chmod 644 {} \; 2>/dev/null || true

# Config fileok másolása (ha léteznek eredetiben, akkor frissítsük a SCRIPT_DIR-t)
# Feltételezzük, hogy az nginx/ mappában ott vannak a sablonok
if [ -d "$SCRIPT_DIR/nginx" ]; then
    for domain in "$ERP_DOMAIN_NAME" "$INV_DOMAIN_NAME"; do
        # Megpróbáljuk megtalálni a megfelelő conf file-t
        # A repo-ban lehet hogy erp.pixisys.eu.conf néven van.
        # Ha nincs pont olyan nevű fájl, mint a domain, akkor keressük a sablont?
        # A jelenlegi struktúrában: erp.pixisys.eu.conf és inv.pixisys.eu.conf van.
        # Ha a user más domaint ad meg, akkor sablonként kell kezelni ezeket.
        
        # Ez egy egyszerűsítés: feltételezzük, hogy a user vagy átnevezte, vagy a defaultot használja,
        # VAGY másoljuk a .eu.conf-ot a user domainjére
        
        TEMPLATE_CONF=""
        if [[ "$domain" == "$ERP_DOMAIN_NAME" ]]; then
             TEMPLATE_CONF="$SCRIPT_DIR/nginx/erp.pixisys.eu.conf"
        else
             TEMPLATE_CONF="$SCRIPT_DIR/nginx/inv.pixisys.eu.conf"
        fi
        
        if [ -f "$TEMPLATE_CONF" ]; then
            echo -e "${BLUE}  Konfiguráció generálása ehhez: $domain ...${NC}"
            # Célfájl neve a SCRIPT_DIR/nginx mappában
            TARGET_CONF="$SCRIPT_DIR/nginx/${domain}.conf"
            
            # Másolás és csere
            cp "$TEMPLATE_CONF" "$TARGET_CONF"
            
            # Domain nevek cseréje (mindenhol, nem csak a server_name sorban)
            # Ez kezeli az 'if ($host = ...)' és egyéb blokkokat is.
            if [[ "$domain" == "$ERP_DOMAIN_NAME" ]]; then
                 # Az ERP sablonban 'erp.pixisys.eu' a default
                 sed -i "s|erp.pixisys.eu|$domain|g" "$TARGET_CONF"
                 
                 # Upload limit beállítása 1000M-re
                 if grep -q "client_max_body_size" "$TARGET_CONF"; then
                     sed -i "s|client_max_body_size .*|client_max_body_size 1000M;|g" "$TARGET_CONF"
                 else
                     sed -i "/server_name/a \    client_max_body_size 1000M;" "$TARGET_CONF"
                 fi
            else
                 # Az INV sablonban 'inv.pixisys.eu' a default
                 sed -i "s|inv.pixisys.eu|$domain|g" "$TARGET_CONF"

                 # Upload limit beállítása 1000M-re
                 if grep -q "client_max_body_size" "$TARGET_CONF"; then
                     sed -i "s|client_max_body_size .*|client_max_body_size 1000M;|g" "$TARGET_CONF"
                 else
                     sed -i "/server_name/a \    client_max_body_size 1000M;" "$TARGET_CONF"
                 fi
            fi
            
            # Biztonsági háló: server_name pontosítása, ha a fenti nem találta volna meg (pl. már szerkesztett sablon)
            sed -i "s|server_name .*|server_name $domain;|g" "$TARGET_CONF"
            
            sed -i "s|root .*/frontend/build|root $SCRIPT_DIR/pixierp/frontend/build|g" "$TARGET_CONF"
            # Media path javítása
            sed -i "s|alias .*/media/|alias $SCRIPT_DIR/pixierp/media/|g" "$TARGET_CONF"
            
            # Ha invoice, akkor pixinvoice path
            if [[ "$domain" == "$INV_DOMAIN_NAME" ]]; then
                 sed -i "s|root .*/frontend/build|root $SCRIPT_DIR/pixinvoice/frontend/build|g" "$TARGET_CONF"
                 sed -i "s|alias .*/media/|alias $SCRIPT_DIR/pixinvoice/invoice_app/media/|g" "$TARGET_CONF"
            fi
            
            # SCRIPT_DIR csere ha van placeholder
            sed -i "s|__SCRIPT_DIR__|$SCRIPT_DIR|g" "$TARGET_CONF"
            
            # Linkelés
            sudo cp "$TARGET_CONF" "/etc/nginx/sites-available/$domain.conf"
            sudo ln -sf "/etc/nginx/sites-available/$domain.conf" "/etc/nginx/sites-enabled/"
            echo -e "${GREEN}  ✓ $domain.conf aktiválva${NC}"
        else
            echo -e "${YELLOW}  ⚠️  Nem találtam sablon konfigot ehhez: $domain ($TEMPLATE_CONF)${NC}"
        fi
    done
fi

echo -e "${BLUE}Nginx tesztelése...${NC}"
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo -e "${GREEN}✓ Nginx újratöltve.${NC}"
    
    # SSL Tanúsítvány kérése (opcionális)
    # Csak akkor foglalkozunk vele, ha nincs még cert
    NEED_CERT=false
    if ! sudo test -d "/etc/letsencrypt/live/$ERP_DOMAIN_NAME"; then
        NEED_CERT=true
    fi
    if ! sudo test -d "/etc/letsencrypt/live/$INV_DOMAIN_NAME"; then
        NEED_CERT=true
    fi
    
    if [ "$NEED_CERT" = "true" ]; then
        # Ellenőrizzük, hogy a domain nem localhost vagy IP cím
        if [[ "$ERP_DOMAIN_NAME" == "localhost" ]] || [[ "$ERP_DOMAIN_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
             echo ""
             echo -e "${YELLOW}ℹ️  A domain ($ERP_DOMAIN_NAME) localhost vagy IP cím, SSL tanúsítvány kérése kihagyva.${NC}"
             ASK_SSL="n"
        else
            echo ""
            echo -e "${YELLOW}⚠️  Nem találtam SSL tanúsítványt a domainekhez.${NC}"
            echo -e "Ha ez a szerver közvetlenül elérhető az internetről (vagy a proxy továbbítja a kéréseket),"
            echo -e "érdemes lehet kérni egy ingyenes Let's Encrypt tanúsítványt."
            echo ""
            read -p "Szeretnéd megpróbálni a tanúsítvány lekérését (Certbot)? (i/N): " ASK_SSL
        fi
        
        if [[ "$ASK_SSL" =~ ^[IiYy]$ ]]; then
             read -p "Adj meg egy email címet a regisztrációhoz: " CERT_EMAIL
             if [ -n "$CERT_EMAIL" ]; then
                  echo -e "${BLUE}Tanúsítvány kérése...${NC}"
                  # ERP
                  sudo certbot --nginx -d "$ERP_DOMAIN_NAME" --non-interactive --agree-tos --email "$CERT_EMAIL" --redirect || echo -e "${RED}Hiba az ERP cert kérésnél${NC}"
                  # INV
                  sudo certbot --nginx -d "$INV_DOMAIN_NAME" --non-interactive --agree-tos --email "$CERT_EMAIL" --redirect || echo -e "${RED}Hiba az INV cert kérésnél${NC}"
             else
                  echo -e "${RED}Email cím kötelező! Kihagyva.${NC}"
             fi
        else
             echo "SSL kérés kihagyva."
        fi
    else
        echo -e "${GREEN}✓ SSL tanúsítványok már léteznek.${NC}"
    fi

else
    echo -e "${RED}⚠️  Nginx hiba (lásd fent). A telepítés folytatódik.${NC}"
fi

setup_backup_cron

echo -e "${GREEN}=== Telepítés Kész! ===${NC}"
echo "Elérhető domainek:"
echo "  ERP: http://$ERP_DOMAIN_NAME"
echo "  SZÁMLÁZÓ: http://$INV_DOMAIN_NAME"
echo ""
echo "A rendszer használatra kész!"
echo "Bejelentkezéshez használd a megadott admin email címet és jelszót."


