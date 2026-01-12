# "Saját adatok" jogosultság funkció

## Áttekintés

A "Saját adatok" jogosultság (`view_own`) lehetővé teszi, hogy a felhasználók csak azokat az adatokat lássák és szerkesszék, amelyek:
1. Közvetlenül hozzájuk kapcsolódnak (pl. saját jelenlét, szabadságok)
2. Olyan projektekhez tartoznak, amelyekbe be vannak hívva (pl. egyedi gyártás, projektek)

## Backend implementáció

### 1. Új action hozzáadva

`apps/core/models.py` - Permission.ACTION_CHOICES:
```python
ACTION_CHOICES = [
    ('view', 'Megtekintés'),
    ('view_own', 'Saját adatok megtekintése'),  # ÚJ
    ('create', 'Létrehozás'),
    ('edit', 'Szerkesztés'),
    ('delete', 'Törlés'),
    ('export', 'Export'),
    ('manage', 'Teljes jogosultság'),
]
```

Migráció: `core/migrations/0019_add_view_own_action.py`

### 2. OwnDataFilterMixin

`apps/core/permissions.py` - Automatikus adatszűrés ViewSet-ekben:

**Használat:**
```python
class MyViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = MyModel.objects.all()
    serializer_class = MySerializer
    
    # Kötelező mezők:
    permission_module = 'hr'  # Modul kód
    permission_resource = 'hr.leave_requests'  # Resource kód
    own_data_user_field = 'employee__user'  # Mező elérési út a user-hez
    own_data_project_field = 'project'  # (Opcionális) Projekt kapcsolat
```

**Működési logika:**
1. **Superuser**: Minden adat
2. **'view' vagy 'manage' jogosultság**: Minden adat
3. **'view_own' jogosultság**: 
   - Csak olyan rekordok, ahol `own_data_user_field == request.user`
   - ÉS (ha van projekt mező): `own_data_project_field.members` tartalmazza a user-t
4. **Nincs jogosultság**: Üres queryset

### 3. Implementált ViewSet-ek

#### HR modul
- **AttendanceViewSet** (`hr.attendance`)
  - `own_data_user_field = 'employee__user'`
  - Csak saját jelenléti bejegyzések
  
- **LeaveRequestViewSet** (`hr.leave_requests`)
  - `own_data_user_field = 'employee__user'`
  - Csak saját szabadság kérelmek

#### Sales modul
- **QuoteRequestViewSet** (`sales.rfqs`)
  - `own_data_user_field = 'created_by'`
  - Csak saját árajánlatok

#### Manufacturing modul
- **ProjectViewSet** (`manufacturing.projects`)
  - `own_data_user_field = 'manager'`
  - Csak saját projektek (ahol manager)
  
- **ManufacturingProductViewSet** (`manufacturing.products`)
  - `own_data_user_field = 'created_by'`
  - `own_data_project_field = 'project'`
  - Saját termékek VAGY projektben szereplő termékek

## Frontend használat

### Szerepkör szerkesztés

A Beállítások > Szerepkörök oldalon a "Jogosultságok" gombnál minden resource-nál elérhető a **"Saját adatok megtekintése"** action checkbox.

### Példa használati esetek

#### 1. Egyszerű munkavállaló
```
Szerepkör: "Alkalmazott"
Jogosultságok:
- hr.attendance: view_own ✓ (saját jelenlét megtekintése)
- hr.leave_requests: view_own ✓, create ✓ (saját szabadság kérés/létrehozás)
```
Eredmény: Csak a saját jelenléti adatait és szabadság kérelmeit látja.

#### 2. Projekt tag
```
Szerepkör: "Gyártó"
Jogosultságok:
- manufacturing.projects: view_own ✓
- manufacturing.products: view_own ✓
```
Eredmény: Csak azokat a projekteket és termékeket látja, amelyekben részt vesz.

#### 3. Értékesítő
```
Szerepkör: "Sales"
Jogosultságok:
- sales.rfqs: view_own ✓, create ✓, edit ✓
```
Eredmény: Csak a saját árajánlatait látja és szerkesztheti.

## Új ViewSet hozzáadása

Példa más ViewSet-hez:

```python
from apps.core.permissions import OwnDataFilterMixin

class MyCustomViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = MyModel.objects.all()
    serializer_class = MySerializer
    
    permission_module = 'orders'
    permission_resource = 'orders.customer_orders'
    own_data_user_field = 'created_by'  # MyModel.created_by -> User
    # own_data_project_field = 'project'  # Ha van projekt kapcsolat
```

## Megjegyzések

- A `view_own` action csak olvasási műveletekre vonatkozik (list, retrieve)
- Létrehozás, szerkesztés, törlés továbbra is az eredeti action-ökhöz kötött (`create`, `edit`, `delete`)
- A projekt kapcsolat opcionális, csak akkor kell megadni, ha van ilyen mező a modellben
- A felhasználó mezőhöz vezető út lehet többszintű (pl. `employee__user`, `project__manager`)
- **FONTOS**: Az OwnDataFilterMixin-t használó ViewSet-ek automatikusan üres queryset-et adnak vissza nem bejelentkezett felhasználóknak
- A `permission_classes = [AllowAny]` beállítás nem akadályozza meg a szűrést - csak azt jelenti, hogy az endpoint elérhető, de az adatok szűrve vannak

## Hibakeresés

Ha 500-as hibát kapsz:
1. Ellenőrizd, hogy a ViewSet-ben van-e `queryset` attribútum
2. Ellenőrizd, hogy a `own_data_user_field` helyes útvonal-e a User objektumhoz
3. Nézd meg a backend logot: `tail -f /tmp/pixierp_backend.log`
