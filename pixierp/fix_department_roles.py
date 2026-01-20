#!/usr/bin/env python
"""Fix department roles - add Adminisztráció role to Adminisztráció department"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.hr.models import Department
from apps.core.models import Role

# Find Adminisztráció department
dept = Department.objects.get(name='Adminisztráció')
print(f"Department: {dept.name} (ID: {dept.id})")
print(f"Current roles: {[r.name for r in dept.roles.all()]}")

# Find Adminisztráció role
role = Role.objects.get(name='Adminisztráció')
print(f"\nRole to add: {role.name} (ID: {role.id})")

# Add role to department
dept.roles.add(role)
print(f"\nAdded role '{role.name}' to department '{dept.name}'")

# Verify
print(f"\nDepartment roles after update: {[r.name for r in dept.roles.all()]}")

# Check employees
print("\nEmployees in this department:")
for emp in dept.employees.all():
    print(f"  - {emp.user.get_full_name()} ({emp.employee_id})")
    print(f"    Effective roles: {[r.name for r in emp.get_all_roles()]}")
