# PixiSys Domain Konfiguráció

## 📍 Áttekintés

A **`config.sh`** egy interaktív konfiguráló script, ami bekéri a domain beállításokat és elmenti őket a `.pixisys.conf` fájlba. Az összes telepítő és segédprogram automatikusan használja ezeket a beállításokat.

## 🚀 Gyors használat

### 1. Domain konfiguráció beállítása

```bash
./config.sh
```

Válaszd ki a környezetet:
- **Development (1)**: Automatikusan localhost-ra állít be mindent
- **Production (2)**: Rákérdez a domain-ekre
- **Egyéni (3)**: Teljes kontroll minden beállítás felett

### 2. Telepítés a beállított domain-ekkel

```bash
./install.sh
```

Az install.sh automatikusan:
- Betölti a `.pixisys.conf` beállításokat
- Ha nincs konfiguráció, rákérdez
- Generálja az `.env` fájlokat a helyes domain-ekkel

### 3. Emergency tokenek generálása

```bash
./generate_emergency_tokens.sh
```

Automatikusan használja a beállított domain-eket.

## 🔧 config.sh részletesen

### Első futtatás

```bash
./config.sh
```

**Output:**
```
==========================================
  PixiSys Domain Konfiguráció
==========================================

Válaszd ki a környezet típusát:
  1) Development (localhost)
  2) Production (domain-ek)
  3) Egyéni beállítás

Választás [1]: _
```

### Development környezet (1)

Automatikusan beállítja:
- PixiERP: `http://localhost:3000`
- PixInvoice: `http://localhost:4000`
- Backend portok: 8003, 4001
- HTTPS: kikapcsolva

### Production környezet (2)

Rákérdez:
```
Production domain-ek megadása:

PixiERP domain [erp.pixisys.eu]: te.pixisys.eu
PixInvoice domain [inv.pixisys.eu]: ti.pixisys.eu
PixiERP backend port [8003]: 
PixInvoice backend port [4001]: 
```

Automatikusan beállítja:
- HTTPS: bekapcsolva
- ALLOWED_HOSTS: production domain-ek
- CSRF/CORS: production domain-ek

### Egyéni környezet (3)

Teljes kontroll:
```
Egyéni beállítások megadása:

PixiERP domain (pl. localhost:3000 vagy erp.example.com) [localhost:3000]: 
PixInvoice domain (pl. localhost:4000 vagy inv.example.com) [localhost:4000]: 
PixiERP backend port [8003]: 
PixInvoice backend port [4001]: 
HTTPS használata? (i/N) [false]: 
```

### .env fájlok frissítése

A konfiguráció végén:
```
==========================================
  Konfiguráció összefoglalása
==========================================

  PixiERP Frontend:  http://localhost:3000
  PixiERP Backend:   http://localhost:8003
  PixInvoice Frontend: http://localhost:4000
  PixInvoice Backend:  http://localhost:4001
  HTTPS:             false

Frissítsem a .env fájlokat ezekkel az értékekkel? (i/N): i
```

Ha `i`-t választasz, automatikusan frissíti:
- `pixierp/.env`
- `pixierp/frontend/.env`
- `pixinvoice/invoice_app/.env`
- `pixinvoice/frontend/.env`

## 📂 Milyen fájlok használják?

### Konfiguráció tárolás

- **`.pixisys.conf`** - Mentett domain beállítások (gitignore-ban van!)
- **`config.sh`** - Interaktív konfiguráló script

### Scriptek, amik használják

1. **`install.sh`** - Telepítéskor rákérdez vagy betölti a beállításokat
2. **`generate_emergency_tokens.sh`** - Emergency access tokenek generálása
3. Jövőbeli scriptek (update.sh, deploy.sh, stb.)

## 🔄 Példák különböző használati esetekre

### 1. Első telepítés (Development)

```bash
# 1. Futtasd az install.sh-t
./install.sh

# Kérdés: "Válaszd ki a környezet típusát:"
# Válasz: 1 (Development)

# Automatikusan beállítja localhost-ra
# .env fájlok generálva
# Kész!
```

