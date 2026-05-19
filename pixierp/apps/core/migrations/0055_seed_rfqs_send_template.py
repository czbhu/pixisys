from django.db import migrations


def seed_rfqs_send(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')
    EmailTemplate.objects.get_or_create(
        key='rfqs_send',
        defaults={
            'name': 'Árajánlat kiküldés – több tétel',
            'subject_template': 'Árajánlat – {project_name}: {item_names}',
            'body_template': '<p>Tisztelt Ügyfelünk,</p><p>Kérjük, tekintse meg ajánlatunkat. Megrendeléshez kattintson: <a href="{public_order_url}">{public_order_url}</a></p><p>Üdvözlettel,</p>',
            'is_html': True,
            'description': 'Több tételes ajánlat kiküldéséhez (tárgyban felsorolja a tételek nevét)',
        }
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0054_alter_permission_module_alter_permission_resource'),
    ]

    operations = [
        migrations.RunPython(seed_rfqs_send, migrations.RunPython.noop)
    ]
