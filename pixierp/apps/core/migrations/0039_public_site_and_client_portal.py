from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0014_company_external_id'),
        ('core', '0038_ticket_types_and_public_token'),
    ]

    operations = [
        migrations.CreateModel(
            name='PublicSiteConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='Alapértelmezett publikus site', max_length=120)),
                ('public_domain', models.CharField(blank=True, default='', max_length=255, verbose_name='Publikus domain')),
                ('portal_domain', models.CharField(blank=True, default='', max_length=255, verbose_name='Portál domain')),
                ('site_title', models.CharField(default='Pixi Portal', max_length=255, verbose_name='Oldal cím')),
                ('hero_title', models.CharField(default='Üdvözlünk a Pixi publikus felületén', max_length=255, verbose_name='Főcím')),
                ('hero_subtitle', models.TextField(blank=True, default='', verbose_name='Alcím')),
                ('primary_cta_text', models.CharField(blank=True, default='Kapcsolatfelvétel', max_length=100, verbose_name='Elsődleges CTA szöveg')),
                ('primary_cta_url', models.CharField(blank=True, default='', max_length=500, verbose_name='Elsődleges CTA URL')),
                ('calculators_enabled', models.BooleanField(default=True, verbose_name='Publikus kalkulátorok engedélyezve')),
                ('portal_enabled', models.BooleanField(default=True, verbose_name='Kliens portál engedélyezve')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Publikus oldal beállítás',
                'verbose_name_plural': 'Publikus oldal beállítások',
                'ordering': ['-is_active', '-updated_at'],
                'db_table': 'public_site_configs',
            },
        ),
        migrations.CreateModel(
            name='ClientPortalUser',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(db_index=True, max_length=254, unique=True, verbose_name='E-mail')),
                ('full_name', models.CharField(blank=True, default='', max_length=255, verbose_name='Név')),
                ('password_hash', models.CharField(max_length=255, verbose_name='Jelszó hash')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='Utolsó belépés')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='portal_users', to='crm.company', verbose_name='Cég')),
                ('contact', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='portal_users', to='crm.contact', verbose_name='Kapcsolattartó')),
            ],
            options={
                'verbose_name': 'Kliens portál felhasználó',
                'verbose_name_plural': 'Kliens portál felhasználók',
                'ordering': ['email'],
                'db_table': 'client_portal_users',
            },
        ),
        migrations.CreateModel(
            name='ClientPortalSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, unique=True)),
                ('expires_at', models.DateTimeField(verbose_name='Lejárat')),
                ('revoked_at', models.DateTimeField(blank=True, null=True, verbose_name='Visszavonva')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sessions', to='core.clientportaluser', verbose_name='Portál user')),
            ],
            options={
                'verbose_name': 'Kliens portál session',
                'verbose_name_plural': 'Kliens portál sessionök',
                'ordering': ['-created_at'],
                'db_table': 'client_portal_sessions',
            },
        ),
    ]
