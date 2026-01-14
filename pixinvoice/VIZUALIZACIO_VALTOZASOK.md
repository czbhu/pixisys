# 📊 Változások Vizualizáció

## Előtte vs. Utána

### 🔴 ELŐTTE - Probléma

```
┌─────────────────────────────────────────────────────────────┐
│  Ügyfél Szerkesztő Oldal                                    │
│  https://inv.pixisys.eu/customers/[UUID]/edit               │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  lookup_taxpayer API  │
        │  (nav_api_views.py)   │
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  NAV XML Parsing #1   │  ← Jól működik! ✅
        │  (egyedi logika)      │
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Minden mező OK! ✅   │
        └───────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│  CSV Import                                                  │
│  Beállítások > CSV Adatimport                               │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  import_customers     │
        │  (import_views.py)    │
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  NAV XML Parsing #2   │  ← NEM működik jól! ❌
        │  (ELTÉRŐ logika!)     │
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Hiányos adatok! ❌   │
        │  - Név hiányzik       │
        │  - Cím hiányos        │
        │  - Mezők rosszul      │
        └───────────────────────┘

❌ PROBLÉMA: Két különböző XML parsing logika!
❌ PROBLÉMA: CSV adatok felülírják a NAV adatokat!
```

### 🟢 UTÁNA - Megoldás

```
┌─────────────────────────────────────────────────────────────┐
│  KÖZÖS NAV XML PARSING FÜGGVÉNY                             │
│  parse_nav_taxpayer_response()                              │
│  (nav_api_views.py)                                         │
│                                                              │
│  ✅ Egy helyen a logika                                     │
│  ✅ Teljes namespace handling                               │
│  ✅ Minden adatot kivonatoló                                │
└─────────────────────────────────────────────────────────────┘
              ▲                           ▲
              │                           │
              │                           │
┌─────────────┴────────┐    ┌─────────────┴─────────┐
│  lookup_taxpayer API │    │  import_customers     │
│  (nav_api_views.py)  │    │  (import_views.py)    │
└──────────────────────┘    └───────────────────────┘
        │                           │
        ▼                           ▼
┌──────────────────────┐    ┌───────────────────────┐
│ Ügyfél Szerkesztő    │    │  CSV Import           │
│ Oldal                │    │  NAV Validáció        │
│                      │    │                       │
│ ✅ Minden mező OK    │    │  ✅ Minden mező OK    │
│ ✅ NAV adatok        │    │  ✅ NAV adatok        │
│ ✅ Konzisztens       │    │  ✅ Konzisztens       │
└──────────────────────┘    └───────────────────────┘

✅ MEGOLDÁS: Ugyanaz a parsing logika mindkét helyen!
✅ MEGOLDÁS: NAV adatok prioritást kapnak!
```

## 🔄 Adatfolyam Változás

### Előtte - CSV Import

```
CSV sor beolvasása
      │
      ▼
NAV lekérdezés
      │
      ▼
Rossz XML parsing ❌
      │
      ▼
Hiányos NAV adatok
      │
      ▼
CSV adatok FELÜLÍRJÁK a NAV-ot ❌
      │
      ▼
Rossz végeredmény ❌
```

### Utána - CSV Import

```
CSV sor beolvasása
      │
      ▼
NAV lekérdezés
      │
      ▼
Helyes XML parsing (közös függvény) ✅
      │
      ▼
Teljes NAV adatok
      │
      ▼
NAV adatok PRIORITÁST kapnak ✅
      │
      ▼
CSV csak hiányzó mezőket tölti ki ✅
      │
      ▼
Helyes végeredmény ✅
```

## 📋 Mező-kitöltés Összehasonlítás

### Példa: 12345678 adószám

