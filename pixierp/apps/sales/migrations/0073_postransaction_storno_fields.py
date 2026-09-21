from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0072_quoterequest_status_is_manual'),
    ]

    operations = [
        migrations.AddField(
            model_name='postransaction',
            name='storno_reason',
            field=models.TextField(blank=True, default='', verbose_name='Sztornó indoka'),
        ),
        migrations.AddField(
            model_name='postransaction',
            name='stornoed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Sztornózva'),
        ),
        migrations.AddField(
            model_name='postransaction',
            name='stornoed_by',
            field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stornoed_pos_transactions', to=settings.AUTH_USER_MODEL, verbose_name='Sztornózta'),
        ),
    ]
