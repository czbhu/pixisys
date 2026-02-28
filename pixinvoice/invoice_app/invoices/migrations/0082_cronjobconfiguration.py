from django.db import migrations, models
import django.db.models.deletion
import uuid


def seed_cron_jobs(apps, schema_editor):
    CronJobConfiguration = apps.get_model('invoices', 'CronJobConfiguration')

    defaults = [
        {
            'job_key': 'scheduled_invoices',
            'name': 'Időzített számlák feldolgozása',
            'description': 'A soron következő időzített számlák kiállítása és opcionális e-mail küldése.',
            'command_name': 'process_scheduled_invoices',
            'cron_expression': '*/5 * * * *',
            'is_active': True,
        },
        {
            'job_key': 'auto_backup',
            'name': 'Automatikus adatbázis mentés',
            'description': 'A backup konfiguráció alapján automatikus adatbázis mentések készítése.',
            'command_name': 'create_backup',
            'cron_expression': '0 2 * * *',
            'is_active': True,
        },
    ]

    for item in defaults:
        CronJobConfiguration.objects.get_or_create(
            job_key=item['job_key'],
            defaults=item,
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0081_scheduledinvoice_scheduledinvoicerun_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='CronJobConfiguration',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('job_key', models.CharField(max_length=80, unique=True)),
                ('name', models.CharField(max_length=140)),
                ('description', models.TextField(blank=True, null=True)),
                ('command_name', models.CharField(max_length=140)),
                ('cron_expression', models.CharField(default='*/5 * * * *', max_length=100)),
                ('is_active', models.BooleanField(default=True)),
                ('last_run_at', models.DateTimeField(blank=True, null=True)),
                ('last_status', models.CharField(choices=[('idle', 'Még nem futott'), ('ok', 'Sikeres'), ('error', 'Hibás')], default='idle', max_length=16)),
                ('last_message', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_cron_jobs', to='auth.user')),
            ],
            options={
                'verbose_name': 'Cron Job Configuration',
                'verbose_name_plural': 'Cron Job Configurations',
                'ordering': ['name'],
            },
        ),
        migrations.RunPython(seed_cron_jobs, noop_reverse),
    ]
