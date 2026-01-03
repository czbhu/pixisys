from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.hr.models import Department, Position, Employee
from apps.crm.models import Company, Contact
from apps.sales.models import Customer, Product, Quote, Order
from decimal import Decimal
from datetime import date, datetime

User = get_user_model()


class Command(BaseCommand):
    help = 'Minta adatokkal feltölti a rendszert'

    def handle(self, *args, **options):
        self.stdout.write('Minta adatok létrehozása...')
        
        # Osztályok létrehozása
        self.create_departments()
        
        # Pozíciók létrehozása
        self.create_positions()
        
        # Cégek létrehozása
        self.create_companies()
        
        # Alkalmazottak létrehozása
        self.create_employees()
        
        # Kapcsolattartók létrehozása
        self.create_contacts()
        
        # Ügyfelek létrehozása
        self.create_customers()
        
        # Termékek létrehozása
        self.create_products()
        
        self.stdout.write(
            self.style.SUCCESS('Minta adatok sikeresen létrehozva!')
        )

    def create_departments(self):
        departments_data = [
            {'name': 'Emberi Erőforrások', 'description': 'HR osztály'},
            {'name': 'Értékesítés', 'description': 'Sales osztály'},
            {'name': 'Gyártás', 'description': 'Manufacturing osztály'},
            {'name': 'Pénzügy', 'description': 'Finance osztály'},
            {'name': 'IT', 'description': 'Informatikai osztály'},
            {'name': 'Marketing', 'description': 'Marketing osztály'},
        ]
        
        for dept_data in departments_data:
            dept, created = Department.objects.get_or_create(
                name=dept_data['name'],
                defaults=dept_data
            )
            if created:
                self.stdout.write(f'Osztály létrehozva: {dept.name}')

    def create_positions(self):
        positions_data = [
            {'title': 'HR Menedzser', 'department_name': 'Emberi Erőforrások', 'description': 'HR vezető', 'salary_min': 800000, 'salary_max': 1200000},
            {'title': 'HR Szakember', 'department_name': 'Emberi Erőforrások', 'description': 'HR munkatárs', 'salary_min': 500000, 'salary_max': 700000},
            {'title': 'Értékesítési Igazgató', 'department_name': 'Értékesítés', 'description': 'Sales vezető', 'salary_min': 1000000, 'salary_max': 1500000},
            {'title': 'Értékesítő', 'department_name': 'Értékesítés', 'description': 'Sales munkatárs', 'salary_min': 400000, 'salary_max': 600000},
            {'title': 'Gyártási Menedzser', 'department_name': 'Gyártás', 'description': 'Manufacturing vezető', 'salary_min': 900000, 'salary_max': 1300000},
            {'title': 'Gyártási Munkatárs', 'department_name': 'Gyártás', 'description': 'Manufacturing munkatárs', 'salary_min': 350000, 'salary_max': 500000},
            {'title': 'Pénzügyi Igazgató', 'department_name': 'Pénzügy', 'description': 'Finance vezető', 'salary_min': 1200000, 'salary_max': 1800000},
            {'title': 'Könyvelő', 'department_name': 'Pénzügy', 'description': 'Accounting munkatárs', 'salary_min': 450000, 'salary_max': 650000},
            {'title': 'IT Menedzser', 'department_name': 'IT', 'description': 'IT vezető', 'salary_min': 1000000, 'salary_max': 1400000},
            {'title': 'Fejlesztő', 'department_name': 'IT', 'description': 'Software developer', 'salary_min': 600000, 'salary_max': 900000},
        ]
        
        for pos_data in positions_data:
            department = Department.objects.get(name=pos_data['department_name'])
            pos, created = Position.objects.get_or_create(
                title=pos_data['title'],
                department=department,
                defaults={
                    'description': pos_data['description'],
                    'salary_min': pos_data['salary_min'],
                    'salary_max': pos_data['salary_max'],
                }
            )
            if created:
                self.stdout.write(f'Pozíció létrehozva: {pos.title}')

    def create_companies(self):
        companies_data = [
            {
                'name': 'ABC Kft.',
                'tax_number': '12345678-1-41',
                'country': 'Magyarország',
                'postal_code': '1051',
                'city': 'Budapest',
                'street_name': 'Váci',
                'street_type': 'utca',
                'house_number': '1',
            },
            {
                'name': 'XYZ Zrt.',
                'tax_number': '87654321-2-41',
                'country': 'Magyarország',
                'postal_code': '4025',
                'city': 'Debrecen',
                'street_name': 'Piac',
                'street_type': 'utca',
                'house_number': '12',
            },
            {
                'name': 'Global Solutions Ltd.',
                'eu_tax_number': 'HU98765432',
                'country': 'Magyarország',
                'postal_code': '1117',
                'city': 'Budapest',
                'street_name': 'Korong',
                'street_type': 'utca',
                'house_number': '8',
            },
        ]
        
        for company_data in companies_data:
            company, created = Company.objects.get_or_create(
                name=company_data['name'],
                defaults=company_data
            )
            if created:
                self.stdout.write(f'Cég létrehozva: {company.name}')

    def create_employees(self):
        employees_data = [
            {
                'first_name': 'János',
                'last_name': 'Kovács',
                'email': 'janos.kovacs@company.com',
                'department_name': 'Emberi Erőforrások',
                'position_title': 'HR Menedzser',
                'gross_salary': 1000000,
                'net_salary': 665000,
                'hire_date': '2020-01-15',
                'birth_date': '1985-03-15',
                'gender': 'male',
                'tb_number': '123456789',
                'tax_number': '12345678-1-41',
                'address_postal_code': '1051',
                'address_city': 'Budapest',
                'address_street_name': 'Váci',
                'address_street_type': 'utca',
                'address_house_number': '1',
                'permission_level': 'manager',
            },
            {
                'first_name': 'Anna',
                'last_name': 'Nagy',
                'email': 'anna.nagy@company.com',
                'department_name': 'Értékesítés',
                'position_title': 'Értékesítő',
                'gross_salary': 550000,
                'net_salary': 365750,
                'hire_date': '2021-06-01',
                'birth_date': '1990-07-22',
                'gender': 'female',
                'tb_number': '987654321',
                'tax_number': '87654321-2-41',
                'address_postal_code': '4025',
                'address_city': 'Debrecen',
                'address_street_name': 'Piac',
                'address_street_type': 'utca',
                'address_house_number': '12',
                'permission_level': 'basic',
            },
            {
                'first_name': 'Péter',
                'last_name': 'Szabó',
                'email': 'peter.szabo@company.com',
                'department_name': 'IT',
                'position_title': 'Fejlesztő',
                'gross_salary': 750000,
                'net_salary': 498750,
                'hire_date': '2022-03-10',
                'birth_date': '1988-11-08',
                'gender': 'male',
                'tb_number': '456789123',
                'tax_number': '11223344-1-41',
                'address_postal_code': '1117',
                'address_city': 'Budapest',
                'address_street_name': 'Korong',
                'address_street_type': 'utca',
                'address_house_number': '8',
                'permission_level': 'basic',
            },
        ]
        
        for emp_data in employees_data:
            # Felhasználó létrehozása
            username = Employee.generate_username(emp_data['first_name'], emp_data['last_name'])
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': emp_data['email'],
                    'first_name': emp_data['first_name'],
                    'last_name': emp_data['last_name'],
                }
            )
            
            if created:
                user.set_password('password123')
                user.save()
                
                # Alkalmazott létrehozása
                department = Department.objects.get(name=emp_data['department_name'])
                position = Position.objects.get(title=emp_data['position_title'])
                
                employee = Employee.objects.create(
                    user=user,
                    employee_id=Employee.generate_employee_id(),
                    department=department,
                    position=position,
                    gross_salary=emp_data['gross_salary'],
                    net_salary=emp_data['net_salary'],
                    hire_date=emp_data['hire_date'],
                    birth_date=emp_data['birth_date'],
                    gender=emp_data['gender'],
                    tb_number=emp_data['tb_number'],
                    tax_number=emp_data['tax_number'],
                    address_country='Magyarország',
                    address_postal_code=emp_data['address_postal_code'],
                    address_city=emp_data['address_city'],
                    address_street_name=emp_data['address_street_name'],
                    address_street_type=emp_data['address_street_type'],
                    address_house_number=emp_data['address_house_number'],
                    permission_level=emp_data['permission_level'],
                    emergency_contact='Szülő',
                    emergency_phone='+36-30-123-4567',
                )
                
                self.stdout.write(f'Alkalmazott létrehozva: {employee.user.get_full_name()} ({employee.employee_id})')

    def create_contacts(self):
        contacts_data = [
            {
                'name': 'Kovács János',
                'phone': '+36-30-123-4567',
                'email': 'janos.kovacs@abc.hu',
                'company_name': 'ABC Kft.',
            },
            {
                'name': 'Nagy Anna',
                'phone': '+36-30-987-6543',
                'email': 'anna.nagy@xyz.hu',
                'company_name': 'XYZ Zrt.',
            },
            {
                'name': 'Szabó Péter',
                'phone': '+36-30-555-1234',
                'email': 'peter.szabo@global.com',
                'company_name': 'Global Solutions Ltd.',
            },
        ]
        
        for contact_data in contacts_data:
            company = Company.objects.get(name=contact_data['company_name'])
            contact, created = Contact.objects.get_or_create(
                name=contact_data['name'],
                company=company,
                defaults={
                    'phone': contact_data['phone'],
                    'email': contact_data['email'],
                }
            )
            if created:
                self.stdout.write(f'Kapcsolattartó létrehozva: {contact.name}')

    def create_customers(self):
        customers_data = [
            {
                'name': 'ABC Kft.',
                'email': 'info@abc.hu',
                'phone': '+36-1-123-4567',
                'address': '1051 Budapest, Váci utca 1.',
            },
            {
                'name': 'XYZ Zrt.',
                'email': 'info@xyz.hu',
                'phone': '+36-52-987-6543',
                'address': '4025 Debrecen, Piac utca 12.',
            },
        ]
        
        for customer_data in customers_data:
            customer, created = Customer.objects.get_or_create(
                name=customer_data['name'],
                defaults=customer_data
            )
            if created:
                self.stdout.write(f'Ügyfél létrehozva: {customer.name}')

    def create_products(self):
        products_data = [
            {
                'name': 'Alaptermék A',
                'description': 'Alaptermék leírása',
                'unit': 'db',
                'base_price': 10000,
            },
            {
                'name': 'Prémium termék B',
                'description': 'Prémium termék leírása',
                'unit': 'db',
                'base_price': 25000,
            },
            {
                'name': 'Speciális termék C',
                'description': 'Speciális termék leírása',
                'unit': 'db',
                'base_price': 50000,
            },
        ]
        
        for product_data in products_data:
            product, created = Product.objects.get_or_create(
                name=product_data['name'],
                defaults=product_data
            )
            if created:
                self.stdout.write(f'Termék létrehozva: {product.name}')
