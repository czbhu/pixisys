import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.core.models import Role

try:
    role = Role.objects.get(name="Adminisztráció")
    print(f"Permissions for {role.name}:")
    for perm in role.permissions.all():
        print(f" - {perm.module}.{perm.action} (resource: {perm.resource})")
except Exception as e:
    print(f"Error: {e}")
