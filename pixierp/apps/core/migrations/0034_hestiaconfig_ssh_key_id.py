from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0033_seed_hr_mailbox_template'),
    ]

    operations = [
        migrations.AddField(
            model_name='hestiaconfig',
            name='ssh_key_id',
            field=models.CharField(blank=True, default='pixierp-hestia', max_length=255),
        ),
    ]
