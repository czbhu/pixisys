"""
NAV Online Invoice API Reporter
A PHP sample kód alapján implementálva
"""

import base64
from invoices.nav_api_config import NavApiConfig
from invoices.nav_api_connector import NavApiConnector
from invoices.nav_api_requests import TokenExchangeRequestXml, QueryTaxpayerRequestXml

class NavApiReporter:
    """NAV API Reporter osztály - fő API interfész"""
    
    def __init__(self, config: NavApiConfig):
        """
        Reporter inicializálása
        
        Args:
            config: NAV API konfiguráció
        """
        self.config = config
        self.connector = NavApiConnector(config)
    
    def token_exchange(self) -> str:
        """
        Token kérése a NAV API-tól
        
        Returns:
            Dekódolt token
            
        Raises:
            Exception: Ha hiba történt a token kérés során
        """
        try:
            # TokenExchange kérés létrehozása
            request_xml = TokenExchangeRequestXml(self.config)
            
            # Kérés küldése
            response_xml = self.connector.post("/tokenExchange", request_xml)
            
            # Encoded token kinyerése (namespace-szel együtt)
            encoded_token_elem = response_xml.find(".//{http://schemas.nav.gov.hu/OSA/3.0/api}encodedExchangeToken")
            if encoded_token_elem is None:
                # Próbáljuk meg namespace nélkül is
                encoded_token_elem = response_xml.find("encodedExchangeToken")
                if encoded_token_elem is None:
                    raise Exception("Nincs encodedExchangeToken a válaszban")
            
            encoded_token = encoded_token_elem.text
            if not encoded_token:
                raise Exception("Üres encodedExchangeToken")
            
            # Token dekódolása
            token = self._decode_token(encoded_token)
            
            return token
            
        except Exception as e:
            raise Exception(f"TokenExchange hiba: {str(e)}")
    
    def _decode_token(self, encoded_token: str) -> str:
        """
        Token dekódolása AES-128-ECB algoritmussal
        
        Args:
            encoded_token: Kódolt token
            
        Returns:
            Dekódolt token
        """
        try:
            # Base64 dekódolás
            encrypted_data = base64.b64decode(encoded_token)

            key_bytes = self.config.user["exchangeKey"].encode('utf-8')

            # Próbáljuk pycryptodome-t, ha nincs, használjuk a cryptography-t
            try:
                from Crypto.Cipher import AES as PYCRYPTO_AES
                cipher = PYCRYPTO_AES.new(key_bytes, PYCRYPTO_AES.MODE_ECB)
                decrypted_data = cipher.decrypt(encrypted_data)
            except Exception:
                # Fallback a cryptography csomagra
                from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
                from cryptography.hazmat.backends import default_backend
                cipher = Cipher(algorithms.AES(key_bytes[:16]), modes.ECB(), backend=default_backend())
                decryptor = cipher.decryptor()
                decrypted_data = decryptor.update(encrypted_data) + decryptor.finalize()

            # PKCS7/zero padding eltávolítása (NAV token 0x00 padding szokott lenni)
            token = decrypted_data.rstrip(b'\x00').decode('utf-8')
            return token

        except Exception as e:
            raise Exception(f"Token dekódolási hiba: {str(e)}")
    
    def query_taxpayer(self, taxpayer_tax_number: str) -> dict:
        """
        Adószám lekérdezése a NAV API-tól
        
        Args:
            taxpayer_tax_number: Keresett adószám
            
        Returns:
            Adószám adatai dictionary formátumban
        """
        try:
            # QueryTaxpayer kérés XML létrehozása
            request_xml = QueryTaxpayerRequestXml(self.config, taxpayer_tax_number)
            
            # Kérés küldése
            response_xml = self.connector.post("/queryTaxpayer", request_xml)
            
            # Válasz feldolgozása
            result = self._parse_taxpayer_response(response_xml)
            
            return result
            
        except Exception as e:
            raise Exception(f"QueryTaxpayer hiba: {str(e)}")
    
    def _parse_taxpayer_response(self, response_xml) -> dict:
        """QueryTaxpayer válasz feldolgozása"""
        try:
            result = {
                'success': False,
                'taxpayer_name': None,
                'taxpayer_short_name': None,
                'tax_number_detail': None,
                'vat_group_membership': None,
                'taxpayer_address_list': None,
                'info_date': None
            }
            
            # funcCode ellenőrzése
            func_code_elem = response_xml.find(".//funcCode")
            if func_code_elem is not None and func_code_elem.text == "OK":
                result['success'] = True
                
                # Taxpayer név (namespace-szel)
                taxpayer_name_elem = response_xml.find(".//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerName")
                if taxpayer_name_elem is None:
                    taxpayer_name_elem = response_xml.find(".//taxpayerName")
                if taxpayer_name_elem is not None:
                    result['taxpayer_name'] = taxpayer_name_elem.text
                
                # Taxpayer rövid név (namespace-szel)
                taxpayer_short_name_elem = response_xml.find(".//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerShortName")
                if taxpayer_short_name_elem is None:
                    taxpayer_short_name_elem = response_xml.find(".//taxpayerShortName")
                if taxpayer_short_name_elem is not None:
                    result['taxpayer_short_name'] = taxpayer_short_name_elem.text
                
                # Tax number detail (namespace-szel)
                tax_number_detail_elem = response_xml.find(".//{http://schemas.nav.gov.hu/OSA/3.0/api}taxNumberDetail")
                if tax_number_detail_elem is None:
                    tax_number_detail_elem = response_xml.find(".//taxNumberDetail")
                if tax_number_detail_elem is not None:
                    taxpayer_id_elem = tax_number_detail_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}taxpayerId')
                    if taxpayer_id_elem is None:
                        taxpayer_id_elem = tax_number_detail_elem.find('.//taxpayerId')
                    
                    vat_code_elem = tax_number_detail_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}vatCode')
                    if vat_code_elem is None:
                        vat_code_elem = tax_number_detail_elem.find('.//vatCode')
                    
                    county_code_elem = tax_number_detail_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}countyCode')
                    if county_code_elem is None:
                        county_code_elem = tax_number_detail_elem.find('.//countyCode')
                    
                    result['tax_number_detail'] = {
                        'taxpayerId': taxpayer_id_elem.text if taxpayer_id_elem is not None else None,
                        'vatCode': vat_code_elem.text if vat_code_elem is not None else None,
                        'countyCode': county_code_elem.text if county_code_elem is not None else None,
                    }
                
                # VAT group membership (namespace-szel)
                vat_group_elem = response_xml.find(".//{http://schemas.nav.gov.hu/OSA/3.0/api}vatGroupMembership")
                if vat_group_elem is None:
                    vat_group_elem = response_xml.find(".//vatGroupMembership")
                if vat_group_elem is not None:
                    vat_group_id_elem = vat_group_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}vatGroupId')
                    if vat_group_id_elem is None:
                        vat_group_id_elem = vat_group_elem.find('.//vatGroupId')
                    
                    vat_group_member_elem = vat_group_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}vatGroupMemberTaxNumber')
                    if vat_group_member_elem is None:
                        vat_group_member_elem = vat_group_elem.find('.//vatGroupMemberTaxNumber')
                    
                    result['vat_group_membership'] = {
                        'vatGroupId': vat_group_id_elem.text if vat_group_id_elem is not None else None,
                        'vatGroupMemberTaxNumber': vat_group_member_elem.text if vat_group_member_elem is not None else None,
                    }
                
                # Taxpayer address list (namespace-szel)
                address_list_elem = response_xml.find(".//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddressList")
                if address_list_elem is None:
                    address_list_elem = response_xml.find(".//taxpayerAddressList")
                if address_list_elem is not None:
                    addresses = []
                    for address_elem in address_list_elem.findall('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddressItem'):
                        if address_elem is None:
                            address_elem = address_list_elem.findall('.//taxpayerAddressItem')
                        
                        address_type_elem = address_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddressType')
                        if address_type_elem is None:
                            address_type_elem = address_elem.find('.//taxpayerAddressType')
                        
                        address_data_elem = address_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerAddress')
                        if address_data_elem is None:
                            address_data_elem = address_elem.find('.//taxpayerAddress')
                        
                        if address_data_elem is not None:
                            country_code_elem = address_data_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}countryCode')
                            if country_code_elem is None:
                                country_code_elem = address_data_elem.find('.//countryCode')
                            
                            postal_code_elem = address_data_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}postalCode')
                            if postal_code_elem is None:
                                postal_code_elem = address_data_elem.find('.//postalCode')
                            
                            city_elem = address_data_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}city')
                            if city_elem is None:
                                city_elem = address_data_elem.find('.//city')
                            
                            street_name_elem = address_data_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}streetName')
                            if street_name_elem is None:
                                street_name_elem = address_data_elem.find('.//streetName')
                            
                            public_place_elem = address_data_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}publicPlaceCategory')
                            if public_place_elem is None:
                                public_place_elem = address_data_elem.find('.//publicPlaceCategory')
                            
                            number_elem = address_data_elem.find('.//{http://schemas.nav.gov.hu/OSA/3.0/base}number')
                            if number_elem is None:
                                number_elem = address_data_elem.find('.//number')
                            
                            address = {
                                'taxpayerAddressType': address_type_elem.text if address_type_elem is not None else None,
                                'countryCode': country_code_elem.text if country_code_elem is not None else None,
                                'postalCode': postal_code_elem.text if postal_code_elem is not None else None,
                                'city': city_elem.text if city_elem is not None else None,
                                'streetName': street_name_elem.text if street_name_elem is not None else None,
                                'publicPlaceCategory': public_place_elem.text if public_place_elem is not None else None,
                                'number': number_elem.text if number_elem is not None else None,
                            }
                            addresses.append(address)
                    result['taxpayer_address_list'] = addresses
                
                # Info date (namespace-szel)
                info_date_elem = response_xml.find(".//{http://schemas.nav.gov.hu/OSA/3.0/api}infoDate")
                if info_date_elem is None:
                    info_date_elem = response_xml.find(".//infoDate")
                if info_date_elem is not None:
                    result['info_date'] = info_date_elem.text
            
            return result
            
        except Exception as e:
            raise Exception(f"Taxpayer válasz feldolgozási hiba: {str(e)}")
    
    def get_last_request_data(self) -> dict:
        """Utolsó kérés adatainak lekérdezése"""
        return self.connector.get_last_request_data()
    
    def get_last_response_xml(self):
        """Utolsó válasz XML lekérdezése"""
        return self.connector.get_last_response_xml()
