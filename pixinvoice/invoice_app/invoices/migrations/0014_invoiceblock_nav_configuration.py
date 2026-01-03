from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0013_alter_company_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoiceblock',
            name='nav_configuration',
            field=models.ForeignKey(
                related_name='invoice_blocks',
                null=True,
                blank=True,
                to='invoices.companynavconfiguration',
                on_delete=models.deletion.SET_NULL,
                verbose_name='NAV Configuration',
            ),
        ),
    ]

