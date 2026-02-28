from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0034_hestiaconfig_ssh_key_id'),
        ('hr', '0030_taskconfiguration_due_month_of_year'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TicketTopic',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True, verbose_name='Témakör neve')),
                ('sort_order', models.PositiveIntegerField(default=0, verbose_name='Sorrend')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Jegy témakör',
                'verbose_name_plural': 'Jegy témakörök',
                'ordering': ['sort_order', 'name'],
                'db_table': 'ticket_topics',
            },
        ),
        migrations.CreateModel(
            name='Ticket',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ticket_number', models.CharField(blank=True, db_index=True, default='', max_length=20, unique=True, verbose_name='Jegyszám')),
                ('title', models.CharField(max_length=255, verbose_name='Cím')),
                ('ticket_type', models.CharField(choices=[('task', 'Feladat'), ('complaint', 'Reklamáció'), ('bug', 'Hiba'), ('other', 'Egyéb')], default='other', max_length=20, verbose_name='Típus')),
                ('status', models.CharField(choices=[('open', 'Nyitott'), ('in_progress', 'Folyamatban'), ('answered', 'Megválaszolva'), ('closed', 'Lezárt')], default='open', max_length=20, verbose_name='Státusz')),
                ('priority', models.CharField(choices=[('low', 'Alacsony'), ('normal', 'Normál'), ('high', 'Magas'), ('urgent', 'Sürgős')], default='normal', max_length=20, verbose_name='Prioritás')),
                ('audience', models.CharField(choices=[('internal', 'Belsős'), ('external', 'Külsős'), ('both', 'Mindkettő')], default='internal', max_length=20, verbose_name='Címzett típusa')),
                ('requester_name', models.CharField(blank=True, default='', max_length=255, verbose_name='Külsős név')),
                ('requester_email', models.EmailField(blank=True, default='', max_length=254, verbose_name='Külsős e-mail')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assigned_users', models.ManyToManyField(blank=True, related_name='assigned_tickets', to=settings.AUTH_USER_MODEL, verbose_name='Személyek')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_tickets', to=settings.AUTH_USER_MODEL, verbose_name='Létrehozta')),
                ('departments', models.ManyToManyField(blank=True, related_name='tickets', to='hr.department', verbose_name='HR osztályok')),
                ('topic', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='tickets', to='core.tickettopic', verbose_name='Témakör')),
            ],
            options={
                'verbose_name': 'Jegy',
                'verbose_name_plural': 'Jegyek',
                'ordering': ['-created_at'],
                'db_table': 'tickets',
            },
        ),
        migrations.CreateModel(
            name='TicketMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('author_name', models.CharField(blank=True, default='', max_length=255, verbose_name='Szerző neve')),
                ('author_email', models.EmailField(blank=True, default='', max_length=254, verbose_name='Szerző e-mail')),
                ('body_html', models.TextField(verbose_name='HTML üzenet')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ticket_messages', to=settings.AUTH_USER_MODEL, verbose_name='Szerző')),
                ('ticket', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='core.ticket', verbose_name='Jegy')),
            ],
            options={
                'verbose_name': 'Jegy üzenet',
                'verbose_name_plural': 'Jegy üzenetek',
                'ordering': ['created_at'],
                'db_table': 'ticket_messages',
            },
        ),
        migrations.CreateModel(
            name='TicketAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to='tickets/attachments/%Y/%m/', verbose_name='Fájl')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('message', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='core.ticketmessage', verbose_name='Üzenet')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ticket_attachments', to=settings.AUTH_USER_MODEL, verbose_name='Feltöltő')),
            ],
            options={
                'verbose_name': 'Jegy csatolmány',
                'verbose_name_plural': 'Jegy csatolmányok',
                'ordering': ['created_at'],
                'db_table': 'ticket_attachments',
            },
        ),
    ]
