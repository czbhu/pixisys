# Generated manually to add dedicated proforma email template type

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0091_add_payment_fields_to_proforma'),
    ]

    operations = [
        migrations.AlterField(
            model_name='emailtemplate',
            name='template_type',
            field=models.CharField(
                choices=[
                    ('invoice_send', 'Számlaküldés'),
                    ('proforma_send', 'Díjbekérő küldése'),
                    ('arrears', 'Kintlévőségi'),
                    ('reminder_1', '1. felszólítás'),
                    ('reminder_2', '2. felszólítás'),
                    ('legal', 'Ügyvédi'),
                    ('payment_order', 'Fizetési meghagyás'),
                    ('litigation', 'Peresítés'),
                ],
                max_length=32,
            ),
        ),
    ]
