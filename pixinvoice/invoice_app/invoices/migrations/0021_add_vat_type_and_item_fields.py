from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0020_due_days_block_appearance_item_fields'),
    ]

    def seed_vat_types(apps, schema_editor):
        VATType = apps.get_model('invoices', 'VATType')
        defaults = [
            {'code': '27', 'name': 'ÁFA 27%', 'category': 'PERCENT', 'percentage': 27, 'sort_order': 1},
            {'code': '18', 'name': 'ÁFA 18%', 'category': 'PERCENT', 'percentage': 18, 'sort_order': 2},
            {'code': '5',  'name': 'ÁFA 5%',  'category': 'PERCENT', 'percentage': 5,  'sort_order': 3},
            {'code': '0',  'name': 'ÁFA 0%',  'category': 'PERCENT', 'percentage': 0,  'sort_order': 4},
            {'code': 'AAM', 'name': 'Alanyi adómentes', 'category': 'EXEMPT', 'percentage': None, 'sort_order': 10},
            {'code': 'TAM', 'name': 'Tárgyi adómentes', 'category': 'EXEMPT', 'percentage': None, 'sort_order': 11},
            {'code': 'EAM', 'name': 'Egyéb adómentes', 'category': 'EXEMPT', 'percentage': None, 'sort_order': 12},
        ]
        for d in defaults:
            VATType.objects.get_or_create(code=d['code'], defaults=d)

    def unseed_vat_types(apps, schema_editor):
        VATType = apps.get_model('invoices', 'VATType')
        VATType.objects.filter(code__in=['27','18','5','0','AAM','TAM','EAM']).delete()

    operations = [
        migrations.CreateModel(
            name='VATType',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('code', models.CharField(max_length=30, unique=True, verbose_name='Kód (NAV)')),
                ('name', models.CharField(max_length=100, verbose_name='Megnevezés')),
                ('category', models.CharField(max_length=20, choices=[('PERCENT', 'Százalékos'), ('EXEMPT', 'Adómentes'), ('REVERSE', 'Fordított adózás'), ('MARGIN', 'Különbözeti ÁFA'), ('OTHER', 'Egyéb')], default='PERCENT', verbose_name='Kategória')),
                ('percentage', models.DecimalField(blank=True, null=True, max_digits=5, decimal_places=2, verbose_name='Százalék')),
                ('description', models.TextField(blank=True, null=True, verbose_name='Leírás')),
                ('active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('sort_order', models.PositiveIntegerField(default=0, verbose_name='Sorrend')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'ÁFA típus',
                'verbose_name_plural': 'ÁFA típusok',
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.RunPython(seed_vat_types, unseed_vat_types),
        migrations.AddField(
            model_name='invoiceitem',
            name='vat_reason',
            field=models.CharField(max_length=255, blank=True, null=True, verbose_name='VAT Reason/Note'),
        ),
        migrations.AddField(
            model_name='invoiceitem',
            name='vat_type',
            field=models.ForeignKey(to='invoices.vattype', on_delete=models.SET_NULL, null=True, blank=True, related_name='items', verbose_name='VAT Type'),
        ),
    ]
