import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth import get_user_model
from apps.core.models import UserRole

User = get_user_model()
email = 'laura.palczert@magyarmedia.com'

try:
    user = User.objects.get(email__iexact=email)
    print(f"User: {user.username}")
    print(f"Is superuser: {user.is_superuser}")
    
    roles = UserRole.objects.filter(user=user)
    print(f"Roles count: {roles.count()}")
    for ur in roles:
        print(f" - Role: {ur.role.name} (Company: {ur.company.name if ur.company else 'Global'})")
        
except Exception as e:
    print(f"Error: {e}")
