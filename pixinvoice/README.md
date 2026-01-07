# PixInvoice - Számlázó Alkalmazás

Modern számlázó alkalmazás React frontenddel és Django backenddel, NAV Online Számla rendszerrel integrálva.

## Funkciók

### Backend (Django)
- **Számla kezelés**: Számlák létrehozása, szerkesztése, törlése
- **Ügyfél kezelés**: Ügyfelek adatainak kezelése NAV API integrációval
- **NAV integráció**: Automatikus adószám lekérdezés és adatok betöltése
- **REST API**: Teljes REST API a frontend számára
- **Admin felület**: Django admin felület a rendszer kezeléséhez

### Frontend (React)
- **Modern UI**: Responsive, modern felhasználói felület
- **Dashboard**: Áttekintő oldal statisztikákkal
- **Számla kezelés**: Számlák listázása, létrehozása, szerkesztése
- **Ügyfél kezelés**: Magyar/EU ügyfél kapcsolóval és NAV lekérdezéssel
- **NAV beállítások**: NAV API konfigurációk kezelése
- **Jelentések**: Részletes jelentések és diagramok

## Telepítés és futtatás

### Gyors telepítés automatikus scripttel

```bash
# Futtasd a telepítő scriptet
./install.sh
```

Ez a script automatikusan:
- Ellenőrzi a rendszerkövetelményeket
- Létrehozza a PostgreSQL adatbázist
- Telepíti a Python és Node.js függőségeket
- Konfigurálja a környezeti változókat
- Futtatja az adatbázis migrációkat
- Létrehoz egy admin felhasználót

### Részletes telepítési útmutató

A részletes, lépésről-lépésre telepítési útmutatóért lásd: [INSTALL.md](INSTALL.md)

Ez tartalmazza:
- Teljes rendszerkövetelmények
- Manuális telepítési lépések
- Termelési (production) környezet beállítása
- Nginx és Gunicorn konfiguráció
- SSL/HTTPS beállítás
- Hibaelhárítás

### Előfeltételek
- Python 3.8+
- Node.js 16+
- npm vagy yarn

### Backend telepítése

1. Navigálj a backend könyvtárba:
```bash
cd invoice_app
```

2. Hozz létre virtual environment-et:
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# vagy
venv\Scripts\activate  # Windows
```

3. Telepítsd a függőségeket:
```bash
pip install -r requirements.txt
```

4. Futtasd a migrációkat:
```bash
python manage.py migrate
```

5. Hozz létre egy superuser-t:
```bash
python manage.py createsuperuser
```

6. Indítsd el a Django szervert:
```bash
python manage.py runserver 0.0.0.0:4001
```

A backend a `http://localhost:4001` címen lesz elérhető.

### Frontend telepítése

1. Navigálj a frontend könyvtárba:
```bash
cd frontend
```

2. Telepítsd a függőségeket:
```bash
npm install
```

3. Indítsd el a React alkalmazást:
```bash
npm start
```

A frontend a `http://localhost:4000` címen lesz elérhető.

### Gyors indítás

Használd a mellékelt scripteket:

```bash
# Backend indítása
./start_backend.sh

# Frontend indítása (másik terminálban)
./start_frontend.sh
```

## NAV API integráció

### Főbb funkciók
- **Token Exchange**: NAV API token lekérése
- **Adószám lekérdezés**: Automatikus ügyfél adatok betöltése
- **Retry mechanizmus**: 5 próbálkozás inkonzisztens válaszok esetén
- **Magyar/EU ügyfél**: Különböző form mezők típus szerint

### Tesztelés
- Teszt adószám: `14987878`, `12482449`
- NAV API teszt környezet használata

## Licenc

MIT License
