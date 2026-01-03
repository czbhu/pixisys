from django.db import migrations, models
import uuid
import invoices.models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0046_companyemailsettings_imap_port'),
    ]

    operations = [
        migrations.CreateModel(
            name='IncomingDocument',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('invoice_number', models.CharField(max_length=100)),
                ('supplier_tax_number', models.CharField(max_length=20, blank=True, null=True)),
                ('type', models.CharField(max_length=16, choices=[('IMAGE', 'Számlakép'), ('OTHER', 'Egyéb')], default='IMAGE')),
                ('file', models.FileField(upload_to=invoices.models.incoming_upload_path)),
                ('original_name', models.CharField(max_length=255, blank=True, null=True)),
                ('content_type', models.CharField(max_length=100, blank=True, null=True)),
                ('size', models.PositiveIntegerField(default=0)),
                ('comment', models.CharField(max_length=500, blank=True, null=True)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('company', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='incoming_documents', to='invoices.company')),
            ],
            options={
                'ordering': ['-uploaded_at'],
            },
        ),
        migrations.AddIndex(
            model_name='incomingdocument',
            index=models.Index(fields=['company', 'invoice_number'], name='invoices_in_company_invoice_idx'),
        ),
        migrations.AddIndex(
            model_name='incomingdocument',
            index=models.Index(fields=['company', 'supplier_tax_number'], name='invoices_in_company_supp_idx'),
        ),
    ]
