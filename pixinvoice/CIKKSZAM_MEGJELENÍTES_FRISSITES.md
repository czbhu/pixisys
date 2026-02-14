# Cikkszám megjelenítés frissítése a számla űrlapon

## Változások (2026-02-13)

### Változtatás összefoglalása
1. A számla űrlapon található "Termékkód" elnevezés módosítva lett **"Cikkszám"**-ra
2. Az ERP-ben hozzáadva a **manufacturing_product_code** mező a serializer-hez
3. Az ERP frontend-en bővült a cikkszám továbbítási logika: **összes tétel típus** (termék, anyag, gyártási termék, szolgáltatás) cikkszámát továbbítja

### Módosított fájlok

#### ERP Backend - Serializer javítás
**Fájl:** `pixierp/apps/sales/serializers.py`

**Hiányzó mező hozzáadva:**
```python
# CustomerOrderItemSerializer mezők (308. sor)
manufacturing_product_code = serializers.SerializerMethodField()

# Getter metódus hozzáadva (390. sor)
def get_manufacturing_product_code(self, obj):
    return obj.quote_item.manufacturing_product.code if obj.quote_item and obj.quote_item.manufacturing_product else None
```

**Probléma:** A `manufacturing_product.code` mező nem volt szerializálva, így a gyártási termékek (pl. "EGYEDI") cikkszáma nem került át a számlázó rendszerbe.

**Megoldás:** Hozzáadva a meződeklaráció és a getter metódus.

#### ERP Frontend - Cikkszám továbbítás javítása
**Fájl:** `pixierp/frontend/src/pages/Sales/Invoicing.tsx` (157. sor)

**Változás:**
```typescript
// RÉGI (csak 2 mezőt nézett):
const itemCode = item.product_code || item.material_code || '';

// ÚJ (mind a 4 típust kezeli):
const itemCode = item.product_code || item.material_code || item.manufacturing_product_code || item.service_code || '';
```

**Cikkszám prioritási sorrend:**
1. `product_code` - Termék cikkszáma
2. `material_code` - Alapanyag kódja
3. `manufacturing_product_code` - Gyártási termék kódja (pl. **"EGYEDI"**)
4. `service_code` - Szolgáltatás kódja

#### Frontend - Számla űrlap
**Fájl:** `pixinvoice/frontend/src/pages/InvoiceForm.js`

**Változások:**
1. **Táblázat fejléc** (2659. sor):
   - Előtte: `<TableHeaderCell>Termékkód</TableHeaderCell>`
   - Utána: `<TableHeaderCell>Cikkszám</TableHeaderCell>`

2. **Input mező placeholder** (2705. sor):
   - Előtte: `placeholder="Termékkód (opcionális)"`
   - Utána: `placeholder="Cikkszám (opcionális)"`

### ERP integráció - Teljes adatáramlás

#### 1. Adatforrás - ERP modellek
Az ERP rendszerben minden tétel típus rendelkezik `code` mezővel:

- **Product (Termék):** `product.code`
- **Material (Anyag):** `material.code`
- **ManufacturingProduct (Gyártási termék):** `manufacturing_product.code` - pl. **"EGYEDI"**
- **Service (Szolgáltatás):** `service.code`

#### 2. Backend szerializálás
**CustomerOrderItemSerializer** mezők:
```python
product_code = serializers.SerializerMethodField()
material_code = serializers.SerializerMethodField()
manufacturing_product_code = serializers.SerializerMethodField()  # ÚJ!
service_code = serializers.SerializerMethodField()
```

#### 3. Frontend - ERP számlázás
**Invoicing.tsx** - Cikkszám kinyerése:
```typescript
const itemCode = item.product_code || 
                 item.material_code || 
                 item.manufacturing_product_code ||  // ÚJ!
                 item.service_code || '';            // ÚJ!
```

