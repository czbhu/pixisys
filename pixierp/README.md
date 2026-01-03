# PixiERP - Enterprise Resource Planning

Egy teljes körű ERP rendszer Django + React technológiákkal, amely tartalmazza az összes főbb üzleti modult.

## 🚀 Funkciók

### Modulok
- **HR (Human Resources)** - Alkalmazottak, osztályok, jelenlét, bérszámfejtés, szabadságok
- **Sales (Értékesítés)** - Leadek, lehetőségek, árajánlatok, rendelések, előrejelzések
- **Manufacturing (Gyártás)** - Termékek, anyagjegyzékek, munkarendelések, készlet, minőségbiztosítás
- **Finance (Pénzügy)** - Számlák, fizetések, költségvetések, jelentések, számlák
- **CRM (Customer Relationship Management)** - Ügyfelek, kapcsolatok, tevékenységek, kampányok
- **Order Management (Rendeléskezelés)** - Rendelések, szállítások, visszaküldések, beszállítók
- **POS (Point of Sale)** - Eladások, termékek, ügyfelek, jelentések

### Technológiai stack
- **Backend**: Django 4.2 + Django REST Framework
- **Frontend**: React 18 + Ant Design
- **Adatbázis**: SQLite (fejlesztéshez), PostgreSQL (produkcióhoz)
- **Autentikáció**: JWT (JSON Web Tokens)
- **API**: RESTful API

## 📦 Telepítés

### Előfeltételek
- Python 3.8+
- Node.js 16+
- npm vagy yarn

### Backend telepítése

1. **Virtuális környezet létrehozása:**
```bash
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# vagy
venv\Scripts\activate  # Windows
```

2. **Függőségek telepítése:**
```bash
pip install -r requirements.txt
```

3. **Adatbázis migrálása:**
```bash
python manage.py makemigrations
python manage.py migrate
```

4. **Superuser létrehozása:**
```bash
python manage.py createsuperuser
```

5. **Szerver indítása:**
```bash
python manage.py runserver
```

### Frontend telepítése

1. **Függőségek telepítése:**
```bash
cd frontend
npm install
```

2. **Fejlesztői szerver indítása:**
```bash
npm start
```

## 🔧 Konfiguráció

1. **Környezeti változók beállítása:**
```bash
cp env.example .env
# Szerkeszd a .env fájlt a saját beállításaiddal
```

2. **Adatbázis konfigurálása:**
A `erp_system/settings.py` fájlban módosíthatod az adatbázis beállításokat.

## 🚀 Használat

1. **Backend indítása:**
```bash
python manage.py runserver
```
A backend elérhető lesz: http://localhost:8000

2. **Frontend indítása:**
```bash
cd frontend
npm start
```
A frontend elérhető lesz: http://localhost:3000

3. **Admin felület:**
http://localhost:8000/admin

## 📁 Projekt struktúra

```
pixierp/
├── erp_system/           # Django projekt beállítások
├── apps/                 # Django alkalmazások
│   ├── core/            # Alapvető funkciók (auth, user management)
│   ├── hr/              # HR modul
│   ├── sales/           # Sales modul
│   ├── manufacturing/   # Manufacturing modul
│   ├── finance/         # Finance modul
│   ├── crm/             # CRM modul
│   ├── orders/          # Order Management modul
│   └── pos/             # POS modul
├── frontend/            # React frontend
│   ├── src/
│   │   ├── components/  # React komponensek
│   │   ├── pages/       # Oldalak
│   │   ├── services/    # API szolgáltatások
│   │   └── contexts/    # React context-ek
│   └── public/
├── requirements.txt     # Python függőségek
├── package.json        # Node.js függőségek
└── README.md
```

## 🔐 Autentikáció

A rendszer JWT (JSON Web Tokens) alapú autentikációt használ:

- **Regisztráció**: `/api/v1/auth/register/`
- **Bejelentkezés**: `/api/v1/auth/login/`
- **Kijelentkezés**: `/api/v1/auth/logout/`
- **Profil**: `/api/v1/auth/profile/`

## 📊 API Dokumentáció

A REST API dokumentáció elérhető a következő címen:
- **Swagger UI**: http://localhost:8000/api/docs/
- **ReDoc**: http://localhost:8000/api/redoc/

## 🧪 Tesztelés

### Backend tesztek
```bash
python manage.py test
```

### Frontend tesztek
```bash
cd frontend
npm test
```

## 🚀 Produkcióba telepítés

1. **Backend telepítése:**
```bash
pip install gunicorn
gunicorn erp_system.wsgi:application
```

2. **Frontend build:**
```bash
cd frontend
npm run build
```

3. **Statikus fájlok összegyűjtése:**
```bash
python manage.py collectstatic
```

## 🤝 Hozzájárulás

1. Fork-old a projektet
2. Hozz létre egy feature branch-et (`git checkout -b feature/AmazingFeature`)
3. Commit-old a változásokat (`git commit -m 'Add some AmazingFeature'`)
4. Push-old a branch-et (`git push origin feature/AmazingFeature`)
5. Nyiss egy Pull Request-et

## 📝 Licenc

Ez a projekt MIT licenc alatt áll. Részletekért lásd a `LICENSE` fájlt.

## 📞 Kapcsolat

- **Projekt**: PixiERP
- **Verzió**: 1.0.0
- **Szerző**: Cursor IDE

## 🎯 Következő lépések

- [ ] Teljes API implementáció minden modulhoz
- [ ] Unit tesztek írása
- [ ] E2E tesztek implementálása
- [ ] Docker konténerizálás
- [ ] CI/CD pipeline beállítása
- [ ] Monitoring és logging
- [ ] Performance optimalizálás
- [ ] Mobil alkalmazás
- [ ] PWA támogatás