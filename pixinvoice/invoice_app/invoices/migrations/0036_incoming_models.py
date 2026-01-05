from django.db import migrations, models
import uuid
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0035_email_settings_thunderbird'),
    ]

    operations = [
        migrations.CreateModel(
            name='IncomingSyncState',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('last_refreshed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='incoming_sync_state', to='invoices.company')),
            ],
            options={
                'verbose_name': 'Incoming Sync State',
                'verbose_name_plural': 'Incoming Sync States',
            },
        ),
        migrations.CreateModel(
            name='IncomingInvoiceDigest',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('invoice_number', models.CharField(max_length=100)),
                ('invoice_operation', models.CharField(max_length=20, blank=True, null=True)),
                ('invoice_category', models.CharField(max_length=20, blank=True, null=True)),
                ('invoice_issue_date', models.DateField(blank=True, null=True)),
                ('invoice_delivery_date', models.DateField(blank=True, null=True)),
                ('supplier_tax_number', models.CharField(max_length=20, blank=True, null=True)),
                ('supplier_name', models.CharField(max_length=300, blank=True, null=True)),
                ('customer_tax_number', models.CharField(max_length=20, blank=True, null=True)),
                ('customer_name', models.CharField(max_length=300, blank=True, null=True)),
                ('payment_method', models.CharField(max_length=30, blank=True, null=True)),
                ('payment_date', models.DateField(blank=True, null=True)),
                ('invoice_appearance', models.CharField(max_length=30, blank=True, null=True)),
                ('currency', models.CharField(max_length=10, blank=True, null=True)),
                ('invoice_net_amount', models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True)),
                ('invoice_vat_amount', models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True)),
                ('transaction_id', models.CharField(max_length=50, blank=True, null=True)),
                ('index', models.IntegerField(blank=True, null=True)),
                ('original_invoice_number', models.CharField(max_length=100, blank=True, null=True)),
                ('modification_index', models.IntegerField(blank=True, null=True)),
                ('ins_date', models.DateTimeField(blank=True, null=True)),
                ('completeness_indicator', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='incoming_digests', to='invoices.company')),
            ],
            options={
                'verbose_name': 'Incoming Invoice Digest',
                'verbose_name_plural': 'Incoming Invoice Digests',
            },
        ),
        migrations.AddIndex(
            model_name='incominginvoicedigest',
            index=models.Index(fields=['company', 'invoice_issue_date'], name='invoices_inc_issue_date_idx'),
        ),
        migrations.AddIndex(
            model_name='incominginvoicedigest',
            index=models.Index(fields=['company', 'ins_date'], name='invoices_inc_ins_date_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='incominginvoicedigest',
            unique_together={('company', 'invoice_number', 'transaction_id')},
        ),
    ]
