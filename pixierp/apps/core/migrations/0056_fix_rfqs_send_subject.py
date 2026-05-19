from django.db import migrations


def fix_rfqs_send_subject(apps, schema_editor):
    EmailTemplate = apps.get_model('core', 'EmailTemplate')
    EmailTemplate.objects.filter(key='rfqs_send').update(
        subject_template='Árajánlat – {project_name}{item_names}'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0055_seed_rfqs_send_template'),
    ]

    operations = [
        migrations.RunPython(fix_rfqs_send_subject, migrations.RunPython.noop)
    ]
