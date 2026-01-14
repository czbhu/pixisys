"""
CSV Import views for customers and contacts
"""
import csv
import io
import html
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from invoices.models import Customer, Contact, CompanyNAVConfiguration
from invoices.serializers import CustomerSerializer, ContactSerializer
from invoices.nav_service import NAVService
from invoices.views.nav_api_views import parse_nav_taxpayer_response
import logging
import json
import time

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([AllowAny])
def export_customer_sample_csv(request):
    """Export sample customer CSV template"""
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="ugyfel_minta.csv"'
    response.write('\ufeff')  # UTF-8 BOM for Excel
    
    writer = csv.writer(response)
    writer.writerow([
        'Név', 'Rövid név', 'Adószám (8 jegyű)', 'Cím', 'Utca név', 'Közterület jellege',
        'Házszám', 'Épület', 'Lépcsőház', 'Emelet', 'Ajtó', 'Város', 'Irányítószám',
        'Ország', 'E-mail', 'Telefon', 'ÁFA kód', 'Megyekód', 'ÁFA csoport ID',
        'ÁFA csoport tag adószám', 'Adóalanyiság (DOMESTIC/PRIVATE_PERSON/OTHER)',
        'EU adószám', 'Fizetési határidő (nap)'
    ])
    
    # Példa sor
    writer.writerow([
        'Példa Kft.', 'Példa', '12345678', 'Fő utca 1.', 'Fő utca', 'utca',
        '1', '', '', '', '', 'Budapest', '1011',
        'Hungary', 'info@pelda.hu', '+36301234567', '2', '01', '',
        '', 'DOMESTIC', '', '8'
    ])
    
    return response


