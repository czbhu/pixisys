from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0074_companyemailsettings_arrears_templates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='companyemailsettings',
            name='arrears_subject_template',
            field=models.CharField(blank=True, default='Kintlévőség értesítő - lejárt számlák', max_length=250, null=True),
        ),
        migrations.AlterField(
            model_name='companyemailsettings',
            name='arrears_body_template',
            field=models.TextField(blank=True, default='<p>Tisztelt Ügyfél!</p>\n<p>Nyilvántartásunk szerint {as_of_date} napjáig még nem egyenlítették ki az alábbi számlákat, amelynek hátraléka összesen {total_outstanding}.</p>\n{invoices_table}\n<p>Amennyiben az összeg az Önök nyilvántartásában szereplőtől eltér, kérem egyeztessenek velünk az elérhetőségeink egyikén.</p>\n<p>Ha a számlák kiegyenlítése időközben már megtörtént, kérjük jelen levelünket tekintse tárgytalannak!</p>\n<p>{today_city_date}</p>', null=True),
        ),
    ]
