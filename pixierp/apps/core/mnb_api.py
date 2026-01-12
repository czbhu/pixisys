"""
Magyar Nemzeti Bank (MNB) árfolyam API integráció
API dokumentáció: https://www.mnb.hu/arfolyam-lekerdezes
"""
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional


class MNBApiClient:
    """MNB SOAP API kliens árfolyamok lekérdezéséhez"""
    
    SOAP_URL = "http://www.mnb.hu/arfolyamok.asmx"
    
    def get_current_exchange_rates(self) -> Dict[str, Dict[str, any]]:
        """
        Aktuális napi árfolyamok lekérése.
        
        Returns:
            Dict: {currency_code: {'rate': Decimal, 'unit': int, 'name': str}}
        """
        soap_request = """<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetCurrentExchangeRates xmlns="http://www.mnb.hu/webservices/" />
  </soap:Body>
</soap:Envelope>"""
        
        headers = {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'http://www.mnb.hu/webservices/GetCurrentExchangeRates'
        }
        
        try:
            response = requests.post(self.SOAP_URL, data=soap_request, headers=headers, timeout=10)
            response.raise_for_status()
            
            return self._parse_exchange_rates(response.text)
        except Exception as e:
            print(f"MNB API error: {e}")
            return {}
    
    def get_currencies(self) -> List[Dict[str, str]]:
        """
        Elérhető devizák listája.
        
        Returns:
            List: [{'code': 'EUR', 'name': 'Euró'}, ...]
        """
        soap_request = """<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetCurrencies xmlns="http://www.mnb.hu/webservices/" />
  </soap:Body>
</soap:Envelope>"""
        
        headers = {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'http://www.mnb.hu/webservices/GetCurrencies'
        }
        
        try:
            response = requests.post(self.SOAP_URL, data=soap_request, headers=headers, timeout=10)
            response.raise_for_status()
            
            return self._parse_currencies(response.text)
        except Exception as e:
            print(f"MNB API error: {e}")
            return []
    
    def _parse_exchange_rates(self, xml_response: str) -> Dict[str, Dict[str, any]]:
        """Parse XML response with exchange rates"""
        try:
            # Parse SOAP response
            root = ET.fromstring(xml_response)
            
            # Find the GetCurrentExchangeRatesResult element
            namespaces = {
                's': 'http://schemas.xmlsoap.org/soap/envelope/',
                'mnb': 'http://www.mnb.hu/webservices/'
            }
            
            result = root.find('.//mnb:GetCurrentExchangeRatesResult', namespaces)
            if result is None or result.text is None:
                # Try without namespace
                result = root.find('.//{http://www.mnb.hu/webservices/}GetCurrentExchangeRatesResult')
                if result is None or result.text is None:
                    print("Could not find GetCurrentExchangeRatesResult")
                    return {}
            
            # The result text is HTML-encoded XML, decode it
            import html
            inner_xml = html.unescape(result.text)
            
            # Parse the inner XML
            rates_xml = ET.fromstring(inner_xml)
            
            rates = {}
            for day in rates_xml.findall('Day'):
                for rate in day.findall('Rate'):
                    curr = rate.get('curr')
                    unit = int(rate.get('unit', 1))
                    value = rate.text.replace(',', '.')
                    
                    # MNB API: 1 currency unit = X HUF
                    # Tároljuk úgy, hogy 1 currency = X HUF
                    rate_value = Decimal(value)
                    exchange_rate = rate_value / unit  # 1 currency unit = X HUF
                    
                    # Get currency name
                    curr_name = self._get_currency_name(curr)
                    
                    rates[curr] = {
                        'rate': exchange_rate,  # 1 currency = X HUF
                        'unit': unit,
                        'name': curr_name,
                        'rate_huf': rate_value / unit  # How many HUF is 1 currency unit (same as rate)
                    }
            
            return rates
        except Exception as e:
            print(f"Error parsing exchange rates: {e}")
            import traceback
            traceback.print_exc()
            return {}
    
    def _parse_currencies(self, xml_response: str) -> List[Dict[str, str]]:
        """Parse XML response with available currencies"""
        try:
            # Parse SOAP response
            root = ET.fromstring(xml_response)
            
            # Find the GetCurrenciesResult element
            result = root.find('.//{http://www.mnb.hu/webservices/}GetCurrenciesResult')
            if result is None or result.text is None:
                return []
            
            # Parse the inner XML
            curr_xml = ET.fromstring(result.text)
            
            currencies = []
            for curr in curr_xml.findall('Curr'):
                code = curr.text
                # MNB doesn't provide names in this endpoint, using code as name
                # We'll need to maintain a mapping or get it from another source
                name = self._get_currency_name(code)
                currencies.append({
                    'code': code,
                    'name': name
                })
            
            return currencies
        except Exception as e:
            print(f"Error parsing currencies: {e}")
            return []
    
    def _get_currency_name(self, code: str) -> str:
        """Get full currency name from code"""
        # Common currency names
        names = {
            'EUR': 'Euró',
            'USD': 'Amerikai dollár',
            'GBP': 'Font sterling',
            'CHF': 'Svájci frank',
            'JPY': 'Jen',
            'AUD': 'Ausztrál dollár',
            'CAD': 'Kanadai dollár',
            'DKK': 'Dán korona',
            'NOK': 'Norvég korona',
            'SEK': 'Svéd korona',
            'CZK': 'Cseh korona',
            'PLN': 'Lengyel zloty',
            'RON': 'Román lej',
            'HRK': 'Horvát kuna',
            'RSD': 'Szerb dinár',
            'RUB': 'Rubel',
            'TRY': 'Török líra',
            'CNY': 'Jüan',
            'HKD': 'Hongkongi dollár',
            'INR': 'Rúpia',
            'KRW': 'Dél-koreai won',
            'MXN': 'Mexikói peso',
            'ZAR': 'Dél-afrikai rand',
            'SGD': 'Szingapúri dollár',
            'NZD': 'Új-zélandi dollár',
            'BRL': 'Brazil real',
            'BGN': 'Bolgár leva',
            'UAH': 'Ukrán hrivnya',
            'ISK': 'Izlandi korona',
        }
        return names.get(code, code)
    
    def get_currency_symbol(self, code: str) -> str:
        """Get currency symbol from code"""
        symbols = {
            'EUR': '€',
            'USD': '$',
            'GBP': '£',
            'CHF': 'Fr',
            'JPY': '¥',
            'AUD': 'A$',
            'CAD': 'C$',
            'DKK': 'kr',
            'NOK': 'kr',
            'SEK': 'kr',
            'CZK': 'Kč',
            'PLN': 'zł',
            'RON': 'lei',
            'HRK': 'kn',
            'RSD': 'din',
            'RUB': '₽',
            'TRY': '₺',
            'CNY': '¥',
            'HKD': 'HK$',
            'INR': '₹',
            'KRW': '₩',
            'MXN': 'Mex$',
            'ZAR': 'R',
            'SGD': 'S$',
            'NZD': 'NZ$',
            'BRL': 'R$',
            'BGN': 'лв',
            'UAH': '₴',
            'ISK': 'kr',
        }
        return symbols.get(code, code)


# Global instance
mnb_api = MNBApiClient()
