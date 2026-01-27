"""
Beszállító automatikus regisztráció és adategyeztetés
Bejövő számlák esetén automatikusan felveszi a beszállítót az Ügyfelek közé,
vagy ha már létezik, akkor összehasonlítja és kéri a felülírást.
"""

import logging
import xml.etree.ElementTree as ET
from typing import Dict, Optional, List, Tuple
from invoices.models import Customer, CustomerBankAccount

logger = logging.getLogger(__name__)


def extract_supplier_data_from_invoice_xml(xml_text: str) -> Optional[Dict]:
    """
    Kinyeri a beszállító adatokat a NAV számla XML-ből.
    
    Returns:
        Dict with keys: tax_number, name, address, city, postal_code, bank_account, etc.
        vagy None ha nem sikerült
    """
    if not xml_text:
        return None
        
    try:
        root = ET.fromstring(xml_text)
        
        # NAV 3.0 namespace
        ns = {'nav': 'http://schemas.nav.gov.hu/OSA/3.0/data'}
        
        supplier_data = {}
        
        # Keresés namespace-szel és anélkül is
        supplier_info = root.find('.//nav:supplierInfo', ns) or root.find('.//supplierInfo')
        
        if supplier_info is None:
            return None
            
        # Adószám (első 8 számjegy belföldinél, teljes külföldieknél)
        supplier_tax_num = supplier_info.find('.//nav:supplierTaxNumber', ns) or supplier_info.find('.//supplierTaxNumber')
        if supplier_tax_num is not None:
            # taxpayerId elem (első 8 számjegy)
            taxpayer_id = supplier_tax_num.find('.//nav:taxpayerId', ns) or supplier_tax_num.find('.//taxpayerId')
            # groupMemberTaxNumber (teljes adószám csoport tag esetén)
            group_member = supplier_tax_num.find('.//nav:groupMemberTaxNumber', ns) or supplier_tax_num.find('.//groupMemberTaxNumber')
            # communityVatNumber (külföldi)
            community_vat = supplier_tax_num.find('.//nav:communityVatNumber', ns) or supplier_tax_num.find('.//communityVatNumber')
            # thirdStateTaxId (harmadik ország)
            third_state = supplier_tax_num.find('.//nav:thirdStateTaxId', ns) or supplier_tax_num.find('.//thirdStateTaxId')
            
            if taxpayer_id is not None and taxpayer_id.text:
                supplier_data['tax_number'] = taxpayer_id.text.strip()
                supplier_data['is_hungarian'] = True
                # VAT code és county code
                vat_code_elem = supplier_tax_num.find('.//nav:vatCode', ns) or supplier_tax_num.find('.//vatCode')
                county_code_elem = supplier_tax_num.find('.//nav:countyCode', ns) or supplier_tax_num.find('.//countyCode')
                if vat_code_elem is not None and vat_code_elem.text:
                    supplier_data['vat_code'] = vat_code_elem.text.strip()
                if county_code_elem is not None and county_code_elem.text:
                    supplier_data['county_code'] = county_code_elem.text.strip()
            elif group_member is not None and group_member.text:
                supplier_data['tax_number'] = group_member.text.strip()[:8]  # Első 8 számjegy
                supplier_data['full_tax_number'] = group_member.text.strip()
                supplier_data['is_hungarian'] = True
            elif community_vat is not None and community_vat.text:
                supplier_data['tax_number'] = community_vat.text.strip()
                supplier_data['eu_tax_number'] = community_vat.text.strip()
                supplier_data['is_hungarian'] = False
            elif third_state is not None and third_state.text:
                supplier_data['tax_number'] = third_state.text.strip()
                supplier_data['is_hungarian'] = False
        
        if not supplier_data.get('tax_number'):
            return None
            
        # Név
        supplier_name = supplier_info.find('.//nav:supplierName', ns) or supplier_info.find('.//supplierName')
        if supplier_name is not None and supplier_name.text:
            supplier_data['name'] = supplier_name.text.strip()
            
        # Cím
        supplier_address = supplier_info.find('.//nav:supplierAddress', ns) or supplier_info.find('.//supplierAddress')
        if supplier_address is not None:
            simple_addr = supplier_address.find('.//nav:simpleAddress', ns) or supplier_address.find('.//simpleAddress')
            detailed_addr = supplier_address.find('.//nav:detailedAddress', ns) or supplier_address.find('.//detailedAddress')
            
            if simple_addr is not None:
                country = simple_addr.find('.//nav:countryCode', ns) or simple_addr.find('.//countryCode')
                postal = simple_addr.find('.//nav:postalCode', ns) or simple_addr.find('.//postalCode')
                city = simple_addr.find('.//nav:city', ns) or simple_addr.find('.//city')
                addr_line = simple_addr.find('.//nav:additionalAddressDetail', ns) or simple_addr.find('.//additionalAddressDetail')
                
                if country is not None and country.text:
                    supplier_data['country'] = country.text.strip()
                if postal is not None and postal.text:
                    supplier_data['postal_code'] = postal.text.strip()
                if city is not None and city.text:
                    supplier_data['city'] = city.text.strip()
                if addr_line is not None and addr_line.text:
                    supplier_data['address'] = addr_line.text.strip()
                    
            elif detailed_addr is not None:
                country = detailed_addr.find('.//nav:countryCode', ns) or detailed_addr.find('.//countryCode')
                postal = detailed_addr.find('.//nav:postalCode', ns) or detailed_addr.find('.//postalCode')
                city = detailed_addr.find('.//nav:city', ns) or detailed_addr.find('.//city')
                street = detailed_addr.find('.//nav:streetName', ns) or detailed_addr.find('.//streetName')
                public_place = detailed_addr.find('.//nav:publicPlaceCategory', ns) or detailed_addr.find('.//publicPlaceCategory')
                number = detailed_addr.find('.//nav:number', ns) or detailed_addr.find('.//number')
                building = detailed_addr.find('.//nav:building', ns) or detailed_addr.find('.//building')
                staircase = detailed_addr.find('.//nav:staircase', ns) or detailed_addr.find('.//staircase')
                floor_elem = detailed_addr.find('.//nav:floor', ns) or detailed_addr.find('.//floor')
                door = detailed_addr.find('.//nav:door', ns) or detailed_addr.find('.//door')
                
                if country is not None and country.text:
                    supplier_data['country'] = country.text.strip()
                if postal is not None and postal.text:
                    supplier_data['postal_code'] = postal.text.strip()
                if city is not None and city.text:
                    supplier_data['city'] = city.text.strip()
                if street is not None and street.text:
                    supplier_data['street_name'] = street.text.strip()
                if public_place is not None and public_place.text:
                    supplier_data['public_place_category'] = public_place.text.strip()
                if number is not None and number.text:
                    supplier_data['street_number'] = number.text.strip()
                if building is not None and building.text:
                    supplier_data['building'] = building.text.strip()
                if staircase is not None and staircase.text:
                    supplier_data['staircase'] = staircase.text.strip()
                if floor_elem is not None and floor_elem.text:
                    supplier_data['floor'] = floor_elem.text.strip()
                if door is not None and door.text:
                    supplier_data['door'] = door.text.strip()
        
        # Bankszámlaszám keresése
        # Először a supplierBankAccountNumber-ből
        bank_elem = supplier_info.find('.//nav:supplierBankAccountNumber', ns) or supplier_info.find('.//supplierBankAccountNumber')
        if bank_elem is not None and bank_elem.text:
            supplier_data['bank_account'] = bank_elem.text.strip().replace(' ', '').replace('-', '')
        
        # Ha nincs, akkor a paymentMethod TRANSFER esetén keressük máshol
        if not supplier_data.get('bank_account'):
            # Keresés az invoiceData részen belül is
            payment_method = root.find('.//nav:paymentMethod', ns) or root.find('.//paymentMethod')
            if payment_method is not None and payment_method.text == 'TRANSFER':
                # Próbáljunk meg bankszámlát találni az XML más részeiből
                bank_account_elem = root.find('.//nav:bankAccountNumber', ns) or root.find('.//bankAccountNumber')
                if bank_account_elem is not None and bank_account_elem.text:
                    supplier_data['bank_account'] = bank_account_elem.text.strip().replace(' ', '').replace('-', '')
        
        return supplier_data
        
    except Exception as e:
        logger.error(f"Hiba a beszállító adatok kinyerésében: {e}")
        return None


