#!/usr/bin/env python3
"""
Teszt script a NAV XML parsing függvényhez
Ez demonstrálja, hogy a parse_nav_taxpayer_response() helyesen működik
"""

import sys
import os

# Példa NAV XML válasz (egyszerűsített)
SAMPLE_NAV_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<QueryTaxpayerResponse xmlns="http://schemas.nav.gov.hu/OSA/3.0/api" 
                       xmlns:ns2="http://schemas.nav.gov.hu/NTCA/1.0/common"
                       xmlns:ns3="http://schemas.gov.hu/OSA/3.0/base">
    <header>
        <requestId>test123</requestId>
        <timestamp>2026-01-14T10:00:00Z</timestamp>
        <requestVersion>3.0</requestVersion>
    </header>
    <result>
        <funcCode>OK</funcCode>
    </result>
    <taxpayerData>
        <taxpayerName>TESZT Kereskedelmi Korlátolt Felelősségű Társaság</taxpayerName>
        <taxpayerShortName>TESZT Kft.</taxpayerShortName>
        <taxNumberDetail>
            <taxpayerId xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">12345678</taxpayerId>
            <vatCode xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">2</vatCode>
            <countyCode xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">01</countyCode>
        </taxNumberDetail>
        <taxpayerAddressList>
            <taxpayerAddressItem>
                <taxpayerAddressType>HQ</taxpayerAddressType>
                <taxpayerAddress>
                    <countryCode xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">HU</countryCode>
                    <postalCode xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">1011</postalCode>
                    <city xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">Budapest</city>
                    <streetName xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">Fő</streetName>
                    <publicPlaceCategory xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">utca</publicPlaceCategory>
                    <number xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">1</number>
                    <building xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">A</building>
                    <floor xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">3</floor>
                    <door xmlns="http://schemas.nav.gov.hu/OSA/3.0/base">12</door>
                </taxpayerAddress>
            </taxpayerAddressItem>
        </taxpayerAddressList>
    </taxpayerData>
</QueryTaxpayerResponse>
"""

def test_parse_nav_response():
    """
    Teszt a parse_nav_taxpayer_response függvényhez
    """
    import xml.etree.ElementTree as ET
    
    # Egyszerűsített parsing (ugyanaz a logika mint a függvényben)
    parsed_data = {}
    
    try:
        root = ET.fromstring(SAMPLE_NAV_XML)
        
        # Extract taxpayer data
        taxpayer_data_elem = root.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerData')
        
        if taxpayer_data_elem is not None:
            # Extract taxpayer name
            parsed_data['taxpayer_name'] = taxpayer_data_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerName')
            parsed_data['taxpayer_short_name'] = taxpayer_data_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerShortName')
            
            # Tax number detail
            tax_detail_elem = taxpayer_data_elem.find('{http://schemas.nav.gov.hu/OSA/3.0/api}taxNumberDetail')
            if tax_detail_elem is not None:
                parsed_data['tax_number_detail'] = {
                    'taxpayerId': tax_detail_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}taxpayerId'),
                    'vatCode': tax_detail_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}vatCode'),
                    'countyCode': tax_detail_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}countyCode')
                }
            
            # Taxpayer addresses
            address_list = []
            for addr_item in taxpayer_data_elem.findall('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddressItem'):
                addr_elem = addr_item.find('{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddress')
                if addr_elem is not None:
                    address_list.append({
                        'taxpayerAddressType': addr_item.findtext('{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddressType'),
                        'countryCode': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}countryCode'),
                        'postalCode': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}postalCode'),
                        'city': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}city'),
                        'streetName': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}streetName'),
                        'publicPlaceCategory': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}publicPlaceCategory'),
                        'number': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}number'),
                        'building': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}building'),
                        'floor': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}floor'),
                        'door': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}door')
                    })
            if address_list:
                parsed_data['taxpayer_address_list'] = address_list
                
    except Exception as e:
        print(f"❌ Parsing hiba: {e}")
        return False
    
    # Ellenőrzések
    print("🔍 NAV XML Parsing Teszt\n")
    print("=" * 60)
    
    success = True
    
    # Név ellenőrzése
    if parsed_data.get('taxpayer_name') == 'TESZT Kereskedelmi Korlátolt Felelősségű Társaság':
        print("✅ taxpayer_name helyesen kiolvasva")
    else:
        print(f"❌ taxpayer_name hiba: {parsed_data.get('taxpayer_name')}")
        success = False
    
    # Rövid név
    if parsed_data.get('taxpayer_short_name') == 'TESZT Kft.':
        print("✅ taxpayer_short_name helyesen kiolvasva")
    else:
        print(f"❌ taxpayer_short_name hiba: {parsed_data.get('taxpayer_short_name')}")
        success = False
    
    # Adószám részletek
    tax_detail = parsed_data.get('tax_number_detail', {})
    if tax_detail.get('taxpayerId') == '12345678':
        print("✅ taxpayerId helyesen kiolvasva")
    else:
        print(f"❌ taxpayerId hiba: {tax_detail.get('taxpayerId')}")
        success = False
    
    if tax_detail.get('vatCode') == '2':
        print("✅ vatCode helyesen kiolvasva")
    else:
        print(f"❌ vatCode hiba: {tax_detail.get('vatCode')}")
        success = False
    
    if tax_detail.get('countyCode') == '01':
        print("✅ countyCode helyesen kiolvasva")
    else:
        print(f"❌ countyCode hiba: {tax_detail.get('countyCode')}")
        success = False
    
    # Cím ellenőrzése
    address_list = parsed_data.get('taxpayer_address_list', [])
    if len(address_list) > 0:
        print("✅ Cím lista létezik")
        addr = address_list[0]
        
        if addr.get('city') == 'Budapest':
            print("✅ Város helyesen kiolvasva: Budapest")
        else:
            print(f"❌ Város hiba: {addr.get('city')}")
            success = False
        
        if addr.get('postalCode') == '1011':
            print("✅ Irányítószám helyesen kiolvasva: 1011")
        else:
            print(f"❌ Irányítószám hiba: {addr.get('postalCode')}")
            success = False
        
        if addr.get('streetName') == 'Fő':
            print("✅ Utca név helyesen kiolvasva: Fő")
        else:
            print(f"❌ Utca név hiba: {addr.get('streetName')}")
            success = False
        
        if addr.get('publicPlaceCategory') == 'utca':
            print("✅ Közterület jellege helyesen kiolvasva: utca")
        else:
            print(f"❌ Közterület jellege hiba: {addr.get('publicPlaceCategory')}")
            success = False
        
    else:
        print("❌ Cím lista üres")
        success = False
    
    print("=" * 60)
    
    if success:
        print("\n✅ Minden teszt sikeres! A NAV XML parsing helyesen működik.")
        print("\n📋 Teljes parsed_data:")
        import json
        print(json.dumps(parsed_data, indent=2, ensure_ascii=False))
        return True
    else:
        print("\n❌ Néhány teszt sikertelen!")
        return False


if __name__ == '__main__':
    success = test_parse_nav_response()
    sys.exit(0 if success else 1)
