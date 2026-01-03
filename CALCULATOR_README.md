# Kalkulátor Rendszer - Dokumentáció

## Áttekintés

A kalkulátor rendszer lehetővé teszi egyedi gyártású termékek árazását sablon alapján. Pl. molinó nyomtatás esetén megadható a méret, darabszám, alapanyag és szolgáltatások, majd a rendszer kiszámítja a bekerülési és eladási árat.

## Backend Modellek

### 1. Material (Warehouse app - kiterjesztett)

**Új mezők:**
- `material_format`: Anyagformátum (tekercses, táblás, darabos, ömlesztett)
- `roll_width`: Tekercs szélesség (cm)
- `sheet_division`: Tábla oszthatóság (csak egész, 1/2, 1/3)
- `yield_percentage`: Kihozatal % (pl. 95% = 5% hulló)

**Példa:**
```python
Material.objects.create(
    name="510gr Frontlit ponyva",
    code="FRONTLIT_510",
    material_format="roll",
    roll_width=320,  # 3.2m széles
    yield_percentage=95.00,
    unit="m"
)
```

### 2. Service (Manufacturing app - új)

Gyártási szolgáltatások kezelése (munkadíjak, utómunka).

**Mezők:**
- `name`: Szolgáltatás neve
- `code`: Egyedi kód
- `unit`: Mértékegység (db, m, m², kg, óra, kerület)
- `calculation_basis`: Kalkuláció alapja (fix, terület, kerület, hossz, súly, darabszám)
- `unit_price`: Egységár (nettó)
- `category`: Kategória (pl. Nyomtatás, Utómunka, Szállítás)

**Példa:**
```python
Service.objects.create(
    name="Nyomtatás CMYK",
    code="PRINT_CMYK",
    unit="m2",
    calculation_basis="area",
    unit_price=1500,
    category="Nyomtatás"
)
```

### 3. CalculatorTemplate (Manufacturing app - új)

Kalkulátor sablonok (pl. molinó nyomtatás, matrica, stb.)

**Mezők:**
- `name`: Sablon neve
- `code`: Egyedi kód
- `allowed_materials`: Megengedett alapanyagok (ManyToMany)
- `allowed_services`: Megengedett szolgáltatások (ManyToMany)
- `default_markup_percentage`: Alapértelmezett haszonkulcs %
- `input_fields`: Bemenet mezők JSON formátumban

**Példa:**
```python
template = CalculatorTemplate.objects.create(
    name="Molinó nyomtatás",
    code="MOLINO_PRINT",
    default_markup_percentage=35.00
)
template.allowed_materials.add(frontlit, kamion)
template.allowed_services.set(services)
```

### 4. Calculation (Manufacturing app - új)

Végrehajtott kalkulációk mentése.

**Mezők:**
- `template`: Használt sablon (FK)
- `input_values`: Bemenet értékek JSON (szélesség, magasság, darabszám)
- `selected_materials`: Kiválasztott alapanyagok JSON
- `selected_services`: Kiválasztott szolgáltatások JSON
- `material_cost`: Alapanyag költség
- `service_cost`: Szolgáltatás költség
- `total_cost`: Össz bekerülési ár
- `markup_percentage`: Haszonkulcs %
- `selling_price`: Eladási ár
- `quote_reference`: Ajánlat referencia (string)

**Számítási logika:**
```python
total_cost = material_cost + service_cost
selling_price = total_cost * (1 + markup_percentage / 100)
```

## API Endpointok

### Szolgáltatások
- `GET /api/v1/manufacturing/services/` - Lista
- `POST /api/v1/manufacturing/services/` - Új szolgáltatás
- `GET /api/v1/manufacturing/services/{id}/` - Részletek
- `PUT /api/v1/manufacturing/services/{id}/` - Módosítás
- `DELETE /api/v1/manufacturing/services/{id}/` - Törlés

### Kalkulátor sablonok
- `GET /api/v1/manufacturing/calculator-templates/` - Lista
- `POST /api/v1/manufacturing/calculator-templates/` - Új sablon
- `GET /api/v1/manufacturing/calculator-templates/{id}/` - Részletek
- `PUT /api/v1/manufacturing/calculator-templates/{id}/` - Módosítás
- `DELETE /api/v1/manufacturing/calculator-templates/{id}/` - Törlés
- `POST /api/v1/manufacturing/calculator-templates/{id}/calculate/` - Kalkuláció végrehajtása

