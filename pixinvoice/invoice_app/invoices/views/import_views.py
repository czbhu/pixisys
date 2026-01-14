"""
CSV Import views for customers and contacts
"""
import csv
import io
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
            error_count = 0
            errors = []
            nav_found_count = 0
            nav_not_found = []
            
            for row_num, row in enumerate(rows, start=2):
                try:
                    # Flexible field name mapping
                    tax_number = (row.get('Adószám (8 jegyű)') or row.get('tax_number') or '').strip()
                    
                    if not tax_number:
                        errors.append(f"Sor {row_num}: Adószám hiányzik")
                        error_count += 1
                        continue
                    
                    # Check if customer exists
                    customer = Customer.objects.filter(tax_number=tax_number).first()
                    
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
                'nav_not_found': nav_not_found
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
        error_count = 0
        errors = []
        nav_found_count = 0
        nav_not_found = []  # List of companies not found in NAV
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 (header is 1)
            try:
                tax_number = row.get('Adószám (8 jegyű)', '').strip()
                
                if not tax_number:
                    errors.append(f"Sor {row_num}: Adószám hiányzik")
                    error_count += 1
                    continue
                
                # Check if customer exists
                customer = Customer.objects.filter(tax_number=tax_number).first()
                
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
                
                # Check if contact exists (by email or name+customer)
                existing_contact = None
                if email:
                    existing_contact = Contact.objects.filter(email=email).first()
                elif customer:
                    existing_contact = Contact.objects.filter(
                        customer=customer,
                        first_name=first_name,
                        last_name=last_name
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
                
                if existing_contact:
                    # Update existing contact
                    serializer = ContactSerializer(existing_contact, data=contact_data, partial=False)
                    if serializer.is_valid():
                        serializer.save()
                        updated_count += 1
                    else:
                        errors.append(f"Sor {row_num}: {serializer.errors}")
                        error_count += 1
                else:
                    # Create new contact
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
            'errors': error_count,
            'error_details': errors[:20]  # Limit to first 20 errors
        })
        
    except Exception as e:
        logger.error(f"Error importing contacts: {e}", exc_info=True)
        return Response({'error': f'Hiba az importálás során: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
