# Devizás számlák kezelése HUF fizetéssel

## Telepített javítások (2025-02-10)

### Backend módosítások
1. **Adatbázis séma** - 3 új mező az IncomingInvoiceDigest modellben:
   - `exchange_rate` - Árfolyam
   - `invoice_net_amount_huf` - Nettó összeg HUF-ban
   - `invoice_vat_amount_huf` - ÁFA összeg HUF-ban

2. **XML parseolás** - A NAV XML-ből kinyerjük a HUF összegeket:
   - `invoiceNetAmountHUF`
   - `invoiceVatAmountHUF`
   - `exchangeRate`

3. **API response** - Az incoming digest API mindig visszaadja:
   - `netAmountHUF`
   - `vatAmountHUF`
   - `exchangeRate`

4. **Backfill script** - Minden meglévő számla frissítve lett:
   ```bash
   cd /home/ceze/pixisys/pixinvoice/invoice_app
   source venv/bin/activate
   python backfill_huf_amounts.py
   ```

### Frontend módosítások
1. **Currency parseolás** - Több fallback a deviza kinyerésére:
   - `invoiceCurrencyCode`
   - `invoiceCurrency`
   - `currencyCode`
   - `currency`

2. **Táblázat megjelenítés** - HUF összeg devizás számlák alatt:
   ```
   223.70 EUR
   86118 HUF      <- Automatikusan megjelenik
   ```

3. **Batch logika** - EUR/USD számlák HUF batch-ben:
   - Ha a batch devizája HUF, és a számlának van HUF összege
   - Automatikusan a HUF összeget használja
   - Nem zárja ki a devizás számlákat a HUF fizetésből

4. **Batch preview** - Új "Deviza" oszlop + konverzió jelzés:
   ```
   EUR → HUF
   ```

## Használat

### 1. Oldal frissítése
**FONTOS:** Az új frontend használatához frissítsd az oldalt!
- **Chrome/Firefox**: `Ctrl + F5` vagy `Ctrl + Shift + R`
- **Vagy**: Töröld a böngésző cache-t

### 2. Adatok frissítése
A backend már tartalmazza a HUF összegeket, de a frontend cache-ben még régiek lehetnek.

**Megoldás:**
1. Nyomd meg a **Frissítés** gombot (🔄 ikon) a bejövő számlák oldalon
2. Ez újratölti az adatokat a backend-ről

### 3. Batch létrehozása devizás számlákkal

**Példa - HUF batch EUR számlákkal:**
```
1. Válaszd ki a kívánt számlákat (EUR, USD, HUF vegyesen)
2. Kattints a "Kifizetési csomag" gombra
3. A batch devizájának válaszd a "HUF"-ot
4. A rendszer automatikusan:
   - HUF számlákat: eredeti HUF összeggel veszi
   - EUR/USD számlákat: HUF konvertált összeggel veszi (ha van)
   - Kihagyja azokat ahol nincs HUF összeg
```

**Figyelmeztetés:**
- "Az eltérő pénznemű kijelöltek kimaradnak" - NEM jelenik meg, ha a devizás számláknak van HUF összege
- Ha mégis megjelenik, akkor az adott számla XML-je nem tartalmazza a HUF összeget (ritka eset)

## Ellenőrzés

### Adatbázis ellenőrzés (példa számla: 6972/SZ-L25)
```bash
cd /home/ceze/pixisys/pixinvoice/invoice_app
source venv/bin/activate
python manage.py shell -c "
from invoices.models import IncomingInvoiceDigest
d = IncomingInvoiceDigest.objects.filter(invoice_number__icontains='6972').first()
print(f'Currency: {d.currency}')
print(f'NetHUF: {d.invoice_net_amount_huf}')
print(f'VatHUF: {d.invoice_vat_amount_huf}')
print(f'Rate: {d.exchange_rate}')
"
```

**Várt kimenet:**
```
Currency: EUR
NetHUF: 67809.00
VatHUF: 18309.00
Rate: 384.9700
```

### Frontend build
A legfrissebb build időbélyege:
```
frontend/build/static/js/main.9d6df9c0.js
2025-02-10 14:32
```

## Hibaelhárítás

### 1. "Deviza" oszlop üres ("-")
**Ok:** Régi frontend cache vagy nem frissültek az adatok
**Megoldás:**
1. `Ctrl + F5` az oldalon
2. Frissítés gomb megnyomása

### 2. HUF összeg nem jelenik meg batch-ben
**Ok:** A számla XML-je nem tartalmaz HUF összeget
**Megoldás:**
1. Nyisd meg a számla XML nézetét (szem ikon)
2. Ellenőrizd hogy van-e `invoiceNetAmountHUF` mező
3. Ha nincs, a NAV nem adott vissza HUF értéket - ez ritka, de előfordul

### 3. "Eltérő pénznemű kijelöltek kimaradnak" figyelemeztetés
**Ok:** A kiválasztott devizás számlák nem rendelkeznek HUF összeggel
**Megoldás:**
1. Nyisd meg a számlák XML nézetét egyesével
2. Ellenőrizd melyiknél hiányzik a HUF összeg
3. Csak azokat a devizás számlákat válaszd ki, ahol van HUF összeg

## Technikai részletek

### Adatbázis migráció
```bash
cd /home/ceze/pixisys/pixinvoice/invoice_app
source venv/bin/activate
python manage.py migrate invoices 0073
```

### Frontend build (ha szükséges)
```bash
cd /home/ceze/pixisys/pixinvoice/frontend
npm run build
```

### Backend újraindítás (ha szükséges)
A backend már fut a 4001-es porton. Ha újra kell indítani:
```bash
cd /home/ceze/pixisys/pixinvoice/invoice_app
source venv/bin/activate
python manage.py runserver 0.0.0.0:4001
```

## Státusz

✅ Backend: Működik  
✅ Adatbázis: Frissítve  
✅ Frontend: Buildelve  
✅ API: HUF adatokat visszaad  
✅ Batch logika: HUF konverzió működik  
⏳ Felhasználói oldal: **Frissítés szükséges! (Ctrl+F5)**

## Kérdések?

Ha továbbra is problémák merülnének fel:
1. Ellenőrizd hogy újratöltötted-e az oldalt (Ctrl+F5)
2. Nyomj Frissítés gombot az adatok újratöltéséhez
3. Nézd meg a konkrét számla XML nézetét hogy van-e benne HUF összeg
4. Ellenőrizd a böngésző konzolt hibákért (F12 > Console)
