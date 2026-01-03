"""
Minta adatok generálása az Employee Analytics teszteléséhez
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import datetime, timedelta
from decimal import Decimal
import random

from apps.hr.models import Employee, TimeLog, AccessLog, ProjectParticipation
from apps.manufacturing.models import Project, WorkOrder

User = get_user_model()


class Command(BaseCommand):
    help = 'Minta adatok generálása az Employee Analytics funkcióhoz'

    def handle(self, *args, **kwargs):
        self.stdout.write('Minta adatok generálása...')
        
        # Projektek frissítése profit adatokkal
        projects = Project.objects.all()
        for project in projects:
            project.total_revenue = Decimal(random.randint(1000000, 5000000))
            project.total_cost = Decimal(random.randint(500000, 3000000))
            project.calculate_profit()
            self.stdout.write(f'✓ Projekt frissítve: {project.name} - Profit: {project.profit} Ft')
        
        # Alkalmazottak lekérése
        employees = Employee.objects.all()[:5]  # Első 5 alkalmazott
        
        if not employees:
            self.stdout.write(self.style.WARNING('Nincsenek alkalmazottak az adatbázisban!'))
            return
        
        # ProjectParticipation létrehozása
        for project in projects[:3]:  # Első 3 projekt
            # 2-3 alkalmazott projektenként
            project_employees = random.sample(list(employees), k=min(3, len(employees)))
            
            for i, employee in enumerate(project_employees):
                # Szerepek
                roles = ['Projektvezető', 'Fejlesztő', 'Tervező', 'Minőségbiztosító']
                role = roles[i] if i < len(roles) else 'Közreműködő'
                
                # Részesedési arány
                if i == 0:  # Projektvezető
                    percentage = Decimal('30.00')
                else:
                    percentage = Decimal(str(random.randint(10, 25)))
                
                participation, created = ProjectParticipation.objects.get_or_create(
                    employee=employee,
                    project=project,
                    role=role,
                    defaults={
                        'participation_percentage': percentage,
                        'start_date': timezone.now().date() - timedelta(days=random.randint(30, 180)),
                        'end_date': None if project.status == 'open' else timezone.now().date(),
                        'is_active': project.status == 'open',
                        'contribution_description': f'{role} szerepkörben való részvétel'
                    }
                )
                
                if created:
                    self.stdout.write(f'✓ Projekt részvétel: {employee.user.get_full_name()} - {project.name} ({role})')
        
        # TimeLog bejegyzések létrehozása (utolsó 30 napra)
        work_orders = WorkOrder.objects.all()
        
        for _ in range(50):  # 50 time log bejegyzés
            employee = random.choice(employees)
            project = random.choice(list(projects[:3]))
            
            # Random dátum az elmúlt 30 napból
            days_ago = random.randint(0, 30)
            log_date = timezone.now() - timedelta(days=days_ago)
            
            # Random időtartam (2-8 óra)
            hours = Decimal(str(random.randint(2, 8))) + Decimal(str(random.randint(0, 99))) / 100
            
            start_time = log_date.replace(hour=random.randint(8, 16), minute=0, second=0, microsecond=0)
            end_time = start_time + timedelta(hours=float(hours))
            
            tasks = [
                'Fejlesztési feladatok',
                'Tervezés',
                'Kódolás',
                'Tesztelés',
                'Dokumentáció készítése',
                'Megbeszélés',
                'Code review',
                'Bug fixing'
            ]
            
            TimeLog.objects.create(
                employee=employee,
                project=project,
                work_order=random.choice(work_orders) if work_orders and random.random() > 0.5 else None,
                task_description=random.choice(tasks),
                start_time=start_time,
                end_time=end_time,
                duration_hours=hours,
                is_billable=random.random() > 0.2,  # 80% számlázható
                notes=f'Munka {project.name} projekten'
            )
        
        self.stdout.write(f'✓ {50} TimeLog bejegyzés létrehozva')
        
        # AccessLog bejegyzések létrehozása (utolsó 30 napra)
        locations = ['Főiroda', 'Telephely 1', 'Telephely 2', 'Home Office']
        
        for employee in employees:
            # Minden alkalmazottnak 20-25 nap munkavégzés
            work_days = random.randint(20, 25)
            
            for day in range(work_days):
                days_ago = random.randint(0, 30)
                access_date = timezone.now() - timedelta(days=days_ago)
                
                # Belépés 7-9 óra között
                check_in_hour = random.randint(7, 9)
                check_in_minute = random.randint(0, 59)
                check_in_time = access_date.replace(
                    hour=check_in_hour,
                    minute=check_in_minute,
                    second=0,
                    microsecond=0
                )
                
                # Kilépés 16-19 óra között
                check_out_hour = random.randint(16, 19)
                check_out_minute = random.randint(0, 59)
                check_out_time = access_date.replace(
                    hour=check_out_hour,
                    minute=check_out_minute,
                    second=0,
                    microsecond=0
                )
                
                # Csak akkor hozzuk létre, ha még nem létezik ezen a napon
                existing = AccessLog.objects.filter(
                    employee=employee,
                    check_in_time__date=access_date.date()
                ).exists()
                
                if not existing:
                    AccessLog.objects.create(
                        employee=employee,
                        check_in_time=check_in_time,
                        check_out_time=check_out_time,
                        location=random.choice(locations),
                        notes='Normál munkanap'
                    )
        
        total_access_logs = AccessLog.objects.count()
        self.stdout.write(f'✓ {total_access_logs} AccessLog bejegyzés létrehozva')
        
        # Összesítés
        self.stdout.write(self.style.SUCCESS('\n=== Összesítés ==='))
        self.stdout.write(f'Projektek száma: {projects.count()}')
        self.stdout.write(f'Projekt résztvevők száma: {ProjectParticipation.objects.count()}')
        self.stdout.write(f'TimeLog bejegyzések száma: {TimeLog.objects.count()}')
        self.stdout.write(f'AccessLog bejegyzések száma: {AccessLog.objects.count()}')
        
        self.stdout.write(self.style.SUCCESS('\nMinta adatok sikeresen létrehozva!'))
