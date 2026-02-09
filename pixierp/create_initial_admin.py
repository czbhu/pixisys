import os
import sys
import django
from datetime import datetime

# Setup Django
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth import get_user_model
from apps.hr.models import Employee, Department
from apps.core.models import Role, UserRole

User = get_user_model()

def create_admin(email, password, username="admin"):
    print(f"Creating ERP Superuser: {email}")
    
    user = None
    if User.objects.filter(email=email).exists():
        print("User with this email already exists. Updating password...")
        user = User.objects.get(email=email)
        user.set_password(password)
        user.save()
    elif User.objects.filter(username=username).exists():
        print("User with this username already exists. Updating password...")
        user = User.objects.get(username=username)
        user.set_password(password)
        user.save()
    else:
        print("Creating new superuser...")
        user = User.objects.create_superuser(
            username=username,
            email=email,
            password=password
        )
        print("Superuser created successfully.")

    # Create Employee profile if missing
    if not hasattr(user, 'employee'):
        print("Creating Employee profile...")
        # Generate a unique Employee ID
        emp_id = f"SYSADMIN-{datetime.now().strftime('%Y%m%d')}"
        Employee.objects.create(
            user=user,
            employee_id=emp_id,
            is_active=True
        )
        print(f"Employee profile created ({emp_id}).")
    else:
        print("Employee profile already exists.")

    # Create "CEO" Department if it doesn't exist
    print("Checking 'CEO' Department...")
    ceo_department, dept_created = Department.objects.get_or_create(name="CEO")
    if dept_created:
        print("Created 'CEO' Department.")
    else:
        print("'CEO' Department already exists.")
    
    # Add user to CEO department
    if hasattr(user, 'employee_profile'):
        print("Adding user to CEO Department...")
        user.employee_profile.departments.add(ceo_department)
    elif hasattr(user, 'employee'):
         # Fallback if related_name is 'employee'
         user.employee.departments.add(ceo_department)
    else:
         print("ERROR: Could not find employee profile relationship to add to department.")

    # Assign all roles to the CEO department
    print("Assigning ALL roles to CEO Department...")
    all_roles = Role.objects.all()
    if not all_roles.exists():
        print("WARNING: No roles found in database. Please load initial data/fixtures.")
    
    ceo_department.roles.add(*all_roles)
    print(f"Assigned {all_roles.count()} roles to CEO Department.")
    
    # Also assign directly to user just in case
    count = 0
    for role in all_roles:
        _, created = UserRole.objects.get_or_create(user=user, role=role)
        if created:
            count += 1
    print(f"Assigned {count} new roles directly to user.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python create_initial_admin.py <email> <password>")
        sys.exit(1)
        
    email = sys.argv[1]
    password = sys.argv[2]
    # Use part of email as username if not specified
    username = email.split('@')[0]
    create_admin(email, password, username)
