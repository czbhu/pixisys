# ✅ Deploy Ellenőrző Lista

## 📋 Pre-Deploy Checklist

### 1. Fájlok Ellenőrzése
- [x] `/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/nav_api_views.py` módosítva
  - [x] `parse_nav_taxpayer_response()` függvény létrehozva
  - [x] `lookup_taxpayer()` refaktorálva
  - [x] Python szintaxis ellenőrizve ✅

- [x] `/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/import_views.py` módosítva
  - [x] Import hozzáadva: `from invoices.views.nav_api_views import parse_nav_taxpayer_response`
  - [x] NAV validálási logika átírva
  - [x] CSV fallback logika javítva
  - [x] Python szintaxis ellenőrizve ✅

- [x] Dokumentáció létrehozva
  - [x] `CSV_IMPORT_NAV_UPDATE.md`
  - [x] `OSSZEFOGLALO_NAV_IMPORT_JAVITAS.md`
  - [x] `VIZUALIZACIO_VALTOZASOK.md`
  - [x] `test_nav_parsing.py`

### 2. Teszt Futtatása
- [x] `python3 test_nav_parsing.py` - ✅ Minden teszt sikeres

### 3. Kód Review
- [x] Namespace kezelés helyes (teljes URI-k)
- [x] Hibakezelés megfelelő (try-except blokkok)
- [x] Logging hozzáadva (debug célokra)
- [x] Nincs duplikált kód
- [x] DRY elv betartva

## 🚀 Deploy Lépések

### 1. Backup Készítése (FONTOS!)
```bash
# Backend kód backup
cd /home/ceze/pixisys/pixinvoice/invoice_app
tar -czf backup_before_nav_fix_$(date +%Y%m%d_%H%M%S).tar.gz invoices/views/

# Vagy használd a projekt backup scriptjét
cd /home/ceze/pixisys/pixinvoice
./backup.sh  # ha létezik
```

### 2. Változtatások Ellenőrzése
```bash
cd /home/ceze/pixisys/pixinvoice/invoice_app

# Módosított fájlok listázása
git status
# vagy
ls -la invoices/views/nav_api_views.py
ls -la invoices/views/import_views.py
```

### 3. Szerver Újraindítás
```bash
# Backend restart (ha szükséges)
cd /home/ceze/pixisys/pixinvoice
./stop_backend.sh  # ha létezik
./start_backend.sh  # ha létezik

# Vagy Django restart
sudo systemctl restart pixinvoice  # ha systemd service
# vagy
pkill -f "python.*manage.py runserver"
python3 manage.py runserver 0.0.0.0:8001 &  # vagy az aktuális port
```

### 4. Smoke Test (Gyors Ellenőrzés)
```bash
# Ellenőrizd, hogy a szerver fut
curl http://localhost:8001/api/customers/ 

# Nézd a logokat
tail -f /home/ceze/pixisys/pixinvoice/invoice_app/logs/django.log
# vagy
journalctl -u pixinvoice -f
```

## 🧪 Post-Deploy Tesztelés

### 1. API Végpont Teszt
Teszteld a `lookup_taxpayer` API-t:
```bash
# Készíts egy teszt kérést
curl -X POST http://localhost:8001/api/customers/lookup_taxpayer/ \
  -H "Content-Type: application/json" \
  -d '{"tax_number": "12345678", "company_id": null}'

# Várt válasz:
# {
#   "success": true,
#   "data": {
#     "taxpayer_name": "...",
#     "taxpayer_short_name": "...",
#     ...
#   }
# }
```

### 2. Ügyfél Szerkesztő Oldal Teszt
1. Nyisd meg: https://inv.pixisys.eu/customers/[UUID]/edit
2. Adj meg egy érvényes adószámot
3. Kattints "NAV Lekérdezés" gombra
4. Ellenőrizd, hogy minden mező kitöltődik ✅

### 3. CSV Import Teszt NAV Validációval

#### Teszt CSV Készítése
Készíts egy `teszt_import.csv` fájlt:
```csv
Név,Rövid név,Adószám (8 jegyű),Város,Irányítószám,Ország,E-mail,Telefon,ÁFA kód,Megyekód,Adóalanyiság (DOMESTIC/PRIVATE_PERSON/OTHER),EU adószám,Fizetési határidő (nap),Utca név,Közterület jellege,Házszám,Épület,Lépcsőház,Emelet,Ajtó,Cím,ÁFA csoport ID,ÁFA csoport tag adószám
CSV Teszt Kft.,CSV Teszt,12345678,,,Hungary,teszt@email.com,+36301234567,,,DOMESTIC,,8,,,,,,,,,
```

