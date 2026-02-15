# Kassza Kezelő Rendszer - PixiERP

## Áttekintés

A PixiERP rendszerbe beépített kassza kezelő modul lehetővé teszi a vállalat kasszáinak nyilvántartását, valamint a kassza tranzakciók nyomon követését.

## Főbb funkciók

### 1. Kasszák kezelése (Pénzügy > Kassza Regisztráció)

- **Kassza létrehozása**: Új pénztárgép/kassza létrehozása
- **Kassza szerkesztése**: Meglévő kassza adatainak módosítása
- **Kassza másolása**: Gyors kassza létrehozás meglévő sablon alapján
- **Kassza törlése**: Nem használt kasszák eltávolítása

#### Kassza adatok:
- Kassza neve
- Kassza helye
- Pénznem (devizanem)
- Kezdő egyenleg
- Jelenlegi egyenleg (automatikusan számolt)
- Aktív/inaktív státusz
- **E-mail értesítés betétről** (be/ki)
- **E-mail értesítés kivétről** (be/ki)
- **Értesítendő felhasználók** (többszörös választás)

#### E-mail értesítések:
Amikor az e-mail értesítés be van kapcsolva és felhasználók vannak kiválasztva, a rendszer automatikusan e-mailt küld minden betét vagy kivét tranzakcióról.

**E-mail formátum:**
- **Tárgy:** `Kassza neve: +/-összeg`
- **Tartalom:**
  - Timestamp: Dátum és időpont
  - Kassza név
  - Összeg (előjellel)
  - Miért: Művelet oka
  - Megjegyzés
  - Alkalmazott neve
  - Kassza tartalma előtte
  - Kassza tartalma utána

### 2. Kassza Tranzakciók (Pénzügy > Kasszák)

#### Funkciók:

**Szűrési lehetőségek:**
- Gyorskereső: keresés megjegyzés, alkalmazott név alapján
- Dátum tartomány kiválasztása
- Kassza választó (egy kassza vagy az összes)
- Alkalmazott választó (egy alkalmazott vagy az összes)

**Tranzakció típusok:**
- **Betét (+)**: Pénz betétele a kasszába
- **Kivét (-)**: Pénz kivétele a kasszából
- **Kassza mozgatás**: Pénz áthelyezése egyik kasszából a másikba

#### Tranzakció adatok:
- Időpont (automatikus)
- Összeg (előjeles: + vagy -)
- Művelet oka (választható listából)
- Megjegyzés (szöveges mező)
- Kassza tartalma (tranzakció utáni egyenleg)
- Alkalmazott (bejelentkezett felhasználó)

### 3. Művelet Okok Konfigurálása

A Kassza Regisztráció oldalon lehetőség van a művelet okok (miért?) testreszabására:

#### Alapértelmezett okok:
1. **Fölözés** (csak kivét)
2. **Kassza mozgatás** (betét és kivét)
3. **Áru/szolgáltatás kifizetés** (csak kivét)
4. **Váltópénz betét** (csak betét)
5. **Napnyitás** (csak betét)
6. **Napzárás** (csak kivét)
7. **Kassza átvétel** (betét és kivét)

Minden ok beállítható, hogy:
- Betét műveletnél elérhető legyen
- Kivét műveletnél elérhető legyen
- Aktív/inaktív
- Megjelenítési sorrend

## Használat

### Új kassza létrehozása

1. Menü: **Pénzügy > Kassza Regisztráció**
2. Kattints az **"Új kassza"** gombra
3. Töltsd ki a mezőket:
   - Kassza neve (pl.: "Főpénztár")
   - Kassza helye (pl.: "Központi iroda, földszint")
   - Pénznem (pl.: HUF)
   - Kezdő egyenleg (pl.: 50000)
   - Aktív: Igen
   - E-mail értesítés betétről: Igen/Nem
   - E-mail értesítés kivétről: Igen/Nem
   - Értesítendő felhasználók: (válassz egyet vagy többet)
4. Kattints az **"Létrehozás"** gombra

### E-mail értesítés beállítása meglévő kasszához

1. Menü: **Pénzügy > Kassza Regisztráció**
2. Kattints a **"Szerkeszt"** ikonra a kassza sorában
3. Állítsd be:
   - **E-mail értesítés betétről**: Igen (ha betét műveleteknél küldjön emailt)
   - **E-mail értesítés kivétről**: Igen (ha kivét műveleteknél küldjön emailt)
   - **Értesítendő felhasználók**: Választd ki azokat a felhasználókat, akik kapjanak értesítést
4. Kattints a **"Mentés"** gombra