### 2. Első telepítés (Production)

```bash
# 1. Futtasd az install.sh-t
./install.sh

# Kérdés: "Válaszd ki a környezet típusát:"
# Válasz: 2 (Production)

# Kérdés: "PixiERP domain [erp.pixisys.eu]:"
# Válasz: te.pixisys.eu

# Kérdés: "PixInvoice domain [inv.pixisys.eu]:"
# Válasz: ti.pixisys.eu

# Mentés → .env generálás → Telepítés folytatása
```

### 3. Konfiguráció módosítása később

```bash
# Már telepítve van, de változtatni szeretnél

# 1. Futtasd a config.sh-t
./config.sh

# Betölti a meglévő beállításokat
# Módosíthatod őket
# Opcionálisan frissítheted a .env fájlokat

# 2. Újraindítás
./start.sh
```

### 4. Development → Production váltás

```bash
# 1. Állítsd át a konfigurációt
./config.sh

# Válaszd: 2 (Production)
# Add meg a domain-eket
# Frissítsd a .env fájlokat: i

# 2. Újragenerálás (opcionális)
rm pixierp/.env pixinvoice/invoice_app/.env
./install.sh  # Használja az új konfigot

# 3. Emergency tokenek újra
./generate_emergency_tokens.sh
```

### 5. Meglévő .env fájlok frissítése

```bash
# Csak a .env fájlokat szeretnéd frissíteni

# 1. Állítsd be a konfigot
./config.sh

# 2. A végén kérdezni fog
# "Frissítsem a .env fájlokat?" → i

# Kész! Minden .env frissítve
```

## 🧪 Tesztelés

### Konfiguráció ellenőrzése

```bash
# Nézd meg a mentett konfigot
cat .pixisys.conf
```

**Output:**
```bash
# PixiSys Domain Konfiguráció
# Generálva: Mon Jan 12 10:05:14 PM UTC 2026
# NE SZERKESZD MANUÁLISAN! Használd a ./config.sh scriptet!

ERP_DOMAIN="localhost:3000"
INV_DOMAIN="localhost:4000"
ERP_BACKEND_PORT="8003"
INV_BACKEND_PORT="4001"
USE_HTTPS="false"
```

### Debug mód

```bash
# Debug információk megjelenítése
export PIXISYS_CONFIG_DEBUG=true
source config.sh --load-only
```

**Output:**
```
=== PixiSys Domain Configuration ===
ERP Frontend:  http://localhost:3000
ERP Backend:   http://localhost:8003
INV Frontend:  http://localhost:4000
INV Backend:   http://localhost:4001
Use HTTPS:     false
===================================
```

### Emergency token teszt

```bash
# Generálj egy 5 perces tokent teszthez
./generate_emergency_tokens.sh 5
```

Ellenőrizd, hogy a helyes URL-ekkel generálódnak!

## ⚙️ Automatikusan generált változók

A `config.sh` a következő változókat állítja be automatikusan:

### Frontend URL-ek:
- `ERP_FRONTEND_URL` → `http://localhost:3000` vagy `https://erp.pixisys.eu`
- `INV_FRONTEND_URL` → `http://localhost:4000` vagy `https://inv.pixisys.eu`

### Backend URL-ek:
- `ERP_BACKEND_URL` → `http://localhost:8003` vagy `https://erp.pixisys.eu:8003`
- `INV_BACKEND_URL` → `http://localhost:4001` vagy `https://inv.pixisys.eu:4001`

### Django beállítások:
- `ERP_ALLOWED_HOSTS` → Megfelelő host-ok listája
- `INV_ALLOWED_HOSTS` → Megfelelő host-ok listája
- `ERP_CSRF_TRUSTED` → CSRF trusted origins
- `ERP_CORS_ALLOWED` → CORS allowed origins

