from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0042_iot_device'),
    ]

    operations = [
        migrations.AddField(
            model_name='iotdevice',
            name='type_settings',
            field=models.JSONField(blank=True, default=dict, verbose_name='Típus beállítások'),
        ),
    ]