⚠️ **Fontos:** Csak azok a felhasználók kapnak emailt, akiknek van megadva email címe a rendszerben!

### Betét rögzítése

1. Menü: **Pénzügy > Kasszák**
2. Válaszd ki a kasszát a legördülő menüből
3. Kattints a **"Betét"** gombra
4. Töltsd ki az űrlapot:
   - Összeg (pl.: 10000)
   - Mire? (válassz a listából, pl.: "Váltópénz betét")
   - Megjegyzés (opcionális)
5. Ellenőrizd az egyenlegeket (előtte/utána)
6. Kattints az **"OK"** gombra

### Kivét rögzítése

1. Menü: **Pénzügy > Kasszák**
2. Válaszd ki a kasszát
3. Kattints a **"Kivét"** gombra
4. Töltsd ki az űrlapot:
   - Összeg (pl.: 5000)
   - Mire? (válassz a listából, pl.: "Fölözés")
   - Megjegyzés (opcionális)
5. Ellenőrizd az egyenlegeket (előtte/utána)
6. Kattints az **"OK"** gombra

### Tranzakciók szűrése és keresése

1. **Gyorskereső**: Írj be egy keresőszót (pl.: "váltópénz")
2. **Dátum tartomány**: Válassz ki egy időszakot
3. **Kassza**: Szűrj egy adott kasszára vagy nézd meg az összeset
4. **Alkalmazott**: Szűrj egy alkalmazott tevékenységére

## Technikai információk

### Backend (Django)

#### Modellek:
- `CashRegister`: Kassza alapadatok
- `CashRegisterEmployee`: Kassza-alkalmazott kapcsolat jogosultságokkal
- `CashRegisterTransaction`: Tranzakciók
- `CashTransactionReason`: Műveleti okok

#### API Végpontok:
- `GET /api/finance/cash-registers/`: Kasszák listázása
- `POST /api/finance/cash-registers/`: Új kassza
- `PUT /api/finance/cash-registers/{id}/`: Kassza szerkesztése
- `DELETE /api/finance/cash-registers/{id}/`: Kassza törlése
- `GET /api/finance/cash-transactions/`: Tranzakciók listázása
- `POST /api/finance/cash-transactions/deposit/`: Betét
- `POST /api/finance/cash-transactions/withdraw/`: Kivét
- `POST /api/finance/cash-transactions/transfer/`: Kassza mozgatás
- `GET /api/finance/cash-transaction-reasons/`: Műveleti okok

### Frontend (React + TypeScript + Ant Design)

#### Komponensek:
- `CashRegisters.tsx`: Kassza tranzakciók kezelése
- `CashRegisterSetup.tsx`: Kasszák és műveleti okok beállítása

#### Útvonalak:
- `/finance/cash-registers`: Tranzakció nézet
- `/finance/cash-register-setup`: Beállítások

## Jellemzők

✅ Valós idejű egyenleg számítás  
✅ Előjeles összegek (+/- megjelenítés)  
✅ Színkódolt összegek (zöld: betét, piros: kivét)  
✅ Dátum alapú szűrés  
✅ Teljes tranzakció történet  
✅ Többdevizás támogatás  
✅ Felhasználó követés (ki mit csinált)  
✅ Testreszabható műveleti okok  
✅ Kasszák közötti mozgatás támogatása  
✅ E-mail értesítések betét/kivét műveletekről  
✅ Többszörös értesítési címzett támogatása  

## Telepítés után

Az alábbi parancsok lefuttatása szükséges volt:

```bash
cd /home/ceze/pixisys/pixierp
./venv/bin/python manage.py makemigrations finance
./venv/bin/python manage.py migrate finance
./venv/bin/python create_cash_reasons.py
```

**Email értesítések beállítása:**
- Állítsd be a Django email beállításokat a `settings.py` fájlban
- `DEFAULT_FROM_EMAIL` beállítás megadása ajánlott
- SMTP szerver konfigurálása szükséges az emailek küldéséhez

Az alapértelmezett műveleti okok létrehozásra kerültek.

## Fejlesztési lehetőségek

- [ ] Excel export
- [ ] Napi összesítő jelentések
- [ ] Email értesítések nagy összegű tranzakciókról
- [ ] QR kódos kassza azonosítás
- [ ] Mobilapp támogatás
- [ ] Többszintű jogosultságkezelés (megtekintés/módosítás/törlés)
- [ ] Kassza zárás funkció ellenőrzéssel (számolt vs tényleges)

## Támogatás

Kérdések esetén: GitHub Issues vagy belső support csatorna
