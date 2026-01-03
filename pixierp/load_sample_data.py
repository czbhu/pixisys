#!/usr/bin/env python
"""
Minta adatok betöltése a test adatbázisba
"""
import os
import sys
import django

# Django setup
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth.models import User
from apps.hr.models import Department, Employee, AccessControlConfig
from apps.crm.models import Company
from decimal import Decimal
from datetime import date

def load_sample_data():
    print("🔄 Minta adatok betöltése...")
    
    # 1. Admin felhasználó már létezik
    admin_user = User.objects.get(username='admin@pixisys.eu')
    print(f"✅ Admin felhasználó: {admin_user.username}")
    
    # 2. Osztályok létrehozása
    print("\n📁 Osztályok létrehozása...")
    departments_data = [
        {'name': 'Ügyvezető', 'description': 'Vezetőség'},
        {'name': 'IT', 'description': 'Informatikai osztály'},
        {'name': 'Gyártás', 'description': 'Gyártási osztály'},
        {'name': 'Értékesítés', 'description': 'Értékesítési osztály'},
        {'name': 'Adminisztráció', 'description': 'Adminisztratív feladatok'},
    ]
    
    departments = {}
    for dept_data in departments_data:
        dept, created = Department.objects.get_or_create(
            name=dept_data['name'],
            defaults={'description': dept_data['description']}
        )
        departments[dept.name] = dept
        status = "létrehozva" if created else "már létezik"
        print(f"  • {dept.name}: {status}")
    
    # 3. Alkalmazottak létrehozása
    print("\n👥 Alkalmazottak létrehozása...")
    employees_data = [
        {
            'employee_id': 'EMP001',
            'user_data': {'username': 'kovacs.janos@pixisys.eu', 'email': 'kovacs.janos@pixisys.eu', 'first_name': 'János', 'last_name': 'Kovács'},
            'departments': ['Ügyvezető'],
            'hire_date': date(2020, 1, 15),
            'net_hourly_rate': Decimal('5000'),
        },
        {
            'employee_id': 'EMP002',
            'user_data': {'username': 'nagy.petra@pixisys.eu', 'email': 'nagy.petra@pixisys.eu', 'first_name': 'Petra', 'last_name': 'Nagy'},
            'departments': ['IT'],
            'hire_date': date(2021, 3, 1),
            'net_hourly_rate': Decimal('4000'),
        },
        {
            'employee_id': 'EMP003',
            'user_data': {'username': 'szabo.gabor@pixisys.eu', 'email': 'szabo.gabor@pixisys.eu', 'first_name': 'Gábor', 'last_name': 'Szabó'},
            'departments': ['Gyártás'],
            'hire_date': date(2019, 6, 10),
            'net_hourly_rate': Decimal('3500'),
        },
        {
            'employee_id': 'EMP004',
            'user_data': {'username': 'toth.anna@pixisys.eu', 'email': 'toth.anna@pixisys.eu', 'first_name': 'Anna', 'last_name': 'Tóth'},
            'departments': ['Értékesítés'],
            'hire_date': date(2020, 9, 1),
            'net_hourly_rate': Decimal('3800'),
        },
        {
            'employee_id': 'EMP005',
            'user_data': {'username': 'kiss.marton@pixisys.eu', 'email': 'kiss.marton@pixisys.eu', 'first_name': 'Márton', 'last_name': 'Kiss'},
            'departments': ['Gyártás'],
            'hire_date': date(2022, 2, 1),
            'net_hourly_rate': Decimal('2500'),
        },
        {
            'employee_id': 'EMP006',
            'user_data': {'username': 'molnar.eszter@pixisys.eu', 'email': 'molnar.eszter@pixisys.eu', 'first_name': 'Eszter', 'last_name': 'Molnár'},
            'departments': ['Adminisztráció'],
            'hire_date': date(2021, 11, 15),
            'net_hourly_rate': Decimal('2200'),
        },
    ]
    
    employees = []
    for emp_data in employees_data:
        dept_names = emp_data.pop('departments')
        user_data = emp_data.pop('user_data')
        
        # User létrehozása vagy lekérése
        user, user_created = User.objects.get_or_create(
            username=user_data['username'],
            defaults=user_data
        )
        
        # Employee létrehozása vagy lekérése
        emp, created = Employee.objects.get_or_create(
            employee_id=emp_data['employee_id'],
            defaults={'user': user, **emp_data}
        )
        
        if created:
            # Osztályok hozzárendelése
            for dept_name in dept_names:
                emp.departments.add(departments[dept_name])
        
        employees.append(emp)
        status = "létrehozva" if created else "már létezik"
        print(f"  • {user.first_name} {user.last_name} ({emp.employee_id}): {status}")
    
    # 4. Beléptető eszközök létrehozása
    print("\n🚪 Beléptető eszközök létrehozása...")
    devices_data = [
        {
            'name': 'Főbejárat - Nyomda',
            'device_id': '1001',
            'device_ip': '192.168.1.101',
            'device_port': 4370,
            'location': 'Nyomdai épület',
            'description': 'Nyomdai épület főbejárata - teljes hozzáférés',
            'is_active': True,
        },
        {
            'name': 'Iroda bejárat',
            'device_id': '1002',
            'device_ip': '192.168.1.102',
            'device_port': 4370,
            'location': 'Irodaépület',
            'description': 'Irodaépület bejárata - teljes hozzáférés',
            'is_active': True,
        },
        {
            'name': 'Gyártócsarnok',
            'device_id': '1003',
            'device_ip': '192.168.1.103',
            'device_port': 4370,
            'location': 'Gyártócsarnok',
            'description': 'Gyártócsarnok bejárata',
            'is_active': True,
        },
        {
            'name': 'Raktár',
            'device_id': '1004',
            'device_ip': '192.168.1.104',
            'device_port': 4370,
            'location': 'Raktár',
            'description': 'Raktár bejárata - jelenleg nem aktív',
            'is_active': False,
        },
    ]
    
    for device_data in devices_data:
        device, created = AccessControlConfig.objects.get_or_create(
            device_id=device_data['device_id'],
            defaults=device_data
        )
        status = "létrehozva" if created else "már létezik"
        print(f"  • {device.name} (ID: {device.device_id}): {status}")
    
    print("\n✅ Minta adatok sikeresen betöltve!")
    print("\n📊 Összesítés:")
    print(f"  • Osztályok: {Department.objects.count()}")
    print(f"  • Alkalmazottak: {Employee.objects.count()}")
    print(f"  • Beléptető eszközök: {AccessControlConfig.objects.count()}")

if __name__ == '__main__':
    load_sample_data()
