from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0041_company_xml_logging_enabled'),
    ]

    operations = [
        migrations.CreateModel(
            name='APIAccessRule',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('scope', models.CharField(max_length=64, choices=[('ALL', 'All access'), ('nav.companyQuery', 'NAV céglekérdezés'), ('customer.sync', 'Ügyfél szinkronizálás'), ('contact.sync', 'Kapcsolattartó szinkronizálás'), ('invoice.send', 'Számla küldés')])),
                ('allowed', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='api_access_rules', to='invoices.company')),
                ('invoice_block', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='api_access_rules', blank=True, null=True, to='invoices.invoiceblock')),
            ],
            options={
                'verbose_name': 'API Access Rule',
                'verbose_name_plural': 'API Access Rules',
            },
        ),
        migrations.AddConstraint(
            model_name='apiaccessrule',
            constraint=models.UniqueConstraint(fields=('company', 'scope'), name='unique_api_access_company_scope', condition=models.Q(('invoice_block__isnull', True))),
        ),
        migrations.AddConstraint(
            model_name='apiaccessrule',
            constraint=models.UniqueConstraint(fields=('company', 'invoice_block', 'scope'), name='unique_api_access_block_scope', condition=models.Q(('invoice_block__isnull', False))),
        ),
    ]
