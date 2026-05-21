from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0048_quoterequest_validity'),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequestitem',
            name='is_rate_locked',
            field=models.BooleanField(default=False, verbose_name='Árfolyam rögzítve'),
        ),
        migrations.AddField(
            model_name='quoterequestitem',
            name='locked_exchange_rate',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=14, null=True, verbose_name='Rögzített árfolyam'),
        ),
    ]
