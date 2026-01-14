# 📊 Real-Time Import Progress Preloader

## ✨ Új Funkció: Live Importálási Progress

Az import folyamat most real-time feedback-et ad a felhasználónak egy modern progress modal segítségével.

### 🎯 Megjelenített Információk

A progress modal az alábbi metrikákat mutatja valós időben:

1. **Összesen Cég:** Hány sor van a CSV fájlban összesen
2. **Importált:** Hány cég került már feldolgozásra
3. **NAV Lekérdezés:** Hány NAV API lekérdezés történt (csak ha NAV validáció be van kapcsolva)
4. **Felülírás:** Hány meglévő ügyfél lett frissítve
5. **Új létrehozva:** Hány új ügyfél lett létrehozva

### 🔧 Technikai Implementáció

#### Backend - Server-Sent Events (SSE)

**Új Endpoint:** `/api/import/customers/streaming/`

- Streaming HTTP response Server-Sent Events formátumban
- Real-time progress frissítések minden feldolgozott sor után
- Három esemény típus:
  - `progress`: Folyamat közben küldött frissítések
  - `complete`: Sikeres befejezés eredményével
  - `error`: Hiba esetén

**Fájl:** `invoices/views/import_views.py`

```python
@api_view(['POST'])
@permission_classes([AllowAny])
def import_customers_streaming(request):
    """
    Import customers with real-time progress updates
    Returns SSE stream
    """
    def event_stream():
        # Send progress updates
        yield f"data: {json.dumps({
            'type': 'progress',
            'total': total_count,
            'imported': current_row,
            'nav_queries': nav_count,
            'updated': updated_count,
            'created': created_count
        })}\\n\\n"
        
        # Send final result
        yield f"data: {json.dumps({
            'type': 'complete',
            'created': created_count,
            'updated': updated_count,
            ...
        })}\\n\\n"
    
    return StreamingHttpResponse(
        event_stream(),
        content_type='text/event-stream'
    )
```

#### Frontend - React Progress Modal

**Fájl:** `frontend/src/pages/DataImport.js`

**Új komponensek:**
- `ModalOverlay`: Sötét átlátszó háttér
- `ModalContainer`: Progress modal konténer
- `ProgressItem`: Egyes metrikák megjelenítése
- `ProgressBar`: Vizuális progress bar
- `SpinnerContainer`: Animated spinner percentage-el

**Állapotkezelés:**
```javascript
const [showProgress, setShowProgress] = useState(false);
const [progress, setProgress] = useState({
  total: 0,
  imported: 0,
  nav_queries: 0,
  updated: 0,
  created: 0,
  current_tax_number: ''
});
```

**SSE Olvasás fetch API-val:**
```javascript
const response = await fetch(`${baseURL}/api/import/customers/streaming/`, {
  method: 'POST',
  body: formData,
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  // Parse SSE messages
  const data = JSON.parse(line.substring(6));
  if (data.type === 'progress') {
    setProgress(data);
  }
}
```

### 📱 UI/UX Design

#### Progress Modal

```
┌──────────────────────────────────┐
│ Importálás folyamatban      [X] │
├──────────────────────────────────┤
│                                  │
│ Összesen Cég:            250    │
│ Importált:               147    │
│ NAV Lekérdezés:          147    │
│ Felülírás:                89    │
│ Új létrehozva:            58    │
│                                  │
│ ████████████░░░░░░░░░░░         │
│                                  │
│ Feldolgozás: 12345678            │
│                                  │
│ ⟳ 59% kész                       │
└──────────────────────────────────┘
```