| Mező | Előtte (CSV Import) | Utána (CSV Import) | Ügyfél Szerkesztő |
|------|---------------------|--------------------|--------------------|
| `name` | CSV érték ❌ | NAV: "TESZT Kft." ✅ | NAV: "TESZT Kft." ✅ |
| `city` | CSV érték ❌ | NAV: "Budapest" ✅ | NAV: "Budapest" ✅ |
| `postal_code` | CSV érték ❌ | NAV: "1011" ✅ | NAV: "1011" ✅ |
| `street_name` | CSV érték ❌ | NAV: "Fő" ✅ | NAV: "Fő" ✅ |
| `vat_code` | CSV érték ❌ | NAV: "2" ✅ | NAV: "2" ✅ |
| `county_code` | CSV érték ❌ | NAV: "01" ✅ | NAV: "01" ✅ |
| `email` | CSV érték ✅ | CSV érték ✅ | CSV érték ✅ |
| `phone` | CSV érték ✅ | CSV érték ✅ | CSV érték ✅ |

✅ **Most már AZONOSAK!**

## 💻 Kód Összehasonlítás

### Előtte - Duplikált Parsing

```python
# nav_api_views.py - lookup_taxpayer
def lookup_taxpayer(request):
    # ... NAV lekérdezés ...
    
    # Parsing logika #1 - JÓ ✅
    root = ET.fromstring(xml_string)
    taxpayer_elem = root.find('.//{http://...}taxpayerData')
    name = taxpayer_elem.findtext('{http://...}taxpayerName')
    # ... stb ~50 sor ...


# import_views.py - import_customers
def import_customers(request):
    # ... CSV beolvasás ...
    
    # Parsing logika #2 - ROSSZ ❌
    root = ET.fromstring(xml_string)
    taxpayer_data = root.find('.//taxpayerData')  # ❌ Nincs namespace!
    # Iterálás gyerekeken... ❌
    for child in taxpayer_data:
        tag_name = child.tag.split('}')[-1]  # ❌ Hacky
        if tag_name == 'taxpayerName':
            name = child.text  # ❌ Nem mindig működik
    # ... stb ~100 sor ...
```

### Utána - Közös Függvény

```python
# nav_api_views.py - Közös parsing függvény
def parse_nav_taxpayer_response(xml_string):
    """
    Közös NAV XML parsing - egy helyen a logika! ✅
    """
    root = ET.fromstring(xml_string)
    taxpayer_elem = root.find('.//{http://...}taxpayerData')
    
    parsed_data = {
        'taxpayer_name': taxpayer_elem.findtext('{http://...}taxpayerName'),
        'taxpayer_short_name': taxpayer_elem.findtext('{http://...}taxpayerShortName'),
        # ... stb ~70 sor egyszer ...
    }
    
    return parsed_data


# nav_api_views.py - lookup_taxpayer
def lookup_taxpayer(request):
    # ... NAV lekérdezés ...
    parsed_data = parse_nav_taxpayer_response(xml_string)  # ✅ Közös!
    return JsonResponse({'data': parsed_data})


# import_views.py - import_customers  
from invoices.views.nav_api_views import parse_nav_taxpayer_response

def import_customers(request):
    # ... CSV beolvasás ...
    nav_data = parse_nav_taxpayer_response(xml_string)  # ✅ Közös!
    
    # NAV adatok elsődlegesek
    customer_data['name'] = nav_data.get('taxpayer_name')
    
    # CSV csak ha NAV nem adott értéket
    if 'name' not in customer_data:
        customer_data['name'] = csv_row.get('Név')
```

## 📈 Eredmények

### Kód Minőség
- ❌ **Előtte:** ~150 sor duplikált parsing logika
- ✅ **Utána:** Egyetlen közös függvény, DRY betartva

### Működés
- ❌ **Előtte:** CSV import NEM töltött ki minden mezőt
- ✅ **Utána:** CSV import UGYANÚGY működik, mint az ügyfél szerkesztő

### Karbantarthatóság
- ❌ **Előtte:** Bug javítása két helyen kellett
- ✅ **Utána:** Bug javítása egy helyen

### Adatminőség
- ❌ **Előtte:** CSV adatok felülírták a NAV hivatalos adatait
- ✅ **Utána:** NAV hivatalos adatok prioritást kapnak

## 🎯 Végső Állapot

```
✅ lookup_taxpayer API    → parse_nav_taxpayer_response() → Helyes adatok
✅ CSV import NAV válasz  → parse_nav_taxpayer_response() → Helyes adatok

✅ Mindkét esetben UGYANAZ az eredmény!
```
