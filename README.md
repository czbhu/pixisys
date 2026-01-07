# PixiSys - Integrált Vállalati Rendszer

Teljes körű vállalatirányítási és számlázási rendszer modern technológiákkal.

## 🎯 Mi az a PixiSys?

A PixiSys két fő rendszerből áll:

### 1. **PixiERP** - Vállalatirányítási Rendszer
Komplex ERP rendszer a vállalat minden területének kezelésére:
- 👥 **HR** - Alkalmazottak, osztályok, jelenlét, bérszámfejtés
- 💼 **Sales** - Leadek, ajánlatok, rendelések, értékesítési folyamat
- 🏭 **Manufacturing** - Gyártás, anyagjegyzék, munkarendelések
- 💰 **Finance** - Pénzügy, költségvetés, jelentések
- 🤝 **CRM** - Ügyfélkapcsolatok, tevékenységek, kampányok
- 📦 **Orders** - Rendeléskezelés, szállítások, beszállítók
- 🛒 **POS** - Értékesítési pont kezelése

### 2. **PixInvoice** - Számlázó Rendszer
Professzionális számlázás NAV integrációval:
- 🧾 Számlák, ajánlatok, szállítólevelek kezelése
- 🇭🇺 NAV Online Számla integráció
- 📧 Automatikus email küldés PDF melléklettel
- 👥 Ügyfél és partner kezelés
- 📊 Jelentések és statisztikák
- 🔄 Sztornó és helyesbítő számlák

---

## 🚀 Gyors Telepítés

### Automatikus telepítés (AJÁNLOTT)

```bash
# 1. Klónozás
git clone https://github.com/czbhu/pixisys.git
cd pixisys

# 2. Telepítés
./install.sh

# 3. Indítás
./start.sh
```

**Kész! 🎉**
- PixiERP: http://localhost:3000
- PixInvoice: http://localhost:4000

### Részletes telepítési útmutatók

- 📖 **[QUICKSTART.md](QUICKSTART.md)** - Gyors kezdés, 1 perces telepítés
- 📚 **[INSTALL.md](INSTALL.md)** - Teljes telepítési útmutató, production beállítások
- 🔧 **[pixierp/README.md](pixierp/README.md)** - PixiERP részletes dokumentáció
- 💼 **[pixinvoice/README.md](pixinvoice/README.md)** - PixInvoice részletes dokumentáció

---

## 📋 Rendszerkövetelmények

### Alapvető követelmények
- **Python** 3.8+ (ajánlott: 3.10+)
- **Node.js** 16+ (ajánlott: 18 LTS)
- **PostgreSQL** 13+ (ajánlott: 14+)
- **Redis** 6+ (ajánlott: 7+)
- **Git**

### Ubuntu/Debian telepítés

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs npm postgresql redis-server git
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### Hardver ajánlás
- **CPU**: 4+ mag (ajánlott: 8)
- **RAM**: 4+ GB (ajánlott: 8 GB)
- **HDD**: 20+ GB (ajánlott: 100 GB SSD)

---

## 🏗️ Technológiai Stack

### Backend
- **Framework**: Django 4.2 + Django REST Framework
- **WebSocket**: Daphne + Channels (PixiERP)
- **WSGI**: Gunicorn (PixInvoice)
- **Adatbázis**: PostgreSQL
- **Cache**: Redis
- **Autentikáció**: JWT (JSON Web Tokens)

### Frontend
- **Framework**: React 18
- **UI Library**: 
  - PixiERP: Ant Design
  - PixInvoice: styled-components
- **State Management**: React Query
- **Routing**: React Router

### DevOps
- **Web Server**: Nginx
- **Process Manager**: Systemd
- **SSL**: Let's Encrypt (Certbot)

---

## 📂 Projekt Struktúra

```
pixisys/
├── pixierp/                    # ERP rendszer
│   ├── manage.py
│   ├── requirements.txt
│   ├── env.example
│   ├── erp_system/            # Django projekt
│   ├── apps/                  # ERP modulok
│   │   ├── core/
│   │   ├── hr/
│   │   ├── sales/
│   │   ├── manufacturing/
│   │   ├── finance/
│   │   ├── crm/
│   │   ├── orders/
│   │   └── pos/
│   └── frontend/              # React frontend
│       ├── src/
│       └── package.json
├── pixinvoice/                # Számlázó rendszer
│   ├── invoice_app/           # Django backend
│   │   ├── manage.py
│   │   ├── requirements.txt
│   │   ├── .env.example
│   │   └── invoices/
│   └── frontend/              # React frontend
│       ├── src/
│       └── package.json
├── install.sh                 # Automatikus telepítő ⭐
├── start.sh                   # Gyors indító script
├── INSTALL.md                 # Telepítési útmutató
├── QUICKSTART.md              # Gyors útmutató
└── README.md                  # Ez a fájl
```

