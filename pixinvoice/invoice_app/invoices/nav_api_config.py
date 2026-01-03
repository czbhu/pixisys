"""
NAV Online Invoice API konfiguráció
A PHP sample kód alapján implementálva
"""

import hashlib
import hmac
import time
from datetime import datetime
from typing import Dict, Any

class NavApiConfig:
    """NAV API konfigurációs osztály"""
    
    # API URL-ek
    TEST_URL = 'https://api-test.onlineszamla.nav.gov.hu/invoiceService/v3'
    PROD_URL = 'https://api.onlineszamla.nav.gov.hu/invoiceService/v3'
    
    def __init__(self, base_url: str, user_data: Dict[str, str], software_data: Dict[str, str]):
        """
        NAV API konfiguráció inicializálása
        
        Args:
            base_url: API URL (TEST_URL vagy PROD_URL)
            user_data: Felhasználói adatok
            software_data: Szoftver adatok
        """
        self.base_url = base_url
        self.user = user_data
        self.software = software_data
        self.verify_ssl = True
        self.validate_api_schema = True
        self.curl_timeout = 30
        
    @classmethod
    def create_test_config(cls):
        """Teszt környezet konfiguráció létrehozása a PHP config.php alapján"""
        user_data = {
            "login": "ogim6013j4gtmnj",
            "password": "PontosP_2025",
            "taxNumber": "25048740",
            "signKey": "76-b3f7-ac222770f4aa53VYYNQVLPIN",
            "exchangeKey": "54ef53VYYNQVKHDH",
        }
        
        software_data = {
            "softwareId": "123456789123456789",
            "softwareName": "PixInvoice",
            "softwareOperation": "ONLINE_SERVICE",
            "softwareMainVersion": "1.0",
            "softwareDevName": "PixInvoice Development",
            "softwareDevContact": "dev@pixinvoice.com",
            "softwareDevCountryCode": "HU",
            "softwareDevTaxNumber": "12345678",
        }
        
        return cls(cls.TEST_URL, user_data, software_data)
    
    def get_password_hash(self) -> str:
        """Jelszó SHA-512 hash készítése"""
        return hashlib.sha512(self.user["password"].encode('utf-8')).hexdigest().upper()
    
    def get_request_signature_string(self, request_id: str, timestamp: str) -> str:
        """
        Request signature string összeállítása
        
        Args:
            request_id: Kérés azonosító
            timestamp: Időbélyeg (yyyyMMddHHmmss formátumban)
            
        Returns:
            Aláíráshoz használt string
        """
        # requestId értéke
        signature_string = request_id
        
        # timestamp tag értéke yyyyMMddHHmmss maszkkal, UTC időben (ezredmásodperc nélkül)
        # A PHP kódban: preg_replace("/\.\d{3}|\D+/", "", $this->timestamp)
        import re
        clean_timestamp = re.sub(r'\.\d{3}|\D+', '', timestamp)
        signature_string += clean_timestamp
        
        # technikai felhasználó aláíró kulcsának literál értéke
        signature_string += self.user["signKey"]
        
        return signature_string
    
    def get_request_signature_hash(self, request_id: str, timestamp: str) -> str:
        """
        Request signature SHA3-512 hash készítése
        
        Args:
            request_id: Kérés azonosító
            timestamp: Időbélyeg
            
        Returns:
            SHA3-512 hash
        """
        signature_string = self.get_request_signature_string(request_id, timestamp)
        # SHA3-512 hash készítése
        hash_obj = hashlib.sha3_512()
        hash_obj.update(signature_string.encode('utf-8'))
        return hash_obj.hexdigest().upper()
    
    def get_timestamp(self) -> str:
        """
        A kérés kliens oldali időpontja UTC-ben, ezredmásodperccel
        
        Returns:
            Időbélyeg YYYY-MM-DDTHH:mm:ss.sssZ formátumban
        """
        now = time.time()
        milliseconds = int((now - int(now)) * 1000)
        milliseconds = min(milliseconds, 999)
        
        dt = datetime.utcfromtimestamp(int(now))
        return dt.strftime("%Y-%m-%dT%H:%M:%S") + f".{milliseconds:03d}Z"
