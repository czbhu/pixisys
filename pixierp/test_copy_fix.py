import os
import sys
import django
from django.conf import settings

sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp_system.settings")
django.setup()

# Set ALLOWED_HOSTS to include * for testing
settings.ALLOWED_HOSTS = ['*']

from django.test import Client
from django.contrib.auth import get_user_model
from apps.sales.models import QuoteRequest, QuoteRequestItem
from django.db import transaction

User = get_user_model()
user = User.objects.filter(is_superuser=True).first()
if not user:
    user = User.objects.create_superuser('temp_admin', 'admin@example.com', 'password123')

client = Client()
client.force_login(user)

qr = QuoteRequest.objects.filter(items__isnull=False).first()

if not qr:
    # Try creating one if none exists
    print("Creating a temporary QuoteRequest with items...")
    with transaction.atomic():
        qr = QuoteRequest.objects.create(subject="Test Copy")
        QuoteRequestItem.objects.create(quote_request=qr, item_name="Test Item")

if not qr:
    print("Still no QuoteRequest with items found.")
else:
    print(f"Testing copy for QuoteRequest ID: {qr.id}")
    try:
        with transaction.atomic():
            paths_to_try = [
                f"/api/sales/quote-requests/{qr.id}/copy/",
                f"/sales/quote-requests/{qr.id}/copy/"
            ]
            
            response = None
            for path in paths_to_try:
                response = client.post(path)
                if response.status_code != 404:
                    break

            if response and response.status_code in [200, 201]:
                data = response.json()
                new_qr_id = data.get('id')
                new_items = QuoteRequestItem.objects.filter(quote_request_id=new_qr_id)
                
                print(f"Copy successful (Status {response.status_code}). New QR ID: {new_qr_id}")
                for item in new_items:
                    print(f"Item ID: {item.id}, item_name: '{item.item_name}'")
                
                if new_items.exists() and all(item.item_name for item in new_items):
                    print("Validation SUCCESS: All copied items have non-empty item_name.")
                elif not new_items.exists():
                    print("Validation FAILURE: No items were copied.")
                else:
                    print("Validation FAILURE: Some copied items have empty item_name.")
            else:
                status = response.status_code if response else "No response"
                content = response.content.decode()[:1000] if response else ""
                print(f"Copy failed. Status: {status}, Content: {content}")
            
            raise Exception("Force rollback")
    except Exception as e:
        if str(e) == "Force rollback":
            print("Transaction rolled back successfully.")
        else:
            import traceback
            traceback.print_exc()
