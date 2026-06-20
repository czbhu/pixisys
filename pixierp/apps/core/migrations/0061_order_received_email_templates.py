from django.db import migrations

CUSTOMER_SUBJECT = 'Megrendelését köszönettel megkaptuk – {order_number}'
CUSTOMER_BODY = """<p>Tisztelt {contact_name}!</p>

<p>Megrendelését köszönettel megkaptuk.</p>

<p><strong>Megrendelés száma:</strong> {order_number}<br>
<strong>Dátum:</strong> {order_date}</p>

<p>A kollégák hamarosan visszaigazolják a megrendelést.</p>

<p>Amennyiben kérdése van, forduljon hozzánk bizalommal.</p>

<p>Üdvözlettel,<br>
{company_name}</p>"""

OFFICE_SUBJECT = 'Új megrendelés érkezett: {order_number}'
OFFICE_BODY = """<p>Új megrendelés érkezett:</p>

<p><strong>Ügyfél neve:</strong> {customer_name}<br>
<strong>Kapcsolattartó neve:</strong> {contact_name}<br>
<strong>Megrendelés száma:</strong> {order_number}<br>
<strong>Dátum:</strong> {order_date}<br>
<strong>Kért határidő:</strong> {desired_date}</p>

{items_table}"""


def create_templates(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')
    EmailTemplate.objects.get_or_create(
        key='order_received_customer',
        defaults={
            'name': 'Megrendelés érkezett – Ügyfél sablon',
            'subject_template': CUSTOMER_SUBJECT,
            'body_template': CUSTOMER_BODY,
            'is_html': True,
            'description': 'Automatikusan kiküldve az ügyfélnek, amikor megrendelést ad le a publikus felületen.',
        }
    )
    EmailTemplate.objects.get_or_create(
        key='order_received_office',
        defaults={
            'name': 'Megrendelés érkezett – Iroda sablon',
            'subject_template': OFFICE_SUBJECT,
            'body_template': OFFICE_BODY,
            'is_html': True,
            'description': 'Automatikusan kiküldve az irodának, amikor ügyfél megrendelést ad le a publikus felületen.',
        }
    )


def delete_templates(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')
    EmailTemplate.objects.filter(key__in=['order_received_customer', 'order_received_office']).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0060_add_seen_record_page_visit'),
    ]
    operations = [
        migrations.RunPython(create_templates, delete_templates),
    ]
