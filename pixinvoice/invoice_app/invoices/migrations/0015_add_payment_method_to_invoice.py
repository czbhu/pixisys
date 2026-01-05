from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0014_invoiceblock_nav_configuration'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoice',
            name='payment_method',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('transfer', 'Átutalás'),
                    ('cash', 'Készpénz'),
                    ('card', 'Bankkártya'),
                    ('cod', 'Utánvét'),
                    ('other', 'Egyéb'),
                ],
                default='transfer',
                verbose_name='Fizetési mód'
            ),
        ),
    ]
