from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0026_company_extra_tax_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='street_name',
            field=models.CharField(blank=True, max_length=200, null=True, verbose_name='Street Name'),
        ),
        migrations.AddField(
            model_name='company',
            name='public_place_category',
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name='Public Place Category'),
        ),
        migrations.AddField(
            model_name='company',
            name='street_number',
            field=models.CharField(blank=True, max_length=20, null=True, verbose_name='Street Number'),
        ),
        migrations.AddField(
            model_name='company',
            name='building',
            field=models.CharField(blank=True, max_length=20, null=True, verbose_name='Building'),
        ),
        migrations.AddField(
            model_name='company',
            name='staircase',
            field=models.CharField(blank=True, max_length=20, null=True, verbose_name='Staircase'),
        ),
        migrations.AddField(
            model_name='company',
            name='floor',
            field=models.CharField(blank=True, max_length=20, null=True, verbose_name='Floor'),
        ),
        migrations.AddField(
            model_name='company',
            name='door',
            field=models.CharField(blank=True, max_length=20, null=True, verbose_name='Door'),
        ),
    ]

