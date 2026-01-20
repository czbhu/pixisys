import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.core.models import Role

print("Available roles:")
for role in Role.objects.all():
    print(f" - {role.name}")
