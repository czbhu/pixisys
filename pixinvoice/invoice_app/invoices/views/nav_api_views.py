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
@require_api_key
@require_http_methods(["GET", "POST"])
def lookup_taxpayer(request):
    """
    Adószám lekérdezése a NAV API-tól
    GET paraméter: tax_number
    """
    try:
        # Adószám lekérdezése a paraméterekből (GET vagy POST)
        if request.method == 'GET':
            tax_number = request.GET.get('tax_number')
        else:  # POST
            import json
            try:
                data = json.loads(request.body)
                tax_number = data.get('tax_number')
            except (json.JSONDecodeError, AttributeError):
                tax_number = None
        
        if not tax_number:
            return JsonResponse({
                'success': False,
                'error': 'tax_number paraméter hiányzik',
                'message': 'Adószám megadása kötelező'
            }, status=400)
        
        # Konfiguráció létrehozása
        config = NavApiConfig.create_test_config()
        
        # Reporter inicializálása
        reporter = NavApiReporter(config)
        
        # Adószám lekérdezése
        result = reporter.query_taxpayer(tax_number)
        
        # Debug logolás
        logger.info(f"NAV API válasz: {result}")
        
        # Sikeres válasz
        return JsonResponse({
            'success': True,
            'data': result,
            'message': 'Adószám lekérdezés sikeres' if result['success'] else 'Adószám nem található'
        })
        
    except Exception as e:
        logger.error(f"LookupTaxpayer hiba: {str(e)}")
        
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