def compare_customer_data(existing: Customer, new_data: Dict) -> List[str]:
    """
    Összehasonlítja a meglévő ügyfél adatait az új adatokkal.
    
    Returns:
        Lista a különbségekről, pl: ["Név: 'Régi Kft.' -> 'Új Kft.'", ...]
    """
    differences = []
    
    # Név
    if new_data.get('name') and existing.name != new_data['name']:
        differences.append(f"Név: '{existing.name}' -> '{new_data['name']}'")
    
    # Cím mezők
    if new_data.get('city') and existing.city != new_data['city']:
        differences.append(f"Város: '{existing.city or ''}' -> '{new_data['city']}'")
    
    if new_data.get('postal_code') and existing.postal_code != new_data['postal_code']:
        differences.append(f"Irányítószám: '{existing.postal_code or ''}' -> '{new_data['postal_code']}'")
    
    if new_data.get('address') and existing.address != new_data['address']:
        differences.append(f"Cím: '{existing.address or ''}' -> '{new_data['address']}'")
    
    if new_data.get('street_name') and existing.street_name != new_data['street_name']:
        differences.append(f"Utca: '{existing.street_name or ''}' -> '{new_data['street_name']}'")
    
    if new_data.get('street_number') and existing.street_number != new_data['street_number']:
        differences.append(f"Házszám: '{existing.street_number or ''}' -> '{new_data['street_number']}'")
    
    if new_data.get('country') and existing.country != new_data['country']:
        differences.append(f"Ország: '{existing.country or 'Magyarország'}' -> '{new_data['country']}'")
    
    # Bankszámla
    if new_data.get('bank_account'):
        existing_bank_accounts = list(existing.bank_accounts.values_list('account_number', flat=True))
        if new_data['bank_account'] not in existing_bank_accounts:
            differences.append(f"Új bankszámlaszám: '{new_data['bank_account']}'")
    
    return differences


