"""
Egyedi jogosultság ellenőrző osztályok és mixinek
"""
from rest_framework import permissions
from .models import Permission


class HasPermission(permissions.BasePermission):
    """
    Egyedi jogosultság ellenőrző
    ViewSet-ben használva: permission_classes = [HasPermission]
    
    A ViewSet-ben definiálni kell:
    - permission_module: str (pl. 'hr')
    - permission_resource: str (pl. 'hr.employees')
    """
    
    def has_permission(self, request, view):
        # Superuser mindig mehet
        if request.user.is_superuser:
            return True
        
        # Action mapping
        action_map = {
            'list': 'view',
            'retrieve': 'view',
            'create': 'create',
            'update': 'edit',
            'partial_update': 'edit',
            'destroy': 'delete',
        }
        
        action = action_map.get(view.action, view.action)
        
        # ViewSet-ben definiált modul és resource
        module = getattr(view, 'permission_module', None)
        resource = getattr(view, 'permission_resource', None)
        
        if not module or not resource:
            return False

        # Olvasásnál engedjük a view_own-t is (list/retrieve)
        if action in ['view', 'view_own']:
            if check_permission(request.user, module, resource, 'view'):
                return True
            if has_own_data_permission(request.user, module, resource):
                return True
            return False

        # Jogosultság ellenőrzés a nem-olvasó műveletekre
        return check_permission(request.user, module, resource, action)


def check_permission(user, module, resource, action):
    """
    Ellenőrzi, hogy a felhasználónak van-e jogosultsága az adott művelethez
    Osztály-alapú szerepköröket (Department.roles), közvetlen UserRole-okat,
    valamint egyéni (user-szintű) Permission rekordokat is figyelembe veszi.
    A superuser kezelése a hívóban történik.
    
    Args:
        user: User objektum
        module: Modul kód (pl. 'hr')
        resource: Resource kód (pl. 'hr.employees')
        action: Művelet (pl. 'view', 'view_own', 'create', 'edit', 'delete')
    
    Returns:
        bool: Van-e jogosultsága
    """
    # Check if user is authenticated
    if not user or not user.is_authenticated:
        return False
    
    # Resource query construction: match specific resource OR global (null/empty) resource
    resource_query = [resource]
    if resource:
        resource_query.append(None)
        resource_query.append('')

    # 1) Osztály-alapú szerepkörök (Employee.departments.roles)
    # 2) Közvetlen user szerepkörök (user.user_roles)
    # Ezekből közös role_id halmazt képzünk.
    role_ids = set()

    from apps.hr.models import Employee
    try:
        employee = Employee.objects.get(user=user)
        # Collect role IDs from departments
        for department in employee.departments.all():
            for role in department.roles.all():
                role_ids.add(role.id)
    except Employee.DoesNotExist:
        pass

    try:
        role_ids.update(user.user_roles.values_list('role_id', flat=True))
    except Exception:
        pass

    role_permissions = Permission.objects.none()
    if role_ids:
        role_permissions = Permission.objects.filter(
            role_id__in=role_ids,
            module=module,
            resource__in=resource_query,
            action__in=[action, 'manage'],
        )

    # Egyéni, userre közvetlenül kiosztott jogok
    user_permissions = Permission.objects.filter(
        user=user,
        module=module,
        resource__in=resource_query,
        action__in=[action, 'manage'],
    )

    if hasattr(Permission, 'allowed'):
        role_permissions = role_permissions.filter(allowed=True)
        user_permissions = user_permissions.filter(allowed=True)

    return role_permissions.exists() or user_permissions.exists()


def has_own_data_permission(user, module, resource):
    """
    Ellenőrzi, hogy a felhasználónak van-e "view_own" jogosultsága
    
    Returns:
        bool: Van-e view_own jogosultsága
    """
    return check_permission(user, module, resource, 'view_own')


class OwnDataFilterMixin:
    """
    Mixin ViewSet-ekhez, amely automatikusan szűri az adatokat "own data" jogosultság esetén
    
    Használat:
    1. ViewSet-ben örökölni ezt a mixin-t
    2. Definiálni kell:
       - permission_module: str
       - permission_resource: str
       - own_data_user_field: str (default: 'user') - melyik mezőn van a user
       - own_data_project_field: str (optional) - melyik mezőn keresztül kapcsolódik projekthez
    """
    
    own_data_user_field = 'user'  # Default: közvetlen user mező
    own_data_project_field = None  # Opcionális: projekt kapcsolat
    own_data_extra_user_fields = []  # Opcionális: további user mezők (OR feltétel, pl. M2M assignees)
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        # Nem bejelentkezett felhasználó -> üres queryset
        if not user.is_authenticated:
            return queryset.none()
        
        # Superuser mindent lát
        if user.is_superuser:
            return queryset
        
        module = getattr(self, 'permission_module', None)
        resource = getattr(self, 'permission_resource', None)
        
        if not module or not resource:
            return queryset
        
        # Van "view" vagy "manage" jogosultsága? -> minden adat
        if check_permission(user, module, resource, 'view'):
            return queryset
        
        # Van "view_own" jogosultsága? -> csak saját adatok
        if has_own_data_permission(user, module, resource):
            # Felhasználó szerinti szűrés
            filter_kwargs = {self.own_data_user_field: user}
            own_queryset = queryset.filter(**filter_kwargs)
            
            # Extra user mezők szerinti szűrés (pl. assignees M2M)
            for extra_field in getattr(self, 'own_data_extra_user_fields', []):
                own_queryset = own_queryset | queryset.filter(**{extra_field: user})

            # Projekt szerinti szűrés (ha van)
            if self.own_data_project_field:
                project_filter = {f"{self.own_data_project_field}__members": user}
                project_queryset = queryset.filter(**project_filter)
                own_queryset = own_queryset | project_queryset
            
            return own_queryset.distinct()
        
        # Nincs jogosultsága -> üres queryset
        return queryset.none()
