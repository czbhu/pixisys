"""
NAV Online Invoice API szolgáltatás
A PHP sample kód alapján átemelve Django-ba
"""

import hashlib
import hmac
import json
import logging
import requests
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from xml.etree import ElementTree as ET
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64

# from .nav_api_config import NAV_USER_DATA, NAV_SOFTWARE_DATA, NAV_API_SETTINGS

logger = logging.getLogger(__name__)


class NavApiService:
    """NAV Online Invoice API szolgáltatás"""
    
    def __init__(self):
        self.base_url = NAV_API_SETTINGS['base_url']
        self.user_data = NAV_USER_DATA
        self.software_data = NAV_SOFTWARE_DATA
        self.verify_ssl = NAV_API_SETTINGS['verify_ssl']
        self.timeout = NAV_API_SETTINGS['curl_timeout']
    
    def _generate_request_id(self) -> str:
        """Request ID generálása"""
        return str(uuid.uuid4())
    
    def _get_timestamp(self) -> str:
        """Timestamp generálása UTC-ben, ezredmásodperccel"""
        now = datetime.utcnow()
        milliseconds = now.microsecond // 1000
        return now.strftime("%Y-%m-%dT%H:%M:%S") + f".{milliseconds:03d}Z"
    
    def _sha512_hash(self, text: str) -> str:
        """SHA-512 hash generálása"""
        return hashlib.sha512(text.encode('utf-8')).hexdigest().upper()
    
    def _sha3_512_hash(self, text: str) -> str:
        """SHA3-512 hash generálása"""
        # Python 3.6+ támogatja a SHA3-512-et
        return hashlib.sha3_512(text.encode('utf-8')).hexdigest().upper()
    
    def _get_request_signature_string(self, request_id: str, timestamp: str) -> str:
        """Request signature string összeállítása"""
        # requestId + timestamp (ezredmásodperc nélkül) + signKey
        timestamp_without_ms = timestamp.replace('.', '').replace('Z', '')
        return f"{request_id}{timestamp_without_ms}{self.user_data['signKey']}"
    
    def _get_request_signature_hash(self, request_id: str, timestamp: str) -> str:
        """Request signature hash generálása"""
        signature_string = self._get_request_signature_string(request_id, timestamp)
        return self._sha3_512_hash(signature_string)
    
    def _aes128_decrypt(self, encrypted_data: str, key: str) -> str:
        """AES-128-ECB dekódolás"""
        try:
            # Base64 dekódolás
            encrypted_bytes = base64.b64decode(encrypted_data)
            
            # AES-128-ECB dekódolás
            cipher = Cipher(
                algorithms.AES(key.encode('utf-8')[:16]),  # 16 byte kulcs
                modes.ECB(),
                backend=default_backend()
            )
            decryptor = cipher.decryptor()
            decrypted_bytes = decryptor.update(encrypted_bytes) + decryptor.finalize()
            
            return decrypted_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"AES dekódolási hiba: {e}")
            raise
    
    def _create_token_exchange_xml(self, request_id: str, timestamp: str) -> str:
        """TokenExchange XML kérés létrehozása"""
        # XML namespace-ek
        api_ns = "http://schemas.nav.gov.hu/OSA/3.0/api"
        common_ns = "http://schemas.nav.gov.hu/NTCA/1.0/common"
        
        # Root element
        root = ET.Element("TokenExchangeRequest")
        root.set("xmlns", api_ns)
        root.set("xmlns:common", common_ns)
        
        # Header
        header = ET.SubElement(root, "header")
        header.set("xmlns", common_ns)
        
        ET.SubElement(header, "requestId").text = request_id
        ET.SubElement(header, "timestamp").text = timestamp
        ET.SubElement(header, "requestVersion").text = "3.0"
        ET.SubElement(header, "headerVersion").text = "1.0"
        
        # User
        user = ET.SubElement(root, "user")
        user.set("xmlns", common_ns)
        
        password_hash = self._sha512_hash(self.user_data['password'])
        request_signature = self._get_request_signature_hash(request_id, timestamp)
        
        ET.SubElement(user, "login").text = self.user_data['login']
        password_hash_elem = ET.SubElement(user, "passwordHash")
        password_hash_elem.text = password_hash
        password_hash_elem.set("cryptoType", "SHA-512")
        
        ET.SubElement(user, "taxNumber").text = self.user_data['taxNumber']
        
        request_signature_elem = ET.SubElement(user, "requestSignature")
        request_signature_elem.text = request_signature
        request_signature_elem.set("cryptoType", "SHA3-512")
        
        # Software
        software = ET.SubElement(root, "software")
        for key, value in self.software_data.items():
            ET.SubElement(software, key).text = str(value)
        
        return ET.tostring(root, encoding='unicode', xml_declaration=True)
    
    def _make_request(self, endpoint: str, xml_data: str) -> ET.Element:
        """HTTP kérés küldése a NAV API-nak"""
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Content-Type": "application/xml;charset=UTF-8",
            "Accept": "application/xml",
        }
        
        try:
            response = requests.post(
                url,
                data=xml_data,
                headers=headers,
                verify=self.verify_ssl,
                timeout=self.timeout
            )
            
            logger.info(f"NAV API kérés: {url}")
            logger.debug(f"Kérés XML: {xml_data}")
            logger.debug(f"Válasz kód: {response.status_code}")
            logger.debug(f"Válasz tartalom: {response.text}")
            
            if response.status_code != 200:
                raise Exception(f"HTTP hiba: {response.status_code} - {response.text}")
            
            # XML válasz feldolgozása
            response_xml = ET.fromstring(response.text)
            
            # Hibaellenőrzés
            if response_xml.tag == "GeneralExceptionResponse":
                error_msg = response_xml.find(".//message")
                if error_msg is not None:
                    raise Exception(f"NAV API hiba: {error_msg.text}")
                else:
                    raise Exception("NAV API általános hiba")
            
            if response_xml.tag == "GeneralErrorResponse":
                error_msg = response_xml.find(".//message")
                if error_msg is not None:
                    raise Exception(f"NAV API hiba: {error_msg.text}")
                else:
                    raise Exception("NAV API általános hiba")
            
            # funcCode ellenőrzés
            func_code = response_xml.find(".//funcCode")
            if func_code is not None and func_code.text != "OK":
                message = response_xml.find(".//message")
                error_msg = message.text if message is not None else "Ismeretlen hiba"
                raise Exception(f"NAV API funcCode hiba: {error_msg}")
            
            return response_xml
            
        except requests.exceptions.RequestException as e:
            logger.error(f"NAV API kérési hiba: {e}")
            raise Exception(f"NAV API kapcsolati hiba: {e}")
        except ET.ParseError as e:
            logger.error(f"XML feldolgozási hiba: {e}")
            raise Exception(f"NAV API válasz feldolgozási hiba: {e}")
    
    def token_exchange(self) -> str:
        """
        Token kérése a NAV API-tól
        A PHP tokenExchange.php alapján átemelve
        """
        try:
            request_id = self._generate_request_id()
            timestamp = self._get_timestamp()
            
            # XML kérés létrehozása
            xml_data = self._create_token_exchange_xml(request_id, timestamp)
            
            # Kérés küldése
            response_xml = self._make_request("/tokenExchange", xml_data)
            
            # Token kinyerése és dekódolása
            encoded_token_elem = response_xml.find(".//encodedExchangeToken")
            if encoded_token_elem is None:
                raise Exception("Token nem található a válaszban")
            
            encoded_token = encoded_token_elem.text
            token = self._aes128_decrypt(encoded_token, self.user_data['exchangeKey'])
            
            logger.info("Token sikeresen lekérve")
            return token
            
        except Exception as e:
            logger.error(f"Token lekérési hiba: {e}")
            raise
