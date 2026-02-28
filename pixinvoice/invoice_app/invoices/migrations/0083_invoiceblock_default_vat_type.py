from django.db import migrations, models
import django.db.models.deletion


def set_default_vat_type_for_blocks(apps, schema_editor):
    InvoiceBlock = apps.get_model('invoices', 'InvoiceBlock')
    VATType = apps.get_model('invoices', 'VATType')

    default_vat = VATType.objects.filter(active=True).order_by('sort_order', 'name').first()
    if not default_vat:
        default_vat = VATType.objects.order_by('sort_order', 'name').first()
    if not default_vat:
        return

    InvoiceBlock.objects.filter(default_vat_type__isnull=True).update(default_vat_type=default_vat)


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0082_cronjobconfiguration'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoiceblock',
            name='default_vat_type',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='invoice_blocks', to='invoices.vattype', verbose_name='Default VAT Type'),
        ),
        migrations.RunPython(set_default_vat_type_for_blocks, migrations.RunPython.noop),
    ]
