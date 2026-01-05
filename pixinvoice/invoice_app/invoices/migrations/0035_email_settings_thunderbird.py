from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0034_email_settings_en_and_sender'),
    ]

    operations = [
        migrations.AddField(
            model_name='companyemailsettings',
            name='use_thunderbird',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='companyemailsettings',
            name='thunderbird_path',
            field=models.CharField(max_length=500, blank=True, null=True),
        ),
    ]
