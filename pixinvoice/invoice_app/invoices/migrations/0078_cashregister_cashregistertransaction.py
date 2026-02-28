from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0077_seed_default_email_templates'),
    ]

    operations = [
        migrations.CreateModel(
            name='CashRegister',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=120, verbose_name='Cash Register Name')),
                ('code', models.CharField(blank=True, max_length=40, null=True, verbose_name='Code')),
                ('location', models.CharField(blank=True, max_length=160, null=True, verbose_name='Location')),
                ('currency', models.CharField(default='HUF', max_length=3, verbose_name='Currency')),
                ('is_active', models.BooleanField(default=True, verbose_name='Active')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cash_registers', to='invoices.company', verbose_name='Company')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='auth.user', verbose_name='Created By')),
            ],
            options={
                'verbose_name': 'Cash Register',
                'verbose_name_plural': 'Cash Registers',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='CashRegisterTransaction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('transaction_type', models.CharField(choices=[('IN', 'Befizetés'), ('OUT', 'Kifizetés')], max_length=8, verbose_name='Transaction Type')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14, verbose_name='Amount')),
                ('currency', models.CharField(default='HUF', max_length=3, verbose_name='Currency')),
                ('voucher_number', models.CharField(blank=True, max_length=64, null=True, unique=True, verbose_name='Voucher Number')),
                ('note', models.CharField(blank=True, max_length=500, null=True, verbose_name='Note')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('cash_register', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transactions', to='invoices.cashregister', verbose_name='Cash Register')),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cash_transactions', to='invoices.company', verbose_name='Company')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='auth.user', verbose_name='Created By')),
                ('incoming_invoice', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cash_transactions', to='invoices.incominginvoicedigest', verbose_name='Incoming Invoice')),
                ('invoice', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cash_transactions', to='invoices.invoice', verbose_name='Outgoing Invoice')),
            ],
            options={
                'verbose_name': 'Cash Register Transaction',
                'verbose_name_plural': 'Cash Register Transactions',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='cashregister',
            constraint=models.UniqueConstraint(fields=('company', 'name'), name='unique_cash_register_name_per_company'),
        ),
        migrations.AddIndex(
            model_name='cashregistertransaction',
            index=models.Index(fields=['company', 'cash_register', 'created_at'], name='invoices_ca_company_3cea9a_idx'),
        ),
        migrations.AddIndex(
            model_name='cashregistertransaction',
            index=models.Index(fields=['company', 'transaction_type', 'created_at'], name='invoices_ca_company_32c2e2_idx'),
        ),
    ]
