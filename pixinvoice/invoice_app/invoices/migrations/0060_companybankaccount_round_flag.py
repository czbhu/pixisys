from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0059_company_round_transfer_flag'),
    ]

    operations = [
        migrations.AddField(
            model_name='companybankaccount',
            name='round_transfer_to_whole',
            field=models.BooleanField(default=False, verbose_name='Csak egész számos utalás'),
        ),
    ]
