"""
NAV API Views
Django view-k a NAV Online Invoice API műveletekhez
"""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from invoices.views.views import require_api_key
from django.views.decorators.http import require_http_methods
import json
import logging
import requests

from invoices.nav_api_config import NavApiConfig
from invoices.nav_api_reporter import NavApiReporter

logger = logging.getLogger(__name__)

@csrf_exempt
@require_api_key
@require_http_methods(["GET", "POST"])
def token_exchange(request):
    """
    TokenExchange művelet
    Token kérése a NAV API-tól
    """
    try:
        # Konfiguráció létrehozása
        config = NavApiConfig.create_test_config()
        
        # Reporter inicializálása
        reporter = NavApiReporter(config)
        
        # Token kérése
        token = reporter.token_exchange()
        
        # Sikeres válasz
        return JsonResponse({
            'success': True,
            'token': token,
            'message': 'Token sikeresen lekérve'
        })
        
    except Exception as e:
        logger.error(f"TokenExchange hiba: {str(e)}")
        
        # Hiba válasz
        return JsonResponse({
            'success': False,
            'error': str(e),
            'message': 'Token lekérés sikertelen'
        }, status=500)

@csrf_exempt
@require_api_key
@require_http_methods(["GET"])
def test_nav_connection(request):
    """
    NAV kapcsolat tesztelése
    Egyszerű kapcsolat teszt a NAV API-val
    """
    try:
        # Konfiguráció létrehozása
        config = NavApiConfig.create_test_config()
        
        # Reporter inicializálása
        reporter = NavApiReporter(config)
        
        # Token kérés (kapcsolat teszt)
        token = reporter.token_exchange()
        
        # Utolsó kérés adatainak lekérdezése
        last_request = reporter.get_last_request_data()
        
        # Sikeres válasz
        return JsonResponse({
            'success': True,
            'message': 'NAV API kapcsolat sikeres',
            'token_length': len(token),
            'request_url': last_request.get('requestUrl'),
            'response_status': 'OK'
        })
        
    except Exception as e:
        logger.error(f"NAV kapcsolat teszt hiba: {str(e)}")
        
        # Hiba válasz
        return JsonResponse({
            'success': False,
            'error': str(e),
            'message': 'NAV API kapcsolat sikertelen'
        }, status=500)