### Egyéb:
- `PROTOCOL` → `http` vagy `https`
- `ERP_DOMAIN_NAME` → Domain név port nélkül
- `INV_DOMAIN_NAME` → Domain név port nélkül

## 📋 .env fájlok struktúrája

### PixiERP Backend (.env):
```bash
FRONTEND_BASE_URL=$ERP_FRONTEND_URL
EMERGENCY_DOMAIN=$ERP_FRONTEND_URL
ALLOWED_HOSTS=$ERP_ALLOWED_HOSTS
CSRF_TRUSTED_ORIGINS=$ERP_CSRF_TRUSTED
CORS_ALLOWED_ORIGINS=$ERP_CORS_ALLOWED
FRONTEND_URL=$ERP_FRONTEND_URL
```

### PixiERP Frontend (.env):
```bash
REACT_APP_API_URL=$ERP_BACKEND_URL
PORT=$ERP_FRONTEND_PORT
```

### PixInvoice Backend (.env):
```bash
ALLOWED_HOSTS=$INV_ALLOWED_HOSTS
FRONTEND_BASE_URL=$INV_FRONTEND_URL
EMERGENCY_DOMAIN=$INV_FRONTEND_URL
FRONTEND_URL=$INV_FRONTEND_URL
BACKEND_URL=$INV_BACKEND_URL
```

### PixInvoice Frontend (.env):
```bash
REACT_APP_API_URL=$INV_BACKEND_URL
PORT=$INV_FRONTEND_PORT
```

## 🔒 Biztonsági megjegyzések

### Development:
- `USE_HTTPS="false"` → HTTP protokoll
- `ALLOWED_HOSTS` tartalmazza a localhost-ot is
- CORS és CSRF is engedélyezi a localhost-ot

### Production:
- `USE_HTTPS="true"` → HTTPS kötelező
- `ALLOWED_HOSTS` csak a production domain
- CORS és CSRF is csak a production domain
- SSL/TLS certificate szükséges

## 🆘 Gyakori hibák

### "config.sh nem található"
```bash
# Bizonyosodj meg róla, hogy a script a pixisys főkönyvtárban van
cd /path/to/pixisys
ls -la config.sh
chmod +x config.sh
```

### ".pixisys.conf nem található" (első futtatásnál normális)
```bash
# Egyszerűen futtasd a config.sh-t vagy install.sh-t
./config.sh
# vagy
./install.sh
```

### "Rossz domain formátum"
```bash
# HELYES formátumok:
# localhost:3000
# erp.pixisys.eu
# 192.168.1.100:3000

# HELYTELEN formátumok:
# http://localhost:3000  ❌ (ne add meg a protokollt!)
# localhost:3000/        ❌ (ne legyen / a végén!)
# localhost              ❌ (add meg a portot dev-ben!)
```

### "Emergency token rossz URL-lel generálódik"
```bash
# 1. Ellenőrizd a config fájlt
cat .pixisys.conf

# 2. Ha rossz, futtasd újra a config.sh-t
./config.sh

# 3. Teszteld újra
./generate_emergency_tokens.sh 5
```

### ".env fájlok nem frissülnek"
```bash
# A config.sh végén kérdezni fog:
# "Frissítsem a .env fájlokat?" → i

# Vagy manuálisan:
./config.sh
# Válaszd az i-t a végén

# Vagy telepítés újra:
./install.sh
```

### "Két rendszer különböző domain-nel fut"
```bash
# Normális! A config lehetővé teszi:
# ERP: localhost:3000
# Invoice: localhost:4000

# Vagy production-ben:
# ERP: erp.pixisys.eu
# Invoice: inv.pixisys.eu
```

## 📚 További információk

- [EMERGENCY_ACCESS.md](EMERGENCY_ACCESS.md) - Emergency access rendszer dokumentáció
- [INSTALL.md](INSTALL.md) - Telepítési útmutató
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment útmutató

---

**Készítve ❤️-vel a Pixi Systems csapata által**

**Utolsó frissítés**: 2026. január 12.
