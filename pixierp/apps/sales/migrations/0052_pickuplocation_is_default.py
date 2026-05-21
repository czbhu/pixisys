from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0051_seed_atveteli_pont_email_template'),
    ]

    operations = [
        migrations.AddField(
            model_name='pickuplocation',
            name='is_default',
            field=models.BooleanField(default=False, verbose_name='Alapértelmezett'),
        ),
    ]