#### Import Futtatása
1. Beállítások > CSV Adatimport
2. Válaszd ki a `teszt_import.csv` fájlt
3. **Kapcsold BE a "NAV validáció" opciót** ✅
4. Válaszd ki a company-t
5. Kattints "Import" gombra

#### Eredmény Ellenőrzése
Várt eredmény:
```
✅ Import befejezve: 1 cég importálva, ebből 1 cég adatait frissítette a NAV

Ellenőrizd az importált ügyfélnél:
- Név: NAV-ból ✅ (nem "CSV Teszt Kft.")
- Város: NAV-ból ✅ (pl. "Budapest", nem üres)
- Irányítószám: NAV-ból ✅ (pl. "1011")
- Utca név: NAV-ból ✅
- ÁFA kód: NAV-ból ✅
- Megyekód: NAV-ból ✅
- E-mail: CSV-ből ✅ ("teszt@email.com")
- Telefon: CSV-ből ✅ ("+36301234567")
```

### 4. Összehasonlító Teszt

**Ugyanazzal az adószámmal:**

1. **Ügyfél szerkesztő oldalon NAV lekérdezés:**
   - Eredmény: JSON mentése (`nav_lookup_result.json`)

2. **CSV import NAV validációval:**
   - Eredmény: Importált ügyfél megtekintése
   
3. **Összehasonlítás:**
   - MINDEN mezőnek AZONOSNAK kell lennie! ✅

## ⚠️ Lehetséges Problémák és Megoldások

### Probléma 1: ImportError
```python
ImportError: cannot import name 'parse_nav_taxpayer_response' from 'invoices.views.nav_api_views'
```

**Megoldás:**
```bash
# Ellenőrizd, hogy a fájl létezik és helyes
cat /home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/nav_api_views.py | grep "def parse_nav_taxpayer_response"

# Python cache törlése
find /home/ceze/pixisys/pixinvoice -name "*.pyc" -delete
find /home/ceze/pixisys/pixinvoice -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null

# Szerver restart
./restart_backend.sh
```

### Probléma 2: NAV Adatok Még Mindig Nem Töltődnek Ki
```
CSV import után még mindig a CSV adatok látszanak
```

**Ellenőrzés:**
```bash
# Nézd a logokat
tail -f /home/ceze/pixisys/pixinvoice/invoice_app/logs/django.log | grep "NAV validation"

# Várt log bejegyzések:
# "Set customer name from NAV: TESZT Kft."
# "NAV validation successful for 12345678"
```

**Debug:**
- Ellenőrizd, hogy a "NAV validáció" kapcsoló BE van-e kapcsolva az import során
- Ellenőrizd, hogy a `company_id` helyesen van-e átadva
- Ellenőrizd, hogy van aktív NAV konfiguráció

### Probléma 3: XML Parsing Error
```
XML parsing error: ...
```

**Ellenőrzés:**
```bash
# Futtasd a teszt scriptet
cd /home/ceze/pixisys/pixinvoice
python3 test_nav_parsing.py

# Ha sikeres, a probléma a NAV API válaszban van, nem a parsing logikában
```

## 📊 Monitoring

### Naplózás Ellenőrzése
```bash
# Nézd a NAV lekérdezéseket a logban
tail -n 100 /home/ceze/pixisys/pixinvoice/invoice_app/logs/django.log | grep "NAV"

# Keresett bejegyzések:
# "NAV validation successful for..."
# "Set customer name from NAV: ..."
# "Import row X (12345678): NAV updated=True, name=..."
```

### Sikeres Import Jelei
```
✅ "nav_found_count" > 0
✅ "NAV validation successful for X"
✅ Log tartalmazza: "Set customer name from NAV"
✅ Importált ügyfél neve egyezik a NAV lekérdezés eredményével
```

## 🎉 Sikeres Deploy Kritériumai

- [x] Backend újraindult hiba nélkül
- [ ] `lookup_taxpayer` API működik
- [ ] Ügyfél szerkesztő oldal NAV lekérdezés működik
- [ ] CSV import NAV validációval működik
- [ ] CSV import NAV adatokat használ (nem a CSV-t)
- [ ] Minden mező helyesen kitöltve a NAV-ból
- [ ] Összehasonlítás: ügyfél szerkesztő == CSV import ✅

## 📞 Kapcsolat / Support

Ha bármi probléma merül fel:
1. Nézd a logokat először
2. Futtasd a `test_nav_parsing.py` scriptet
3. Ellenőrizd a fenti hibaelhárítási lépéseket
4. Készíts screenshot-okat és log részleteket

---

**Utolsó frissítés:** 2026-01-14  
**Verzió:** 1.0  
**Fejlesztő:** GitHub Copilot
