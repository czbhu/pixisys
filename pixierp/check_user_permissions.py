#!/usr/bin/env python
"""Check user permissions for debugging"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth.models import User
from apps.core.models import Permission, UserRole, Role
from apps.hr.models import Employee

print("=" * 80)
print("Checking User Permissions")
print("=" * 80)

# List all users
print("\n1. All users:")
for u in User.objects.all()[:30]:
    emp = None
    try:
        emp = Employee.objects.get(user=u)
    except:
        pass
    emp_id = emp.employee_id if emp else 'N/A'
    print(f"  ID: {u.id}, Username: {u.username}, Employee ID: {emp_id}, Email: {u.email}")

print("\n2. All Roles:")
for role in Role.objects.all():
    print(f"  - {role.name} (ID: {role.id})")
    perms = Permission.objects.filter(role=role)
    for p in perms:
        print(f"    * {p.module}.{p.resource or 'ALL'} -> {p.action}")

# Find employees by employee_id
print("\n3. Finding employees by employee_id:")
try:
    emp1 = Employee.objects.get(employee_id='10002')
    print(f"  Employee 10002: {emp1.user.get_full_name()}, User: {emp1.user.username if emp1.user else 'N/A'}")
    if emp1.user:
        print(f"    Django User ID: {emp1.user.id}")
        print(f"    Roles: {[r.role.name for r in emp1.user.user_roles.all()]}")
        print(f"    Department roles: {[r.name for r in emp1.get_department_roles()]}")
        print(f"    Individual permissions: {[(p.module, p.resource, p.action) for p in emp1.user.custom_permissions.all()]}")
except Employee.DoesNotExist:
    print("  Employee 10002 not found")

try:
    emp2 = Employee.objects.get(employee_id='10004')
    print(f"\n  Employee 10004: {emp2.user.get_full_name()}, User: {emp2.user.username if emp2.user else 'N/A'}")
    if emp2.user:
        print(f"    Django User ID: {emp2.user.id}")
        print(f"    Roles: {[r.role.name for r in emp2.user.user_roles.all()]}")
        print(f"    Department roles: {[r.name for r in emp2.get_department_roles()]}")
        print(f"    Individual permissions: {[(p.module, p.resource, p.action) for p in emp2.user.custom_permissions.all()]}")
except Employee.DoesNotExist:
    print("  Employee 10004 not found")

print("\n4. All individual (user-level) permissions in system:")
user_perms = Permission.objects.filter(user__isnull=False)
if user_perms.exists():
    for p in user_perms:
        print(f"  User: {p.user.username} -> {p.module}.{p.resource or 'ALL'} -> {p.action} (allowed: {p.allowed})")
else:
    print("  No individual user permissions found")

print("\n" + "=" * 80)
