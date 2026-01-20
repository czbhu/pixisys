from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('manufacturing', '0011_project_company_alter_service_default_supplier_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='manufacturingproduct',
            name='contact_external_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=100, verbose_name='Kapcsolattartó külső azonosító'),
        ),
    ]
