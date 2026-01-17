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
    
    Args:
        user: User objektum
        module: Modul kód (pl. 'hr')
        resource: Resource kód (pl. 'hr.employees')
        action: Művelet (pl. 'view', 'view_own', 'create', 'edit', 'delete')
    
    Returns:
        bool: Van-e jogosultsága
    """
    # Superuser mindig mehet
    if user.is_superuser:
        return True
    
    # Szerepkör jogosultságok
    role_permissions = Permission.objects.filter(
        role__user_assignments__user=user,
        module=module,
        resource=resource,
        action__in=[action, 'manage'],
        allowed=True
    )
    
    # Egyéni jogosultságok
    user_permissions = Permission.objects.filter(
        user=user,
        module=module,
        resource=resource,
        action__in=[action, 'manage'],
        allowed=True
    )
    
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
            
            # Projekt szerinti szűrés (ha van)
            if self.own_data_project_field:
                project_filter = {f"{self.own_data_project_field}__members": user}
                project_queryset = queryset.filter(**project_filter)
                own_queryset = own_queryset | project_queryset
            
            return own_queryset.distinct()
        
        # Nincs jogosultsága -> üres queryset
        return queryset.none()
