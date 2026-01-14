# CSV Import NAV Adatfrissítés Javítás

## Probléma
A CSV adatimport funkció nem használta ugyanazt a metódust a NAV adatok feldolgozásához, mint az ügyfél szerkesztő oldal NAV lekérdezése. Ez azt eredményezte, hogy:
- A CSV import nem töltötte ki helyesen az összes mezőt
- Különböző XML parsing logika volt használatban
- Az adatok nem konzisztensen lettek feldolgozva

## Megoldás

### 1. Közös XML Parsing Függvény
Létrehoztunk egy `parse_nav_taxpayer_response()` függvényt a `nav_api_views.py`-ban, amely:
- Egységesen parszolja a NAV XML választ
- Kivonatolja az összes releváns adatot (név, cím, adószám részletek, ÁFA csoport stb.)
- Használja a teljes namespace URI-kat a helyes XML feldolgozáshoz
- Visszaad egy strukturált dictionary-t a taxpayer adatokkal

### 2. lookup_taxpayer Frissítése
A `lookup_taxpayer` API végpont most a közös parsing függvényt használja:
- Törölve lett a duplikált XML parsing kód
- Használja a `parse_nav_taxpayer_response()` függvényt
- Garantálja a konzisztens adatformátumot

### 3. CSV Import Frissítése
A `import_customers` függvény most:
- Importálja és használja a közös `parse_nav_taxpayer_response()` függvényt
- Ugyanazt a logikát használja a NAV adatok feldolgozásához, mint a frontend
- Helyesen kezeli a prioritást: **NAV adatok > CSV adatok**
- Csak akkor használja a CSV mezőket, ha a NAV nem adott adatot

### Adatok Prioritási Sorrendje

#### NAV adatok (ha NAV validáció be van kapcsolva):
- `name` (taxpayer_name)
- `short_name` (taxpayer_short_name)
- `vat_code`, `county_code` (taxNumberDetail)
- Cím mezők: `postal_code`, `city`, `street_name`, `public_place_category`, `street_number`
- Épület részletek: `building`, `staircase`, `floor`, `door`
- `address` (teljes cím string)
- `country` (countryCode → magyar ország név)
- `vat_group_id`, `vat_group_member_tax_number` (vatGroupMembership)

#### CSV adatok (csak ha NAV nem adott adatot):
- Minden fenti mező fallback értéke
- `email` (NAV nem adja meg)
- `phone` (NAV nem adja meg)
- `vat_status` (NAV nem adja meg)
- `eu_tax_number` (NAV nem adja meg)
- `payment_due_days` (NAV nem adja meg)

## Változtatott Fájlok

1. **`/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/nav_api_views.py`**
   - Új `parse_nav_taxpayer_response()` függvény
   - `lookup_taxpayer` refaktorálva a közös függvény használatára

2. **`/home/ceze/pixisys/pixinvoice/invoice_app/invoices/views/import_views.py`**
   - Import hozzáadva: `from invoices.views.nav_api_views import parse_nav_taxpayer_response`
   - NAV validálási logika teljesen átírva
   - CSV fallback logika javítva (nem írja felül a NAV adatokat)

## Használat

### CSV Import NAV Validációval
A CSV importnál kapcsold be a "NAV validáció" opciót:
```
POST /api/import/customers/
- file: CSV fájl
- nav_validation: true
- company_id: <cég UUID>
```

### Működés
1. CSV soronként beolvasás
2. Ha NAV validáció be van kapcsolva:
   - NAV lekérdezés az adószámmal
   - XML válasz feldolgozása a közös függvénnyel
   - NAV adatok betöltése a customer_data dictionary-be
3. CSV adatok hozzáadása (csak ha NAV nem adott értéket)
4. Customer létrehozása/frissítése

## Előnyök
✅ Ugyanaz a logika mint az ügyfél szerkesztő oldalon  
✅ Konzisztens adatfeldolgozás  
✅ Minden mező helyesen kitöltve a NAV-ból  
✅ CSV adatok mint fallback  
✅ Karbantartható kód (egy helyen van a parsing logika)  
✅ Könnyebb hibakeresés és tesztelés  

## Tesztelés
1. Hozz létre egy teszt CSV-t egy érvényes magyar adószámmal
2. Importáld be NAV validációval
3. Ellenőrizd, hogy az összes mező (név, cím, ÁFA kód, stb.) helyesen ki van-e töltve
4. Hasonlítsd össze az ügyfél szerkesztő oldal NAV lekérdezésével - azonosnak kell lenniük
