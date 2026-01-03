"""
NAV Online Invoice API Reporter
A PHP sample kód alapján implementálva
"""

import base64
from Crypto.Cipher import AES
from invoices.nav_api_config import NavApiConfig
from invoices.nav_api_connector import NavApiConnector
from invoices.nav_api_requests import TokenExchangeRequestXml

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
            
            # Encoded token kinyerése
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
            
            # AES-128-ECB dekódolás
            cipher = AES.new(
                self.config.user["exchangeKey"].encode('utf-8'),
                AES.MODE_ECB
            )
            
            decrypted_data = cipher.decrypt(encrypted_data)
            
            # Padding eltávolítása
            token = decrypted_data.rstrip(b'\x00').decode('utf-8')
            
            return token
            
        except Exception as e:
            raise Exception(f"Token dekódolási hiba: {str(e)}")
    
    def get_last_request_data(self) -> dict:
        """Utolsó kérés adatainak lekérdezése"""
        return self.connector.get_last_request_data()
    
    def get_last_response_xml(self):
        """Utolsó válasz XML lekérdezése"""
        return self.connector.get_last_response_xml()