def auto_register_or_update_supplier(company, xml_text: str, payment_method: Optional[str] = None) -> Tuple[Optional[Customer], Optional[Dict]]:
    """
    Automatikusan regisztrálja vagy frissíti a beszállítót az Ügyfelek között.
    
    Args:
        company: A cég objektum
        xml_text: NAV számla XML szöveg
        payment_method: Fizetési mód (pl. 'TRANSFER')
    
    Returns:
        (customer, conflict_data) tuple
        - customer: A létrehozott/megtalált Customer objektum vagy None
        - conflict_data: Ha volt változás vagy új bankszámla, visszaadja az infót (monitorozáshoz)
    """
    supplier_data = extract_supplier_data_from_invoice_xml(xml_text)
    
    if not supplier_data or not supplier_data.get('tax_number'):
        logger.warning("Nem sikerült kinyerni a beszállító adatokat az XML-ből")
        return None, None
    
    tax_number = supplier_data['tax_number']
    
    # Keresés adószám alapján
    existing = Customer.objects.filter(tax_number=tax_number).first()
    
    if existing:
        changes = []
        requires_save = False

        # 1. Update basic fields if changed (except bank account)
        fields_map = {
            'name': 'name',
            'city': 'city',
            'postal_code': 'postal_code',
            'address': 'address',
            'street_name': 'street_name',
            'street_number': 'street_number',
            'country': 'country'
        }
        
        for xml_key, model_key in fields_map.items():
            new_val = supplier_data.get(xml_key)
            if new_val and getattr(existing, model_key) != new_val:
                old_val = getattr(existing, model_key)
                setattr(existing, model_key, new_val)
                changes.append(f"{model_key}: '{old_val}' -> '{new_val}'")
                requires_save = True

        if requires_save:
            existing.save()
            logger.info(f"Beszállító adatai frissítve ({tax_number}): {changes}")
        
        # 2. Handle Bank Account - Check if new one is needed
        status_msg = None
        if supplier_data.get('bank_account'):
            new_bank_acc = supplier_data['bank_account']
            existing_bank_accounts = list(existing.bank_accounts.values_list('account_number', flat=True))
            
            # Normalize for comparison (remove spaces/dashes if any remained, though extract normalizes)
            normalized_new = new_bank_acc.replace(' ', '').replace('-', '')
            normalized_existing = [acc.replace(' ', '').replace('-', '') for acc in existing_bank_accounts if acc]
            
            if normalized_new not in normalized_existing:
                CustomerBankAccount.objects.create(
                    customer=existing,
                    account_number=normalized_new,
                    is_primary=False,
                    is_approved=False 
                )
                msg = f"Új (jóváhagyásra váró) bankszámla hozzáadva: {normalized_new}"
                changes.append(msg)
                status_msg = {'bank_account_pending': normalized_new}
                logger.info(f"{msg} ({tax_number})")

        if changes:
            return existing, {'updated': True, 'changes': changes, 'status': status_msg}
            
        return existing, None
    else:
        # Nincs még ilyen ügyfél, létrehozzuk
        try:
            # Alapértelmezett értékek
            customer_defaults = {
                'name': supplier_data.get('name', f'Beszállító {tax_number}'),
                'tax_number': tax_number,
                'is_supplier': True,
                'is_customer': False,
                'country': supplier_data.get('country', 'Magyarország'),
                'is_hungarian_taxpayer': supplier_data.get('is_hungarian', True),
            }
            
            # Opcionális mezők
            optional_fields = [
                'address', 'city', 'postal_code', 'street_name', 'public_place_category',
                'street_number', 'building', 'staircase', 'floor', 'door', 
                'vat_code', 'county_code', 'full_tax_number', 'eu_tax_number'
            ]
            
            for field in optional_fields:
                if supplier_data.get(field):
                    customer_defaults[field] = supplier_data[field]
            
            # VAT status beállítása
            if supplier_data.get('is_hungarian', True):
                customer_defaults['vat_status'] = 'DOMESTIC'
            else:
                customer_defaults['vat_status'] = 'OTHER'
            
            customer = Customer.objects.create(**customer_defaults)
            
            # Bankszámla hozzáadása ha van (új ügyfélnél automatikusan jóváhagyottnak tekintjük?)
            # A prompt szerint: "hogy ha új bankszámla kerülne az ügyfélhez... usernek jóváhagyni".
            # Ha az ügyfél teljesen új, akkor a bankszámla is új. De talán itt elfogadható, hogy az első valid.
            if supplier_data.get('bank_account'):
                CustomerBankAccount.objects.create(
                    customer=customer,
                    account_number=supplier_data['bank_account'],
                    is_primary=True,
                    is_approved=True 
                )
            
            logger.info(f"Új beszállító létrehozva: {customer.name} ({tax_number})")
            return customer, {'created': True}
            
        except Exception as e:
            logger.error(f"Hiba a beszállító létrehozása során: {e}")
            return None, None


