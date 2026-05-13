from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0041_formulas_field'),
    ]

    operations = [
        migrations.AddField(
            model_name='customerorder',
            name='deadline',
            field=models.DateField(blank=True, null=True, verbose_name='Szállítási határidő'),
        ),
    ]
