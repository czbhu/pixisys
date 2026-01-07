# PixInvoice Telepítési Útmutató

Ez az útmutató lépésről lépésre bemutatja, hogyan telepíthető a PixInvoice rendszer egy friss szerverre.

## Rendszerkövetelmények

### Szoftverek
- **Ubuntu 20.04+ / Debian 11+ / CentOS 8+** (vagy bármely modern Linux disztribúció)
- **Python 3.8+** (ajánlott: Python 3.10+)
- **Node.js 16+** (ajánlott: Node.js 18 LTS)
- **PostgreSQL 13+** (ajánlott: PostgreSQL 14+)
- **npm vagy yarn** (npm jön a Node.js-szel)
- **Git** (verziókezeléshez)

### Hardver (minimális)
- **CPU**: 2 mag
- **RAM**: 2 GB
- **HDD**: 10 GB szabad hely

### Hardver (ajánlott termeléshez)
- **CPU**: 4+ mag
- **RAM**: 4+ GB
- **SSD**: 50+ GB szabad hely

---

## 1. Rendszer előkészítése

### 1.1. Rendszer frissítése (Ubuntu/Debian)

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2. Szükséges csomagok telepítése

```bash
# Alapvető eszközök
sudo apt install -y git curl wget build-essential

# Python 3 és pip
sudo apt install -y python3 python3-pip python3-venv python3-dev

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib libpq-dev

# Node.js és npm (NodeSource repository-ból)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Függőségek PDF generáláshoz (WeasyPrint)
sudo apt install -y libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0
```

### 1.3. Ellenőrzés

```bash
python3 --version    # Python 3.8+
node --version       # v16+
npm --version        # 8+
psql --version       # PostgreSQL 13+
```

---

## 2. PostgreSQL adatbázis beállítása

### 2.1. PostgreSQL szolgáltatás indítása

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2.2. Adatbázis és felhasználó létrehozása

```bash
# Váltás postgres felhasználóra
sudo -u postgres psql

# PostgreSQL prompt-ban futtasd:
CREATE DATABASE pixinvoice_db;
CREATE USER pixinvoice_user WITH PASSWORD 'pixinvoice2026';
ALTER ROLE pixinvoice_user SET client_encoding TO 'utf8';
ALTER ROLE pixinvoice_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE pixinvoice_user SET timezone TO 'Europe/Budapest';
GRANT ALL PRIVILEGES ON DATABASE pixinvoice_db TO pixinvoice_user;

-- PostgreSQL 15+ esetén még szükséges:
\c pixinvoice_db
GRANT ALL ON SCHEMA public TO pixinvoice_user;

-- Kilépés
\q
```

### 2.3. PostgreSQL hozzáférés engedélyezése (opcionális, távoli hozzáféréshez)

Ha más szerverről szeretnél csatlakozni:

```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Adj hozzá egy sort:
```
host    pixinvoice_db    pixinvoice_user    0.0.0.0/0    md5
```

```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
```

Keress rá és módosítsd:
```
listen_addresses = '*'
```

Indítsd újra:
```bash
sudo systemctl restart postgresql
```

---

## 3. PixInvoice letöltése

### 3.1. Klónozás Git-ből

```bash
# Navigálj oda, ahova telepíteni szeretnéd (pl. /opt vagy /home/user)
cd /opt  # vagy cd ~

# Klónozd a repository-t
git clone https://github.com/czbhu/pixisys.git
cd pixisys/pixinvoice
```

### 3.2. Alternatíva: ZIP letöltése

Ha nincs Git hozzáférés:
```bash
wget https://github.com/czbhu/pixisys/archive/refs/heads/main.zip
unzip main.zip
cd pixisys-main/pixinvoice
```

---

## 4. Backend telepítése és konfigurálása

### 4.1. Navigálás a backend könyvtárba

```bash
cd invoice_app
```

### 4.2. Python virtuális környezet létrehozása

```bash
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# Windows esetén: venv\Scripts\activate
```

### 4.3. Python függőségek telepítése

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4.4. Környezeti változók beállítása

```bash
# Másold le a példa fájlt
cp .env.example .env

