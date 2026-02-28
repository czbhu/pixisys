from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('manufacturing', '0027_service_groups_alter_service_category'),
        ('core', '0039_public_site_and_client_portal'),
    ]

    operations = [
        migrations.CreateModel(
            name='SiteFeature',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=80, unique=True, verbose_name='Kód')),
                ('name', models.CharField(max_length=120, verbose_name='Név')),
                ('description', models.TextField(blank=True, default='', verbose_name='Leírás')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('sort_order', models.PositiveIntegerField(default=0, verbose_name='Sorrend')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Site funkció',
                'verbose_name_plural': 'Site funkciók',
                'ordering': ['sort_order', 'name'],
                'db_table': 'site_features',
            },
        ),
        migrations.CreateModel(
            name='SalesSite',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150, verbose_name='Oldal neve')),
                ('slug', models.SlugField(max_length=80, unique=True, verbose_name='Slug')),
                ('domains', models.JSONField(blank=True, default=list, verbose_name='Domainek')),
                ('site_type', models.CharField(choices=[('marketing', 'Marketing'), ('sales', 'Sales'), ('portal', 'Portál'), ('mixed', 'Vegyes')], default='marketing', max_length=20, verbose_name='Típus')),
                ('site_title', models.CharField(blank=True, default='', max_length=255, verbose_name='Oldal cím')),
                ('hero_title', models.CharField(blank=True, default='', max_length=255, verbose_name='Főcím')),
                ('hero_subtitle', models.TextField(blank=True, default='', verbose_name='Alcím')),
                ('calculators_enabled', models.BooleanField(default=True, verbose_name='Kalkulátorok engedélyezve')),
                ('portal_enabled', models.BooleanField(default=True, verbose_name='Portál engedélyezve')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('calculators', models.ManyToManyField(blank=True, related_name='sales_sites', to='manufacturing.calculatortemplate', verbose_name='Kalkulátorok')),
                ('features', models.ManyToManyField(blank=True, related_name='sales_sites', to='core.sitefeature', verbose_name='Funkciók')),
                ('product_classes', models.ManyToManyField(blank=True, related_name='sales_sites', to='manufacturing.productclass', verbose_name='Termékkategóriák')),
            ],
            options={
                'verbose_name': 'Sales/Marketing oldal',
                'verbose_name_plural': 'Sales/Marketing oldalak',
                'ordering': ['name'],
                'db_table': 'sales_sites',
            },
        ),
        migrations.RunPython(
            lambda apps, schema_editor: apps.get_model('core', 'SiteFeature').objects.bulk_create([
                apps.get_model('core', 'SiteFeature')(code='lead_form', name='Lead űrlap', sort_order=1, is_active=True),
                apps.get_model('core', 'SiteFeature')(code='quote_request', name='Ajánlatkérés', sort_order=2, is_active=True),
                apps.get_model('core', 'SiteFeature')(code='ticket_submit', name='Jegy beküldés', sort_order=3, is_active=True),
                apps.get_model('core', 'SiteFeature')(code='portal_login', name='Portál belépés', sort_order=4, is_active=True),
            ], ignore_conflicts=True),
            migrations.RunPython.noop,
        ),
    ]
