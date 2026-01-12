# Emergency Access Token Rendszer

## 🚨 Jelszó nélküli időkorlátozott admin hozzáférés

Production környezetben való gyors admin belépéshez, amikor nem tudsz jelszóval bejelentkezni.

---

## Használat

### 1. Token generálása (SSH-n keresztül a production szerveren)

**PixiERP:**
```bash
cd /path/to/pixisys/pixierp
source venv/bin/activate
python manage.py generate_emergency_access --minutes 15
```

**PixInvoice:**
```bash
cd /path/to/pixisys/pixinvoice/invoice_app
source venv/bin/activate
python manage.py generate_emergency_access --minutes 30
```

### 2. Kimenet

```
======================================================================
  🚨 Emergency Admin Access Token Generálva
======================================================================

  ⏰ Érvényesség: 15 perc
  🔑 Token: abc123def456...

  📋 Használat (böngészőben):

     https://erp.pixisys.eu/emergency-login/abc123def456...

  ⚠️  A token csak egyszer használható!
  ⚠️  15 perc után automatikusan lejár!

======================================================================
```

### 3. Bejelentkezés

1. Másold ki az URL-t
2. Nyisd meg böngészőben
3. **Automatikusan belépsz** mint `admin@pixisys.eu` jelszó nélkül!

---

## Paraméterek

```bash
# Alapértelmezett: 15 perc
python manage.py generate_emergency_access

# Egyedi időkorlát (percben)
python manage.py generate_emergency_access --minutes 30
python manage.py generate_emergency_access --minutes 5
```

---

## Működés

1. **Token generálás**: Egyedi, 64 karakteres random token
2. **Adatbázisban tárolás**: `emergency_access_tokens` táblában
3. **Lejárati idő**: Automatikus (alapból 15 perc)
4. **Bejelentkezés**: Frontend automatikusan hívja a backend API-t
5. **Token felhasználás**: Token megjelölése "használt"-nak
6. **JWT token generálás**: Normál JWT access/refresh token kiállítása
7. **Automatikus belépés**: User bejelentkezik a rendszerbe

---

## Biztonság

### ✅ Védelmek

- ⏰ **Időkorlát**: Alapból 15 perc, utána automatikusan lejár
- 🔐 **Egyszer használatos**: Token felhasználás után azonnal invalid
- 📝 **IP logging**: Rögzítésre kerül ki generálta és honnan használták
- 🗑️ **Auto cleanup**: Lejárt tokenek automatikusan törlődnek
- 🚫 **Production only**: Csak ha van admin@pixisys.eu user

### ⚠️ Fontos

- **NE OSZD MEG** a tokent senkivel!
- **Használat után** a token automatikusan invalid lesz
- **SSH access kell** a production szerverre a generáláshoz
- A token **URL-ben van**, így **HTTPS mindig kötelező**!

---

## API Endpoint

### POST `/api/v1/auth/emergency-login/` (PixiERP)
### POST `/api/auth/emergency-login/` (PixInvoice)

**Request:**
```json
{
  "token": "abc123def456..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Emergency login sikeres",
  "user": {
    "id": 1,
    "username": "admin@pixisys.eu",
    "email": "admin@pixisys.eu",
    ...
  },
  "tokens": {
    "access": "eyJ...",
    "refresh": "eyJ..."
  }
}
```

**Error Responses:**
- `400`: Token hiányzik
- `401`: Token lejárt vagy már használták
- `404`: Admin user nem található

---

## Adatbázis Táblázat

**Table:** `emergency_access_tokens`

| Mező | Típus | Leírás |
|------|-------|--------|
| token | VARCHAR(64) | Egyedi token |
| created_at | DATETIME | Létrehozás időpontja |
| expires_at | DATETIME | Lejárati időpont |
| used_at | DATETIME | Használat időpontja |
| is_used | BOOLEAN | Felhasználva-e |
| created_by_ip | VARCHAR | Ki generálta (IP) |
| used_from_ip | VARCHAR | Honnan használták (IP) |

---

## Példa Használati Esetek

### 1. Elfelejtett jelszó (production)
```bash
# SSH-val belépek a szerverre
ssh user@production-server

# Token generálása
cd /var/www/pixisys/pixierp
python manage.py generate_emergency_access

# URL-t megnyitom böngészőben
# → Bejelentkezve vagyok!
# → Megváltoztatom a jelszót
```

### 2. Gyors konfiguráció változtatás
```bash
# 5 perces token (gyors módosításhoz)
python manage.py generate_emergency_access --minutes 5

# URL megnyitása
# → Beállítás elvégzése
# → Kijelentkezés
```

### 3. Távoli support
```bash
# Support kollégának 30 perces access
python manage.py generate_emergency_access --minutes 30

# Token átküldése (biztonságos csatornán!)
# → Kollega be tud lépni
# → Token automatikusan lejár 30 perc után
```

---

## Cleanup Script

A lejárt tokenek automatikusan törlődnek minden új token generálásakor, de manuálisan is futtathatod:

```python
from django.utils import timezone
from apps.core.models_emergency import EmergencyAccessToken

# PixiERP
EmergencyAccessToken.objects.filter(expires_at__lt=timezone.now()).delete()

# PixInvoice
from invoices.models_emergency import EmergencyAccessToken
EmergencyAccessToken.objects.filter(expires_at__lt=timezone.now()).delete()
```

---

## Troubleshooting

### Token nem működik (401)
- ✅ Ellenőrizd hogy nem járt-e le (15 perc)
- ✅ Token csak egyszer használható
- ✅ Generálj új tokent

### Admin user nem található (404)
- ✅ Létezik `admin@pixisys.eu` user?
- ✅ `python manage.py create_dev_admin` (DEBUG módban)

### URL rossz formátumú
- ✅ Teljes URL: `https://domain.com/emergency-login/TOKEN`
- ✅ Ne törd meg a tokent (64 karakter!)

---

## Fejlesztői infók

**Model:** `apps/core/models_emergency.py` | `invoices/models_emergency.py`  
**View:** `apps/core/views_emergency.py` | `invoices/views_emergency.py`  
**Command:** `generate_emergency_access`  
**Migration:** `0020_emergency_access_tokens` | `0053_emergency_access_tokens`

**GitHub Commit:** `32430bb`  
**Verzió:** v0.49+

---

**⚠️ Csak production emergency esetekre! Normál használatra jelszót használj!**
