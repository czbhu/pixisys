import os
import django
import sys
from django.utils import timezone
from datetime import timedelta

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp_system.settings")
django.setup()

from apps.sales.models import DeliveryNote

def main():
    print("Starting auto-confirmation of delivery notes...")
    cutoff = timezone.now() - timedelta(hours=48)
    
    # Check logic: created_at vs issue_date?
    # User said: "48 óra után". 48 hours after what?
    # created_at is strictly when the record was made.
    # issue_date is just a date (no time).
    # Safe to use created_at for precise 48h window.
    
    notes_to_confirm = DeliveryNote.objects.filter(
        is_confirmed=False,
        created_at__lt=cutoff
    )
    
    count = 0
    for dn in notes_to_confirm:
        print(f"Auto-confirming Delivery Note: {dn.delivery_note_number} (Created: {dn.created_at})")
        dn.is_confirmed = True
        dn.confirmed_at = timezone.now()
        dn.confirmed_by_info = "Automata (48h lejárt)"
        dn.save(update_fields=['is_confirmed', 'confirmed_at', 'confirmed_by_info'])
        count += 1
        
    print(f"Finished. Confirmed {count} delivery notes.")

if __name__ == "__main__":
    main()
