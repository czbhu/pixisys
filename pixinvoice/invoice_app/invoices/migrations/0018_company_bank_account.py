from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0017_customer_bank_account'),
    ]

    operations = [
        migrations.CreateModel(
            name='CompanyBankAccount',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('bank_name', models.CharField(blank=True, max_length=150, null=True, verbose_name='Bank Name')),
                ('account_number', models.CharField(blank=True, max_length=64, null=True, verbose_name='Bank Account Number')),
                ('iban', models.CharField(blank=True, max_length=34, null=True, verbose_name='IBAN')),
                ('swift_bic', models.CharField(blank=True, max_length=11, null=True, verbose_name='SWIFT/BIC')),
                ('currency', models.CharField(default='HUF', max_length=3, verbose_name='Currency')),
                ('is_primary', models.BooleanField(default=False, verbose_name='Primary')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='bank_accounts', to='invoices.company', verbose_name='Company')),
            ],
            options={
                'verbose_name': 'Company Bank Account',
                'verbose_name_plural': 'Company Bank Accounts',
                'ordering': ['-is_primary', 'bank_name'],
            },
        ),
    ]

