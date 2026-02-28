from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0078_cashregister_cashregistertransaction'),
    ]

    operations = [
        migrations.AddField(
            model_name='incomingsyncstate',
            name='external_full_sync_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='incomingsyncstate',
            name='external_last_refreshed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
