from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0018_company_bank_account'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='vat_status',
            field=models.CharField(choices=[('DOMESTIC', 'Magyar adószámos'), ('PRIVATE_PERSON', 'Magánszemély'), ('OTHER', 'Egyéb')], default='DOMESTIC', max_length=20, verbose_name='Vevő adóalanyisága'),
        ),
    ]