**Stílus jellemzők:**
- Modern, tiszta design
- Smooth animációk (progress bar, spinner)
- Responsive layout
- Kék (#2563eb) accent szín
- Blur-os háttér (modal overlay)

### 🔄 Működési Flow

1. **Felhasználó elindítja az import-ot**
   - Fájl kiválasztva
   - NAV validáció opcionálisan bekapcsolva
   - "Importálás" gomb kattintás

2. **Progress modal megjelenik**
   - Kezdeti állapot: 0/0
   - Spinner animáció indul

3. **Backend feldolgozás SSE-vel**
   - CSV soronként beolvasás
   - Minden sor után progress frissítés
   - Ha NAV validáció: NAV lekérdezés + frissítés
   - Customer create/update

4. **Frontend real-time frissítések**
   - SSE üzenetek fogadása
   - Progress state update
   - UI automatikus frissül

5. **Befejezés**
   - `complete` esemény
   - Modal eltűnik
   - Eredmény card megjelenik
   - Toast notification

### ⚙️ Konfiguráció

#### Backend Settings

Nincs speciális konfiguráció szükséges. A StreamingHttpResponse Django built-in funkció.

**Headers beállítása:**
```python
response['Cache-Control'] = 'no-cache'
response['X-Accel-Buffering'] = 'no'  # nginx buffering kikapcsolása
```

#### Frontend Settings

**API URL (környezeti változó):**
```javascript
const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:8001';
```

### 🧪 Tesztelés

#### Teszt Forgatókönyvek

1. **Kis fájl (< 10 sor)**
   - Progress gyorsan fut át
   - Minden metrika helyesen frissül

2. **Nagy fájl (> 100 sor)**
   - Progress smooth, lassú
   - NAV lekérdezések láthatóak

3. **NAV validáció BE**
   - "NAV Lekérdezés" metrika látszik
   - Aktuális adószám megjelenik

4. **NAV validáció KI**
   - "NAV Lekérdezés" metrika rejtve
   - Csak CSV import

5. **Modal bezárás**
   - X gomb működik
   - Overlay kattintás működik
   - Import folytatódik/megszakad

#### Manuális Teszt

```bash
# 1. Készíts egy teszt CSV-t
echo "Név,Rövid név,Adószám (8 jegyű),Város,Irányítószám,Ország,E-mail,Telefon,ÁFA kód,Megyekód,Adóalanyiság (DOMESTIC/PRIVATE_PERSON/OTHER),EU adószám,Fizetési határidő (nap),Utca név,Közterület jellege,Házszám,Épület,Lépcsőház,Emelet,Ajtó,Cím,ÁFA csoport ID,ÁFA csoport tag adószám
Teszt Kft 1,Teszt1,12345671,Budapest,1011,Hungary,test1@email.com,+36301234567,2,01,DOMESTIC,,8,,,,,,,,,
Teszt Kft 2,Teszt2,12345672,Budapest,1011,Hungary,test2@email.com,+36301234567,2,01,DOMESTIC,,8,,,,,,,,,
Teszt Kft 3,Teszt3,12345673,Budapest,1011,Hungary,test3@email.com,+36301234567,2,01,DOMESTIC,,8,,,,,,,,," > teszt_import.csv

# 2. Frontend indítás
cd /home/ceze/pixisys/pixinvoice/frontend
npm start

# 3. Backend indítás  
cd /home/ceze/pixisys/pixinvoice/invoice_app
python3 manage.py runserver

# 4. Böngészőben: http://localhost:3000/import
# 5. Fájl kiválasztása, NAV validáció BE, Import gomb
# 6. Progress modal megjelenik ✅
```

### 📊 Metrikák Jelentése

| Metrika | Mit jelent | Mikor frissül |
|---------|-----------|---------------|
| **Összesen Cég** | CSV sorok száma | Kezdetben (CSV beolvasás után) |
| **Importált** | Feldolgozott sorok | Minden sor után |
| **NAV Lekérdezés** | Sikeres NAV API hívások | NAV lekérdezés sikeressége után |
| **Felülírás** | Frissített meglévő ügyfelek | Customer update sikeressége után |
| **Új létrehozva** | Új ügyfelek | Customer create sikeressége után |

### 🎨 Testreszabás

#### Progress Bar Szín Módosítás

```javascript
const ProgressFill = styled.div`
  background: linear-gradient(90deg, #2563eb, #3b82f6);
  // Módosítás:
  background: linear-gradient(90deg, #10b981, #34d399); // zöld
`;
```

#### Modal Pozíció

```javascript
const ModalContainer = styled.div`
  width: 90%;
  max-width: 500px;
  // Módosítás:
  max-width: 700px; // szélesebb
`;
```

#### Animáció Sebesség

```javascript
const ProgressFill = styled.div`
  transition: width 0.3s ease;
  // Módosítás:
  transition: width 0.5s ease; // lassabb
`;
```

### 🔍 Debugging

#### Backend Log Nézés

```bash
tail -f /home/ceze/pixisys/pixinvoice/invoice_app/logs/django.log | grep "NAV\|Import"
```

#### Frontend Console

```javascript
// Progress üzenetek logolása
console.log('Progress:', data);

// SSE kapcsolat ellenőrzése  
console.log('SSE Connected:', reader);
```

### ⚠️ Ismert Limitációk

1. **Nginx Buffering**
   - Nginx reverse proxy esetén a buffering-et ki kell kapcsolni
   - `X-Accel-Buffering: no` header

2. **Böngésző Limit**
   - SSE max 6 párhuzamos kapcsolat per domain
   - Ritkán probléma

3. **Nagy Fájlok**
   - > 1000 sor esetén lassulhat
   - Memory használat nő

### ✅ Előnyök

- ✅ **Real-time feedback** - felhasználó látja mi történik
- ✅ **Transzparencia** - minden lépés látható
- ✅ **Modern UX** - professzionális megjelenés
- ✅ **Debugging** - könnyebb hibakeresés
- ✅ **Backward compatible** - régi endpoint megmaradt

### 📂 Módosított Fájlok

1. ✅ `invoices/views/import_views.py` - Új streaming endpoint
2. ✅ `invoices/urls.py` - Streaming URL hozzáadva
3. ✅ `frontend/src/pages/DataImport.js` - Progress modal implementálva

### 🚀 Deploy

1. Backend deploy (Python változások)
2. Frontend build & deploy
3. Nginx konfig ellenőrzése (buffering off)
4. Teszt importálás

---

**Készítette:** GitHub Copilot  
**Dátum:** 2026-01-14  
**Verzió:** 1.0
