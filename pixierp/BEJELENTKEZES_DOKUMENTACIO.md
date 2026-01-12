# PixiERP Bejelentkezési Rendszer Dokumentáció

## 📋 Áttekintés

A PixiERP bejelentkezési rendszere a **Django beépített User modelljét** használja az autentikációhoz. Az alkalmazottak (Employee) adatai a HR modulban vannak tárolva, de a bejelentkezés mindig a Django User modelljén keresztül történik.

## 🔐 Bejelentkezési Mechanizmus

### Használt Adatok

A bejelentkezéshez a következő Django User adatokat használjuk:
- **Email cím** vagy **Felhasználónév** (username)
- **Jelszó** (hashelve tárolva a Django User modellben)

### Adatkapcsolat

```
Django User (auth_user)
    ↓ OneToOne kapcsolat
Employee (employees)
    ↓ Tárolja
    - HR specifikus adatok (TB szám, adószám, fizetés, stb.)
    - Hivatkozás a User-re (user.email, user.username, user.first_name, stb.)
```

## 🔧 Funkciók

### 1. Bejelentkezés (`/api/login/`)

**Endpoint:** `POST /api/login/`

**Kód:** [`pixierp/apps/core/views.py`](pixierp/apps/core/views.py#L107-L140)

**Működés:**
1. Felhasználó megadja az email címét vagy felhasználónevét és jelszavát
2. Rendszer megkeresi a User objektumot
3. Django `authenticate()` funkcióval ellenőrzi a jelszót (hashelve)
4. Sikeres bejelentkezés esetén JWT token generálódik

**Példa request:**
```json
{
  "email": "john.doe@example.com",
  "password": "titkos_jelszo"
}
```

**Példa response:**
```json
{
  "user": {
    "id": 1,
    "email": "john.doe@example.com",
    "username": "john.doe",
    "first_name": "John",
    "last_name": "Doe"
  },
  "tokens": {
    "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
  }
}
```

### 2. Új Jelszó Generálás (`/api/hr/employees/{id}/generate_password/`)

**Endpoint:** `POST /api/hr/employees/{id}/generate_password/`

**Kód:** [`pixierp/apps/hr/views.py`](pixierp/apps/hr/views.py#L42-L125)

**Működés:**
1. Generál egy 12 karakteres véletlenszerű jelszót
2. Frissíti a Django User jelszavát (`user.set_password()` - hashelve)
3. Email-ben elküldi az új jelszót a felhasználónak

**Fontos:** A jelszó csak a Django User modellben van tárolva, hashelve. Az Employee modellben nincs jelszó mező.

### 3. Elfelejtett Jelszó (`/api/password-reset-request/`)

**Endpoints:**
- `POST /api/password-reset-request/` - Jelszó visszaállító link kérése
- `POST /api/password-reset-confirm/` - Új jelszó beállítása

**Kód:** [`pixierp/apps/core/views.py`](pixierp/apps/core/views.py#L223-L296)

**Működés:**
1. Felhasználó megadja az email címét
2. Rendszer elküldi a jelszó visszaállító linket
3. Link tartalmaz egy egyszer használatos tokent
4. Felhasználó új jelszót állít be
5. Új jelszó a Django User modellbe kerül (hashelve)

## 👤 Alkalmazott Létrehozása

Amikor új alkalmazottat veszünk fel a HR modulban:

1. **Django User automatikus létrehozása:**
   - Felhasználónév generálás: `keresztnev.vezeteknev` (ékezetek nélkül)
   - Email cím megadása
   - Alapértelmezett jelszó: `defaultpassword123`

2. **Employee rekord létrehozása:**
   - Kapcsolódik a létrehozott User-hez
   - HR specifikus adatok tárolása

**Kód:** [`pixierp/apps/hr/serializers.py`](pixierp/apps/hr/serializers.py#L59-L85)

## 🔄 Jelszó Szinkronizáció

**Fontos változás (2026-01-12):**

Korábban az Employee modellben volt egy `password` mező, ami redundáns volt és nem szinkronizálódott a Django User jelszavával. Ez a mező **eltávolításra került**.

**Most:**
- ✅ Egyetlen jelszó forrás: Django User modell
- ✅ Biztonságos tárolás (bcrypt/PBKDF2 hash)
- ✅ Bejelentkezés: mindig a User jelszóval
- ✅ Jelszó módosítás: `user.set_password()` használata
- ✅ Jelszó ellenőrzés: `user.check_password()` használata

**Előnyök:**
- Nincs jelszó duplikáció
- Nincs szinkronizációs probléma
- Egyszerűbb karbantartás
- Django beépített biztonsági mechanizmusai

## 📊 Adatbázis Struktúra

### auth_user tábla (Django User)
```sql
- id
- username (UNIQUE)
- email (UNIQUE)
- password (HASHED)
- first_name
- last_name
- is_active
- is_staff
- is_superuser
- date_joined
- last_login
```

### employees tábla (Employee)
```sql
- id
- user_id (FOREIGN KEY -> auth_user.id, UNIQUE)
- employee_id (UNIQUE, pl: "10001")
- tb_number
- tax_number
- birth_first_name
- birth_last_name
- gross_salary
- net_salary
- permission_level
- ... (további HR adatok)
```

## 🎯 Gyakori Műveletek

### Új jelszó beállítása (kód példa)

```python
from django.contrib.auth import get_user_model
from apps.hr.models import Employee

User = get_user_model()

# Employee alapján User keresése
employee = Employee.objects.get(employee_id='10001')
user = employee.user

# Jelszó beállítása
user.set_password('új_biztonságos_jelszó')
user.save()
```

### Jelszó ellenőrzése

```python
from django.contrib.auth import authenticate

# Bejelentkezési próbálkozás
user = authenticate(username='john.doe', password='jelszó')
if user is not None:
    print("Sikeres bejelentkezés!")
else:
    print("Hibás jelszó!")
```

### Employee adatok lekérése bejelentkezett User alapján

```python
# View-ban
def my_view(request):
    user = request.user  # Bejelentkezett User
    
    try:
        employee = user.employee_profile  # OneToOne kapcsolat
        print(f"Employee ID: {employee.employee_id}")
        print(f"Nettó fizetés: {employee.net_salary}")
    except Employee.DoesNotExist:
        print("Nincs hozzárendelve alkalmazott")
```

## 🔒 Biztonság

### Jelszó Tárolás
- **Hash algoritmus:** Django alapértelmezett (PBKDF2 + SHA256)
- **Salt:** Minden jelszóhoz egyedi
- **Iterációk száma:** Django alapértelmezett (~600,000)

### JWT Token
- **Access token élettartam:** 60 perc (settings.py)
- **Refresh token élettartam:** 7 nap (settings.py)
- **Token blacklist:** Támogatott (kijelentkezés)

### Jelszó Szabályok
A Django beépített validátorokat használjuk:
- Minimum hossz: 8 karakter
- Ne legyen gyakori jelszó
- Ne legyen tisztán numerikus
- Ne legyen túl hasonló a felhasználói adatokhoz

## 📝 Migráció Történet

**2026-01-12:** `0015_remove_employee_password_field`
- Eltávolításra került az `Employee.password` mező
- Egyedüli jelszó forrás: Django User modell
- Egyszerűsített jelszókezelés

## 🚀 Frontend Integráció

A frontend bejelentkezési form:
- **Fájl:** [`pixierp/frontend/src/pages/Auth/Login.tsx`](pixierp/frontend/src/pages/Auth/Login.tsx)
- **Email/username** mezőt használ
- **Jelszó** mezőt használ
- **AuthContext** kezeli a bejelentkezést

```typescript
// Bejelentkezés
const handleLogin = async (values: any) => {
    const result = await login(values);
    if (result.success) {
        navigate('/dashboard');
    }
};
```

## ✅ Checklist Új Fejlesztésekhez

Amikor új funkciót fejlesztesz, ami jelszót kezel:

- [ ] Csak a Django User jelszót használd (`user.set_password()`, `user.check_password()`)
- [ ] Ne hozz létre új jelszó mezőt az Employee modellben
- [ ] Használj JWT tokent API hitelesítéshez
- [ ] Jelszó email-ben küldésekor használd az EmailServerConfig-ot
- [ ] Teszteld a bejelentkezést email címmel ÉS felhasználónévvel is

## 📞 Kapcsolódó Fájlok

- **Bejelentkezési logika:** `pixierp/apps/core/views.py`
- **Employee modell:** `pixierp/apps/hr/models.py`
- **Employee serializer:** `pixierp/apps/hr/serializers.py`
- **Employee views:** `pixierp/apps/hr/views.py`
- **Frontend login:** `pixierp/frontend/src/pages/Auth/Login.tsx`
- **Frontend AuthContext:** `pixierp/frontend/src/contexts/AuthContext.tsx`

---

**Utolsó frissítés:** 2026-01-12  
**Verzió:** v0.44+
