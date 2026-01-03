from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0037_rename_invoices_inc_issue_date_idx_invoices_in_company_e916a8_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='IncomingInvoiceData',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('invoice_number', models.CharField(max_length=100)),
                ('supplier_tax_number', models.CharField(blank=True, max_length=20, null=True)),
                ('transaction_id', models.CharField(blank=True, max_length=50, null=True)),
                ('xml_text', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='incoming_datas', to='invoices.company')),
            ],
            options={
                'verbose_name': 'Incoming Invoice Data',
                'verbose_name_plural': 'Incoming Invoice Datas',
            },
        ),
        migrations.AddIndex(
            model_name='incominginvoicedata',
            index=models.Index(fields=['company', 'invoice_number'], name='invoices_in_company_7e63f1_idx'),
        ),
        migrations.AddIndex(
            model_name='incominginvoicedata',
            index=models.Index(fields=['company', 'supplier_tax_number'], name='invoices_in_company_6c2e13_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='incominginvoicedata',
            unique_together={('company', 'invoice_number', 'supplier_tax_number')},
        ),
    ]
