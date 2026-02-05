import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.core.models import EmailTemplate

def create_template():
    key = 'order_confirmation'
    if EmailTemplate.objects.filter(key=key).exists():
        print(f"Template '{key}' already exists.")
        return

    subject = "Megrendelés visszaigazolás - {order_number}"
    body = """<p>Tisztelt {contact_name}!</p>

<p>Megrendelését köszönettel megkaptuk és ezúton visszaigazoljuk.</p>

<p><strong>Megrendelés száma:</strong> {order_number}<br>
<strong>Dátum:</strong> {order_date}</p>

<p>Amennyiben kérdése van, forduljon hozzánk bizalommal.</p>

<p>Üdvözlettel,<br>
{company_name}</p>
"""
    
    EmailTemplate.objects.create(
        key=key,
        name="Megrendelés visszaigazolás",
        subject_template=subject,
        body_template=body,
        is_html=True,
        description="Ügyfél megrendelés visszaigazolása"
    )
    print(f"Template '{key}' created successfully.")

if __name__ == '__main__':
    create_template()
