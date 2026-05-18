from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0046_quoerequestitem_item_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequestitem',
            name='item_name',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Tétel név'),
        ),
    ]