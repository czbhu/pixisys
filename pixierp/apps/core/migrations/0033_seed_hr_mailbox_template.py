from django.db import migrations


def seed_hr_mailbox_template(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')

    EmailTemplate.objects.get_or_create(
        key='hr_employee_mailbox_credentials',
        defaults={
            'name': 'HR - Postafiók belépési adatok',
            'subject_template': 'Új postafiók beállítások - {VezetékNév} {KeresztNév}',
            'body_template': (
                '<p>Kedves Kolléga!</p>'
                '<p>A postafiók létrehozása sikeresen megtörtént. Az alábbi adatokkal tudtok belépni:</p>'
                '<p><strong>Név:</strong> {VezetékNév} {KeresztNév}<br/>'
                '<strong>Domain:</strong> {domain}<br/>'
                '<strong>E-mail cím:</strong> {e-mail cím}<br/>'
                '<strong>Jelszó:</strong> {jelszó}</p>'
                '<p>Kérlek, az első belépés után változtassátok meg a jelszót.</p>'
                '<p>Üdvözlettel,<br/>PixiERP</p>'
            ),
            'is_html': True,
            'description': 'Alkalmazotti postafiók létrehozásakor küldött belépési adatok.',
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0032_hestiaconfig_ssh_fields'),
    ]

    operations = [
        migrations.RunPython(seed_hr_mailbox_template, migrations.RunPython.noop),
    ]
