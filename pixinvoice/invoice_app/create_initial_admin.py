import os
import sys
import uuid
import django
from django.contrib.auth.hashers import make_password

# Setup Django
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invoice_system.settings')
django.setup()

from invoices.models import SystemUser, Role, Company

def create_admin(email, password):
    print(f"Creating Invoice SystemUser: {email}")
    
    user = None
    if SystemUser.objects.filter(email=email).exists():
        print("User with this email already exists.")
        user = SystemUser.objects.get(email=email)
        # Update password just in case? No, let's keep it safe.
    else:
        print("Creating new SystemUser...")
        user = SystemUser.objects.create(
            id=uuid.uuid4(),
            email=email,
            first_name="System",
            last_name="Admin",
            is_active=True
        )
        user.set_password(password)
        # Assuming is_verified exists based on common patterns, or just proceed
        # Models check showed is_active, but let's check if there are other flags.
        # The file read previously showed: is_active=True.
        print("SystemUser created.")

    # Assign all roles
    print("Assigning roles...")
    all_roles = Role.objects.all()
    if not all_roles.exists():
        print("WARNING: No roles found. Please load initial data.")
        
    user.roles.add(*all_roles)
    print(f"Assigned {all_roles.count()} roles.")
    
    # Assign to all companies if needed?
    pass

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python create_initial_admin.py <email> <password>")
        sys.exit(1)
        
    email = sys.argv[1]
    password = sys.argv[2]
    create_admin(email, password)