@csrf_exempt
@require_http_methods(["GET", "POST"])
def lookup_taxpayer(request):
    """
    Adószám lekérdezése a NAV API-tól a beállított CompanyNAVConfiguration alapján
    GET vagy POST paraméter: tax_number, company_id (opcionális)
    """
    try:
        from invoices.models import CompanyNAVConfiguration, Company
        from invoices.nav_service import NAVService
        
        # Adószám és company_id lekérdezése a paraméterekből
        if request.method == 'GET':
            tax_number = request.GET.get('tax_number')
            company_id = request.GET.get('company_id')
        else:  # POST
            import json
            import logging
            logger = logging.getLogger(__name__)
            
            try:
                # Log the raw request body for debugging
                logger.info(f"POST lookup_taxpayer - Content-Type: {request.content_type}")
                logger.info(f"POST lookup_taxpayer - Body: {request.body}")
                
                data = json.loads(request.body)
                tax_number = data.get('tax_number')
                company_id = data.get('company_id')
                
                logger.info(f"Parsed tax_number: {tax_number}, company_id: {company_id}")
            except (json.JSONDecodeError, AttributeError) as e:
                logger.error(f"JSON parsing error: {e}")
                tax_number = None
                company_id = None
        
        if not tax_number:
            return JsonResponse({
                'success': False,
                'error': 'tax_number paraméter hiányzik',
                'message': 'Adószám megadása kötelező'
            }, status=400)
        
        # NAV konfiguráció keresése
        nav_config = None
        if company_id:
            # Ha company_id meg van adva, keressük annak az aktív, default NAV konfigurációját
            nav_config = CompanyNAVConfiguration.objects.filter(
                company_id=company_id,
                is_active=True,
                is_default=True
            ).first()
            
            if not nav_config:
                # Ha nincs default, használjuk az első aktívat
                nav_config = CompanyNAVConfiguration.objects.filter(
                    company_id=company_id,
                    is_active=True
                ).first()
        else:
            # Ha nincs company_id, használjuk az első elérhető aktív, default konfigurációt
            nav_config = CompanyNAVConfiguration.objects.filter(
                is_active=True,
                is_default=True
            ).first()
        
        if not nav_config:
            return JsonResponse({
                'success': False,
                'error': 'Nincs aktív NAV konfiguráció',
                'message': 'Kérlek állíts be egy aktív NAV konfigurációt a Beállítások menüben'
            }, status=400)
        
        # NAV service létrehozása a konfigurációval
        nav_service = NAVService(nav_config)
        
        # Adószám lekérdezése
        result = nav_service.query_taxpayer(tax_number)
        
        # Debug logolás
        logger.info(f"NAV API válasz ({nav_config.name}): {result}")
        
        # Parse XML response to extract taxpayer data
        parsed_data = {}
        if result.get('success') and result.get('response'):
            try:
                import xml.etree.ElementTree as ET
                xml_string = result['response']
                root = ET.fromstring(xml_string)
                
                # Define namespaces
                ns = {
                    '': 'http://schemas.nav.gov.hu/OSA/3.0/api',
                    'ns2': 'http://schemas.nav.gov.hu/NTCA/1.0/common',
                    'ns3': 'http://schemas.nav.gov.hu/OSA/3.0/base',
                    'ns4': 'http://schemas.nav.gov.hu/OSA/3.0/data'
                }
                
                # Extract taxpayer data - without namespace prefix in find()
                taxpayer_data_elem = root.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerData')
                # Extract taxpayer data - without namespace prefix in find()
                taxpayer_data_elem = root.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerData')
                if taxpayer_data_elem is not None:
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
                                'staircase': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}staircase'),
                                'floor': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}floor'),
                                'door': addr_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/base}door')
                            })
                    if address_list:
                        parsed_data['taxpayer_address_list'] = address_list
                    
                    # VAT group membership
                    vat_group_elem = taxpayer_data_elem.find('{http://schemas.nav.gov.hu/OSA/3.0/api}vatGroupMembership')
                    if vat_group_elem is not None:
                        parsed_data['vat_group_membership'] = {
                            'vatGroupId': vat_group_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/api}vatGroupId'),
                            'vatGroupMemberTaxNumber': vat_group_elem.findtext('{http://schemas.nav.gov.hu/OSA/3.0/api}vatGroupMemberTaxNumber')
                        }
                        
            except Exception as e:
                logger.error(f"XML parsing error: {e}")
        
        # Sikeres válasz
        return JsonResponse({
            'success': result.get('success', False),
            'data': parsed_data if parsed_data else result,
            'raw_response': result.get('response'),
            'message': 'Adószám lekérdezés sikeres' if result.get('success') else 'Adószám nem található',
            'nav_config_used': nav_config.name
        })
        
    except Exception as e:
        logger.error(f"LookupTaxpayer hiba: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        # Hiba válasz
        return JsonResponse({
            'success': False,
            'error': str(e),
            'message': 'Adószám lekérdezés sikertelen'
        }, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_exchange_rate(request):
    """Return HUF exchange rate for given currency code using public API if available.
    Query params: currency (e.g., EUR). Falls back to 1.0.
    """
    code = (request.GET.get('currency') or '').upper().strip()
    if not code or code == 'HUF':
        return JsonResponse({'currency': code or 'HUF', 'rate': 1.0})
    rate = None
    try:
        resp = requests.get(f'https://api.napiarfolyam.hu/?valuta={code}', timeout=5)
        if resp.ok:
            data = resp.json()
            r = data.get('kozep_arfolyam') or data.get('arfolyam')
            if r:
                rate = float(str(r).replace(',', '.'))
    except Exception as ex:
        logger.warning(f"Exchange rate fetch failed for {code}: {ex}")
        rate = None
    if rate is None:
        return JsonResponse({'currency': code, 'rate': 1.0, 'note': 'Fallback rate. Live fetch failed.'})
    return JsonResponse({'currency': code, 'rate': rate})
