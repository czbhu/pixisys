import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.core.models import UserRole, Role
from django.contrib.auth import get_user_model

User = get_user_model()
email = 'laura.palczert@magyarmedia.com'

try:
    user = User.objects.get(email__iexact=email)
    role = Role.objects.get(name="Adminisztráció")
    
    print(f"Assigning role '{role.name}' to user '{user.username}'")
    
    ur, created = UserRole.objects.get_or_create(
        user=user,
        role=role
    )
    if created:
        print("UserRole assigned successfully (CREATED).")
    else:
        print("UserRole assigned successfully (ALREADY EXISTS).")

except Exception as e:
    print(f"Error: {e}")
