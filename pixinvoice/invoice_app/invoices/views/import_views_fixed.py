"""
CSV Import views for customers and contacts
"""
import csv
import io
# Read CSV file - handle multiline fields by replacing newlines in quoted fields
        csv_file.seek(0)
        raw_data = csv_file.read()
        
        # Try UTF-8 with BOM
        try:
            decoded_file = raw_data.decode('utf-8-sig')
        except UnicodeDecodeError:
            try:
                decoded_file = raw_data.decode('iso-8859-2')
            except UnicodeDecodeError:
                decoded_file = raw_data.decode('latin-1')
        
        # Clean CSV: replace newlines within quoted fields with spaces
        import re
        # This regex finds quoted fields and removes newlines from them
        def clean_quotes(match):
            return match.group(0).replace('
', ' ')
        
        cleaned = re.sub(r'"[^"]*"', clean_quotes, decoded_file, flags=re.DOTALL)
        
        csv_reader = csv.DictReader(io.StringIO(cleaned))
                
                created_count = 0
                updated_count = 0
                error_count = 0
                errors = []
                nav_found_count = 0
                nav_not_found = []  # List of companies not found in NAV
                
                for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 (header is 1)
                    try:
                        # DEBUG: Log first row to see CSV structure
                        if row_num == 2:
                            logger.info(f"DEBUG First CSV row keys: {list(row.keys())}")
                            logger.info(f"DEBUG First CSV row values: {row}")
                        
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
                                # Parse XML response similar to lookup_taxpayer view
                                import xml.etree.ElementTree as ET
                                xml_string = nav_response.get('response', '')
                                
                                if xml_string:
                                    root = ET.fromstring(xml_string)
                                    
                                    # Find taxpayer data
                                    taxpayer_data = root.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerData')
                                    if not taxpayer_data:
                                        taxpayer_data = root.find('.//taxpayerData')
                                    
                                    if taxpayer_data:
                                        # DEBUG: Log the taxpayer_data XML to see its structure
                                        import xml.etree.ElementTree as ET_debug
                                        taxpayer_xml_str = ET_debug.tostring(taxpayer_data, encoding='unicode')
                                        logger.info(f"DEBUG taxpayer_data XML: {taxpayer_xml_str[:500]}")
                                        
                                        nav_updated = True
                                        nav_found_count += 1
                                        
                                        # Extract taxpayer data using findtext() with full namespace URI (same as lookup_taxpayer view)
                                        taxpayer_name = taxpayer_data.findtext('{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerName')
                                        if taxpayer_name:
                                            customer_data['name'] = taxpayer_name
                                            logger.info(f"Set customer name from NAV: {taxpayer_name}")
                                        
                                        # Extract short name
                                        short_name = taxpayer_data.findtext('{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerShortName')
                                        if short_name:
                                            customer_data['short_name'] = short_name
                                        
                                        # Extract tax number details
                                        tax_detail = taxpayer_data.find('{http://schemas.nav.gov.hu/OSA/3.0/api}taxNumberDetail')
                                        if tax_detail is not None:
                                            vat_code = tax_detail.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}vatCode')
                                            if vat_code:
                                                customer_data['vat_code'] = vat_code
                                            
                                            county_code = tax_detail.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}countyCode')
                                            if county_code:
                                                customer_data['county_code'] = county_code
                                        
                                        # Extract addresses (HQ type)
                                        for addr_item in taxpayer_data.findall('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddressItem'):
                                            addr_type = addr_item.findtext('{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddressType')
                                            
                                            if addr_type == 'HQ':
                                                addr = addr_item.find('{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddress')
                                                if addr is not None:
                                                    postal_code = addr.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}postalCode')
                                                    if postal_code:
                                                        customer_data['postal_code'] = postal_code
                                                    
                                                    city = addr.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}city')
                                                    if city:
                                                        customer_data['city'] = city
                                                    
                                                    street_name = addr.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}streetName')
                                                    if street_name:
                                                        customer_data['street_name'] = street_name
                                                    
                                                    public_place = addr.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}publicPlaceCategory')
                                                    if public_place:
                                                        customer_data['public_place_category'] = public_place
                                                    
                                                    number = addr.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}number')
                                                    if number:
                                                        customer_data['street_number'] = number
                                                    
                                                    break
                                        
                                        logger.info(f"NAV validation successful for {tax_number}")
                                    else:
                                        # taxpayer_data not found in response
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
                
                # These fields always come from CSV (NAV doesn't provide them)
                customer_data['address'] = row.get('Cím', '').strip() or None
                customer_data['building'] = row.get('Épület', '').strip() or None
                customer_data['staircase'] = row.get('Lépcsőház', '').strip() or None
                customer_data['floor'] = row.get('Emelet', '').strip() or None
                customer_data['door'] = row.get('Ajtó', '').strip() or None
                customer_data['country'] = row.get('Ország', '').strip() or 'Hungary'
                customer_data['email'] = row.get('E-mail', '').strip() or None
                customer_data['phone'] = row.get('Telefon', '').strip() or None
                customer_data['vat_group_id'] = row.get('ÁFA csoport ID', '').strip() or None
                customer_data['vat_group_member_tax_number'] = row.get('ÁFA csoport tag adószám', '').strip() or None
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
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
        
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
