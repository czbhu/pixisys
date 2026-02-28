from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0036_alter_permission_resource'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='closed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Lezárva ekkor'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='first_responded_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Első válasz időpontja'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='first_response_due_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Első válasz határidő'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='resolution_due_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Megoldási határidő'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='resolved_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Megoldva ekkor'),
        ),
        migrations.CreateModel(
            name='TicketStatusLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('from_status', models.CharField(blank=True, default='', max_length=20, verbose_name='Előző státusz')),
                ('to_status', models.CharField(max_length=20, verbose_name='Új státusz')),
                ('note', models.CharField(blank=True, default='', max_length=255, verbose_name='Megjegyzés')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ticket_status_changes', to=settings.AUTH_USER_MODEL, verbose_name='Módosította')),
                ('ticket', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='status_logs', to='core.ticket', verbose_name='Jegy')),
            ],
            options={
                'verbose_name': 'Jegy státusznapló',
                'verbose_name_plural': 'Jegy státusznaplók',
                'ordering': ['-created_at'],
                'db_table': 'ticket_status_logs',
            },
        ),
    ]
