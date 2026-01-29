from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0070_invoiceblock_language_invoiceblock_second_language'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoiceblock',
            name='footer_note',
            field=models.TextField(blank=True, null=True, verbose_name='Lábjegyzék'),
        ),
    ]
