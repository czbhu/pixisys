from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0011_quoterequest_softdelete_assignment'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='quoterequest',
            name='owner',
            field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name='owned_quote_requests', to=settings.AUTH_USER_MODEL, verbose_name='Tulaj (átvevő)'),
        ),
        migrations.CreateModel(
            name='QuoteRequestInvitation',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(max_length=20, choices=[('pending', 'Függőben'), ('accepted', 'Elfogadva'), ('declined', 'Elutasítva')], default='pending')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('responded_at', models.DateTimeField(null=True, blank=True)),
                ('invitee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rfq_invitations', to=settings.AUTH_USER_MODEL)),
                ('invited_by', models.ForeignKey(on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name='rfq_sent_invitations', to=settings.AUTH_USER_MODEL)),
                ('quote_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invitations', to='sales.quoterequest')),
            ],
            options={
                'verbose_name': 'Igény meghívás',
                'verbose_name_plural': 'Igény meghívások',
            },
        ),
        migrations.AlterUniqueTogether(
            name='quoterequestinvitation',
            unique_together={('quote_request', 'invitee', 'status')},
        ),
    ]
