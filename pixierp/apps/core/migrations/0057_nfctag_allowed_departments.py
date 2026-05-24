from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0056_fix_rfqs_send_subject'),
        ('hr', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='nfctag',
            name='allowed_departments',
            field=models.ManyToManyField(
                blank=True,
                help_text='Ha üres, minden osztály használhatja. Ha meg van adva, csak ezek az osztályok aktiválhatják.',
                related_name='nfc_tags',
                to='hr.department',
                verbose_name='Engedélyezett osztályok',
            ),
        ),
    ]
