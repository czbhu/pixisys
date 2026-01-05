from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0015_add_payment_method_to_invoice'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoice',
            name='invoice_appearance',
            field=models.CharField(choices=[('PAPER', 'Papír'), ('ELECTRONIC', 'Elektronikus'), ('EDI', 'EDI')], default='ELECTRONIC', max_length=20, verbose_name='Invoice Appearance'),
        ),
        migrations.AddField(
            model_name='invoice',
            name='invoice_category',
            field=models.CharField(choices=[('NORMAL', 'Normál'), ('SIMPLIFIED', 'Egyszerűsített'), ('AGGREGATE', 'Gyűjtőszámla'), ('ADVANCE', 'Előlegszámla'), ('FINAL', 'Végszámla'), ('CORRECTION', 'Helyesbítő')], default='NORMAL', max_length=20, verbose_name='Invoice Category'),
        ),
        migrations.AddField(
            model_name='invoice',
            name='payment_date',
            field=models.DateField(blank=True, null=True, verbose_name='Payment Date'),
        ),
        migrations.AddField(
            model_name='invoice',
            name='completeness_indicator',
            field=models.BooleanField(default=False, verbose_name='Completeness Indicator'),
        ),
        migrations.AddField(
            model_name='invoice',
            name='order_reference',
            field=models.CharField(blank=True, max_length=200, null=True, verbose_name='Order Reference'),
        ),
        migrations.AddField(
            model_name='invoiceitem',
            name='nature_indicator',
            field=models.CharField(choices=[('PRODUCT', 'Termék'), ('SERVICE', 'Szolgáltatás')], default='PRODUCT', max_length=20, verbose_name='Line Nature'),
        ),
        migrations.AddField(
            model_name='invoiceitem',
            name='product_code_category',
            field=models.CharField(blank=True, choices=[('VTSZ', 'VTSZ'), ('SZJ', 'SZJ'), ('KN', 'KN'), ('OTHER', 'Other')], max_length=20, null=True, verbose_name='Product Code Category'),
        ),
        migrations.AddField(
            model_name='invoiceitem',
            name='product_code_value',
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name='Product Code Value'),
        ),
        migrations.AddField(
            model_name='invoiceitem',
            name='unit_of_measure',
            field=models.CharField(choices=[('PIECE', 'db'), ('KILOGRAM', 'kg'), ('LITER', 'liter'), ('METER', 'm'), ('HOUR', 'óra'), ('DAY', 'nap'), ('PACKAGE', 'csomag')], default='PIECE', max_length=20, verbose_name='Unit of Measure'),
        ),
    ]

