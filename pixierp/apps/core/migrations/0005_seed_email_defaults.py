from django.db import migrations


def seed_email(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')
    SignatureTemplate = apps.get_model('core', 'SignatureTemplate')

    EmailTemplate.objects.get_or_create(
        key='rfq_send',
        defaults={
            'name': 'Árajánlat kiküldés',
            'subject_template': 'Árajánlat {rfq_number} – {rfq_title}',
            'body_template': '<p>Tisztelt Ügyfelünk,</p><p>Kérjük, tekintse meg ajánlatunkat. Megrendeléshez kattintson: <a href="{public_order_url}">{public_order_url}</a></p><p>Üdvözlettel,</p>',
            'is_html': True,
            'description': 'Alapértelmezett sablon ajánlat kiküldéséhez',
        }
    )

    SignatureTemplate.objects.get_or_create(
        key='default',
        defaults={
            'name': 'Alap aláírás',
            'body_html': '<p><strong>PixiERP</strong><br/>info@example.com</p>'
        }
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_merge_20250914_0000'),
    ]

    operations = [
        migrations.RunPython(seed_email, migrations.RunPython.noop)
    ]
