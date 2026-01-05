from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0040_paymentbatch_alter_invoice_payment_method_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='xml_logging_enabled',
            field=models.BooleanField(default=True, verbose_name='XML log mentés engedélyezve'),
        ),
    ]
