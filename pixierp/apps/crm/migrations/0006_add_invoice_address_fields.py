from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0005_remove_company_company_type_company_is_customer_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='building',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='Épület'),
        ),
        migrations.AddField(
            model_name='company',
            name='door',
            field=models.CharField(blank=True, default='', max_length=10, verbose_name='Ajtó'),
        ),
        migrations.AddField(
            model_name='company',
            name='floor',
            field=models.CharField(blank=True, default='', max_length=10, verbose_name='Emelet'),
        ),
        migrations.AddField(
            model_name='company',
            name='public_place_category',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='Közterület jellege'),
        ),
        migrations.AddField(
            model_name='company',
            name='staircase',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='Lépcsőház'),
        ),
        migrations.AddField(
            model_name='company',
            name='street_number',
            field=models.CharField(blank=True, default='', max_length=20, verbose_name='Közterület szám'),
        ),
    ]
