from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from apps.core.models import BackupConfiguration, BackupFile
import os
import shutil
import subprocess
from datetime import timedelta


class Command(BaseCommand):
    help = 'Create automatic database backups based on configuration'

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval',
            type=str,
            choices=['daily', 'weekly', 'monthly'],
            help='Specify backup interval to run',
        )

    def handle(self, *args, **options):
        interval = options.get('interval')
        
        # Get active configurations
        configs = BackupConfiguration.objects.filter(is_active=True)
        
        if interval:
            configs = configs.filter(interval=interval)
        
        if not configs.exists():
            self.stdout.write(self.style.WARNING('Nincs aktív backup konfiguráció'))
            return
        
        # Create backups directory if not exists
        backup_dir = os.path.join(settings.BASE_DIR, 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        
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
            # Check if backup is needed based on interval
            if config.last_backup:
                time_since_last = timezone.now() - config.last_backup
                
                if config.interval == 'daily' and time_since_last < timedelta(days=1):
                    self.stdout.write(f'Kihagyva: {config.name} - még nem telt el 1 nap')
                    continue
                elif config.interval == 'weekly' and time_since_last < timedelta(days=7):
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
                    self.style.SUCCESS(f'Backup sikeresen létrehozva: {filename} ({file_size / (1024*1024):.2f} MB)')
                )
                
                # Cleanup old backups based on retention policy
                cutoff_date = timezone.now() - timedelta(days=config.retention_days)
                old_backups = BackupFile.objects.filter(
                    configuration=config,
                    created_at__lt=cutoff_date,
                    is_manual=False
                )
                
                deleted_count = 0
                for backup in old_backups:
                    if os.path.exists(backup.filepath):
                        os.remove(backup.filepath)
                    backup.delete()
                    deleted_count += 1
                
                if deleted_count > 0:
                    self.stdout.write(
                        self.style.SUCCESS(f'{deleted_count} régi backup törölve ({config.name})')
                    )
                
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Hiba a backup létrehozása során ({config.name}): {str(e)}')
                )
