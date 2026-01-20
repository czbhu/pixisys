# Jogosultságkezelés - Frissítés (2026-01-20)

## Probléma leírása
Az alkalmazottak (pl. 10002 és 10004) ugyanabba az osztályba (Adminisztráció) tartoztak, de különböző jogosultságokat láttak, mert a rendszer **három különböző helyen** tárolta a jogosultságokat:

1. **Osztály-alapú szerepkörök** (Department.roles) - NEM VOLT HASZNÁLVA
2. **Egyéni UserRole hozzárendelések** (UserRole tábla) - HASZNÁLVA VOLT
3. **Egyéni Permission objektumok** (Permission tábla, user foreign key) - NEM VOLT HASZNÁLVA

## Megoldás

### 1. Kód változtatások

#### `apps/core/permissions.py` - `check_permission()` függvény
- **Előtte**: Ellenőrizte az egyéni UserRole-okat ÉS az egyéni Permission objektumokat is
- **Utána**: **CSAK** az osztály-alapú szerepköröket vizsgálja (Employee → Department → Role → Permission)

#### `apps/core/serializers.py` - `UserSerializer`
- **Előtte**: `get_roles()` és `get_permissions()` a UserRole táblát nézte
- **Utána**: **CSAK** az osztály-alapú szerepköröket adja vissza (Employee → Department → Role)

#### `apps/hr/models.py` - `Employee` model
- `get_all_roles()`: Már **NEM** gyűjti össze az egyéni UserRole-okat
- `get_custom_permissions()`: Mindig üres listát ad vissza (nem használt)

#### `apps/hr/views.py` - `EmployeeViewSet`
- `custom_permissions` endpoint **eltávolítva** (ki van kommentálva)

### 2. Adatbázis változtatások

#### Hozzáadott szerepkör az osztályhoz:
```
Department: Adminisztráció (ID: 3)
  └── Role: Adminisztráció (ID: 2)
```

#### Törölve:
- **5 egyéni UserRole hozzárendelés** (teszt.czentye → Grafikus, balazs.czentye → Szuper Admin, stb.)
- **0 egyéni Permission objektum** (nem voltak)

### 3. Eredmény

**Előtte:**
- Employee 10002 (János Orosz): NINCS szerepkör → NINCS jogosultság
- Employee 10004 (Veronika Póka): Adminisztráció szerepkör (egyéni UserRole) → VAN jogosultság

**Utána:**
- Employee 10002 (János Orosz): Department → Adminisztráció szerepkör → VAN jogosultság
- Employee 10004 (Veronika Póka): Department → Adminisztráció szerepkör → VAN jogosultság

## Jogosultságkezelés új működése

### Architektúra
```
User (Django)
  └── Employee (HR)
       └── Department (many-to-many)
            └── Role (many-to-many)
                 └── Permission (role foreign key)
```

### Folyamat
1. Felhasználó bejelentkezik
2. Lekérdezzük az Employee objektumot
3. Lekérdezzük az összes Department-et, amibe tartozik
4. Minden Department-hez lekérdezzük a Role-okat
5. Minden Role-hoz tartozó Permission-öket ellenőrizzük

### Szabályok
- **CSAK osztály-alapú jogosultságok** vannak használva
- **NINCS** egyéni UserRole hozzárendelés
- **NINCS** egyéni Permission objektum (user-szintű)
- Ha egy alkalmazott **több osztályba** is tartozik, akkor **minden osztály szerepköreit** megkapja

## Maintenance scriptek

### Ellenőrzés:
```bash
cd /home/ceze/pixisys/pixierp
python check_user_permissions.py
python check_departments.py
```

### Szerepkör hozzáadása osztályhoz:
```python
from apps.hr.models import Department
from apps.core.models import Role

dept = Department.objects.get(name='Osztály név')
role = Role.objects.get(name='Szerepkör név')
dept.roles.add(role)
```

### Egyéni jogosultságok törlése (ha szükséges):
```bash
python remove_individual_permissions.py
```

## Figyelmeztetések

⚠️ **NE** használja a következő műveleteket:
- `UserRole.objects.create(user=..., role=...)`  # Egyéni szerepkör hozzárendelés
- `Permission.objects.create(user=..., ...)`      # Egyéni jogosultság létrehozása

✅ **HELYETTE** használja:
- `department.roles.add(role)`  # Osztályhoz szerepkör hozzárendelése
- `employee.departments.add(department)`  # Alkalmazott osztályba helyezése
