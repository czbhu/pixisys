from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0007_invoice_aligned_company_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='contact',
            name='external_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=100, verbose_name='Külső azonosító'),
        ),
    ]
