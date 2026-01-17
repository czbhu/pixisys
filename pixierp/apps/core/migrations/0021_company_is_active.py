from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0020_emergency_access_tokens'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='is_active',
            field=models.BooleanField(default=True, verbose_name='Aktív'),
        ),
    ]
