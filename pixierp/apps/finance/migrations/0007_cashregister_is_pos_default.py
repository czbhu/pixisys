from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0006_cashregister_transaction_view_employees'),
    ]

    operations = [
        migrations.AddField(
            model_name='cashregister',
            name='is_pos_default',
            field=models.BooleanField(default=False, verbose_name='POS alapértelmezett kassza'),
        ),
    ]
