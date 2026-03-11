from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0087_add_incoming_proforma_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='currency',
            name='display_decimals',
            field=models.PositiveSmallIntegerField(default=2, verbose_name='Megjelenítési tizedes jegyek'),
        ),
    ]
