from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0057_role_systemuser_roles'),
    ]

    operations = [
        migrations.AddField(
            model_name='incominginvoicedigest',
            name='approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='incominginvoicedigest',
            name='approved_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='approved_incoming_invoices', to='invoices.systemuser'),
        ),
        migrations.AddField(
            model_name='incominginvoicedigest',
            name='is_approved',
            field=models.BooleanField(default=False),
        ),
        migrations.AddIndex(
            model_name='incominginvoicedigest',
            index=models.Index(fields=['company', 'is_approved'], name='invoices_in_company_9c6841_idx'),
        ),
    ]