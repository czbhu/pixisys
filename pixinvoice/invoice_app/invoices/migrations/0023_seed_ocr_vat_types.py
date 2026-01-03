from django.db import migrations


def up(apps, schema_editor):
    VATType = apps.get_model('invoices', 'VATType')
    defs = [
        # EU intra-community supplies/services and related markers
        {'code': 'KBAUK', 'name': 'Közösségen belüli adómentes új közlekedési eszköz', 'category': 'EXEMPT', 'percentage': None, 'sort_order': 14},
        {'code': 'EUFAD37', 'name': 'EU szolgáltatás – fordítottan adózó (Áfa tv. 37. § főszabály)', 'category': 'REVERSE', 'percentage': None, 'sort_order': 40},
        {'code': 'EUFADE', 'name': 'EU szolgáltatás – fordítottan adózó (egyéb speciális eset)', 'category': 'REVERSE', 'percentage': None, 'sort_order': 41},
        {'code': 'EUE', 'name': 'EU szolgáltatás – fordított adózás (egyéb)', 'category': 'REVERSE', 'percentage': None, 'sort_order': 42},
        {'code': 'EUT', 'name': 'EU-n belüli adómentes termékértékesítés (B2B)', 'category': 'EXEMPT', 'percentage': None, 'sort_order': 15},
       
        # Territory/OSS markers
        {'code': 'TEHK', 'name': 'Áfa területi hatályán kívüli (TEHK)', 'category': 'OTHER', 'percentage': None, 'sort_order': 60},
        {'code': 'HO',   'name': 'Harmadik országban teljesített ügylet', 'category': 'OTHER', 'percentage': None, 'sort_order': 61},
        {'code': 'NOSZ', 'name': 'További adatszolgáltatásra nem kötelezett (OSS/MOSS/extra-EU)', 'category': 'OTHER', 'percentage': None, 'sort_order': 62},

        # Reverse charge (domestic)
        {'code': 'FORD', 'name': 'Fordított adózás – belföld (Áfa tv. 142. §)', 'category': 'REVERSE', 'percentage': None, 'sort_order': 43},
    ]
    for d in defs:
        VATType.objects.update_or_create(code=d['code'], defaults=d)


def down(apps, schema_editor):
    VATType = apps.get_model('invoices', 'VATType')
    codes = ['KBAUK', 'EUFAD37', 'EUFADE', 'EUE', 'EUT', 'TEHK', 'HO', 'NOSZ', 'FORD']
    VATType.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0022_seed_more_vat_types'),
    ]

    operations = [
        migrations.RunPython(up, down),
    ]