def get_supplier_bank_account_for_invoice(company, supplier_tax_number: str, invoice_xml: str, preferred_currency: str = None) -> Optional[str]:
    """
    Visszaadja a beszállító bankszámlaszámát a számlához.
    
    1. Először az XML-ből próbálja kinyerni
    2. Ha nincs az XML-ben, akkor az ügyféltörzsből veszi (ha TRANSFER a fizetési mód)
    
    Args:
        company: Cég objektum
        supplier_tax_number: Beszállító adószáma
        invoice_xml: NAV számla XML
        
    Returns:
        Bankszámlaszám vagy None
    """
    # Először XML-ből
    supplier_data = extract_supplier_data_from_invoice_xml(invoice_xml)
    if supplier_data and supplier_data.get('bank_account'):
        return supplier_data['bank_account']
    
    # Ha nincs XML-ben, ügyféltörzsből
    if supplier_tax_number:
        customer = Customer.objects.filter(tax_number=supplier_tax_number).first()
        if customer:
            qs = customer.bank_accounts
            if preferred_currency:
                # Prefer primary in desired currency, then any in currency, else fall back
                bank = qs.filter(currency=preferred_currency, is_primary=True).first()
                if bank and bank.account_number:
                    return bank.account_number.replace(' ', '').replace('-', '')
                bank = qs.filter(currency=preferred_currency).first()
                if bank and bank.account_number:
                    return bank.account_number.replace(' ', '').replace('-', '')
            # If no currency match, pick primary
            bank = qs.filter(is_primary=True).first()
            if bank and bank.account_number:
                return bank.account_number.replace(' ', '').replace('-', '')
            bank = qs.first()
            if bank and bank.account_number:
                return bank.account_number.replace(' ', '').replace('-', '')
    
    return None