@api_view(['GET'])
@permission_classes([AllowAny])
def export_contact_sample_csv(request):
    """Export sample contact CSV template"""
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="kapcsolattarto_minta.csv"'
    response.write('\ufeff')  # UTF-8 BOM for Excel
    
    writer = csv.writer(response)
    writer.writerow([
        'Vezetéknév', 'Keresztnév', 'Ügyfél adószáma (8 jegyű, opcionális)', 'Pozíció', 'Osztály',
        'Kapcsolattartó típusa (primary/billing/technical/sales/support/other)',
        'E-mail', 'Telefon', 'Mobil', 'Fax', 'Megjegyzések', 'Elsődleges (igen/nem)', 'Aktív (igen/nem)'
    ])
    
    # Példa sor céghez kapcsolódó kapcsolattartóval
    writer.writerow([
        'Kovács', 'János', '12345678', 'Ügyvezető', 'Vezetőség',
        'primary', 'kovacs.janos@pelda.hu', '+36301234567', '+36301234568', '', 'Fontos ügyfél', 'igen', 'igen'
    ])
    
    # Példa sor magánszemély kapcsolattartóval (nincs adószám)
    writer.writerow([
        'Nagy', 'Péter', '', '', '',
        'other', 'nagy.peter@email.com', '+36309876543', '', '', 'Magánszemély', 'nem', 'igen'
    ])
    
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def import_customers_streaming(request):
    """
    Import customers from CSV file with real-time progress updates (Server-Sent Events)
    
    Parameters:
    - file: CSV file
    - nav_validation: boolean (optional, default False) - validate tax numbers with NAV API
    - company_id: UUID (optional) - company ID for NAV validation
    
    Returns: Server-Sent Events stream with progress updates
    """
    if 'file' not in request.FILES:
        return Response({'error': 'Nincs fájl feltöltve'}, status=status.HTTP_400_BAD_REQUEST)
    
    csv_file = request.FILES['file']
    nav_validation = request.data.get('nav_validation', 'false').lower() == 'true'
    company_id = request.data.get('company_id')
    
    if not csv_file.name.endswith('.csv'):
        return Response({'error': 'Csak CSV fájl tölthető fel'}, status=status.HTTP_400_BAD_REQUEST)
    
    def event_stream():
        """Generator function for SSE stream"""
        try:
            # Read CSV file
            decoded_file = csv_file.read().decode('utf-8-sig')
            csv_reader = csv.DictReader(io.StringIO(decoded_file))
            rows = list(csv_reader)
            total_count = len(rows)
            
            # Send initial progress
            yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': 0, 'nav_queries': 0, 'updated': 0, 'created': 0})}\n\n"
            
            created_count = 0
            updated_count = 0
            duplicate_count = 0
            error_count = 0
            errors = []
            nav_found_count = 0
            nav_not_found = []
            
            for row_num, row in enumerate(rows, start=2):
                try:
                    # Flexible field name mapping
                    raw_tax = (row.get('Adószám (8 jegyű)') or row.get('tax_number') or '').strip()
                    tax_number = raw_tax.replace('-', '').replace(' ', '')[:8]
                    
                    if not tax_number:
                        errors.append(f"Sor {row_num}: Adószám hiányzik")
                        error_count += 1
                        continue

                    if len(tax_number) != 8:
                        errors.append(f"Sor {row_num}: Az adószámnak 8 számjegyből kell állnia")
                        error_count += 1
                        continue
                    
                    # Check if customer exists (duplicate jelzés import/szinkron esetén)
                    customer = Customer.objects.filter(tax_number=tax_number).first()
                    if customer:
                        duplicate_count += 1
                        errors.append(f"Sor {row_num}: Már létezik ügyfél ezzel az adószámmal ({customer.name})")
                        yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 1, 'nav_queries': nav_found_count, 'updated': updated_count, 'created': created_count, 'duplicates': duplicate_count, 'errors': error_count})}\n\n"
                        continue
                    
                    customer_data = {'tax_number': tax_number}
                    
                    # NAV validation if enabled
                    nav_updated = False
                    if nav_validation and company_id:
                        # Send NAV query progress
                        yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 2, 'nav_queries': nav_found_count + 1, 'updated': updated_count, 'created': created_count, 'current_tax_number': tax_number})}\n\n"
                        
                        try:
                            nav_config = CompanyNAVConfiguration.objects.filter(
                                company_id=company_id, is_active=True, is_default=True
                            ).first()
                            
                            if not nav_config:
                                nav_config = CompanyNAVConfiguration.objects.filter(
                                    company_id=company_id, is_active=True
                                ).first()
                            
                            if nav_config:
                                nav_service = NAVService(nav_config)
                                nav_response = nav_service.query_taxpayer(tax_number)
                                
                                if nav_response and nav_response.get('success'):
                                    xml_string = nav_response.get('response', '')
                                    
                                    if xml_string:
                                        try:
                                            nav_data = parse_nav_taxpayer_response(xml_string)
                                            
                                            if nav_data:
                                                nav_updated = True
                                                nav_found_count += 1
                                                
                                                # Map NAV data to customer fields
                                                if nav_data.get('taxpayer_name'):
                                                    customer_data['name'] = nav_data['taxpayer_name']
                                                if nav_data.get('taxpayer_short_name'):
                                                    customer_data['short_name'] = nav_data['taxpayer_short_name']
                                                
                                                tax_detail = nav_data.get('tax_number_detail')
                                                if tax_detail:
                                                    if tax_detail.get('vatCode'):
                                                        customer_data['vat_code'] = tax_detail['vatCode']
                                                    if tax_detail.get('countyCode'):
                                                        customer_data['county_code'] = tax_detail['countyCode']
                                                
                                                address_list = nav_data.get('taxpayer_address_list', [])
                                                if address_list:
                                                    hq_address = None
                                                    for addr in address_list:
                                                        if addr.get('taxpayerAddressType') == 'HQ':
                                                            hq_address = addr
                                                            break
                                                    
                                                    if not hq_address and address_list:
                                                        hq_address = address_list[0]
                                                    
                                                    if hq_address:
                                                        if hq_address.get('postalCode'):
                                                            customer_data['postal_code'] = hq_address['postalCode']
                                                        if hq_address.get('city'):
                                                            customer_data['city'] = hq_address['city']
                                                        if hq_address.get('streetName'):
                                                            customer_data['street_name'] = hq_address['streetName']
                                                        if hq_address.get('publicPlaceCategory'):
                                                            customer_data['public_place_category'] = hq_address['publicPlaceCategory']
                                                        if hq_address.get('number'):
                                                            customer_data['street_number'] = hq_address['number']
                                                        if hq_address.get('building'):
                                                            customer_data['building'] = hq_address['building']
                                                        if hq_address.get('staircase'):
                                                            customer_data['staircase'] = hq_address['staircase']
                                                        if hq_address.get('floor'):
                                                            customer_data['floor'] = hq_address['floor']
                                                        if hq_address.get('door'):
                                                            customer_data['door'] = hq_address['door']
                                                        
                                                        address_parts = []
                                                        for key in ['streetName', 'publicPlaceCategory', 'number', 'building', 'staircase', 'floor', 'door']:
                                                            if hq_address.get(key):
                                                                address_parts.append(hq_address[key])
                                                        if address_parts:
                                                            customer_data['address'] = ' '.join(address_parts)
                                                        
                                                        if hq_address.get('countryCode'):
                                                            country_map = {'HU': 'Magyarország', 'AT': 'Ausztria', 'DE': 'Németország', 'SK': 'Szlovákia', 'RO': 'Románia'}
                                                            customer_data['country'] = country_map.get(hq_address['countryCode'], 'Egyéb')
                                                
                                                vat_group = nav_data.get('vat_group_membership')
                                                if vat_group:
                                                    if vat_group.get('vatGroupId'):
                                                        customer_data['vat_group_id'] = vat_group['vatGroupId']
                                                    if vat_group.get('vatGroupMemberTaxNumber'):
                                                        customer_data['vat_group_member_tax_number'] = vat_group['vatGroupMemberTaxNumber']
                                            else:
                                                if nav_validation:
                                                    nav_not_found.append({'name': (row.get('Név') or row.get('name') or '').strip(), 'tax_number': tax_number})
                                        except Exception as parse_error:
                                            logger.error(f"NAV XML parsing error for {tax_number}: {parse_error}")
                                            if nav_validation:
                                                nav_not_found.append({'name': (row.get('Név') or row.get('name') or '').strip(), 'tax_number': tax_number})
                                else:
                                    if nav_validation:
                                        nav_not_found.append({'name': (row.get('Név') or row.get('name') or '').strip(), 'tax_number': tax_number})
                        except Exception as nav_error:
                            logger.warning(f"NAV validation failed for {tax_number}: {nav_error}")
                            if nav_validation:
                                nav_not_found.append({'name': (row.get('Név') or row.get('name') or '').strip(), 'tax_number': tax_number})
                    
                    # Add CSV data as fallback (support both Hungarian and English field names)
                    if 'name' not in customer_data:
                        customer_data['name'] = (row.get('Név') or row.get('name') or '').strip()
                    if 'short_name' not in customer_data:
                        customer_data['short_name'] = (row.get('Rövid név') or row.get('short_name') or '').strip() or None
                    if 'street_name' not in customer_data:
                        customer_data['street_name'] = (row.get('Utca név') or row.get('street_name') or '').strip() or None
                    if 'public_place_category' not in customer_data:
                        customer_data['public_place_category'] = (row.get('Közterület jellege') or row.get('public_place_category') or '').strip() or None
                    if 'street_number' not in customer_data:
                        customer_data['street_number'] = (row.get('Házszám') or row.get('street_number') or '').strip() or None
                    if 'city' not in customer_data:
                        customer_data['city'] = (row.get('Város') or row.get('city') or '').strip() or 'Budapest'
                    if 'postal_code' not in customer_data:
                        customer_data['postal_code'] = (row.get('Irányítószám') or row.get('postal_code') or '').strip() or '0000'
                    if 'vat_code' not in customer_data:
                        customer_data['vat_code'] = (row.get('ÁFA kód') or row.get('vat_code') or '').strip() or None
                    if 'county_code' not in customer_data:
                        customer_data['county_code'] = (row.get('Megyekód') or row.get('county_code') or '').strip() or None
                    
                    if 'address' not in customer_data:
                        customer_data['address'] = (row.get('Cím') or row.get('address') or '').strip() or None
                    if 'building' not in customer_data:
                        customer_data['building'] = (row.get('Épület') or row.get('building') or '').strip() or None
                    if 'staircase' not in customer_data:
                        customer_data['staircase'] = (row.get('Lépcsőház') or row.get('staircase') or '').strip() or None
                    if 'floor' not in customer_data:
                        customer_data['floor'] = (row.get('Emelet') or row.get('floor') or '').strip() or None
                    if 'door' not in customer_data:
                        customer_data['door'] = (row.get('Ajtó') or row.get('door') or '').strip() or None
                    if 'country' not in customer_data:
                        customer_data['country'] = (row.get('Ország') or row.get('country') or '').strip() or 'Hungary'
                    if 'vat_group_id' not in customer_data:
                        customer_data['vat_group_id'] = row.get('ÁFA csoport ID', '').strip() or None
                    if 'vat_group_member_tax_number' not in customer_data:
                        customer_data['vat_group_member_tax_number'] = row.get('ÁFA csoport tag adószám', '').strip() or None
                    
                    customer_data['email'] = row.get('E-mail', '').strip() or None
                    customer_data['phone'] = row.get('Telefon', '').strip() or None
                    customer_data['vat_status'] = row.get('Adóalanyiság (DOMESTIC/PRIVATE_PERSON/OTHER)', '').strip() or 'DOMESTIC'
                    customer_data['eu_tax_number'] = row.get('EU adószám', '').strip() or None
                    customer_data['payment_due_days'] = int(row.get('Fizetési határidő (nap)', '8') or 8)
                    
                    if customer:
                        serializer = CustomerSerializer(customer, data=customer_data, partial=False)
                        if serializer.is_valid():
                            serializer.save()
                            updated_count += 1
                        else:
                            errors.append(f"Sor {row_num} ({tax_number}): {serializer.errors}")
                            error_count += 1
                    else:
                        serializer = CustomerSerializer(data=customer_data)
                        if serializer.is_valid():
                            serializer.save()
                            created_count += 1
                        else:
                            errors.append(f"Sor {row_num} ({tax_number}): {serializer.errors}")
                            error_count += 1
                    
                    # Send progress update
                    yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 1, 'nav_queries': nav_found_count, 'updated': updated_count, 'created': created_count})}\n\n"
                    
                except Exception as e:
                    errors.append(f"Sor {row_num}: {str(e)}")
                    error_count += 1
                    logger.error(f"Error importing customer row {row_num}: {e}", exc_info=True)
            
            # Send final result
            summary_message = f"Import befejezve: {created_count + updated_count} cég importálva"
            if nav_validation:
                summary_message += f", ebből {nav_found_count} cég adatait frissítette a NAV"
            
            result = {
                'type': 'complete',
                'success': True,
                'message': summary_message,
                'created': created_count,
                'updated': updated_count,
                'total': created_count + updated_count,
                'errors': error_count,
                'error_details': errors[:20],
                'nav_found': nav_found_count,
                'nav_not_found_count': len(nav_not_found),
                'nav_not_found': nav_not_found,
                'duplicates': duplicate_count
            }
            
            yield f"data: {json.dumps(result)}\n\n"
            
        except Exception as e:
            logger.error(f"Error importing customers: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def import_customers(request):
    """
    Import customers from CSV file (non-streaming version for backward compatibility)
    
    Parameters:
    - file: CSV file
    - nav_validation: boolean (optional, default False) - validate tax numbers with NAV API
    - company_id: UUID (optional) - company ID for NAV validation
    """
    if 'file' not in request.FILES:
        return Response({'error': 'Nincs fájl feltöltve'}, status=status.HTTP_400_BAD_REQUEST)
    
    csv_file = request.FILES['file']
    nav_validation = request.data.get('nav_validation', 'false').lower() == 'true'
    company_id = request.data.get('company_id')
    
    if not csv_file.name.endswith('.csv'):
        return Response({'error': 'Csak CSV fájl tölthető fel'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Read CSV file
        decoded_file = csv_file.read().decode('utf-8-sig')  # Handle BOM
        csv_reader = csv.DictReader(io.StringIO(decoded_file))
        
        created_count = 0
        updated_count = 0
        duplicate_count = 0
        error_count = 0
        errors = []
        nav_found_count = 0
        nav_not_found = []  # List of companies not found in NAV
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 (header is 1)
            try:
                raw_tax = row.get('Adószám (8 jegyű)', '').strip()
                tax_number = raw_tax.replace('-', '').replace(' ', '')[:8]
                
                if not tax_number:
                    errors.append(f"Sor {row_num}: Adószám hiányzik")
                    error_count += 1
                    continue

                if len(tax_number) != 8:
                    errors.append(f"Sor {row_num}: Az adószámnak 8 számjegyből kell állnia")
                    error_count += 1
                    continue
                
                # Check if customer exists
                customer = Customer.objects.filter(tax_number=tax_number).first()
                if customer:
                    duplicate_count += 1
                    errors.append(f"Sor {row_num}: Már létezik ügyfél ezzel az adószámmal ({customer.name})")
                    continue
                
                # Initialize customer_data with basic CSV data
                customer_data = {
                    'tax_number': tax_number,
                }
                
                # NAV validation if enabled - do this FIRST to get official data
                nav_updated = False
                if nav_validation and company_id:
                    try:
                        # Get NAV configuration for the company
                        nav_config = CompanyNAVConfiguration.objects.filter(
                            company_id=company_id,
                            is_active=True,
                            is_default=True
                        ).first()
                        
                        if not nav_config:
                            # If no default, use first active
                            nav_config = CompanyNAVConfiguration.objects.filter(
                                company_id=company_id,
                                is_active=True
                            ).first()
                        
                        if nav_config:
                            nav_service = NAVService(nav_config)
                            nav_response = nav_service.query_taxpayer(tax_number)
                            
                            if nav_response and nav_response.get('success'):
                                # Parse XML response using the same function as lookup_taxpayer view
                                xml_string = nav_response.get('response', '')
                                
                                if xml_string:
                                    try:
                                        # Use the common parsing function
                                        nav_data = parse_nav_taxpayer_response(xml_string)
                                        
                                        if nav_data:
                                            nav_updated = True
                                            nav_found_count += 1
                                            
                                            # Map NAV data to customer fields - same as frontend does
                                            if nav_data.get('taxpayer_name'):
                                                customer_data['name'] = nav_data['taxpayer_name']
                                                logger.info(f"Set customer name from NAV: {nav_data['taxpayer_name']}")
                                            
                                            if nav_data.get('taxpayer_short_name'):
                                                customer_data['short_name'] = nav_data['taxpayer_short_name']
                                            
                                            # Tax number details
                                            tax_detail = nav_data.get('tax_number_detail')
                                            if tax_detail:
                                                if tax_detail.get('vatCode'):
                                                    customer_data['vat_code'] = tax_detail['vatCode']
                                                if tax_detail.get('countyCode'):
                                                    customer_data['county_code'] = tax_detail['countyCode']
                                            
                                            # Address data - use first HQ address (same as frontend)
                                            address_list = nav_data.get('taxpayer_address_list', [])
                                            if address_list:
                                                # Find HQ address or use first one
                                                hq_address = None
                                                for addr in address_list:
                                                    if addr.get('taxpayerAddressType') == 'HQ':
                                                        hq_address = addr
                                                        break
                                                
                                                if not hq_address and address_list:
                                                    hq_address = address_list[0]
                                                
                                                if hq_address:
                                                    if hq_address.get('postalCode'):
                                                        customer_data['postal_code'] = hq_address['postalCode']
                                                    if hq_address.get('city'):
                                                        customer_data['city'] = hq_address['city']
                                                    if hq_address.get('streetName'):
                                                        customer_data['street_name'] = hq_address['streetName']
                                                    if hq_address.get('publicPlaceCategory'):
                                                        customer_data['public_place_category'] = hq_address['publicPlaceCategory']
                                                    if hq_address.get('number'):
                                                        customer_data['street_number'] = hq_address['number']
                                                    if hq_address.get('building'):
                                                        customer_data['building'] = hq_address['building']
                                                    if hq_address.get('staircase'):
                                                        customer_data['staircase'] = hq_address['staircase']
                                                    if hq_address.get('floor'):
                                                        customer_data['floor'] = hq_address['floor']
                                                    if hq_address.get('door'):
                                                        customer_data['door'] = hq_address['door']
                                                    
                                                    # Build full address string (same as frontend)
                                                    address_parts = []
                                                    if hq_address.get('streetName'):
                                                        address_parts.append(hq_address['streetName'])
                                                    if hq_address.get('publicPlaceCategory'):
                                                        address_parts.append(hq_address['publicPlaceCategory'])
                                                    if hq_address.get('number'):
                                                        address_parts.append(hq_address['number'])
                                                    if hq_address.get('building'):
                                                        address_parts.append(hq_address['building'])
                                                    if hq_address.get('staircase'):
                                                        address_parts.append(hq_address['staircase'])
                                                    if hq_address.get('floor'):
                                                        address_parts.append(hq_address['floor'])
                                                    if hq_address.get('door'):
                                                        address_parts.append(hq_address['door'])
                                                    
                                                    if address_parts:
                                                        customer_data['address'] = ' '.join(address_parts)
                                                    
                                                    # Country code mapping
                                                    if hq_address.get('countryCode'):
                                                        country_map = {
                                                            'HU': 'Magyarország',
                                                            'AT': 'Ausztria',
                                                            'DE': 'Németország',
                                                            'SK': 'Szlovákia',
                                                            'RO': 'Románia',
                                                            'HR': 'Horvátország',
                                                            'SI': 'Szlovénia',
                                                            'PL': 'Lengyelország',
                                                            'CZ': 'Csehország'
                                                        }
                                                        customer_data['country'] = country_map.get(
                                                            hq_address['countryCode'], 
                                                            'Egyéb'
                                                        )
                                            
                                            # VAT group membership
                                            vat_group = nav_data.get('vat_group_membership')
                                            if vat_group:
                                                if vat_group.get('vatGroupId'):
                                                    customer_data['vat_group_id'] = vat_group['vatGroupId']
                                                if vat_group.get('vatGroupMemberTaxNumber'):
                                                    customer_data['vat_group_member_tax_number'] = vat_group['vatGroupMemberTaxNumber']
                                            
                                            logger.info(f"NAV validation successful for {tax_number}, data: {customer_data.get('name')}")
                                        else:
                                            # No taxpayer data found in response
                                            if nav_validation:
                                                nav_not_found.append({
                                                    'name': row.get('Név', '').strip(),
                                                    'tax_number': tax_number
                                                })
                                    except Exception as parse_error:
                                        logger.error(f"NAV XML parsing error for {tax_number}: {parse_error}")
                                        if nav_validation:
                                            nav_not_found.append({
                                                'name': row.get('Név', '').strip(),
                                                'tax_number': tax_number
                                            })
                            else:
                                # NAV query failed
                                if nav_validation:
                                    nav_not_found.append({
                                        'name': row.get('Név', '').strip(),
                                        'tax_number': tax_number
                                    })
                    except Exception as nav_error:
                        logger.warning(f"NAV validation failed for {tax_number}: {nav_error}")
                        # Continue with CSV data if NAV fails
                        if nav_validation:
                            nav_not_found.append({
                                'name': row.get('Név', '').strip(),
                                'tax_number': tax_number
                            })
                
                # Add CSV data - use NAV data as priority, CSV as fallback
                # Only use CSV data if NAV didn't provide it
                if 'name' not in customer_data:
                    customer_data['name'] = row.get('Név', '').strip()
                if 'short_name' not in customer_data:
                    customer_data['short_name'] = row.get('Rövid név', '').strip() or None
                if 'street_name' not in customer_data:
                    customer_data['street_name'] = row.get('Utca név', '').strip() or None
                if 'public_place_category' not in customer_data:
                    customer_data['public_place_category'] = row.get('Közterület jellege', '').strip() or None
                if 'street_number' not in customer_data:
                    customer_data['street_number'] = row.get('Házszám', '').strip() or None
                if 'city' not in customer_data:
                    customer_data['city'] = row.get('Város', '').strip() or 'Budapest'
                if 'postal_code' not in customer_data:
                    customer_data['postal_code'] = row.get('Irányítószám', '').strip() or '0000'
                if 'vat_code' not in customer_data:
                    customer_data['vat_code'] = row.get('ÁFA kód', '').strip() or None
                if 'county_code' not in customer_data:
                    customer_data['county_code'] = row.get('Megyekód', '').strip() or None
                
                # These fields: use NAV data if available, otherwise use CSV
                # Address - only use CSV if NAV didn't provide it
                if 'address' not in customer_data:
                    customer_data['address'] = row.get('Cím', '').strip() or None
                    
                # Building details - only use CSV if NAV didn't provide them
                if 'building' not in customer_data:
                    customer_data['building'] = row.get('Épület', '').strip() or None
                if 'staircase' not in customer_data:
                    customer_data['staircase'] = row.get('Lépcsőház', '').strip() or None
                if 'floor' not in customer_data:
                    customer_data['floor'] = row.get('Emelet', '').strip() or None
                if 'door' not in customer_data:
                    customer_data['door'] = row.get('Ajtó', '').strip() or None
                
                # Country - only use CSV if NAV didn't provide it
                if 'country' not in customer_data:
                    customer_data['country'] = row.get('Ország', '').strip() or 'Hungary'
                
                # VAT group - only use CSV if NAV didn't provide it
                if 'vat_group_id' not in customer_data:
                    customer_data['vat_group_id'] = row.get('ÁFA csoport ID', '').strip() or None
                if 'vat_group_member_tax_number' not in customer_data:
                    customer_data['vat_group_member_tax_number'] = row.get('ÁFA csoport tag adószám', '').strip() or None
                
                # These fields always come from CSV (NAV doesn't provide them)
                customer_data['email'] = row.get('E-mail', '').strip() or None
                customer_data['phone'] = row.get('Telefon', '').strip() or None
                customer_data['vat_status'] = row.get('Adóalanyiság (DOMESTIC/PRIVATE_PERSON/OTHER)', '').strip() or 'DOMESTIC'
                customer_data['eu_tax_number'] = row.get('EU adószám', '').strip() or None
                customer_data['payment_due_days'] = int(row.get('Fizetési határidő (nap)', '8') or 8)
                
                # Debug: log what data we're about to save
                logger.info(f"Import row {row_num} ({tax_number}): NAV updated={nav_updated}, name={customer_data.get('name')}, city={customer_data.get('city')}")
                
                if customer:
                    # Update existing customer
                    serializer = CustomerSerializer(customer, data=customer_data, partial=False)
                    if serializer.is_valid():
                        serializer.save()
                        updated_count += 1
                        logger.info(f"Successfully updated customer {tax_number} with data: {customer_data.get('name')}")
                    else:
                        errors.append(f"Sor {row_num} ({tax_number}): {serializer.errors}")
                        error_count += 1
                        logger.error(f"Validation error for {tax_number}: {serializer.errors}")
                else:
                    # Create new customer
                    serializer = CustomerSerializer(data=customer_data)
                    if serializer.is_valid():
                        serializer.save()
                        created_count += 1
                    else:
                        errors.append(f"Sor {row_num} ({tax_number}): {serializer.errors}")
                        error_count += 1
                        
            except Exception as e:
                errors.append(f"Sor {row_num}: {str(e)}")
                error_count += 1
                logger.error(f"Error importing customer row {row_num}: {e}", exc_info=True)
        
        summary_message = f"Import befejezve: {created_count + updated_count} cég importálva"
        if nav_validation:
            summary_message += f", ebből {nav_found_count} cég adatait frissítette a NAV"
        
        response_data = {
            'success': True,
            'message': summary_message,
            'created': created_count,
            'updated': updated_count,
            'total': created_count + updated_count,
            'errors': error_count,
            'duplicates': duplicate_count,
            'error_details': errors[:20],  # Limit to first 20 errors
        }
        
        if nav_validation:
            response_data['nav_found'] = nav_found_count
            response_data['nav_not_found_count'] = len(nav_not_found)
            response_data['nav_not_found'] = nav_not_found  # List of companies not found in NAV
        
        return Response(response_data)
        
    except Exception as e:
        logger.error(f"Error importing customers: {e}", exc_info=True)
        return Response({'error': f'Hiba az importálás során: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def import_contacts(request):
    """
    Import contacts from CSV file
    
    Logic:
    - If tax_number provided: link to customer with that tax number
    - If no tax_number: create as private person (no customer link)
    - If company exists but no tax_number: mark as 'other'
    """
    if 'file' not in request.FILES:
        return Response({'error': 'Nincs fájl feltöltve'}, status=status.HTTP_400_BAD_REQUEST)
    
    csv_file = request.FILES['file']
    
    if not csv_file.name.endswith('.csv'):
        return Response({'error': 'Csak CSV fájl tölthető fel'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Read CSV file
        decoded_file = csv_file.read().decode('utf-8-sig')  # Handle BOM
        csv_reader = csv.DictReader(io.StringIO(decoded_file))
        
        created_count = 0
        updated_count = 0
        duplicate_count = 0
        error_count = 0
        skipped_count = 0
        errors = []
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 (header is 1)
            try:
                tax_number = row.get('Ügyfél adószáma (8 jegyű, opcionális)', '').strip()
                email = row.get('E-mail', '').strip()
                first_name = row.get('Keresztnév', '').strip()
                last_name = row.get('Vezetéknév', '').strip()
                
                if not first_name or not last_name:
                    errors.append(f"Sor {row_num}: Vezetéknév vagy keresztnév hiányzik")
                    error_count += 1
                    continue
                
                customer = None
                if tax_number:
                    # Find customer by tax number
                    customer = Customer.objects.filter(tax_number=tax_number).first()
                    
                    if not customer:
                        errors.append(f"Sor {row_num}: Nem található ügyfél {tax_number} adószámmal")
                        skipped_count += 1
                        continue
                
                # Check if contact exists (by email or name+customer) - automatizálásnál ne hozzunk létre duplikátumot
                duplicate_contact = None
                if email and customer:
                    duplicate_contact = Contact.objects.filter(customer=customer, email=email).first()
                if not duplicate_contact and customer:
                    duplicate_contact = Contact.objects.filter(
                        customer=customer,
                        first_name__iexact=first_name,
                        last_name__iexact=last_name
                    ).first()
                
                contact_data = {
                    'first_name': first_name,
                    'last_name': last_name,
                    'position': row.get('Pozíció', '').strip() or None,
                    'department': row.get('Osztály', '').strip() or None,
                    'contact_type': row.get('Kapcsolattartó típusa (primary/billing/technical/sales/support/other)', 'other').strip() or 'other',
                    'email': email or None,
                    'phone': row.get('Telefon', '').strip() or None,
                    'mobile': row.get('Mobil', '').strip() or None,
                    'fax': row.get('Fax', '').strip() or None,
                    'notes': row.get('Megjegyzések', '').strip() or None,
                    'is_primary': row.get('Elsődleges (igen/nem)', '').strip().lower() in ['igen', 'yes', 'true', '1'],
                    'is_active': row.get('Aktív (igen/nem)', 'igen').strip().lower() in ['igen', 'yes', 'true', '1'],
                }
                
                # Only add customer if found
                if customer:
                    contact_data['customer'] = customer.id
                else:
                    # Private person without customer - skip for now as Contact model requires customer
                    errors.append(f"Sor {row_num}: Magánszemély kapcsolattartók importálása csak ügyfélhez kapcsolva lehetséges")
                    skipped_count += 1
                    continue
                
                if duplicate_contact:
                    duplicate_count += 1
                    errors.append(f"Sor {row_num}: Már van ilyen nevű/emailű kapcsolattartó ennél az ügyfélnél ({duplicate_contact.full_name})")
                    skipped_count += 1
                    continue

                # Create new contact (nincs duplikátum)
                serializer = ContactSerializer(data=contact_data)
                if serializer.is_valid():
                    serializer.save()
                    created_count += 1
                else:
                    errors.append(f"Sor {row_num}: {serializer.errors}")
                    error_count += 1
                        
            except Exception as e:
                errors.append(f"Sor {row_num}: {str(e)}")
                error_count += 1
                logger.error(f"Error importing contact row {row_num}: {e}", exc_info=True)
        
        return Response({
            'success': True,
            'created': created_count,
            'updated': updated_count,
            'skipped': skipped_count,
            'duplicates': duplicate_count,
            'errors': error_count,
            'error_details': errors[:20]  # Limit to first 20 errors
        })
        
    except Exception as e:
        logger.error(f"Error importing contacts: {e}", exc_info=True)
        return Response({'error': f'Hiba az importálás során: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def import_contacts_streaming(request):
    """
    Streaming contact import with SSE for real-time progress
    """
    if 'file' not in request.FILES:
        return StreamingHttpResponse(
            iter([f"data: {json.dumps({'type': 'error', 'message': 'Nincs fájl feltöltve'})}\n\n"]),
            content_type='text/event-stream'
        )
    
    csv_file = request.FILES['file']
    
    if not csv_file.name.endswith('.csv'):
        return StreamingHttpResponse(
            iter([f"data: {json.dumps({'type': 'error', 'message': 'Csak CSV fájl tölthető fel'})}\n\n"]),
            content_type='text/event-stream'
        )
    
    def generate():
        try:
            # Read CSV file
            decoded_file = csv_file.read().decode('utf-8-sig')
            csv_reader = csv.DictReader(io.StringIO(decoded_file))
            rows = list(csv_reader)
            total_count = len(rows)
            
            # Send initial progress
            yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': 0, 'updated': 0, 'created': 0, 'errors': 0})}\n\n"
            
            created_count = 0
            updated_count = 0
            duplicate_count = 0
            error_count = 0
            skipped_count = 0
            errors = []
            missing_customers = []  # Hiányzó ügyfelek listája
            
            for row_num, row in enumerate(rows, start=2):
                try:
                    # Flexible field name mapping with HTML entity decoding
                    full_name = html.unescape((row.get('Kapcsolattartó neve') or row.get('Név') or '').strip())
                    first_name = html.unescape((row.get('Keresztnév') or row.get('first_name') or '').strip())
                    last_name = html.unescape((row.get('Vezetéknév') or row.get('last_name') or '').strip())
                    
                    # If full name provided but not first/last, try to split
                    if full_name and not (first_name and last_name):
                        name_parts = full_name.split(' ', 1)
                        if len(name_parts) == 2:
                            last_name = name_parts[0]
                            first_name = name_parts[1]
                        elif len(name_parts) == 1:
                            last_name = name_parts[0]
                            first_name = ''
                    
                    if not last_name:
                        errors.append(f"Sor {row_num}: Név hiányzik")
                        error_count += 1
                        yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 1, 'updated': updated_count, 'created': created_count, 'errors': error_count})}\n\n"
                        continue
                    
                    tax_number = (row.get('Ügyfél adószáma (8 jegyű, opcionális)') or row.get('Adószám') or row.get('tax_number') or '').strip()
                    email = (row.get('E-mail') or row.get('Email') or row.get('email') or '').strip()
                    company_name = html.unescape((row.get('Cégnév') or row.get('Cég neve') or row.get('company_name') or '').strip())
                    
                    customer = None
                    if tax_number:
                        # Az első 8 számjegyet vegye figyelembe
                        clean_tax = tax_number.replace('-', '').replace(' ', '')[:8]
                        customer = Customer.objects.filter(tax_number=clean_tax).first()
                        
                        if not customer:
                            # Ne hozzon létre automatikusan új ügyfelet, helyette gyűjtse össze
                            missing_customer_entry = {
                                'row': row_num,
                                'tax_number': clean_tax,
                                'company_name': company_name,
                                'contact_name': full_name or f"{last_name} {first_name}".strip(),
                                'email': email
                            }
                            # Ellenőrizze, hogy már van-e ilyen a listában
                            if not any(mc['tax_number'] == clean_tax for mc in missing_customers):
                                missing_customers.append(missing_customer_entry)
                            
                            errors.append(f"Sor {row_num}: Nem található ügyfél {clean_tax} adószámmal")
                            skipped_count += 1
                            yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 1, 'updated': updated_count, 'created': created_count, 'errors': error_count, 'skipped': skipped_count})}\n\n"
                            continue
                    
                    duplicate_contact = None
                    if email and customer:
                        duplicate_contact = Contact.objects.filter(customer=customer, email=email).first()
                    if not duplicate_contact and customer and last_name:
                        duplicate_contact = Contact.objects.filter(
                            customer=customer,
                            first_name__iexact=first_name,
                            last_name__iexact=last_name
                        ).first()
                    
                    # Validálás és tisztítás
                    phone_raw = (row.get('Telefon') or row.get('phone') or '').strip()
                    mobile_raw = (row.get('Mobil') or row.get('mobile') or '').strip()
                    fax_raw = (row.get('Fax') or row.get('fax') or '').strip()
                    
                    # Telefonszámok levágása 20 karakterre
                    phone_clean = phone_raw[:20] if phone_raw else None
                    mobile_clean = mobile_raw[:20] if mobile_raw else None
                    fax_clean = fax_raw[:20] if fax_raw else None
                    
                    # Email validálás
                    email_clean = None
                    if email:
                        # Egyszerű email validálás
                        if '@' in email and '.' in email.split('@')[-1]:
                            email_clean = email
                    
                    contact_data = {
                        'first_name': first_name if first_name else '-',  # Ha nincs keresztnév, kötőjel
                        'last_name': last_name,
                        'position': (row.get('Pozíció') or row.get('position') or '').strip() or None,
                        'department': (row.get('Osztály') or row.get('department') or '').strip() or None,
                        'contact_type': (row.get('Típus') or row.get('contact_type') or 'other').strip() or 'other',
                        'email': email_clean,
                        'phone': phone_clean,
                        'mobile': mobile_clean,
                        'fax': fax_clean,
                        'notes': (row.get('Megjegyzések') or row.get('notes') or '').strip() or None,
                        'is_primary': (row.get('Pénzügyes') or row.get('is_primary') or '').strip() in ['1', 'true', 'True'],
                        'is_active': (row.get('Hírlevél') or row.get('is_active') or '1').strip() in ['1', 'true', 'True'],
                    }
                    
                    if customer:
                        contact_data['customer'] = customer.id
                    else:
                        errors.append(f"Sor {row_num}: Nincs megadva ügyfél adószám")
                        skipped_count += 1
                        yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 1, 'updated': updated_count, 'created': created_count, 'errors': error_count, 'skipped': skipped_count, 'duplicates': duplicate_count})}\n\n"
                        continue

                    if duplicate_contact:
                        duplicate_count += 1
                        errors.append(f"Sor {row_num}: Már van ilyen nevű/emailű kapcsolattartó ennél az ügyfélnél ({duplicate_contact.full_name})")
                        skipped_count += 1
                        yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 1, 'updated': updated_count, 'created': created_count, 'errors': error_count, 'skipped': skipped_count, 'duplicates': duplicate_count})}\n\n"
                        continue

                    serializer = ContactSerializer(data=contact_data)
                    if serializer.is_valid():
                        serializer.save()
                        created_count += 1
                    else:
                        errors.append(f"Sor {row_num}: {serializer.errors}")
                        error_count += 1
                    
                    yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 1, 'updated': updated_count, 'created': created_count, 'errors': error_count, 'skipped': skipped_count, 'duplicates': duplicate_count})}\n\n"
                    
                except Exception as e:
                    errors.append(f"Sor {row_num}: {str(e)}")
                    error_count += 1
                    logger.error(f"Error importing contact row {row_num}: {e}", exc_info=True)
                    yield f"data: {json.dumps({'type': 'progress', 'total': total_count, 'imported': row_num - 1, 'updated': updated_count, 'created': created_count, 'errors': error_count, 'skipped': skipped_count, 'duplicates': duplicate_count})}\n\n"
            
            result_data = {
                'type': 'complete', 
                'success': True, 
                'message': f'Import befejezve: {created_count + updated_count} kapcsolat importálva', 
                'created': created_count, 
                'updated': updated_count, 
                'total': total_count, 
                'errors': error_count,
                'skipped': skipped_count,
                'duplicates': duplicate_count,
                'error_details': errors[:20],
                'missing_customers': missing_customers
            }
            yield f"data: {json.dumps(result_data)}\n\n"
            
        except Exception as e:
            logger.error(f"Error in streaming contact import: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': f'Hiba az importálás során: {str(e)}'})}\n\n"
    
    return StreamingHttpResponse(generate(), content_type='text/event-stream')


@api_view(['POST'])
@permission_classes([AllowAny])
def export_missing_customers_csv(request):
    """
    Hiányzó ügyfelek exportálása CSV fájlba
    A frontend küldi a missing_customers listát a request body-ban
    """
    try:
        missing_customers = request.data.get('missing_customers', [])
        
        if not missing_customers:
            return Response({'error': 'Nincs hiányzó ügyfél adat'}, status=status.HTTP_400_BAD_REQUEST)
        
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="hianyzó_ugyfelek.csv"'
        response.write('\ufeff')  # UTF-8 BOM for Excel
        
        writer = csv.writer(response)
        writer.writerow([
            'Adószám (8 jegyű)', 'Cégnév', 'Kapcsolattartó neve', 'E-mail', 'Megjegyzés'
        ])
        
        for customer in missing_customers:
            writer.writerow([
                customer.get('tax_number', ''),
                customer.get('company_name', ''),
                customer.get('contact_name', ''),
                customer.get('email', ''),
                f"Sor {customer.get('row', '')} - Kapcsolattartó importáláskor nem található"
            ])
        
        return response
        
    except Exception as e:
        logger.error(f"Error exporting missing customers: {e}", exc_info=True)
        return Response({'error': f'Hiba az exportálás során: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def import_suppliers_from_invoices(request):
    """
    Import suppliers from incoming invoices
    - Extracts unique domestic tax numbers from IncomingInvoiceData
    - Queries NAV API for each tax number
    - Creates new Customer with is_supplier=True if not exists
    - Updates existing Customer and sets is_supplier=True if exists
    - Preserves is_customer flag if already set
    - Adds bank account if found in invoice XML
    """
    try:
        company_id = request.data.get('company_id')
        if not company_id:
            return Response({'error': 'Cégazonosító kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        
        from invoices.models import IncomingInvoiceData, CustomerBankAccount
        import re
        from xml.etree import ElementTree as ET
        
        # Get NAV configuration for the company
        try:
            nav_config = CompanyNAVConfiguration.objects.get(company_id=company_id)
        except CompanyNAVConfiguration.DoesNotExist:
            return Response({'error': 'NAV konfiguráció nem található'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Extract unique domestic supplier tax numbers from incoming invoices
        invoices = IncomingInvoiceData.objects.filter(company_id=company_id).exclude(supplier_tax_number__isnull=True)
        
        tax_numbers_with_bank = {}  # {tax_number: [bank_accounts]}
        
        for invoice in invoices:
            tax_num = (invoice.supplier_tax_number or '').strip()
            if not tax_num:
                continue
            
            # Extract first 8 digits for domestic tax numbers
            if tax_num.startswith('HU'):
                tax_num = tax_num[2:]
            tax_num = re.sub(r'[^0-9]', '', tax_num)[:8]
            
            if len(tax_num) != 8:
                continue
            
            # Extract bank accounts from XML
            if invoice.xml_text and tax_num not in tax_numbers_with_bank:
                try:
                    root = ET.fromstring(invoice.xml_text)
                    # Find all bank account numbers
                    bank_accounts = []
                    for elem in root.iter():
                        if 'bankAccountNumber' in elem.tag.lower() or 'supplierbankaccount' in elem.tag.lower():
                            acc = (elem.text or '').strip()
                            if acc and len(acc) > 10:  # Basic validation
                                bank_accounts.append(acc)
                    
                    if bank_accounts:
                        tax_numbers_with_bank[tax_num] = list(set(bank_accounts))
                except Exception as e:
                    logger.warning(f"Failed to parse XML for invoice {invoice.invoice_number}: {e}")
            
            if tax_num not in tax_numbers_with_bank:
                tax_numbers_with_bank[tax_num] = []
        
        unique_tax_numbers = list(tax_numbers_with_bank.keys())
        
        if not unique_tax_numbers:
            return Response({
                'success': True,
                'created': 0,
                'updated': 0,
                'skipped': 0,
                'total': 0,
                'message': 'Nincs feldolgozható belföldi beszállító'
            })
        
        # Initialize NAV service
        nav_service = NAVService(config=nav_config)
        
        created = 0
        updated = 0
        skipped = 0
        error_details = []
        
        for tax_number in unique_tax_numbers:
            try:
                # Query NAV API
                result = nav_service.query_taxpayer(tax_number)
                
                if not result or not result.get('success'):
                    error_details.append(f"{tax_number}: NAV lekérdezési hiba")
                    skipped += 1
                    continue
                
                # Parse XML response
                xml_response = result.get('response')
                if not xml_response:
                    error_details.append(f"{tax_number}: Üres NAV válasz")
                    skipped += 1
                    continue
                
                # Parse NAV response to extract taxpayer data
                parsed = parse_nav_taxpayer_response(xml_response)
                
                if not parsed or not parsed.get('taxpayer_name'):
                    error_details.append(f"{tax_number}: Nincs adózói adat")
                    skipped += 1
                    continue
                
                # Check if customer exists
                existing = Customer.objects.filter(tax_number=tax_number).first()
                
                if existing:
                    # Update existing customer
                    old_is_customer = existing.is_customer
                    
                    # Update fields from NAV data
                    if parsed.get('taxpayer_name'):
                        existing.name = parsed['taxpayer_name']
                    if parsed.get('taxpayer_short_name'):
                        existing.short_name = parsed['taxpayer_short_name']
                    
                    # Address data
                    address_list = parsed.get('taxpayer_address_list', [])
                    if address_list:
                        hq_address = next((addr for addr in address_list if addr.get('taxpayerAddressType') == 'HQ'), address_list[0])
                        if hq_address:
                            existing.street_name = hq_address.get('streetName', existing.street_name)
                            existing.public_place_category = hq_address.get('publicPlaceCategory', existing.public_place_category)
                            existing.street_number = hq_address.get('number', existing.street_number)
                            existing.city = hq_address.get('city', existing.city)
                            existing.postal_code = hq_address.get('postalCode', existing.postal_code)
                    
                    # Tax details
                    tax_detail = parsed.get('tax_number_detail')
                    if tax_detail:
                        if tax_detail.get('vatCode'):
                            existing.vat_code = tax_detail['vatCode']
                        if tax_detail.get('countyCode'):
                            existing.county_code = tax_detail['countyCode']
                        
                        # Build full tax number (e.g., 12345678-2-01)
                        vat_code = tax_detail.get('vatCode', '')
                        county_code = tax_detail.get('countyCode', '')
                        if vat_code and county_code:
                            existing.full_tax_number = f"{tax_number}-{vat_code}-{county_code}"
                    
                    existing.country = 'Magyarország'
                    existing.vat_status = 'DOMESTIC'
                    existing.is_hungarian_taxpayer = True
                    existing.is_supplier = True  # Mark as supplier
                    existing.is_customer = old_is_customer  # Preserve customer flag
                    existing.save()
                    
                    updated += 1
                    
                    # Add bank accounts if found in invoice
                    bank_accounts = tax_numbers_with_bank.get(tax_number, [])
                    for bank_acc in bank_accounts:
                        if not CustomerBankAccount.objects.filter(customer=existing, account_number=bank_acc).exists():
                            CustomerBankAccount.objects.create(
                                customer=existing,
                                account_number=bank_acc,
                                bank_name='',
                                is_primary=CustomerBankAccount.objects.filter(customer=existing).count() == 0
                            )
                    
                else:
                    # Create new customer from NAV data
                    customer_data = {
                        'tax_number': tax_number,
                        'name': parsed.get('taxpayer_name', f'Beszállító {tax_number}'),
                        'short_name': parsed.get('taxpayer_short_name') or parsed.get('taxpayer_name', f'Beszállító {tax_number}')[:50],
                        'country': 'Magyarország',
                        'vat_status': 'DOMESTIC',
                        'is_hungarian_taxpayer': True,
                        'is_supplier': True,
                        'is_customer': False,
                    }
                    
                    # Address data
                    address_list = parsed.get('taxpayer_address_list', [])
                    if address_list:
                        hq_address = next((addr for addr in address_list if addr.get('taxpayerAddressType') == 'HQ'), address_list[0])
                        if hq_address:
                            customer_data['street_name'] = hq_address.get('streetName', '')
                            customer_data['public_place_category'] = hq_address.get('publicPlaceCategory', '')
                            customer_data['street_number'] = hq_address.get('number', '')
                            customer_data['city'] = hq_address.get('city', '')
                            customer_data['postal_code'] = hq_address.get('postalCode', '')
                    
                    # Tax details
                    tax_detail = parsed.get('tax_number_detail')
                    if tax_detail:
                        if tax_detail.get('vatCode'):
                            customer_data['vat_code'] = tax_detail['vatCode']
                        if tax_detail.get('countyCode'):
                            customer_data['county_code'] = tax_detail['countyCode']
                        
                        # Build full tax number (e.g., 12345678-2-01)
                        vat_code = tax_detail.get('vatCode', '')
                        county_code = tax_detail.get('countyCode', '')
                        if vat_code and county_code:
                            customer_data['full_tax_number'] = f"{tax_number}-{vat_code}-{county_code}"
                    
                    new_customer = Customer.objects.create(**customer_data)
                    created += 1
                    
                    # Add bank accounts if found in invoice
                    bank_accounts = tax_numbers_with_bank.get(tax_number, [])
                    for idx, bank_acc in enumerate(bank_accounts):
                        CustomerBankAccount.objects.create(
                            customer=new_customer,
                            account_number=bank_acc,
                            bank_name='',
                            is_primary=(idx == 0)
                        )
                
            except Exception as e:
                logger.error(f"Error processing tax number {tax_number}: {e}", exc_info=True)
                error_details.append(f"{tax_number}: {str(e)}")
                skipped += 1
                continue
        
        return Response({
            'success': True,
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'total': len(unique_tax_numbers),
            'error_details': error_details if error_details else None
        })
        
    except Exception as e:
        logger.error(f"Error importing suppliers from invoices: {e}", exc_info=True)
        return Response({'error': f'Hiba történt: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def import_suppliers_from_invoices_streaming(request):
    """
    Import suppliers from incoming invoices with real-time progress updates (Server-Sent Events)
    """
    try:
        company_id = request.data.get('company_id')
        if not company_id:
            return Response({'error': 'Cégazonosító kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        
        from invoices.models import IncomingInvoiceData, CustomerBankAccount
        import re
        from xml.etree import ElementTree as ET
        
        def generate():
            try:
                # Get NAV configuration
                try:
                    nav_config = CompanyNAVConfiguration.objects.get(company_id=company_id)
                except CompanyNAVConfiguration.DoesNotExist:
                    yield f"data: {json.dumps({'error': 'NAV konfiguráció nem található'})}\n\n"
                    return
                
                # Extract unique domestic supplier tax numbers
                invoices = IncomingInvoiceData.objects.filter(company_id=company_id).exclude(supplier_tax_number__isnull=True)
                
                tax_numbers_with_bank = {}
                
                for invoice in invoices:
                    tax_num = (invoice.supplier_tax_number or '').strip()
                    if not tax_num:
                        continue
                    
                    if tax_num.startswith('HU'):
                        tax_num = tax_num[2:]
                    tax_num = re.sub(r'[^0-9]', '', tax_num)[:8]
                    
                    if len(tax_num) != 8:
                        continue
                    
                    # Extract bank accounts from XML
                    if invoice.xml_text and tax_num not in tax_numbers_with_bank:
                        try:
                            root = ET.fromstring(invoice.xml_text)
                            bank_accounts = []
                            for elem in root.iter():
                                if 'bankAccountNumber' in elem.tag.lower() or 'supplierbankaccount' in elem.tag.lower():
                                    acc = (elem.text or '').strip()
                                    if acc and len(acc) > 10:
                                        bank_accounts.append(acc)
                            
                            if bank_accounts:
                                tax_numbers_with_bank[tax_num] = list(set(bank_accounts))
                        except Exception:
                            pass
                    
                    if tax_num not in tax_numbers_with_bank:
                        tax_numbers_with_bank[tax_num] = []
                
                unique_tax_numbers = list(tax_numbers_with_bank.keys())
                total = len(unique_tax_numbers)
                
                if total == 0:
                    yield f"data: {json.dumps({'success': True, 'created': 0, 'updated': 0, 'skipped': 0, 'total': 0})}\n\n"
                    return
                
                # Initialize NAV service
                nav_service = NAVService(config=nav_config)
                
                created = 0
                updated = 0
                skipped = 0
                processed = 0
                
                # Send initial progress
                yield f"data: {json.dumps({'type': 'progress', 'total': total, 'processed': 0, 'created': 0, 'updated': 0, 'skipped': 0})}\n\n"
                
                for tax_number in unique_tax_numbers:
                    try:
                        # Send current tax number
                        yield f"data: {json.dumps({'type': 'current', 'tax_number': tax_number})}\n\n"
                        
                        # Query NAV API
                        result = nav_service.query_taxpayer(tax_number)
                        
                        if not result or not result.get('success'):
                            skipped += 1
                            processed += 1
                            yield f"data: {json.dumps({'type': 'progress', 'total': total, 'processed': processed, 'created': created, 'updated': updated, 'skipped': skipped})}\n\n"
                            continue
                        
                        xml_response = result.get('response')
                        if not xml_response:
                            skipped += 1
                            processed += 1
                            yield f"data: {json.dumps({'type': 'progress', 'total': total, 'processed': processed, 'created': created, 'updated': updated, 'skipped': skipped})}\n\n"
                            continue
                        
                        parsed = parse_nav_taxpayer_response(xml_response)
                        
                        if not parsed or not parsed.get('taxpayer_name'):
                            skipped += 1
                            processed += 1
                            yield f"data: {json.dumps({'type': 'progress', 'total': total, 'processed': processed, 'created': created, 'updated': updated, 'skipped': skipped})}\n\n"
                            continue
                        
                        existing = Customer.objects.filter(tax_number=tax_number).first()
                        
                        if existing:
                            old_is_customer = existing.is_customer
                            
                            if parsed.get('taxpayer_name'):
                                existing.name = parsed['taxpayer_name']
                            if parsed.get('taxpayer_short_name'):
                                existing.short_name = parsed['taxpayer_short_name']
                            
                            address_list = parsed.get('taxpayer_address_list', [])
                            if address_list:
                                hq_address = next((addr for addr in address_list if addr.get('taxpayerAddressType') == 'HQ'), address_list[0])
                                if hq_address:
                                    existing.street_name = hq_address.get('streetName', existing.street_name)
                                    existing.public_place_category = hq_address.get('publicPlaceCategory', existing.public_place_category)
                                    existing.street_number = hq_address.get('number', existing.street_number)
                                    existing.city = hq_address.get('city', existing.city)
                                    existing.postal_code = hq_address.get('postalCode', existing.postal_code)
                            
                            tax_detail = parsed.get('tax_number_detail')
                            if tax_detail:
                                if tax_detail.get('vatCode'):
                                    existing.vat_code = tax_detail['vatCode']
                                if tax_detail.get('countyCode'):
                                    existing.county_code = tax_detail['countyCode']
                                
                                # Build full tax number
                                vat_code = tax_detail.get('vatCode', '')
                                county_code = tax_detail.get('countyCode', '')
                                if vat_code and county_code:
                                    existing.full_tax_number = f"{tax_number}-{vat_code}-{county_code}"
                            
                            existing.country = 'Magyarország'
                            existing.vat_status = 'DOMESTIC'
                            existing.is_hungarian_taxpayer = True
                            existing.is_supplier = True
                            existing.is_customer = old_is_customer
                            existing.save()
                            
                            updated += 1
                            
                            bank_accounts = tax_numbers_with_bank.get(tax_number, [])
                            for bank_acc in bank_accounts:
                                if not CustomerBankAccount.objects.filter(customer=existing, account_number=bank_acc).exists():
                                    CustomerBankAccount.objects.create(
                                        customer=existing,
                                        account_number=bank_acc,
                                        bank_name='',
                                        is_primary=CustomerBankAccount.objects.filter(customer=existing).count() == 0
                                    )
                        else:
                            customer_data = {
                                'tax_number': tax_number,
                                'name': parsed.get('taxpayer_name', f'Beszállító {tax_number}'),
                                'short_name': parsed.get('taxpayer_short_name') or parsed.get('taxpayer_name', f'Beszállító {tax_number}')[:50],
                                'country': 'Magyarország',
                                'vat_status': 'DOMESTIC',
                                'is_hungarian_taxpayer': True,
                                'is_supplier': True,
                                'is_customer': False,
                            }
                            
                            address_list = parsed.get('taxpayer_address_list', [])
                            if address_list:
                                hq_address = next((addr for addr in address_list if addr.get('taxpayerAddressType') == 'HQ'), address_list[0])
                                if hq_address:
                                    customer_data['street_name'] = hq_address.get('streetName', '')
                                    customer_data['public_place_category'] = hq_address.get('publicPlaceCategory', '')
                                    customer_data['street_number'] = hq_address.get('number', '')
                                    customer_data['city'] = hq_address.get('city', '')
                                    customer_data['postal_code'] = hq_address.get('postalCode', '')
                            
                            tax_detail = parsed.get('tax_number_detail')
                            if tax_detail:
                                if tax_detail.get('vatCode'):
                                    customer_data['vat_code'] = tax_detail['vatCode']
                                if tax_detail.get('countyCode'):
                                    customer_data['county_code'] = tax_detail['countyCode']
                                
                                # Build full tax number
                                vat_code = tax_detail.get('vatCode', '')
                                county_code = tax_detail.get('countyCode', '')
                                if vat_code and county_code:
                                    customer_data['full_tax_number'] = f"{tax_number}-{vat_code}-{county_code}"
                            
                            new_customer = Customer.objects.create(**customer_data)
                            created += 1
                            
                            bank_accounts = tax_numbers_with_bank.get(tax_number, [])
                            for idx, bank_acc in enumerate(bank_accounts):
                                CustomerBankAccount.objects.create(
                                    customer=new_customer,
                                    account_number=bank_acc,
                                    bank_name='',
                                    is_primary=(idx == 0)
                                )
                        
                        processed += 1
                        yield f"data: {json.dumps({'type': 'progress', 'total': total, 'processed': processed, 'created': created, 'updated': updated, 'skipped': skipped})}\n\n"
                        
                    except Exception as e:
                        logger.error(f"Error processing {tax_number}: {e}", exc_info=True)
                        skipped += 1
                        processed += 1
                        yield f"data: {json.dumps({'type': 'progress', 'total': total, 'processed': processed, 'created': created, 'updated': updated, 'skipped': skipped})}\n\n"
                
                # Final result
                yield f"data: {json.dumps({'type': 'complete', 'success': True, 'created': created, 'updated': updated, 'skipped': skipped, 'total': total})}\n\n"
                
            except Exception as e:
                logger.error(f"Streaming error: {e}", exc_info=True)
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        response = StreamingHttpResponse(generate(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response
        
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
