#!/usr/bin/env python
"""Remove individual UserRole assignments and Permission objects"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.core.models import UserRole, Permission

print("Checking individual assignments...\n")

# Individual UserRole assignments
user_roles = UserRole.objects.all()
print(f"Individual UserRole assignments: {user_roles.count()}")
for ur in user_roles:
    print(f"  - User: {ur.user.username}, Role: {ur.role.name}")

# Individual Permission objects (user-level)
user_perms = Permission.objects.filter(user__isnull=False)
print(f"\nIndividual user-level Permissions: {user_perms.count()}")
for p in user_perms:
    print(f"  - User: {p.user.username}, {p.module}.{p.resource} -> {p.action}")

print("\n" + "="*80)
print("REMOVING individual assignments...")
print("="*80 + "\n")

# Delete individual UserRole assignments
deleted_count = user_roles.count()
user_roles.delete()
print(f"Deleted {deleted_count} individual UserRole assignments")

# Delete individual Permission objects
deleted_count = user_perms.count()
user_perms.delete()
print(f"Deleted {deleted_count} individual user-level Permission objects")

print("\n✓ Individual assignments removed successfully!")
print("  Now only department-level role assignments will be used.")