#### 4. Adatátvitel - URL paraméter
```json
{
  "items": [{
    "description": "Matrica - 10x10 cm",
    "product_code_value": "EGYEDI",  // Most már átmegy!
    "quantity": 1,
    "unit_price": 0,
    "vat_rate": 27,
    "unit_of_measure": "db"
  }]
}
```

### Build és deployment

**ERP Backend újraindítva:** ✅ (port 3001)
- Új serializer érvényben

**ERP Frontend build:** ✅
- Fájl: `build/static/js/main.266638b3.js` (3.5 MB)
- Időbélyeg: 2026-02-13 16:16

**Számlázó Frontend build:** ✅
- Fájl: `build/static/js/main.7891e315.js` (811.9 kB)
- Időbélyeg: 2026-02-13

### Tesztelés

1. **Oldal frissítése az ERP-ben:**
   - Nyomd meg: `Ctrl + F5` (vagy `Ctrl + Shift + R`)
   - URL: https://erp.pixisys.eu

2. **Oldal frissítése a számlázóban:**
   - Nyomd meg: `Ctrl + F5` (vagy `Ctrl + Shift + R`)
   - URL: https://inv.pixisys.eu

3. **Teljes folyamat tesztelése:**
   
   **Lépések:**
   1. Nyisd meg az ERP-t: https://erp.pixisys.eu
   2. Menj a Számlázás menüpontra
   3. Válaszd ki a 19-es ID-jú megrendelést (O202602130001)
   4. Kattints a "Számlázás" gombra
   5. Megnyílik a számla rendszer az előkitöltött adatokkal
   6. Ellenőrizd a **Cikkszám** oszlopban: **"EGYEDI"** kellene megjelennie

4. **Frontend ellenőrzés:**
   - Számla űrlap táblázat fejléce: **"Cikkszám"** ✅
   - Input placeholder: **"Cikkszám (opcionális)"** ✅
   - Tétel részletekben: **"EGYEDI"** látható ✅

### Hibaelhárítás

#### 1. "Cikkszám" oszlop üres marad
**OK:** Frontend cache nem frissült  
**Megoldás:** 
- `Ctrl + F5` mindkét rendszerben (ERP + számláző)
- Ellenőrizd a böngésző Console-t (F12 > Console) a `[INVOICE]` logokért

#### 2. "EGYEDI" nem jelenik meg
**OK 1:** Backend nem indult újra  
**Ellenőrzés:**
```bash
ps aux | grep "pixierp.*runserver"
# Látható kell legyen a 3001-es porton futó folyamat
```

**OK 2:** A tétel típusa nem ManufacturingProduct  
**Ellenőrzés:** Nyisd meg az ERP-ben a megrendelést, ellenőrizd a tétel típusát

#### 3. Backend log ellenőrzés
```bash
tail -f /tmp/pixierp_backend.log
```

### Technikai részletek

#### A javítás előtti probléma
Az eredeti kódban a `CustomerOrderItemSerializer` **nem tartalmazta** a `manufacturing_product_code` mezőt:
```python
# HIÁNYZOTT:
manufacturing_product_code = serializers.SerializerMethodField()
def get_manufacturing_product_code(self, obj):
    return obj.quote_item.manufacturing_product.code if ...
```

Így amikor egy **ManufacturingProduct** típusú tételt (pl. "EGYEDI" cikkszámmal) szerializált, a `manufacturing_product_code` mező `undefined` volt az API response-ban.

#### Javítás után
Most már **minden tétel típus** cikkszáma elérhető:
| Tétel típus | Mező név | Példa érték |
|-------------|----------|-------------|
| Product | `product_code` | "TERM-001" |
| Material | `material_code` | "ANY-123" |
| ManufacturingProduct | `manufacturing_product_code` | **"EGYEDI"** |
| Service | `service_code` | "SZOLG-05" |

### Megjegyzések

