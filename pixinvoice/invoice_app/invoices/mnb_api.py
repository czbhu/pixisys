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

    def get_exchange_rate_for_date(self, currency: str, date_str: str) -> Optional[float]:
        """
        Adott deviza árfolyamának lekérése egy konkrét dátumra (vagy az azt megelőző utolsó közzétett árfolyam).
        MNB API GetExchangeRates műveletet használ, 10 napos visszatekintéssel.
        """
        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d')
            start_date = (target_date - timedelta(days=15)).strftime('%Y-%m-%d')
            end_date = target_date.strftime('%Y-%m-%d')
            
            soap_request = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetExchangeRates xmlns="http://www.mnb.hu/webservices/">
      <startDate>{start_date}</startDate>
      <endDate>{end_date}</endDate>
      <currencyNames>{currency}</currencyNames>
    </GetExchangeRates>
  </soap:Body>
</soap:Envelope>"""

            headers = {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://www.mnb.hu/webservices/GetExchangeRates'
            }

            response = requests.post(self.SOAP_URL, data=soap_request, headers=headers, timeout=10)
            response.raise_for_status()
            
            # Find the result string inside SOAP response
            root = ET.fromstring(response.text)
            res_str = None
            for elem in root.iter():
                if 'GetExchangeRatesResult' in elem.tag:
                    res_str = elem.text
                    break
            
            if not res_str:
                return None
                
            inner_root = ET.fromstring(res_str)
            
            latest_date = None
            latest_rate = None
            
            days = inner_root.findall('Day')
            for day in days:
                d_str = day.get('date')
                try:
                    d_obj = datetime.strptime(d_str, '%Y-%m-%d')
                except:
                    continue
                    
                if d_obj <= target_date:
                    if latest_date is None or d_obj > latest_date:
                        # Keresés attribútum szerint (ElementTree-ben: Rate[@curr='EUR'])
                        # De vigyázzunk az @ syntaxra findall-ban
                        for rate_el in day.findall('Rate'):
                            if rate_el.get('curr') == currency:
                                if rate_el.text:
                                    try:
                                        val_str = rate_el.text.replace(',', '.')
                                        val = float(val_str)
                                        unit = float(rate_el.get('unit', '1'))
                                        latest_date = d_obj
                                        latest_rate = val / unit
                                    except:
                                        pass
                                break
                                
            return latest_rate

        except Exception as e:
            print(f"MNB GetExchangeRates error: {e}")
            return None
    
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

    def update_exchange_rates(self) -> int:
        """
        Fetch current rates and update local Currency models.
        Returns the number of updated currencies.
        """
        from invoices.models import Currency
        
        rates = self.get_current_exchange_rates()
        count = 0
        now = datetime.now()
        
        for code, data in rates.items():
            # MNB returns 1 unit = X HUF or 100 unit = Y HUF
            # We want to store exchange rate for 1 unit.
            # data['rate'] is already 1 unit = X HUF (calculated in parser)
            
            try:
                currency, created = Currency.objects.update_or_create(
                    code=code,
                    defaults={
                        'name': data['name'],
                        'current_rate': data['rate'],
                        'rate_valid_date': now.date(),
                        'last_synced_at': now
                    }
                )
                count += 1
            except Exception as e:
                print(f"Error updating currency {code}: {e}")
                
        return count


# Global instance
mnb_api = MNBApiClient()
