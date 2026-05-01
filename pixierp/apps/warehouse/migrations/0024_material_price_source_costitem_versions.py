from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('warehouse', '0023_materialsize'),
    ]

    operations = [
        migrations.AddField(
            model_name='material',
            name='default_price_calculation_version',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='Alapértelmezett árkalkulációs verzió'),
        ),
        migrations.AddField(
            model_name='material',
            name='price_source_mode',
            field=models.CharField(choices=[('manual', 'Kézi nettó egységár'), ('default_version', 'Alapértelmezett árkalkuláció'), ('optimal_version', 'Optimális árkalkuláció')], default='manual', help_text='Kézi ár, alapértelmezett verzió vagy optimális verzió alapján számolt nettó egységár', max_length=30, verbose_name='Ár forrása'),
        ),
        migrations.AddField(
            model_name='materialcostitem',
            name='price_calculation_version',
            field=models.CharField(blank=True, default='1. verzió', help_text='Azonos verziónév alá tartozó költségelemek együtt adnak egy egységárat', max_length=100, verbose_name='Árkalkulációs verzió'),
        ),
        migrations.AddField(
            model_name='materialcostitem',
            name='price_quantity',
            field=models.DecimalField(decimal_places=4, default=1, help_text='Az ár hány alapanyag mértékegységre vonatkozik. Pl. 10 db-os csomagolási árnál 10.', max_digits=12, validators=[django.core.validators.MinValueValidator(0.0001)], verbose_name='Ár mennyisége'),
        ),
    ]
    