from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0027_company_address_details'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoice',
            name='print_snapshot',
            field=models.JSONField(blank=True, null=True, verbose_name='Print Snapshot'),
        ),
    ]

