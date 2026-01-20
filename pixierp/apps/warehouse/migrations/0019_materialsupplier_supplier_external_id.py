from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('warehouse', '0018_make_material_type_optional'),
    ]

    operations = [
        migrations.AddField(
            model_name='materialsupplier',
            name='supplier_external_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=100, verbose_name='Beszállító külső azonosító'),
        ),
    ]
