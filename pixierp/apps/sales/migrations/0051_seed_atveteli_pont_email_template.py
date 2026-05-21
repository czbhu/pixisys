from django.db import migrations

TEMPLATE_KEY = 'atveteli_pont'
TEMPLATE_NAME = 'Átvételi pont értesítő'
SUBJECT = 'A megrendelése átvehető - {{ dn_number }}'
BODY = '''<p>Tisztelt {{ contact_names }}!</p>
<p><strong>A megrendelés átvehető!</strong></p>
<p><strong>Átvételi pont:</strong> {{ pickup_location_name }}<br>
<strong>Cím:</strong> {{ pickup_location_address }}<br>
<strong>Nyitva tartás:</strong> {{ pickup_location_hours }}</p>
<p>Szállítólevelét az alábbi linken tekintheti meg és visszaigazolhatja:<br>
<a href="{{ public_url }}">{{ public_url }}</a></p>
<p>Köszönjük megrendelését!</p>'''


def seed_template(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')
    if not EmailTemplate.objects.filter(key=TEMPLATE_KEY).exists():
        EmailTemplate.objects.create(
            key=TEMPLATE_KEY,
            name=TEMPLATE_NAME,
            subject_template=SUBJECT,
            body_template=BODY,
            is_html=True,
        )


def remove_template(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')
    EmailTemplate.objects.filter(key=TEMPLATE_KEY).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0050_pickuplocation_deliverynote_pickup'),
        ('core', '0056_fix_rfqs_send_subject'),
    ]

    operations = [
        migrations.RunPython(seed_template, remove_template),
    ]
