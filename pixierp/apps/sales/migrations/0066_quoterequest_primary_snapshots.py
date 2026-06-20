from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0065_alter_quoterequest_manufacturable_marked_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequest',
            name='primary_item_name',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Elsodleges tetel neve'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_item_description',
            field=models.TextField(blank=True, default='', verbose_name='Elsodleges tetel leiras'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_quantity',
            field=models.DecimalField(decimal_places=2, default=1, max_digits=10, verbose_name='Elsodleges mennyiseg'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_unit',
            field=models.CharField(default='db', max_length=20, verbose_name='Elsodleges egyseg'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_net_unit_price',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12, verbose_name='Elsodleges netto egysegar'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_vat_rate',
            field=models.DecimalField(decimal_places=2, default=27.0, max_digits=5, verbose_name='Elsodleges AFA %'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_discount_percent',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5, verbose_name='Elsodleges kedvezmeny %'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_quote_item_id',
            field=models.IntegerField(blank=True, null=True, verbose_name='Elsodleges tetel azonosito'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_order_number',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='Elsodleges megrendeles szam'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_delivery_note_number',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='Elsodleges szallitolevel szam'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='primary_invoice_number',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='Elsodleges szamla szam'),
        ),
    ]
