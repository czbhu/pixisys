import os
import sys
import django
from datetime import date, datetime

# Setup Django environment
sys.path.append('/home/ceze/pixisys/pixinvoice/invoice_app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invoice_system.settings')
django.setup()

from invoices.models import Company
from invoices.views.views import InvoiceViewSet
from rest_framework.request import Request
from django.http import HttpRequest

def fix_missing_invoices():
    print("Starting fix for missing invoices (2025-08-22 to 2025-09-11)...")
    
    companies = Company.objects.filter(is_active=True)
    view = InvoiceViewSet()
    view.action = 'list_incoming'  # Mock action
    
    # Create a mock request object
    request = HttpRequest()
    request.method = 'GET'
    
    # Target date range
    date_from_str = '2025-08-22'
    date_to_str = '2025-09-11'
    
    for company in companies:
        print(f"Processing company: {company.name} ({company.tax_number})")
        
        # Invoke logic via view method
        request.GET = {
            'company_id': str(company.id),
            'date_from': date_from_str,
            'date_to': date_to_str,
            'refresh': '1', # Force refresh
            'backfill_all': '1', # Ensure backfill
            'page_size': '1',
            'status': 'all' # avoid filtering
        }
        
        drf_request = Request(request)
        drf_request.company = company 
        
        try:
            response = view.list_incoming(drf_request)
            if hasattr(response, 'data'):
                data = response.data
                print(f"  Refreshed: {data.get('refreshed', False)}, Upserted: {data.get('upserted', 0)}")
                if data.get('refreshError'):
                    print(f"  Error: {data.get('refreshError')}")
            else:
                 print(f"  Status: {response.status_code}")
                
        except Exception as e:
            print(f"  Exception during sync: {e}")

    print("Fix process completed.")

if __name__ == '__main__':
    fix_missing_invoices()