---

## 🎮 Használat

### Fejlesztői mód

#### PixiERP indítása

```bash
# Backend (Terminál 1)
cd pixierp
source venv/bin/activate
python manage.py runserver 0.0.0.0:8003

# Frontend (Terminál 2)
cd pixierp/frontend
PORT=3000 npm start
```

Vagy gyors script:
```bash
cd pixierp
./start_backend.sh   # Terminál 1
./start_frontend.sh  # Terminál 2
```

#### PixInvoice indítása

```bash
# Backend (Terminál 3)
cd pixinvoice/invoice_app
source venv/bin/activate
python manage.py runserver 0.0.0.0:4001

# Frontend (Terminál 4)
cd pixinvoice/frontend
PORT=4000 npm start
```

Vagy gyors script:
```bash
cd pixinvoice
./start_backend.sh   # Terminál 3
./start_frontend.sh  # Terminál 4
```

#### Mindkettő egyszerre (root könyvtárból)

```bash
./start.sh
```

Ez automatikusan indítja mind a 4 komponenst háttérfolyamatként.

### Termelési mód

Részletes leírás: [INSTALL.md](INSTALL.md#7-termelési-telepítés-production)

```bash
# Systemd szolgáltatások
sudo systemctl start pixierp-backend
sudo systemctl start pixinvoice-backend
sudo systemctl start nginx

# Állapot ellenőrzése
sudo systemctl status pixierp-backend
sudo systemctl status pixinvoice-backend
```

---

## 🔌 API Végpontok

### PixiERP API
- **Base URL**: http://localhost:8003/api/
- **Admin**: http://localhost:8003/admin/
- **WebSocket**: ws://localhost:8003/ws/

Főbb végpontok:
- `/api/hr/employees/` - Alkalmazottak
- `/api/sales/leads/` - Leadek
- `/api/manufacturing/products/` - Termékek
- `/api/finance/invoices/` - Számlák
- `/api/crm/customers/` - Ügyfelek

### PixInvoice API
- **Base URL**: http://localhost:4001/api/
- **Admin**: http://localhost:4001/admin/

Főbb végpontok:
- `/api/invoices/` - Számlák
- `/api/customers/` - Ügyfelek
- `/api/companies/` - Cégek
- `/api/invoice-blocks/` - Számlatömbök
- `/api/vat-types/` - ÁFA típusok

---

## 🧪 Tesztelés

### Backend tesztek

```bash
# PixiERP
cd pixierp
source venv/bin/activate
python manage.py test

# PixInvoice
cd pixinvoice/invoice_app
source venv/bin/activate
python manage.py test
```

### Frontend tesztek

```bash
# PixiERP Frontend
cd pixierp/frontend
npm test

# PixInvoice Frontend
cd pixinvoice/frontend
npm test
```

---

## 📦 Adatbázis Kezelés

### Backup

```bash
# PixiERP
pg_dump -U pixierp_user pixierp_db > backup_erp_$(date +%Y%m%d).sql

# PixInvoice
pg_dump -U pixinvoice_user pixinvoice_db > backup_invoice_$(date +%Y%m%d).sql
```

### Restore

```bash
# PixiERP
psql -U pixierp_user pixierp_db < backup_erp_20260107.sql

# PixInvoice
psql -U pixinvoice_user pixinvoice_db < backup_invoice_20260107.sql
```

### Migrációk

```bash
# PixiERP
cd pixierp
source venv/bin/activate
python manage.py makemigrations
python manage.py migrate

# PixInvoice
cd pixinvoice/invoice_app
source venv/bin/activate
python manage.py makemigrations
python manage.py migrate
```

---

## 🔧 Konfiguráció

### Környezeti változók

Mindkét rendszer `.env` fájlokban tárolja a konfigurációt:

**PixiERP**: `pixierp/.env`
**PixInvoice**: `pixinvoice/invoice_app/.env`

Példa fájlok:
- `pixierp/env.example`
- `pixinvoice/invoice_app/.env.example`

Fontos beállítások:
- `SECRET_KEY` - Django titkos kulcs
- `DEBUG` - Debug mód (False termelésben!)
- `ALLOWED_HOSTS` - Engedélyezett domain-ek
- `DB_*` - Adatbázis beállítások
- `REDIS_*` - Redis beállítások (PixiERP)
- `SMTP_*` - Email beállítások

---

## 🛠️ Fejlesztés

### Új PixiERP modul hozzáadása

```bash
cd pixierp/apps
python ../manage.py startapp your_module
```

Majd add hozzá az `INSTALLED_APPS`-hoz az `erp_system/settings.py`-ban.

### Új Django model létrehozása

```bash
cd pixierp  # vagy pixinvoice/invoice_app
source venv/bin/activate
python manage.py makemigrations
python manage.py migrate
```

### Frontend komponens fejlesztés

```bash
# PixiERP
cd pixierp/frontend/src/components
# Hozz létre új komponenst

# PixInvoice
cd pixinvoice/frontend/src/pages
# Hozz létre új oldalt
```

---

## 🔒 Biztonság

### Termelési környezetben kötelező

- ✅ `DEBUG=False` beállítás
- ✅ Erős `SECRET_KEY` használata
- ✅ HTTPS konfiguráció (SSL/TLS)
- ✅ Erős adatbázis jelszavak
- ✅ Firewall beállítás
- ✅ Redis jelszó védelem
- ✅ Rendszeres biztonsági frissítések
- ✅ Rendszeres backup-ok

### Biztonsági funkciók

- JWT autentikáció
- CORS védelem
- CSRF védelem
- SQL injection védelem (Django ORM)
- XSS védelem (React)
- Password hashing (Django bcrypt)

---

## 📊 Monitoring és Logging

### Logok helye

**PixiERP**:
- `pixierp/logs/django.log`
- Systemd: `journalctl -u pixierp-backend -f`

**PixInvoice**:
- `pixinvoice/invoice_app/logs/`
- Systemd: `journalctl -u pixinvoice-backend -f`

**Nginx**:
- `/var/log/nginx/access.log`
- `/var/log/nginx/error.log`

### Monitoring eszközök (opcionális)

- **Sentry** - Error tracking
- **Prometheus + Grafana** - Metrikák
- **ELK Stack** - Log aggregáció

---

## 🤝 Hozzájárulás

Szívesen fogadunk hozzájárulásokat! 

1. Fork-old a projektet
2. Hozz létre egy feature branch-et (`git checkout -b feature/AmazingFeature`)
3. Commit-old a változásokat (`git commit -m 'Add some AmazingFeature'`)
4. Push-old a branch-et (`git push origin feature/AmazingFeature`)
5. Nyiss egy Pull Request-et

---

## 📝 Verziókezelés

A projekt [Semantic Versioning](https://semver.org/) szabványt követi.

Jelenlegi verzió: **1.0.0**

Changelog: 
- PixiERP: Nincs külön changelog
- PixInvoice: [CHANGELOG.md](pixinvoice/CHANGELOG.md)

---

## 📞 Támogatás

### Dokumentáció
- [QUICKSTART.md](QUICKSTART.md) - Gyors kezdés
- [INSTALL.md](INSTALL.md) - Telepítési útmutató
- [pixierp/README.md](pixierp/README.md) - PixiERP dokumentáció
- [pixinvoice/README.md](pixinvoice/README.md) - PixInvoice dokumentáció

### Kapcsolat
- **Email**: support@pixisys.eu
- **GitHub Issues**: https://github.com/czbhu/pixisys/issues
- **Wiki**: https://github.com/czbhu/pixisys/wiki

---

## 📜 Licenc

Ez a projekt a MIT License alatt van kiadva.

---

## 👥 Készítők

**Pixi Systems Team**
- Fejlesztés, dizájn, támogatás

---

## 🙏 Köszönetnyilvánítás

Köszönjük az alábbi open-source projekteknek:
- Django & Django REST Framework
- React & React Router
- PostgreSQL
- Redis
- Ant Design
- Nginx
- És minden más felhasznált library

---

## 📈 Roadmap

### Tervezett funkciók

**PixiERP**:
- [ ] Többnyelvűség (i18n)
- [ ] Fejlett jogosultságkezelés
- [ ] Mobilalkalmazás
- [ ] AI-alapú előrejelzések
- [ ] Bővített reporting

**PixInvoice**:
- [ ] Recurring számlák
- [ ] Online fizetés integráció
- [ ] Multicolory/multilanguage számla sablonok
- [ ] Ügyfél portál
- [ ] API dokumentáció (Swagger)

---

**Készítve ❤️-vel Magyarországon**

**Utolsó frissítés**: 2026. január 7.
