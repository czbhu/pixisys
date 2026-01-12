from django.core.management.base import BaseCommand
from apps.core.models import Role, Permission


class Command(BaseCommand):
    help = 'Alapértelmezett szerepkörök és jogosultságok létrehozása'

    def handle(self, *args, **options):
        self.stdout.write('Alapértelmezett szerepkörök létrehozása...')
        
        # Szerepkörök definíciója almodul szinten
        roles_config = {
            'Szuper Admin': {
                'description': 'Teljes hozzáférés minden modulhoz és funkcióhoz',
                'is_system': True,
                'permissions': 'all'
            },
            'Igazgatóság': {
                'description': 'Menedzsment szintű hozzáférés minden modulhoz',
                'is_system': True,
                'permissions': [
                    # HR - összes
                    ('hr', 'hr.employees', ['view', 'manage']),
                    ('hr', 'hr.departments', ['view', 'manage']),
                    ('hr', 'hr.positions', ['view', 'manage']),
                    ('hr', 'hr.payroll', ['view', 'manage']),
                    # Manufacturing - összes
                    ('manufacturing', 'manufacturing.projects', ['view', 'manage']),
                    ('manufacturing', 'manufacturing.work_sheets', ['view', 'manage']),
                    # Sales - összes
                    ('sales', 'sales.rfqs', ['view', 'manage']),
                    ('sales', 'sales.orders', ['view', 'manage']),
                    # CRM - összes
                    ('crm', 'crm.companies', ['view', 'manage']),
                    ('crm', 'crm.contacts', ['view', 'manage']),
                    # Finance - összes
                    ('finance', 'finance.invoices', ['view', 'manage']),
                    ('finance', 'finance.payments', ['view', 'manage']),
                    # Warehouse - összes
                    ('warehouse', 'warehouse.materials', ['view', 'manage']),
                    ('warehouse', 'warehouse.inventory', ['view', 'manage']),
                ]
            },
            'Adminisztráció': {
                'description': 'Adminisztratív feladatok végzése',
                'is_system': True,
                'permissions': [
                    ('hr', 'hr.employees', ['view', 'create', 'edit']),
                    ('hr', 'hr.departments', ['view', 'create', 'edit']),
                    ('sales', 'sales.rfqs', ['view', 'create', 'edit']),
                    ('sales', 'sales.orders', ['view', 'create', 'edit']),
                    ('crm', 'crm.companies', ['view', 'create', 'edit']),
                    ('crm', 'crm.contacts', ['view', 'create', 'edit']),
                    ('finance', 'finance.invoices', ['view', 'create', 'edit']),
                    ('warehouse', 'warehouse.materials', ['view', 'create', 'edit']),
                ]
            },
            'HR': {
                'description': 'HR modul kezelése',
                'is_system': True,
                'permissions': [
                    ('hr', 'hr.employees', ['view', 'create', 'edit', 'delete']),
                    ('hr', 'hr.departments', ['view', 'create', 'edit', 'delete']),
                    ('hr', 'hr.positions', ['view', 'create', 'edit', 'delete']),
                    ('hr', 'hr.attendance', ['view', 'create', 'edit']),
                    ('hr', 'hr.leave_requests', ['view', 'create', 'edit']),
                    ('hr', 'hr.payroll', ['view', 'create', 'edit']),
                ]
            },
            'Gyártás': {
                'description': 'Gyártási folyamatok kezelése',
                'is_system': True,
                'permissions': [
                    ('manufacturing', 'manufacturing.projects', ['view', 'create', 'edit']),
                    ('manufacturing', 'manufacturing.work_sheets', ['view', 'create', 'edit']),
                    ('manufacturing', 'manufacturing.products', ['view', 'create', 'edit']),
                    ('warehouse', 'warehouse.materials', ['view', 'edit']),
                    ('warehouse', 'warehouse.inventory', ['view']),
                ]
            },
            'Menedzser': {
                'description': 'Értékesítési és CRM tevékenység kezelése',
                'is_system': True,
                'permissions': [
                    ('sales', 'sales.rfqs', ['view', 'create', 'edit', 'delete']),
                    ('sales', 'sales.quotes', ['view', 'create', 'edit', 'delete']),
                    ('sales', 'sales.orders', ['view', 'create', 'edit']),
                    ('sales', 'sales.leads', ['view', 'create', 'edit']),
                    ('crm', 'crm.companies', ['view', 'create', 'edit', 'delete']),
                    ('crm', 'crm.contacts', ['view', 'create', 'edit', 'delete']),
                    ('finance', 'finance.invoices', ['view']),
                ]
            },
            'Alapvető': {
                'description': 'Alap szintű hozzáférés',
                'is_system': True,
                'permissions': [
                    ('hr', 'hr.employees', ['view']),
                    ('manufacturing', 'manufacturing.projects', ['view']),
                    ('sales', 'sales.rfqs', ['view']),
                    ('crm', 'crm.companies', ['view']),
                    ('crm', 'crm.contacts', ['view']),
                ]
            },
        }
        
        # Szerepkörök létrehozása
        for role_name, config in roles_config.items():
            role, created = Role.objects.get_or_create(
                name=role_name,
                defaults={
                    'description': config['description'],
                    'is_system': config['is_system']
                }
            )
            
            # Töröljük a meglévő jogosultságokat és újraépítjük
            if not created:
                self.stdout.write(self.style.WARNING(f'○ Szerepkör már létezik: {role_name} - jogosultságok frissítése...'))
                Permission.objects.filter(role=role).delete()
            else:
                self.stdout.write(self.style.SUCCESS(f'✓ Szerepkör létrehozva: {role_name}'))
            
            # Jogosultságok létrehozása
            if config['permissions'] == 'all':
                # Szuper Admin: minden almodul, minden művelet
                for resource_value, resource_label in Permission.RESOURCE_CHOICES:
                    module = resource_value.split('.')[0]
                    for action_value, action_label in Permission.ACTION_CHOICES:
                        Permission.objects.create(
                            role=role,
                            module=module,
                            resource=resource_value,
                            action=action_value,
                            allowed=True
                        )
            else:
                # Egyedi jogosultságok almodul szinten
                for module, resource, actions in config['permissions']:
                    for action in actions:
                        Permission.objects.create(
                            role=role,
                            module=module,
                            resource=resource,
                            action=action,
                            allowed=True
                        )
            
            self.stdout.write(self.style.SUCCESS(f'  → Jogosultságok hozzáadva/frissítve'))
        
        self.stdout.write(self.style.SUCCESS('\n✅ Alapértelmezett szerepkörök sikeresen létrehozva!'))
