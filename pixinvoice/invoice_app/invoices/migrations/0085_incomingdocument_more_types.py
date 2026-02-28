from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0084_emailtemplate_language'),
    ]

    operations = [
        migrations.AlterField(
            model_name='incomingdocument',
            name='type',
            field=models.CharField(
                choices=[
                    ('IMAGE', 'Számlakép'),
                    ('OTHER', 'Egyéb'),
                    ('CONTRACT', 'Szerződés'),
                    ('SUPPLIER', 'Szállító'),
                    ('PERFORMANCE_CERT', 'Teljesítés igazolás'),
                ],
                default='IMAGE',
                max_length=16,
            ),
        ),
    ]
