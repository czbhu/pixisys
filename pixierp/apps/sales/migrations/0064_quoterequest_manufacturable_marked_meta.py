from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0063_rfq_manufacturing_files'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequest',
            name='manufacturable_marked_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Manufacturable marked at'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='manufacturable_marked_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name='manufacturable_marked_quote_requests',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Manufacturable marked by',
            ),
        ),
    ]
