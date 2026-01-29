from .models import Company

def sync_company_to_local_db(data):
    """
    Syncs the company data from PixInvoice response to the local Company table.
    Ensures that the 'is_supplier' flag is consistent for ERP modules.
    Uses 'id' from PixInvoice as 'external_id' locally.
    """
    try:
        cid = data.get('id') or data.get('customer_id')
        if not cid:
            return None

        is_supplier = data.get('is_supplier', False)
        
        # Check by external_id first
        qs = Company.objects.filter(external_id=cid)
        if not qs.exists():
            # Fallback: check by tax number (risky but useful for legacy)
            tax = data.get('tax_number')
            if tax:
                qs = Company.objects.filter(tax_number=tax)

        if qs.exists():
            company = qs.first()
            # Update fields
            company.external_id = cid
            company.is_supplier = is_supplier or company.is_supplier
            company.is_customer = data.get('is_customer', True) or company.is_customer
            if not company.tax_number and data.get('tax_number'):
                company.tax_number = data.get('tax_number')
            # Always update name if it looks like a stub (starts with "External Client")
            current_name = company.name or ''
            new_name = data.get('name') or data.get('customer_name')
            if new_name and (current_name.startswith("External Client") or not current_name or current_name == 'Névtelen'):
                 company.name = new_name
            elif new_name and len(new_name) > len(current_name) + 5: # update if significantly better?
                 # Safe update strategy: Prefer longest name? or always update?
                 # Let's trust PixInvoice as Source of Truth for Name
                 company.name = new_name

            company.save()
        else:
            # Fallback 2: Check by Name (exact match)
            name = data.get('name') or data.get('customer_name')
            if name:
                 qs_name = Company.objects.filter(name__iexact=name)
                 if qs_name.exists():
                     company = qs_name.first()
                     company.external_id = cid
                     company.save()
                 else:
                    # Create new
                     company = Company.objects.create(
                        external_id=cid,
                        name=name or 'Névtelen',
                        is_supplier=is_supplier,
                        is_customer=data.get('is_customer', True),
                        tax_number=data.get('tax_number'),
                    )
            else:
                 # Create stub with ID if no name provided (shouldn't happen from PixInvoice API)
                 company = Company.objects.create(
                    external_id=cid,
                    name=f"External Client {str(cid)[:8]}",
                    is_supplier=is_supplier,
                    is_customer=data.get('is_customer', True),
                )
        return company
                     
    except Exception as e:
        import traceback
        print(f"Error syncing company {data.get('id')} to local DB: {e}")
        # traceback.print_exc()
        return None
