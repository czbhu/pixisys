from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_currency'),
        ('sales', '0005_alter_customer_options_alter_order_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequest',
            name='currency',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.currency', verbose_name='Pénznem'),
        ),
    ]
