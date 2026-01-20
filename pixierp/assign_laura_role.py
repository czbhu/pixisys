import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.core.models import Company, UserRole, Role
from django.contrib.auth import get_user_model

User = get_user_model()
email = 'laura.palczert@magyarmedia.com'

try:
    user = User.objects.get(email__iexact=email)
    role = Role.objects.get(name="Adminisztráció")
    company = Company.objects.filter(is_active=True).first()
    
    if not company:
        print("No active company found!")
        sys.exit(1)

    print(f"Assigning role '{role.name}' to user '{user.username}' for company '{company.name}'")
    
    UserRole.objects.get_or_create(
        user=user,
        role=role,
        company=company
    )
    print("UserRole assigned successfully.")

except Exception as e:
    print(f"Error: {e}")
