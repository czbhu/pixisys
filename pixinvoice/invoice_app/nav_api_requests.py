"""
NAV Online Invoice API kérés XML-ek
A PHP sample kód alapján implementálva
"""

import uuid
import xml.etree.ElementTree as ET
from typing import Dict, Any
from invoices.nav_api_config import NavApiConfig

class BaseRequestXml:
    """Alaposztály NAV API kérésekhez"""
    
    API_NS = "http://schemas.nav.gov.hu/OSA/3.0/api"
    COMMON_NS = "http://schemas.nav.gov.hu/NTCA/1.0/common"
    
    def __init__(self, config: NavApiConfig):
        """
        Request XML inicializálása
        
        Args:
            config: NAV API konfiguráció
        """
        self.config = config
        self.request_id = str(uuid.uuid4())
        self.timestamp = config.get_timestamp()
        self.xml = self._create_xml()
    
    def _create_xml(self) -> ET.Element:
        """XML objektum létrehozása"""
        root = ET.Element(self.root_name)
        root.set("xmlns", self.API_NS)
        root.set("xmlns:common", self.COMMON_NS)
        
        self._add_header(root)
        self._add_user(root)
        self._add_software(root)
        
        return root
    
    def _add_header(self, root: ET.Element):
        """Header elem hozzáadása"""
        header = ET.SubElement(root, "header")
        header.set("xmlns", self.COMMON_NS)
        
        request_id = ET.SubElement(header, "requestId")
        request_id.text = self.request_id
        
        timestamp = ET.SubElement(header, "timestamp")
        timestamp.text = self.timestamp
        
        request_version = ET.SubElement(header, "requestVersion")
        request_version.text = "3.0"
        
        header_version = ET.SubElement(header, "headerVersion")
        header_version.text = "1.0"
    
    def _add_user(self, root: ET.Element):
        """User elem hozzáadása"""
        user = ET.SubElement(root, "user")
        user.set("xmlns", self.COMMON_NS)
        
        login = ET.SubElement(user, "login")
        login.text = self.config.user["login"]
        
        password_hash = ET.SubElement(user, "passwordHash")
        password_hash.text = self.config.get_password_hash()
        password_hash.set("cryptoType", "SHA-512")
        
        tax_number = ET.SubElement(user, "taxNumber")
        tax_number.text = self.config.user["taxNumber"]
        
        request_signature = ET.SubElement(user, "requestSignature")
        request_signature.text = self.config.get_request_signature_hash(self.request_id, self.timestamp)
        request_signature.set("cryptoType", "SHA3-512")
    
    def _add_software(self, root: ET.Element):
        """Software elem hozzáadása"""
        if not self.config.software:
            return
            
        software = ET.SubElement(root, "software")
        
        for key, value in self.config.software.items():
            elem = ET.SubElement(software, key)
            elem.text = str(value)
    
    def as_xml_string(self) -> str:
        """XML string formátumban visszaadása"""
        return ET.tostring(self.xml, encoding='unicode', method='xml')
    
    def get_request_id(self) -> str:
        """Request ID lekérése"""
        return self.request_id


class TokenExchangeRequestXml(BaseRequestXml):
    """TokenExchange kérés XML"""
    
    root_name = "TokenExchangeRequest"
    
    def __init__(self, config: NavApiConfig):
        """
        TokenExchange kérés inicializálása
        
        Args:
            config: NAV API konfiguráció
        """
        super().__init__(config)
