"""
Data migration: create protected service group and assign click-pricing services.
"""
from django.db import migrations


PROTECTED_SERVICES = [
    {
        'code': 'DIGIPR_K',
        'name': 'Digitális nyomtatás - Fekete-fehér (klikk)',
        'unit': 'click',
        'category': 'Nyomtatás',
        'is_active': True,
        'is_protected': True,
        'pricing_type': 'per_sheet',
        'unit_cost_price': 0,
        'markup_percentage': 35,
        'unit_selling_price': 0,
        'unit_price': 0,
        'currency': 'HUF',
    },
    {
        'code': 'DIGIPR_CMYK',
        'name': 'Digitális nyomtatás - Színes (klikk)',
        'unit': 'click',
        'category': 'Nyomtatás',
        'is_active': True,
        'is_protected': True,
        'pricing_type': 'per_sheet',
        'unit_cost_price': 0,
        'markup_percentage': 35,
        'unit_selling_price': 0,
        'unit_price': 0,
        'currency': 'HUF',
    },
]


def create_protected_services(apps, schema_editor):
    Service = apps.get_model('manufacturing', 'Service')
    ServiceGroup = apps.get_model('manufacturing', 'ServiceGroup')

    # Create the protected group
    group, _ = ServiceGroup.objects.get_or_create(
        name='Védett szolgáltatások',
        defaults={
            'description': 'Rendszer-szintű kalkulációhoz szükséges szolgáltatások. Nem törölhető.',
            'is_active': True,
            'is_protected': True,
        },
    )
    if not group.is_protected:
        group.is_protected = True
        group.save(update_fields=['is_protected'])

    # Create / mark the services and assign them to the group
    for svc_data in PROTECTED_SERVICES:
        code = svc_data['code']
        obj, created = Service.objects.get_or_create(
            code=code,
            defaults=svc_data,
        )
        if not created and not obj.is_protected:
            obj.is_protected = True
            obj.save(update_fields=['is_protected'])
        obj.groups.add(group)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('manufacturing', '0045_add_service_is_protected'),
    ]

    operations = [
        migrations.RunPython(create_protected_services, noop),
    ]
