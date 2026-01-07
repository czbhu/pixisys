# PixInvoice Gyors Telepítési Útmutató

## 🚀 1 perces telepítés

```bash
# 1. Klónozd a repository-t
git clone https://github.com/czbhu/pixisys.git
cd pixisys/pixinvoice

# 2. Futtasd a telepítő scriptet
./install.sh

# 3. Indítsd el a backend-et
./start_backend.sh

# 4. Másik terminálban indítsd el a frontend-et
./start_frontend.sh
```

Kész! Nyisd meg: http://localhost:4000

---

## 📋 Mielőtt elkezded

Győződj meg róla, hogy telepítve van:
- ✅ Python 3.8+
- ✅ Node.js 16+
- ✅ PostgreSQL 13+
- ✅ Git

**Ubuntu/Debian telepítés:**
```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs npm postgresql git
```

---

## 📂 Projekt struktúra

```
pixinvoice/
├── invoice_app/          # Django backend
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example      # Példa környezeti változók
│   └── invoice_system/   # Django projekt
├── frontend/             # React frontend
│   ├── package.json
│   ├── src/
│   └── public/
├── install.sh           # ⭐ Automatikus telepítő script
├── start_backend.sh     # Backend indító
├── start_frontend.sh    # Frontend indító
├── README.md            # Általános dokumentáció
├── INSTALL.md           # 📖 Részletes telepítési útmutató
└── QUICKSTART.md        # Ez a fájl
```

---

## ⚙️ Manuális telepítés (ha az install.sh nem működik)

### Backend

```bash
cd invoice_app

# 1. Virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Függőségek
pip install -r requirements.txt

# 3. Környezeti változók
cp .env.example .env
nano .env  # Szerkeszd: DB adatok, SECRET_KEY

# 4. PostgreSQL adatbázis
sudo -u postgres psql
CREATE DATABASE pixinvoice_db;
CREATE USER pixinvoice_user WITH PASSWORD 'pixinvoice2026';
GRANT ALL PRIVILEGES ON DATABASE pixinvoice_db TO pixinvoice_user;
\q

# 5. Migráció
python manage.py migrate

# 6. Admin user
python manage.py createsuperuser

# 7. Indítás
python manage.py runserver 0.0.0.0:4001
```

### Frontend

```bash
cd frontend

# 1. Függőségek
npm install

# 2. Indítás
PORT=4000 npm start
```

---

## 🌐 Production telepítés (szerverre)

**Részletes leírás:** [INSTALL.md](INSTALL.md) - Nginx, Gunicorn, SSL

Gyors áttekintés:
1. **Nginx** - Reverse proxy és static fájlok
2. **Gunicorn** - Python WSGI szerver
3. **Systemd** - Service management
4. **SSL** - Let's Encrypt certbot

---

## 🔧 Környezeti változók (.env)

### Backend (invoice_app/.env)

```bash
# Django
SECRET_KEY=your-secret-key-here
DEBUG=False
ALLOWED_HOSTS=your-domain.com,your-ip

# Database
DB_NAME=pixinvoice_db
DB_USER=pixinvoice_user
DB_PASSWORD=strong-password
DB_HOST=localhost
DB_PORT=5432

# Email (opcionális)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=email@gmail.com
SMTP_PASSWORD=app-password
```

### Frontend (frontend/.env)

```bash
REACT_APP_API_URL=http://localhost:4001
PORT=4000
```

---

## 🧪 Tesztelés

```bash
# Backend API
curl http://localhost:4001/api/invoices/

# Frontend
curl http://localhost:4000

# Admin
http://localhost:4001/admin
```

---

## 📦 Adatbázis backup

```bash
# Backup
pg_dump -U pixinvoice_user pixinvoice_db > backup.sql

# Restore
psql -U pixinvoice_user pixinvoice_db < backup.sql
```

---

## 🆘 Gyakori hibák

### Port már használatban

```bash
# Backend port (4001)
sudo fuser -k 4001/tcp

# Frontend port (4000)
sudo fuser -k 4000/tcp
```

### PostgreSQL nem fut

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
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
# Tisztítsd meg és telepítsd újra
rm -rf node_modules package-lock.json
npm install
```

---

## 📚 További dokumentáció

- **README.md** - Projekt áttekintés és funkciók
- **INSTALL.md** - Részletes telepítési útmutató szerverre
- **CHANGELOG.md** - Verzió történet

---

## 🎯 Következő lépések

1. ✅ Telepítés kész
2. 🔐 Jelentkezz be az admin felületen
3. 🏢 Hozz létre egy céget
4. 👥 Adj hozzá ügyfeleket
5. 🧾 Készítsd el az első számlát
6. 📧 Állítsd be az email küldést (opcionális)
7. 🔑 Állítsd be a NAV API-t (termeléshez)

---

## 💬 Támogatás

- 📧 Email: support@pixisys.eu
- 🐛 Issues: https://github.com/czbhu/pixisys/issues
- 📖 Wiki: https://github.com/czbhu/pixisys/wiki

---

**Készítve ❤️-vel a Pixi Systems csapata által**
