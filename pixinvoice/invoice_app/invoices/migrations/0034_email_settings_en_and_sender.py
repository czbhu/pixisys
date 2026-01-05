from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0033_companyemailsettings'),
    ]

    operations = [
        migrations.AddField(
            model_name='companyemailsettings',
            name='subject_template_en',
            field=models.CharField(blank=True, default='Invoice {invoice_number}', max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='companyemailsettings',
            name='body_template_en',
            field=models.TextField(blank=True, default='Dear {customer_name},\n\nPlease find attached invoice {invoice_number}.\n\nBest regards,\n{company_name}', null=True),
        ),
        migrations.AddField(
            model_name='companyemailsettings',
            name='default_sender_name',
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='companyemailsettings',
            name='default_sender_phone',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]
