from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0071_deliverynoteitem_rfq_first'),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequest',
            name='status_is_manual',
            field=models.BooleanField(default=False, verbose_name='Státusz manuálisan beállítva'),
        ),
    ]
