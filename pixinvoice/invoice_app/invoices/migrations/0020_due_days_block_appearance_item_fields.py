from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0019_customer_vat_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='payment_due_days',
            field=models.PositiveIntegerField(default=8, verbose_name='Payment Due Days'),
        ),
        migrations.AddField(
            model_name='invoiceblock',
            name='invoice_appearance',
            field=models.CharField(choices=[('PAPER', 'Papír'), ('ELECTRONIC', 'Elektronikus'), ('EDI', 'EDI')], default='ELECTRONIC', max_length=20, verbose_name='Invoice Appearance'),
        ),
        migrations.AddField(
            model_name='invoiceitem',
            name='deletion_code',
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name='Deletion Code'),
        ),
        migrations.AddField(
            model_name='invoiceitem',
            name='note',
            field=models.CharField(blank=True, max_length=500, null=True, verbose_name='Item Note'),
        ),
    ]

