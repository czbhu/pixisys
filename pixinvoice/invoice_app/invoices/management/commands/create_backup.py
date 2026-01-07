from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from invoices.models import BackupConfiguration, BackupFile
import os
import subprocess
from datetime import timedelta


class Command(BaseCommand):
    help = 'Create automatic database backups based on configuration using pg_dump'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force backup creation regardless of schedule',
        )

    def handle(self, *args, **options):
        force = options.get('force', False)
        
        # Create backups directory if not exists
        backup_dir = os.path.join(settings.BASE_DIR, 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        
        # Get active backup configurations
        configs = BackupConfiguration.objects.filter(is_active=True)
        
        if not configs.exists():
            self.stdout.write(self.style.WARNING('Nincs aktív backup konfiguráció'))
            return
        
        # Get database configuration
        db_config = settings.DATABASES['default']
        db_name = db_config['NAME']
        db_user = db_config['USER']
        db_host = db_config.get('HOST', 'localhost')
        db_port = db_config.get('PORT', '5432')
        db_password = db_config.get('PASSWORD', '')
        
        # Set environment variable for password
        env = os.environ.copy()
        if db_password:
            env['PGPASSWORD'] = db_password
        
        for config in configs:
            # Check if backup should run based on schedule
            if not force and config.last_backup:
                time_since_last = timezone.now() - config.last_backup
                
                if config.interval == 'daily' and time_since_last < timedelta(days=1):
                    self.stdout.write(f'Kihagyva: {config.name} - még nem telt el 1 nap')
                    continue
                elif config.interval == 'weekly' and time_since_last < timedelta(weeks=1):
                    self.stdout.write(f'Kihagyva: {config.name} - még nem telt el 1 hét')
                    continue
                elif config.interval == 'monthly' and time_since_last < timedelta(days=30):
                    self.stdout.write(f'Kihagyva: {config.name} - még nem telt el 1 hónap')
                    continue
            
            try:
                # Generate filename
                timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
                filename = f'{config.interval}_backup_{timestamp}.sql'
                filepath = os.path.join(backup_dir, filename)
                
                # Run pg_dump
                cmd = [
                    'pg_dump',
                    '-h', db_host,
                    '-p', str(db_port),
                    '-U', db_user,
                    '-F', 'c',  # Custom format (compressed)
                    '-f', filepath,
                    db_name
                ]
                
                subprocess.run(
                    cmd,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True
                )
                
                # Get file size
                file_size = os.path.getsize(filepath)
                
                # Create backup record
                BackupFile.objects.create(
                    configuration=config,
                    filename=filename,
                    filepath=filepath,
                    file_size=file_size,
                    is_manual=False
                )
                
                # Update last backup time
                config.last_backup = timezone.now()
                config.save()
                
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Backup készült: {config.name} ({file_size / (1024*1024):.2f} MB)')
                )
                
            except subprocess.CalledProcessError as e:
                self.stderr.write(
                    self.style.ERROR(f'✗ pg_dump hiba a {config.name} backup készítésekor: {e.stderr}')
                )
            except Exception as e:
                self.stderr.write(
                    self.style.ERROR(f'✗ Hiba a {config.name} backup készítésekor: {str(e)}')
                )
