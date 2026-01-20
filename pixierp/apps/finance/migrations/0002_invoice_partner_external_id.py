from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoice',
            name='partner_external_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=100, verbose_name='Partner külső azonosító'),
        ),
    ]
