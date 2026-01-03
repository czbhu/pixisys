from django.db import migrations, models
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0010_alter_quoterequestemaillog_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequest',
            name='is_deleted',
            field=models.BooleanField(default=False, verbose_name='Törölt'),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='assignees',
            field=models.ManyToManyField(blank=True, related_name='assigned_quote_requests', to=settings.AUTH_USER_MODEL, verbose_name='Felelősök'),
        ),
    ]
