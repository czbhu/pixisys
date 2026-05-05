from django.db import migrations


def seed_manufacturing_ordered_products_template(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')

    EmailTemplate.objects.get_or_create(
        key='manufacturing_ordered_products_send',
        defaults={
            'name': 'Gyartas - Megrendelt termek kikuldes',
            'subject_template': 'Uj megrendeles erkezett - {recipient_label} ({item_count} tetel)',
            'body_template': (
                '<p>Tisztelt {recipient_label}!</p>'
                '<p>Uj megrendeles erkezett.</p>'
                '<p><strong>Gyartasi tetel osszesito:</strong></p>'
                '{item_table_html}'
                '<p><strong>Gyartasi sor link(ek):</strong></p>'
                '{queue_links_html}'
                '<p><strong>Belso munkalap (tablazatos):</strong></p>'
                '{internal_worksheet_table_html}'
                '<p><strong>Kivalasztott csatolmanyok:</strong></p>'
                '{selected_attachments_table_html}'
                '<p>Koszonettel,<br/>PixiERP</p>'
            ),
            'is_html': True,
            'description': 'Megrendelt gyartasi tetelek kikuldese beszalitoknak/részlegeknek, belso munkalap es linkek placeholders tamogatasaval.',
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0049_storageshare_department'),
    ]

    operations = [
        migrations.RunPython(seed_manufacturing_ordered_products_template, migrations.RunPython.noop),
    ]
