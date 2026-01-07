# PixiSys Gyors Telepítési Útmutató

## 🚀 1 perces telepítés

```bash
# 1. Klónozd a repository-t
git clone https://github.com/czbhu/pixisys.git
cd pixisys

# 2. Futtasd a telepítő scriptet
./install.sh

# 3. Indítsd el a rendszert
./start.sh
```

Kész! Nyisd meg:
- **PixiERP**: http://localhost:3000
- **PixInvoice**: http://localhost:4000

---

## 📋 Mielőtt elkezded

Győződj meg róla, hogy telepítve van:
- ✅ Python 3.8+
- ✅ Node.js 16+
- ✅ PostgreSQL 13+
- ✅ Redis 6+
- ✅ Git

**Ubuntu/Debian gyors telepítés:**
```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs npm postgresql redis-server git
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 📂 Projekt struktúra

```
pixisys/
├── pixierp/              # ERP rendszer
│   ├── manage.py
│   ├── requirements.txt
│   ├── venv/
│   ├── erp_system/       # Django projekt
│   ├── apps/             # ERP modulok (HR, Sales, Manufacturing, etc.)
│   └── frontend/         # React frontend
├── pixinvoice/           # Számlázó rendszer
│   ├── invoice_app/      # Django backend
│   │   ├── manage.py
│   │   ├── requirements.txt
│   │   └── venv/
│   └── frontend/         # React frontend
├── install.sh           # ⭐ Automatikus telepítő
├── start.sh             # Mindkét rendszer egyszerre indítása
├── INSTALL.md           # 📖 Részletes telepítési útmutató
└── QUICKSTART.md        # Ez a fájl
```

---

## 🎯 Komponensek

### PixiERP (Enterprise Resource Planning)
- **Backend**: Django + Daphne (WebSocket támogatással)
- **Frontend**: React + Ant Design
- **Port**: 8003 (backend), 3000 (frontend)
- **Adatbázis**: pixierp_db
- **Modulok**: HR, Sales, Manufacturing, Finance, CRM, Orders, POS

### PixInvoice (Számlázó rendszer)
- **Backend**: Django + Gunicorn
- **Frontend**: React + styled-components
- **Port**: 4001 (backend), 4000 (frontend)
- **Adatbázis**: pixinvoice_db
- **Funkciók**: Számlák, NAV integráció, Email küldés, PDF generálás

---

## ⚙️ Manuális telepítés (ha az install.sh nem működik)

### 1. PostgreSQL adatbázisok

```bash
sudo -u postgres psql
```

```sql
-- PixiERP
CREATE DATABASE pixierp_db;
CREATE USER pixierp_user WITH PASSWORD 'pixierp2026';
GRANT ALL PRIVILEGES ON DATABASE pixierp_db TO pixierp_user;

-- PixInvoice
CREATE DATABASE pixinvoice_db;
CREATE USER pixinvoice_user WITH PASSWORD 'pixinvoice2026';
GRANT ALL PRIVILEGES ON DATABASE pixinvoice_db TO pixinvoice_user;

\q
```

### 2. PixiERP Backend

```bash
cd pixierp

# Virtual environment
python3 -m venv venv
source venv/bin/activate

# Függőségek
pip install -r requirements.txt

# Környezeti változók
cp env.example .env
nano .env  # Szerkeszd a DB adatokat

# Migrációk
python manage.py migrate

# Admin user
python manage.py createsuperuser

# Indítás
python manage.py runserver 0.0.0.0:8003
```

### 3. PixiERP Frontend

```bash
cd pixierp/frontend

# Függőségek
npm install

# Indítás
PORT=3000 npm start
```

### 4. PixInvoice Backend

```bash
cd pixinvoice/invoice_app

# Virtual environment
python3 -m venv venv
source venv/bin/activate

# Függőségek
pip install -r requirements.txt

# Környezeti változók
cp .env.example .env
nano .env

# Migrációk
python manage.py migrate

# Admin user
python manage.py createsuperuser

# Indítás
python manage.py runserver 0.0.0.0:4001
```

### 5. PixInvoice Frontend

```bash
cd pixinvoice/frontend

# Függőségek
npm install

# Indítás
PORT=4000 npm start
```

---

## 🌐 Production telepítés (szerverre)

**Részletes leírás:** [INSTALL.md](INSTALL.md) - Nginx, Gunicorn, Daphne, SSL

### Gyors áttekintés:

1. **Nginx** - Reverse proxy és static fájlok
2. **Gunicorn** - PixInvoice WSGI szerver
3. **Daphne** - PixiERP ASGI szerver (WebSocket)
4. **Systemd** - Service management
5. **SSL** - Let's Encrypt certbot
6. **Redis** - Cache és WebSocket channel layer

---

## 🔧 Környezeti változók

### PixiERP (.env)

```bash
SECRET_KEY=your-secret-key
DEBUG=False
ALLOWED_HOSTS=erp.yourdomain.com
FRONTEND_BASE_URL=https://erp.yourdomain.com

DB_NAME=pixierp_db
DB_USER=pixierp_user
DB_PASSWORD=strong-password
DB_HOST=localhost
DB_PORT=5432

