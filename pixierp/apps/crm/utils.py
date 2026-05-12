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


def bulk_sync_companies_to_local_db(items):
    """
    Efficiently syncs a list of PixInvoice company items to the local DB.
    Uses bulk queries instead of per-item DB hits.
    Returns a dict: {external_id: local_company} for all successfully synced items.
    """
    if not items:
        return {}

    ext_ids = [str(item.get('id') or item.get('customer_id') or '') for item in items]
    ext_ids = [eid for eid in ext_ids if eid]

    # Load all existing companies by external_id in ONE query
    existing_by_ext = {
        str(c.external_id): c
        for c in Company.objects.filter(external_id__in=ext_ids)
    }

    # Also load by tax number for fallback (those without external_id yet)
    tax_numbers = [
        str(item.get('tax_number') or '')
        for item in items
        if item.get('tax_number') and str(item.get('id') or '') not in existing_by_ext
    ]
    existing_by_tax = {}
    if tax_numbers:
        existing_by_tax = {
            str(c.tax_number): c
            for c in Company.objects.filter(tax_number__in=tax_numbers)
            if c.tax_number
        }

    to_update = []
    to_create = []
    result = {}

    for item in items:
        cid = str(item.get('id') or item.get('customer_id') or '')
        if not cid:
            continue
        name = item.get('name') or item.get('customer_name') or ''
        is_supplier = bool(item.get('is_supplier', False))
        is_customer = item.get('is_customer', True)
        if is_customer is None:
            is_customer = True
        tax = item.get('tax_number') or ''

        company = existing_by_ext.get(cid)
        if not company and tax:
            company = existing_by_tax.get(str(tax))

        if company:
            changed = False
            if str(company.external_id or '') != cid:
                company.external_id = cid
                changed = True
            if is_supplier and not company.is_supplier:
                company.is_supplier = True
                changed = True
            if is_customer and not company.is_customer:
                company.is_customer = True
                changed = True
            if not company.tax_number and tax:
                company.tax_number = tax
                changed = True
            cur = company.name or ''
            if name and (cur.startswith('External Client') or not cur or cur == 'Névtelen'):
                company.name = name
                changed = True
            if changed:
                to_update.append(company)
            result[cid] = company
            existing_by_ext[cid] = company  # ensure indexed
        else:
            new_company = Company(
                external_id=cid,
                name=name or f'External Client {cid[:8]}',
                is_supplier=is_supplier,
                is_customer=bool(is_customer),
                tax_number=tax or None,
            )
            to_create.append((cid, new_company))

    # Bulk update
    if to_update:
        Company.objects.bulk_update(
            to_update,
            ['external_id', 'is_supplier', 'is_customer', 'tax_number', 'name'],
            batch_size=200,
        )

    # Bulk create
    if to_create:
        new_objs = [obj for _, obj in to_create]
        created = Company.objects.bulk_create(new_objs, ignore_conflicts=False, batch_size=200)
        for obj in created:
            if obj.external_id:
                result[str(obj.external_id)] = obj

    for cid, company in result.items():
        pass  # already populated above

    return result

