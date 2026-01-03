# Generated manually for ManufacturingProduct currency and quantity_unit fields

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_currency'),
        ('manufacturing', '0002_project_productclass_manufacturingproduct'),
    ]

    operations = [
        migrations.AddField(
            model_name='manufacturingproduct',
            name='currency',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.currency', verbose_name='Valuta'),
        ),
        migrations.AddField(
            model_name='manufacturingproduct',
            name='quantity_unit',
            field=models.CharField(default='db', max_length=20, verbose_name='Mennyiségi egység'),
        ),
    ]
