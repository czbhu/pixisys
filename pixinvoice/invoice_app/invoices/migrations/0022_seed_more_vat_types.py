from django.db import migrations


def up(apps, schema_editor):
    VATType = apps.get_model('invoices', 'VATType')
    defs = [
        # Exemptions
        {'code': 'KBAET', 'name': 'Különös bánásmód szerinti adómentes', 'category': 'EXEMPT', 'percentage': None, 'sort_order': 13},
        # Reverse charge (domestic)
        {'code': 'FORD', 'name': 'Fordított adózás (Áfa tv. 142. §)', 'category': 'REVERSE', 'percentage': None, 'sort_order': 20},
        # Margin schemes
        {'code': 'MARGIN_SECOND_HAND', 'name': 'Különbözeti ÁFA – használt cikk', 'category': 'MARGIN', 'percentage': None, 'sort_order': 31},
        {'code': 'MARGIN_ARTWORK', 'name': 'Különbözeti ÁFA – műalkotás', 'category': 'MARGIN', 'percentage': None, 'sort_order': 32},
        {'code': 'MARGIN_ANTIQUES', 'name': 'Különbözeti ÁFA – régiség', 'category': 'MARGIN', 'percentage': None, 'sort_order': 33},
        {'code': 'MARGIN_TRAVEL_AGENCY', 'name': 'Különbözeti ÁFA – utazási iroda', 'category': 'MARGIN', 'percentage': None, 'sort_order': 34},
    ]
    for d in defs:
        VATType.objects.update_or_create(code=d['code'], defaults=d)


def down(apps, schema_editor):
    VATType = apps.get_model('invoices', 'VATType')
    codes = [
        'KBAET', 'FORD', 'MARGIN_SECOND_HAND', 'MARGIN_ARTWORK', 'MARGIN_ANTIQUES', 'MARGIN_TRAVEL_AGENCY'
    ]
    VATType.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0021_add_vat_type_and_item_fields'),
    ]

    operations = [
        migrations.RunPython(up, down),
    ]

