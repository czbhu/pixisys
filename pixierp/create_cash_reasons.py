#!/usr/bin/env python
"""
Script to create initial cash transaction reasons
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, '/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.finance.models import CashTransactionReason

# Define initial reasons
reasons = [
    {'name': 'Fölözés', 'is_deposit': False, 'is_withdrawal': True, 'order': 1},
    {'name': 'Kassza mozgatás', 'is_deposit': True, 'is_withdrawal': True, 'order': 2},
    {'name': 'Áru/szolgáltatás kifizetés', 'is_deposit': False, 'is_withdrawal': True, 'order': 3},
    {'name': 'Váltópénz betét', 'is_deposit': True, 'is_withdrawal': False, 'order': 4},
    {'name': 'Napnyitás', 'is_deposit': True, 'is_withdrawal': False, 'order': 5},
    {'name': 'Napzárás', 'is_deposit': False, 'is_withdrawal': True, 'order': 6},
    {'name': 'Kassza átvétel', 'is_deposit': True, 'is_withdrawal': True, 'order': 7},
]

print("Creating initial cash transaction reasons...")

for reason_data in reasons:
    reason, created = CashTransactionReason.objects.get_or_create(
        name=reason_data['name'],
        defaults={
            'is_deposit': reason_data['is_deposit'],
            'is_withdrawal': reason_data['is_withdrawal'],
            'is_active': True,
            'order': reason_data['order'],
        }
    )
    if created:
        print(f"✓ Created: {reason.name}")
    else:
        print(f"- Already exists: {reason.name}")

print("\nDone! Created/verified transaction reasons.")
