from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0031_hestiaconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='hestiaconfig',
            name='ssh_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='hestiaconfig',
            name='ssh_host',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='hestiaconfig',
            name='ssh_port',
            field=models.PositiveIntegerField(default=22),
        ),
        migrations.AddField(
            model_name='hestiaconfig',
            name='ssh_user',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='hestiaconfig',
            name='ssh_private_key_path',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='hestiaconfig',
            name='ssh_strict_host_key',
            field=models.BooleanField(default=True),
        ),
    ]
