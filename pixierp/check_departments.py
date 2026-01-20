#!/usr/bin/env python
"""Check department assignments"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.hr.models import Employee, Department

print("Checking department assignments:\n")

emp = Employee.objects.get(employee_id='10002')
print(f'Employee 10002 ({emp.user.get_full_name()}) departments:')
for d in emp.departments.all():
    print(f'  - {d.name} (ID: {d.id})')
    print(f'    Department roles: {[r.name for r in d.roles.all()]}')
if not emp.departments.exists():
    print('  (No departments assigned)')

print()

emp2 = Employee.objects.get(employee_id='10004')
print(f'Employee 10004 ({emp2.user.get_full_name()}) departments:')
for d in emp2.departments.all():
    print(f'  - {d.name} (ID: {d.id})')
    print(f'    Department roles: {[r.name for r in d.roles.all()]}')
if not emp2.departments.exists():
    print('  (No departments assigned)')
