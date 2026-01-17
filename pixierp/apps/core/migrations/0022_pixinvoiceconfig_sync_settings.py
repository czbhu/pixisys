from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_company_is_active'),
    ]

    operations = [
        migrations.AddField(
            model_name='pixinvoiceconfig',
            name='sync_settings',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
