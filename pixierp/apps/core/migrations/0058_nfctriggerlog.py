from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0057_nfctag_allowed_departments'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='NfcTriggerLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('triggered_at', models.DateTimeField(auto_now_add=True, verbose_name='Időpont')),
                ('success', models.BooleanField(default=True, verbose_name='Sikeres')),
                ('note', models.CharField(blank=True, default='', max_length=255, verbose_name='Megjegyzés')),
                ('tag', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='trigger_logs',
                    to='core.nfctag',
                    verbose_name='NFC tag',
                )),
                ('triggered_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='nfc_trigger_logs',
                    to='auth.user',
                    verbose_name='Felhasználó',
                )),
            ],
            options={
                'verbose_name': 'NFC trigger napló',
                'verbose_name_plural': 'NFC trigger naplók',
                'ordering': ['-triggered_at'],
                'db_table': 'nfc_trigger_logs',
            },
        ),
    ]
