from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0085_incomingdocument_more_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='group_tax_number',
            field=models.CharField(
                blank=True,
                null=True,
                max_length=20,
                verbose_name='Csoport adószám',
                help_text='Csoport teljes adószáma, pl. 12345678-5-42',
            ),
        ),
    ]