# Szerkeszd a .env fájlt
nano .env
```

**Minimális .env konfiguráció:**
```bash
SECRET_KEY=valami-nagyon-hosszu-es-random-string-ide-kerul
DEBUG=False  # Termelésben mindig False!
ALLOWED_HOSTS=your-domain.com,your-ip-address

DB_NAME=pixinvoice_db
DB_USER=pixinvoice_user
DB_PASSWORD=pixinvoice2026
DB_HOST=localhost
DB_PORT=5432
```

**Secret key generálása:**
```bash
python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 4.5. Adatbázis migrációk futtatása

```bash
python manage.py migrate
```

### 4.6. Statikus fájlok gyűjtése (termeléshez)

```bash
python manage.py collectstatic --noinput
```

### 4.7. Superuser létrehozása

```bash
python manage.py createsuperuser
```

Kövesd az utasításokat, add meg:
- Username
- Email
- Password (2x)

### 4.8. Backend tesztelése

```bash
python manage.py runserver 0.0.0.0:4001
```

Nyisd meg: `http://localhost:4001/admin` és jelentkezz be.

Ha minden rendben, **Ctrl+C**-vel állítsd le.

---

## 5. Frontend telepítése és konfigurálása

### 5.1. Navigálás a frontend könyvtárba

```bash
# Lépj ki a venv-ből
deactivate

# Navigálj a frontend mappába
cd ../frontend
```

### 5.2. Node.js függőségek telepítése

```bash
npm install
# vagy
yarn install
```

### 5.3. Frontend környezeti változók (opcionális)

Ha szükséges, hozz létre egy `.env` fájlt a frontend mappában:

```bash
nano .env
```

Tartalom:
```bash
REACT_APP_API_URL=http://localhost:4001
PORT=4000
```

### 5.4. Frontend build (termeléshez)

```bash
npm run build
```

Ez létrehoz egy `build/` mappát az optimalizált frontend fájlokkal.

### 5.5. Frontend tesztelése (fejlesztői módban)

```bash
PORT=4000 npm start
```

Nyisd meg: `http://localhost:4000`

---

## 6. Termelési telepítés (Production)

### 6.1. Nginx telepítése

```bash
sudo apt install -y nginx
```

### 6.2. Gunicorn telepítése (backend számára)

```bash
# Backend venv-ben
cd ../invoice_app
source venv/bin/activate
pip install gunicorn
```

### 6.3. Gunicorn szolgáltatás létrehozása

```bash
sudo nano /etc/systemd/system/pixinvoice-backend.service
```

Tartalom:
```ini
[Unit]
Description=PixInvoice Django Backend
After=network.target postgresql.service

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/opt/pixisys/pixinvoice/invoice_app
Environment="PATH=/opt/pixisys/pixinvoice/invoice_app/venv/bin"
ExecStart=/opt/pixisys/pixinvoice/invoice_app/venv/bin/gunicorn \
    --workers 4 \
    --bind 127.0.0.1:4001 \
    --timeout 120 \
    --access-logfile /var/log/pixinvoice/access.log \
    --error-logfile /var/log/pixinvoice/error.log \
    invoice_system.wsgi:application

[Install]
WantedBy=multi-user.target
```

### 6.4. Log mappa létrehozása

```bash
sudo mkdir -p /var/log/pixinvoice
sudo chown www-data:www-data /var/log/pixinvoice
```

### 6.5. Jogosultságok beállítása

```bash
sudo chown -R www-data:www-data /opt/pixisys/pixinvoice
```

### 6.6. Gunicorn szolgáltatás indítása

```bash
sudo systemctl daemon-reload
sudo systemctl start pixinvoice-backend
sudo systemctl enable pixinvoice-backend
sudo systemctl status pixinvoice-backend
```

### 6.7. Nginx konfiguráció

```bash
sudo nano /etc/nginx/sites-available/pixinvoice
```