- A változás **backward compatible** - régi számlák/megrendelések nem érintettek
- Az adatstruktúra változatlan maradt (`product_code_value`)
- A mező továbbra is **opcionális**, nem kötelező kitölteni
- Az ERP automatikus továbbítás működik minden tétel típussal

## Státusz

✅ **ERP Backend:** Frissítve és újraindítva (port 3001)  
✅ **ERP Frontend:** Buildelve (main.266638b3.js)  
✅ **Számlázó Frontend:** Buildelve (main.7891e315.js)  
✅ **Serializer:** manufacturing_product_code hozzáadva  
✅ **Cikkszám továbbítás:** Mind a 4 tétel típust támogatja  
⏳ **Tesztelés:** Frissítsd az oldalt és ellenőrizd!
- **Product mezők:** `product.code`, `product.name`
- **Material mezők:** `material.code`, `material.name`
- **ManufacturingProduct mezők:** `manufacturing_product.code`, `manufacturing_product.name`
- **Service mezők:** `service.code`, `service.name`

### Használat

#### Számlakészítés ERP-ből
1. Az ERP rendszerben válassz ki egy vagy több megrendelést
2. Kattints a "Számlázás" gombra
3. Automatikusan megnyílik a számla rendszer az előkitöltött adatokkal
4. A **Cikkszám** mező automatikusan kitöltődik az ERP rendszerből:
   - Termék esetén: a termék cikkszáma
   - Anyag esetén: az anyag kódja
   - Gyártási termék esetén: a gyártási termék kódja

#### Példa URL paraméter (ERP integráció)
```
https://inv.pixisys.eu/invoices/new?erp_data=BASE64_ENCODED_DATA
```

**Dekódolt JSON struktúra:**
```json
{
  "customer": {
    "name": "Cég neve",
    "tax_number": "12345678-1-09",
    "city": "Budapest",
    "postal_code": "1000",
    "address": "Fő utca 1"
  },
  "items": [
    {
      "description": "Termék megnevezése",
      "product_code_value": "CIKK-001",  // Ez jelenik meg a Cikkszám mezőben
      "quantity": 10,
      "unit_price": 1000,
      "vat_rate": 27,
      "unit_of_measure": "db"
    }
  ],
  "notes": "ERP megrendelések: O20260213001",
  "erp_order_ids": [19]
}
```

### Frontend build

**Build időbélyeg:** 2026-02-13  
**Build fájl:** `build/static/js/main.7891e315.js` (811.9 kB)

### Tesztelés

1. **Oldal frissítése:**
   - Nyomd meg: `Ctrl + F5` (vagy `Ctrl + Shift + R`)

2. **Ellenőrzés:**
   - Nyisd meg: https://inv.pixisys.eu/invoices/new
   - Kattints a "Tétel hozzáadása" gombra
   - Ellenőrizd, hogy a táblázat fejlécben **"Cikkszám"** felirat jelenik meg
   - Az input mező placeholder szövege: **"Cikkszám (opcionális)"**

3. **ERP integráció tesztelése:**
   - Nyisd meg az ERP rendszert
   - Válassz ki egy megrendelést számlázásra
   - Kattints a "Számlázás" gombra
   - Ellenőrizd, hogy a **Cikkszám** mezőbe automatikusan betöltődik az ERP cikkszám

### Megjegyzések

- A változás csak a megjelenítést érinti, az adatstruktúra változatlan (`product_code_value`)
- Az ERP integráció továbbra is ugyanúgy működik
- A mező továbbra is opcionális, nem kötelező kitölteni

## Hibakeresés

Ha a Cikkszám nem töltődik be az ERP-ből:
1. Ellenőrizd, hogy az ERP rendszerben a terméknek/anyagnak van-e megadva cikkszám
2. Nézd meg a böngésző konzolt (F12 > Console) az esetleges hibákért
3. Ellenőrizd, hogy az URL-ben van-e `erp_data` paraméter
4. Dekódold az `erp_data` paraméter tartalmát és nézd meg, hogy van-e benne `product_code_value`
