from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_pixinvoiceconfig_sync_settings'),
    ]

    operations = [
        migrations.AddField(
            model_name='bankaccount',
            name='company_external_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=100, verbose_name='Cég külső azonosító'),
        ),
    ]