REDIS_HOST=localhost
REDIS_PORT=6379
```

### PixInvoice (.env)

```bash
SECRET_KEY=your-secret-key
DEBUG=False
ALLOWED_HOSTS=inv.yourdomain.com

DB_NAME=pixinvoice_db
DB_USER=pixinvoice_user
DB_PASSWORD=strong-password
DB_HOST=localhost
DB_PORT=5432

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=email@gmail.com
SMTP_PASSWORD=app-password
```

---

## 🧪 Tesztelés

```bash
# PixiERP
curl http://localhost:8003/api/
curl http://localhost:3000

# PixInvoice
curl http://localhost:4001/api/invoices/
curl http://localhost:4000

# Admin felületek
http://localhost:8003/admin
http://localhost:4001/admin
```

---

## 📦 Adatbázis backup

```bash
# Backup
pg_dump -U pixierp_user pixierp_db > backup_erp.sql
pg_dump -U pixinvoice_user pixinvoice_db > backup_invoice.sql

# Restore
psql -U pixierp_user pixierp_db < backup_erp.sql
psql -U pixinvoice_user pixinvoice_db < backup_invoice.sql
```

---

## 🆘 Gyakori hibák

### Port már használatban

```bash
# PixiERP
sudo fuser -k 8003/tcp
sudo fuser -k 3000/tcp

# PixInvoice
sudo fuser -k 4001/tcp
sudo fuser -k 4000/tcp
```

### PostgreSQL nem fut

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Redis nem fut

```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### Python függőség hiba

```bash
# Frissítsd pip-et
pip install --upgrade pip

# Telepítsd újra
pip install -r requirements.txt
```

### Node modul hiba

```bash
# Tisztítsd meg
rm -rf node_modules package-lock.json
npm install
```

---

## 🚀 Indítási módok

### Opció 1: Mindkettő egyszerre (ajánlott)

```bash
./start.sh
```

Ez indítja:
- PixiERP Backend (port 8003)
- PixiERP Frontend (port 3000)
- PixInvoice Backend (port 4001)
- PixInvoice Frontend (port 4000)

### Opció 2: Külön-külön

**PixiERP:**
```bash
cd pixierp
./start_backend.sh   # Terminál 1
./start_frontend.sh  # Terminál 2
```

**PixInvoice:**
```bash
cd pixinvoice
./start_backend.sh   # Terminál 3
./start_frontend.sh  # Terminál 4
```

### Opció 3: Háttérben (screen/tmux)

```bash
# Screen használata
screen -S pixisys
./start.sh
# Ctrl+A, majd D a leváláshoz

# Visszacsatlakozás
screen -r pixisys
```

---

## 📚 További dokumentáció

- **INSTALL.md** - Részletes telepítési útmutató szerverre
- **pixierp/README.md** - PixiERP dokumentáció
- **pixinvoice/README.md** - PixInvoice dokumentáció
- **pixinvoice/INSTALL.md** - PixInvoice telepítés
- **pixierp/BACKUP_README.md** - Backup útmutató

---

## 🎯 Következő lépések

1. ✅ Telepítés kész
2. 🔐 Jelentkezz be az admin felületeken
3. 🏢 PixiERP: Hozz létre vállalati adatokat
4. 👥 PixiERP: Adj hozzá alkalmazottakat
5. 🧾 PixInvoice: Hozz létre céget
6. 👥 PixInvoice: Adj hozzá ügyfeleket
7. 📧 Állítsd be az email küldést
8. 🔑 NAV API konfiguráció (PixInvoice)

---

## 💬 Támogatás

- 📧 Email: support@pixisys.eu
- 🐛 Issues: https://github.com/czbhu/pixisys/issues
- 📖 Wiki: https://github.com/czbhu/pixisys/wiki

---

## 🔒 Biztonsági figyelmeztetések

⚠️ **Termelési környezetben:**
- Állítsd át `DEBUG=False`
- Használj erős `SECRET_KEY`-t
- Állíts be HTTPS-t (SSL/TLS)
- Konfiguráld a firewall-t
- Rendszeres backup-ok
- Erős adatbázis jelszavak
- Redis jelszó védelem

---

## 📊 Rendszerkövetelmények összefoglalás

| Komponens | Minimum | Ajánlott |
|-----------|---------|----------|
| CPU | 4 mag | 8+ mag |
| RAM | 4 GB | 8+ GB |
| HDD | 20 GB | 100+ GB SSD |
| Python | 3.8+ | 3.10+ |
| Node.js | 16+ | 18 LTS |
| PostgreSQL | 13+ | 14+ |
| Redis | 6+ | 7+ |

---

## 📚 További Dokumentáció

- **[README.md](README.md)** - Teljes projekt áttekintés
- **[INSTALL.md](INSTALL.md)** - Részletes telepítési útmutató
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - 🔄 **Production frissítési útmutató**
- **[pixierp/README.md](pixierp/README.md)** - PixiERP dokumentáció
- **[pixinvoice/README.md](pixinvoice/README.md)** - PixInvoice dokumentáció

---

**Készítve ❤️-vel a Pixi Systems csapata által**

**Verzió**: 1.0.0  
**Utolsó frissítés**: 2026. január 7.
