# 🔧 CSV Import NAV Validáció Javítás - Összefoglaló

## ✅ Elvégzett Változtatások

### 1. Közös NAV XML Parsing Függvény
**Fájl:** `/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/nav_api_views.py`

Létrehoztunk egy új `parse_nav_taxpayer_response(xml_string)` függvényt, amely:
- ✅ Egységesen parszolja a NAV QueryTaxpayer XML válaszokat
- ✅ Teljes namespace URI-kat használ a helyes XML feldolgozáshoz
- ✅ Kivonatolja az összes adatot: név, cím, adószám részletek, ÁFA csoport
- ✅ Strukturált dictionary-t ad vissza

### 2. lookup_taxpayer API Refaktorálás
**Fájl:** `/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/nav_api_views.py`

- ✅ Törölve a duplikált XML parsing kód (~50 sor)
- ✅ Most a közös `parse_nav_taxpayer_response()` függvényt használja
- ✅ Egyszerűbb, tisztább kód
- ✅ Ugyanaz az eredmény, mint előtte

### 3. CSV Import NAV Validáció Átírás
**Fájl:** `/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/import_views.py`

- ✅ Importálja a közös `parse_nav_taxpayer_response()` függvényt
- ✅ Teljesen átírt NAV validálási logika (~150 sor)
- ✅ Ugyanazt a parsing metódust használja, mint a lookup_taxpayer
- ✅ Ugyanazt a mező-mapping logikát használja, mint a frontend

#### Javított Adatkezelés:
```python
# ELŐTTE: CSV adatok felülírták a NAV adatokat
customer_data['name'] = row.get('Név')  # ❌ mindig a CSV-ből
customer_data['city'] = row.get('Város')  # ❌ mindig a CSV-ből

# UTÁNA: NAV adatok prioritást kapnak
if 'name' not in customer_data:  # ✅ csak ha NAV nem adta
    customer_data['name'] = row.get('Név')
if 'city' not in customer_data:  # ✅ csak ha NAV nem adta
    customer_data['city'] = row.get('Város')
```

## 📊 Adatok Prioritási Sorrendje

### 🥇 Elsődleges: NAV Adatok (ha validáció be van kapcsolva)
- **Név információk:** `name`, `short_name`
- **Adószám részletek:** `vat_code`, `county_code`
- **Cím mezők:** `postal_code`, `city`, `street_name`, `public_place_category`, `street_number`
- **Épület részletek:** `building`, `staircase`, `floor`, `door`
- **Teljes cím:** `address` (összerakott string)
- **Ország:** `country` (HU → "Magyarország")
- **ÁFA csoport:** `vat_group_id`, `vat_group_member_tax_number`

### 🥈 Másodlagos: CSV Adatok (fallback)
- Minden fenti mező, ha NAV nem adott értéket
- **Mindig CSV-ből:** `email`, `phone`, `vat_status`, `eu_tax_number`, `payment_due_days`

## 🎯 Főbb Előnyök

1. **✅ Konzisztens Működés**
   - Az ügyfél szerkesztő oldalon és CSV importnál UGYANAZ a logika
   - Ugyanazokat a mezőket töltik ki ugyanúgy

2. **✅ Helyes NAV Adatfeldolgozás**
   - Minden mező helyesen ki van töltve a NAV-ból
   - Ugyanaz a namespace handling, mint a működő API végpont

3. **✅ Karbantartható Kód**
   - Egy helyen van a NAV XML parsing logika
   - DRY (Don't Repeat Yourself) elv betartva
   - Könnyebb bugfixelés és továbbfejlesztés

4. **✅ Jobb Adatminőség**
   - NAV hivatalos adatai prioritást kapnak
   - CSV csak fallback, ha NAV nem elérhető

## 🧪 Tesztelés

### Automatikus Teszt
```bash
cd /home/ceze/pixisys/pixinvoice
python3 test_nav_parsing.py
```

**Eredmény:**
```
✅ taxpayer_name helyesen kiolvasva
✅ taxpayer_short_name helyesen kiolvasva
✅ taxpayerId helyesen kiolvasva
✅ vatCode helyesen kiolvasva
✅ countyCode helyesen kiolvasva
✅ Város helyesen kiolvasva: Budapest
✅ Irányítószám helyesen kiolvasva: 1011
✅ Utca név helyesen kiolvasva: Fő
✅ Közterület jellege helyesen kiolvasva: utca
```

### Manuális Teszt
1. **Ügyfél szerkesztő oldalon:**
   - Nyisd meg: https://inv.pixisys.eu/customers/[UUID]/edit
   - Adj meg egy adószámot (pl. 12345678)
   - Kattints a "NAV Lekérdezés" gombra
   - Jegyzd fel a kitöltött mezőket

2. **CSV Importnál:**
   - Készíts egy CSV-t ugyanazzal az adószámmal
   - Importáld be NAV validációval
   - Ellenőrizd, hogy UGYANAZOK a mezők ugyanúgy vannak kitöltve

## 📝 Használat

### CSV Import NAV Validációval
```bash
POST /api/import/customers/
Content-Type: multipart/form-data

file: ugyfel.csv
nav_validation: true
company_id: <company-uuid>
```

### CSV Formátum (példa)
```csv
Név,Rövid név,Adószám (8 jegyű),Város,Irányítószám,...
Példa Kft.,Példa,12345678,Budapest,1011,...
```

**Működés NAV validációval:**
1. CSV beolvasása
2. **NAV lekérdezés adószámmal** 
3. **NAV adatok feldolgozása** (új közös függvénnyel)
4. **NAV adatok betöltése** customer_data-ba
5. **CSV adatok hozzáadása** (csak hiányzó mezőkhöz)
6. Ügyfél mentése

## 🔍 Logolás

A debug logok segítenek követni a folyamatot:

```python
logger.info(f"Set customer name from NAV: {nav_data['taxpayer_name']}")
logger.info(f"NAV validation successful for {tax_number}, data: {customer_data.get('name')}")
logger.info(f"Import row {row_num} ({tax_number}): NAV updated={nav_updated}, name={customer_data.get('name')}")
```

## 📂 Módosított Fájlok

1. ✅ `/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/nav_api_views.py`
2. ✅ `/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/import_views.py`
3. ✅ `/home/ceze/pixisys/pixinvoice/CSV_IMPORT_NAV_UPDATE.md` (dokumentáció)
4. ✅ `/home/ceze/pixisys/pixinvoice/test_nav_parsing.py` (teszt script)

## ✨ Következő Lépések

1. **Deploy a változtatásokat** a szerverre
2. **Teszteld éles adatokkal** a CSV importot NAV validációval
3. **Ellenőrizd** az importált ügyfelek adatait
4. **Hasonlítsd össze** az ügyfél szerkesztő oldal NAV lekérdezésével

## 🎉 Összefoglalás

A CSV import most **ugyanazt a metódust használja**, mint a `https://inv.pixisys.eu/api/customers/lookup_taxpayer/` API végpont az ügyfél szerkesztési oldalon. Minden mező helyesen kitöltődik a NAV adatokkal, ahogy azt a felhasználó kérte.
