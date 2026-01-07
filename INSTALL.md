# PixiSys Teljes Telepítési Útmutató

Ez az útmutató lépésről lépésre bemutatja, hogyan telepíthető a teljes PixiSys rendszer (PixiERP + PixInvoice) egy friss szerverre.

## 📋 Tartalomjegyzék

1. [Áttekintés](#áttekintés)
2. [Rendszerkövetelmények](#rendszerkövetelmények)
3. [Rendszer előkészítése](#1-rendszer-előkészítése)
4. [PostgreSQL adatbázis beállítása](#2-postgresql-adatbázis-beállítása)
5. [Redis telepítése](#3-redis-telepítése)
6. [PixiSys letöltése](#4-pixisys-letöltése)
7. [PixiERP telepítése](#5-pixierp-telepítése)
8. [PixInvoice telepítése](#6-pixinvoice-telepítése)
9. [Termelési telepítés](#7-termelési-telepítés-production)
10. [Ellenőrzés és tesztelés](#8-ellenőrzés-és-tesztelés)
11. [Karbantartás](#9-karbantartás)
12. [Hibaelhárítás](#10-hibaelhárítás)

---

## Áttekintés

A PixiSys két fő rendszerből áll:
- **PixiERP**: Vállalatirányítási rendszer (ERP) HR, Sales, Manufacturing, Finance modulokkal
- **PixInvoice**: Számlázó rendszer NAV Online Számla integrációval

Mindkét rendszer használja:
- Django REST Framework backend-et
- React frontend-et
- PostgreSQL adatbázist
- Redis cache-t (ERP esetében WebSocket-hez is)

---

## Rendszerkövetelmények

### Szoftverek
- **Ubuntu 20.04+ / Debian 11+ / CentOS 8+**
- **Python 3.8+** (ajánlott: Python 3.10+)
- **Node.js 16+** (ajánlott: Node.js 18 LTS)
- **PostgreSQL 13+** (ajánlott: PostgreSQL 14+)
- **Redis 6+** (WebSocket és cache-hez)
- **npm vagy yarn**
- **Git**

### Hardver (minimális)
- **CPU**: 4 mag
- **RAM**: 4 GB
- **HDD**: 20 GB szabad hely

### Hardver (ajánlott termeléshez)
- **CPU**: 8+ mag
- **RAM**: 8+ GB
- **SSD**: 100+ GB szabad hely

### Portok
- **3000**: PixiERP Frontend
- **8003**: PixiERP Backend (Daphne/Django)
- **4000**: PixInvoice Frontend
- **4001**: PixInvoice Backend
- **5432**: PostgreSQL
- **6379**: Redis

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
sudo apt install -y git curl wget build-essential software-properties-common

# Python 3 és pip
sudo apt install -y python3 python3-pip python3-venv python3-dev

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib libpq-dev

# Redis
sudo apt install -y redis-server

# Node.js és npm (NodeSource repository-ból, LTS verzió)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Függőségek PDF generáláshoz (WeasyPrint - PixInvoice)
sudo apt install -y libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0

# Egyéb hasznos eszközök
sudo apt install -y htop tmux screen nginx
```

### 1.3. Ellenőrzés

```bash
python3 --version    # Python 3.8+
node --version       # v16+
npm --version        # 8+
psql --version       # PostgreSQL 13+
redis-server --version  # Redis 6+
```

---

## 2. PostgreSQL adatbázis beállítása

### 2.1. PostgreSQL szolgáltatás indítása

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2.2. Adatbázisok és felhasználók létrehozása

```bash
# Váltás postgres felhasználóra
sudo -u postgres psql

# PostgreSQL prompt-ban futtasd:
-- PixiERP adatbázis
CREATE DATABASE pixierp_db;
CREATE USER pixierp_user WITH PASSWORD 'pixierp2026';
ALTER ROLE pixierp_user SET client_encoding TO 'utf8';
ALTER ROLE pixierp_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE pixierp_user SET timezone TO 'Europe/Budapest';
GRANT ALL PRIVILEGES ON DATABASE pixierp_db TO pixierp_user;

-- PixInvoice adatbázis
CREATE DATABASE pixinvoice_db;
CREATE USER pixinvoice_user WITH PASSWORD 'pixinvoice2026';
ALTER ROLE pixinvoice_user SET client_encoding TO 'utf8';
ALTER ROLE pixinvoice_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE pixinvoice_user SET timezone TO 'Europe/Budapest';
GRANT ALL PRIVILEGES ON DATABASE pixinvoice_db TO pixinvoice_user;

-- PostgreSQL 15+ esetén még szükséges:
\c pixierp_db
GRANT ALL ON SCHEMA public TO pixierp_user;

\c pixinvoice_db
GRANT ALL ON SCHEMA public TO pixinvoice_user;

-- Kilépés
\q
```

### 2.3. PostgreSQL hozzáférés engedélyezése (opcionális)

Ha más szerverről szeretnél csatlakozni:

```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Adj hozzá sorokat:
```
host    pixierp_db       pixierp_user       0.0.0.0/0    md5
host    pixinvoice_db    pixinvoice_user    0.0.0.0/0    md5
```

```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
```

Módosítsd:
```
listen_addresses = '*'
```

Indítsd újra:
```bash
sudo systemctl restart postgresql
```

---

## 3. Redis telepítése

### 3.1. Redis szolgáltatás indítása

```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 3.2. Redis tesztelése

```bash
redis-cli ping
# Válasz: PONG
```

### 3.3. Redis konfiguráció (opcionális, termeléshez)

```bash
sudo nano /etc/redis/redis.conf
```

Ajánlott beállítások:
```conf
maxmemory 512mb
maxmemory-policy allkeys-lru
bind 127.0.0.1
requirepass your-strong-redis-password
```

Újraindítás:
```bash
sudo systemctl restart redis-server
```

---

## 4. PixiSys letöltése

### 4.1. Klónozás Git-ből

```bash
# Navigálj oda, ahova telepíteni szeretnéd (pl. /opt vagy /home/user)
cd /opt  # vagy cd ~

# Klónozd a repository-t
git clone https://github.com/czbhu/pixisys.git
cd pixisys
```

### 4.2. Alternatíva: ZIP letöltése

```bash
wget https://github.com/czbhu/pixisys/archive/refs/heads/main.zip
unzip main.zip
cd pixisys-main
```

---

## 5. PixiERP telepítése

### 5.1. Navigálás a PixiERP könyvtárba

```bash
cd pixierp
```

### 5.2. Python virtuális környezet létrehozása

```bash
python3 -m venv venv
source venv/bin/activate
```

### 5.3. Python függőségek telepítése

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 5.4. Környezeti változók beállítása

```bash
# Másold le a példa fájlt
cp env.example .env

# Szerkeszd a .env fájlt
nano .env
```

**PixiERP .env konfiguráció:**
```bash
# Django
SECRET_KEY=your-erp-secret-key-here
DEBUG=False

# Frontend base URL
FRONTEND_BASE_URL=http://localhost:3000

# Email SMTP
DEFAULT_FROM_EMAIL=no-reply@pixisys.eu
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
EMAIL_USE_TLS=True

# Allowed hosts
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,erp.pixisys.eu
CSRF_TRUSTED_ORIGINS=https://erp.pixisys.eu,http://erp.pixisys.eu
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://erp.pixisys.eu

# Database (PostgreSQL)
DB_NAME=pixierp_db
DB_USER=pixierp_user
DB_PASSWORD=pixierp2026
DB_HOST=localhost
DB_PORT=5432

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # ha beállítottad

# Frontend
FRONTEND_URL=http://localhost:3000
```

**Secret key generálása:**
```bash
python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 5.5. Adatbázis migrációk futtatása

```bash
python manage.py migrate
```

### 5.6. Statikus fájlok gyűjtése

```bash
python manage.py collectstatic --noinput
```

### 5.7. Superuser létrehozása

```bash
python manage.py createsuperuser
```

### 5.8. PixiERP Frontend telepítése

```bash
# Lépj ki a venv-ből
deactivate

# Navigálj a frontend mappába
cd frontend

# Node.js függőségek telepítése
npm install

# .env fájl (opcionális)
cat > .env <<EOF
REACT_APP_API_URL=http://localhost:8003
PORT=3000
EOF

# Frontend build (termeléshez)
npm run build

cd ../..  # Vissza a pixisys főkönyvtárba
```

### 5.9. PixiERP tesztelése

```bash
# Backend indítása
cd pixierp
source venv/bin/activate
python manage.py runserver 0.0.0.0:8003

# Másik terminálban frontend
cd pixierp/frontend
PORT=3000 npm start
```

Nyisd meg: `http://localhost:3000`

---

## 6. PixInvoice telepítése

### 6.1. Navigálás a PixInvoice könyvtárba

```bash
cd /opt/pixisys/pixinvoice/invoice_app  # vagy a telepítési útvonal
```

### 6.2. Python virtuális környezet létrehozása

```bash
python3 -m venv venv
source venv/bin/activate
```

### 6.3. Python függőségek telepítése

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 6.4. Környezeti változók beállítása

```bash
cp .env.example .env
nano .env
```

**PixInvoice .env konfiguráció:**
```bash
# Django
SECRET_KEY=your-invoice-secret-key-here
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,inv.pixisys.eu

# Database (PostgreSQL)
DB_NAME=pixinvoice_db
DB_USER=pixinvoice_user
DB_PASSWORD=pixinvoice2026
DB_HOST=localhost
DB_PORT=5432

# SMTP Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_USE_TLS=1
SMTP_FROM=noreply@pixisys.eu

# IMAP (opcionális)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-app-password

# URLs
FRONTEND_URL=http://localhost:4000
BACKEND_URL=http://localhost:4001
```

### 6.5. Adatbázis migrációk futtatása

```bash
python manage.py migrate
```

### 6.6. Statikus fájlok gyűjtése

```bash
python manage.py collectstatic --noinput
```

### 6.7. Superuser létrehozása

```bash
python manage.py createsuperuser
```

### 6.8. PixInvoice Frontend telepítése

```bash
deactivate
cd ../frontend

npm install

cat > .env <<EOF
REACT_APP_API_URL=http://localhost:4001
PORT=4000
EOF

npm run build

cd ../..
```

### 6.9. PixInvoice tesztelése

```bash
# Backend
cd pixinvoice/invoice_app
source venv/bin/activate
python manage.py runserver 0.0.0.0:4001

# Frontend
cd pixinvoice/frontend
PORT=4000 npm start
```

Nyisd meg: `http://localhost:4000`

---

## 7. Termelési telepítés (Production)

### 7.1. Systemd szolgáltatások létrehozása

#### PixiERP Backend (Daphne)

```bash
sudo nano /etc/systemd/system/pixierp-backend.service
```

```ini
[Unit]
Description=PixiERP Django Backend (Daphne)
After=network.target postgresql.service redis.service

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/opt/pixisys/pixierp
Environment="PATH=/opt/pixisys/pixierp/venv/bin"
ExecStart=/opt/pixisys/pixierp/venv/bin/daphne \
    -b 127.0.0.1 \
    -p 8003 \
    erp_system.asgi:application

[Install]
WantedBy=multi-user.target
```

#### PixInvoice Backend (Gunicorn)

```bash
sudo nano /etc/systemd/system/pixinvoice-backend.service
```

```ini
[Unit]
Description=PixInvoice Django Backend (Gunicorn)
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
    invoice_system.wsgi:application

[Install]
WantedBy=multi-user.target
```

### 7.2. Jogosultságok beállítása

```bash
sudo chown -R www-data:www-data /opt/pixisys
```

### 7.3. Szolgáltatások indítása

```bash
sudo systemctl daemon-reload
sudo systemctl start pixierp-backend
sudo systemctl start pixinvoice-backend
sudo systemctl enable pixierp-backend
sudo systemctl enable pixinvoice-backend
```

### 7.4. Nginx konfiguráció

```bash
sudo nano /etc/nginx/sites-available/pixisys
```

```nginx
# PixiERP
server {
    listen 80;
    server_name erp.pixisys.eu;

    client_max_body_size 50M;

    # Frontend (React build)
    location / {
        root /opt/pixisys/pixierp/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:8003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Django Admin
    location /admin/ {
        proxy_pass http://127.0.0.1:8003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /static/ {
        alias /opt/pixisys/pixierp/staticfiles/;
    }

    location /media/ {
        alias /opt/pixisys/pixierp/media/;
    }
}

# PixInvoice
server {
    listen 80;
    server_name inv.pixisys.eu;

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

    # Static files
    location /static/ {
        alias /opt/pixisys/pixinvoice/invoice_app/staticfiles/;
    }

    location /media/ {
        alias /opt/pixisys/pixinvoice/invoice_app/media/;
    }
}
```

### 7.5. Nginx aktiválása

```bash
sudo ln -s /etc/nginx/sites-available/pixisys /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7.6. SSL/HTTPS beállítása

```bash
sudo apt install -y certbot python3-certbot-nginx

# PixiERP SSL
sudo certbot --nginx -d erp.pixisys.eu

# PixInvoice SSL
sudo certbot --nginx -d inv.pixisys.eu

# Automatikus megújítás
sudo certbot renew --dry-run
```

---

## 8. Ellenőrzés és tesztelés

### 8.1. Szolgáltatások ellenőrzése

```bash
sudo systemctl status pixierp-backend
sudo systemctl status pixinvoice-backend
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status redis-server
```

### 8.2. Logok megtekintése

```bash
# PixiERP
sudo journalctl -u pixierp-backend -f

# PixInvoice
sudo journalctl -u pixinvoice-backend -f

# Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 8.3. Böngészőben tesztelés

- PixiERP: `http://erp.pixisys.eu` vagy `http://localhost:3000`
- PixInvoice: `http://inv.pixisys.eu` vagy `http://localhost:4000`

---

## 9. Karbantartás

### 9.1. Adatbázis backup

```bash
# PixiERP backup
pg_dump -U pixierp_user -h localhost pixierp_db > backup_erp_$(date +%Y%m%d_%H%M%S).sql

# PixInvoice backup
pg_dump -U pixinvoice_user -h localhost pixinvoice_db > backup_invoice_$(date +%Y%m%d_%H%M%S).sql

# Backup visszatöltése
psql -U pixierp_user -h localhost pixierp_db < backup_erp_20260107_123456.sql
psql -U pixinvoice_user -h localhost pixinvoice_db < backup_invoice_20260107_123456.sql
```

### 9.2. Alkalmazás frissítése

```bash
cd /opt/pixisys
git pull origin main

# PixiERP frissítése
cd pixierp
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
deactivate

cd frontend
npm install
npm run build
cd ../..

# PixInvoice frissítése
cd pixinvoice/invoice_app
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
deactivate

cd ../frontend
npm install
npm run build
cd ../..

# Szolgáltatások újraindítása
sudo systemctl restart pixierp-backend
sudo systemctl restart pixinvoice-backend
sudo systemctl restart nginx
```

### 9.3. Rendszeres backup script

Készíts egy cron job-ot:

```bash
sudo nano /usr/local/bin/pixisys-backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/pixisys"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Database backups
pg_dump -U pixierp_user pixierp_db > $BACKUP_DIR/erp_$DATE.sql
pg_dump -U pixinvoice_user pixinvoice_db > $BACKUP_DIR/invoice_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
```

```bash
sudo chmod +x /usr/local/bin/pixisys-backup.sh

# Cron job - minden nap éjfél 2-kor
sudo crontab -e
0 2 * * * /usr/local/bin/pixisys-backup.sh
```

---

## 10. Hibaelhárítás

### 10.1. Backend nem indul

```bash
# Ellenőrizd a logokat
sudo journalctl -u pixierp-backend -n 50
sudo journalctl -u pixinvoice-backend -n 50

# Ellenőrizd a portokat
sudo netstat -tlnp | grep 8003
sudo netstat -tlnp | grep 4001

# Teszteld manuálisan
cd /opt/pixisys/pixierp
source venv/bin/activate
python manage.py runserver 0.0.0.0:8003
```

### 10.2. Adatbázis kapcsolat hiba

```bash
# PostgreSQL fut?
sudo systemctl status postgresql

# Kapcsolat teszt
psql -U pixierp_user -h localhost pixierp_db
psql -U pixinvoice_user -h localhost pixinvoice_db
```

### 10.3. Redis kapcsolat hiba

```bash
sudo systemctl status redis-server
redis-cli ping
```

### 10.4. WebSocket nem működik (PixiERP)

```bash
# Ellenőrizd Nginx WebSocket config-ot
sudo nginx -t

# Ellenőrizd Daphne fut-e
sudo systemctl status pixierp-backend

# Logok
sudo journalctl -u pixierp-backend -f
```

---

## Biztonsági javaslatok

1. **Erős jelszavak**: PostgreSQL, Redis, admin felhasználók
2. **Firewall**: UFW/iptables konfiguráció
3. **HTTPS**: Mindig SSL/TLS termelésben
4. **DEBUG=False**: Termelésben
5. **SECRET_KEY**: Egyedi random kulcsok
6. **Backup**: Automatikus napi mentések
7. **Frissítések**: Rendszeres szoftver frissítések
8. **Monitoring**: Logok figyelése, alerting

---

## Támogatás

- **Email**: support@pixisys.eu
- **GitHub Issues**: https://github.com/czbhu/pixisys/issues
- **Dokumentáció**: https://github.com/czbhu/pixisys/wiki

---

**Verzió**: 1.0.0  
**Utolsó frissítés**: 2026. január 7.  
**PixiSys by Pixi Systems**
