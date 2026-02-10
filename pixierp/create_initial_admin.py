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
from apps.core.models import Role, UserRole, Permission

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
    has_profile = False
    if hasattr(user, 'employee_profile'):
        print("Employee profile (employee_profile) already exists.")
        has_profile = True
    elif hasattr(user, 'employee'):
        print("Employee profile (employee) already exists.")
        has_profile = True

    if not has_profile:
        print("Creating Employee profile...")
        # Generate a unique Employee ID
        # Try to avoid collision only if strict check needed, but random suffix helps
        base_id = f"SYSADMIN-{datetime.now().strftime('%Y%m%d')}"
        emp_id = base_id
        
        # Check if ID exists (rare, but possible if multiple deletions happened today)
        counter = 1
        while Employee.objects.filter(employee_id=emp_id).exists():
            emp_id = f"{base_id}-{counter}"
            counter += 1

        Employee.objects.create(
            user=user,
            employee_id=emp_id,
            is_active=True
        )
        print(f"Employee profile created ({emp_id}).")

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
    
    # Ensure default roles exist if database is empty
    if not Role.objects.exists():
        print("Creating default roles...")
        default_roles = [
            ('ADMIN', 'System Administrator'),
            ('CEO', 'Chief Executive Officer'),
            ('HR_MANAGER', 'HR Manager'),
            ('SALES_MANAGER', 'Sales Manager'),
            ('WAREHOUSE_MANAGER', 'Warehouse Manager'),
            ('PRODUCTION_MANAGER', 'Production Manager'),
            ('FINANCE_MANAGER', 'Finance Manager'),
            ('CRM_MANAGER', 'CRM Manager'),
            ('IT_ADMIN', 'IT Administrator'),
            ('LOGISTICS_MANAGER', 'Logistics Manager'),
            ('PURCHASING_MANAGER', 'Purchasing Manager'),
            ('QUALITY_MANAGER', 'Quality Manager')
        ]
        
        for role_name, role_desc in default_roles:
            Role.objects.get_or_create(name=role_name, defaults={'description': role_desc})
            print(f"  - Created role: {role_name}")

    # Fix Permissions for Admin roles
    print("Updating Permissions for ADMIN/CEO roles...")
    for role_name in ['ADMIN', 'CEO']:
        if Role.objects.filter(name=role_name).exists():
            role = Role.objects.get(name=role_name)
            print(f"  -> Assigning ALL permissions to {role_name}...")
             # Iterate over all defined resources in Permission model
            for resource_code, resource_name in Permission.RESOURCE_CHOICES:
                # Grant 'manage' (full access)
                Permission.objects.get_or_create(
                    role=role,
                    resource=resource_code,
                    module=resource_code.split('.')[0], # Extract module from resource
                    action='manage',
                    defaults={'allowed': True}
                )
            # Also generic module permissions if resource is not used everywhere
            for module_code, module_name in Permission.MODULE_CHOICES:
                    Permission.objects.get_or_create(
                    role=role,
                    module=module_code,
                    resource='',
                    action='manage',
                    defaults={'allowed': True}
                )
    
    all_roles = Role.objects.all()
    if not all_roles.exists():
        print("WARNING: No roles found in database even after creation attempt.")

    
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
