
import os
import sys

# Add project root to sys.path
sys.path.append('/home/ceze/pixisys/pixinvoice/invoice_app')
# Adjust based on manage.py environment
sys.path.append('/home/ceze/pixisys/pixinvoice/invoice_app')

# Try importing views
try:
    from invoices.views import views
    print("Views imported successfully")
except Exception as e:
    print(f"Error importing views: {e}")
