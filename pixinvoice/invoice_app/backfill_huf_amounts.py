#!/usr/bin/env python
"""
Backfill HUF amounts for all invoices that have XML data but missing HUF amounts.
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invoice_system.settings')
django.setup()

from invoices.models import IncomingInvoiceDigest, IncomingInvoiceData
import xml.etree.ElementTree as ET
from decimal import Decimal

def parse_huf_amounts_from_xml(xml_text: str):
    """Extract HUF amounts and exchange rate from invoice XML"""
    try:
        root = ET.fromstring(xml_text)
        result = {
            'invoice_net_amount_huf': None,
            'invoice_vat_amount_huf': None,
            'exchange_rate': None
        }
        for el in root.iter():
            try:
                tag_raw = el.tag.split('}', 1)[-1] if isinstance(el.tag, str) and '}' in el.tag else el.tag
                tag = (tag_raw or '').lower()
                val = (el.text or '').strip()
                if tag == 'invoicenetamounthuf' and val:
                    result['invoice_net_amount_huf'] = Decimal(val)
                elif tag == 'invoicevatamounthuf' and val:
                    result['invoice_vat_amount_huf'] = Decimal(val)
                elif tag == 'exchangerate' and val:
                    result['exchange_rate'] = Decimal(val)
            except Exception:
                continue
        return result
    except Exception:
        return None

def main():
    # Find all XML data
    xml_data_list = IncomingInvoiceData.objects.all()
    total = xml_data_list.count()
    print(f"Processing {total} XML records...")
    
    updated_count = 0
    skipped_count = 0
    error_count = 0
    
    for idx, xml_data in enumerate(xml_data_list, 1):
        if idx % 100 == 0:
            print(f"Progress: {idx}/{total}")
        
        try:
            # Parse HUF amounts
            huf_amounts = parse_huf_amounts_from_xml(xml_data.xml_text)
            if not huf_amounts:
                skipped_count += 1
                continue
            
            # Find matching digest
            digest = IncomingInvoiceDigest.objects.filter(
                company=xml_data.company,
                invoice_number=xml_data.invoice_number
            ).first()
            
            if not digest:
                skipped_count += 1
                continue
            
            # Check if update needed
            needs_update = False
            update_fields = {}
            
            if huf_amounts.get('invoice_net_amount_huf') is not None and digest.invoice_net_amount_huf is None:
                update_fields['invoice_net_amount_huf'] = huf_amounts['invoice_net_amount_huf']
                needs_update = True
            
            if huf_amounts.get('invoice_vat_amount_huf') is not None and digest.invoice_vat_amount_huf is None:
                update_fields['invoice_vat_amount_huf'] = huf_amounts['invoice_vat_amount_huf']
                needs_update = True
            
            if huf_amounts.get('exchange_rate') is not None and digest.exchange_rate is None:
                update_fields['exchange_rate'] = huf_amounts['exchange_rate']
                needs_update = True
            
            if needs_update:
                for k, v in update_fields.items():
                    setattr(digest, k, v)
                digest.save(update_fields=list(update_fields.keys()))
                updated_count += 1
                print(f"  Updated {digest.invoice_number}: NetHUF={digest.invoice_net_amount_huf}, VatHUF={digest.invoice_vat_amount_huf}, Rate={digest.exchange_rate}")
            else:
                skipped_count += 1
                
        except Exception as e:
            error_count += 1
            print(f"  Error processing {xml_data.invoice_number}: {e}")
    
    print(f"\nDone!")
    print(f"  Updated: {updated_count}")
    print(f"  Skipped: {skipped_count}")
    print(f"  Errors: {error_count}")

if __name__ == '__main__':
    main()