Tartalom:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Cseréld le!

    client_max_body_size 50M;

    # Frontend (React build)
    location / {
        root /opt/pixisys/pixinvoice/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Django Admin
    location /admin/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files (Django)
    location /static/ {
        alias /opt/pixisys/pixinvoice/invoice_app/staticfiles/;
    }

    # Media files (Django)
    location /media/ {
        alias /opt/pixisys/pixinvoice/invoice_app/media/;
    }
}
```

### 6.8. Nginx konfiguráció aktiválása

```bash
sudo ln -s /etc/nginx/sites-available/pixinvoice /etc/nginx/sites-enabled/
sudo nginx -t  # Konfiguráció tesztelése
sudo systemctl restart nginx
```

### 6.9. SSL/HTTPS beállítása (opcionális, de ajánlott)

```bash
# Let's Encrypt Certbot telepítése
sudo apt install -y certbot python3-certbot-nginx

# SSL tanúsítvány kérése
sudo certbot --nginx -d your-domain.com

# Automatikus megújítás tesztelése
sudo certbot renew --dry-run
```

---

## 7. Gyors telepítési script (automatizált)

Készíthetsz egy `install.sh` scriptet az egyszerűbb telepítéshez:

```bash
nano install.sh
```

Tartalom a következő fejezetben...

---

## 8. Ellenőrzés és tesztelés

### 8.1. Szolgáltatások ellenőrzése

```bash
sudo systemctl status pixinvoice-backend
sudo systemctl status nginx
sudo systemctl status postgresql
```

### 8.2. Logok megtekintése

```bash
# Backend logok
sudo journalctl -u pixinvoice-backend -f

# Nginx logok
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Gunicorn logok
sudo tail -f /var/log/pixinvoice/error.log
```

### 8.3. Böngészőben tesztelés

Nyisd meg: `http://your-domain.com` vagy `http://your-server-ip`

---

## 9. Karbantartás

### 9.1. Adatbázis backup

```bash
# Backup készítése
pg_dump -U pixinvoice_user -h localhost pixinvoice_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup visszatöltése
psql -U pixinvoice_user -h localhost pixinvoice_db < backup_20260107_123456.sql
```

### 9.2. Alkalmazás frissítése

```bash
# Kód frissítése
cd /opt/pixisys/pixinvoice
git pull origin main

# Backend frissítése
cd invoice_app
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
deactivate

# Frontend frissítése
cd ../frontend
npm install
npm run build

# Szolgáltatások újraindítása
sudo systemctl restart pixinvoice-backend
sudo systemctl restart nginx
```

### 9.3. Monitorozás

```bash
# Disk használat
df -h

# Memória használat
free -h

# Futó folyamatok
ps aux | grep gunicorn
ps aux | grep nginx
```

---

## 10. Hibaelhárítás

### 10.1. Backend nem indul

```bash
# Ellenőrizd a logokat
sudo journalctl -u pixinvoice-backend -n 50

# Ellenőrizd a portot
sudo netstat -tlnp | grep 4001

# Teszteld manuálisan
cd /opt/pixisys/pixinvoice/invoice_app
source venv/bin/activate
python manage.py runserver 0.0.0.0:4001
```

### 10.2. Adatbázis kapcsolat hiba

```bash
# Ellenőrizd PostgreSQL fut-e
sudo systemctl status postgresql

# Teszteld a kapcsolatot
psql -U pixinvoice_user -h localhost pixinvoice_db

# Ellenőrizd a .env fájlt
cat .env | grep DB_
```

### 10.3. Static fájlok nem töltődnek be

```bash
# Collectstatic újra
cd /opt/pixisys/pixinvoice/invoice_app
source venv/bin/activate
python manage.py collectstatic --clear --noinput

# Jogosultságok ellenőrzése
ls -la staticfiles/
```

---

## 11. Biztonsági javaslatok

1. **Erős jelszavak**: Használj erős jelszavakat mindenhol
2. **Firewall**: Konfiguráld a tűzfalat (ufw, iptables)
3. **HTTPS**: Mindig használj SSL/TLS tanúsítványt termelésben
4. **DEBUG=False**: Termelésben mindig legyen False
5. **SECRET_KEY**: Használj egyedi, random kulcsot
6. **Backup**: Rendszeres adatbázis mentések
7. **Frissítések**: Rendszeresen frissítsd a szoftvereket

---

## Támogatás

Ha problémába ütközöl, ellenőrizd:
- Logfájlokat
- Portok elérhetőségét
- Szolgáltatások futását
- Jogosultságokat

További kérdések esetén: [GitHub Issues](https://github.com/czbhu/pixisys/issues)
