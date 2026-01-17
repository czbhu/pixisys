from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0058_incoming_invoice_approval'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='round_transfer_to_whole',
            field=models.BooleanField(default=False, verbose_name='Csak egész számos utalás'),
        ),
    ]
