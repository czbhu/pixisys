from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0037_ticket_sla_and_status_log'),
    ]

    operations = [
        migrations.CreateModel(
            name='TicketType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=50, unique=True, verbose_name='Kód')),
                ('name', models.CharField(max_length=120, verbose_name='Megnevezés')),
                ('sort_order', models.PositiveIntegerField(default=0, verbose_name='Sorrend')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Jegy típus',
                'verbose_name_plural': 'Jegy típusok',
                'ordering': ['sort_order', 'name'],
                'db_table': 'ticket_types',
            },
        ),
        migrations.AlterField(
            model_name='ticket',
            name='ticket_type',
            field=models.CharField(default='other', max_length=50, verbose_name='Típus'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='public_reply_enabled',
            field=models.BooleanField(default=True, verbose_name='Publikus válasz engedélyezve'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='public_token',
            field=models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, unique=True, verbose_name='Publikus token'),
        ),
        migrations.RunPython(
            code=lambda apps, schema_editor: apps.get_model('core', 'TicketType').objects.bulk_create([
                apps.get_model('core', 'TicketType')(code='task', name='Feladat', sort_order=1, is_active=True),
                apps.get_model('core', 'TicketType')(code='complaint', name='Reklamáció', sort_order=2, is_active=True),
                apps.get_model('core', 'TicketType')(code='bug', name='Hiba', sort_order=3, is_active=True),
                apps.get_model('core', 'TicketType')(code='other', name='Egyéb', sort_order=4, is_active=True),
            ], ignore_conflicts=True),
            reverse_code=migrations.RunPython.noop,
        ),
    ]
