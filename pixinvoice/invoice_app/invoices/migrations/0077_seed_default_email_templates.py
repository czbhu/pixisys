from django.db import migrations


INVOICE_SEND = 'invoice_send'
ARREARS = 'arrears'
REMINDER_1 = 'reminder_1'
REMINDER_2 = 'reminder_2'
LEGAL = 'legal'


def seed_templates(apps, schema_editor):
    Company = apps.get_model('invoices', 'Company')
    CompanyEmailSettings = apps.get_model('invoices', 'CompanyEmailSettings')
    EmailTemplate = apps.get_model('invoices', 'EmailTemplate')

    defaults = {
        INVOICE_SEND: {
            'name': 'Számlaküldés',
            'subject_template': 'Számla {invoice_number}',
            'body_template': 'Tisztelt {customer_name}!\n\nKüldjük a(z) {invoice_number} számú számlát PDF csatolmányként.\n\nÜdvözlettel,\n{company_name}\n{signature_html}',
        },
        ARREARS: {
            'name': 'Kintlévőségi',
            'subject_template': 'Kintlévőség értesítő - lejárt számlák',
            'body_template': '<p>Tisztelt Ügyfél!</p><p>Nyilvántartásunk szerint {as_of_date} napjáig még nem egyenlítették ki az alábbi számlákat, amelynek hátraléka összesen {total_outstanding}.</p>{invoices_table}<p>Amennyiben az összeg az Önök nyilvántartásában szereplőtől eltér, kérem egyeztessenek velünk az elérhetőségeink egyikén.</p><p>Ha a számlák kiegyenlítése időközben már megtörtént, kérjük jelen levelünket tekintse tárgytalannak!</p><p>{today_city_date}</p><p>{signature_html}</p>',
        },
        REMINDER_1: {
            'name': '1. felszólítás',
            'subject_template': '1. fizetési felszólítás - lejárt számlák',
            'body_template': '<p>Tisztelt Ügyfél!</p><p>Ezúton küldjük az 1. fizetési felszólítást a lejárt számlákról.</p>{invoices_table}<p>Kérjük a tartozás mielőbbi rendezését.</p><p>{today_city_date}</p><p>{signature_html}</p>',
        },
        REMINDER_2: {
            'name': '2. felszólítás',
            'subject_template': '2. fizetési felszólítás - lejárt számlák',
            'body_template': '<p>Tisztelt Ügyfél!</p><p>Ez a 2. fizetési felszólítás a lejárt számlákra vonatkozóan.</p>{invoices_table}<p>Kérjük haladéktalanul rendezze tartozását.</p><p>{today_city_date}</p><p>{signature_html}</p>',
        },
        LEGAL: {
            'name': 'Ügyvédi',
            'subject_template': 'Ügyvédi felszólítás előkészítése',
            'body_template': '<p>Tisztelt Ügyfél!</p><p>Tájékoztatjuk, hogy amennyiben a lejárt tartozások rendezése nem történik meg, ügyvédi úton érvényesítjük követelésünket.</p>{invoices_table}<p>{today_city_date}</p><p>{signature_html}</p>',
        },
    }

    for company in Company.objects.all().iterator():
        ces = CompanyEmailSettings.objects.filter(company=company).first()

        for template_type, template_defaults in defaults.items():
            subject = template_defaults['subject_template']
            body = template_defaults['body_template']

            if template_type == INVOICE_SEND and ces:
                subject = (getattr(ces, 'default_subject_template', None) or subject or '').strip()
                body = (getattr(ces, 'default_body_template', None) or body or '').strip()
            elif template_type == ARREARS and ces:
                subject = (getattr(ces, 'arrears_subject_template', None) or subject or '').strip()
                body = (getattr(ces, 'arrears_body_template', None) or body or '').strip()

            obj, _ = EmailTemplate.objects.get_or_create(
                company=company,
                template_type=template_type,
                defaults={
                    'name': template_defaults['name'],
                    'subject_template': subject,
                    'body_template': body,
                    'is_active': True,
                }
            )

            changed = []
            if obj.name != template_defaults['name']:
                obj.name = template_defaults['name']
                changed.append('name')
            if not obj.subject_template:
                obj.subject_template = subject
                changed.append('subject_template')
            if not obj.body_template:
                obj.body_template = body
                changed.append('body_template')
            if changed:
                obj.save(update_fields=changed)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0076_emailtemplate_emailsignature_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_templates, noop_reverse),
    ]
