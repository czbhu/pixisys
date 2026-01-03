from django.db import migrations


def create_default_backup_configs(apps, schema_editor):
    BackupConfiguration = apps.get_model('core', 'BackupConfiguration')
    
    # Create default configurations
    BackupConfiguration.objects.create(
        name='Napi automatikus mentés',
        interval='daily',
        retention_days=14,  # 2 weeks
        is_active=True
    )
    
    BackupConfiguration.objects.create(
        name='Heti automatikus mentés',
        interval='weekly',
        retention_days=60,  # 2 months
        is_active=True
    )


def reverse_seed(apps, schema_editor):
    BackupConfiguration = apps.get_model('core', 'BackupConfiguration')
    BackupConfiguration.objects.filter(
        name__in=['Napi automatikus mentés', 'Heti automatikus mentés']
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_backupconfiguration_backupfile'),
    ]

    operations = [
        migrations.RunPython(create_default_backup_configs, reverse_seed),
    ]
