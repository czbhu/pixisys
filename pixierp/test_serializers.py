#!/usr/bin/env python
"""Test the updated serializers"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth import get_user_model
from apps.core.serializers import UserSerializer
from apps.hr.models import Employee

User = get_user_model()

print("Testing UserSerializer with updated department-based logic:\n")
print("="*80)

# Test with employee 10001 (Balázs Czentye - Szuper Admin)
emp1 = Employee.objects.get(employee_id='10001')
user1 = emp1.user
serializer1 = UserSerializer(user1)
print(f"\nEmployee 10001 ({user1.get_full_name()}):")
print(f"  Username: {user1.username}")
print(f"  Is superuser: {user1.is_superuser}")
print(f"  Departments: {[d.name for d in emp1.departments.all()]}")
print(f"\n  Serialized roles: {serializer1.data['roles']}")
print(f"\n  Permissions count: {len(serializer1.data['permissions'])}")
if serializer1.data['permissions']:
    print(f"  Sample permissions (first 5):")
    for p in serializer1.data['permissions'][:5]:
        print(f"    - {p['module']}.{p['resource']} → {p['action']} (role: {p['role_name']})")

# Test with employee 10002 (János Orosz - Adminisztráció)
emp2 = Employee.objects.get(employee_id='10002')
user2 = emp2.user
serializer2 = UserSerializer(user2)
print(f"\n\nEmployee 10002 ({user2.get_full_name()}):")
print(f"  Username: {user2.username}")
print(f"  Is superuser: {user2.is_superuser}")
print(f"  Departments: {[d.name for d in emp2.departments.all()]}")
print(f"\n  Serialized roles: {serializer2.data['roles']}")
print(f"\n  Permissions count: {len(serializer2.data['permissions'])}")
if serializer2.data['permissions']:
    print(f"  Sample permissions (first 5):")
    for p in serializer2.data['permissions'][:5]:
        print(f"    - {p['module']}.{p['resource']} → {p['action']} (role: {p['role_name']})")

# Test with employee 10005 (Évi Varga - no departments)
emp3 = Employee.objects.get(employee_id='10005')
user3 = emp3.user
serializer3 = UserSerializer(user3)
print(f"\n\nEmployee 10005 ({user3.get_full_name()}):")
print(f"  Username: {user3.username}")
print(f"  Is superuser: {user3.is_superuser}")
print(f"  Departments: {[d.name for d in emp3.departments.all()]}")
print(f"\n  Serialized roles: {serializer3.data['roles']}")
print(f"\n  Permissions count: {len(serializer3.data['permissions'])}")

print("\n" + "="*80)
print("✓ Serializer test complete!")
