from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0006_add_invoice_address_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='short_name',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='Rövid név'),
        ),
        migrations.AddField(
            model_name='company',
            name='full_tax_number',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='Teljes adószám'),
        ),
        migrations.AddField(
            model_name='company',
            name='vat_code',
            field=models.CharField(blank=True, default='', max_length=10, verbose_name='ÁFA kód'),
        ),
        migrations.AddField(
            model_name='company',
            name='county_code',
            field=models.CharField(blank=True, default='', max_length=10, verbose_name='Megye kód'),
        ),
        migrations.AddField(
            model_name='company',
            name='vat_group_id',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='ÁFA csoport azonosító'),
        ),
        migrations.AddField(
            model_name='company',
            name='vat_group_member_tax_number',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='ÁFA csoport tag adószám'),
        ),
        migrations.AddField(
            model_name='company',
            name='email',
            field=models.EmailField(blank=True, max_length=254, null=True, verbose_name='E-mail'),
        ),
        migrations.AddField(
            model_name='company',
            name='phone',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='Telefon'),
        ),
        migrations.AddField(
            model_name='company',
            name='is_active',
            field=models.BooleanField(default=True, verbose_name='Aktív'),
        ),
    ]
