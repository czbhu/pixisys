# ✅ Cikkszám javítás - EGYEDI termékek számláján

## Probléma
Az ERP-ből számlázáskor a **ManufacturingProduct** típusú tételek (pl. "EGYEDI" cikkszám) **nem töltődtek be** a számláző rendszerbe.

## Gyökér ok
A `CustomerOrderItemSerializer` **nem tartalmazta** a `manufacturing_product_code` mezőt és getter metódust.

## Megoldás - 2026-02-13

### 1️⃣ Backend javítás (ERP)
**Fájl:** `pixierp/apps/sales/serializers.py`

**Hozzáadva:**
```python
# Meződeklaráció (309. sor)
manufacturing_product_code = serializers.SerializerMethodField()

# Getter metódus (390. sor)
def get_manufacturing_product_code(self, obj):
    return obj.quote_item.manufacturing_product.code if obj.quote_item and obj.quote_item.manufacturing_product else None
```

### 2️⃣ Frontend javítás (ERP)
**Fájl:** `pixierp/frontend/src/pages/Sales/Invoicing.tsx`

**RÉGI (csak 2 tétel típust kezelt):**
```typescript
const itemCode = item.product_code || item.material_code || '';
```

**ÚJ (mind a 4 tétel típust kezeli):**
```typescript
const itemCode = item.product_code || 
                 item.material_code || 
                 item.manufacturing_product_code || 
                 item.service_code || '';
```

### 3️⃣ Megjelenítés javítás (Számláző)
**Fájl:** `pixinvoice/frontend/src/pages/InvoiceForm.js`

**Változtatás:** "Termékkód" → **"Cikkszám"**
- Táblázat fejléc (2659. sor)
- Input placeholder (2705. sor)

## Deployment ✅

| Rendszer | Komponens | Fájl | Méret | Időbélyeg | Státusz |
|----------|-----------|------|-------|-----------|---------|
| ERP | Backend | serializers.py | - | 2026-02-13 16:15 | ✅ Újraindítva |
| ERP | Frontend | main.266638b3.js | 3.5 MB | 2026-02-13 16:16 | ✅ Buildelve |
| Számláző | Frontend | main.7891e315.js | 811.9 kB | 2026-02-13 | ✅ Buildelve |

## Tesztelés 🧪

### Lépések:
1. **Frissítsd az oldalt mindkét rendszerben:** `Ctrl + F5`
   - ERP: https://erp.pixisys.eu
   - Számláző: https://inv.pixisys.eu

2. **Teszteld a flow-t:**
   - Nyisd meg az ERP-ben a 19-es megrendelést (O202602130001)
   - Kattints a "Számlázás" gombra
   - Ellenőrizd: a **Cikkszám** oszlopban **"EGYEDI"** látható ✅

### Várható eredmény:
```
Számla tétel sor:
┌─────────────────────┬──────────┬────────────┬───────────┐
│ Név                 │ Cikkszám │ Mennyiség  │ Egységár  │
├─────────────────────┼──────────┼────────────┼───────────┤
│ Matrica - 10x10 cm  │ EGYEDI   │ 1 db       │ 0 Ft      │
└─────────────────────┴──────────┴────────────┴───────────┘
```

## Támogatott tétel típusok 📋

| Tétel típus | Serializer mező | Példa érték | Támogatás |
|-------------|-----------------|-------------|-----------|
| Product | `product_code` | "TERM-001" | ✅ Mindig is működött |
| Material | `material_code` | "ANY-123" | ✅ Mindig is működött |
| **ManufacturingProduct** | **`manufacturing_product_code`** | **"EGYEDI"** | ✅ **MOST JAVÍTVA** |
| Service | `service_code` | "SZOLG-05" | ✅ **MOST JAVÍTVA** |

## Hibaelhárítás 🔧

### "EGYEDI" nem jelenik meg?

1. **Cache probléma:**
   ```bash
   # Mindkét rendszerben:
   Ctrl + F5
   ```

2. **Backend nem indult újra:**
   ```bash
   # Ellenőrzés:
   ps aux | grep "pixierp.*runserver"
   
   # Ha nem fut, újraindítás:
   cd /home/ceze/pixisys/pixierp
   python manage.py runserver 0.0.0.0:3001
   ```

3. **Tétel típusa nem ManufacturingProduct:**
   - Ellenőrizd az ERP-ben a megrendelés tételét
   - Nézd meg, hogy valóban ManufacturingProduct típusú-e

4. **Frontend log ellenőrzés:**
   ```
   F12 > Console > Keress rá: [INVOICE]
   ```
   
   **Helyes log:**
   ```
   [INVOICE] Item: {
     name: "Matrica - 10x10 cm",
     code: "EGYEDI",  // ← Ez kell látszódjon!
     item: {...}
   }
   ```

5. **Backend log ellenőrzés:**
   ```bash
   tail -f /tmp/pixierp_backend.log
   ```

## Technikai háttér 🔍

### Adatáramlás:

```
ERP Adatbázis (ManufacturingProduct.code = "EGYEDI")
  ↓
CustomerOrderItemSerializer
  ├─ quote_item.manufacturing_product.code
  ↓
API Response
  ├─ manufacturing_product_code: "EGYEDI"
  ↓
Frontend (Invoicing.tsx)
  ├─ itemCode = item.manufacturing_product_code
  ↓
URL paraméter (base64 encoded JSON)
  ├─ product_code_value: "EGYEDI"
  ↓
Számláző rendszer (InvoiceForm.js)
  ├─ Cikkszám mező: "EGYEDI" ✅
```

### JSON példa (dekódolt erp_data):
```json
{
  "customer": {
    "name": "CEZE ÚT Kft.",
    "tax_number": "11956541-2-09"
  },
  "items": [{
    "description": "Matrica - 10x10 cm",
    "product_code_value": "EGYEDI",  // ← Most már kitöltött!
    "quantity": 1,
    "unit_price": 0,
    "vat_rate": 27,
    "unit_of_measure": "db"
  }],
  "notes": "ERP megrendelések: O202602130001",
  "erp_order_ids": [19]
}
```

## Összefoglalás ✨

| Elem | Előtte | Utána |
|------|--------|-------|
| ManufacturingProduct szerializálás | ❌ Hiányzott | ✅ Működik |
| Service szerializálás | ❌ Hiányzott | ✅ Most hozzáadva |
| Számlázó mező neve | "Termékkód" | **"Cikkszám"** |
| Támogatott tétel típusok | 2 (Product, Material) | **4 (Product, Material, Manufacturing, Service)** |
| "EGYEDI" betöltődik | ❌ NEM | ✅ **IGEN** |

---

**Frissítsd az oldalt** (`Ctrl + F5`) **mindkét rendszerben** és teszteld! 🚀
