from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0083_invoiceblock_default_vat_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailtemplate',
            name='language',
            field=models.CharField(choices=[('hu', 'Magyar'), ('en', 'Angol')], default='hu', max_length=5),
        ),
        migrations.RemoveConstraint(
            model_name='emailtemplate',
            name='unique_company_template_type',
        ),
        migrations.AddConstraint(
            model_name='emailtemplate',
            constraint=models.UniqueConstraint(fields=('company', 'template_type', 'language'), name='unique_company_template_type_language'),
        ),
    ]
