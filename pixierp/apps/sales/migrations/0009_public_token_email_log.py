from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0008_alter_service_options'),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequest',
            name='public_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='quoterequest',
            name='public_token',
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
        migrations.CreateModel(
            name='QuoteRequestEmailLog',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('to', models.TextField()),
                ('cc', models.TextField(blank=True, default='')),
                ('subject', models.CharField(max_length=255)),
                ('body_preview', models.TextField(blank=True, default='')),
                ('sent_at', models.DateTimeField(auto_now_add=True)),
                ('message_id', models.CharField(blank=True, default='', max_length=255)),
                ('quote_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='email_logs', to='sales.quoterequest')),
                ('sent_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='auth.user')),
            ],
        ),
    ]
