from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0079_incomingsyncstate_external_sync_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoice',
            name='arrears_status',
            field=models.CharField(
                blank=True,
                choices=[
                    ('overdue', 'Lejárt'),
                    ('arrears_notice', 'Kintlévőségi értesítő kiküldése'),
                    ('reminder_1', '1. Felszólítás'),
                    ('reminder_2', '2. Felszólítás'),
                    ('legal_letter', 'Ügyvédi levél'),
                    ('payment_order', 'Fizetési meghagyás'),
                    ('litigation', 'Peresítés'),
                    ('won', 'Pert nyert'),
                    ('lost', 'Pert vesztett'),
                ],
                max_length=32,
                null=True,
                verbose_name='Kintlévőség státusz',
            ),
        ),
        migrations.AddField(
            model_name='invoice',
            name='arrears_status_changed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Kintlévőség státuszváltás ideje'),
        ),
        migrations.AlterField(
            model_name='emailtemplate',
            name='template_type',
            field=models.CharField(
                choices=[
                    ('invoice_send', 'Számlaküldés'),
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
