from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0006_quoterequest_currency'),
    ]

    operations = [
        migrations.CreateModel(
            name='QuoteRequestAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to='quote_requests/%Y/%m/%d/')),
                ('remark', models.CharField(blank=True, max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('quote_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='sales.quoterequest')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Ajánlat csatolmány',
                'verbose_name_plural': 'Ajánlat csatolmányok',
            },
        ),
    ]
