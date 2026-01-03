from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from datetime import datetime, timedelta
import random

from apps.core.models import Company, Currency
from apps.hr.models import Department, Position, Employee
from apps.sales.models import Customer, Product, QuoteRequest, Quote, QuoteItem, Order, OrderItem, Lead, Opportunity, Forecast
from apps.crm.models import Company as CRMCompany, Contact
from apps.manufacturing.models import (
    ProductClass, Project, ManufacturingProduct, WorkOrder, WorkOrderItem,
    Inventory, InventoryTransaction, QualityControl, BOM
)

User = get_user_model()


class Command(BaseCommand):
    help = 'Load sample data for the PixiERP system'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before loading sample data',
        )

    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write('Clearing existing data...')
            self.clear_data()

        self.stdout.write('Loading sample data...')
        
        with transaction.atomic():
            # Create currencies
            self.create_currencies()
            
            # Create company
            self.create_company()
            
            # Create users
            self.create_users()
            
            # Create HR data
            self.create_hr_data()
            
            # Create sales data
            self.create_sales_data()
            
            # Create CRM data
            self.create_crm_data()
            
            # Create manufacturing data
            self.create_manufacturing_data()
            
            # Create relationships
            self.create_relationships()

        self.stdout.write(
            self.style.SUCCESS('Successfully loaded sample data!')
        )

    def clear_data(self):
        """Clear existing data"""
        models_to_clear = [
            InventoryTransaction, QualityControl, BOM, Inventory,
            WorkOrderItem, WorkOrder, ManufacturingProduct, Project, ProductClass,
            OrderItem, Order, QuoteItem, Quote, QuoteRequest,
            Contact, CRMCompany, Opportunity, Lead, Forecast,
            Product, Customer, Employee, Position, Department,
            Company, Currency
        ]
        
        for model in models_to_clear:
            model.objects.all().delete()

    def create_currencies(self):
        """Create currencies"""
        currencies = [
            {'code': 'HUF', 'name': 'Magyar Forint', 'symbol': 'Ft', 'is_default': True},
            {'code': 'EUR', 'name': 'Euro', 'symbol': '€', 'is_default': False},
            {'code': 'USD', 'name': 'US Dollar', 'symbol': '$', 'is_default': False},
        ]
        
        for currency_data in currencies:
            Currency.objects.get_or_create(
                code=currency_data['code'],
                defaults=currency_data
            )

    def create_company(self):
        """Create main company"""
        Company.objects.get_or_create(
            name='Pixisys Kft.',
            defaults={
                'tax_number': '12345678-1-41',
                'address': 'Budapest, Váci út 1.',
                'phone': '+36-1-234-5678',
                'email': 'info@pixisys.hu',
                'website': 'https://www.pixisys.hu'
            }
        )

    def create_users(self):
        """Create users"""
        users_data = [
            {
                'username': 'admin',
                'email': 'admin@pixisys.hu',
                'first_name': 'Admin',
                'last_name': 'User',
                'is_staff': True,
                'is_superuser': True
            },
            {
                'username': 'john.doe',
                'email': 'john.doe@pixisys.hu',
                'first_name': 'John',
                'last_name': 'Doe',
                'is_staff': True
            },
            {
                'username': 'jane.smith',
                'email': 'jane.smith@pixisys.hu',
                'first_name': 'Jane',
                'last_name': 'Smith',
                'is_staff': True
            },
            {
                'username': 'mike.johnson',
                'email': 'mike.johnson@pixisys.hu',
                'first_name': 'Mike',
                'last_name': 'Johnson',
                'is_staff': True
            },
            {
                'username': 'sarah.wilson',
                'email': 'sarah.wilson@pixisys.hu',
                'first_name': 'Sarah',
                'last_name': 'Wilson',
                'is_staff': True
            }
        ]
        
        for user_data in users_data:
            user, created = User.objects.get_or_create(
                username=user_data['username'],
                defaults=user_data
            )
            if created:
                user.set_password('password123')
                user.save()

    def create_hr_data(self):
        """Create HR data"""
        # Create departments
        departments_data = [
            {'name': 'Irányítás', 'description': 'Vezetőség'},
            {'name': 'Értékesítés', 'description': 'Értékesítési osztály'},
            {'name': 'Gyártás', 'description': 'Gyártási osztály'},
            {'name': 'Pénzügy', 'description': 'Pénzügyi osztály'},
            {'name': 'HR', 'description': 'Humán erőforrások'},
            {'name': 'IT', 'description': 'Informatikai osztály'},
        ]
        
        departments = []
        for dept_data in departments_data:
            dept, created = Department.objects.get_or_create(
                name=dept_data['name'],
                defaults=dept_data
            )
            departments.append(dept)

        # Create positions
        positions_data = [
            {'title': 'Ügyvezető', 'department': departments[0], 'salary_min': 1000000, 'salary_max': 2000000},
            {'title': 'Értékesítési vezető', 'department': departments[1], 'salary_min': 600000, 'salary_max': 1200000},
            {'title': 'Értékesítő', 'department': departments[1], 'salary_min': 400000, 'salary_max': 800000},
            {'title': 'Gyártási vezető', 'department': departments[2], 'salary_min': 500000, 'salary_max': 1000000},
            {'title': 'Gyártási munkatárs', 'department': departments[2], 'salary_min': 300000, 'salary_max': 600000},
            {'title': 'Pénzügyi vezető', 'department': departments[3], 'salary_min': 550000, 'salary_max': 1100000},
            {'title': 'Könyvelő', 'department': departments[3], 'salary_min': 350000, 'salary_max': 700000},
            {'title': 'HR vezető', 'department': departments[4], 'salary_min': 500000, 'salary_max': 1000000},
            {'title': 'Rendszergazda', 'department': departments[5], 'salary_min': 450000, 'salary_max': 900000},
        ]
        
        positions = []
        for pos_data in positions_data:
            pos, created = Position.objects.get_or_create(
                title=pos_data['title'],
                department=pos_data['department'],
                defaults={
                    'description': f'{pos_data["title"]} pozíció',
                    'requirements': f'{pos_data["title"]} pozíció követelményei',
                    'salary_min': pos_data['salary_min'],
                    'salary_max': pos_data['salary_max']
                }
            )
            positions.append(pos)

        # Create employees
        users = User.objects.filter(is_staff=True)
        for i, user in enumerate(users):
            if i < len(positions):
                Employee.objects.get_or_create(
                    user=user,
                    defaults={
                        'employee_id': f'EMP{i+1:03d}',
                        'position': positions[i],
                        'tb_number': f'12345678{i+1:02d}',
                        'tax_number': f'12345678-{i+1}-41',
                        'birth_first_name': user.first_name,
                        'birth_last_name': user.last_name,
                        'birth_place': 'Budapest',
                        'birth_date': timezone.now().date() - timedelta(days=random.randint(7000, 12000)),
                        'gender': random.choice(['male', 'female']),
                        'mother_first_name': f'Anyja{i+1}',
                        'mother_last_name': user.last_name,
                        'gross_salary': random.randint(300000, 800000),
                        'net_salary': random.randint(200000, 550000),
                        'address_country': 'Magyarország',
                        'address_postal_code': f'1{i+1:03d}0',
                        'address_city': 'Budapest',
                        'address_street_name': f'Váci út {i+1}',
                        'address_street_type': 'utca',
                        'address_house_number': f'{i+1}',
                    }
                )

    def create_sales_data(self):
        """Create sales data"""
        # Create customers
        customers_data = [
            {
                'name': 'Kovács János',
                'company': 'Kovács Kft.',
                'email': 'kovacs@kovacs.hu',
                'phone': '+36-30-123-4567',
                'address': 'Budapest, Kossuth Lajos utca 10.',
                'tax_number': '87654321-1-41',
                'contact_person': 'Kovács János'
            },
            {
                'name': 'Nagy Péter',
                'company': 'Nagy Zrt.',
                'email': 'nagy@nagy.hu',
                'phone': '+36-30-234-5678',
                'address': 'Debrecen, Piac utca 5.',
                'tax_number': '11223344-1-41',
                'contact_person': 'Nagy Péter'
            },
            {
                'name': 'Szabó Anna',
                'company': 'Szabó Kft.',
                'email': 'szabo@szabo.hu',
                'phone': '+36-30-345-6789',
                'address': 'Szeged, Dóm tér 2.',
                'tax_number': '55667788-1-41',
                'contact_person': 'Szabó Anna'
            }
        ]
        
        customers = []
        for customer_data in customers_data:
            customer, created = Customer.objects.get_or_create(
                name=customer_data['name'],
                defaults=customer_data
            )
            customers.append(customer)

        # Create products
        products_data = [
            {'name': 'Weboldal fejlesztés', 'description': 'Egyedi weboldal fejlesztés', 'unit': 'db', 'base_price': 500000},
            {'name': 'Mobil alkalmazás', 'description': 'iOS és Android alkalmazás', 'unit': 'db', 'base_price': 800000},
            {'name': 'E-kereskedelmi rendszer', 'description': 'Online webshop fejlesztés', 'unit': 'db', 'base_price': 1200000},
            {'name': 'ERP rendszer', 'description': 'Vállalati erőforrás tervező', 'unit': 'db', 'base_price': 2000000},
            {'name': 'Adatbázis tervezés', 'description': 'Adatbázis architektúra és implementáció', 'unit': 'óra', 'base_price': 15000},
            {'name': 'Karbantartás', 'description': 'Havi karbantartási szolgáltatás', 'unit': 'hónap', 'base_price': 50000},
        ]
        
        products = []
        for product_data in products_data:
            product, created = Product.objects.get_or_create(
                name=product_data['name'],
                defaults=product_data
            )
            products.append(product)

        # Create leads
        leads_data = [
            {'name': 'Tóth István', 'company': 'Tóth Kft.', 'email': 'toth@toth.hu', 'phone': '+36-30-456-7890', 'status': 'new'},
            {'name': 'Varga Mária', 'company': 'Varga Zrt.', 'email': 'varga@varga.hu', 'phone': '+36-30-567-8901', 'status': 'contacted'},
            {'name': 'Molnár Gábor', 'company': 'Molnár Kft.', 'email': 'molnar@molnar.hu', 'phone': '+36-30-678-9012', 'status': 'qualified'},
        ]
        
        leads = []
        for lead_data in leads_data:
            lead, created = Lead.objects.get_or_create(
                name=lead_data['name'],
                defaults=lead_data
            )
            leads.append(lead)

        # Create opportunities
        for i, lead in enumerate(leads):
            Opportunity.objects.get_or_create(
                lead=lead,
                title=f'Projekt {i+1}',
                defaults={
                    'value': random.randint(500000, 2000000),
                    'probability': random.randint(20, 90),
                    'expected_close_date': timezone.now().date() + timedelta(days=random.randint(30, 180)),
                    'status': random.choice(['prospecting', 'qualification', 'proposal', 'negotiation'])
                }
            )

        # Create forecasts
        for month in range(1, 13):
            Forecast.objects.get_or_create(
                period=f'2024-{month:02d}',
                defaults={
                    'expected_revenue': random.randint(2000000, 5000000),
                    'actual_revenue': random.randint(1500000, 4500000)
                }
            )

        # Create quote requests and quotes
        for i, customer in enumerate(customers):
            quote_request, created = QuoteRequest.objects.get_or_create(
                customer=customer,
                request_number=f'QR{i+1:03d}',
                defaults={
                    'title': f'Projekt ajánlatkérés {i+1}',
                    'description': f'Részletes projekt leírás {i+1}',
                    'status': random.choice(['new', 'in_progress', 'quoted']),
                    'requested_by': User.objects.first(),
                    'deadline': timezone.now().date() + timedelta(days=30)
                }
            )
            
            if created:
                quote, created = Quote.objects.get_or_create(
                    quote_request=quote_request,
                    quote_number=f'Q{i+1:03d}',
                    defaults={
                        'status': 'accepted' if i == 0 else random.choice(['draft', 'sent', 'accepted']),
                        'valid_until': timezone.now().date() + timedelta(days=30),
                        'total_amount': 0,
                        'created_by': User.objects.first()
                    }
                )
                
                if created:
                    # Add quote items
                    selected_products = random.sample(products, random.randint(1, 3))
                    total_amount = 0
                    
                    for product in selected_products:
                        quantity = random.randint(1, 5)
                        unit_price = product.base_price
                        total_price = quantity * unit_price
                        total_amount += total_price
                        
                        QuoteItem.objects.create(
                            quote=quote,
                            product=product,
                            quantity=quantity,
                            unit_price=unit_price,
                            total_price=total_price,
                            description=f'{product.name} részletes leírás'
                        )
                    
                    quote.total_amount = total_amount
                    quote.save()
                    
                    # Create order if quote is accepted
                    if quote.status == 'accepted':
                        order, created = Order.objects.get_or_create(
                            quote=quote,
                            order_number=f'O{i+1:03d}',
                            defaults={
                                'status': random.choice(['draft', 'confirmed', 'in_production']),
                                'total_amount': total_amount,
                                'delivery_date': timezone.now().date() + timedelta(days=60),
                                'created_by': User.objects.first()
                            }
                        )
                        
                        if created:
                            # Add order items
                            for quote_item in quote.items.all():
                                OrderItem.objects.create(
                                    order=order,
                                    product=quote_item.product,
                                    quantity=quote_item.quantity,
                                    unit_price=quote_item.unit_price,
                                    total_price=quote_item.total_price,
                                    description=quote_item.description
                                )

    def create_crm_data(self):
        """Create CRM data"""
        # Create CRM companies
        crm_companies_data = [
            {
                'name': 'ABC Kft.',
                'tax_number': '11111111-1-41',
                'country': 'Magyarország',
                'postal_code': '1051',
                'city': 'Budapest',
                'street_name': 'Váci utca',
                'street_type': 'utca',
                'house_number': '1',
            },
            {
                'name': 'XYZ Zrt.',
                'tax_number': '22222222-1-41',
                'country': 'Magyarország',
                'postal_code': '4025',
                'city': 'Debrecen',
                'street_name': 'Piac utca',
                'street_type': 'utca',
                'house_number': '10',
            },
            {
                'name': 'DEF Kft.',
                'tax_number': '33333333-1-41',
                'country': 'Magyarország',
                'postal_code': '6720',
                'city': 'Szeged',
                'street_name': 'Dóm tér',
                'street_type': 'tér',
                'house_number': '2',
            }
        ]
        
        crm_companies = []
        for company_data in crm_companies_data:
            company, created = CRMCompany.objects.get_or_create(
                name=company_data['name'],
                defaults=company_data
            )
            crm_companies.append(company)

        # Create contacts
        contacts_data = [
            {'name': 'Kiss János', 'phone': '+36-30-111-1111', 'email': 'kiss@abc.hu', 'company': crm_companies[0], 'position': 'Ügyvezető'},
            {'name': 'Nagy Péter', 'phone': '+36-30-222-2222', 'email': 'nagy@xyz.hu', 'company': crm_companies[1], 'position': 'Projektvezető'},
            {'name': 'Szabó Anna', 'phone': '+36-30-333-3333', 'email': 'szabo@def.hu', 'company': crm_companies[2], 'position': 'IT vezető'},
        ]
        
        for contact_data in contacts_data:
            Contact.objects.get_or_create(
                name=contact_data['name'],
                company=contact_data['company'],
                defaults=contact_data
            )

    def create_manufacturing_data(self):
        """Create manufacturing data"""
        # Create product classes
        product_classes_data = [
            {'name': 'Szoftver fejlesztés', 'is_default': True},
            {'name': 'Hardver', 'is_default': False},
            {'name': 'Szolgáltatás', 'is_default': False},
        ]
        
        product_classes = []
        for pc_data in product_classes_data:
            pc, created = ProductClass.objects.get_or_create(
                name=pc_data['name'],
                defaults=pc_data
            )
            product_classes.append(pc)

        # Create projects
        projects_data = [
            {'name': 'Weboldal fejlesztési projekt', 'description': 'Egyedi weboldal fejlesztés', 'deadline': timezone.now().date() + timedelta(days=90)},
            {'name': 'Mobil alkalmazás projekt', 'description': 'iOS és Android alkalmazás fejlesztés', 'deadline': timezone.now().date() + timedelta(days=120)},
            {'name': 'ERP rendszer projekt', 'description': 'Vállalati erőforrás tervező rendszer', 'deadline': timezone.now().date() + timedelta(days=180)},
        ]
        
        projects = []
        for project_data in projects_data:
            project, created = Project.objects.get_or_create(
                name=project_data['name'],
                defaults=project_data
            )
            projects.append(project)

        # Create manufacturing products
        contacts = Contact.objects.all()
        currency = Currency.objects.get(code='HUF')
        
        manufacturing_products_data = [
            {
                'name': 'Weboldal fejlesztés',
                'description': 'Egyedi weboldal fejlesztés',
                'quantity': 1,
                'product_class': product_classes[0],
                'project': projects[0],
                'net_unit_price': 500000,
                'currency': currency,
                'contact': contacts[0] if contacts else None,
                'deadline': timezone.now().date() + timedelta(days=90)
            },
            {
                'name': 'Mobil alkalmazás',
                'description': 'iOS és Android alkalmazás',
                'quantity': 1,
                'product_class': product_classes[0],
                'project': projects[1],
                'net_unit_price': 800000,
                'currency': currency,
                'contact': contacts[1] if len(contacts) > 1 else None,
                'deadline': timezone.now().date() + timedelta(days=120)
            },
        ]
        
        for mp_data in manufacturing_products_data:
            ManufacturingProduct.objects.get_or_create(
                name=mp_data['name'],
                project=mp_data['project'],
                defaults=mp_data
            )

        # Create inventory
        products = Product.objects.all()
        for product in products:
            Inventory.objects.get_or_create(
                product=product,
                defaults={
                    'quantity': random.randint(0, 100),
                    'location': f'Raktár {random.randint(1, 3)}',
                    'min_stock': 10,
                    'max_stock': 100
                }
            )

    def create_relationships(self):
        """Create relationships between data"""
        # Add employees to departments
        employees = Employee.objects.all()
        departments = Department.objects.all()
        
        for employee in employees:
            if employee.position and employee.position.department:
                employee.departments.add(employee.position.department)
        
        # Add contacts to projects
        projects = Project.objects.all()
        contacts = Contact.objects.all()
        
        for project in projects:
            if contacts:
                project.contacts.add(random.choice(contacts))
        
        # Set project managers
        users = User.objects.filter(is_staff=True)
        for project in projects:
            if users:
                project.project_manager = random.choice(users)
                project.save()
