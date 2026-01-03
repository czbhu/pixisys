from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0025_invoice_modification_index_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='vat_code',
            field=models.CharField(blank=True, max_length=10, null=True, verbose_name='VAT Code'),
        ),
        migrations.AddField(
            model_name='company',
            name='county_code',
            field=models.CharField(blank=True, max_length=10, null=True, verbose_name='County Code'),
        ),
        migrations.AddField(
            model_name='company',
            name='eu_tax_number',
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name='EU Tax Number'),
        ),
        migrations.AddField(
            model_name='company',
            name='vat_group_id',
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name='VAT Group ID'),
        ),
        migrations.AddField(
            model_name='company',
            name='vat_group_member_tax_number',
            field=models.CharField(blank=True, max_length=20, null=True, verbose_name='VAT Group Member Tax Number'),
        ),
    ]

