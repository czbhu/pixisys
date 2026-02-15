from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0030_activitylog'),
    ]

    operations = [
        migrations.CreateModel(
            name='HestiaConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='Alapértelmezett', max_length=100)),
                ('is_active', models.BooleanField(default=True)),
                ('mode', models.CharField(choices=[('cli', 'CLI'), ('rest', 'REST API')], default='cli', max_length=10)),
                ('default_domain', models.CharField(help_text='Az e-mail címek domain része (pl. pixisys.eu)', max_length=255)),
                ('hestia_user', models.CharField(help_text='Hestia user, amelyhez a domain tartozik', max_length=255)),
                ('cli_bin_path', models.CharField(default='/usr/local/hestia/bin', max_length=255)),
                ('cli_use_sudo', models.BooleanField(default=False)),
                ('cli_sudo_runner', models.CharField(blank=True, default='', max_length=255)),
                ('rest_api_url', models.CharField(blank=True, default='', max_length=500)),
                ('rest_api_user', models.CharField(blank=True, default='', max_length=255)),
                ('rest_api_password', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Hestia beállítás',
                'verbose_name_plural': 'Hestia beállítások',
                'ordering': ['-is_active', 'name'],
            },
        ),
    ]
