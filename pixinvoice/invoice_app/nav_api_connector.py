"""
NAV Online Invoice API Connector
A PHP sample kód alapján implementálva
"""

import requests
import xml.etree.ElementTree as ET
from typing import Dict, Any, Optional
from invoices.nav_api_config import NavApiConfig
from invoices.nav_api_requests import BaseRequestXml

class NavApiConnector:
    """NAV API kapcsolódó osztály"""
    
    def __init__(self, config: NavApiConfig):
        """
        Connector inicializálása
        
        Args:
            config: NAV API konfiguráció
        """
        self.config = config
        self.last_request_url = None
        self.last_request_header = None
        self.last_request_body = None
        self.last_response_header = None
        self.last_response_body = None
        self.last_request_id = None
        self.last_response_xml = None
    
    def _reset_debug_info(self):
        """Debug információk törlése"""
        self.last_request_url = None
        self.last_request_header = None
        self.last_request_body = None
        self.last_response_header = None
        self.last_response_body = None
        self.last_request_id = None
        self.last_response_xml = None
    
    def get_last_request_data(self) -> Dict[str, Any]:
        """Utolsó kérés adatainak lekérdezése"""
        return {
            'requestUrl': self.last_request_url,
            'requestHeader': self.last_request_header,
            'requestBody': self.last_request_body,
            'responseHeader': self.last_response_header,
            'responseBody': self.last_response_body,
            'requestId': self.last_request_id,
            'responseXml': self.last_response_xml,
        }
    
    def get_last_response_xml(self) -> Optional[ET.Element]:
        """Utolsó válasz XML lekérdezése"""
        return self.last_response_xml
    
    def post(self, url: str, request_xml: BaseRequestXml) -> ET.Element:
        """
        POST kérés küldése a NAV API-nak
        
        Args:
            url: API végpont URL
            request_xml: Kérés XML objektum
            
        Returns:
            Válasz XML elem
            
        Raises:
            Exception: Ha hiba történt a kérés során
        """
        self._reset_debug_info()
        
        full_url = self.config.base_url + url
        self.last_request_url = full_url
        
        xml_string = request_xml.as_xml_string()
        self.last_request_body = xml_string
        self.last_request_id = request_xml.get_request_id()
        
        # HTTP kérés küldése
        headers = {
            "Content-Type": "application/xml;charset=UTF-8",
            "Accept": "application/xml",
        }
        
        try:
            response = requests.get(
                full_url,
                data=xml_string,
                headers=headers,
                timeout=self.config.curl_timeout,
                verify=self.config.verify_ssl
            )
            
            self.last_response_header = dict(response.headers)
            self.last_response_body = response.text
            
            # Válasz feldolgozása
            if response.status_code != 200:
                raise Exception(f"HTTP hiba: {response.status_code} - {response.text}")
            
            # XML válasz feldolgozása
            response_xml = self._parse_response(response.text)
            self.last_response_xml = response_xml
            
            if response_xml is None:
                raise Exception(f"Érvénytelen XML válasz: {response.text}")
            
            # Hibaellenőrzés
            self._check_response_errors(response_xml)
            
            return response_xml
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Kérés hiba: {str(e)}")
    
    def _parse_response(self, xml_string: str) -> Optional[ET.Element]:
        """XML válasz feldolgozása"""
        if not xml_string.strip().startswith("<?xml"):
            return None
        
        try:
            # Namespace-ek eltávolítása a könnyebb feldolgozás érdekében
            xml_string = self._remove_namespaces(xml_string)
            return ET.fromstring(xml_string)
        except ET.ParseError as e:
            raise Exception(f"XML feldolgozási hiba: {str(e)}")
    
    def _remove_namespaces(self, xml_string: str) -> str:
        """Namespace-ek eltávolítása az XML-ből"""
        # Egyszerű namespace eltávolítás
        xml_string = xml_string.replace('xmlns="http://schemas.nav.gov.hu/OSA/3.0/api"', '')
        xml_string = xml_string.replace('xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common"', '')
        xml_string = xml_string.replace('xmlns="http://schemas.nav.gov.hu/NTCA/1.0/common"', '')
        return xml_string
    
    def _check_response_errors(self, response_xml: ET.Element):
        """Válasz hibáinak ellenőrzése"""
        # GeneralExceptionResponse ellenőrzése
        if response_xml.tag == "GeneralExceptionResponse":
            error_msg = self._get_error_message(response_xml)
            raise Exception(f"NAV API Exception: {error_msg}")
        
        # GeneralErrorResponse ellenőrzése
        if response_xml.tag == "GeneralErrorResponse":
            error_msg = self._get_error_message(response_xml)
            raise Exception(f"NAV API Error: {error_msg}")
        
        # funcCode ellenőrzése
        result = response_xml.find("result")
        if result is not None:
            func_code = result.find("funcCode")
            if func_code is not None and func_code.text != "OK":
                error_msg = self._get_error_message(response_xml)
                raise Exception(f"NAV API funcCode hiba: {error_msg}")
            
            # Service down ellenőrzése
            message = result.find("message")
            if message is not None and "endpoint is currently down" in message.text:
                raise Exception("NAV API szolgáltatás jelenleg nem elérhető")
    
    def _get_error_message(self, response_xml: ET.Element) -> str:
        """Hibaüzenet kinyerése a válaszból"""
        result = response_xml.find("result")
        if result is not None:
            message = result.find("message")
            if message is not None:
                return message.text
        return "Ismeretlen hiba"
