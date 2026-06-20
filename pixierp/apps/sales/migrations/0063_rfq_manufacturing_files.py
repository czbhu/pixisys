from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0062_add_rfq_imposition_presets'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequest',
            name='is_manufacturable',
            field=models.BooleanField(default=False, verbose_name='Gyártható'),
        ),
        migrations.AddField(
            model_name='quoterequestattachment',
            name='approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='quoterequestattachment',
            name='approved_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='approved_quote_request_attachments', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='quoterequestattachment',
            name='is_manufacturing_file',
            field=models.BooleanField(default=False, verbose_name='Gyártási fájl'),
        ),
    ]
