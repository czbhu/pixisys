#!/bin/bash
# PixiSys Telepítő Script
# v2.0 - Javított verzió (2025-01-30)

# Használat:
# chmod +x install.sh
# ./install.sh

# Hibakezelés: Bármilyen hiba esetén álljon le a script, kivéve ha kezelve van
set -e

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
    # Hozzáadjuk a build-essential-t, python3-dev-et, libpq-dev-et
    sudo apt-get install -y python3 python3-pip python3-venv python3-dev \
                            git redis-server nginx curl build-essential \
                            libpq-dev postgresql postgresql-contrib \
                            certbot python3-certbot-nginx
}

setup_nodejs() {
    if ! check_command node; then
        echo -e "${BLUE}Node.js telepítés (20.x)...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    # NPM frissítés
    if command -v npm &> /dev/null; then
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

# --- Fő folyamat ---

echo -e "${BLUE}Rendszer előkészítése...${NC}"
install_system_deps
setup_nodejs

# Konfiguráció betöltése
if [ -f config.sh ]; then
    source config.sh
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

# Backend telepítések
echo -e "${BLUE}🚀 PixiERP Backend előkészítése...${NC}"
setup_venv "$SCRIPT_DIR/pixierp"

echo -e "${BLUE}🚀 PixiInvoice Backend előkészítése...${NC}"
# PixiInvoice requirements a venv mappában szokott lenni? Nem, az invoice_app alatt.
setup_venv "$SCRIPT_DIR/pixinvoice/invoice_app"


# Frontend telepítések
echo -e "${BLUE}🚀 PixiERP Frontend build...${NC}"
build_frontend "$SCRIPT_DIR/pixierp/frontend"

echo -e "${BLUE}🚀 PixiInvoice Frontend build...${NC}"
build_frontend "$SCRIPT_DIR/pixinvoice/frontend"


# Nginx konfiguráció
echo -e "${BLUE}🔧 Nginx konfigurálása...${NC}"

# Jogosultságok biztosítása (Current User)
sudo chown -R $USER:$USER "$SCRIPT_DIR"

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
            # Cseréljük ki a domain nevet és az elérési utat
            # Figyelem: A sablonban server_name erp.pixisys.eu; van.
            # Cseréljük le a server_name-t a user domainjére
            sed -i "s|server_name .*|server_name $domain;|g" "$TARGET_CONF"
            sed -i "s|root .*/frontend/build|root $SCRIPT_DIR/pixierp/frontend/build|g" "$TARGET_CONF"
            # Ha invoice, akkor pixinvoice path
            if [[ "$domain" == "$INV_DOMAIN_NAME" ]]; then
                 sed -i "s|root .*/frontend/build|root $SCRIPT_DIR/pixinvoice/frontend/build|g" "$TARGET_CONF"
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
else
    echo -e "${RED}⚠️  Nginx hiba (lásd fent). A telepítés folytatódik.${NC}"
fi

echo -e "${GREEN}=== Telepítés Kész! ===${NC}"
echo "Elérhető domainek:"
echo "  ERP: http://$ERP_DOMAIN_NAME"
echo "  SZÁMLÁZÓ: http://$INV_DOMAIN_NAME"
echo ""
echo "Fontos: Ha ez új telepítés, ne felejtsd el beállítani az .env fájlokat és migrálni az adatbázist!"
echo "Lásd: INSTALL.md"