### Kalkulációk
- `GET /api/v1/manufacturing/calculations/` - Lista
- `POST /api/v1/manufacturing/calculations/` - Új kalkuláció mentése
- `GET /api/v1/manufacturing/calculations/{id}/` - Részletek
- `POST /api/v1/manufacturing/calculations/{id}/recalculate/` - Újraszámítás

## Frontend Oldalak

### 1. Szolgáltatások kezelő
**Útvonal:** `/manufacturing/services`

Funkciók:
- Szolgáltatások listázása táblázatban
- Szűrés kategória és státusz alapján
- Új szolgáltatás létrehozása
- Szerkesztés
- Törlés

### 2. Kalkulátor sablonok
**Útvonal:** `/manufacturing/calculators`

Funkciók:
- Sablonok listázása
- Új sablon létrehozása
- Alapanyagok kiválasztása (Transfer komponens)
- Szolgáltatások kiválasztása (Transfer komponens)
- Sablon szerkesztése/törlése
- "Használ" gomb → kalkulátor oldalra navigálás

### 3. Kalkulátor használat
**Útvonal:** `/manufacturing/calculator/:templateId`

Funkciók:
- Paraméterek megadása (szélesség, magasság, darabszám)
- Alapanyagok hozzáadása/eltávolítása
- Szolgáltatások hozzáadása/eltávolítása
- Automatikus mennyiség számítás:
  - Tekercses anyag → folyóméter (terület / tekercs szélesség)
  - Táblás anyag → négyzetméter
  - Szolgáltatások → kalkuláció alapja szerint (terület, kerület, stb.)
- Valós idejű árkalkuláció
- Haszonkulcs % állítása
- Kalkuláció mentése

**Számítási példa (molinó):**
```
Méret: 200cm × 100cm
Darabszám: 5 db

Terület/db: 2m × 1m = 2 m²
Össz terület: 2 m² × 5 db = 10 m²

Alapanyag (Frontlit 320cm széles, 95% kihozatal):
  Nettó terület: 10 m² / 0.95 = 10.53 m²
  Folyóméter: 10.53 m² / 3.2m = 3.29 fm
  Ár: 3.29 fm × 1000 HUF/fm = 3290 HUF

Szolgáltatás (CMYK nyomtatás 1500 HUF/m²):
  10 m² × 1500 HUF/m² = 15000 HUF

Szolgáltatás (Ringlizés 50cm, 200 HUF/fm kerület):
  Kerület/db: 2×(2m + 1m) = 6m
  Össz kerület: 6m × 5db = 30m
  Ár: 30m × 200 HUF/m = 6000 HUF

Összesen:
  Alapanyag: 3290 HUF
  Szolgáltatások: 21000 HUF
  Bekerülés: 24290 HUF
  Haszonkulcs: 35%
  Eladási ár: 24290 × 1.35 = 32792 HUF
```

## Menü struktúra

**Gyártás menü:**
- Egyedi gyártás
- Termékkategóriák
- **Szolgáltatások** ← ÚJ
- **Kalkulátorok** ← ÚJ
- BOM-ok
- Készlet
- Munkarendelések
- Minőségbiztosítás

## Használati útmutató

### 1. Szolgáltatások felvitele

1. Navigálj: Gyártás > Szolgáltatások
2. Kattints "Új szolgáltatás"
3. Add meg:
   - Név: pl. "Nyomtatás CMYK"
   - Kód: pl. "PRINT_CMYK"
   - Kategória: pl. "Nyomtatás"
   - Mértékegység: pl. "négyzetméter"
   - Kalkuláció alapja: pl. "Terület alapú"
   - Egységár: pl. 1500 HUF
4. Mentés

### 2. Alapanyagok konfigurálása

1. Navigálj: Raktár > Alapanyagok
2. Szerkeszd meg az alapanyagot
3. Állítsd be:
   - Anyagformátum: Tekercses / Táblás
   - Tekercs szélesség (ha tekercses): pl. 320 cm
   - Tábla oszthatóság (ha táblás): pl. "1/3, 1/2 és egész"
   - Kihozatal %: pl. 95% (5% hulló)

