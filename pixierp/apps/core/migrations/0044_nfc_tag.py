from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0043_iotdevice_type_settings'),
    ]

    operations = [
        migrations.CreateModel(
            name='NfcTag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150, verbose_name='Név')),
                ('tag_type', models.CharField(
                    choices=[('ntag215', 'NTAG215'), ('ntag424', 'NTAG424')],
                    max_length=20, verbose_name='Tag típusa',
                )),
                ('location', models.CharField(blank=True, default='', max_length=200, verbose_name='Hely / leírás')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('iot_device', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='nfc_tags',
                    to='core.iotdevice',
                    verbose_name='IoT eszköz',
                )),
                ('iot_channel', models.PositiveSmallIntegerField(default=0, verbose_name='IoT csatorna')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'NFC tag',
                'verbose_name_plural': 'NFC tagek',
                'ordering': ['name'],
                'db_table': 'nfc_tags',
            },
        ),
    ]
