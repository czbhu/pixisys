from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_currency'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailServerConfig',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='Alapértelmezett', max_length=100)),
                ('from_name', models.CharField(blank=True, default='', max_length=100)),
                ('from_email', models.EmailField(max_length=254)),
                ('smtp_host', models.CharField(max_length=255)),
                ('smtp_port', models.PositiveIntegerField(default=587)),
                ('smtp_username', models.CharField(blank=True, default='', max_length=255)),
                ('smtp_password', models.CharField(blank=True, default='', max_length=255)),
                ('smtp_use_tls', models.BooleanField(default=True)),
                ('smtp_use_ssl', models.BooleanField(default=False)),
                ('imap_host', models.CharField(blank=True, default='', max_length=255)),
                ('imap_port', models.PositiveIntegerField(default=993)),
                ('imap_username', models.CharField(blank=True, default='', max_length=255)),
                ('imap_password', models.CharField(blank=True, default='', max_length=255)),
                ('imap_sent_folder', models.CharField(blank=True, default='Sent', max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['-is_active', 'name']},
        ),
        migrations.CreateModel(
            name='EmailTemplate',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.SlugField(max_length=100, unique=True)),
                ('name', models.CharField(max_length=150)),
                ('subject_template', models.TextField()),
                ('body_template', models.TextField(help_text='HTML vagy szöveges sablon')),
                ('is_html', models.BooleanField(default=True)),
                ('description', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='SignatureTemplate',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.SlugField(max_length=100, unique=True)),
                ('name', models.CharField(max_length=150)),
                ('body_html', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['name']},
        ),
    ]