### 3. Kalkulátor sablon létrehozása

1. Navigálj: Gyártás > Kalkulátorok
2. Kattints "Új sablon"
3. Add meg:
   - Név: pl. "Molinó nyomtatás"
   - Kód: pl. "MOLINO_PRINT"
   - Haszonkulcs: pl. 35%
4. Válaszd ki:
   - Engedélyezett alapanyagokat (Transfer komponens)
   - Engedélyezett szolgáltatásokat (Transfer komponens)
5. Mentés

### 4. Kalkuláció végrehajtása

1. Navigálj: Gyártás > Kalkulátorok
2. Kattints "Használ" a kívánt sablonnál
3. Add meg a paramétereket:
   - Szélesség (cm)
   - Magasság (cm)
   - Darabszám
4. Válassz alapanyagot a legördülőből → hozzáadás
5. Válassz szolgáltatásokat → hozzáadás
6. A rendszer automatikusan számítja:
   - Anyag mennyiség (hullóval együtt)
   - Szolgáltatás mennyiség (terület/kerület/hossz alapján)
   - Bekerülési ár
   - Eladási ár (haszonkulccsal)
7. Szükség esetén módosítsd a haszonkulcsot
8. Kattints "Kalkuláció mentése"

### 5. Mentett kalkulációk megtekintése

1. Navigálj: Gyártás > Kalkulációk (API végponton keresztül)
2. Szűrés sablon alapján
3. Részletek megtekintése
4. Újraszámítás lehetőség

## Jövőbeli fejlesztések

### Alapanyag beszerzési ár kezelése
- MaterialSupplier táblából venni az aktuális beszerzési árat
- Automatikus anyagár számítás a kalkulációban

### Ajánlat integráció
- CRM Quote és QuoteItem modellek létrehozása
- Kalkulátor gomb az ajánlat tétel létrehozásakor
- Kalkulált ár automatikus átvétele ajánlatba
- Calculation → QuoteItem ForeignKey kapcsolat

### Kiterjesztett kalkuláció
- Súly alapú számítás (fajsúly × terület)
- Több alapanyag kombinálása egy termékben
- Komplexebb képletek (pl. extra hulló sarkoknál)
- Minimális megrendelési mennyiség kezelése

### Riportok
- Kalkulációk statisztikája
- Legnépszerűbb szolgáltatások
- Átlagos haszonkulcs termékenként
- Bekerülés vs. eladási ár elemzés

## Minta adatok

A rendszer tartalmaz egy előre konfigurált "Molinó nyomtatás" sablont:

**Alapanyagok:**
- 510gr Frontlit ponyva (320cm széles, 95% kihozatal)
- 900gr Kamion ponyva (250cm széles, 92% kihozatal)

**Szolgáltatások:**
- Nyomtatás CMYK (1500 HUF/m²)
- Nyomtatás CMYK+W (2000 HUF/m²)
- Méretre vágás (200 HUF/fm kerület)
- Ringlizés 25/50/100cm (200/150/100 HUF/fm)
- Szegés (250 HUF/fm)
- Bújtató (300 HUF/fm)
- Tekercsben (500 HUF/db)

## Technikai részletek

**Backend:**
- Django 4.2.7
- Django REST Framework
- JSON mezők a rugalmas adattároláshoz
- Automatikus árkalkuláció model save() metódusban

**Frontend:**
- React 18.2.0
- Ant Design 5.12.0
- TypeScript
- Real-time számítás useEffect hook-kal

**Adatbázis:**
- SQLite (production: PostgreSQL ajánlott)
- Migrációk: 0003_material_*, 0005_service_*

## Hibaelhárítás

**Problem:** Kalkuláció nem számít automatikusan
**Megoldás:** Ellenőrizd, hogy az alapanyagnak van-e kihozatal % és formátum beállítva

**Problem:** Szolgáltatás ár 0
**Megoldás:** Ellenőrizd a calculation_basis értéket, lehet hogy nem megfelelő a bemenet

**Problem:** Material supplier ár hiányzik
**Megoldás:** Jelenleg fix 1000 HUF/egység placeholder, szükséges MaterialSupplier ár implementálása

---

**Verzió:** 1.0  
**Utolsó frissítés:** 2026-01-03  
**Készítette:** GitHub Copilot
