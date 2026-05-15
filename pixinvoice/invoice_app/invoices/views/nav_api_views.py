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
import xml.etree.ElementTree as ET

from invoices.nav_api_config import NavApiConfig
from invoices.nav_api_reporter import NavApiReporter
from invoices.mnb_api import MNBApiClient
from django.core.cache import cache
from datetime import datetime

logger = logging.getLogger(__name__)


def parse_nav_taxpayer_response(xml_string):
    """
    Parse NAV QueryTaxpayer XML response and extract taxpayer data
    
    This function is used by both lookup_taxpayer view and CSV import
    to ensure consistent data extraction from NAV API responses.
    
    Args:
        xml_string: XML response string from NAV API
        
    Returns:
        dict: Parsed taxpayer data with keys:
            - taxpayer_name
            - taxpayer_short_name
            - tax_number_detail (dict with taxpayerId, vatCode, countyCode)
            - taxpayer_address_list (list of address dicts)
            - vat_group_membership (dict with vatGroupId, vatGroupMemberTaxNumber)
    """
    parsed_data = {}
    
    try:
        root = ET.fromstring(xml_string)
        
        # Extract taxpayer data - using full namespace URI in find()
        taxpayer_data_elem = root.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}taxpayerData')
        
        if taxpayer_data_elem is not None:
            # Extract taxpayer name and short name using findtext with full namespace
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
        logger.error(f"NAV XML parsing error: {e}")
        raise
    
    return parsed_data

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
        
        # Parse XML response to extract taxpayer data using common parsing function
        parsed_data = {}
        if result.get('success') and result.get('response'):
            try:
                xml_string = result['response']
                parsed_data = parse_nav_taxpayer_response(xml_string)
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
    """
    Return HUF exchange rate for given currency code using MNB API.
    Supports optional 'date' parameter (YYYY-MM-DD). If missing, uses today.
    """
    code = (request.GET.get('currency') or '').upper().strip()
    if not code or code == 'HUF':
        return JsonResponse({'currency': code or 'HUF', 'rate': 1.0})

    date_param = request.GET.get('date', '').strip()
    today_str = datetime.now().strftime('%Y-%m-%d')
    target_date = date_param if date_param else today_str
    
    # Cache key specific for date
    rate_key = f"mnb_rate_{code}_{target_date}"
    cached_rate = cache.get(rate_key)
    
    if cached_rate is not None:
        return JsonResponse({'currency': code, 'rate': float(cached_rate), 'date': target_date, 'source': 'cache'})
        
    try:
        client = MNBApiClient()
        rate = None
        
        if date_param and date_param != today_str:
            # Historical lookup for specific date
            logger.info(f"Fetching historical MNB rate for {code} on {target_date}...")
            rate = client.get_exchange_rate_for_date(code, target_date)
        else:
            # Today's rates - try bulk fetch optimization first if not already done
            cache_key_fetched = f"mnb_rates_fetched_{today_str}"
            if not cache.get(cache_key_fetched):
                logger.info(f"Fetching daily MNB exchange rates for {today_str}...")
                rates = client.get_current_exchange_rates()
                count = 0
                for curr, data in rates.items():
                    rk = f"mnb_rate_{curr}_{today_str}"
                    cache.set(rk, float(data['rate']), timeout=86400)
                    if curr == code:
                        rate = float(data['rate'])
                    count += 1
                if count > 0:
                    cache.set(cache_key_fetched, True, timeout=86400)
            
            # If still no rate (maybe bulk fetch missed it or failed), try specific fetch
            if rate is None:
                # Try specific fetch for today
                rate = client.get_exchange_rate_for_date(code, target_date)

        if rate is not None:
            cache.set(rate_key, rate, timeout=86400 * 2) # Cache for 2 days
            return JsonResponse({'currency': code, 'rate': rate, 'date': target_date, 'source': 'mnb'})
        else:
            return JsonResponse({'error': 'Exchange rate not found'}, status=404)

    except Exception as e:
        logger.error(f"Failed to fetch MNB rate for {code} on {target_date}: {e}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
def menu_badge_counts(request):
    """
    GET /api/menu-badges/?company_id=X&since_invoices=ISO&since_scheduled_invoices=ISO&...
    Returns count of new items per menu section since the given timestamps.
    Sections: invoices, scheduled_invoices, incoming_invoices, incoming_invoices_external,
              proformas, incoming_proformas, cash_registers
    """
    from rest_framework.decorators import api_view, permission_classes as pc_decorator
    from rest_framework.permissions import IsAuthenticated
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework.request import Request as DRFRequest

    # Wrap in DRF request to run JWT authentication
    drf_request = DRFRequest(request, authenticators=[JWTAuthentication()])
    try:
        drf_request._authenticate()
    except Exception:
        pass

    if not drf_request.user or not drf_request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required'}, status=401)

    company_id = request.GET.get('company_id', '').strip()
    if not company_id:
        return JsonResponse({})

    try:
        from invoices.models import (
            Company, Invoice, ScheduledInvoice, IncomingInvoiceDigest,
            ProformaInvoice, CashRegisterTransaction, IncomingProforma,
        )
        from django.utils.dateparse import parse_datetime

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return JsonResponse({})

        def _since(key):
            v = request.GET.get(key, '').strip()
            if not v:
                return None
            try:
                dt = parse_datetime(v)
                if dt and dt.tzinfo is None:
                    import pytz
                    dt = pytz.utc.localize(dt)
                return dt
            except Exception:
                return None

        result = {}

        s = _since('since_invoices')
        if s:
            result['invoices'] = Invoice.objects.filter(company=company, created_at__gt=s).count()

        s = _since('since_scheduled_invoices')
        if s:
            result['scheduled_invoices'] = ScheduledInvoice.objects.filter(company=company, created_at__gt=s).count()

        s = _since('since_incoming_invoices')
        if s:
            result['incoming_invoices'] = IncomingInvoiceDigest.objects.filter(company=company, created_at__gt=s).count()

        s = _since('since_incoming_invoices_external')
        if s:
            result['incoming_invoices_external'] = IncomingInvoiceDigest.objects.filter(company=company, created_at__gt=s).count()

        s = _since('since_proformas')
        if s:
            result['proformas'] = ProformaInvoice.objects.filter(company=company, created_at__gt=s).count()

        s = _since('since_incoming_proformas')
        if s:
            result['incoming_proformas'] = IncomingProforma.objects.filter(company=company, created_at__gt=s).count()

        s = _since('since_cash_registers')
        if s:
            result['cash_registers'] = CashRegisterTransaction.objects.filter(company=company, created_at__gt=s).count()

        return JsonResponse(result)

    except Exception as e:
        logger.error(f"menu_badge_counts error: {e}")
        return JsonResponse({})
