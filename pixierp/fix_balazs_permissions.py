#!/usr/bin/env python
"""Check employee 10001 and assign proper department roles"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.hr.models import Employee, Department
from apps.core.models import Role

print("Checking employee 10001 (Balázs Czentye):\n")

emp = Employee.objects.get(employee_id='10001')
print(f"Employee: {emp.user.get_full_name()} ({emp.employee_id})")
print(f"User ID: {emp.user.id}, Username: {emp.user.username}")
print(f"Is superuser: {emp.user.is_superuser}")

print(f"\nDepartments:")
depts = emp.departments.all()
if depts:
    for d in depts:
        print(f"  - {d.name} (ID: {d.id})")
        print(f"    Current roles: {[r.name for r in d.roles.all()]}")
else:
    print("  (No departments assigned)")

print(f"\nEffective roles from departments: {[r.name for r in emp.get_all_roles()]}")

# Find Szuper Admin role
try:
    super_admin_role = Role.objects.get(name='Szuper Admin')
    print(f"\nFound 'Szuper Admin' role (ID: {super_admin_role.id})")
    
    if depts:
        print("\nAdding 'Szuper Admin' role to employee's departments:")
        for dept in depts:
            if super_admin_role not in dept.roles.all():
                dept.roles.add(super_admin_role)
                print(f"  ✓ Added to '{dept.name}'")
            else:
                print(f"  - Already in '{dept.name}'")
        
        print(f"\nEffective roles after update: {[r.name for r in emp.get_all_roles()]}")
    else:
        print("\n⚠ Employee has no departments! Cannot assign role via department.")
        print("  Please assign employee to a department first.")
except Role.DoesNotExist:
    print("\n⚠ 'Szuper Admin' role not found!")

print("\n" + "="*80)
print("Checking all employees and their departments:")
print("="*80)
for e in Employee.objects.all()[:10]:
    print(f"\n{e.employee_id}: {e.user.get_full_name()}")
    for d in e.departments.all():
        print(f"  Dept: {d.name} → Roles: {[r.name for r in d.roles.all()]}")
    print(f"  Effective roles: {[r.name for r in e.get_all_roles()]}")
