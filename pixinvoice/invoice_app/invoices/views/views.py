from django.http import HttpResponseForbidden
from functools import wraps
def require_api_key(view_func):
    """Require a valid API key via `X-Api-Key` and bind company automatically.
    Works with both function-based views and class-based view methods.
    """
    @wraps(view_func)
    def _wrapped_view(*args, **kwargs):
        # Detect whether called as function(request, ...) or method(self, request, ...)
        if not args:
            return HttpResponseForbidden('Hibás hívás')
        if hasattr(args[0], 'META'):
            self = None
            request = args[0]
            rest = args[1:]
        else:
            self = args[0]
            if len(args) < 2:
                return HttpResponseForbidden('Hibás hívás')
            request = args[1]
            rest = args[2:]

        api_key = request.headers.get('X-Api-Key') or request.META.get('HTTP_X_API_KEY')
        company_id = (
            request.GET.get('company_id')
            or (getattr(request, 'data', None) and request.data.get('company_id'))
            or request.POST.get('company_id')
        )
        if not api_key:
            return HttpResponseForbidden('API-kulcs szükséges')
        from invoices.models import Company, APIClient
        company = None
        api_client = None
        try:
            api_client = APIClient.objects.select_related('company').get(api_key=api_key, is_active=True)
            company = api_client.company
        except APIClient.DoesNotExist:
            try:
                company = Company.objects.get(api_key=api_key)
            except Company.DoesNotExist:
                return HttpResponseForbidden('Érvénytelen API-kulcs')
        if company_id and str(company.id) != str(company_id):
            return HttpResponseForbidden('A megadott company_id nem egyezik az API-kulcshoz tartozó céggel')
        request.company = company
        request.api_client = api_client
        if self is None:
            return view_func(request, *rest, **kwargs)
        else:
            return view_func(self, request, *rest, **kwargs)
    return _wrapped_view
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import models
from django.db.models import Q, Sum, Max
from django.utils import timezone
from invoices.models import Customer, Invoice, InvoiceItem, NAVConfiguration, Contact, Company, SystemUser, Role, InvoiceBlock, CompanyNAVConfiguration, CustomerBankAccount, CompanyBankAccount, VATType, BankStatement, BankStatementItem, ProformaInvoice, AdvanceAllocation, CompanyEmailSettings, PaymentBatch, PaymentBatchItem, IncomingInvoiceDigest, IncomingInvoiceData, APIAccessRule, APIClient, APIClientAccessRule, IncomingDocument, BackupConfiguration, BackupFile, Currency
from django.contrib.auth.hashers import make_password
from invoices.serializers import (
    CustomerSerializer, InvoiceSerializer, InvoiceCreateSerializer,
    InvoiceItemSerializer, NAVConfigurationSerializer, ContactSerializer, ContactCreateSerializer,
    CompanySerializer, SystemUserSerializer, SystemUserCreateSerializer, RoleSerializer, InvoiceBlockSerializer, CompanyNAVConfigurationSerializer,
    CustomerBankAccountSerializer, CompanyBankAccountSerializer, VATTypeSerializer, BankStatementSerializer,
    ProformaSerializer, ProformaCreateSerializer, CurrencySerializer
)
from invoices.serializers import CompanyEmailSettingsSerializer, PaymentBatchSerializer, PaymentBatchItemSerializer, IncomingDocumentSerializer, BackupConfigurationSerializer, BackupFileSerializer
from invoices.nav_service import NAVService
from invoices.mnb_api import MNBApiClient
from invoices.supplier_auto_register import auto_register_or_update_supplier, get_supplier_bank_account_for_invoice
import logging
import time
import os
import re
import decimal
from django.http import HttpResponse
from datetime import datetime, date
import xml.etree.ElementTree as ET
import json
from django.forms.models import model_to_dict
from django.db import transaction


ROLE_MENU_OPTIONS = [
    {'key': 'dashboard', 'label': 'Dashboard'},
    {'key': 'invoices', 'label': 'Számlák'},
    {'key': 'incoming_invoices', 'label': 'Bejövő számlák'},
    {'key': 'incoming_invoices_approve', 'label': 'Bejövő számlák jóváhagyás'},
    {'key': 'payment_batch_without_approval', 'label': 'Fizetési csomag jóváhagyás nélkül'},
    {'key': 'proformas', 'label': 'Díjbekérők'},
    {'key': 'bank_statements', 'label': 'Bank'},
    {'key': 'customers', 'label': 'Ügyfelek'},
    {'key': 'contacts', 'label': 'Kapcsolattartók'},
    {'key': 'reports', 'label': 'Jelentések'},
    {'key': 'settings', 'label': 'Beállítások'},
    {'key': 'settings_roles', 'label': 'Jogosultságok'},
    {'key': 'settings_users', 'label': 'Felhasználók'},
    {'key': 'settings_companies', 'label': 'Cégek'},
    {'key': 'settings_invoice_blocks', 'label': 'Számlatömbök'},
    {'key': 'settings_nav_configurations', 'label': 'NAV konfigurációk'},
    {'key': 'settings_email', 'label': 'E-mail beállítások'},
    {'key': 'settings_backup', 'label': 'Backup / Visszaállítás'},
    {'key': 'settings_api_access', 'label': 'API hozzáférés'},
    {'key': 'settings_data_import', 'label': 'Adat import'},
    {'key': 'settings_vat_types', 'label': 'ÁFA típusok'},
]

logger = logging.getLogger(__name__)


def get_fuzzy_search_regex(search_term):
    """
    Készít egy regex-et a kereséshez, ami nem tesz különbséget az ékezetes és ékezet nélküli magánhangzók között.
    Pl. 'a' keresése megtalálja az 'á'-t is, és fordítva.
    """
    if not search_term:
        return None
    
    term_lower = search_term.lower()
    replacements = {
        'a': '[aá]', 'á': '[aá]',
        'e': '[eé]', 'é': '[eé]',
        'i': '[ií]', 'í': '[ií]',
        'o': '[oóöő]', 'ó': '[oóöő]', 'ö': '[oóöő]', 'ő': '[oóöő]',
        'u': '[uúüű]', 'ú': '[uúüű]', 'ü': '[uúüű]', 'ű': '[uúüű]',
    }
    
    pattern = []
    for char in term_lower:
        if char in replacements:
            pattern.append(replacements[char])
        else:
            pattern.append(re.escape(char))
    return "".join(pattern)


class CurrencyViewSet(viewsets.ModelViewSet):
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer
    permission_classes = []

    @action(detail=False, methods=['post'], url_path='update-mnb')
    def update_mnb(self, request):
        try:
            client = MNBApiClient()
            updated_count = client.update_exchange_rates()
            return Response({'message': f'{updated_count} árfolyam frissítve.'})
        except Exception as e:
            logger.error(f"MNB update error: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='mnb-currencies')
    def mnb_currencies(self, request):
        """Returns list of currencies from MNB with current rates"""
        try:
            client = MNBApiClient()
            rates = client.get_current_exchange_rates()
            data = []
            for code, details in rates.items():
                data.append({
                    'code': code,
                    'name': details['name'],
                    'current_rate': details['rate_huf']
                })
            data.sort(key=lambda x: x['code'])
            return Response(data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CustomerViewSet(viewsets.ModelViewSet):
    """ViewSet for managing customers"""
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = []  # Nincs autentikáció szükséges

    def get_queryset(self):
        queryset = Customer.objects.all()
        search = self.request.query_params.get('search', None)
        if search:
            search_regex = get_fuzzy_search_regex(search)
            queryset = queryset.filter(
                Q(name__iregex=search_regex) |
                Q(tax_number__icontains=search) |
                Q(eu_tax_number__icontains=search) |
                Q(email__icontains=search)
            )
        type_filter = self.request.query_params.get('type') or self.request.query_params.get('kind')
        if type_filter == 'supplier':
            queryset = queryset.filter(is_supplier=True)
        elif type_filter == 'customer':
            queryset = queryset.filter(is_customer=True)
        return queryset

    def create(self, request, *args, **kwargs):
        """Create customer with duplicate tax number check"""
        tax_number = request.data.get('tax_number')
        overwrite = request.data.get('overwrite', False)
        
        if tax_number and not overwrite:
            # Check if customer with this tax number already exists
            existing_customer = Customer.objects.filter(tax_number=tax_number).first()
            if existing_customer:
                return Response({
                    'error': 'duplicate_tax_number',
                    'message': f'Már létezik ügyfél ezzel az adószámmal: {tax_number}',
                    'existing_customer': {
                        'id': str(existing_customer.id),
                        'name': existing_customer.name,
                        'tax_number': existing_customer.tax_number,
                        'created_at': existing_customer.created_at.isoformat()
                    }
                }, status=status.HTTP_409_CONFLICT)
        
        if overwrite and tax_number:
            # Delete existing customer with this tax number
            Customer.objects.filter(tax_number=tax_number).delete()
        
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        """Update customer with duplicate tax number check"""
        tax_number = request.data.get('tax_number')
        customer_id = kwargs.get('pk')
        
        if tax_number:
            # Check if another customer with this tax number already exists
            existing_customer = Customer.objects.filter(
                tax_number=tax_number
            ).exclude(id=customer_id).first()
            
            if existing_customer:
                return Response({
                    'error': 'duplicate_tax_number',
                    'message': f'Már létezik másik ügyfél ezzel az adószámmal: {tax_number}',
                    'existing_customer': {
                        'id': str(existing_customer.id),
                        'name': existing_customer.name,
                        'tax_number': existing_customer.tax_number,
                        'created_at': existing_customer.created_at.isoformat()
                    }
                }, status=status.HTTP_409_CONFLICT)
        
        return super().update(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def validate_eu_vat(self, request):
        """Validate EU VAT number using VIES API"""
        import requests
        vat_number = request.data.get('vat_number', '').strip()
        if not vat_number:
            return Response({'error': 'Adószám megadása kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Remove country code if present (2 chars)
        country_code = vat_number[:2].upper()
        # Some Spanish VATs (and others likely) have an extra letter prefix that needs special handling
        # OR VIES expects clean number without the country code prefix.
        
        # User reported ESB80021462 -> VIES says valid but "Corrected VAT Number B80021462"
        # and "The country ISO code has been removed from the VAT number."
        # This implies we sent ES B80021462. Wait, no.
        # If user enters ESB80021462
        # country_code = ES
        # number_part = B80021462
        # Payload: { countryCode: ES, vatNumber: B80021462 }
        # This SHOULD work if the VAT number is B80021462.
        
        # However, sometimes users enter without country code, or just pure numbers.
        # For ES, NIF can start with letter.
        
        # Let's trust the first 2 letters as country code only if they interrupt with ISO codes.
        # But if the user inputs something that DOESN'T start with country code? 
        # (frontend label says EU tax number, usually implies full format).
        
        number_part = vat_number[2:]

        # Special fallback for Spain (ES) specifically or generally:
        # If VIES returns "invalid" but we suspect it might be due to prefix handling (like leading 'ES' stripping),
        # we can retry.
        # But here, ES is the country code. The remainder is B80021462. This seems correct.
        
        # The user says: "VIES website says valid... Original VAT Number ESB80021462 ... Corrected VAT Number B80021462 ... The country ISO code has been removed from the VAT number."
        # This message on VIES usually appears when you type the full number including prefix into the "VAT Number" field on their web form select the country separately.
        
        # Wait, if I send {countryCode: "ES", vatNumber: "B80021462"} -> It should be valid immediately.
        # If I send {countryCode: "ES", vatNumber: "ESB80021462"} -> VIES API might fail or strip it?
        
        # If the user typed "ESB80021462", 
        # country_code = "ES"
        # number_part = "B80021462"
        # payload = {countryCode: "ES", vatNumber: "B80021462"}
        # This looks correct.
        
        # Maybe the user typed "ES ESB80021462"? Or something odd?
        # Or maybe the "B" is part of the number and my splitting logic is fine.

        # Let's check if the number_part STILL starts with the country code?
        if number_part.upper().startswith(country_code):
             number_part = number_part[2:]
             
        # Check if first 2 chars are letters
        if not country_code.isalpha():
             return Response({'error': 'Az adószámnak kétbetűs országkóddal kell kezdődnie (pl. DE123456789)'}, status=status.HTTP_400_BAD_REQUEST)

        # VIES API REST
        url = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number"
        payload = {
            "countryCode": country_code,
            "vatNumber": number_part
        }
        
        try:
            resp = requests.post(url, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                
                # FIX: FR addresses often come concatenated (Address + Zip + City)
                # We try to parse them to avoid validation errors on long addresses
                is_valid = data.get('isValid') or data.get('valid')
                if country_code == 'FR' and is_valid and data.get('address'):
                    import re
                    addr = data['address'].strip()
                    # Regex to find last occurrence of 5-digit zip followed by city
                    # Group 1: Address part
                    # Group 2: Zip (5 digits)
                    # Group 3: City
                    match = re.search(r'^(.*)(\d{5})\s+(.*)$', addr, re.DOTALL)
                    if match:
                        cleaned_addr = match.group(1).strip().strip(',').strip()
                        data['address'] = cleaned_addr
                        data['zip_code'] = match.group(2)
                        data['city'] = match.group(3).strip()

                return Response(data)
            else:
                return Response({'error': 'VIES API hiba', 'details': resp.text}, status=resp.status_code)
        except Exception as e:
            return Response({'error': f'VIES hálózati hiba: {str(e)}'}, status=500)



class ApiAccessViewSet(viewsets.ViewSet):
    """Company-level API access configuration.
    GET returns current rules, PUT saves new rules.
    """
    permission_classes = []

    def _get_company(self, request):
        company = getattr(request, 'company', None)
        if not company:
            cid = request.query_params.get('company_id') or request.query_params.get('company') or (request.data.get('company_id') if isinstance(request.data, dict) else None)
            if cid:
                company = Company.objects.filter(id=cid).first()
        return company

    def get(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'error': 'company_id szükséges vagy API-kulcs hiányzik'}, status=400)
        scopes = [{'key': k, 'label': v} for k, v in APIAccessRule.SCOPE_CHOICES]
        blocks = InvoiceBlock.objects.filter(company=company).order_by('name')
        company_all = APIAccessRule.objects.filter(company=company, invoice_block__isnull=True, scope=APIAccessRule.SCOPE_ALL, allowed=True).exists()
        company_scopes = list(
            APIAccessRule.objects.filter(company=company, invoice_block__isnull=True, allowed=True)
            .exclude(scope=APIAccessRule.SCOPE_ALL)
            .values_list('scope', flat=True)
        )
        block_rules = {}
        for b in blocks:
            block_rules[str(b.id)] = [r.scope for r in APIAccessRule.objects.filter(company=company, invoice_block=b, allowed=True)]
        return Response({'scopes': scopes, 'company': {'allAccess': company_all, 'scopes': company_scopes}, 'blocks': block_rules})

    def save(self, request):
        company = self._get_company(request)
        if not company:
            return Response({'error': 'company_id szükséges vagy API-kulcs hiányzik'}, status=400)
        data = request.data or {}
        company_section = data.get('company') or {}
        blocks = data.get('blocks') or {}
        APIAccessRule.objects.filter(company=company).delete()
        if company_section.get('allAccess'):
            APIAccessRule.objects.create(company=company, scope=APIAccessRule.SCOPE_ALL, allowed=True)
        else:
            for s in company_section.get('scopes') or []:
                APIAccessRule.objects.create(company=company, scope=s, allowed=True)
        for block_id, scopes in blocks.items():
            try:
                b = InvoiceBlock.objects.get(id=block_id, company=company)
            except InvoiceBlock.DoesNotExist:
                continue
            for s in scopes:
                APIAccessRule.objects.create(company=company, invoice_block=b, scope=s, allowed=True)
        return Response({'ok': True})


class APIClientViewSet(viewsets.ModelViewSet):
    queryset = APIClient.objects.select_related('company').all()
    permission_classes = []

    def get_queryset(self):
        qs = APIClient.objects.select_related('company').all()
        company_id = (
            self.request.query_params.get('company_id')
            or self.request.query_params.get('company')
            or (getattr(self.request, 'company', None) and str(self.request.company.id))
        )
        if company_id:
            qs = qs.filter(company_id=company_id)
        return qs

    def list(self, request):
        scope_label_map = dict(APIAccessRule.SCOPE_CHOICES)
        items = []
        for c in self.get_queryset():
            if APIClientAccessRule.objects.filter(api_client=c, invoice_block__isnull=True, scope=APIAccessRule.SCOPE_ALL, allowed=True).exists():
                level = scope_label_map.get(APIAccessRule.SCOPE_ALL, 'All access')
            else:
                scopes = list(
                    APIClientAccessRule.objects.filter(api_client=c, invoice_block__isnull=True, allowed=True)
                    .exclude(scope=APIAccessRule.SCOPE_ALL)
                    .values_list('scope', flat=True)
                )
                level = ', '.join(scope_label_map.get(s, s) for s in scopes) if scopes else 'Egyedi / nincs'
            items.append({
                'id': str(c.id),
                'name': c.name,
                'api_key': c.api_key,
                'is_active': c.is_active,
                'access_level': level,
                'created_at': c.created_at.isoformat(),
            })
        return Response({'results': items})

    def create(self, request):
        data = request.data or {}
        company_id = data.get('company_id') or data.get('company') or (getattr(request, 'company', None) and str(request.company.id))
        name = data.get('name')
        if not company_id or not name:
            return Response({'detail': 'company_id és name kötelező'}, status=400)
        company = get_object_or_404(Company, id=company_id)
        client = APIClient.objects.create(company=company, name=name)
        return Response({'id': str(client.id), 'name': client.name, 'api_key': client.api_key, 'is_active': client.is_active})

    def destroy(self, request, pk=None):
        client = get_object_or_404(APIClient, id=pk)
        client.delete()
        return Response(status=204)

    @action(detail=True, methods=['post'])
    def regenerate_key(self, request, pk=None):
        client = get_object_or_404(APIClient, id=pk)
        import secrets
        client.api_key = secrets.token_urlsafe(32)
        client.save(update_fields=['api_key', 'updated_at'])
        return Response({'api_key': client.api_key})

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        client = get_object_or_404(APIClient, id=pk)
        client.is_active = not client.is_active
        client.save(update_fields=['is_active', 'updated_at'])
        return Response({'is_active': client.is_active})

    @action(detail=True, methods=['get'])
    def rules(self, request, pk=None):
        client = get_object_or_404(APIClient, id=pk)
        scopes = [{'key': k, 'label': v} for k, v in APIAccessRule.SCOPE_CHOICES]
        blocks = InvoiceBlock.objects.filter(company=client.company).order_by('name')
        company_all = APIClientAccessRule.objects.filter(api_client=client, invoice_block__isnull=True, scope=APIAccessRule.SCOPE_ALL, allowed=True).exists()
        company_scopes = list(
            APIClientAccessRule.objects.filter(api_client=client, invoice_block__isnull=True, allowed=True)
            .exclude(scope=APIAccessRule.SCOPE_ALL)
            .values_list('scope', flat=True)
        )
        block_rules = {}
        for b in blocks:
            block_rules[str(b.id)] = [r.scope for r in APIClientAccessRule.objects.filter(api_client=client, invoice_block=b, allowed=True)]
        return Response({'scopes': scopes, 'company': {'allAccess': company_all, 'scopes': company_scopes}, 'blocks': block_rules})

    @action(detail=True, methods=['put'])
    def save_rules(self, request, pk=None):
        client = get_object_or_404(APIClient, id=pk)
        data = request.data or {}
        company_section = data.get('company') or {}
        blocks = data.get('blocks') or {}
        APIClientAccessRule.objects.filter(api_client=client).delete()
        if company_section.get('allAccess'):
            APIClientAccessRule.objects.create(api_client=client, scope=APIAccessRule.SCOPE_ALL, allowed=True)
        else:
            for s in company_section.get('scopes') or []:
                APIClientAccessRule.objects.create(api_client=client, scope=s, allowed=True)
        for block_id, scopes in blocks.items():
            try:
                b = InvoiceBlock.objects.get(id=block_id, company=client.company)
            except InvoiceBlock.DoesNotExist:
                continue
            for s in scopes:
                APIClientAccessRule.objects.create(api_client=client, invoice_block=b, scope=s, allowed=True)
        return Response({'ok': True})


def num2words_hu(n):
    ones = ['', 'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc']
    tens = ['', 'tíz', 'húsz', 'harminc', 'negyven', 'ötven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven']
    hundred = 'száz'

    def chunk(num):
        if not num: return ''
        s = ''
        sz = num // 100
        t = (num % 100) // 10
        o = num % 10
        if sz > 0:
            if sz == 1: s += hundred
            elif sz == 2: s += 'kétszáz'
            else: s += ones[sz] + hundred
        if t == 1:
            if o == 0: s += 'tíz'
            else: s += 'tizen' + ones[o]
            return s
        if t == 2:
            if o == 0: s += 'húsz'
            else: s += 'huszon' + ones[o]
            return s
        if t > 2: s += tens[t]
        if o > 0 and t != 1 and t != 2: s += ones[o]
        return s

    def scale(count, singular):
        if not count: return ''
        if singular == 'ezer':
            if count == 1: return 'ezer'
            if count == 2: return 'kétezer'
            return chunk(count) + 'ezer'
        if count == 1: return 'egy' + singular
        if count == 2: return 'két' + singular
        return chunk(count) + singular

    if n == 0: return 'nulla'
    n = int(n)
    b = n // 1_000_000_000
    m = (n % 1_000_000_000) // 1_000_000
    e = (n % 1_000_000) // 1000
    r = n % 1000
    parts = []
    if b: parts.append(scale(b, 'milliárd'))
    if m: parts.append(scale(m, 'millió'))
    if e: parts.append(scale(e, 'ezer'))
    if r: parts.append(chunk(r))
    return '-'.join(filter(None, parts))

def get_amount_words_hu(amount, curr):
    abs_val = abs(amount or 0)
    whole = int(abs_val)
    fraction = int(round((abs_val - whole) * 100))
    main = num2words_hu(whole) + ' ' + ('forint' if curr == 'HUF' else curr)
    if curr == 'HUF':
        if fraction > 0:
            return f"azaz {main} {num2words_hu(fraction)} fillér"
        return f"azaz {main}"
    if fraction > 0:
        return f"azaz {main} és {fraction} cent"
    return f"azaz {main}"


def _generate_pdf_bytes_v2(inv):
    try:
        from weasyprint import HTML
    except ImportError:
        HTML = None
    from django.template.loader import render_to_string
    import io
    from collections import defaultdict

    # Calculate VAT summary
    vat_map = defaultdict(lambda: {'net': 0, 'vat': 0, 'gross': 0, 'rate': 0, 'label': ''})
    
    # Needs items prefetch to be efficient
    for item in inv.items.all():
         r = item.vat_rate
         vt = item.vat_type
         
         if vt and vt.category != 'PERCENT':
             eff_rate = vt.percentage if vt.percentage is not None else r
             if eff_rate % 1 == 0:
                 label = f"{int(eff_rate)}%"
             else:
                 label = f"{eff_rate}%"
             key = (r, vt.code)
         else:
             if r % 1 == 0:
                 l_str = f"{int(r)}%"
             else:
                 l_str = f"{r}%"
             key = (r, 'PERCENT')
             label = l_str

         vat_map[key]['rate'] = r
         vat_map[key]['label'] = label
         vat_map[key]['net'] += item.net_amount
         vat_map[key]['vat'] += item.vat_amount
         vat_map[key]['gross'] += item.gross_amount
         
    vat_summary = sorted(vat_map.values(), key=lambda x: x['rate'])
    
    huf_totals = None
    if (inv.currency or '').upper() != 'HUF':
         ex = inv.exchange_rate or 1
         huf_totals = {
             'net': inv.total_net_amount * ex,
             'vat': inv.total_vat_amount * ex,
             'gross': inv.total_gross_amount * ex
         }

    advances_sum = 0
    if hasattr(inv, 'advance_allocations_as_final'):
         advances_sum = sum([a.amount for a in inv.advance_allocations_as_final.all()])
    
    rounding_diff = 0
    payable_amount = inv.total_gross_amount - advances_sum
    
    if (inv.currency or 'HUF') == 'HUF' and inv.payment_method in ['cash', 'cod']:
         try:
             # Use Decimal for precise calculation
             from decimal import Decimal, ROUND_HALF_UP
             gross = Decimal(str(payable_amount))
             d_5 = Decimal(5)
             rounded = (gross / d_5).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * d_5
             rounding_diff = rounded - gross
             payable_amount = rounded
         except Exception:
             pass
    
    amount_words = get_amount_words_hu(payable_amount, inv.currency or 'HUF')

    try:
        ctx = { 
            'invoice': inv, 
            'bilingual': (inv.currency or '').upper() != 'HUF',
            'block': inv.invoice_block,
            'vat_summary': vat_summary,
            'huf_totals': huf_totals,
            'rounding_diff': rounding_diff,
            'payable_amount': payable_amount,
            'amount_words': amount_words
        }
        html = render_to_string('invoices/print_invoice_v2.html', ctx)
        pdf_buf = io.BytesIO()
        if HTML:
            HTML(string=html).write_pdf(target=pdf_buf)
            pdf_buf.seek(0)
            return pdf_buf.read()
    except Exception as e:
        print(f"WeasyPrint PDF generation error: {e}")
    return None

def _send_bulk_email_thread(invoice_ids, subject, body, from_addr, to, cc, bcc, smtp_config, imap_config, sig_lines=None):
    from invoices.models import Invoice
    from django.db import connection
    from email.message import EmailMessage
    import smtplib, ssl, imaplib, os, io, traceback, datetime

    def log(msg):
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[BG-EMAIL {ts}] {msg}")

    try:
        invoices = Invoice.objects.filter(id__in=invoice_ids).select_related(
            'company', 'customer', 'invoice_block'
        ).prefetch_related(
            'items', 'items__vat_type', 'company__bank_accounts', 'advance_allocations_as_final'
        )
        if not invoices:
            log("No invoices found.")
            return

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = ', '.join(to)
        if cc:
            msg['Cc'] = ', '.join(cc)
        if bcc:
            msg['Bcc'] = ', '.join(bcc)

        if sig_lines and (body or '').find('--') == -1:
            body = (body or '') + "\n--\n" + "\n".join(sig_lines)
        
        # Determine if body is HTML (simple check)
        is_html = (body and ('<' in body and '>' in body))
        if is_html:
            msg.set_content("HTML-only e-mail") # Fallback
            msg.add_alternative(body, subtype='html')
        else:
            msg.set_content(body)

        for inv in invoices:
            pdf_content = _generate_pdf_bytes_v2(inv)
            if pdf_content:
                filename = f"{inv.invoice_number or 'szamla'}.pdf"
                msg.add_attachment(pdf_content, maintype='application', subtype='pdf', filename=filename)

        host, port, user, pwd, use_tls = smtp_config
        log(f"Sending to {to} via {host}:{port} (TLS={use_tls})")
        
        try:
            if port == 465:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(host, port, context=context) as server:
                    server.login(user, pwd)
                    server.send_message(msg)
            elif use_tls:
                context = ssl.create_default_context()
                with smtplib.SMTP(host, port) as server:
                    server.starttls(context=context)
                    server.login(user, pwd)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(host, port) as server:
                    server.login(user, pwd)
                    server.send_message(msg)
            log("Email sent successfully.")
        except Exception as smtp_err:
            log(f"SMTP Error: {smtp_err}")
            traceback.print_exc()
            return
                
        # IMAP Append
        imap_host, imap_user, imap_pwd, imap_port, sent_folder = imap_config
        if imap_host and imap_user and imap_pwd:
                log(f"Appending to IMAP {imap_host}...")
                raw = msg.as_bytes()
                try:
                    try:
                        M = imaplib.IMAP4_SSL(imap_host, imap_port)
                    except Exception:
                        try:
                            context = ssl.create_default_context()
                            M = imaplib.IMAP4(imap_host)
                            M.starttls(ssl_context=context)
                        except Exception:
                            M = imaplib.IMAP4(imap_host)
                    
                    M.login(imap_user, imap_pwd)
                    
                    used_folder = sent_folder or 'Sent'
                    try:
                        M.append(used_folder, '(\\Seen)', None, raw)
                    except:
                         # Fallback to standard names if config failed
                         for f in ['Sent', 'Sent Items']:
                             try:
                                 M.append(f, '(\\Seen)', None, raw)
                                 break
                             except: pass
                    
                    try:
                        M.logout()
                    except: pass
                    log("IMAP append successful.")
                except Exception as imap_err:
                    log(f"IMAP Append failed: {imap_err}")

    except Exception as e:
        log(f"Background email failed: {e}")
        traceback.print_exc()
    finally:
        connection.close()

class InvoiceViewSet(viewsets.ModelViewSet):
    """ViewSet for managing invoices"""
    queryset = Invoice.objects.all()
    permission_classes = []  # Nincs autentikáció szükséges

    def get_serializer_class(self):
        if self.action == 'create':
            return InvoiceCreateSerializer
        return InvoiceSerializer

    def get_queryset(self):
        queryset = Invoice.objects.all()
        status_filter = self.request.query_params.get('status', None)
        customer_filter = self.request.query_params.get('customer', None)
        company_filter = (
            self.request.query_params.get('company_id', None)
            or self.request.query_params.get('company', None)
            or (getattr(self.request, 'company', None) and str(self.request.company.id))
        )
        search = self.request.query_params.get('search', None)
        payment_method_filter = (self.request.query_params.get('payment_method') or '').strip().lower()
        invoice_block = self.request.query_params.get('invoice_block', None)
        
        if invoice_block:
            queryset = queryset.filter(invoice_block_id=invoice_block)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if customer_filter:
            queryset = queryset.filter(customer_id=customer_filter)
        if company_filter:
            queryset = queryset.filter(company_id=company_filter)
        if search:
            queryset = queryset.filter(
                Q(invoice_number__icontains=search) |
                Q(customer__name__icontains=search) |
                Q(notes__icontains=search)
            )
        if payment_method_filter and payment_method_filter != 'all':
            queryset = queryset.filter(payment_method__iexact=payment_method_filter.upper())

        # Date filtering
        issue_date_from = self.request.query_params.get('issue_date_from')
        issue_date_to = self.request.query_params.get('issue_date_to')
        delivery_date_from = self.request.query_params.get('delivery_date_from')
        delivery_date_to = self.request.query_params.get('delivery_date_to')

        if issue_date_from:
            queryset = queryset.filter(issue_date__gte=issue_date_from)
        if issue_date_to:
            queryset = queryset.filter(issue_date__lte=issue_date_to)
        if delivery_date_from:
            queryset = queryset.filter(delivery_date__gte=delivery_date_from)
        if delivery_date_to:
            queryset = queryset.filter(delivery_date__lte=delivery_date_to)

        return queryset

    @action(detail=False, methods=['get'])
    def unpaid(self, request):
        """List invoices considered unpaid (status not 'paid' or 'cancelled').
        Only 'transfer' and 'cod' payment methods are considered.
        Excludes storno invoices and their originals.
        """
        queryset = Invoice.objects.exclude(status='paid').exclude(status='cancelled').filter(payment_method__in=['transfer', 'cod'])
        # Exclude storno invoices (heuristics: notes contains 'sztornó' or 'storno')
        queryset = queryset.exclude(Q(notes__icontains='sztornó') | Q(notes__icontains='sztorno'))
        # Exclude originals of storno invoices by original_invoice_number or order_reference
        storno_qs = Invoice.objects.filter(Q(notes__icontains='sztornó') | Q(notes__icontains='sztorno'))
        orig_nums = list(storno_qs.values_list('original_invoice_number', flat=True))
        ref_nums = list(storno_qs.values_list('order_reference', flat=True))
        exclude_set = [n for n in (orig_nums + ref_nums) if n]
        if exclude_set:
            queryset = queryset.exclude(invoice_number__in=exclude_set)
        search = request.query_params.get('search')
        customer_id = request.query_params.get('customer_id')
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if search:
            queryset = queryset.filter(
                Q(invoice_number__icontains=search) |
                Q(customer__name__icontains=search) |
                Q(customer__tax_number__icontains=search)
            )
        payment_method_filter = (request.query_params.get('payment_method') or '').strip().lower()
        if payment_method_filter and payment_method_filter != 'all':
            queryset = queryset.filter(payment_method__iexact=payment_method_filter.upper())
        data = [
            {
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'customer_id': str(inv.customer.id),
                'customer_name': inv.customer.name,
                'gross_amount': float(inv.total_gross_amount),
                'amount_paid': float(inv.amount_paid or 0),
                'outstanding': float((inv.total_gross_amount - (inv.amount_paid or 0)) if inv.total_gross_amount is not None else 0),
                'issue_date': str(inv.issue_date),
                'due_date': str(inv.due_date),
                'status': inv.status,
            }
            for inv in queryset.select_related('customer').order_by('-issue_date')[:200]
        ]
        return Response({'results': data})

    @action(detail=False, methods=['get'])
    def open_advances(self, request):
        """Return advance invoices (category ADVANCE) that still have remaining amount.
        Params: company_id, customer_id (optional filters)
        """
        from decimal import Decimal
        company_id = request.query_params.get('company_id') or request.query_params.get('company') or (getattr(request, 'company', None) and str(request.company.id))
        customer_id = request.query_params.get('customer_id')
        qs = Invoice.objects.filter(invoice_category='ADVANCE')
        # Exclude storno ADVANCE invoices themselves
        qs = qs.exclude(Q(notes__icontains='sztornó') | Q(notes__icontains='sztorno') | Q(status='cancelled'))
        # Exclude originals of storno invoices (if an advance has been stornózott, its original shouldn't be used)
        storno_qs = Invoice.objects.filter(invoice_category='ADVANCE').filter(Q(notes__icontains='sztornó') | Q(notes__icontains='sztorno'))
        orig_nums = list(storno_qs.values_list('original_invoice_number', flat=True))
        ref_nums = list(storno_qs.values_list('order_reference', flat=True))
        exclude_set = [n for n in (orig_nums + ref_nums) if n]
        if exclude_set:
            qs = qs.exclude(invoice_number__in=exclude_set)
        if company_id:
            qs = qs.filter(company_id=company_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        results = []
        for adv in qs.select_related('customer').order_by('-issue_date'):
            adv_total = Decimal('0')
            # Determine if all items share the same VAT rate
            unique_rates = set()
            for it in adv.items.all():
                adv_total += (it.quantity * it.unit_price) * (Decimal('1') + (it.vat_rate/100))
                try:
                    unique_rates.add(float(it.vat_rate or 0))
                except Exception:
                    unique_rates.add(float(0))
            used = (AdvanceAllocation.objects.filter(advance_invoice=adv).aggregate(total=models.Sum('amount'))['total'] or Decimal('0'))
            remaining = adv_total - used
            if remaining > 0:
                vat_rate = None
                if len(unique_rates) == 1:
                    vat_rate = list(unique_rates)[0]
                results.append({
                    'id': str(adv.id),
                    'invoice_number': adv.invoice_number,
                    'issue_date': str(adv.issue_date),
                    'gross_total': float(adv_total),
                    'allocated': float(used),
                    'remaining': float(remaining),
                    'vat_rate': vat_rate,
                })
        return Response({'results': results})

    @action(detail=True, methods=['get'])
    def advance_usage(self, request, pk=None):
        """Return list of final invoices that used allocations from this advance invoice, with allocated gross totals per final."""
        try:
            adv = Invoice.objects.get(id=pk, invoice_category='ADVANCE')
        except Invoice.DoesNotExist:
            return Response({'results': [], 'total_used': 0}, status=status.HTTP_404_NOT_FOUND)
        from decimal import Decimal
        rows = (
            AdvanceAllocation.objects
            .filter(advance_invoice=adv)
            .values('final_invoice')
            .annotate(total=models.Sum('amount'))
        )
        finals = []
        total_used = Decimal('0')
        for r in rows:
            try:
                finv = Invoice.objects.get(id=r['final_invoice'])
            except Invoice.DoesNotExist:
                continue
            amt = r['total'] or 0
            try:
                amt = Decimal(str(amt))
            except Exception:
                amt = Decimal('0')
            total_used += amt
            finals.append({
                'id': str(finv.id),
                'invoice_number': finv.invoice_number,
                'issue_date': str(finv.issue_date),
                'amount': float(amt),
            })
        return Response({'results': finals, 'total_used': float(total_used)})

    @action(detail=True, methods=['post'])
    def cascade_storno(self, request, pk=None):
        """For an ADVANCE invoice: storno all linked final invoices that used it, then storno this advance.
        Returns created storno invoice ids in order.
        """
        try:
            adv = Invoice.objects.get(id=pk, invoice_category='ADVANCE')
        except Invoice.DoesNotExist:
            return Response({'error': 'Előleg számla nem található'}, status=status.HTTP_404_NOT_FOUND)
        from django.db import transaction
        created_ids = []
        with transaction.atomic():
            # Find finals that used this advance
            finals = (
                AdvanceAllocation.objects
                .filter(advance_invoice=adv)
                .values_list('final_invoice', flat=True)
                .distinct()
            )
            # Helper to create storno via serializer using invoice block/company
            def create_storno_for(inv: Invoice, ctx_extra=None):
                # Guard: if storno already exists for this invoice, return it
                existing = Invoice.objects.filter(
                    models.Q(notes__icontains='sztornó') | models.Q(notes__icontains='sztorno')
                ).filter(
                    models.Q(original_invoice_id=inv.id) | models.Q(order_reference=inv.invoice_number)
                ).order_by('created_at').first()
                if existing:
                    return existing
                base_data = {
                    'customer_id': str(inv.customer_id),
                    'items': [
                        {
                            'description': it.description,
                            'quantity': str(-it.quantity),
                            'unit_price': str(it.unit_price),
                            'vat_rate': str(it.vat_rate),
                            'unit_of_measure': it.unit_of_measure,
                            'nature_indicator': it.nature_indicator,
                            'product_code_category': it.product_code_category,
                            'product_code_value': it.product_code_value,
                        } for it in inv.items.all()
                    ],
                    'issue_date': str(inv.issue_date),
                    'due_date': str(inv.due_date),
                    'delivery_date': str(inv.delivery_date) if inv.delivery_date else None,
                    'currency': inv.currency,
                    'exchange_rate': str(inv.exchange_rate),
                    'payment_method': inv.payment_method,
                    'invoice_category': inv.invoice_category,
                    'invoice_appearance': inv.invoice_appearance,
                    'completeness_indicator': False,
                    'order_reference': inv.invoice_number,
                    'notes': f"Sztornó számla az alábbi számlára: {inv.invoice_number}",
                    'original_invoice_id': str(inv.id),
                }
                if inv.invoice_block_id:
                    base_data['invoice_block_id'] = str(inv.invoice_block_id)
                else:
                    base_data['company_id'] = str(inv.company_id)
                ctx = {'request': request}
                if ctx_extra:
                    ctx.update(ctx_extra)
                ser = InvoiceCreateSerializer(data=base_data, context=ctx)
                ser.is_valid(raise_exception=True)
                obj = ser.save()
                return obj
            # Storno finals first (oldest first to keep chain readable)
            finals_qs = Invoice.objects.filter(id__in=list(finals)).order_by('issue_date', 'created_at')
            # Exclude finals that are already stornózott (detect via storno notes + original or order reference)
            fin_list = list(finals_qs)
            final_ids = [f.id for f in fin_list]
            final_numbers = [f.invoice_number for f in fin_list if f.invoice_number]
            if final_ids or final_numbers:
                storno_qs = Invoice.objects.filter(
                    models.Q(notes__icontains='sztornó') | models.Q(notes__icontains='sztorno')
                )
                by_orig = set(storno_qs.filter(original_invoice_id__in=final_ids).values_list('original_invoice_id', flat=True))
                by_ref_numbers = set(storno_qs.filter(order_reference__in=final_numbers).values_list('order_reference', flat=True))
                # Map referenced numbers back to IDs
                ref_id_map = dict(Invoice.objects.filter(id__in=final_ids).values_list('invoice_number', 'id'))
                by_ref_ids = {ref_id_map.get(num) for num in by_ref_numbers if num in ref_id_map}
                already_ids = set([i for i in by_orig if i]) | set([i for i in by_ref_ids if i])
                if already_ids:
                    finals_qs = finals_qs.exclude(id__in=list(already_ids))
            for finv in finals_qs:
                st = create_storno_for(finv)
                created_ids.append(str(st.id))
            # Storno the advance itself
            st_adv = create_storno_for(adv, ctx_extra={'skip_advance_cascade': True})
            created_ids.append(str(st_adv.id))
        return Response({'created_storno_ids': created_ids})

    @action(detail=True, methods=['post'])
    def storno(self, request, pk=None):
        """Create a storno invoice for the given invoice. For ADVANCE, storno linked finals first then the advance."""
        try:
            inv = Invoice.objects.get(id=pk)
        except Invoice.DoesNotExist:
            return Response({'error': 'Számla nem található'}, status=status.HTTP_404_NOT_FOUND)
        
        # Ne lehessen sztornó számláról sztornót készíteni
        if inv.notes and ('sztornó' in inv.notes.lower() or 'sztorno' in inv.notes.lower()):
            return Response(
                {'error': 'Nem készíthető sztornó számla egy sztornó számláról.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from django.db import transaction
        created_ids = []
        with transaction.atomic():
            def create_storno_for(base: Invoice, ctx_extra=None):
                # Guard: if storno already exists for this invoice, return it
                existing = Invoice.objects.filter(
                    models.Q(notes__icontains='sztornó') | models.Q(notes__icontains='sztorno')
                ).filter(
                    models.Q(original_invoice_id=base.id) | models.Q(order_reference=base.invoice_number)
                ).order_by('created_at').first()
                if existing:
                    return existing
                data = {
                    'customer_id': str(base.customer_id),
                    'items': [
                        {
                            'description': it.description,
                            'quantity': str(-it.quantity),
                            'unit_price': str(it.unit_price),
                            'vat_rate': str(it.vat_rate),
                            'unit_of_measure': it.unit_of_measure,
                            'nature_indicator': it.nature_indicator,
                            'product_code_category': it.product_code_category,
                            'product_code_value': it.product_code_value,
                        } for it in base.items.all()
                    ],
                    'issue_date': str(base.issue_date),
                    'due_date': str(base.due_date),
                    'delivery_date': str(base.delivery_date) if base.delivery_date else None,
                    'currency': base.currency,
                    'exchange_rate': str(base.exchange_rate),
                    'payment_method': base.payment_method,
                    'invoice_category': base.invoice_category,
                    'invoice_appearance': base.invoice_appearance,
                    'completeness_indicator': False,
                    'order_reference': base.invoice_number,
                    'notes': f"Sztornó számla az alábbi számlára: {base.invoice_number}",
                    'original_invoice_id': str(base.id),
                }
                if base.invoice_block_id:
                    data['invoice_block_id'] = str(base.invoice_block_id)
                else:
                    data['company_id'] = str(base.company_id)
                ctx = {'request': request}
                if ctx_extra:
                    ctx.update(ctx_extra)
                ser = InvoiceCreateSerializer(data=data, context=ctx)
                ser.is_valid(raise_exception=True)
                obj = ser.save()
                return obj

            if inv.invoice_category == 'ADVANCE':
                # Storno finals first then advance
                finals = (
                    AdvanceAllocation.objects
                    .filter(advance_invoice=inv)
                    .values_list('final_invoice', flat=True)
                    .distinct()
                )
                finals_qs = Invoice.objects.filter(id__in=list(finals)).order_by('issue_date', 'created_at')
                # Exclude finals already stornoed
                fin_list = list(finals_qs)
                final_ids = [f.id for f in fin_list]
                final_numbers = [f.invoice_number for f in fin_list if f.invoice_number]
                if final_ids or final_numbers:
                    storno_qs = Invoice.objects.filter(
                        models.Q(notes__icontains='sztornó') | models.Q(notes__icontains='sztorno')
                    )
                    by_orig = set(storno_qs.filter(original_invoice_id__in=final_ids).values_list('original_invoice_id', flat=True))
                    by_ref_numbers = set(storno_qs.filter(order_reference__in=final_numbers).values_list('order_reference', flat=True))
                    ref_id_map = dict(Invoice.objects.filter(id__in=final_ids).values_list('invoice_number', 'id'))
                    by_ref_ids = {ref_id_map.get(num) for num in by_ref_numbers if num in ref_id_map}
                    already_ids = set([i for i in by_orig if i]) | set([i for i in by_ref_ids if i])
                    if already_ids:
                        finals_qs = finals_qs.exclude(id__in=list(already_ids))
                for finv in finals_qs:
                    st = create_storno_for(finv)
                    created_ids.append(str(st.id))
                # Prevent serializer from cascading back again
                st_adv = create_storno_for(inv, ctx_extra={'skip_advance_cascade': True})
                created_ids.append(str(st_adv.id))
            else:
                # Only create storno for the FINAL invoice itself; allocations are reversed in serializer
                st = create_storno_for(inv)
                created_ids.append(str(st.id))
        return Response({'created_storno_ids': created_ids})

    def perform_create(self, serializer):
        user = self.request.user if getattr(self.request.user, 'is_authenticated', False) else None
        serializer.save(created_by=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_create(serializer)
        except Exception as e:
            logger.exception("Invoice create error")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        headers = {}
        # Auto-submit to NAV right after create (best-effort)
        try:
            _ = self.submit_to_nav(request, pk=str(serializer.instance.id))
            try:
                serializer.instance.refresh_from_db()
            except Exception:
                pass
        except Exception:
            pass
        # Use read serializer to return the created invoice
        return Response(InvoiceSerializer(serializer.instance).data, status=status.HTTP_201_CREATED, headers=headers)
    @action(detail=True, methods=['post'])
    def send_email(self, request, pk=None):
        import sys, datetime
        def log(msg):
            ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"[DEBUG {ts}] {msg}")
            sys.stdout.flush()
        
        log(f"send_email called for pk={pk}") 
        """Send invoice PDF via email. Expects JSON: { to: [..], cc: [..], subject, body }.
        SMTP settings are read from environment variables for now:
          SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_USE_TLS (1/0), SMTP_FROM
        Optionally copy to IMAP Sent if IMAP_* envs provided.
        """
        import io, smtplib, ssl, imaplib, email
        from email.message import EmailMessage
        from django.template.loader import render_to_string
        try:
            from weasyprint import HTML, CSS
        except Exception:
            HTML = None

        inv = self.get_object()
        print(f"DEBUG: Invoice fetched: {inv.invoice_number}")
        data = request.data or {}
        to = data.get('to') or []
        cc = data.get('cc') or []
        bcc = data.get('bcc') or []
        reply_to = data.get('reply_to') or None
        subject = data.get('subject') or f"Számla {inv.invoice_number}"
        body = data.get('body')
        body_from_request = bool(body)
        if not body:
            try:
                company = inv.company
                customer = inv.customer
                row = f"{inv.invoice_number}\t{inv.issue_date}\t{float(inv.total_net_amount):,.0f} (HUF)\t{float(inv.total_vat_amount):,.0f} (HUF)".replace(',', ' ').replace('\xa0',' ')
                lines = [
                    f"Tisztelt {getattr(customer, 'name', 'Ügyfelünk')}!",
                    "",
                    "Mellékelve küldöm az alábbi számlát/számlákat:",
                    "",
                    "Számla sorszám\tKelt\tNetto(HUF)\tÁfa(HUF)",
                    row,
                    "",
                    "Kérem nyomtassa ki és továbbítsa könyvelőjének.",
                    "",
                    "A küldött számla nem E-számla, a befogadónak a kinyomtatott, papír alapú számlát kell könyvelésében rögzítenie, tárolnia.",
                    "",
                    "A számlák aláírás és pecsét nélkül is érvényes!",
                    "--",
                    "Üdvözlettel,",
                    getattr(getattr(request, 'user', None), 'get_full_name', lambda: '')() or '',
                    getattr(getattr(request, 'user', None), 'phone', ''),
                    getattr(company, 'website', ''),
                    getattr(company, 'short_name', None) or getattr(company, 'name', ''),
                    ", ".join(filter(None, [getattr(company, 'postal_code', ''), getattr(company, 'city', ''), " ".join(filter(None, [getattr(company, 'street_name', ''), getattr(company, 'street_number', '')]))])),
                    getattr(company, 'full_tax_number', None) or getattr(company, 'tax_number', ''),
                ]
                body = "\n".join(lines)
            except Exception:
                body = "Küldjük a számlát PDF csatolmányként."

        if not to:
            try:
                if inv.customer and inv.customer.email:
                    to = [inv.customer.email]
            except Exception:
                pass
        if not to:
            return Response({'error': 'Nincs címzett megadva'}, status=status.HTTP_400_BAD_REQUEST)

        # Re-fetch inv to ensure we have all data for the V2 template
        inv = Invoice.objects.select_related(
            'company', 'customer', 'invoice_block'
        ).prefetch_related(
            'items', 'items__vat_type', 'company__bank_accounts', 'advance_allocations_as_final'
        ).get(pk=inv.pk)

        pdf_buf = io.BytesIO()
        log("Starting PDF generation...")
        
        pdf_bytes = _generate_pdf_bytes_v2(inv)
        if pdf_bytes:
            pdf_buf.write(pdf_bytes)
        else:
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import A4
            c = canvas.Canvas(pdf_buf, pagesize=A4)
            w, h = A4
            c.setFont("Helvetica-Bold", 14)
            c.drawString(40, h-50, f"Számla: {inv.invoice_number}")
            c.setFont("Helvetica", 11)
            c.drawString(40, h-70, f"Kibocsátás: {inv.issue_date}")
            c.drawString(40, h-85, f"Vevő: {getattr(inv.customer, 'name', '')}")
            c.drawString(40, h-100, f"Összeg (bruttó): {float(inv.total_gross_amount):,.2f} {inv.currency}")
            c.showPage()
            c.save()
        log("PDF generation finished.")

        pdf_buf.seek(0)

        msg = EmailMessage()
        # If invoice currency is FX and EN templates exist, append/compose bilingual subject/body
        try:
            ces = getattr(inv.company, 'email_settings', None)
        except Exception:
            ces = None
        if (inv.currency or '').upper() != 'HUF' and ces:
            def fill(t):
                return (t or '').replace('{invoice_number}', inv.invoice_number or '').replace('{customer_name}', getattr(inv.customer, 'name', '')).replace('{company_name}', getattr(inv.company, 'name', ''))
        # Bilingual extension (Single Invoice)
        is_fx = (inv.currency or '').upper() != 'HUF'
        if is_fx and ces:
            en_subj = fill(getattr(ces, 'subject_template_en', None)) or f"Invoice {inv.invoice_number}"
            if subject and en_subj and en_subj not in subject:
                subject = f"{en_subj} / {subject}"
            if not body_from_request and getattr(ces, 'body_template_en', None):
                 # Auto-generated body: Prepend English
                 body = fill(ces.body_template_en) + "<br><br><hr><br><br>" + body
        msg['Subject'] = subject

        # ces already resolved above

        # Thunderbird compose mode?
        use_th = bool(data.get('use_thunderbird')) or bool(getattr(ces, 'use_thunderbird', False))
        if use_th:
            # Build a compose command
            try:
                import subprocess
                tb_path = data.get('thunderbird_path') or getattr(ces, 'thunderbird_path', None) or 'thunderbird'
                # Craft body and subject for URI
                compose = {
                    'to': ','.join(to),
                    'cc': ','.join(cc) if cc else None,
                    'bcc': ','.join(bcc) if bcc else None,
                    'subject': subject,
                    'body': body,
                    # Attach as URL to our PDF endpoint
                    'attachment': request.build_absolute_uri(f"/api/invoices/{str(inv.id)}/pdf/")
                }
                # Remove None
                compose = {k: v for k, v in compose.items() if v}
                def esc(v: str) -> str:
                    return v.replace("'", "\\'")
                parts = [f"{k}='{esc(v)}'" for k, v in compose.items()]
                arg = ','.join(parts)
                cmd = [tb_path, '-compose', arg]
                subprocess.Popen(cmd)
                return Response({'success': True, 'mode': 'thunderbird'})
            except Exception as e:
                return Response({'error': f'Thunderbird indítási hiba: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        from_addr = (data.get('from') or '').strip() or (ces.smtp_from if ces and ces.smtp_from else None) or os.environ.get('SMTP_FROM') or os.environ.get('SMTP_USER')
        if not from_addr:
            return Response({'error': 'SMTP_FROM vagy SMTP_USER nincs beállítva'}, status=status.HTTP_400_BAD_REQUEST)

        msg['From'] = from_addr
        msg['To'] = ', '.join(to)
        if cc:
            msg['Cc'] = ', '.join(cc)
        if bcc:
            msg['Bcc'] = ', '.join(bcc)
        if reply_to:
            msg['Reply-To'] = reply_to
        # Append default sender signature if provided in settings and not already present
        if ces:
            sig_lines = []
            if getattr(ces, 'default_sender_name', None):
                sig_lines.append(str(ces.default_sender_name))
            if getattr(ces, 'default_sender_phone', None):
                sig_lines.append(str(ces.default_sender_phone))
            if sig_lines and (body or '').find('--') == -1:
                body = (body or '') + "<br><br>--<br>" + "<br>".join(sig_lines)
        
        # Determine if body is HTML (simple check)
        is_html = (body and ('<' in body and '>' in body))
        if is_html:
            msg.set_content("HTML-only e-mail") # Fallback
            msg.add_alternative(body, subtype='html')
        else:
            msg.set_content(body)

        cust_name = getattr(inv.customer, 'name', '') or ''
        cust_prefix = cust_name[:5] or 'Client'
        filename = f"{cust_prefix}_{inv.invoice_number or 'szamla'}.pdf"
        msg.add_attachment(pdf_buf.read(), maintype='application', subtype='pdf', filename=filename)

        # SMTP settings resolution: Company Settings -> Env SMTP_* -> Env EMAIL_*
        host = (ces.smtp_host if ces and ces.smtp_host else None) or os.environ.get('SMTP_HOST') or os.environ.get('EMAIL_HOST')
        port = int((ces.smtp_port if ces and ces.smtp_port else None) or os.environ.get('SMTP_PORT') or os.environ.get('EMAIL_PORT') or 587)
        user = (ces.smtp_user if ces and ces.smtp_user else None) or os.environ.get('SMTP_USER') or os.environ.get('EMAIL_HOST_USER')
        pwd = (ces.smtp_password if ces and ces.smtp_password else None) or os.environ.get('SMTP_PASSWORD') or os.environ.get('EMAIL_HOST_PASSWORD')
        
        # TLS: Company Settings -> Env SMTP_USE_TLS -> Default True
        if ces and ces.smtp_use_tls is not None:
             use_tls = bool(ces.smtp_use_tls)
        else:
             use_tls = (os.environ.get('SMTP_USE_TLS', '1') == '1') or (os.environ.get('EMAIL_USE_TLS', '1') == '1')

        log(f"SMTP Configuration: Host={host}, Port={port}, User={user}, TLS={use_tls}")
        if not host or not user or not pwd:
            log("Missing SMTP settings")
            return Response({'error': 'SMTP beállítások hiányoznak (HOST/USER/PASSWORD)'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            log("Connecting to SMTP server...")
            if port == 465:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(host, port, context=context) as server:
                    log("Logging in (SSL)...")
                    server.login(user, pwd)
                    log("Sending message...")
                    server.send_message(msg)
            elif use_tls:
                context = ssl.create_default_context()
                with smtplib.SMTP(host, port) as server:
                    # server.set_debuglevel(1)
                    log("Executing STARTTLS...")
                    server.starttls(context=context)
                    log("Logging in...")
                    server.login(user, pwd)
                    log("Sending message...")
                    server.send_message(msg)
            else:
                with smtplib.SMTP(host, port) as server:
                    log("Logging in (no TLS)...")
                    server.login(user, pwd)
                    log("Sending message...")
                    server.send_message(msg)
            log("SMTP send clean success.")
        except Exception as e:
            log(f"SMTP Error: {e}")
            import traceback
            traceback.print_exc()
            return Response({'error': f'E-mail küldési hiba: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        log("Checking IMAP...")
        try:
            imap_host = (ces.imap_host if ces and ces.imap_host else None) or os.environ.get('IMAP_HOST')
            imap_user = (ces.imap_user if ces and ces.imap_user else None) or os.environ.get('IMAP_USER') or user
            imap_pwd = (ces.imap_password if ces and ces.imap_password else None) or os.environ.get('IMAP_PASSWORD') or pwd
            imap_port = int((ces.imap_port if ces and getattr(ces, 'imap_port', None) else None) or os.environ.get('IMAP_PORT') or 993)
            sent_folder = (ces.imap_sent_folder if ces and ces.imap_sent_folder else None) or os.environ.get('IMAP_SENT_FOLDER') or 'Sent'
            if imap_host and imap_user and imap_pwd:
                log(f"Connecting to IMAP {imap_host}")
                raw = msg.as_bytes()
                # Connect with SSL or STARTTLS fallbacks
                try:
                    M = imaplib.IMAP4_SSL(imap_host, imap_port)
                except Exception:
                    try:
                        M = imaplib.IMAP4(imap_host, 143)
                        M.starttls(ssl_context=ssl.create_default_context())
                    except Exception:
                        M = imaplib.IMAP4(imap_host)
                M.login(imap_user, imap_pwd)
                # Validate configured folder, else try to detect a good Sent
                used_folder = sent_folder
                ok = False
                try:
                    typ_chk, _ = M.select(used_folder, readonly=True)
                    ok = (typ_chk == 'OK')
                except Exception:
                    ok = False
                if not ok:
                    try:
                        typ_list, boxes = M.list()
                        candidates = []
                        if typ_list == 'OK' and boxes:
                            import re as _re
                            for rawline in boxes:
                                s = rawline.decode(errors='ignore') if isinstance(rawline, (bytes, bytearray)) else str(rawline)
                                m_flags = _re.search(r"\(([^)]*)\)", s)
                                flags_txt = m_flags.group(1) if m_flags else ''
                                m_q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                                name = m_q[-1] if m_q else (s.split()[-1] if s.split() else '')
                                try:
                                    from imaplib import IMAP4
                                    name = IMAP4._decode_utf7(name)
                                except Exception:
                                    pass
                                if name in ('.','', 'NIL'):
                                    continue
                                if 'Noselect' in (flags_txt or '') or '\\Noselect' in (flags_txt or ''):
                                    continue
                                candidates.append({'name': name, 'flags': flags_txt})
                        # Prefer \Sent, else common names
                        cand = None
                        for mb in candidates:
                            if '\\Sent' in (mb['flags'] or ''):
                                cand = mb['name']
                                break
                        if not cand:
                            common = ['Sent','Sent Items','Sent Mail','Sent Messages','[Gmail]/Sent Mail','Elküldött','Elküldött levelek','Elküldött üzenetek','Küldött elemek']
                            lower = {mb['name'].lower(): mb['name'] for mb in candidates}
                            for cn in common:
                                if cn.lower() in lower:
                                    cand = lower[cn.lower()]
                                    break
                        if cand:
                            used_folder = cand
                    except Exception:
                        pass
                # Append with proper flags; with fallback create/variants on delimiter
                flags = '(\\Seen)'
                def _detect_delim(imap):
                    try:
                        typ0, boxes0 = imap.list('', '')
                        if typ0 == 'OK' and boxes0:
                            s = boxes0[0].decode(errors='ignore') if isinstance(boxes0[0], (bytes, bytearray)) else str(boxes0[0])
                            import re as _re
                            q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                            if len(q) >= 2:
                                return q[-2]
                    except Exception:
                        pass
                    try:
                        typ1, boxes1 = imap.list()
                        if typ1 == 'OK' and boxes1:
                            s = boxes1[0].decode(errors='ignore') if isinstance(boxes1[0], (bytes, bytearray)) else str(boxes1[0])
                            import re as _re
                            q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                            if len(q) >= 2:
                                return q[-2]
                    except Exception:
                        pass
                    return None
                def _try_create_and_append(imap, mailbox):
                    try:
                        typ_app, _ = imap.append(mailbox, flags, None, raw)
                        if typ_app == 'OK':
                            return True
                    except Exception:
                        pass
                    try:
                        try:
                            imap.create(mailbox)
                        except Exception:
                            pass
                        try:
                            # subscribe is optional; ignore failures
                            imap.subscribe(mailbox)
                        except Exception:
                            pass
                        typ_app2, _ = imap.append(mailbox, flags, None, raw)
                        return typ_app2 == 'OK'
                    except Exception:
                        return False
                try:
                    if not _try_create_and_append(M, used_folder):
                        delim = _detect_delim(M) or '.'
                        variants = []
                        base = used_folder
                        if delim not in (None, '', 'NIL'):
                            variants.extend([
                                f'INBOX{delim}{base}',
                                f'Sent{delim}{base}',
                                f'Inbox{delim}{base}',
                            ])
                        for v in variants:
                            if _try_create_and_append(M, v):
                                break
                except Exception as e:
                    log(f"IMAP save/append error: {e}")
                finally:
                    M.logout()
        except Exception as e:
            log(f"IMAP save error (general): {e}")

        return Response({'success': True})

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        import io
        from django.http import HttpResponse
        from django.template.loader import render_to_string
        try:
            from weasyprint import HTML
        except Exception as e:
            print(f"WeasyPrint import error: {e}")
            HTML = None
        
        # Fetch invoice with all related data
        inv = Invoice.objects.select_related(
            'company', 'customer', 'invoice_block'
        ).prefetch_related(
            'items', 'items__vat_type', 'company__bank_accounts'
        ).get(pk=pk)

        # Calculate VAT summary for the print view
        from collections import defaultdict
        # Key: (rate_value, label_string)
        vat_map = defaultdict(lambda: {'net': 0, 'vat': 0, 'gross': 0, 'rate': 0, 'label': ''})
        
        for item in inv.items.all():
             r = item.vat_rate
             vt = item.vat_type
             
             # Determine grouping key and display label
             if vt and vt.category != 'PERCENT':
                 # Special VAT types (AAM, TAM, etc.) get their own row by code
                 # For the summary table, user wants the VALUE (percentage) or Name if no percentage?
                 # Actually user said: "Az Áfa-nál ne az Áfa neve legyen, hanem az értéke."
                 # This implies for special VAT types, we should show "0%" or whatever the value is, not "AAM".
                 # But usually AAM means 0% effectively but legally distinct.
                 # If the request means "Use the percentage numbers always", then for AAM/TAM it is usually 0.
                 # However, if we group by (rate, label), we might split them incorrectly if we change label.
                 # Let's adjust: display logic in template? No, the user wants the VAT COLUMN in SUMMARY to show VALUE.
                 
                 # Current logic: label = vt.code (e.g. "AAM")
                 # New logic requested: "Az Áfa-nál ne az Áfa neve legyen, hanem az értéke."
                 # This likely means "0%" for AAM.
                 
                 # If percentage is set on VATType, use it. Else default to rate.
                 eff_rate = vt.percentage if vt.percentage is not None else r
                 if eff_rate % 1 == 0:
                     label = f"{int(eff_rate)}%"
                 else:
                     label = f"{eff_rate}%"
                 
                 # We still group by code to keep accounting separate?
                 # Or do we group by rate now? If "AAM" (0%) and "TAM" (0%) are both 0%, should they merge?
                 # Usually they shouldn't merge in accounting, but if the printout just says "0%", it looks weird if there are two "0%" rows.
                 # The user request is visual: "show value".
                 # Let's keep separate grouping but change the display label.
                 key = (r, vt.code) # Keep unique key to avoid merging unlike types
             else:
                 # Standard percentage
                 # We group strictly by rate, label is just formatted rate
                 if r % 1 == 0:
                     l_str = f"{int(r)}%"
                 else:
                     l_str = f"{r}%"
                 key = (r, 'PERCENT')
                 label = l_str

             vat_map[key]['rate'] = r
             vat_map[key]['label'] = label
             vat_map[key]['net'] += item.net_amount
             vat_map[key]['vat'] += item.vat_amount
             vat_map[key]['gross'] += item.gross_amount
             
        vat_summary = sorted(vat_map.values(), key=lambda x: x['rate'])
        
        # Calculate HUF totals if needed
        huf_totals = None
        if (inv.currency or '').upper() != 'HUF':
             ex = inv.exchange_rate or 1
             huf_totals = {
                 'net': inv.total_net_amount * ex,
                 'vat': inv.total_vat_amount * ex,
                 'gross': inv.total_gross_amount * ex
             }

        # Calculate advances first
        advances_sum = 0
        if hasattr(inv, 'advance_allocations_as_final'):
             advances_sum = sum([a.amount for a in inv.advance_allocations_as_final.all()])
        
        # Rounding logic for HUF Cash/COD
        rounding_diff = 0
        payable_amount = inv.total_gross_amount - advances_sum
        
        if (inv.currency or 'HUF') == 'HUF' and inv.payment_method in ['cash', 'cod']:
             try:
                 from decimal import Decimal, ROUND_HALF_UP
                 gross = Decimal(str(payable_amount))
                 d_5 = Decimal(5)
                 rounded = (gross / d_5).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * d_5
                 rounding_diff = rounded - gross
                 payable_amount = rounded
             except Exception:
                 pass
        
        amount_words = get_amount_words_hu(payable_amount, inv.currency or 'HUF')

        pdf_buf = io.BytesIO()
        if HTML:
            try:
                ctx = { 
                    'invoice': inv, 
                    'bilingual': (inv.currency or '').upper() != 'HUF',
                    'block': inv.invoice_block,
                    'vat_summary': vat_summary,
                    'huf_totals': huf_totals,
                    'rounding_diff': rounding_diff,
                    'payable_amount': payable_amount,
                    'amount_words': amount_words
                }
                html = render_to_string('invoices/print_invoice_v2.html', ctx)
                HTML(string=html).write_pdf(target=pdf_buf)
            except Exception as e:
                print(f"WeasyPrint PDF generation error: {e}")
                import traceback
                traceback.print_exc()
                # Fallback to reportlab
                HTML = None
                pdf_buf = io.BytesIO()
        
        if not HTML or pdf_buf.tell() == 0:
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import A4
            c = canvas.Canvas(pdf_buf, pagesize=A4)
            w, h = A4
            c.setFont("Helvetica-Bold", 14)
            c.drawString(40, h-50, f"Számla: {inv.invoice_number}")
            c.setFont("Helvetica", 11)
            c.drawString(40, h-70, f"Kibocsátás: {inv.issue_date}")
            c.drawString(40, h-85, f"Vevő: {getattr(inv.customer, 'name', '')}")
            c.drawString(40, h-100, f"Összeg (bruttó): {float(inv.total_gross_amount):,.2f} {inv.currency}")
            c.showPage(); c.save()
        pdf_buf.seek(0)
        resp = HttpResponse(pdf_buf.read(), content_type='application/pdf')
        
        cust_name = getattr(inv.customer, 'name', '') or ''
        cust_prefix = cust_name[:5] or 'Client'
        filename = f"{cust_prefix}_{inv.invoice_number or 'szamla'}.pdf"
        resp['Content-Disposition'] = f'inline; filename="{filename}"'
        return resp

    @action(detail=True, methods=['post'])
    def draft_eml(self, request, pk=None):
        """Build an EML draft with the invoice PDF attached and return it for download."""
        import io
        from email.message import EmailMessage
        from django.http import HttpResponse
        from django.template.loader import render_to_string
        try:
            from weasyprint import HTML
        except Exception:
            HTML = None

        inv = self.get_object()
        data = request.data or {}
        to = data.get('to') or []
        cc = data.get('cc') or []
        bcc = data.get('bcc') or []
        subject = (data.get('subject') or f"Számla {inv.invoice_number}").strip()
        body = data.get('body') or ''

        msg = EmailMessage()
        if to: msg['To'] = ', '.join(to)
        if cc: msg['Cc'] = ', '.join(cc)
        if bcc: msg['Bcc'] = ', '.join(bcc)
        msg['Subject'] = subject
        msg.set_content(body or 'Küldjük a számlát PDF csatolmányként.')

        pdf_buf = io.BytesIO()
        if HTML:
            html = render_to_string('invoices/print_invoice_v2.html', {
                'invoice': inv,
                'bilingual': (inv.currency or '').upper() != 'HUF',
            })
            HTML(string=html).write_pdf(target=pdf_buf)
        else:
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import A4
            c = canvas.Canvas(pdf_buf, pagesize=A4)
            w, h = A4
            c.setFont("Helvetica-Bold", 14)
            c.drawString(40, h-50, f"Számla: {inv.invoice_number}")
            c.setFont("Helvetica", 11)
            c.drawString(40, h-70, f"Kibocsátás: {inv.issue_date}")
            c.drawString(40, h-85, f"Vevő: {getattr(inv.customer, 'name', '')}")
            c.drawString(40, h-100, f"Összeg (bruttó): {float(inv.total_gross_amount):,.2f} {inv.currency}")
            c.showPage(); c.save()
        pdf_buf.seek(0)
        filename = f"{inv.invoice_number or 'szamla'}.pdf"
        msg.add_attachment(pdf_buf.read(), maintype='application', subtype='pdf', filename=filename)

        raw = msg.as_bytes()
        resp = HttpResponse(raw, content_type='message/rfc822')
        resp['Content-Disposition'] = f'attachment; filename="invoice_{inv.invoice_number or inv.id}.eml"'
        return resp

    @action(detail=False, methods=['post'])
    def draft_bulk_eml(self, request):
        """Build an EML draft for multiple invoices with PDFs attached and return it for download."""
        import io
        from email.message import EmailMessage
        from django.http import HttpResponse
        from django.template.loader import render_to_string
        try:
            from weasyprint import HTML
        except Exception:
            HTML = None

        data = request.data or {}
        ids = data.get('invoice_ids') or []
        if not isinstance(ids, list) or not ids:
            return Response({'error': 'Nincs kiválasztott számla'}, status=status.HTTP_400_BAD_REQUEST)
        from invoices.models import Invoice
        invoices = list(Invoice.objects.filter(id__in=ids).select_related('customer', 'company'))
        if not invoices:
            return Response({'error': 'Nem találhatók a kiválasztott számlák'}, status=status.HTTP_404_NOT_FOUND)

        to = data.get('to') or []
        cc = data.get('cc') or []
        bcc = data.get('bcc') or []
        subject = (data.get('subject') or '').strip() or (f"Számlák: {', '.join([inv.invoice_number for inv in invoices])}" if len(invoices)>1 else f"Számla {invoices[0].invoice_number}")
        body = data.get('body') or 'Küldjük a számlákat PDF csatolmányként.'

        msg = EmailMessage()
        if to: msg['To'] = ', '.join(to)
        if cc: msg['Cc'] = ', '.join(cc)
        if bcc: msg['Bcc'] = ', '.join(bcc)
        msg['Subject'] = subject
        msg.set_content(body)

        for inv in invoices:
            try:
                pdf_buf = io.BytesIO()
                if HTML:
                    html = render_to_string('invoices/print_invoice.html', {
                        'invoice': inv,
                        'bilingual': (inv.currency or '').upper() != 'HUF',
                    })
                    HTML(string=html).write_pdf(target=pdf_buf)
                else:
                    from reportlab.pdfgen import canvas
                    from reportlab.lib.pagesizes import A4
                    c = canvas.Canvas(pdf_buf, pagesize=A4)
                    w, h = A4
                    c.setFont("Helvetica-Bold", 14)
                    c.drawString(40, h-50, f"Számla: {inv.invoice_number}")
                    c.setFont("Helvetica", 11)
                    c.drawString(40, h-70, f"Kibocsátás: {inv.issue_date}")
                    c.drawString(40, h-85, f"Vevő: {getattr(inv.customer, 'name', '')}")
                    c.drawString(40, h-100, f"Összeg (bruttó): {float(inv.total_gross_amount):,.2f} {inv.currency}")
                    c.showPage(); c.save()
                pdf_buf.seek(0)
                filename = f"{inv.invoice_number or 'szamla'}.pdf"
                msg.add_attachment(pdf_buf.read(), maintype='application', subtype='pdf', filename=filename)
            except Exception:
                continue

        raw = msg.as_bytes()
        resp = HttpResponse(raw, content_type='message/rfc822')
        title_ids = invoices[0].invoice_number if len(invoices)==1 else f"{len(invoices)}_db"
        resp['Content-Disposition'] = f'attachment; filename="invoices_{title_ids}.eml"'
        return resp

    @action(detail=False, methods=['post'])
    def send_bulk_email(self, request):
        """Send multiple invoices in one email (attachments) or open Thunderbird compose.
        Constraints: all invoices must belong to the same company.
        """
        import io, os, threading
        
        # Initial validation & Data prep
        data = request.data or {}
        ids = data.get('invoice_ids') or []
        if not isinstance(ids, list) or not ids:
            return Response({'error': 'Nincs kiválasztott számla'}, status=status.HTTP_400_BAD_REQUEST)

        from invoices.models import Invoice
        # We only strictly need IDs and check company consistency here
        # Full loading happens in thread
        invoices = list(Invoice.objects.filter(id__in=ids).select_related('customer', 'company'))
        if not invoices:
            return Response({'error': 'Nem találhatók a kiválasztott számlák'}, status=status.HTTP_404_NOT_FOUND)
        
        companies = {inv.company_id for inv in invoices if getattr(inv, 'company_id', None)}
        if len(companies) != 1:
            return Response({'error': 'A számláknak ugyanahhoz a céghez kell tartozniuk'}, status=status.HTTP_400_BAD_REQUEST)

        company = invoices[0].company
        ces = getattr(company, 'email_settings', None)

        # Recipients
        to = data.get('to') or []
        cc = data.get('cc') or []
        bcc = data.get('bcc') or []
        if not to:
            cust_ids = {inv.customer_id for inv in invoices}
            if len(cust_ids) == 1 and invoices[0].customer and getattr(invoices[0].customer, 'email', None):
                to = [invoices[0].customer.email]
        if not to:
             return Response({'error': 'Nincs címzett megadva'}, status=status.HTTP_400_BAD_REQUEST)

        # Subject logic
        subject = (data.get('subject') or '').strip()
        
        # Body logic
        body = data.get('body')
        body_from_request = bool(body)
        
        from django.template import Template, Context
        def fill(tpl_str, ctx_dict):
             try:
                 return Template(tpl_str).render(Context(ctx_dict))
             except: return tpl_str

        if not body:
             try:
                rows = []
                for inv in invoices:
                    # User request: "keltezés dátum - sorszám"
                    # e.g. 2023-10-25 - 2023/00123
                    row = f"{inv.issue_date} - {inv.invoice_number}"
                    rows.append(row)
                
                customer = invoices[0].customer
                header = [
                    f"Tisztelt {getattr(customer, 'name', 'Ügyfelünk')}!",
                    "",
                    "Mellékelve küldöm az alábbi számlákat:",
                    "",
                ]
                footer = [
                    "",
                    "Kérem nyomtassa ki és továbbítsa könyvelőjének.",
                    "",
                    "A küldött számla nem E-számla, a befogadónak a kinyomtatott, papír alapú számlát kell könyvelésében rögzítenie, tárolnia.",
                    "",
                    "A számlák aláírás és pecsét nélkül is érvényes!",
                ]
                body = "\n".join(header + rows + footer)
             except Exception:
                 body = None
        
        if not body and ces and getattr(ces, 'default_body_template', None):
            body = fill(ces.default_body_template, {'invoice': invoices[0], 'customer': invoices[0].customer})
            
        if not body:
            body = 'Küldjük a számlákat PDF csatolmányként.'

        # Bilingual extensions
        any_fx = any(((inv.currency or '').upper() != 'HUF') for inv in invoices)
        if any_fx and ces:
             en_subj = fill(getattr(ces, 'subject_template_en', None), {'invoice': invoices[0]}) or f"Invoice {invoices[0].invoice_number}"
             if not subject and invoices[0].invoice_number:
                 subject = f"Számla {invoices[0].invoice_number}"
             
             if en_subj and en_subj not in subject:
                 subject = f"{en_subj} / {subject}" if subject else en_subj
                 
             if not body_from_request and getattr(ces, 'body_template_en', None):
                 body = fill(ces.body_template_en, {'invoice': invoices[0]}) + "<br><br><hr><br><br>" + body

        if not subject:
            subject = f"Számla {invoices[0].invoice_number}"

        # Thunderbird logic - synchronous is fine
        use_th = bool(data.get('use_thunderbird')) or bool(getattr(ces, 'use_thunderbird', False))
        if use_th:
            try:
                import subprocess
                tb_path = data.get('thunderbird_path') or getattr(ces, 'thunderbird_path', None) or 'thunderbird'
                attachments = [request.build_absolute_uri(f"/api/invoices/{str(inv.id)}/pdf/") for inv in invoices]
                compose = {
                    'to': ','.join(to),
                    'cc': ','.join(cc) if cc else None,
                    'bcc': ','.join(bcc) if bcc else None,
                    'subject': subject,
                    'body': body,
                    'attachment': ','.join(attachments)
                }
                compose = {k: v for k, v in compose.items() if v}
                def esc(v: str) -> str:
                    return v.replace("'", "\\'")
                arg = ','.join([f"{k}='{esc(v)}'" for k, v in compose.items()])
                subprocess.Popen([tb_path, '-compose', arg])
                return Response({'success': True, 'mode': 'thunderbird'})
            except Exception as e:
                return Response({'error': f'Thunderbird indítási hiba: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # SMTP - Async Trigger
        host = (ces.smtp_host if ces and ces.smtp_host else None) or os.environ.get('SMTP_HOST') or os.environ.get('EMAIL_HOST')
        port = int((ces.smtp_port if ces and ces.smtp_port else None) or os.environ.get('SMTP_PORT') or os.environ.get('EMAIL_PORT') or 587)
        user = (ces.smtp_user if ces and ces.smtp_user else None) or os.environ.get('SMTP_USER') or os.environ.get('EMAIL_HOST_USER')
        pwd = (ces.smtp_password if ces and ces.smtp_password else None) or os.environ.get('SMTP_PASSWORD') or os.environ.get('EMAIL_HOST_PASSWORD')
        use_tls = bool(ces.smtp_use_tls) if ces and ces.smtp_use_tls is not None else (os.environ.get('SMTP_USE_TLS', '1') == '1')
        
        if not host or not user or not pwd:
            return Response({'error': 'SMTP beállítások hiányoznak (HOST/USER/PASSWORD)'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Imap config
        imap_host = (ces.imap_host if ces and ces.imap_host else None) or os.environ.get('IMAP_HOST')
        imap_user = (ces.imap_user if ces and ces.imap_user else None) or os.environ.get('IMAP_USER') or user
        imap_pwd = (ces.imap_password if ces and ces.imap_password else None) or os.environ.get('IMAP_PASSWORD') or pwd
        imap_port = int((ces.imap_port if ces and getattr(ces, 'imap_port', None) else None) or os.environ.get('IMAP_PORT') or 993)
        sent_folder = (ces.imap_sent_folder if ces and ces.imap_sent_folder else None) or os.environ.get('IMAP_SENT_FOLDER') or 'Sent'
        
        smtp_config = (host, port, user, pwd, use_tls)
        imap_config = (imap_host, imap_user, imap_pwd, imap_port, sent_folder)
        
        from_addr = (data.get('from') or '').strip() or (ces.smtp_from if ces and ces.smtp_from else None) or os.environ.get('SMTP_FROM') or os.environ.get('SMTP_USER')
        
        sig_lines = []
        if ces:
            if getattr(ces, 'default_sender_name', None):
                sig_lines.append(str(ces.default_sender_name))
            if getattr(ces, 'default_sender_phone', None):
                sig_lines.append(str(ces.default_sender_phone))

        t = threading.Thread(
            target=_send_bulk_email_thread,
            args=(ids, subject, body, from_addr, to, cc, bcc, smtp_config, imap_config, sig_lines)
        )
        t.start()
        
        return Response({'success': True, 'message': 'E-mail küldése folyamatban...'})


    @action(detail=True, methods=['post'])
    def submit_to_nav(self, request, pk=None):
        """Submit invoice to NAV using the best matching configuration.
        Resolution order:
          1) Invoice block's CompanyNAVConfiguration if present and active
          2) Company's active CompanyNAVConfiguration (prefer is_default)
          3) Global NAVConfiguration (legacy)
        """
        # When called as an action, DRF sets self.kwargs and get_object() works.
        # When called internally from create(), pk is passed but self.kwargs is empty.
        # Support both by preferring explicit pk lookup when provided.
        if pk:
            try:
                invoice = Invoice.objects.get(id=pk)
            except Invoice.DoesNotExist:
                return Response({'error': 'Számla nem található'}, status=status.HTTP_404_NOT_FOUND)
        else:
            invoice = self.get_object()

        try:
            nav_config = None

            # 1) Kötelező elsőbbség: a számlatömbhöz rendelt CompanyNAVConfiguration (ha aktív)
            try:
                block = invoice.invoice_block
                if block and block.nav_configuration and block.nav_configuration.is_active:
                    nav_config = block.nav_configuration
            except Exception:
                pass

            # 2) Ha nincs tömbhöz rendelt, akkor a számla cégének aktív CompanyNAVConfiguration-je (alapértelmezettet előnyben)
            if nav_config is None and getattr(invoice, 'company', None):
                from invoices.models import CompanyNAVConfiguration
                qs = CompanyNAVConfiguration.objects.filter(company=invoice.company, is_active=True)
                default_cfg = qs.filter(is_default=True).first()
                nav_config = default_cfg or qs.first()

            # 3) NINCS többé globális fallback; kötelező a céghez/tömbhöz rendelt aktív konfig
            if not nav_config:
                return Response(
                    {'error': 'Nincs aktív NAV konfiguráció ehhez a számlához. Állíts be aktív Company NAV konfigurációt a számlatömbhöz vagy a céghez.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Ha korábbi sikertelen beküldés volt, töröljük az előző transactionId-t új próbához
            try:
                if invoice.status == 'nav_rejected' and invoice.nav_transaction_id:
                    invoice.nav_transaction_id = None
                    invoice.save(update_fields=['nav_transaction_id'])
            except Exception:
                pass

            # Create NAV service and submit invoice
            nav_service = NAVService(nav_config)

            # 1) Token beszerzés
            token_result = nav_service.get_token()
            if not token_result.get('success'):
                return Response(
                    {'error': f"NAV token hiba: {token_result.get('error', 'ismeretlen hiba')}", 'response': token_result.get('response')},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 2) Számla beküldése (implementáción múlik; ha nincs, legalább a tokenig menjünk el)
            # Feltételezzük, hogy létezik egy submit_invoice metódus a NAVService-ben
            if hasattr(nav_service, 'submit_invoice'):
                result = nav_service.submit_invoice(invoice)
            else:
                result = token_result  # Csak tokenig jutottunk

            if result.get('success'):
                # Update invoice status
                invoice.status = 'submitted_to_nav'
                if 'transaction_id' in result:
                    invoice.nav_transaction_id = result['transaction_id']
                invoice.nav_submission_date = timezone.now()
                invoice.nav_response = result.get('response', '')
                invoice.save()

                # Beküldés után egy azonnali státuszlekérdezés
                status_info = None
                try:
                    polls = []
                    if invoice.nav_transaction_id:
                        # Első státusz lekérdezés
                        status_result = nav_service.query_transaction_status(invoice.nav_transaction_id)
                        processing = status_result.get('processing_status') or status_result.get('invoice_status')
                        polls.append({'processing_status': processing, 'status_code': status_result.get('status_code')})
                        # Rövid polling: ha még feldolgozás alatt, várjunk és próbáljuk meg újra
                        attempts = 2
                        delay_sec = 2
                        while processing in (None, 'PROCESSING') and attempts > 0:
                            time.sleep(delay_sec)
                            status_result = nav_service.query_transaction_status(invoice.nav_transaction_id)
                            processing = status_result.get('processing_status') or status_result.get('invoice_status')
                            polls.append({'processing_status': processing, 'status_code': status_result.get('status_code')})
                            attempts -= 1

                        status_info = {
                            'success': status_result.get('success'),
                            'status_code': status_result.get('status_code'),
                            'processing_status': processing,
                            'response': status_result.get('response'),
                            'polls': polls,
                        }
                        # Állapot frissítése a NAV feldolgozás alapján
                        if processing == 'DONE':
                            invoice.status = 'nav_processed'
                            invoice.save(update_fields=['status'])
                        elif processing in ('ABORTED', 'REJECTED', 'NOT_FOUND'):
                            invoice.status = 'nav_rejected'
                            invoice.save(update_fields=['status'])
                except Exception:
                    pass

                return Response({
                    'message': 'Számla beküldve a NAV-hoz',
                    'transaction_id': result.get('transaction_id'),
                    'response': result.get('response'),
                    'transaction_status': status_info,
                })
            else:
                # NAV azonnali hiba: jelöld a számlát elutasítottnak, hogy újraküldhető legyen
                invoice.status = 'nav_rejected'
                invoice.nav_response = result.get('response', '')
                invoice.save(update_fields=['status', 'nav_response'])
                return Response(
                    {
                        'error': result.get('error', 'NAV beküldési hiba'),
                        'error_message': result.get('error_message'),
                        'func_code': result.get('func_code'),
                        'response': result.get('response'),
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

        except Exception as e:
            logger.exception("Error submitting invoice to NAV")
            return Response(
                {'error': f'Error submitting invoice: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def nav_status(self, request, pk=None):
        """Check NAV submission status"""
        invoice = self.get_object()
        
        if not invoice.nav_transaction_id:
            return Response(
                {'error': 'Invoice not submitted to NAV'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Ugyanazzal a feloldási logikával válasszunk konfigot, mint beküldéskor
            nav_config = None
            try:
                block = invoice.invoice_block
                if block and block.nav_configuration and block.nav_configuration.is_active:
                    nav_config = block.nav_configuration
            except Exception:
                pass

            if nav_config is None and getattr(invoice, 'company', None):
                from invoices.models import CompanyNAVConfiguration
                qs = CompanyNAVConfiguration.objects.filter(company=invoice.company, is_active=True)
                default_cfg = qs.filter(is_default=True).first()
                nav_config = default_cfg or qs.first()

            if not nav_config:
                return Response(
                    {'error': 'Nincs aktív NAV konfiguráció ehhez a számlához'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            nav_service = NAVService(nav_config)
            result = nav_service.query_transaction_status(invoice.nav_transaction_id)
            # Frissítsük a számla státuszt a NAV feldolgozás alapján (processing_status vagy invoice_status)
            processing = result.get('processing_status') or result.get('invoice_status')
            if processing == 'DONE':
                invoice.status = 'nav_processed'
                invoice.save(update_fields=['status'])
            elif processing in ('ABORTED', 'REJECTED', 'NOT_FOUND'):
                invoice.status = 'nav_rejected'
                invoice.save(update_fields=['status'])

            return Response(result)
            
        except Exception as e:
            logger.error(f"Error checking NAV status: {str(e)}")
            return Response(
                {'error': f'Error checking status: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get invoice statistics"""
        queryset = self.get_queryset()
        
        total_amount = sum((invoice.total_gross_amount for invoice in queryset), 0)
        unpaid_amount = sum((invoice.total_gross_amount for invoice in queryset if invoice.status in ['draft', 'sent']), 0)

        # Ensure JSON-serializable numbers
        try:
            total_amount = float(total_amount)
        except Exception:
            total_amount = 0.0
        try:
            unpaid_amount = float(unpaid_amount)
        except Exception:
            unpaid_amount = 0.0

        stats = {
            'total_invoices': queryset.count(),
            'draft_invoices': queryset.filter(status='draft').count(),
            'sent_invoices': queryset.filter(status='sent').count(),
            'paid_invoices': queryset.filter(status='paid').count(),
            'total_amount': total_amount,
            'unpaid_amount': unpaid_amount,
        }
        
        return Response(stats)

    @action(detail=False, methods=['get'], url_path='incoming/details')
    def incoming_details(self, request):
        from invoices.models import IncomingInvoiceData, Company
        
        company_id = request.query_params.get('company_id')
        invoice_number = request.query_params.get('invoice_number')
        
        if not company_id or not invoice_number:
            return Response(
                {'error': 'company_id és invoice_number kötelező'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_404_NOT_FOUND)
            
        data = IncomingInvoiceData.objects.filter(company=company, invoice_number=invoice_number).first()
        
        if not data:
            # Ha nincs meg az adat, próbáljuk meg letölteni a NAV-tól valós időben
            try:
                from invoices.models import CompanyNAVConfiguration
                from invoices.nav_service import NAVService
                import xml.etree.ElementTree as ET
                import base64
                import gzip
                from io import BytesIO

                supplier_tax_number = request.query_params.get('supplier_tax_number')
                cfg = CompanyNAVConfiguration.objects.filter(company=company, is_active=True).first()
                
                if cfg:
                    ns_service = NAVService(cfg)
                    # Beszállítói adószám hasznos lehet a pontosításhoz
                    resp = ns_service.query_invoice_data('INBOUND', invoice_number, supplier_tax_number=supplier_tax_number)
                    
                    if resp.get('success') and resp.get('response'):
                        root = ET.fromstring(resp['response'])
                        
                        # Keresés namespace nélkül
                        invoice_data_el = None
                        compressed = False
                        
                        for elem in root.iter():
                            if elem.tag.endswith('invoiceData'):
                                invoice_data_el = elem
                            elif elem.tag.endswith('compressedContentIndicator'):
                                if elem.text and elem.text.lower() == 'true':
                                    compressed = True
                        
                        if invoice_data_el is not None and invoice_data_el.text:
                            raw_data = base64.b64decode(invoice_data_el.text)
                            if compressed:
                                with gzip.GzipFile(fileobj=BytesIO(raw_data)) as f:
                                    xml_content = f.read().decode('utf-8')
                            else:
                                xml_content = raw_data.decode('utf-8')
                            
                            # Mentés adatbázisba
                            data = IncomingInvoiceData.objects.create(
                                company=company,
                                invoice_number=invoice_number,
                                supplier_tax_number=supplier_tax_number or '', 
                                transaction_id='ON_DEMAND_FETCH',
                                xml_text=xml_content
                            )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to fetch invoice details on demand: {e}")

        if not data:
            return Response(
                {'error': 'Számla részletek nem találhatók'}, 
                status=status.HTTP_404_NOT_FOUND
            )
            
        return Response({
            'invoice_number': data.invoice_number,
            'supplier_tax_number': data.supplier_tax_number,
            'transaction_id': data.transaction_id,
            'xml_text': data.xml_text,
            'created_at': data.created_at
        })

    @action(detail=False, methods=['get'], url_path='incoming')
    def list_incoming(self, request):
        """List incoming invoices for a company from local DB, refreshing from NAV only when needed.
        Params: company_id, date_from (YYYY-MM-DD), date_to (YYYY-MM-DD), page (default 1), page_size (default 50)
        Logic:
        - If never refreshed or last refresh < now - 6h, refresh from NAV for the given date range and upsert digests.
        - Serve paginated results from DB to fill the table quickly.
        """
        from invoices.models import CompanyNAVConfiguration, IncomingInvoiceDigest, IncomingSyncState, Company
        import xml.etree.ElementTree as ET
        from django.utils import timezone
        from datetime import datetime
        from django.core.paginator import Paginator
        company_id = request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        page = int(request.query_params.get('page') or 1)
        page_size = int(request.query_params.get('page_size') or 50)
        search = (request.query_params.get('search') or '').strip()
        status_filter = (request.query_params.get('status') or '').strip().lower()
        payment_method_filter = (request.query_params.get('payment_method') or '').strip().lower()
        approval_filter = (request.query_params.get('approval') or '').strip().lower()
        amount_from = request.query_params.get('amount_from')
        amount_to = request.query_params.get('amount_to')
        today_date = timezone.now().date()

        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        # decide refresh
        import logging
        logger = logging.getLogger('invoices.incoming')
        sync, _ = IncomingSyncState.objects.get_or_create(company=company)
        # Perform refresh only if requested or stale: initial or older than 6h
        from datetime import timedelta
        refresh_param = (request.query_params.get('refresh') or '').strip().lower()
        force_refresh = refresh_param in ('1', 'true', 'yes')
        needs_refresh = False
        if force_refresh or not sync.last_refreshed_at:
            needs_refresh = True
        else:
            try:
                if timezone.now() - sync.last_refreshed_at > timedelta(hours=6):
                    needs_refresh = True
            except Exception:
                needs_refresh = True

        # If we have no local data for the requested range, force a backfill for that range
        from django.db.models import Q, F, Value, DecimalField
        from django.db.models.functions import Coalesce
        if date_from and date_to:
            has_any = IncomingInvoiceDigest.objects.filter(company=company).filter(
                Q(invoice_issue_date__gte=date_from, invoice_issue_date__lte=date_to) |
                Q(ins_date__date__gte=date_from, ins_date__date__lte=date_to)
            ).exists()
        else:
            has_any = IncomingInvoiceDigest.objects.filter(company=company).exists()

        try:
            logger.info(f"Incoming: needs_refresh={needs_refresh} has_any={has_any} range={date_from}..{date_to}")
        except Exception:
            pass

        did_refresh = False
        upsert_count = 0
        refresh_error = None
        backfill_all = (request.query_params.get('backfill_all') or '').strip().lower() in ('1','true','yes','all')
        stop_date_raw = (request.query_params.get('stop_date') or '').strip() or None
        if needs_refresh or not has_any:
            cfg = CompanyNAVConfiguration.objects.filter(company_id=company_id, is_active=True).order_by('-is_default').first()
            if not cfg:
                return Response({'error': 'Nincs aktív NAV konfiguráció a céghez'}, status=status.HTTP_400_BAD_REQUEST)
            nav_service = NAVService(cfg)

            # Determine fetch window: use explicit date range if provided, otherwise incremental by insDate from last refresh
            fetch_by_insdate = sync.last_refreshed_at is not None and has_any
            
            # If explicit date range provided, use it (by invoiceIssueDate)
            if date_from and date_to:
                fetch_by_insdate = False
                
            if fetch_by_insdate:
                # Automatic/Delta sync: use insDate (arrival date)
                # Overlap: look back 5 days from the last fetch to catch delayed items
                from datetime import timedelta
                start_time = sync.last_refreshed_at - timedelta(days=5)
                
                df = start_time.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
                dt = timezone.now().astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
                src_from, src_to = df, dt
                
                logger.info(f"Auto-sync incoming invoices (insDate): {src_from} -> {src_to} (with 5 days overlap)")
            else:
                if date_from and date_to:
                    # Manual sync incoming invoices (issueDate)
                    # Apply 5-day overlap (lookback) as requested, to verify slightly older invoices
                    try:
                        from datetime import datetime
                        d_start = datetime.strptime(date_from, '%Y-%m-%d').date() - timedelta(days=5)
                        src_from = d_start.strftime('%Y-%m-%d')
                    except Exception:
                        src_from = date_from
                    
                    src_to = date_to
                    logger.info(f"Manual sync incoming invoices (issueDate): {src_from} -> {src_to} (with 5 days overlap)")
                else:
                    # Default backfill: last 90 days by invoiceIssueDate
                    from datetime import timedelta
                    today = timezone.now().date()
                    df_date = (today - timedelta(days=90)).isoformat()
                    dt_date = today.isoformat()
                    src_from, src_to = df_date, dt_date

            # NAV only allows max 35-day intervals; chunk the requested range
            from datetime import timedelta, datetime as dt
            def _chunk_date_range(df_raw, dt_raw, max_days=35):
                spans = []
                try:
                    df_date = dt.fromisoformat(df_raw.split('T')[0]).date()
                    dt_date = dt.fromisoformat(dt_raw.split('T')[0]).date()
                except Exception:
                    return [(df_raw, dt_raw)]
                cur = df_date
                while cur <= dt_date:
                    end = min(cur + timedelta(days=max_days-1), dt_date)
                    spans.append((cur.isoformat(), end.isoformat()))
                    cur = end + timedelta(days=1)
                return spans or [(df_raw, dt_raw)]

            # If using datetime range (insDate), just clamp to 35 days
            use_datetime = ('T' in src_from) or ('T' in src_to)
            if use_datetime:
                try:
                    df_dt = dt.fromisoformat(src_from.replace('Z',''))
                    dt_dt = dt.fromisoformat(src_to.replace('Z',''))
                    if (dt_dt - df_dt).days > 35:
                        dt_dt = df_dt + timedelta(days=35)
                        src_to = dt_dt.isoformat().replace('+00:00','Z')
                except Exception:
                    pass
                spans = [(src_from, src_to)]
            else:
                spans = _chunk_date_range(src_from, src_to)

            def _fetch_span(span_from, span_to):
                nonlocal refresh_error, upsert_count
                window_new = 0
                nav_page = 1
                while True:
                    res = nav_service.query_invoice_digest('INBOUND', span_from, span_to, page=nav_page)
                    if not res.get('success'):
                        refresh_error = res.get('error_message') or res.get('error') or 'NAV lekérdezési hiba'
                        break
                    if not res.get('response'):
                        refresh_error = 'NAV üres válasz'
                        break
                    try:
                        root = ET.fromstring(res['response'])
                    except Exception:
                        refresh_error = 'NAV válasz XML feldolgozási hiba'
                        break
                    ns_api = '{http://schemas.nav.gov.hu/OSA/3.0/api}'
                    ns_base = '{http://schemas.nav.gov.hu/OSA/3.0/base}'

                    digests = root.findall(f'.//{ns_api}invoiceDigest') or []
                    try:
                        logger.info(f"Incoming: range {span_from}..{span_to} page {nav_page} found {len(digests)} digests")
                    except Exception:
                        pass
                    for d in digests:
                        child_map = {}
                        for c in list(d):
                            key = c.tag.split('}', 1)[-1]
                            child_map[key] = (c.text.strip() if c is not None and c.text else None)

                        inv_number = child_map.get('invoiceNumber') or child_map.get('originalInvoiceNumber') or child_map.get('transactionId')
                        if not inv_number:
                            try:
                                logger.info("Incoming: skip digest without identifier (no invoiceNumber/originalInvoiceNumber/transactionId)")
                            except Exception:
                                pass
                            continue

                        supplier_name = child_map.get('supplierName')
                        supplier_tax_id = child_map.get('supplierTaxNumber')
                        if not supplier_tax_id:
                            stn = d.find(f'{ns_api}supplierTaxNumber') or d.find('supplierTaxNumber')
                            if stn is not None:
                                ti = stn.find(f'{ns_base}taxpayerId') or stn.find('taxpayerId')
                                supplier_tax_id = (ti.text.strip() if (ti is not None and ti.text) else (stn.text.strip() if stn.text else None))

                        fields = {
                            'invoice_operation': child_map.get('invoiceOperation'),
                            'invoice_category': child_map.get('invoiceCategory'),
                            'invoice_issue_date': child_map.get('invoiceIssueDate') or None,
                            'invoice_delivery_date': child_map.get('invoiceDeliveryDate') or None,
                            # NAV digest may include paymentDueDate (preferred), occasionally dueDate, and sometimes only paymentDate
                            'due_date': (
                                child_map.get('paymentDueDate')
                                or child_map.get('dueDate')
                                or child_map.get('paymentDate')
                                or None
                            ),
                            'supplier_tax_number': supplier_tax_id,
                            'supplier_name': supplier_name,
                            'customer_tax_number': child_map.get('customerTaxNumber'),
                            'customer_name': child_map.get('customerName'),
                            'payment_method': child_map.get('paymentMethod'),
                            'payment_date': None,  # NAV digest paymentDate is due date; keep DB if any
                            'invoice_appearance': child_map.get('invoiceAppearance'),
                            'currency': child_map.get('currency'),
                            'invoice_net_amount': child_map.get('invoiceNetAmount'),
                            'invoice_vat_amount': child_map.get('invoiceVatAmount'),
                            'transaction_id': child_map.get('TransactionId') or child_map.get('transactionId'),
                            'index': int((child_map.get('index') or '1') or '1'),
                            'original_invoice_number': child_map.get('originalInvoiceNumber'),
                            'modification_index': int(child_map['modificationIndex']) if child_map.get('modificationIndex') else None,
                            'ins_date': child_map.get('insDate'),
                            'completeness_indicator': (child_map.get('completenessIndicator') == 'true'),
                        }

                        from django.utils.dateparse import parse_date, parse_datetime
                        if isinstance(fields['invoice_issue_date'], str):
                            fields['invoice_issue_date'] = parse_date(fields['invoice_issue_date'])
                        if isinstance(fields['invoice_delivery_date'], str):
                            fields['invoice_delivery_date'] = parse_date(fields['invoice_delivery_date'])
                        if isinstance(fields.get('due_date'), str):
                            fields['due_date'] = parse_date(fields['due_date'])
                        if isinstance(fields['ins_date'], str):
                            fields['ins_date'] = parse_datetime(fields['ins_date'])
                        from decimal import Decimal
                        for k in ('invoice_net_amount','invoice_vat_amount'):
                            try:
                                v = fields.get(k)
                                fields[k] = (Decimal(str(v)) if v is not None else None)
                            except Exception:
                                fields[k] = None

                        try:
                            logger.info(f"Incoming: upsert {inv_number} tx={fields.get('transaction_id')}")
                        except Exception:
                            pass
                        obj, created = IncomingInvoiceDigest.objects.get_or_create(
                            company=company,
                            invoice_number=inv_number,
                            transaction_id=fields['transaction_id'],
                            defaults=fields,
                        )
                        if (not created) and fields.get('due_date') and getattr(obj, 'due_date', None) != fields['due_date']:
                            obj.due_date = fields['due_date']
                            try:
                                obj.save(update_fields=['due_date'])
                            except Exception:
                                pass
                        if created:
                            upsert_count += 1
                            window_new += 1

                    cp = root.find(f'.//{ns_api}currentPage')
                    pc = root.find(f'.//{ns_api}pageCount')
                    try:
                        cur = int(cp.text) if (cp is not None and cp.text) else nav_page
                        total = int(pc.text) if (pc is not None and pc.text) else cur
                    except Exception:
                        cur = nav_page
                        total = nav_page
                    if cur >= total:
                        break
                    nav_page = cur + 1
                return window_new

            # Optional backward backfill (walk backwards until stop_date or empty windows)
            if backfill_all and not refresh_error:
                try:
                    from django.db.models import Min
                    earliest_issue = IncomingInvoiceDigest.objects.filter(company=company).aggregate(m=Min('invoice_issue_date'))['m']
                except Exception:
                    earliest_issue = None
                try:
                    stop_date = dt.fromisoformat(stop_date_raw).date() if stop_date_raw else None
                except Exception:
                    stop_date = None
                from datetime import date as _date
                today_date = timezone.now().date()
                cur_end = (earliest_issue - timedelta(days=1)) if earliest_issue else today_date
                empty_streak = 0
                window_counter = 0
                max_windows = 400
                while cur_end and window_counter < max_windows:
                    if stop_date and cur_end < stop_date:
                        break
                    cur_start = cur_end - timedelta(days=34)
                    if stop_date and cur_start < stop_date:
                        cur_start = stop_date
                    spans_back = _chunk_date_range(cur_start.isoformat(), cur_end.isoformat())
                    window_new = 0
                    for span_from, span_to in spans_back:
                        window_new += _fetch_span(span_from, span_to)
                        if refresh_error:
                            break
                    if refresh_error:
                        break
                    empty_streak = empty_streak + 1 if window_new == 0 else 0
                    cur_end = cur_start - timedelta(days=1)
                    window_counter += 1
                    if empty_streak >= 2:
                        break

            # Forward/default fetch for requested range
            for span_from, span_to in spans:
                _fetch_span(span_from, span_to)
                if refresh_error:
                    break

            if refresh_error:
                try:
                    logger.warning(f"Incoming: refresh failed: {refresh_error}")
                except Exception:
                    pass
            else:
                try:
                    logger.info(f"Incoming: upserted digests count={upsert_count} for range {src_from}..{src_to}")
                except Exception:
                    pass
                
                # FIX: Only update the global sync timestamp if we did a continuous incremental sync (fetch_by_insdate)
                # or if this was a default/full sync without restricting date ranges.
                # If we updated based on a manually filtered date range, we must NOT advance the global pointer,
                # as that would cause the system to skip the period between the previous sync and this custom range.
                if not (date_from and date_to):
                    sync.last_refreshed_at = timezone.now()
                    sync.save(update_fields=['last_refreshed_at'])
                elif fetch_by_insdate:
                    # Should not be reachable if (date_from and date_to) forces fetch_by_insdate=False, 
                    # but kept for logical completeness.
                    sync.last_refreshed_at = timezone.now()
                    sync.save(update_fields=['last_refreshed_at'])

                did_refresh = True

        # Serve from DB
        qs = IncomingInvoiceDigest.objects.filter(company=company).select_related('approved_by')
        if date_from and date_to:
            qs = qs.filter(
                Q(invoice_issue_date__gte=date_from, invoice_issue_date__lte=date_to)
                |
                Q(ins_date__date__gte=date_from, ins_date__date__lte=date_to)
            )
        elif date_from:
            qs = qs.filter(Q(invoice_issue_date__gte=date_from) | Q(ins_date__date__gte=date_from))
        elif date_to:
            qs = qs.filter(Q(invoice_issue_date__lte=date_to) | Q(ins_date__date__lte=date_to))
        # Search filter
        if search:
            qs = qs.filter(
                Q(invoice_number__icontains=search)
                |
                Q(supplier_name__icontains=search)
                |
                Q(supplier_tax_number__icontains=search)
            )

        # Amount filter
        if amount_from or amount_to:
            qs = qs.annotate(
                _total_gross=Coalesce(F('invoice_net_amount'), Value(0, output_field=DecimalField())) + Coalesce(F('invoice_vat_amount'), Value(0, output_field=DecimalField()))
            )
            if amount_from:
                try:
                    qs = qs.filter(_total_gross__gte=amount_from)
                except Exception:
                    pass
            if amount_to:
                try:
                    qs = qs.filter(_total_gross__lte=amount_to)
                except Exception:
                    pass

        # Payment method filter
        if payment_method_filter and payment_method_filter != 'all':
            qs = qs.filter(payment_method__iexact=payment_method_filter.upper())

        # Approval filter
        if approval_filter == 'approved':
            qs = qs.filter(is_approved=True)
        elif approval_filter == 'unapproved':
            qs = qs.filter(is_approved=False)

        # Paid/unpaid coarse filter in DB (due handled later)
        if status_filter == 'paid':
            qs = qs.filter(Q(payment_date__isnull=False) | ~Q(payment_method__iexact='TRANSFER'))
        elif status_filter in ('unpaid', 'due'):
            qs = qs.filter(Q(payment_method__iexact='TRANSFER') & Q(payment_date__isnull=True))

        ordered_qs = qs.order_by('-invoice_issue_date', '-ins_date')
        paginator = Paginator(ordered_qs, page_size)
        page_obj = paginator.get_page(page)
        page_items_raw = list(page_obj.object_list)

        # Aggregate payments per invoice for paid/partial/over checks (only current page items)
        if page_items_raw:
            q_pay = Q()
            for r in page_items_raw:
                q_pay |= (Q(invoice_number=r.invoice_number) & (Q(supplier_tax_number=r.supplier_tax_number) | Q(supplier_tax_number__isnull=True)))
            payment_aggs = PaymentBatchItem.objects.filter(batch__company=company).filter(q_pay).values('invoice_number', 'supplier_tax_number').annotate(
                total=Sum('amount_gross'),
                last_payment=Max('created_at'),
            )
        else:
            payment_aggs = []
        pay_map = {}
        for row in payment_aggs:
            key = f"{row.get('invoice_number') or ''}|{row.get('supplier_tax_number') or ''}"
            pay_map[key] = {
                'total': row.get('total'),
                'last_payment': row.get('last_payment'),
            }

        items_all = []

        # Helpers for due date extraction and on-demand NAV fetch
        def _parse_due_from_xml_text(xml_text: str):
            try:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(xml_text)
            except Exception:
                return None
            wanted = {'paymentduedate', 'duedate', 'paymentdate'}
            for el in root.iter():
                try:
                    tag_raw = el.tag.split('}', 1)[-1] if isinstance(el.tag, str) and '}' in el.tag else el.tag
                    tag = (tag_raw or '').lower()
                    if tag in wanted:
                        val = (el.text or '').strip()
                        if val:
                            return val
                except Exception:
                    continue
            return None

        def extract_due_date_from_cache(inv_number, supplier_tax_number=None):
            try:
                from invoices.models import IncomingInvoiceData
                q = IncomingInvoiceData.objects.filter(company=company, invoice_number=inv_number)
                if supplier_tax_number:
                    q = q.filter(supplier_tax_number=supplier_tax_number)
                cached = q.order_by('-updated_at').first()
                if (not cached or not cached.xml_text) and supplier_tax_number:
                    cached = IncomingInvoiceData.objects.filter(company=company, invoice_number=inv_number).order_by('-updated_at').first()
                if not cached or not cached.xml_text:
                    return None
                return _parse_due_from_xml_text(cached.xml_text)
            except Exception:
                return None

        fetched_due_cache = {}

        def fetch_due_date_from_nav(inv_number, supplier_tax_number=None, digest_index=None, allow_network=True):
            key = f"{inv_number}|{supplier_tax_number or ''}"
            if key in fetched_due_cache:
                return fetched_due_cache[key]
            try:
                from invoices.models import CompanyNAVConfiguration, IncomingInvoiceData, IncomingInvoiceDigest
                import base64, gzip, io
                cfg = CompanyNAVConfiguration.objects.filter(company=company, is_active=True).order_by('-is_default').first()
                if not cfg:
                    fetched_due_cache[key] = None
                    return None
                nav_service = NAVService(cfg)
                
                # Check Local DB (IncomingInvoiceData) again to be sure (already checked by caller usually, but let's be safe)
                # (Skipped as caller does it)

                if not allow_network:
                     fetched_due_cache[key] = None
                     return None

                def _decode_invoice_data(response_text: str):
                    try:
                        import xml.etree.ElementTree as ET
                        root = ET.fromstring(response_text)
                        def _find_any(root_el, local):
                            for el in root_el.iter():
                                tag = el.tag
                                if tag == local or (isinstance(tag, str) and tag.endswith('}'+local)):
                                    return el
                            return None
                        data_el = _find_any(root, 'invoiceDataResult') or root
                        inv_b64_el = _find_any(root, 'invoiceData') or (_find_any(data_el, 'invoiceData') if data_el is not None else None)
                        if inv_b64_el is not None and inv_b64_el.text:
                            raw = base64.b64decode(inv_b64_el.text)
                            try:
                                with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
                                    decoded = gz.read()
                            except OSError:
                                decoded = raw
                            return decoded.decode('utf-8', errors='replace')
                    except Exception:
                        return ''
                    return ''

                variants = [
                    (digest_index, supplier_tax_number),
                    (None, supplier_tax_number),
                    (digest_index, None),
                    (None, None),
                ]
                decoded_xml = ''
                for bi, stn in variants:
                    try:
                        res = nav_service.query_invoice_data('INBOUND', inv_number, stn, bi)
                        decoded_xml = _decode_invoice_data(res.get('response') or '')
                        if decoded_xml:
                            supplier_tax_number = stn or supplier_tax_number
                            break
                    except Exception:
                        continue
                if not decoded_xml:
                    fetched_due_cache[key] = None
                    return None

                due_val = _parse_due_from_xml_text(decoded_xml)
                try:
                    if decoded_xml:
                        IncomingInvoiceData.objects.update_or_create(
                            company=company,
                            invoice_number=inv_number,
                            supplier_tax_number=supplier_tax_number,
                            defaults={'xml_text': decoded_xml},
                        )
                        # Auto-register supplier
                        try:
                            customer, conflict = auto_register_or_update_supplier(company, decoded_xml)
                            if conflict:
                                logger.warning(f"Beszállító adatok eltérnek ({supplier_tax_number}): {conflict['differences']}")
                        except Exception as e:
                            logger.error(f"Hiba a beszállító auto-regisztráció során: {e}")
                except Exception:
                    pass

                if due_val:
                    try:
                        qs = IncomingInvoiceDigest.objects.filter(company=company, invoice_number=inv_number)
                        if supplier_tax_number:
                            qs = qs.filter(supplier_tax_number=supplier_tax_number)
                        if digest_index:
                            qs = qs.filter(index=digest_index)
                        qs.update(due_date=due_val)
                    except Exception:
                        pass
                fetched_due_cache[key] = due_val
                return due_val
            except Exception:
                fetched_due_cache[key] = None
                return None

        for r in page_items_raw:
            date_val = r.invoice_issue_date
            if not date_val and r.ins_date:
                try:
                    date_val = r.ins_date.date()
                except Exception:
                    date_val = None
            # Compute gross amount if possible
            gross_val = None
            try:
                if r.invoice_net_amount is not None or r.invoice_vat_amount is not None:
                    from decimal import Decimal
                    net = r.invoice_net_amount or Decimal('0')
                    vat = r.invoice_vat_amount or Decimal('0')
                    gross_val = net + vat
            except Exception:
                gross_val = None
            # Extract due date for all invoices
            due_date_str = None
            if getattr(r, 'due_date', None):
                try:
                    due_date_str = r.due_date.isoformat()
                except Exception:
                    due_date_str = None
            if not due_date_str:
                due_date_str = extract_due_date_from_cache(r.invoice_number, getattr(r, 'supplier_tax_number', None))
            if not due_date_str:
                # Disable network fetch for due dates in list view for performance (allow_network=False)
                # Users can view details to fetch the full XML
                due_date_str = fetch_due_date_from_nav(r.invoice_number, getattr(r, 'supplier_tax_number', None), getattr(r, 'index', None), allow_network=False)
            # If still no dueDate, fallback to recorded payment date
            if not due_date_str and getattr(r, 'payment_date', None):
                try:
                    due_date_str = r.payment_date.isoformat()
                except Exception:
                    pass

            # Payment status logic with batch sums
            payment_method = (r.payment_method or '').lower()
            payment_date = r.payment_date
            pay_key = f"{r.invoice_number or ''}|{r.supplier_tax_number or ''}"
            batch_paid_amount = pay_map.get(pay_key, {}).get('total') or decimal.Decimal('0')
            reconciled_paid_amount = r.amount_paid or decimal.Decimal('0')
            paid_amount = max(batch_paid_amount, reconciled_paid_amount)
            last_payment_dt = pay_map.get(pay_key, {}).get('last_payment')
            # For card, cash, voucher, other: always paid, payment date = issue date
            if payment_method in ['card', 'cash', 'voucher', 'other']:
                payment_date = date_val

            remaining_amount = None
            overpaid_amount = None
            is_paid = False
            is_partial = False
            # Determine paid/partial based on gross vs paid amounts
            try:
                tol = decimal.Decimal('0.005')
                if gross_val is not None:
                    remaining_amount = gross_val - paid_amount
                    if remaining_amount <= tol:
                        is_paid = True
                        if remaining_amount < decimal.Decimal('0'):
                            overpaid_amount = abs(remaining_amount)
                            remaining_amount = decimal.Decimal('0')
                    elif paid_amount > tol:
                        is_partial = True
                else:
                    # If we don't know gross, fall back to payment method/date
                    is_paid = bool(payment_date) or payment_method in ['card','cash','voucher','other']
            except Exception:
                pass
            
            # Force paid if model says so
            if getattr(r, 'payment_status', '') == 'paid':
                is_paid = True
                remaining_amount = decimal.Decimal('0')

            # payment display date: NAV/issue for instant methods, mark-paid date or last payment for transfers
            payment_display_date = None
            if payment_date:
                payment_display_date = payment_date
            elif payment_method in ['card', 'cash', 'voucher', 'other']:
                payment_display_date = date_val
            elif last_payment_dt:
                try:
                    payment_display_date = last_payment_dt.date()
                except Exception:
                    payment_display_date = None

            # Apply due filter (in-page) when requested
            if status_filter == 'due':
                if is_paid:
                    continue
                ok_due = False
                if due_date_str:
                    try:
                        from django.utils.dateparse import parse_date
                        due_dt = parse_date(due_date_str)
                        if due_dt and due_dt <= today_date:
                            ok_due = True
                    except Exception:
                        ok_due = False
                if not ok_due:
                    continue

            approver_name = None
            try:
                if getattr(r, 'approved_by', None):
                    u = r.approved_by
                    approver_name = u.full_name.strip()
                    if not approver_name:
                        approver_name = u.email
            except Exception:
                approver_name = None

            # Only transfer invoices require explicit approval; others are treated as approved
            pm_val = (r.payment_method or '').upper()
            auto_approved = pm_val and pm_val != 'TRANSFER'

            items_all.append({
                'invoiceNumber': r.invoice_number,
                'invoiceIssueDate': date_val.isoformat() if date_val else None,
                'supplierTaxNumber': r.supplier_tax_number,
                'supplierName': r.supplier_name,
                'currency': r.currency,
                'netAmount': (str(r.invoice_net_amount) if r.invoice_net_amount is not None else None),
                'vatAmount': (str(r.invoice_vat_amount) if r.invoice_vat_amount is not None else None),
                'grossAmount': (str(gross_val) if gross_val is not None else None),
                'deliveryDate': (r.invoice_delivery_date.isoformat() if r.invoice_delivery_date else None),
                'paymentDate': (payment_display_date.isoformat() if hasattr(payment_display_date, 'isoformat') and payment_display_date else None),
                'paymentMethod': r.payment_method,
                'dueDate': due_date_str,
                'paidAmount': (str(paid_amount) if paid_amount is not None else None),
                'remainingAmount': (str(remaining_amount) if (remaining_amount is not None and remaining_amount > decimal.Decimal('0')) else None),
                'overpaidAmount': (str(overpaid_amount) if overpaid_amount is not None else None),
                'paymentDisplayDate': (payment_display_date.isoformat() if hasattr(payment_display_date, 'isoformat') and payment_display_date else None),
                'paymentReference': getattr(r, 'payment_reference', None),
                'isPaid': is_paid,
                'isPartial': is_partial,
                'inPaymentBatch': pay_key in pay_map,
                'isApproved': bool(getattr(r, 'is_approved', False) or auto_approved),
                'approvedBy': approver_name,
                'approvedAt': (r.approved_at.isoformat() if getattr(r, 'approved_at', None) else None),
            })

        page_items = items_all

        return Response({
            'success': True,
            'page': page_obj.number,
            'pageCount': paginator.num_pages,
            'totalItems': paginator.count,
            'hasMore': page_obj.has_next(),
            'items': page_items,
            'lastRefreshedAt': sync.last_refreshed_at.isoformat() if sync.last_refreshed_at else None,
            'refreshed': did_refresh,
            'upserted': upsert_count,
            'refreshError': refresh_error,
        })

    @action(detail=False, methods=['post'], url_path='incoming/download')
    def download_incoming(self, request):
        """Return full invoice XML for a given invoice using queryInvoiceData.
        Caches the decoded invoice XML in DB to avoid repeated NAV calls.
        Params: company_id, invoice_number, supplier_tax_number (optional)
        """
        from django.http import HttpResponse
        from invoices.models import CompanyNAVConfiguration, Company, IncomingInvoiceData
        company_id = request.data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        invoice_number = request.data.get('invoice_number') or request.query_params.get('invoice_number')
        supplier_tax_number = request.data.get('supplier_tax_number') or request.query_params.get('supplier_tax_number')
        force_refresh = (request.data.get('force') or request.query_params.get('force') or '').strip().lower() in ('1', 'true', 'yes')
        if not (company_id and invoice_number):
            return Response({'error': 'company_id és invoice_number kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        # Try cache first (unless forced refresh)
        cached = None
        if not force_refresh:
            try:
                qs = IncomingInvoiceData.objects.filter(company=company, invoice_number=invoice_number)
                if supplier_tax_number:
                    qs = qs.filter(supplier_tax_number=supplier_tax_number)
                cached = qs.order_by('-updated_at').first()
            except Exception:
                cached = None

        # Try to find digest to get batch index and missing supplier tax number if needed
        digest_index = None
        supplier_tax_number_fallback = None
        try:
            from invoices.models import IncomingInvoiceDigest
            dqs = IncomingInvoiceDigest.objects.filter(company=company, invoice_number=invoice_number)
            if supplier_tax_number:
                dqs = dqs.filter(supplier_tax_number=supplier_tax_number)
            digest = dqs.order_by('-ins_date').first()
            if digest and getattr(digest, 'index', None):
                digest_index = int(digest.index)
            if not supplier_tax_number and getattr(digest, 'supplier_tax_number', None):
                supplier_tax_number_fallback = digest.supplier_tax_number
        except Exception:
            digest_index = None

        xml_text = None
        if cached and cached.xml_text:
            xml_text = cached.xml_text
            # If cache accidentally stored the outer NAV response, try to decode now and refresh cache
            try:
                if isinstance(xml_text, str) and ('QueryInvoiceDataResponse' in xml_text or 'invoiceDataResult' in xml_text or '<invoiceData' in xml_text):
                    import xml.etree.ElementTree as ET
                    import base64, gzip, io
                    root = ET.fromstring(xml_text)
                    def _find_any(root_el, local):
                        for el in root_el.iter():
                            tag = el.tag
                            if tag == local or (isinstance(tag, str) and tag.endswith('}'+local)):
                                return el
                        return None
                    data_el = _find_any(root, 'invoiceDataResult') or root
                    inv_b64_el = _find_any(root, 'invoiceData') or (_find_any(data_el, 'invoiceData') if data_el is not None else None)
                    if inv_b64_el is not None and inv_b64_el.text:
                        raw = base64.b64decode(inv_b64_el.text)
                        try:
                            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
                                decoded_xml = gz.read()
                        except OSError:
                            decoded_xml = raw
                        xml_text_decoded = decoded_xml.decode('utf-8', errors='replace')
                        if xml_text_decoded:
                            xml_text = xml_text_decoded
                            try:
                                cached.xml_text = xml_text_decoded
                                cached.save(update_fields=['xml_text'])
                            except Exception:
                                pass
                    else:
                        # No invoiceData inside: re-fetch from NAV using fallbacks
                        try:
                            cfg = CompanyNAVConfiguration.objects.filter(company_id=company_id, is_active=True).order_by('-is_default').first()
                            if cfg:
                                nav_service = NAVService(cfg)
                                variants = [
                                    (digest_index, supplier_tax_number),
                                    (None, supplier_tax_number),
                                    (digest_index, None),
                                    (None, None),
                                ]
                                for bi, stn in variants:
                                    try:
                                        res = nav_service.query_invoice_data('INBOUND', invoice_number, stn, bi)
                                        inner_xml = res.get('response') or ''
                                        root2 = ET.fromstring(inner_xml)
                                        data2 = _find_any(root2, 'invoiceDataResult') or root2
                                        inv2 = _find_any(root2, 'invoiceData') or (_find_any(data2, 'invoiceData') if data2 is not None else None)
                                        if inv2 is not None and inv2.text:
                                            raw2 = base64.b64decode(inv2.text)
                                            try:
                                                with gzip.GzipFile(fileobj=io.BytesIO(raw2)) as gz2:
                                                    decoded2 = gz2.read()
                                            except OSError:
                                                decoded2 = raw2
                                            xml_text2 = decoded2.decode('utf-8', errors='replace')
                                            if xml_text2:
                                                xml_text = xml_text2
                                                if cached:
                                                    try:
                                                        cached.xml_text = xml_text2
                                                        cached.save(update_fields=['xml_text'])
                                                    except Exception:
                                                        pass
                                                else:
                                                    try:
                                                        IncomingInvoiceData.objects.update_or_create(
                                                            company=company,
                                                            invoice_number=invoice_number,
                                                            supplier_tax_number=supplier_tax_number,
                                                            defaults={'xml_text': xml_text2},
                                                        )
                                                        # Auto-register supplier
                                                        try:
                                                            customer, conflict = auto_register_or_update_supplier(company, xml_text2)
                                                            if conflict:
                                                                logger.warning(f"Beszállító adatok eltérnek ({supplier_tax_number}): {conflict['differences']}")
                                                        except Exception as e:
                                                            logger.error(f"Hiba a beszállító auto-regisztráció során: {e}")
                                                    except Exception:
                                                        pass
                                                break
                                    except Exception:
                                        continue
                        except Exception:
                            pass
            except Exception:
                pass
        else:
            # Call NAV and decode
            cfg = CompanyNAVConfiguration.objects.filter(company_id=company_id, is_active=True).order_by('-is_default').first()
            if not cfg:
                return Response({'error': 'Nincs aktív NAV konfiguráció a céghez'}, status=status.HTTP_400_BAD_REQUEST)
            nav_service = NAVService(cfg)
            # First attempt with provided params (or fallback supplier tax number if missing)
            stn_try = supplier_tax_number or supplier_tax_number_fallback
            res = nav_service.query_invoice_data('INBOUND', invoice_number, stn_try, digest_index)
            xml_text = res.get('response') or ''
            def _decode_inner(text: str) -> str:
                try:
                    import xml.etree.ElementTree as ET
                    import base64, gzip, io
                    root = ET.fromstring(text)
                    def _find_any(root_el, local):
                        for el in root_el.iter():
                            tag = el.tag
                            if tag == local or (isinstance(tag, str) and tag.endswith('}'+local)):
                                return el
                        return None
                    data_el = _find_any(root, 'invoiceDataResult') or root
                    inv_b64_el = _find_any(root, 'invoiceData') or (_find_any(data_el, 'invoiceData') if data_el is not None else None)
                    if inv_b64_el is not None and inv_b64_el.text:
                        raw = base64.b64decode(inv_b64_el.text)
                        try:
                            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
                                decoded_xml = gz.read()
                        except OSError:
                            decoded_xml = raw
                        return decoded_xml.decode('utf-8', errors='replace')
                except Exception:
                    pass
                return ''

            decoded = _decode_inner(xml_text)
            if not decoded:
                # Try fallback variants if first attempt didn't include invoiceData
                variants = []
                # Try with known supplier tax number(s) first
                stn_variants = []
                if supplier_tax_number:
                    stn_variants.append(supplier_tax_number)
                if supplier_tax_number_fallback and supplier_tax_number_fallback not in stn_variants:
                    stn_variants.append(supplier_tax_number_fallback)
                # Always include None as a last resort
                stn_variants.append(None)
                for bi in (digest_index, None):
                    for stn in stn_variants:
                        variants.append((bi, stn))
                for bi, stn in variants:
                    try:
                        res2 = nav_service.query_invoice_data('INBOUND', invoice_number, stn, bi)
                        decoded = _decode_inner(res2.get('response') or '')
                        if decoded:
                            supplier_tax_number = stn or supplier_tax_number
                            break
                    except Exception:
                        continue
            xml_text = decoded or xml_text

            # Save to cache if we have something meaningful (decoded inner XML preferred)
            try:
                if xml_text:
                    IncomingInvoiceData.objects.update_or_create(
                        company=company,
                        invoice_number=invoice_number,
                        supplier_tax_number=supplier_tax_number,
                        defaults={'xml_text': xml_text}
                    )
                    # Auto-register supplier
                    try:
                        customer, conflict = auto_register_or_update_supplier(company, xml_text)
                        if conflict:
                            logger.warning(f"Beszállító adatok eltérnek ({supplier_tax_number}): {conflict['differences']}")
                    except Exception as e:
                        logger.error(f"Hiba a beszállító auto-regisztráció során: {e}")
            except Exception:
                pass

        # Final normalization: if response still contains NAV wrapper, decode to inner invoice XML
        try:
            if xml_text and (
                'QueryInvoiceDataResponse' in xml_text or 'invoiceDataResult' in xml_text or '<invoiceData' in xml_text
            ):
                import xml.etree.ElementTree as ET
                import base64, gzip, io
                root = ET.fromstring(xml_text)
                def _find_any(root_el, local):
                    for el in root_el.iter():
                        tag = el.tag
                        if tag == local or (isinstance(tag, str) and tag.endswith('}'+local)):
                            return el
                    return None
                data_el = _find_any(root, 'invoiceDataResult') or root
                inv_b64_el = _find_any(root, 'invoiceData') or (_find_any(data_el, 'invoiceData') if data_el is not None else None)
                if inv_b64_el is not None and inv_b64_el.text:
                    raw = base64.b64decode(inv_b64_el.text)
                    try:
                        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
                            decoded = gz.read()
                    except OSError:
                        decoded = raw
                    xml_text = decoded.decode('utf-8', errors='replace')
        except Exception:
            pass

        resp = HttpResponse(xml_text or '', content_type='application/xml')
        # inline viewing support
        inline = request.query_params.get('inline') in ('1', 'true', 'yes')
        disp = 'inline' if inline else 'attachment'
        resp['Content-Disposition'] = f'{disp}; filename="incoming_{invoice_number}.xml"'
        return resp

    @action(detail=False, methods=['post'], url_path='incoming/set_payment_method')
    def set_incoming_payment_method(self, request):
        """Set payment_method for an incoming invoice digest without overwriting other fields."""
        from invoices.models import IncomingInvoiceDigest, Company
        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        invoice_number = request.data.get('invoice_number') or ''
        supplier_tax_number = request.data.get('supplier_tax_number') or None
        payment_method = (request.data.get('payment_method') or '').strip().upper()
        allowed = {'TRANSFER','CASH','CARD','VOUCHER','OTHER','UTANVET'}
        if payment_method not in allowed:
            return Response({'error': 'Érvénytelen fizetési mód'}, status=status.HTTP_400_BAD_REQUEST)
        if not company_id or not invoice_number:
            return Response({'error': 'company_id és invoice_number kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        qs = IncomingInvoiceDigest.objects.filter(company=company, invoice_number=invoice_number)
        if supplier_tax_number:
            qs = qs.filter(supplier_tax_number=supplier_tax_number)
        obj = qs.order_by('-ins_date').first()
        if not obj:
            return Response({'error': 'Számla nem található'}, status=status.HTTP_404_NOT_FOUND)
        obj.payment_method = payment_method
        obj.save(update_fields=['payment_method'])
        return Response({'success': True, 'payment_method': obj.payment_method})

    @action(detail=False, methods=['post'], url_path='incoming/set_approval')
    def set_incoming_approval(self, request):
        """Approve or revoke approval for an incoming invoice digest."""
        from invoices.models import IncomingInvoiceDigest, Company, SystemUser
        from django.utils import timezone

        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        invoice_number = request.data.get('invoice_number') or ''
        supplier_tax_number = request.data.get('supplier_tax_number') or None
        approved_raw = request.data.get('approved')
        approved = str(approved_raw).strip().lower() in ('1', 'true', 'yes', 'on')

        def _resolve_system_user(user_obj):
            if isinstance(user_obj, SystemUser):
                return user_obj
            email = getattr(user_obj, 'email', None)
            username = getattr(user_obj, 'username', None)
            candidate_email = email or username
            if candidate_email:
                return SystemUser.objects.filter(email=candidate_email, is_active=True).prefetch_related('roles').first()
            return None

        req_user = getattr(request, 'user', None)
        sys_user = _resolve_system_user(req_user)

        def _has_approval_permission():
            if getattr(req_user, 'is_superuser', False) or getattr(req_user, 'is_staff', False):
                return True
            if not sys_user:
                # If we cannot resolve a SystemUser, trust authenticated request user (superadmin cases in UI).
                return True
            allowed = []
            for r in sys_user.roles.filter(is_active=True):
                allowed.extend(r.menu_permissions or [])
            if not allowed:
                return True  # no menu restriction means full access
            if 'incoming_invoices_approve' in allowed:
                return True
            admin_keys = {'settings_roles', 'settings_users', 'settings'}
            if any(k in allowed for k in admin_keys):
                return True
            return False

        if not _has_approval_permission():
            return Response({'error': 'Nincs jogosultság a jóváhagyáshoz'}, status=status.HTTP_403_FORBIDDEN)

        if not company_id or not invoice_number:
            return Response({'error': 'company_id és invoice_number kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        # If we have an authenticated Django user but no SystemUser, create/link one to persist approver name.
        if not sys_user:
            email = getattr(req_user, 'email', None) or getattr(req_user, 'username', None)
            if email:
                sys_user, _ = SystemUser.objects.get_or_create(
                    email=email,
                    defaults={
                        'first_name': getattr(req_user, 'first_name', '') or '',
                        'last_name': getattr(req_user, 'last_name', '') or '',
                        'password_hash': make_password(None),
                        'is_active': True,
                    },
                )
                try:
                    sys_user.companies.add(company)
                except Exception:
                    pass

        qs = IncomingInvoiceDigest.objects.filter(company=company, invoice_number=invoice_number)
        if supplier_tax_number:
            qs = qs.filter(supplier_tax_number=supplier_tax_number)
        obj = qs.order_by('-ins_date').first()
        if not obj:
            return Response({'error': 'Számla nem található'}, status=status.HTTP_404_NOT_FOUND)

        pm_val = (obj.payment_method or '').upper()
        # Only transfer invoices require explicit approval; others are considered approved by default
        if pm_val and pm_val != 'TRANSFER':
            obj.is_approved = True
            obj.approved_by = None
            obj.approved_at = None
            obj.save(update_fields=['is_approved', 'approved_by', 'approved_at'])
            return Response({
                'success': True,
                'is_approved': True,
                'approved_at': None,
                'approved_by_id': None,
                'approved_by_name': None,
            })

        approver = sys_user if approved else None

        obj.is_approved = approved
        obj.approved_by = approver if approved else None
        obj.approved_at = timezone.now() if approved else None
        obj.save(update_fields=['is_approved', 'approved_by', 'approved_at'])

        approver_name = None
        if obj.approved_by:
            try:
                # Use the property method if available, else construct manually
                approver_name = obj.approved_by.full_name.strip()
                if not approver_name:
                    approver_name = f"{obj.approved_by.last_name} {obj.approved_by.first_name}".strip()
                if not approver_name:
                    approver_name = obj.approved_by.email
            except Exception:
                pass

        if not approver_name and req_user and approved:
            # Fallback to request user details if SystemUser name is somehow empty but we know someone approved it
            name_parts = [getattr(req_user, 'last_name', '') or '', getattr(req_user, 'first_name', '') or '']
            fallback_name = ' '.join([p for p in name_parts if p]).strip() or getattr(req_user, 'email', None) or getattr(req_user, 'username', None)
            approver_name = fallback_name

        return Response({
            'success': True,
            'is_approved': obj.is_approved,
            'approved_at': obj.approved_at.isoformat() if obj.approved_at else None,
            'approved_by_id': str(obj.approved_by.id) if obj.approved_by else None,
            'approved_by_name': approver_name,
        })

    @action(detail=False, methods=['post', 'get'], url_path='incoming/backfill')
    def backfill_incoming_cache(self, request):
        """Backfill and cache full NAV invoiceData XMLs for incoming invoices.
        Body params:
        - company_id: required
        - date_from/date_to: optional filter window (YYYY-MM-DD)
        - invoice_number: optional, process only this invoice number
        - limit: optional int max invoices to process (default 50)
        - sleep_ms: optional throttle between NAV calls (default 0)
        """
        from invoices.models import CompanyNAVConfiguration, Company, IncomingInvoiceDigest, IncomingInvoiceData
        import xml.etree.ElementTree as ET
        import base64, gzip, io, time as _time

        company_id = request.data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        specific_invoice = request.data.get('invoice_number') or request.query_params.get('invoice_number')
        date_from = request.data.get('date_from') or request.query_params.get('date_from')
        date_to = request.data.get('date_to') or request.query_params.get('date_to')
        limit = request.data.get('limit') or request.query_params.get('limit') or 50
        sleep_ms = request.data.get('sleep_ms') or request.query_params.get('sleep_ms') or 0
        try:
            limit = int(limit)
        except Exception:
            limit = 50
        try:
            sleep_ms = int(sleep_ms)
        except Exception:
            sleep_ms = 0

        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        cfg = CompanyNAVConfiguration.objects.filter(company_id=company_id, is_active=True).order_by('-is_default').first()
        if not cfg:
            return Response({'error': 'Nincs aktív NAV konfiguráció a céghez'}, status=status.HTTP_400_BAD_REQUEST)

        qs = IncomingInvoiceDigest.objects.filter(company=company)
        if specific_invoice:
            qs = qs.filter(invoice_number=specific_invoice)
        if date_from and date_to:
            qs = qs.filter(
                (models.Q(invoice_issue_date__gte=date_from, invoice_issue_date__lte=date_to)) |
                (models.Q(ins_date__date__gte=date_from, ins_date__date__lte=date_to))
            )
        elif date_from:
            qs = qs.filter(models.Q(invoice_issue_date__gte=date_from) | models.Q(ins_date__date__gte=date_from))
        elif date_to:
            qs = qs.filter(models.Q(invoice_issue_date__lte=date_to) | models.Q(ins_date__date__lte=date_to))

        # Only those without cached xml
        qs = qs.order_by('-invoice_issue_date', '-ins_date')

        attempted = 0
        created = 0
        skipped = 0
        errors = []

        nav_service = NAVService(cfg)

        def _decode_inner(text: str) -> str:
            try:
                root = ET.fromstring(text)
                def _find_any(root_el, local):
                    for el in root_el.iter():
                        tag = el.tag
                        if tag == local or (isinstance(tag, str) and tag.endswith('}'+local)):
                            return el
                    return None
                data_el = _find_any(root, 'invoiceDataResult') or root
                inv_b64_el = _find_any(root, 'invoiceData') or (_find_any(data_el, 'invoiceData') if data_el is not None else None)
                if inv_b64_el is not None and inv_b64_el.text:
                    raw = base64.b64decode(inv_b64_el.text)
                    try:
                        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
                            decoded_xml = gz.read()
                    except OSError:
                        decoded_xml = raw
                    return decoded_xml.decode('utf-8', errors='replace')
            except Exception:
                pass
            return ''

        for d in qs.iterator():
            if attempted >= limit:
                break
            attempted += 1

            # Skip if already cached (match also by supplier_tax_number if known)
            cache_q = IncomingInvoiceData.objects.filter(company=company, invoice_number=d.invoice_number)
            if d.supplier_tax_number:
                cache_q = cache_q.filter(supplier_tax_number=d.supplier_tax_number)
            if cache_q.exists():
                skipped += 1
                continue

            # Query NAV
            try:
                res = nav_service.query_invoice_data('INBOUND', d.invoice_number, d.supplier_tax_number, d.index)
                xml_text = _decode_inner(res.get('response') or '')
                if not xml_text:
                    # Retry with robust variants
                    variants = []
                    stn_variants = []
                    if d.supplier_tax_number:
                        stn_variants.append(d.supplier_tax_number)
                    stn_variants.append(None)
                    for bi in (d.index, None):
                        for stn in stn_variants:
                            variants.append((bi, stn))
                    for bi, stn in variants:
                        try:
                            res2 = nav_service.query_invoice_data('INBOUND', d.invoice_number, stn, bi)
                            xml_text = _decode_inner(res2.get('response') or '')
                            if xml_text:
                                break
                        except Exception:
                            continue
                if not xml_text:
                    errors.append({'invoice': d.invoice_number, 'error': 'no_invoiceData'})
                    continue

                IncomingInvoiceData.objects.update_or_create(
                    company=company,
                    invoice_number=d.invoice_number,
                    supplier_tax_number=d.supplier_tax_number,
                    defaults={'xml_text': xml_text, 'transaction_id': d.transaction_id},
                )
                # Auto-register supplier
                try:
                    customer, result = auto_register_or_update_supplier(company, xml_text)
                    if result:
                        if result.get('created'):
                             pass # Already logged in function
                        elif result.get('updated'):
                             logger.info(f"Beszállító automatikusan frissítve ({d.supplier_tax_number}): {result.get('changes')}")
                        elif result.get('differences'): 
                             # Fallback or strict mode
                             logger.warning(f"Beszállító adatok eltérnek ({d.supplier_tax_number}): {result['differences']}")
                except Exception as e:
                    logger.error(f"Hiba a beszállító auto-regisztráció során: {e}")
                created += 1
            except Exception as e:
                errors.append({'invoice': d.invoice_number, 'error': str(e)})

            if sleep_ms:
                _time.sleep(sleep_ms / 1000.0)

        return Response({
            'success': True,
            'attempted': attempted,
            'created': created,
            'skipped': skipped,
            'errors': errors[:5],  # sample first 5
            'errorCount': len(errors),
        })

    @action(detail=False, methods=['post'])
    def lookup_taxpayer(self, request):
        """Look up taxpayer information from NAV"""
        tax_number = request.data.get('tax_number')
        
        if not tax_number:
            return Response(
                {'error': 'Adószám megadása kötelező'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Get active NAV configuration
            nav_config = NAVConfiguration.objects.filter(is_active=True).first()
            if not nav_config:
                return Response(
                    {'error': 'Nincs aktív NAV konfiguráció'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create NAV service and query taxpayer
            nav_service = NAVService(nav_config)
            result = nav_service.query_taxpayer(tax_number)
            
            # Console log a NAV szerver válaszáról
            print("=" * 80)
            print("NAV SZERVER VÁLASZA:")
            print("=" * 80)
            print(f"Adószám: {tax_number}")
            print(f"Siker: {result.get('success', False)}")
            print(f"Státusz kód: {result.get('status_code', 'N/A')}")
            print("-" * 40)
            print("TELJES XML VÁLASZ:")
            print(result.get('response', 'Nincs válasz'))
            print("-" * 40)
            
            # XML feldolgozás és adatok kinyerése
            if result.get('success') and result.get('response'):
                try:
                    import xml.etree.ElementTree as ET
                    root = ET.fromstring(result.get('response'))
                    
                    print("FELDOLGOZOTT ADATOK:")
                    print("-" * 40)
                    
                    # funcCode keresése
                    func_code = root.find('.//funcCode')
                    if func_code is not None:
                        print(f"FuncCode: {func_code.text}")
                    
                    # taxpayerValidity keresése
                    taxpayer_validity = root.find('.//taxpayerValidity')
                    if taxpayer_validity is not None:
                        print(f"Taxpayer Validity: {taxpayer_validity.text}")
                    
                    # taxpayerData keresése
                    taxpayer_data = root.find('.//taxpayerData')
                    if taxpayer_data is not None:
                        print("--- TAXPAYER DATA ---")
                        
                        # taxpayerName
                        taxpayer_name = taxpayer_data.find('.//taxpayerName')
                        if taxpayer_name is not None:
                            print(f"Cég neve: {taxpayer_name.text}")
                        
                        # taxpayerShortName
                        taxpayer_short_name = taxpayer_data.find('.//taxpayerShortName')
                        if taxpayer_short_name is not None:
                            print(f"Rövid név: {taxpayer_short_name.text}")
                        
                        # taxNumber
                        tax_number_elem = taxpayer_data.find('.//taxNumber')
                        if tax_number_elem is not None:
                            print(f"Adószám: {tax_number_elem.text}")
                        
                        # Cím adatok
                        address_list = taxpayer_data.find('.//taxpayerAddressList')
                        if address_list is not None:
                            print("--- CÍM ADATOK ---")
                            for address in address_list.findall('.//taxpayerAddress'):
                                country = address.find('.//countryCode')
                                postal = address.find('.//postalCode')
                                city = address.find('.//city')
                                street = address.find('.//streetName')
                                number = address.find('.//number')
                                
                                if country is not None:
                                    print(f"Ország: {country.text}")
                                if postal is not None:
                                    print(f"Irányítószám: {postal.text}")
                                if city is not None:
                                    print(f"Város: {city.text}")
                                if street is not None:
                                    print(f"Utca: {street.text}")
                                if number is not None:
                                    print(f"Házszám: {number.text}")
                    else:
                        print("Nincs taxpayerData - az adószám nem található vagy nem érvényes")
                        
                except Exception as e:
                    print(f"XML feldolgozási hiba: {e}")
            
            if result.get('error'):
                print(f"Hiba: {result.get('error')}")
            print("=" * 80)
            
            if result['success']:
                return Response({
                    'success': True,
                    'data': result.get('response', ''),
                    'message': 'Adószám validálás sikeres'
                })
            else:
                # NAV API hiba esetén 500-es hibát adunk vissza, mert ez külső szolgáltatás hiba
                return Response(
                    {'error': result.get('error', 'Adószám validálás sikertelen')},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
                
        except Exception as e:
            logger.error(f"Error looking up taxpayer: {str(e)}")
            return Response(
                {'error': f'Adószám lekérdezési hiba: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def token_exchange(self, request):
        """Exchange token with NAV"""
        try:
            # Get active NAV configuration
            nav_config = NAVConfiguration.objects.filter(is_active=True).first()
            if not nav_config:
                return Response(
                    {'error': 'Nincs aktív NAV konfiguráció'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create NAV service and exchange token
            nav_service = NAVService(nav_config)
            result = nav_service.token_exchange()
            
            # Console log a NAV szerver válaszáról
            print("=" * 80)
            print("NAV TOKEN EXCHANGE VÁLASZA:")
            print("=" * 80)
            print(f"Siker: {result.get('success', False)}")
            print(f"Státusz kód: {result.get('status_code', 'N/A')}")
            print("-" * 40)
            print("TELJES XML VÁLASZ:")
            print(result.get('response', 'Nincs válasz'))
            print("=" * 80)
            
            if result['success']:
                return Response({
                    'success': True,
                    'data': result.get('response', ''),
                    'message': 'Token exchange sikeres'
                })
            else:
                return Response(
                    {'error': result.get('error', 'Token exchange sikertelen')},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
                
        except Exception as e:
            logger.error(f"Error in token exchange: {str(e)}")
            return Response(
                {'error': f'Token exchange hiba: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InvoiceItemViewSet(viewsets.ModelViewSet):
    """ViewSet for managing invoice items"""
    queryset = InvoiceItem.objects.all()
    serializer_class = InvoiceItemSerializer
    permission_classes = []  # Nincs autentikáció szükséges


class NAVConfigurationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing NAV configurations"""
    queryset = NAVConfiguration.objects.all()
    serializer_class = NAVConfigurationSerializer
    permission_classes = []  # Nincs autentikáció szükséges

    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        """Test NAV API connection"""
        nav_config = self.get_object()
        try:
            nav_service = NAVService(nav_config)
            result = nav_service.get_token()
            if result.get('success'):
                return Response({'message': 'Connection successful', 'token': result.get('token', '')})
            return Response({'error': result.get('error', 'Connection failed')}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error testing NAV connection: {str(e)}")
            return Response({'error': f'Connection test failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def set_active(self, request, pk=None):
        """Set this configuration as active"""
        nav_config = self.get_object()
        
        # Deactivate all other configurations
        NAVConfiguration.objects.filter(is_active=True).update(is_active=False)
        
        # Activate this one
        nav_config.is_active = True
        nav_config.save()
        
        return Response({'message': 'Configuration activated successfully'})


class IncomingDocumentViewSet(viewsets.ModelViewSet):
    queryset = IncomingDocument.objects.all().order_by('-uploaded_at')
    serializer_class = IncomingDocumentSerializer
    permission_classes = []

    def get_queryset(self):
        qs = super().get_queryset()
        company_id = self.request.query_params.get('company_id') or (getattr(self.request, 'company', None) and str(self.request.company.id))
        invoice_number = self.request.query_params.get('invoice_number')
        supplier_tax_number = self.request.query_params.get('supplier_tax_number')
        doc_type = self.request.query_params.get('type')
        search = self.request.query_params.get('search')
        
        if company_id:
            qs = qs.filter(company_id=company_id)
        if invoice_number:
            qs = qs.filter(invoice_number=invoice_number)
        if supplier_tax_number:
            qs = qs.filter(supplier_tax_number=supplier_tax_number)
        if doc_type:
            qs = qs.filter(type=doc_type)

        if search:
            search_regex = get_fuzzy_search_regex(search)
            qs = qs.filter(
                Q(invoice_number__icontains=search) |
                Q(supplier_tax_number__icontains=search) |
                Q(original_name__iregex=search_regex) |
                Q(comment__iregex=search_regex)
            )

        return qs

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        self.perform_create(ser)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def set_comment(self, request, pk=None):
        obj = self.get_object()
        comment = request.data.get('comment', '')
        obj.comment = comment
        obj.save(update_fields=['comment'])
        return Response({'success': True})

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        from django.http import FileResponse, Http404
        obj = self.get_object()
        f = obj.file
        if not f or not getattr(f, 'path', None):
            raise Http404('Fájl nem található')
        resp = FileResponse(open(f.path, 'rb'))
        if obj.content_type:
            resp['Content-Type'] = obj.content_type
        disp_name = obj.original_name or getattr(f, 'name', 'file')
        resp['Content-Disposition'] = f'attachment; filename="{disp_name}"'
        return resp


class CompanyEmailSettingsViewSet(viewsets.ModelViewSet):
    queryset = CompanyEmailSettings.objects.select_related('company').all()
    serializer_class = CompanyEmailSettingsSerializer
    permission_classes = []

    def get_queryset(self):
        qs = CompanyEmailSettings.objects.select_related('company').all()
        company_id = (
            self.request.query_params.get('company_id')
            or self.request.query_params.get('company')
            or (getattr(self.request, 'company', None) and str(self.request.company.id))
        )
        if company_id:
            qs = qs.filter(company_id=company_id)
        return qs

    @action(detail=False, methods=['post'])
    def test_smtp(self, request):
        """SMTP beállítások tesztelése. A beállításokat a kérésből vagy a cég mentett beállításaiból olvassa.
        Kérés body (opcionális mezők):
        {
          "smtp_host": "smtp.example.com",
          "smtp_port": 587,
          "smtp_user": "user@example.com",
          "smtp_password": "secret",
          "smtp_use_tls": true,
          "smtp_from": "no-reply@example.com",
          "to": "me@example.com"
        }
        Viselkedés: Kapcsolódás és bejelentkezés teszt. Ha `to` meg van adva, küld egy teszt e-mailt.
        """
        import smtplib, ssl
        from email.message import EmailMessage
        data = request.data or {}
        company = getattr(request, 'company', None)
        if not company:
            cid = request.data.get('company') or request.query_params.get('company') or request.data.get('company_id') or request.query_params.get('company_id')
            if cid:
                company = Company.objects.filter(id=cid).first()
        settings_obj = None
        if company:
            settings_obj = CompanyEmailSettings.objects.filter(company=company).first()

        def val(key, default=None):
            if key in data and data.get(key) not in (None, ''):
                return data.get(key)
            if settings_obj:
                return getattr(settings_obj, key, default)
            return default

        def parse_bool(x, default=False):
            if x is None:
                return default
            if isinstance(x, bool):
                return x
            s = str(x).strip().lower()
            return s in ('1', 'true', 'yes', 'on')

        smtp_host = val('smtp_host')
        smtp_port = int(val('smtp_port', 587) or 587)
        smtp_user = val('smtp_user')
        smtp_password = val('smtp_password')
        smtp_use_tls = parse_bool(val('smtp_use_tls', True), default=True)
        smtp_from = val('smtp_from') or smtp_user
        to_addr = data.get('to')

        if not smtp_host:
            return Response({"success": False, "error": "smtp_host nincs beállítva"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            if smtp_port == 465:
                context = ssl.create_default_context()
                server = smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=15)
            else:
                server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
                server.ehlo()
                if smtp_use_tls:
                    context = ssl.create_default_context()
                    server.starttls(context=context)
            if smtp_user:
                server.login(smtp_user, smtp_password or '')

            details = {"host": smtp_host, "port": smtp_port, "tls": smtp_use_tls and smtp_port != 465, "ssl": smtp_port == 465}

            if to_addr:
                if not smtp_from:
                    server.quit()
                    return Response({"success": False, "error": "smtp_from hiányzik a teszt e-mailhez"}, status=status.HTTP_400_BAD_REQUEST)
                msg = EmailMessage()
                msg["From"] = smtp_from
                msg["To"] = to_addr if isinstance(to_addr, str) else ", ".join(to_addr)
                msg["Subject"] = "PixInvoice SMTP teszt"
                msg.set_content("Ez egy teszt üzenet a PixInvoice-ból.\n")
                server.send_message(msg)
                details["sent_to"] = to_addr

            server.quit()
            return Response({"success": True, "message": "SMTP kapcsolat rendben", "details": details})
        except Exception as e:
            try:
                server.quit()
            except Exception:
                pass
            return Response({"success": False, "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def test_imap(self, request):
        """IMAP beállítások tesztelése. A beállításokat a kérésből vagy a cég mentett beállításaiból olvassa.
        Kérés body (opcionális mezők):
        {
          "imap_host", "imap_user", "imap_password", "imap_port", "imap_sent_folder", "write_test_message": true
        }
        A teszt bejelentkezik, megpróbálja kiválasztani az INBOX-ot (üzenetszámot visszaadja),
        és egy teszt üzenetet APPEND-el a Sent mappába (ha engedélyezett).
        """
        import imaplib, ssl, time
        from email.message import EmailMessage
        from email.utils import formatdate
        data = request.data or {}
        company = getattr(request, 'company', None)
        if not company:
            cid = request.data.get('company') or request.query_params.get('company') or request.data.get('company_id') or request.query_params.get('company_id')
            if cid:
                company = Company.objects.filter(id=cid).first()
        settings_obj = None
        if company:
            settings_obj = CompanyEmailSettings.objects.filter(company=company).first()

        def val(key, default=None):
            if key in data and data.get(key) not in (None, ''):
                return data.get(key)
            if settings_obj:
                return getattr(settings_obj, key, default)
            return default

        imap_host = val('imap_host')
        imap_user = val('imap_user')
        imap_password = val('imap_password')
        imap_port = int(val('imap_port', 993) or 993)
        sent_folder = val('imap_sent_folder', 'Sent') or 'Sent'
        write_test = True
        try:
            write_test = bool(data.get('write_test_message', True))
        except Exception:
            write_test = True
        if not imap_host or not imap_user:
            return Response({"success": False, "error": "imap_host és imap_user szükséges"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            try:
                M = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=ssl.create_default_context())
            except Exception:
                M = imaplib.IMAP4(imap_host, 143)
                M.starttls(ssl_context=ssl.create_default_context())

            typ, _ = M.login(imap_user, imap_password or '')
            if typ != 'OK':
                raise Exception('IMAP bejelentkezés sikertelen')
            typ, data_sel = M.select('INBOX', readonly=True)
            msg_count = None
            if typ == 'OK' and data_sel:
                try:
                    msg_count = int(data_sel[0])
                except Exception:
                    msg_count = None

            appended = False
            append_resp = None
            if write_test:
                # Validate or auto-detect Sent folder
                used_folder = sent_folder
                folder_ok = False
                try:
                    typ_chk, _ = M.select(used_folder, readonly=True)
                    folder_ok = (typ_chk == 'OK')
                except Exception:
                    folder_ok = False
                if not folder_ok:
                    try:
                        typ_list, boxes = M.list()
                        parsed = []
                        if typ_list == 'OK' and boxes:
                            for raw in boxes:
                                s = raw.decode(errors='ignore') if isinstance(raw, (bytes, bytearray)) else str(raw)
                                import re as _re
                                # Extract flags
                                m_flags = _re.search(r"\(([^)]*)\)", s)
                                flags_txt = m_flags.group(1) if m_flags else ''
                                # Extract quoted tokens: delim and name
                                quoted = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                                name = quoted[-1] if quoted else (s.split()[-1] if s.split() else '')
                                # Decode IMAP modified UTF-7
                                try:
                                    from imaplib import IMAP4
                                    name = IMAP4._decode_utf7(name)
                                except Exception:
                                    pass
                                # Skip placeholders and non-selectable
                                if name in ('.', '', 'NIL'):
                                    continue
                                if 'Noselect' in (flags_txt or '') or '\\Noselect' in (flags_txt or ''):
                                    continue
                                parsed.append({'name': name, 'flags': flags_txt})
                        # Prefer mailbox flagged as \\Sent
                        cand = None
                        for mb in parsed:
                            if '\\Sent' in (mb['flags'] or ''):
                                cand = mb['name']
                                break
                        # Fallback common names
                        if not cand:
                            common = ['Sent','Sent Items','Sent Mail','Sent Messages','[Gmail]/Sent Mail','Elküldött','Elküldött levelek','Elküldött üzenetek','Küldött elemek']
                            lower = {mb['name'].lower(): mb['name'] for mb in parsed}
                            for cn in common:
                                if cn.lower() in lower:
                                    cand = lower[cn.lower()]
                                    break
                        if cand:
                            used_folder = cand
                    except Exception:
                        pass
                msg = EmailMessage()
                frm = imap_user
                msg['From'] = frm
                msg['To'] = frm
                msg['Subject'] = 'PixInvoice IMAP teszt üzenet'
                msg['Date'] = formatdate(localtime=True)
                msg.set_content('Ez egy IMAP APPEND teszt üzenet a PixInvoice-ból.')
                flags = r'(\\Seen)'
                def _detect_delim(imap):
                    try:
                        typ0, boxes0 = imap.list('', '')
                        if typ0 == 'OK' and boxes0:
                            s = boxes0[0].decode(errors='ignore') if isinstance(boxes0[0], (bytes, bytearray)) else str(boxes0[0])
                            import re as _re
                            q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                            if len(q) >= 2:
                                return q[-2]
                    except Exception:
                        pass
                    try:
                        typ1, boxes1 = imap.list()
                        if typ1 == 'OK' and boxes1:
                            s = boxes1[0].decode(errors='ignore') if isinstance(boxes1[0], (bytes, bytearray)) else str(boxes1[0])
                            import re as _re
                            q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                            if len(q) >= 2:
                                return q[-2]
                    except Exception:
                        pass
                    return None
                def _try_create_and_append(imap, mailbox, content_bytes):
                    try:
                        typ_app, data_app = imap.append(mailbox, flags, imaplib.Time2Internaldate(time.time()), content_bytes)
                        if typ_app == 'OK':
                            return True, 'OK'
                    except Exception as e:
                        last_err = f'APPEND error: {str(e)}'
                    try:
                        try:
                            imap.create(mailbox)
                        except Exception:
                            pass
                        try:
                            imap.subscribe(mailbox)
                        except Exception:
                            pass
                        typ_app2, data_app2 = imap.append(mailbox, flags, imaplib.Time2Internaldate(time.time()), content_bytes)
                        return (typ_app2 == 'OK'), ('CREATED_AND_APPENDED' if typ_app2 == 'OK' else str(data_app2))
                    except Exception as e2:
                        return False, f'CREATE/APPEND error: {str(e2)}'
                try:
                    ok, resp = _try_create_and_append(M, used_folder, msg.as_bytes())
                    appended = ok
                    append_resp = resp
                    if not ok:
                        delim = _detect_delim(M) or '.'
                        variants = []
                        base = used_folder
                        if delim not in (None, '', 'NIL'):
                            variants.extend([
                                f'INBOX{delim}{base}',
                                f'Sent{delim}{base}',
                                f'Inbox{delim}{base}',
                            ])
                        for v in variants:
                            ok2, resp2 = _try_create_and_append(M, v, msg.as_bytes())
                            if ok2:
                                appended = True
                                append_resp = f'{resp2} to {v}'
                                used_folder = v
                                break
                except Exception as e2:
                    append_resp = f'APPEND error: {str(e2)}'

            M.logout()
            return Response({
                "success": True,
                "message": "IMAP kapcsolat rendben",
                "details": {"host": imap_host, "inbox_messages": msg_count, "sent_folder": used_folder if write_test else sent_folder, "appended_test": appended, "append_resp": append_resp}
            })
        except Exception as e:
            try:
                M.logout()
            except Exception:
                pass
            return Response({"success": False, "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def detect_imap_sent(self, request):
        """Listázza az IMAP mappákat és visszaad egy javasolt Sent mappát.
        Body (opcionális): imap_host, imap_user, imap_password, imap_port
        Ha nincs a body-ban, a cég mentett beállításait használjuk.
        """
        import imaplib, ssl
        data = request.data or {}
        company = getattr(request, 'company', None)
        if not company:
            cid = request.data.get('company') or request.query_params.get('company') or request.data.get('company_id') or request.query_params.get('company_id')
            if cid:
                company = Company.objects.filter(id=cid).first()
        settings_obj = None
        if company:
            settings_obj = CompanyEmailSettings.objects.filter(company=company).first()

        def val(key, default=None):
            if key in data and data.get(key) not in (None, ''):
                return data.get(key)
            if settings_obj:
                return getattr(settings_obj, key, default)
            return default

        imap_host = val('imap_host')
        imap_user = val('imap_user')
        imap_password = val('imap_password')
        imap_port = int(val('imap_port', 993) or 993)
        if not imap_host or not imap_user:
            return Response({"success": False, "error": "imap_host és imap_user szükséges"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            try:
                M = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=ssl.create_default_context())
            except Exception:
                M = imaplib.IMAP4(imap_host, 143)
                M.starttls(ssl_context=ssl.create_default_context())
            typ, _ = M.login(imap_user, imap_password or '')
            if typ != 'OK':
                raise Exception('IMAP bejelentkezés sikertelen')
            # Collect mailboxes from multiple queries
            mailboxes = []
            seen = set()
            def add_box(name, flags, delim=None):
                key = (name or '').strip()
                if not key or key in seen:
                    return
                # Skip placeholders and non-selectable
                if key in ('.', 'NIL'):
                    return
                if 'Noselect' in (flags or '') or '\\Noselect' in (flags or ''):
                    return
                seen.add(key)
                mailboxes.append({'name': name, 'flags': flags, 'delim': delim, 'label': name})
            def parse_list(list_result):
                typ_list, boxes = list_result
                if typ_list == 'OK' and boxes:
                    for raw in boxes:
                        s = raw.decode(errors='ignore') if isinstance(raw, (bytes, bytearray)) else str(raw)
                        import re as _re
                        
                        # Robust parsing of: (Flags) Delimiter Name
                        flags_txt = ''
                        delim = None
                        name = ''
                        
                        # 1. Flags
                        # Pattern: starts with (...) or just ...
                        m_flags = _re.search(r"^\(([^)]*)\)", s)
                        rest = s
                        if m_flags:
                            flags_txt = m_flags.group(1)
                            rest = s[m_flags.end():].strip()
                        
                        # 2. Delimiter (Quoted or NIL)
                        # We expect the delimiter to be the next token
                        if rest.startswith('NIL'):
                            delim = None
                            rest = rest[3:].strip()
                        elif rest.startswith('"'):
                            # Match quoted string at start
                            m_q = _re.match(r'^"([^"\\]*(?:\\.[^"\\]*)*)"', rest)
                            if m_q:
                                delim = m_q.group(1)
                                rest = rest[m_q.end():].strip()
                        
                        # 3. Name (Quoted or Literal)
                        if rest.startswith('"'):
                            m_n = _re.match(r'^"([^"\\]*(?:\\.[^"\\]*)*)"', rest)
                            if m_n:
                                name = m_n.group(1)
                                # If there's garbage after the name quote, ignore it? Usually nothing follows.
                            else:
                                # Start with quote but didn't match regex? Take as is or strip quotes manually
                                name = rest.strip('"')
                        else:
                            # Not quoted -> take the rest effectively
                            # But if the rest is empty?
                            # Sometimes literals {N} are used, but typically not in M.list() output from Python imaplib
                            name = rest.strip()

                        # Decode modified UTF-7
                        try:
                            from imaplib import IMAP4
                            name = IMAP4._decode_utf7(name)
                        except Exception:
                            pass
                        add_box(name, flags_txt, delim)
            try:
                parse_list(M.list())
            except Exception:
                pass
            try:
                parse_list(M.list('', '*'))
            except Exception:
                pass
            try:
                parse_list(M.list('', '%'))
            except Exception:
                pass
            try:
                typ_lsub, boxes_lsub = M.lsub()
                parse_list((typ_lsub, boxes_lsub))
            except Exception:
                pass

            suggested = None
            if mailboxes:
                # Prefer \\Sent
                for mb in mailboxes:
                    if '\\Sent' in (mb['flags'] or ''):
                        suggested = mb['name']
                        break
                if not suggested:
                    common = ['Sent','Sent Items','Sent Mail','Sent Messages','[Gmail]/Sent Mail','Elküldött','Elküldött levelek','Elküldött üzenetek','Küldött elemek']
                    lower = {mb['name'].lower(): mb['name'] for mb in mailboxes}
                    for cn in common:
                        if cn.lower() in lower:
                            suggested = lower[cn.lower()]
                            break
            M.logout()
            return Response({"success": True, "mailboxes": mailboxes, "suggested": suggested})
        except Exception as e:
            try:
                M.logout()
            except Exception:
                pass
            return Response({"success": False, "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def imap_recent(self, request):
        """Visszaadja az IMAP INBOX legfrissebb 5 üzenetének adatait (From, Subject, Date).
        Body (opcionális): imap_host, imap_user, imap_password, imap_port
        Ha nincs a body-ban, a cég mentett beállításait használjuk.
        """
        import imaplib, ssl, email
        from email.header import decode_header, make_header
        data = request.data or {}
        company = getattr(request, 'company', None)
        if not company:
            cid = request.data.get('company') or request.query_params.get('company') or request.data.get('company_id') or request.query_params.get('company_id')
            if cid:
                company = Company.objects.filter(id=cid).first()
        settings_obj = None
        if company:
            settings_obj = CompanyEmailSettings.objects.filter(company=company).first()

        def val(key, default=None):
            if key in data and data.get(key) not in (None, ''):
                return data.get(key)
            if settings_obj:
                return getattr(settings_obj, key, default)
            return default

        imap_host = val('imap_host')
        imap_user = val('imap_user')
        imap_password = val('imap_password')
        imap_port = int(val('imap_port', 993) or 993)
        if not imap_host or not imap_user:
            return Response({"success": False, "error": "imap_host és imap_user szükséges"}, status=status.HTTP_400_BAD_REQUEST)
        M = None
        try:
            try:
                M = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=ssl.create_default_context())
            except Exception:
                M = imaplib.IMAP4(imap_host, 143)
                try:
                    M.starttls(ssl_context=ssl.create_default_context())
                except Exception:
                    pass

            typ, _ = M.login(imap_user, imap_password or '')
            if typ != 'OK':
                raise Exception('IMAP bejelentkezés sikertelen')
            typ, _ = M.select('INBOX', readonly=True)
            if typ != 'OK':
                raise Exception('INBOX nem választható ki')
            typ, data_ids = M.search(None, 'ALL')
            ids = []
            if typ == 'OK' and data_ids and data_ids[0]:
                try:
                    ids = data_ids[0].split()
                except Exception:
                    ids = []
            recent = ids[-5:] if ids else []
            messages = []
            for mid in reversed(recent):  # legújabb elől
                try:
                    typ_f, parts = M.fetch(mid, '(BODY.PEEK[HEADER.FIELDS (DATE FROM SUBJECT)])')
                    hdr_bytes = None
                    if typ_f == 'OK' and parts:
                        for p in parts:
                            if isinstance(p, tuple) and p[1]:
                                hdr_bytes = p[1]
                                break
                    if not hdr_bytes:
                        continue
                    msg = email.message_from_bytes(hdr_bytes)
                    def _dec(v):
                        try:
                            return str(make_header(decode_header(v or '')))
                        except Exception:
                            return v or ''
                    messages.append({
                        'id': mid.decode() if isinstance(mid, (bytes, bytearray)) else str(mid),
                        'from': _dec(msg.get('From')),
                        'subject': _dec(msg.get('Subject')),
                        'date': _dec(msg.get('Date')),
                    })
                except Exception:
                    continue
            try:
                M.logout()
            except Exception:
                pass
            return Response({"success": True, "messages": messages})
        except Exception as e:
            try:
                if M:
                    M.logout()
            except Exception:
                pass
            return Response({"success": False, "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ContactViewSet(viewsets.ModelViewSet):
    """ViewSet for managing customer contacts"""
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer
    permission_classes = []  # Nincs autentikáció szükséges

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ContactCreateSerializer
        return ContactSerializer

    def get_queryset(self):
        queryset = Contact.objects.select_related('customer').all()
        customer_id = self.request.query_params.get('customer_id', None)
        search = self.request.query_params.get('search', None)
        contact_type = self.request.query_params.get('contact_type', None)
        is_active = self.request.query_params.get('is_active', None)
        
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        
        if search:
            search_regex = get_fuzzy_search_regex(search)
            queryset = queryset.filter(
                Q(first_name__iregex=search_regex) |
                Q(last_name__iregex=search_regex) |
                Q(email__icontains=search) |
                Q(position__iregex=search_regex) |
                Q(department__iregex=search_regex) |
                Q(customer__name__iregex=search_regex) |
                Q(customer__short_name__iregex=search_regex) |
                Q(customer__tax_number__icontains=search)
            )
        
        if contact_type:
            queryset = queryset.filter(contact_type=contact_type)
        
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset.order_by('-is_primary', 'last_name', 'first_name')

    @action(detail=True, methods=['post'])
    def set_primary(self, request, pk=None):
        """Set this contact as primary for the customer"""
        contact = self.get_object()
        
        # Remove primary status from other contacts of the same customer
        Contact.objects.filter(
            customer=contact.customer,
            is_primary=True
        ).update(is_primary=False)
        
        # Set this contact as primary
        contact.is_primary = True
        contact.save()
        
        return Response({'message': 'Contact set as primary successfully'})

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """Toggle active status of the contact"""
        contact = self.get_object()
        contact.is_active = not contact.is_active
        contact.save()
        
        status_text = 'activated' if contact.is_active else 'deactivated'
        return Response({'message': f'Contact {status_text} successfully'})


class CompanyViewSet(viewsets.ModelViewSet):
    """ViewSet for managing companies"""
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = []  # Nincs autentikáció szükséges

    def get_queryset(self):
        queryset = Company.objects.all()
        search = self.request.query_params.get('search', None)
        is_active = self.request.query_params.get('is_active', None)
        
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(tax_number__icontains=search) |
                Q(email__icontains=search)
            )
        
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset

    def create(self, request, *args, **kwargs):
        source_customer_id = request.data.get('source_customer_id')
        customer_obj = None
        if source_customer_id:
            try:
                customer_obj = Customer.objects.get(id=source_customer_id)
            except Customer.DoesNotExist:
                customer_obj = None

        # If source customer provided, prefill missing fields from customer
        data = request.data.copy()
        if customer_obj:
            def dset(key, val):
                if key not in data or data.get(key) in (None, '', []):
                    data[key] = val if val is not None else ''
            # Tax related
            dset('full_tax_number', getattr(customer_obj, 'full_tax_number', ''))
            dset('vat_code', getattr(customer_obj, 'vat_code', ''))
            dset('county_code', getattr(customer_obj, 'county_code', ''))
            dset('eu_tax_number', getattr(customer_obj, 'eu_tax_number', ''))
            dset('vat_group_id', getattr(customer_obj, 'vat_group_id', ''))
            dset('vat_group_member_tax_number', getattr(customer_obj, 'vat_group_member_tax_number', ''))
            # Address
            dset('address', getattr(customer_obj, 'address', ''))
            dset('street_name', getattr(customer_obj, 'street_name', ''))
            dset('public_place_category', getattr(customer_obj, 'public_place_category', ''))
            dset('street_number', getattr(customer_obj, 'street_number', ''))
            dset('building', getattr(customer_obj, 'building', ''))
            dset('staircase', getattr(customer_obj, 'staircase', ''))
            dset('floor', getattr(customer_obj, 'floor', ''))
            dset('door', getattr(customer_obj, 'door', ''))
            dset('city', getattr(customer_obj, 'city', ''))
            dset('postal_code', getattr(customer_obj, 'postal_code', ''))
            dset('country', getattr(customer_obj, 'country', ''))
            # Contacts
            dset('email', getattr(customer_obj, 'email', ''))
            dset('phone', getattr(customer_obj, 'phone', ''))

        # Remove helper field before validation
        if 'source_customer_id' in data:
            try:
                data.pop('source_customer_id')
            except Exception:
                pass
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        company = serializer.save()

        # Copy bank accounts from customer if provided
        if customer_obj:
            try:
                accounts = customer_obj.bank_accounts.all()
                for a in accounts:
                    CompanyBankAccount.objects.create(
                        company=company,
                        bank_name=a.bank_name,
                        account_number=a.account_number,
                        iban=a.iban,
                        swift_bic=a.swift_bic,
                        currency=a.currency or 'HUF',
                        is_primary=a.is_primary,
                    )
            except Exception:
                pass

        headers = {}
        return Response(CompanySerializer(company).data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'])
    def import_from_customer(self, request, pk=None):
        """Copy address/details (and optionally bank accounts) from a customer to this company.
        Request JSON: { customer_id: UUID, include_accounts: true/false }
        """
        company = self.get_object()
        customer_id = request.data.get('customer_id')
        include_accounts = bool(request.data.get('include_accounts', True))
        if not customer_id:
            return Response({'error': 'customer_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            customer = Customer.objects.get(id=customer_id)
        except Customer.DoesNotExist:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        # Copy fields
        fields = [
            'full_tax_number', 'vat_code', 'county_code', 'eu_tax_number',
            'vat_group_id', 'vat_group_member_tax_number', 'address', 'street_name',
            'public_place_category', 'street_number', 'building', 'staircase',
            'floor', 'door', 'city', 'postal_code', 'country', 'email', 'phone'
        ]
        for f in fields:
            setattr(company, f, getattr(customer, f, None))
        company.save()

        # Copy bank accounts (replace existing)
        if include_accounts:
            CompanyBankAccount.objects.filter(company=company).delete()
            for a in customer.bank_accounts.all():
                CompanyBankAccount.objects.create(
                    company=company,
                    bank_name=a.bank_name,
                    account_number=a.account_number,
                    iban=a.iban,
                    swift_bic=a.swift_bic,
                    currency=a.currency or 'HUF',
                    is_primary=a.is_primary,
                )

        return Response(CompanySerializer(company).data)

    @action(detail=True, methods=['post'])
    def toggle_xml_logging(self, request, pk=None):
        """Kapcsoló az XML log mentésre; kikapcsoláskor törli a mappát.
        Body: { enabled: bool }
        """
        company = self.get_object()
        enabled = bool(request.data.get('enabled', True))
        company.xml_logging_enabled = enabled
        company.save(update_fields=['xml_logging_enabled'])

        # Ha kikapcsoltuk, ürítsük ki az xml_logs mappát
        if not enabled:
            import os, shutil
            xml_dir = "/wb2/pixinvoice/xml_logs"
            try:
                if os.path.isdir(xml_dir):
                    for name in os.listdir(xml_dir):
                        path = os.path.join(xml_dir, name)
                        try:
                            if os.path.isfile(path) or os.path.islink(path):
                                os.unlink(path)
                            elif os.path.isdir(path):
                                shutil.rmtree(path)
                        except Exception:
                            continue
            except Exception:
                pass
        return Response({'xml_logging_enabled': company.xml_logging_enabled})

    @action(detail=True, methods=['post'])
    def backup_export(self, request, pk=None):
        """Export selected data scopes for a company to a downloadable JSON file.
        Body: { scopes: [..] }
        """
        company = self.get_object()
        scopes = request.data.get('scopes') or request.query_params.getlist('scopes') or []
        if not scopes:
            scopes = [
                'company', 'bank_accounts', 'email_settings', 'nav_configs', 'invoice_blocks',
                'customers', 'invoices', 'proformas', 'bank_statements', 'payment_batches', 'incoming', 'vat_types',
                'users'
            ]

        def serialize_queryset(qs, fields=None):
            out = []
            for obj in qs:
                d = model_to_dict(obj)
                # Ensure id is string
                if 'id' in d:
                    d['id'] = str(getattr(obj, 'id'))
                # Foreign keys as id strings
                for f in obj._meta.fields:
                    if isinstance(f, models.ForeignKey):
                        name = f.name
                        try:
                            val = getattr(obj, f.attname)
                            d[name] = str(val) if val is not None else None
                        except Exception:
                            pass
                if fields:
                    d = {k: d.get(k) for k in fields}
                out.append(d)
            return out

        backup = {
            'meta': {
                'version': '1.0',
                'exported_at': datetime.utcnow().isoformat() + 'Z',
                'company_id': str(company.id),
                'company_name': company.name,
                'scopes': scopes,
            }
        }

        # Core master data for the company
        if 'company' in scopes:
            cdict = model_to_dict(company)
            cdict['id'] = str(company.id)
            backup['company'] = cdict

        if 'bank_accounts' in scopes:
            backup['company_bank_accounts'] = serialize_queryset(CompanyBankAccount.objects.filter(company=company))

        if 'email_settings' in scopes:
            es = None
            try:
                es = company.email_settings
            except Exception:
                es = None
            backup['company_email_settings'] = (model_to_dict(es) | {'id': str(es.id), 'company': str(company.id)}) if es else None

        if 'nav_configs' in scopes:
            backup['company_nav_configurations'] = serialize_queryset(CompanyNAVConfiguration.objects.filter(company=company))

        if 'invoice_blocks' in scopes:
            backup['invoice_blocks'] = serialize_queryset(InvoiceBlock.objects.filter(company=company))

        # System users related to this company (include M2M relation ids)
        if 'users' in scopes:
            users = SystemUser.objects.filter(companies=company).prefetch_related('companies')
            rows = []
            for u in users:
                u_d = model_to_dict(u)
                u_d['id'] = str(u.id)
                u_d['companies'] = [str(cid) for cid in u.companies.values_list('id', flat=True)]
                rows.append(u_d)
            backup['system_users'] = rows

        # Customers
        customers_to_include = []
        if 'customers' in scopes:
            customers_to_include = list(Customer.objects.all().values_list('id', flat=True))

        # Invoices with items
        if 'invoices' in scopes:
            invs = Invoice.objects.filter(company=company).order_by('created_at')
            inv_rows = []
            for inv in invs:
                inv_d = model_to_dict(inv)
                inv_d['id'] = str(inv.id)
                inv_d['company'] = str(company.id)
                inv_d['customer'] = str(inv.customer_id) if inv.customer_id else None
                inv_d['invoice_block'] = str(inv.invoice_block_id) if inv.invoice_block_id else None
                # Drop fields that are not portable
                for drop in ['created_by', 'nav_response']:
                    if drop in inv_d:
                        del inv_d[drop]
                items = []
                for it in inv.items.all():
                    it_d = model_to_dict(it)
                    it_d['id'] = str(it.id)
                    it_d['vat_type'] = str(it.vat_type_id) if it.vat_type_id else None
                    items.append(it_d)
                inv_rows.append({'invoice': inv_d, 'items': items})
                if inv.customer_id:
                    customers_to_include.append(inv.customer_id)
            backup['invoices'] = inv_rows

        if 'proformas' in scopes:
            pfs = ProformaInvoice.objects.filter(company=company).order_by('created_at')
            rows = []
            for pf in pfs:
                pf_d = model_to_dict(pf)
                pf_d['id'] = str(pf.id)
                pf_d['company'] = str(company.id)
                pf_d['customer'] = str(pf.customer_id) if pf.customer_id else None
                items = []
                for it in pf.items.all():
                    it_d = model_to_dict(it)
                    it_d['id'] = str(it.id)
                    it_d['vat_type'] = str(it.vat_type_id) if it.vat_type_id else None
                    items.append(it_d)
                rows.append({'proforma': pf_d, 'items': items})
                if pf.customer_id:
                    customers_to_include.append(pf.customer_id)
            backup['proformas'] = rows

        if 'bank_statements' in scopes:
            bs = BankStatement.objects.filter(company=company).order_by('created_at')
            rows = []
            for b in bs:
                b_d = model_to_dict(b)
                b_d['id'] = str(b.id)
                b_d['company'] = str(company.id)
                b_d['bank_account'] = str(b.bank_account_id) if b.bank_account_id else None
                items = []
                for it in b.items.all():
                    it_d = model_to_dict(it)
                    it_d['id'] = str(it.id)
                    it_d['bank_statement'] = str(b.id)
                    it_d['customer'] = str(it.customer_id) if it.customer_id else None
                    it_d['invoice'] = str(it.invoice_id) if it.invoice_id else None
                    items.append(it_d)
                    if it.customer_id:
                        customers_to_include.append(it.customer_id)
                rows.append({'statement': b_d, 'items': items})
            backup['bank_statements'] = rows

        if 'payment_batches' in scopes:
            batches = PaymentBatch.objects.filter(company=company).order_by('created_at')
            rows = []
            for b in batches:
                b_d = model_to_dict(b)
                b_d['id'] = str(b.id)
                b_d['company'] = str(company.id)
                b_d['bank_account'] = str(b.bank_account_id) if b.bank_account_id else None
                items = []
                for it in b.items.all():
                    it_d = model_to_dict(it)
                    it_d['id'] = str(it.id)
                    it_d['batch'] = str(b.id)
                    items.append(it_d)
                rows.append({'batch': b_d, 'items': items})
            backup['payment_batches'] = rows

        if 'incoming' in scopes:
            backup['incoming_digests'] = serialize_queryset(IncomingInvoiceDigest.objects.filter(company=company))
            backup['incoming_datas'] = serialize_queryset(IncomingInvoiceData.objects.filter(company=company))

        # Customers set (dedup)
        if customers_to_include:
            customers_to_include = list({str(cid) for cid in customers_to_include})
            customers = Customer.objects.filter(id__in=customers_to_include)
            backup['customers'] = serialize_queryset(customers)
        elif 'customers' in scopes:
            # all customers (fallback)
            backup['customers'] = serialize_queryset(Customer.objects.all())

        if 'vat_types' in scopes:
            backup['vat_types'] = serialize_queryset(VATType.objects.all())

        # JSON dump with sane defaults
        class Encoder(json.JSONEncoder):
            def default(self, o):
                # Datetime and date
                if isinstance(o, (datetime, date)):
                    return o.isoformat()
                # Decimals
                if isinstance(o, decimal.Decimal):
                    return float(o)
                # UUIDs
                try:
                    import uuid as _uuid
                    if isinstance(o, _uuid.UUID):
                        return str(o)
                except Exception:
                    pass
                # Django model instances (fallback)
                try:
                    from django.db import models as _dj_models
                    from django.forms.models import model_to_dict as _m2d
                    if isinstance(o, _dj_models.Model):
                        d = _m2d(o)
                        if 'id' in d and getattr(o, 'id', None) is not None:
                            d['id'] = str(getattr(o, 'id'))
                        # Normalize foreign keys to string ids where possible
                        for f in o._meta.fields:
                            if isinstance(f, _dj_models.ForeignKey):
                                try:
                                    val = getattr(o, f.attname)
                                    d[f.name] = str(val) if val is not None else None
                                except Exception:
                                    continue
                        return d
                except Exception:
                    pass
                # Sets and querysets
                try:
                    from django.db.models.query import QuerySet as _QuerySet
                    if isinstance(o, (set, frozenset, list, tuple, _QuerySet)):
                        return list(o)
                except Exception:
                    if isinstance(o, (set, frozenset, list, tuple)):
                        return list(o)
                return super().default(o)

        payload = json.dumps(backup, ensure_ascii=False, indent=2, cls=Encoder)

        # Filename
        base = company.short_name or company.name or 'company'
        safe = re.sub(r"[^A-Za-z0-9_-]+", "_", base).strip('_') or 'company'
        stamp = datetime.now().strftime('%Y%m%d')
        filename = f"{safe}_backup_{stamp}.json"
        resp = HttpResponse(payload, content_type='application/json; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        return resp

    @action(detail=True, methods=['post'])
    def backup_import(self, request, pk=None):
        """Import backup JSON into the selected company.
        Multipart form: file, scopes (optional CSV or repeated), strategy=replace|merge (default replace)
        """
        company = self.get_object()
        uploaded = request.FILES.get('file')
        if not uploaded:
            return Response({'error': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)
        strategy = (request.data.get('strategy') or 'replace').lower()
        scopes = request.data.getlist('scopes') or []
        try:
            raw = uploaded.read().decode('utf-8')
            data = json.loads(raw)
        except Exception as e:
            return Response({'error': f'Invalid JSON: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        present_scopes = set([k for k in data.keys() if k not in ['meta']])
        # Map external keys to internal scope handlers
        scope_map = {
            'company': 'company',
            'company_bank_accounts': 'bank_accounts',
            'company_email_settings': 'email_settings',
            'company_nav_configurations': 'nav_configs',
            'invoice_blocks': 'invoice_blocks',
            'customers': 'customers',
            'invoices': 'invoices',
            'proformas': 'proformas',
            'bank_statements': 'bank_statements',
            'payment_batches': 'payment_batches',
            'incoming_digests': 'incoming',
            'incoming_datas': 'incoming',
            'vat_types': 'vat_types',
            'system_users': 'users',
            'users': 'users',
        }
        if not scopes:
            scopes = sorted({scope_map.get(k, k) for k in present_scopes})

        results = { 'strategy': strategy, 'scopes': scopes }

        def as_uuid(val):
            return val

        with transaction.atomic():
            # Users (SystemUser): upsert by email and attach to this company
            if 'users' in scopes and (data.get('system_users') or data.get('users')):
                rows = data.get('system_users') or data.get('users') or []
                if strategy == 'replace':
                    # Remove existing company relations, keep users intact
                    try:
                        through = SystemUser.companies.through
                        through.objects.filter(company_id=company.id).delete()
                    except Exception:
                        pass
                for row in rows:
                    r = row.copy()
                    r.pop('id', None)
                    comp_ids = r.pop('companies', [])
                    email = r.get('email')
                    if not email:
                        continue
                    defaults = r
                    try:
                        obj, created = SystemUser.objects.update_or_create(
                            email=email,
                            defaults=defaults
                        )
                        # Ensure relation to current company
                        obj.companies.add(company)
                    except Exception:
                        continue
                results['users'] = 'upserted'
            # Company fields
            if 'company' in scopes and data.get('company'):
                c = data['company'].copy()
                # do not overwrite identity fields
                ignore = {'id', 'tax_number'}
                for k, v in c.items():
                    if k in ignore:
                        continue
                    try:
                        setattr(company, k, v)
                    except Exception:
                        pass
                company.save()
                results['company'] = 'updated'

            # VAT Types (global): upsert by code
            if 'vat_types' in scopes and data.get('vat_types'):
                for row in data['vat_types']:
                    code = row.get('code')
                    if not code:
                        continue
                    obj, created = VATType.objects.update_or_create(
                        code=code,
                        defaults={
                            'name': row.get('name'),
                            'category': row.get('category') or 'PERCENT',
                            'percentage': row.get('percentage'),
                            'description': row.get('description'),
                            'active': bool(row.get('active', True)),
                            'sort_order': row.get('sort_order', 0),
                        }
                    )
                results['vat_types'] = 'upserted'

            # Customers: upsert by tax_number
            id_map_customers = {}
            if 'customers' in scopes and data.get('customers'):
                for row in data['customers']:
                    tax = row.get('tax_number')
                    defaults = row.copy()
                    defaults.pop('id', None)
                    try:
                        obj, created = Customer.objects.update_or_create(
                            tax_number=tax,
                            defaults=defaults
                        )
                        id_map_customers[str(row.get('id'))] = str(obj.id)
                    except Exception:
                        continue
                results['customers'] = 'upserted'

            # Company Bank Accounts
            if 'bank_accounts' in scopes and data.get('company_bank_accounts'):
                if strategy == 'replace':
                    CompanyBankAccount.objects.filter(company=company).delete()
                for row in data['company_bank_accounts']:
                    row = row.copy()
                    row['company'] = company
                    row.pop('id', None)
                    CompanyBankAccount.objects.create(**row)
                results['bank_accounts'] = 'imported'

            # Email settings (replace)
            if 'email_settings' in scopes and data.get('company_email_settings'):
                CompanyEmailSettings.objects.filter(company=company).delete()
                row = data['company_email_settings'].copy()
                row.pop('id', None)
                row['company'] = company
                CompanyEmailSettings.objects.create(**row)
                results['email_settings'] = 'imported'

            # NAV configs
            if 'nav_configs' in scopes and data.get('company_nav_configurations'):
                if strategy == 'replace':
                    CompanyNAVConfiguration.objects.filter(company=company).delete()
                for row in data['company_nav_configurations']:
                    row = row.copy()
                    row.pop('id', None)
                    row['company'] = company
                    CompanyNAVConfiguration.objects.create(**row)
                results['nav_configs'] = 'imported'

            # Invoice blocks
            if 'invoice_blocks' in scopes and data.get('invoice_blocks'):
                if strategy == 'replace':
                    InvoiceBlock.objects.filter(company=company).delete()
                for row in data['invoice_blocks']:
                    row = row.copy()
                    row.pop('id', None)
                    row['company'] = company
                    # Map FK nav_configuration if present
                    nc_id = row.pop('nav_configuration', None)
                    if nc_id:
                        try:
                            row['nav_configuration'] = CompanyNAVConfiguration.objects.filter(company=company).first()
                        except Exception:
                            row['nav_configuration'] = None
                    InvoiceBlock.objects.create(**row)
                results['invoice_blocks'] = 'imported'

            # Invoices (replace): delete existing and recreate
            id_map_invoices = {}
            if 'invoices' in scopes and data.get('invoices'):
                if strategy == 'replace':
                    # collect item ids to cleanup later
                    item_ids = set()
                    for inv in Invoice.objects.filter(company=company):
                        item_ids.update(list(inv.items.values_list('id', flat=True)))
                    Invoice.objects.filter(company=company).delete()
                    # try to delete items that belonged to these invoices
                    try:
                        from invoices.models import InvoiceItem as Itm
                        Itm.objects.filter(id__in=list(item_ids)).delete()
                    except Exception:
                        pass
                for row in data['invoices']:
                    inv_d = row.get('invoice') or {}
                    items = row.get('items') or []
                    inv_d = inv_d.copy()
                    # map foreign keys
                    inv_d['company'] = company
                    cust_id = inv_d.pop('customer', None)
                    if cust_id:
                        # use mapped customer id or fallback to tax_number mapping not available here
                        try:
                            inv_d['customer'] = Customer.objects.get(id=id_map_customers.get(str(cust_id), str(cust_id)))
                        except Exception:
                            continue
                    block_id = inv_d.pop('invoice_block', None)
                    if block_id:
                        try:
                            inv_d['invoice_block'] = InvoiceBlock.objects.filter(company=company).first()
                        except Exception:
                            inv_d['invoice_block'] = None
                    # remove non-portable fields
                    for drop in ['created_by', 'nav_response', 'created_at', 'updated_at']:
                        inv_d.pop(drop, None)
                    # ensure no M2M assigns sneak in
                    inv_d.pop('items', None)
                    # hold original id for mapping
                    orig_id = inv_d.pop('id', None)
                    # merge strategy: skip if same invoice_number exists
                    if strategy == 'merge':
                        try:
                            existing = Invoice.objects.filter(company=company, invoice_number=inv_d.get('invoice_number')).first()
                            if existing:
                                id_map_invoices[str(orig_id or '')] = str(existing.id)
                                continue
                        except Exception:
                            pass
                    # create invoice first (items after create to attach)
                    inv = Invoice.objects.create(**inv_d)
                    for it in items:
                        it = it.copy()
                        it.pop('id', None)
                        vt_id = it.pop('vat_type', None)
                        if vt_id:
                            try:
                                it['vat_type'] = VATType.objects.filter(id=vt_id).first()
                            except Exception:
                                it['vat_type'] = None
                        item_obj = InvoiceItem.objects.create(**it)
                        inv.items.add(item_obj)
                    id_map_invoices[str(orig_id or '')] = str(inv.id)
                results['invoices'] = 'imported'

            # Proformas
            if 'proformas' in scopes and data.get('proformas'):
                if strategy == 'replace':
                    ProformaInvoice.objects.filter(company=company).delete()
                for row in data['proformas']:
                    pf_d = row.get('proforma') or {}
                    items = row.get('items') or []
                    pf_d = pf_d.copy()
                    pf_d['company'] = company
                    cust_id = pf_d.pop('customer', None)
                    if cust_id:
                        try:
                            pf_d['customer'] = Customer.objects.get(id=id_map_customers.get(str(cust_id), str(cust_id)))
                        except Exception:
                            continue
                    for drop in ['created_by', 'created_at', 'updated_at']:
                        pf_d.pop(drop, None)
                    # ensure no M2M assigns sneak in
                    pf_d.pop('items', None)
                    pf_d.pop('id', None)
                    pf = ProformaInvoice.objects.create(**pf_d)
                    for it in items:
                        it = it.copy()
                        it.pop('id', None)
                        vt_id = it.pop('vat_type', None)
                        if vt_id:
                            it['vat_type'] = VATType.objects.filter(id=vt_id).first()
                        item_obj = InvoiceItem.objects.create(**it)
                        pf.items.add(item_obj)
                results['proformas'] = 'imported'

            # Bank statements
            if 'bank_statements' in scopes and data.get('bank_statements'):
                if strategy == 'replace':
                    BankStatement.objects.filter(company=company).delete()
                for row in data['bank_statements']:
                    st = row.get('statement') or {}
                    items = row.get('items') or []
                    st = st.copy()
                    st['company'] = company
                    st['created_by'] = None
                    st.pop('id', None)
                    st['bank_account'] = CompanyBankAccount.objects.filter(company=company).first()
                    bs = BankStatement.objects.create(**st)
                    for it in items:
                        it = it.copy()
                        it['bank_statement'] = bs
                        cust = it.get('customer')
                        inv_id = it.get('invoice')
                        if cust:
                            try:
                                it['customer'] = Customer.objects.get(id=id_map_customers.get(str(cust), str(cust)))
                            except Exception:
                                it['customer'] = None
                        if inv_id:
                            try:
                                it['invoice'] = Invoice.objects.get(id=id_map_invoices.get(str(inv_id), str(inv_id)))
                            except Exception:
                                it['invoice'] = None
                        it.pop('id', None)
                        BankStatementItem.objects.create(**it)
                results['bank_statements'] = 'imported'

            # Payment batches
            if 'payment_batches' in scopes and data.get('payment_batches'):
                if strategy == 'replace':
                    PaymentBatch.objects.filter(company=company).delete()
                for row in data['payment_batches']:
                    b = row.get('batch') or {}
                    items = row.get('items') or []
                    b = b.copy()
                    b['company'] = company
                    b['created_by'] = None
                    b['bank_account'] = CompanyBankAccount.objects.filter(company=company).first()
                    b.pop('id', None)
                    batch = PaymentBatch.objects.create(**b)
                    for it in items:
                        it = it.copy()
                        it['batch'] = batch
                        it.pop('id', None)
                        PaymentBatchItem.objects.create(**it)
                results['payment_batches'] = 'imported'

            # Incoming
            if 'incoming' in scopes and (data.get('incoming_digests') or data.get('incoming_datas')):
                if strategy == 'replace':
                    IncomingInvoiceDigest.objects.filter(company=company).delete()
                    IncomingInvoiceData.objects.filter(company=company).delete()
                if data.get('incoming_digests'):
                    for row in data['incoming_digests']:
                        row = row.copy()
                        row.pop('id', None)
                        row['company'] = company
                        IncomingInvoiceDigest.objects.create(**row)
                if data.get('incoming_datas'):
                    for row in data['incoming_datas']:
                        row = row.copy()
                        row.pop('id', None)
                        row['company'] = company
                        IncomingInvoiceData.objects.create(**row)
                results['incoming'] = 'imported'

        return Response({'success': True, 'results': results})


class RoleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing roles and menu permissions"""
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = []  # Nincs autentikáció szükséges

    def get_queryset(self):
        qs = Role.objects.all()
        search = self.request.query_params.get('search')
        is_active = self.request.query_params.get('is_active')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs

    @action(detail=False, methods=['get'])
    def menu_options(self, request):
        return Response({'menus': ROLE_MENU_OPTIONS})


class SystemUserViewSet(viewsets.ModelViewSet):
    """ViewSet for managing system users"""
    queryset = SystemUser.objects.all()
    permission_classes = []  # Nincs autentikáció szükséges

    def get_serializer_class(self):
        if self.action in ['create']:
            return SystemUserCreateSerializer
        return SystemUserSerializer

    def get_queryset(self):
        queryset = SystemUser.objects.prefetch_related('companies', 'roles').all()
        search = self.request.query_params.get('search', None)
        is_active = self.request.query_params.get('is_active', None)
        company_id = self.request.query_params.get('company_id', None)
        
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search)
            )
        
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        if company_id:
            queryset = queryset.filter(companies__id=company_id)
        
        return queryset

    def create(self, request, *args, **kwargs):
        """Create system user with password hashing"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        return Response(
            SystemUserSerializer(user).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def set_password(self, request, pk=None):
        """Set password for system user"""
        user = self.get_object()
        password = request.data.get('password')
        
        if not password:
            return Response(
                {'error': 'Password is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user.set_password(password)
        user.save()  # Save the hashed password
        return Response({'message': 'Password updated successfully'})

    @action(detail=True, methods=['post'])
    def check_password(self, request, pk=None):
        """Check password for system user"""
        user = self.get_object()
        password = request.data.get('password')
        
        if not password:
            return Response(
                {'error': 'Password is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        is_valid = user.check_password(password)
        return Response({'is_valid': is_valid})


class InvoiceBlockViewSet(viewsets.ModelViewSet):
    """ViewSet for managing invoice blocks"""
    queryset = InvoiceBlock.objects.all()
    serializer_class = InvoiceBlockSerializer
    permission_classes = []  # Nincs autentikáció szükséges

    def get_queryset(self):
        queryset = InvoiceBlock.objects.select_related('company', 'nav_configuration').all()
        company_id = self.request.query_params.get('company_id', None)
        is_active = self.request.query_params.get('is_active', None)
        
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset

    @action(detail=True, methods=['post'])
    def generate_invoice_number(self, request, pk=None):
        """Generate next invoice number for this block"""
        block = self.get_object()
        
        if not block.is_active:
            return Response(
                {'error': 'Invoice block is not active'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        invoice_number = block.get_next_invoice_number()
        return Response({
            'invoice_number': invoice_number,
            'current_number': block.current_number
        })

    @action(detail=True, methods=['get'])
    def preview_next_number(self, request, pk=None):
        """Preview next invoice number without incrementing the counter"""
        block = self.get_object()
        from datetime import datetime
        year = datetime.now().year
        # get_next_invoice_number() uses current_number then increments, so preview mirrors that without increment
        next_number = f"{block.prefix}{year}{block.current_number:06d}"
        return Response({'invoice_number': next_number})

    @action(detail=True, methods=['post'])
    def regenerate_api_key(self, request, pk=None):
        """Regenerate API-key for a company and return updated object."""
        import secrets
        company = self.get_object()
        company.api_key = secrets.token_urlsafe(32)
        company.save()
        serializer = self.get_serializer(company)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """Toggle active status of the invoice block"""
        block = self.get_object()
        block.is_active = not block.is_active
        block.save()
        
        status_text = 'activated' if block.is_active else 'deactivated'
        return Response({'message': f'Invoice block {status_text} successfully'})


class CompanyNAVConfigurationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing company-specific NAV configurations"""
    queryset = CompanyNAVConfiguration.objects.all()
    serializer_class = CompanyNAVConfigurationSerializer
    permission_classes = []  # Nincs autentikáció szükséges

    def get_queryset(self):
        queryset = CompanyNAVConfiguration.objects.select_related('company').all()
        company_id = self.request.query_params.get('company_id', None)
        is_active = self.request.query_params.get('is_active', None)
        is_default = self.request.query_params.get('is_default', None)
        
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        if is_default is not None:
            queryset = queryset.filter(is_default=is_default.lower() == 'true')
        
        return queryset

    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        """Test NAV API connection for a CompanyNAVConfiguration using token exchange."""
        cfg = self.get_object()
        try:
            svc = NAVService(cfg)
            result = svc.get_token()
            if result.get('success'):
                return Response({'success': True, 'message': 'Kapcsolat rendben', 'token': result.get('token', '')})
            return Response({
                'success': False,
                'error': result.get('error') or 'Kapcsolat hiba',
                'func_code': result.get('func_code'),
                'error_message': result.get('error_message'),
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception('Company NAV config test_connection error')
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CustomerBankAccountViewSet(viewsets.ModelViewSet):
    queryset = CustomerBankAccount.objects.select_related('customer').all()
    serializer_class = CustomerBankAccountSerializer
    permission_classes = []

    def get_queryset(self):
        qs = super().get_queryset()
        customer_id = self.request.query_params.get('customer_id')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        if instance.is_primary:
            CustomerBankAccount.objects.filter(customer=instance.customer).exclude(id=instance.id).update(is_primary=False)

    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.is_primary:
            CustomerBankAccount.objects.filter(customer=instance.customer).exclude(id=instance.id).update(is_primary=False)

    @action(detail=True, methods=['post'])
    def set_primary(self, request, pk=None):
        acc = self.get_object()
        CustomerBankAccount.objects.filter(customer=acc.customer).update(is_primary=False)
        acc.is_primary = True
        acc.save()
        return Response({'message': 'Primary bank account set'})


class CompanyBankAccountViewSet(viewsets.ModelViewSet):
    queryset = CompanyBankAccount.objects.select_related('company').all()
    serializer_class = CompanyBankAccountSerializer
    permission_classes = []

    def get_queryset(self):
        qs = super().get_queryset()
        company_id = self.request.query_params.get('company_id')
        if company_id:
            qs = qs.filter(company_id=company_id)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        if instance.is_primary:
            CompanyBankAccount.objects.filter(company=instance.company).exclude(id=instance.id).update(is_primary=False)

    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.is_primary:
            CompanyBankAccount.objects.filter(company=instance.company).exclude(id=instance.id).update(is_primary=False)

    @action(detail=True, methods=['post'])
    def set_primary(self, request, pk=None):
        acc = self.get_object()
        CompanyBankAccount.objects.filter(company=acc.company).update(is_primary=False)
        acc.is_primary = True
        acc.save()
        return Response({'message': 'Primary bank account set'})


class VATTypeViewSet(viewsets.ModelViewSet):
    queryset = VATType.objects.all()
    serializer_class = VATTypeSerializer
    permission_classes = []


class BankStatementViewSet(viewsets.ModelViewSet):
    queryset = BankStatement.objects.all().select_related('company', 'bank_account')
    serializer_class = BankStatementSerializer
    permission_classes = []

    def get_queryset(self):
        qs = super().get_queryset()
        company_id = self.request.query_params.get('company')
        bank_account_id = self.request.query_params.get('bank_account')
        if company_id:
            qs = qs.filter(company_id=company_id)
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)
        return qs.order_by('-statement_date', '-created_at')

    @action(detail=False, methods=['post'], url_path='import-zip')
    def import_zip(self, request):
        """Import one or more bank statement ZIP files that contain PDF_STATEMENT_*.pdf.
        Creates BankStatement headers only (no items yet) based on filename data.
        """
        files = request.FILES.getlist('files') or request.FILES.getlist('file')
        company_id = request.data.get('company') or request.data.get('company_id')
        dry_run = str(request.data.get('dry_run', '0')) in ('1', 'true', 'True')
        if not files:
            return Response({'error': 'Nem kaptam fájlokat (files)'}, status=status.HTTP_400_BAD_REQUEST)
        if not company_id:
            return Response({'error': 'company kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        company = get_object_or_404(Company, id=company_id)

        import zipfile, io, re
        created = 0
        errors = []
        preview = []
        skipped = []

        def normalize_acct(s: str):
            return re.sub(r'\D+', '', (s or ''))

        # Prepare bank account lookup by account number fragment present in filenames
        # Filename pattern example:
        # PDF_STATEMENT_YYYYMMDD_109180010000007368410003_N.pdf
        #                         ^^^^^^^^^^^^^^^^^^^^^^^ account number
        acct_map = {}
        for acc in CompanyBankAccount.objects.filter(company=company):
            if acc.iban:
                acct_map[normalize_acct(acc.iban)] = acc
            if acc.account_number:
                acct_map[normalize_acct(acc.account_number)] = acc

        for f in files:
            try:
                data = f.read()
                zf = zipfile.ZipFile(io.BytesIO(data))
            except Exception as e:
                errors.append({'file': getattr(f, 'name', 'unknown'), 'error': f'Nem ZIP: {e}'})
                continue
            for name in zf.namelist():
                if not name.upper().startswith('PDF_STATEMENT_') or not name.lower().endswith('.pdf'):
                    continue
                m = re.search(r'PDF_STATEMENT_(\d{8})_(\d+)_([A-Z])?\.pdf$', name, re.IGNORECASE)
                if not m:
                    reason = 'Nem ismert fájlnév minta'
                    skipped.append({'file': name, 'reason': reason})
                    preview.append({'file': name, 'creatable': False, 'reason': reason})
                    continue
                yyyymmdd = m.group(1)
                acct_str = m.group(2)
                try:
                    stmt_date = datetime.strptime(yyyymmdd, '%Y%m%d').date()
                except Exception:
                    reason = 'Dátum parse hiba'
                    skipped.append({'file': name, 'reason': reason})
                    preview.append({'file': name, 'creatable': False, 'reason': reason})
                    continue
                # Find bank account by number substring match
                bank_acc = None
                key = normalize_acct(acct_str)
                # Match against cleaned account_numbers
                for k, acc in acct_map.items():
                    if key and key in k:
                        bank_acc = acc
                        break
                if not bank_acc:
                    reason = 'Bankszámla nem található a cégnél'
                    skipped.append({'file': name, 'reason': reason})
                    preview.append({'file': name, 'statement_date': str(stmt_date), 'currency': None, 'creatable': False, 'reason': reason})
                    continue
                # Determine currency from filename parent dir or fallback to bank account currency
                currency = getattr(bank_acc, 'currency', 'HUF')
                # Sequence number suggestion
                seq = f"{stmt_date.strftime('%Y/%m/%d')}-{key[-4:]}"
                # Avoid duplicates: same date + bank_account
                exists = BankStatement.objects.filter(company=company, bank_account=bank_acc, statement_date=stmt_date).first()
                if exists:
                    reason = 'Már létezik erre a dátumra kivonat ezen a számlán'
                    skipped.append({'file': name, 'reason': reason})
                    preview.append({
                        'file': name,
                        'account_id': str(bank_acc.id),
                        'account_label': f"{bank_acc.bank_name or ''} {(bank_acc.iban or bank_acc.account_number or '').strip()}",
                        'statement_date': str(stmt_date),
                        'currency': currency,
                        'exists': True,
                        'creatable': False,
                        'sequence_number': seq,
                        'reason': reason,
                    })
                    continue
                # Preview entry (potentially creatable)
                preview.append({
                    'file': name,
                    'account_id': str(bank_acc.id),
                    'account_label': f"{bank_acc.bank_name or ''} {(bank_acc.iban or bank_acc.account_number or '').strip()}",
                    'statement_date': str(stmt_date),
                    'currency': currency,
                    'exists': False,
                    'creatable': True,
                    'sequence_number': seq,
                })
                if not dry_run:
                    st = BankStatement(company=company, bank_account=bank_acc, statement_date=stmt_date, sequence_number=seq, currency=currency)
                    if request.user and request.user.is_authenticated:
                        st.created_by = request.user
                    st.save()
                    created += 1
        if dry_run:
            # Summary counts
            counts = {
                'creatable': sum(1 for p in preview if p.get('creatable')),
                'existing': sum(1 for p in preview if p.get('exists')),
                'skipped': len([s for s in skipped]),
            }
            return Response({'success': True, 'preview': preview, 'counts': counts, 'errors': errors})
        return Response({'success': True, 'created': created, 'skipped': skipped, 'errors': errors})

    def _decode_bytes(self, data: bytes) -> str:
        for enc in ('cp1250', 'iso-8859-2', 'utf-8', 'latin1'):
            try:
                return data.decode(enc)
            except Exception:
                continue
        return data.decode('latin1', errors='ignore')

    def _parse_stm_txt(self, content: bytes):
        text = None
        # Try encodings in order
        for enc in ['cp852', 'latin2', 'cp1250', 'utf-8']:
            try:
                text = content.decode(enc)
                try:
                    # Quick heuristic check if it looks right (no garbage chars like unknown replacement char)
                    # But Python usually raises error on strict. Let's use it.
                    # Or check for '86DEB' header
                    if '86DEB' in text:
                         break
                except:
                    pass
            except:
                pass
        
        if not text:
             # Fallback
             text = content.decode('utf-8', errors='ignore')

        lines = text.splitlines()
        headers_found = []
        current_header = None
        current_item = None
        items = [] # current header items
        import datetime

        for line_idx, line in enumerate(lines):
            if len(line) < 4: continue
            rec_type = line[0:2]

            if rec_type == '86':
                acc = line[6:30].strip()
                stmt_date_raw = line[30:38]
                seq = line[38:42]
                
                currency = 'HUF' # Default
                if 'EUR' in line: currency = 'EUR'
                elif 'USD' in line: currency = 'USD'
                
                item_list = []
                current_header = {
                    'account_raw': acc,
                    'statement_date': f"{stmt_date_raw[:4]}-{stmt_date_raw[4:6]}-{stmt_date_raw[6:]}",
                    'sequence_number': seq,
                    'currency': currency,
                    'items': item_list
                }
                headers_found.append(current_header)
                items = item_list
                current_item = None
            
            elif rec_type == '87':
                if line[6:30].strip() == '':
                     # Continuation
                     if len(line) > 61:
                         text_part = line[61:].strip()
                         # Clean garbage zeros often found at end of continuation lines
                         # Example: "Benzink t                          00000000"
                         # Split by multiple spaces if possible to isolate the text?
                         # Or just heuristics.
                         if '   00000' in text_part:
                             text_part = text_part.split('   00000')[0].strip()
                     else:
                         text_part = ''
                         
                     if current_item and text_part:
                          current_item['remittance_parts'].append(text_part)
                else:
                    bk_date = line[45:53]
                    # Value date usually at 96:104, BUT for shorter lines (Brutto Interest) it might be shifted?
                    # Analysis of Line 31 (Brutto Interest):
                    # 87D...684100032025123100000162025122200375800Brutto Interest                    2025122220251229 000000008856822
                    # Ruler shows:
                    # Brutto Interest starts at 63.
                    # Date 20251222 is at ... index 112? No.
                    # Let's count from end.
                    # End: ' 000000008856822' (Length 16) -> Amount + sign?
                    # The amount part seems consistently at the end for these special lines?
                    
                    # Standard parsing first
                    sign_char = line[112] if len(line) > 112 else ''
                    amount_str = line[113:128] if len(line) > 128 else '0'
                    
                    # Special Case: "Brutto Interest", "BETÉT", "POS" lines
                    # These lines seem to often have the amount at the very end of the line.
                    # Line 31 length: 144
                    # Amount is at 128:144?
                    # Let's check if the standard Amount parsing yielded 0 but the line has numbers at the end.
                    # Or simpler: The amount format in these special lines is:
                    # 2025122220251229 000000008856822 (Date1 Date2 Amount)
                    # Standard:
                    # 2025121520251215-000000000518193
                    # It seems ALL lines have amount at the end, but the offset might be shifted if spaces are missing/added?
                    # The Standard Lines in debug analysis (Lines 311, 313) perfectly align with the tail.
                    # Tail 16: '-000000000518193'
                    # So Sign is -16, Amount is -15..end.
                    
                    # Let's try parsing from the tail of the line if the standard fixed pos failed or is 0?
                    # Or just always parse from tail?
                    # Standard line length is usually 128? No, looking at debug, Line 31 is 144 chars long.
                    # Standard lines are also long.
                    # My previous logic used fixed pos: `line[113:128]`.
                    # If the line is longer, 113:128 might be in the middle of text?
                    # Let's check Line 31.
                    # 0..128: ...Brutto Interest                    2025122220251229 00
                    # 113 is '20251229 00'. So float conversion failed or returned garbage (if handled).
                    
                    # NEW STRATEGY: Amount is always the last 15 characters. Sign is the one before it.
                    if len(line) >= 16:
                        amount_str = line[-15:]
                        sign_char = line[-16]
                    
                    try:
                        amt = float(amount_str) / 100.0
                        if sign_char == '-': amt = -amt
                    except:
                        amt = 0.0
                    
                    val_date_raw = line[96:104]
                    # On the special lines, value date position might be different?
                    # Line 31: ...Brutto Interest... 20251222 20251229
                    # 20251229 is Value Date? It is just before the amount. 
                    # If I read from end: Amount (15), Sign (1), ValueDate (8), BookingDate (8) ?
                    # -15: Amount
                    # -16: Sign
                    # -24:-16: ValueDate (20251229)
                    # -32:-24: BookingDate (20251222)
                    
                    # Let's use this tail-based logic if the line is a "Special" generic transaction line
                    # How to detect? They don't have +IZV?
                    # Standard line 84: ...+IZV...
                    # Special line 31: ...Brutto Interest...
                    
                    # Let's check if the standard fixed pos logic works for 84?
                    # Line 84 ends with '...20251212 000000003537000'
                    # It also matches the tail pattern!
                    # So I will switch to using tail-based parsing for Amount and Value Date for ALL 87 lines.
                    
                    if len(line) >= 32:
                         # Last 15 digits is amount
                         amount_str = line[-15:]
                         sign_char = line[-16]
                         
                         val_date_raw = line[-24:-16]
                         # bk_date_2 = line[-32:-24] # redundancy check?
                    
                    def to_date_obj(ds):
                        try:
                            return datetime.date(int(ds[:4]), int(ds[4:6]), int(ds[6:]))
                        except:
                            return None

                    # Use original Booking Date from beginning of line (45:53) as primary?
                    # Or the one from the tail?
                    # Line 84: 45:53 is 20251212. Tail is 20251212. Matches.
                    # Line 31: 45:53 is 20251222. Tail is 20251222. Matches.
                    b_date = to_date_obj(bk_date)
                    v_date = to_date_obj(val_date_raw)
                    
                    tx_id = f"{current_header['statement_date']}-{current_header['sequence_number']}-{len(items)+1}"
                    
                    raw_desc = line[61:96].strip()
                    digit_count = sum(c.isdigit() for c in raw_desc)
                    desc_candidate = ''
                    if len(raw_desc) > 0 and (digit_count / len(raw_desc)) < 0.8:
                        desc_candidate = raw_desc

                    current_item = {
                        'amount': amt,
                        'currency': current_header.get('currency', 'HUF'),
                        'booking_date': b_date,
                        'value_date': v_date, 
                        'remittance_parts': [],
                        'counterparty_name': '',
                        'counterparty_account': '',
                        'transaction_id': tx_id,
                        'line_87_desc': desc_candidate
                    }
                    items.append(current_item)

            elif rec_type == '91':
                if current_item:
                    acc_raw = line[27:51].strip()
                    acc_final = ''
                    if len(acc_raw) == 24:
                        acc_final = f"{acc_raw[0:8]}-{acc_raw[8:16]}-{acc_raw[16:24]}"
                    elif len(acc_raw) == 16:
                        acc_final = f"{acc_raw[0:8]}-{acc_raw[8:16]}"
                    else:
                        acc_final = acc_raw
                    
                    current_item['counterparty_account'] = acc_final
                    
                    name_1 = line[118:150].strip()
                    name_2 = line[170:210]
                    # Fix: Remove date if accidentally captured at the end of Name 2
                    # Example raw: 'Kissné Varga Bettina            20251231'
                    if len(name_2) > 8 and name_2[-8:].isdigit() and name_2[-8:].startswith('20'):
                         name_2 = name_2[:-8]
                    name_2 = name_2.strip()
                    
                    # Logic Check from debug_stm_fix:
                    # Line 322 (91) - Sign '-' (Outgoing)
                    #   N1: 'CEZE ÚT...' (True)
                    #   N2: 'OMV HUNGÁRIA...' (False)
                    # So for Outgoing, Partner is Name2.
                    
                    # Line 310 (91) - Sign '-' (Outgoing Pos Comission?)
                    #   N1: 'CEZE ÚT...'
                    #   N2: 'Kupon Portfólió...'
                    # Partner is Name2.
                    
                    # Line 2 (91) - Sign ' ' (Incoming)
                    #   N1: 'MASTER MELDOR...'
                    #   N2: 'Ceze Kft...'
                    # Partner is Name1.
                    
                    # Revised Rule:
                    if current_item['amount'] < 0:
                        current_item['counterparty_name'] = name_2
                    else:
                        current_item['counterparty_name'] = name_1
                    
                    rem_cand = line[210:].strip()
                    # Often the line ends with many 0s used as padding. Remove them.
                    # We start looking for '0000' from the end backwards or logic?
                    # In debug, the 0s are spaces separated? No, debug showed " CZ...   00000...".
                    # Let's clean up: split by '00000' and take the first part
                    if '000000' in rem_cand:
                        rem_cand = rem_cand.split('000000')[0].strip()
                        
                    current_item['remittance_parts'].append(rem_cand)

        # Post process items
        for h in headers_found:
            for it in h['items']:
                parts = [p for p in it.pop('remittance_parts') if p]
                it['remittance'] = " ".join(parts)
                
                # Check line_87_desc
                l87_desc = it.pop('line_87_desc', '').strip()
                
                # Ensure fields exist
                if not it.get('counterparty_name'):
                     # Fallback to description if available
                     if l87_desc:
                         it['counterparty_name'] = l87_desc
                     else:
                         it['counterparty_name'] = ''
                     
                else:
                    # If we have a name, but also a description from 87, prepend/append it to remittance?
                    # Or check if regex like "POS..."
                    if l87_desc and l87_desc not in it['remittance']:
                         it['remittance'] = (l87_desc + " " + it['remittance']).strip()
                         
                if not it.get('counterparty_account'):
                     it['counterparty_account'] = ''
                
                # Convert dates to string YYYY-MM-DD to match XML parser
                if it.get('booking_date'):
                    d = it['booking_date']
                    if hasattr(d, 'strftime'):
                        it['booking_date'] = d.strftime('%Y-%m-%d')
                
                if it.get('value_date'):
                    d = it['value_date']
                    if hasattr(d, 'strftime'):
                        it['value_date'] = d.strftime('%Y-%m-%d')

        return headers_found

    def _parse_camt053_xml(self, content: bytes):
        import xml.etree.ElementTree as ET
        try:
            root = ET.fromstring(content)
        except Exception:
            return []

        ns_map = {}
        if root.tag.startswith('{'):
            uri = root.tag.split('}')[0].strip('{')
            ns_map = {'ns': uri}
        
        def find(node, path):
            if ns_map:
                # convert 'A/B' to 'ns:A/ns:B'
                p = '/'.join(('ns:' + x) for x in path.split('/'))
                return node.find(p, ns_map)
            return node.find(path)

        def findall(node, path):
            if ns_map:
                p = '/'.join(('ns:' + x) for x in path.split('/'))
                return node.findall(p, ns_map)
            return node.findall(path)

        def get_text(node, path):
            el = find(node, path)
            return el.text.strip() if el is not None and el.text else None

        # Find BkToCstmrStmt
        bk_node = find(root, 'BkToCstmrStmt')
        if bk_node is None and 'BkToCstmrStmt' in root.tag:
            bk_node = root
        
        parsed_stmts = []
        if bk_node is None:
            return []

        for stmt in findall(bk_node, 'Stmt'):
            # Header
            lgl_seq_nb = get_text(stmt, 'LglSeqNb')
            acct_id = get_text(stmt, 'Acct/Id/IBAN')
            if not acct_id:
                acct_id = get_text(stmt, 'Acct/Id/Othr/Id')
            
            curr = get_text(stmt, 'Acct/Ccy')
            
            # Statement Date from Closing Balance (CLBD)
            stmt_date = None
            for bal in findall(stmt, 'Bal'):
                tp = get_text(bal, 'Tp/CdOrPrtry/Cd')
                if tp == 'CLBD':
                    stmt_date = get_text(bal, 'Dt/Dt')
                    break
            if not stmt_date:
                # Fallback to CreDtTm
                cre_dt = get_text(stmt, 'CreDtTm')
                if cre_dt:
                    stmt_date = cre_dt[:10]

            items = []
            header = {
                'account_raw': acct_id,
                'currency': curr or 'HUF',
                'statement_date': stmt_date,
                'sequence_number': lgl_seq_nb,
                'items': items
            }
            parsed_stmts.append(header)
            
            # Entries
            for ntry in findall(stmt, 'Ntry'):
                # Check Reversal? If Sts == 'RVSD', maybe skip?
                # For now assume all booked
                
                # Amount
                amt_node = find(ntry, 'Amt')
                amt_val = 0.0
                if amt_node is not None and amt_node.text:
                    try:
                        amt_val = float(amt_node.text)
                    except:
                        pass
                
                # CRDT or DBIT
                ind = get_text(ntry, 'CdtDbtInd')
                if ind == 'DBIT':
                    amt_val = -abs(amt_val)
                else:
                    amt_val = abs(amt_val)
                
                # Dates
                bk_dt = get_text(ntry, 'BookgDt/Dt')
                val_dt = get_text(ntry, 'ValDt/Dt')
                
                # Details
                remittance_parts = []
                cp_name = None
                cp_acct = None
                
                ntry_dtls = find(ntry, 'NtryDtls')
                if ntry_dtls:
                    tx_dtls = find(ntry_dtls, 'TxDtls')
                    if tx_dtls:
                        # Remittance
                        rmt = find(tx_dtls, 'RmtInf')
                        if rmt:
                            for ustrd in findall(rmt, 'Ustrd'):
                                if ustrd.text:
                                    remittance_parts.append(ustrd.text)
                        
                        # Parties
                        partner_tag = 'Cdtr' if ind == 'DBIT' else 'Dbtr'
                        rltd = find(tx_dtls, 'RltdPties')
                        if rltd:
                            p_node = find(rltd, partner_tag)
                            if p_node:
                                cp_name = get_text(p_node, 'Nm')
                            
                            # Account
                            acc_tag = partner_tag + 'Acct'
                            acc_node = find(rltd, acc_tag)
                            if acc_node:
                                cp_acct = get_text(acc_node, 'Id/IBAN') or get_text(acc_node, 'Id/Othr/Id')
                        
                        add_tx_inf = get_text(tx_dtls, 'AddtlTxInf')
                        if add_tx_inf:
                              remittance_parts.append(add_tx_inf)

                # Add AddtlNtryInf (Comment/Megjegyzés) if available
                addtl_info = get_text(ntry, 'AddtlNtryInf')
                if addtl_info and addtl_info not in remittance_parts:
                     # For safety, if remittance is empty, we definitely want this
                     # But user asked to see it if remittance is empty.
                     pass 

                # Combine everything into remittance for display if needed because
                # sometimes 'Brutto Interest' is the ONLY text.
                full_remittance = ' '.join(remittance_parts)
                
                items.append({
                    'booking_date': bk_dt,
                    'value_date': val_dt,
                    'amount': amt_val,
                    'currency': header['currency'],
                    'remittance': full_remittance,
                    'comment': addtl_info or '', # Added specific comment from AddtlNtryInf
                    'counterparty_name': cp_name or '',

                    'counterparty_account': cp_acct or '',
                    'raw': []
                })
        return parsed_stmts

    def _parse_stm(self, text: str):
        import re
        lines = [ln.rstrip('\n') for ln in text.splitlines()]
        statements = []
        current = None
        # Simple state machine: 86DEB header sets account/currency/date; 87DEB blocks are transactions
        for ln in lines:
            if ln.startswith('86DEB'):
                # Start a new header context
                # Try to extract account (long digit run), currency (HUF/EUR), statement date (YYYYMMDD)
                acct = None
                acct_m = re.search(r'(\d{20,32})', ln)
                if acct_m:
                    acct = acct_m.group(1)
                cur = None
                cur_m = re.search(r'\b(HUF|EUR|USD|GBP)\b', ln)
                if cur_m:
                    cur = cur_m.group(1)
                ymd = None
                ymd_m = re.search(r'\b(\d{8})\b', ln)
                if ymd_m:
                    ymd = ymd_m.group(1)
                current = {
                    'account_raw': acct,
                    'currency': cur or 'HUF',
                    'statement_date': ymd,
                    'items': [],
                }
                statements.append(current)
                continue
            if ln.startswith('87DEB') and current is not None:
                # Begin a transaction block; capture subsequent context lines until next 86/87
                block = [ln]
                current['items'].append({'raw': block})
                continue
            # Continuation lines for the last item
            if current and current.get('items'):
                last = current['items'][-1]
                if last and isinstance(last.get('raw'), list):
                    if ln.startswith('86DEB') or ln.startswith('87DEB'):
                        # Next header/txn will handle it in next iterations
                        pass
                    else:
                        last['raw'].append(ln)
        # Post-process items into structured fields
        for st in statements:
            currency = st.get('currency') or 'HUF'
            for it in st['items']:
                block = '\n'.join(it.get('raw') or [])
                # Dates
                dates = re.findall(r'\b(\d{8})\b', block)
                booking_date = dates[0] if dates else st.get('statement_date')
                value_date = dates[1] if len(dates) > 1 else booking_date
                # Amount near currency tokens; pick last number before currency occurrence
                amt = None
                sign = 1
                for cur in ('HUF','EUR','USD','GBP'):
                    m = re.search(r'(\-)?(\d{1,18})\s*'+cur, block)
                    if m:
                        sign = -1 if m.group(1) else 1
                        try:
                            amt = sign * (int(m.group(2)) / 100.0)
                        except Exception:
                            amt = None
                        currency = cur
                # Fallback: last long number in block
                if amt is None:
                    m = re.findall(r'(\-?\d{4,})', block)
                    if m:
                        try:
                            amt = int(m[-1]) / 100.0
                        except Exception:
                            amt = None
                # Remittance/comment: take non-digit tail of first line and subsequent text lines
                first_line = (it.get('raw') or [''])[0]
                rem = first_line
                # Strip leading technical token
                rem = re.sub(r'^87DEB\s+\d+','', rem).strip()
                # Append any additional text lines
                extra = []
                for ln2 in (it.get('raw') or [])[1:]:
                    if not re.search(r'\d{6,}|\b(HUF|EUR|USD|GBP)\b', ln2):
                        extra.append(ln2.strip())
                if extra:
                    rem = (rem + ' ' + ' '.join(extra)).strip()
                # Counterparty account (IBAN or domestic)
                iban = None
                iban_m = re.search(r'\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b', block.replace(' ', ''))
                if iban_m:
                    iban = iban_m.group(0)
                bban = None
                bban_m = re.search(r'\b\d{8}-\d{8}(?:-\d{8})?\b', block)
                if bban_m:
                    bban = bban_m.group(0)
                # Counterparty name heuristic: longest uppercase-ish line without currency
                name = None
                texts = [s for s in (it.get('raw') or []) if not re.search(r'\b(HUF|EUR|USD|GBP)\b|\d{6,}', s)]
                if texts:
                    name = max(texts, key=lambda x: len(x.strip()))[:120].strip()
                it.update({
                    'booking_date': booking_date,
                    'value_date': value_date,
                    'amount': amt,
                    'currency': currency,
                    'remittance': rem[:300],
                    'counterparty_name': name or '',
                    'counterparty_account': iban or bban or '',
                })
        return statements

    def _propose_matches(self, company: Company, stmt_currency: str, items: list):
        # Build quick lookups
        from invoices.models import Customer, CustomerBankAccount, Invoice, IncomingInvoiceDigest
        proposals = []
        def norm_digits(s):
            import re
            return re.sub(r'\D+', '', s or '')
        import unicodedata, difflib, re
        def strip_accents(s: str) -> str:
            if not s:
                return ''
            return ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch))
        def norm_name(s: str) -> str:
            return strip_accents((s or '').lower())
        # Map accounts to customers
        acct_to_customer = {}
        for acc in CustomerBankAccount.objects.filter(customer__in=Customer.objects.filter().only('id')):
            if acc.iban:
                acct_to_customer[acc.iban.replace(' ', '').upper()] = acc.customer
            if acc.account_number:
                acct_to_customer[norm_digits(acc.account_number)] = acc.customer

        # Preload customers once for fuzzy matching
        all_customers = list(Customer.objects.all().only('id', 'name'))
        for idx, it in enumerate(items):
            cp_acct = (it.get('counterparty_account') or '').replace(' ', '').upper()
            ndig = norm_digits(it.get('counterparty_account') or '')
            customer = acct_to_customer.get(cp_acct) or acct_to_customer.get(ndig)
            # Try name-based if no account hit
            customer_candidates = []
            if not customer and it.get('counterparty_name'):
                name = it['counterparty_name'].strip()
                nname = norm_name(name)
                # First pass: substring contains (diacritics-insensitive)
                contains = [c for c in all_customers if nname and norm_name(c.name).find(nname[:20]) >= 0]
                # Second pass: fuzzy ratio
                scored = []
                for c in all_customers[:1000]:
                    ratio = difflib.SequenceMatcher(None, nname[:40], norm_name(c.name)[:40]).ratio()
                    if ratio >= 0.85:
                        scored.append((ratio, c))
                scored.sort(key=lambda x: x[0], reverse=True)
                top = [c for _, c in scored[:5]]
                # Merge unique candidates (top fuzzy + contains)
                seen = set()
                cand_list = []
                for c in top + contains[:5]:
                    if c.id in seen:
                        continue
                    seen.add(c.id)
                    cand_list.append({'id': str(c.id), 'name': c.name})
                customer_candidates = cand_list
                # Fix: Don't pick random top customer if fuzzy match is weak or empty.
                if top:
                    customer = top[0]
                elif contains:
                    customer = contains[0]
                else:
                    customer = None
            # Extract invoice token from remittance
            rem = it.get('remittance') or ''
            token = None
            # Patterns: PREFIX YYYY/NN, PREFIXYYYYNNNN, bare numbers with slashes
            m = re.search(r'([A-Z]{1,4}\s?\d{4}/\d{1,6})', rem)
            if m:
                token = m.group(1).replace(' ', '')
            if not token:
                m = re.search(r'([A-Z]{1,3}\d{4,10})', rem)
                if m:
                    token = m.group(1)
            if not token:
                m = re.search(r'(\d{4}/\d{1,6})', rem)
                if m:
                    token = m.group(1)
            
            candidates = []
            best_candidate = None

            # Determine direction
            try:
                amt_val = float(it.get('amount') or 0)
            except:
                amt_val = 0
            
            # Search by token (both incoming and outgoing)
            if token:
                # Outgoing
                qs = Invoice.objects.filter(company=company, invoice_number__icontains=token).order_by('-issue_date')[:5]
                for inv in qs:
                    candidates.append({
                        'id': str(inv.id), 
                        'invoice_number': inv.invoice_number, 
                        'customer_id': str(inv.customer_id), 
                        'amount': float(inv.total_gross_amount),
                        'type': 'outgoing'
                    })
                # Incoming
                qs_in = IncomingInvoiceDigest.objects.filter(company=company, invoice_number__icontains=token).order_by('-invoice_issue_date')[:5]
                for inv in qs_in:
                    gross = float((inv.invoice_net_amount or 0) + (inv.invoice_vat_amount or 0))
                    candidates.append({
                        'id': str(inv.id),
                        'invoice_number': inv.invoice_number,
                        'supplier_name': inv.supplier_name,
                        'amount': gross,
                        'type': 'incoming'
                    })

            # Search by Amount (if no token match or to supplement)
            # Prioritize based on sign
            if not candidates and amt_val != 0:
                abs_amt = abs(amt_val)
                # If negative (payment out) -> IncomingInvoice (Supplier bill)
                # If positive (payment in) -> Invoice (Customer bill)
                
                if amt_val > 0: # Payment IN -> Invoice
                    qs = Invoice.objects.filter(company=company).order_by('-issue_date')[:100]
                    # Filter for amount match
                    for inv in qs:
                        if abs(float(inv.total_gross_amount) - abs_amt) <= 1.0:
                             candidates.append({
                                'id': str(inv.id),
                                'invoice_number': inv.invoice_number,
                                'customer_id': str(inv.customer_id),
                                'amount': float(inv.total_gross_amount),
                                'type': 'outgoing'
                             })
                elif amt_val < 0: # Payment OUT -> IncomingInvoice
                    qs_in = IncomingInvoiceDigest.objects.filter(company=company).order_by('-invoice_issue_date')[:100]
                    for inv in qs_in:
                        gross = float((inv.invoice_net_amount or 0) + (inv.invoice_vat_amount or 0))
                        if abs(gross - abs_amt) <= 1.0:
                             candidates.append({
                                'id': str(inv.id),
                                'invoice_number': inv.invoice_number,
                                'supplier_name': inv.supplier_name,
                                'amount': gross,
                                'type': 'incoming'
                             })
            
            # Select best candidate
            if candidates:
                # Prefer exact amount match
                exact_matches = [c for c in candidates if abs(c['amount'] - abs(amt_val)) < 1.0]
                if exact_matches:
                    best_candidate = exact_matches[0]
                else:
                    best_candidate = candidates[0]

            can_auto = bool(best_candidate and (customer or best_candidate.get('type')=='incoming')) # Incoming doesn't require customer match strictly

            proposals.append({
                'index': idx,
                'amount': it.get('amount'),
                'currency': it.get('currency') or stmt_currency,
                'booking_date': it.get('booking_date'),
                'value_date': it.get('value_date'),
                'remittance': it.get('remittance'),
                'counterparty_name': it.get('counterparty_name'),
                'counterparty_account': it.get('counterparty_account'),
                'proposed_customer': {'id': str(customer.id), 'name': customer.name} if customer else None,
                'proposed_invoice': best_candidate, # Contains id, invoice_number, type
                'candidates': candidates,
                'customer_candidates': customer_candidates,
                'can_auto': can_auto,
            })
        return proposals

    @action(detail=False, methods=['post'], url_path='import-stm')
    def import_stm(self, request):
        files = request.FILES.getlist('files') or request.FILES.getlist('file')
        company_id = request.data.get('company') or request.data.get('company_id')
        dry_run = str(request.data.get('dry_run', '1')) in ('1','true','True')
        if not files:
            return Response({'error': 'Nem kaptam fájlokat (files)'}, status=status.HTTP_400_BAD_REQUEST)
        if not company_id:
            return Response({'error': 'company kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        company = get_object_or_404(Company, id=company_id)

        import re
        results = []
        from invoices.models import CompanyBankAccount, CustomerBankAccount, BankStatement, BankStatementItem, Customer, Invoice
        for f in files:
            try:
                content = f.read()
            except Exception as e:
                return Response({'error': f'Fájl olvasási hiba: {getattr(f, "name", "?")} - {e}'}, status=status.HTTP_400_BAD_REQUEST)
            
            is_xml = getattr(f, 'name', '').lower().endswith('.xml')
            if not is_xml:
                 if content.strip().startswith(b'<') and b'camt.053' in content:
                     is_xml = True

            if is_xml:
                stmts = self._parse_camt053_xml(content)
            else:
                try:
                    stmts = self._parse_stm_txt(content)
                except Exception as e:
                    return Response({'error': f'Nem sikerült feldolgozni a TXT/STM fájlt: {e}'}, status=400)
            
            # Map header to company bank account
            for st in stmts:
                acct_raw = st.get('account_raw') or ''
                # Try map to Company's bank account
                acct_clean = re.sub(r'\D+', '', acct_raw)
                bank_acc = CompanyBankAccount.objects.filter(company=company).first()
                # Better matching: find by digits substring
                for acc in CompanyBankAccount.objects.filter(company=company):
                    key = re.sub(r'\D+', '', (acc.account_number or acc.iban or ''))
                    if acct_clean and key and acct_clean in key:
                        bank_acc = acc
                        break

                proposals = self._propose_matches(company, st.get('currency') or 'HUF', st.get('items') or [])
                header = {
                    'account_id': str(bank_acc.id) if bank_acc else None,
                    'account_label': (f"{bank_acc.bank_name or ''} {(bank_acc.iban or bank_acc.account_number or '')}".strip()) if bank_acc else acct_raw,
                    'statement_date': st.get('statement_date'),
                    'sequence_number': st.get('sequence_number'),
                    'currency': st.get('currency') or 'HUF',
                    'items': proposals,
                }
                results.append(header)

        if dry_run:
            return Response({'success': True, 'preview': results})

        # Commit not supported in this endpoint without explicit mapping
        return Response({'error': 'Használd az import-stm-commit végpontot a mentéshez'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='import-stm-commit')
    def import_stm_commit(self, request):
        company_id = request.data.get('company') or request.data.get('company_id')
        if not company_id:
            return Response({'error': 'company kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        company = get_object_or_404(Company, id=company_id)
        payload = request.data.get('statements') or []
        if not isinstance(payload, list) or not payload:
            return Response({'error': 'statements tömb szükséges'}, status=status.HTTP_400_BAD_REQUEST)
        from invoices.models import CompanyBankAccount, BankStatement, BankStatementItem, Customer, Invoice, CustomerBankAccount
        from django.db import transaction
        created_headers = 0
        created_items = 0
        saved_accounts = 0
        with transaction.atomic():
            for st in payload:
                acc_id = st.get('account_id')
                bank_acc = CompanyBankAccount.objects.filter(id=acc_id, company=company).first()
                if not bank_acc:
                    return Response({'error': 'Ismeretlen company bank account'}, status=status.HTTP_400_BAD_REQUEST)
                # Header: upsert by date+account
                stmt_date = st.get('statement_date')
                currency = st.get('currency') or bank_acc.currency or 'HUF'
                header = BankStatement.objects.filter(company=company, bank_account=bank_acc, statement_date=stmt_date).first()
                if not header:
                    seq_num = st.get('sequence_number') or f"{stmt_date}-{str(bank_acc.id)[:6]}"
                    header = BankStatement(company=company, bank_account=bank_acc, statement_date=stmt_date, sequence_number=seq_num, currency=currency)
                    if request.user and request.user.is_authenticated:
                        header.created_by = request.user
                    header.save()
                    created_headers += 1
                # Items
                from invoices.models import IncomingInvoiceDigest
                for it in (st.get('items') or []):
                    if not it.get('approved'):
                        continue
                    cust_id = it.get('customer_id') or (it.get('proposed_customer') or {}).get('id')
                    
                    prop_inv = it.get('proposed_invoice') or {}
                    inv_id = it.get('invoice_id') or prop_inv.get('id')
                    inv_type = it.get('invoice_type') or prop_inv.get('type') or 'outgoing'
                    
                    customer = Customer.objects.filter(id=cust_id).first() if cust_id else None
                    
                    invoice = None
                    incoming_invoice = None
                    
                    if inv_id:
                        if inv_type == 'outgoing':
                            invoice = Invoice.objects.filter(id=inv_id, company=company).first()
                        elif inv_type == 'incoming':
                            incoming_invoice = IncomingInvoiceDigest.objects.filter(id=inv_id, company=company).first()

                    amount = it.get('amount')
                    note = it.get('remittance') or ''
                    bsi = BankStatementItem.objects.create(
                        bank_statement=header,
                        customer=customer if customer else (invoice.customer if invoice else None),
                        invoice=invoice,
                        incoming_invoice=incoming_invoice,
                        amount=amount or 0,
                        note=note[:500]
                    )
                    created_items += 1
                    # Reconcile Outgoing Invoice
                    if invoice and amount:
                        try:
                            from decimal import Decimal
                            add = Decimal(str(amount))
                        except Exception:
                            add = amount
                        outstanding = invoice.total_gross_amount - (invoice.amount_paid or 0)
                        if add > outstanding:
                            add = outstanding
                        invoice.amount_paid = (invoice.amount_paid or 0) + add
                        if invoice.amount_paid >= invoice.total_gross_amount:
                            invoice.status = 'paid'
                            try:
                                from datetime import datetime as _dt
                                invoice.payment_date = header.statement_date or _dt.utcnow().date()
                            except Exception:
                                invoice.payment_date = header.statement_date
                        elif invoice.amount_paid > 0:
                            invoice.status = 'partially_paid'
                        invoice.save(update_fields=['amount_paid', 'status', 'payment_date', 'updated_at'])
                    
                    # Reconcile Incoming Invoice
                    if incoming_invoice and amount:
                        try:
                             from decimal import Decimal
                             val = Decimal(str(amount))
                        except:
                             val = amount
                        pay_amt = abs(val) 
                        
                        gross = float((incoming_invoice.invoice_net_amount or 0) + (incoming_invoice.invoice_vat_amount or 0))
                        current_paid = float(incoming_invoice.amount_paid or 0)
                        
                        new_paid = current_paid + pay_amt
                        
                        from decimal import Decimal
                        incoming_invoice.amount_paid = Decimal(new_paid)
                        
                        # Status update
                        if new_paid >= (gross - 1.0): 
                            incoming_invoice.payment_status = 'paid'
                            incoming_invoice.payment_date = header.statement_date
                        elif new_paid > 0:
                            incoming_invoice.payment_status = 'partially_paid'
                            
                        # Save Sequence Number
                        seq_info = f"{header.sequence_number}"
                        if incoming_invoice.payment_reference:
                             if seq_info not in incoming_invoice.payment_reference:
                                  incoming_invoice.payment_reference = f"{incoming_invoice.payment_reference}, {seq_info}"[:100]
                        else:
                             incoming_invoice.payment_reference = seq_info[:100]
                        
                        incoming_invoice.save(update_fields=['amount_paid', 'payment_status', 'payment_date', 'payment_reference'])
                    # Save new customer bank account if requested
                    if it.get('save_bank_account') and customer and it.get('counterparty_account'):
                        acct = it.get('counterparty_account').strip().upper()
                        import re
                        is_iban = bool(re.match(r'^[A-Z]{2}', acct))
                        existing_acc = None
                        
                        if is_iban:
                            # If iban, and the last 16 characters matches the non-iban, then update
                            suffix = re.sub(r'\D', '', acct)[-16:]
                            # Try find candidate by account_number suffix match (only if IBAN is empty on that record)
                            # Or exact match on IBAN
                            matches = CustomerBankAccount.objects.filter(customer=customer)
                            for cand in matches:
                                c_iban = (cand.iban or '').replace(' ', '').upper()
                                # Exact IBAN match?
                                if c_iban == acct.replace(' ', ''):
                                    existing_acc = cand
                                    break
                                # Match suffix of non-IBAN account
                                c_num = re.sub(r'\D', '', cand.account_number or '')
                                if not c_iban and len(c_num) >= 16 and c_num.endswith(suffix):
                                    # Found match to update
                                    cand.iban = acct
                                    cand.currency = currency
                                    cand.save()
                                    existing_acc = cand
                                    saved_accounts += 1
                                    break
                        else:
                            # Non-IBAN
                            c_num_search = re.sub(r'\D', '', acct)
                            matches = CustomerBankAccount.objects.filter(customer=customer)
                            for cand in matches:
                                c_num = re.sub(r'\D', '', cand.account_number or '')
                                if c_num == c_num_search:
                                    existing_acc = cand
                                    break
                        
                        if not existing_acc:
                            CustomerBankAccount.objects.create(
                                customer=customer, 
                                iban=acct if is_iban else None, 
                                account_number=None if is_iban else acct, 
                                currency=currency
                            )
                            saved_accounts += 1
        return Response({'success': True, 'created_headers': created_headers, 'created_items': created_items, 'saved_accounts': saved_accounts})


class ProformaViewSet(viewsets.ModelViewSet):
    queryset = ProformaInvoice.objects.all().select_related('company', 'customer')
    serializer_class = ProformaSerializer
    permission_classes = []

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProformaCreateSerializer
        return ProformaSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        company_id = self.request.query_params.get('company') or self.request.query_params.get('company_id')
        search = self.request.query_params.get('search')
        if company_id:
            qs = qs.filter(company_id=company_id)
        if search:
            qs = qs.filter(Q(proforma_number__icontains=search) | Q(customer__name__icontains=search))
        return qs

    def perform_destroy(self, instance):
        items = list(instance.items.all())
        super().perform_destroy(instance)
        for it in items:
            try:
                it.delete()
            except Exception:
                pass

    @action(detail=True, methods=['post'])
    def copy(self, request, pk=None):
        pf = self.get_object()
        data = {
            'company_id': str(pf.company_id),
            'customer_id': str(pf.customer_id),
            'issue_date': str(pf.issue_date),
            'due_date': str(pf.due_date),
            'delivery_date': str(pf.delivery_date) if pf.delivery_date else None,
            'currency': pf.currency,
            'payment_method': pf.payment_method,
            'notes': pf.notes or '',
            'items': [
                {
                    'description': it.description,
                    'quantity': str(it.quantity),
                    'unit_price': str(it.unit_price),
                    'vat_rate': str(it.vat_rate),
                    'unit_of_measure': it.unit_of_measure,
                    'nature_indicator': it.nature_indicator,
                    'product_code_category': it.product_code_category,
                    'product_code_value': it.product_code_value,
                    'deletion_code': it.deletion_code,
                    'note': it.note or ''
                } for it in pf.items.all()
            ]
        }
        ser = ProformaCreateSerializer(data=data, context={'request': request})
        ser.is_valid(raise_exception=True)
        obj = ser.save()
        return Response(ProformaSerializer(obj).data)

    @action(detail=True, methods=['post'])
    def create_invoice(self, request, pk=None):
        return self._create_invoice_from_proforma(request, pk, category=None)

    @action(detail=True, methods=['post'])
    def create_advance_invoice(self, request, pk=None):
        return self._create_invoice_from_proforma(request, pk, category='ADVANCE')

    def _create_invoice_from_proforma(self, request, pk, category=None):
        pf = self.get_object()
        payload = request.data or {}
        invoice_number = payload.get('invoice_number')
        company_id = payload.get('company_id') or str(pf.company_id)
        invoice_block_id = payload.get('invoice_block_id')
        if not invoice_number and not invoice_block_id:
            return Response({'error': 'Számlaszám vagy számlatömb kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        data = {
            'invoice_number': invoice_number,
            'customer_id': str(pf.customer_id),
            'items': [
                {
                    'description': it.description,
                    'quantity': str(it.quantity),
                    'unit_price': str(it.unit_price),
                    'vat_rate': str(it.vat_rate),
                    'unit_of_measure': it.unit_of_measure,
                    'nature_indicator': it.nature_indicator,
                    'product_code_category': it.product_code_category,
                    'product_code_value': it.product_code_value,
                    'deletion_code': it.deletion_code,
                    'note': it.note or ''
                } for it in pf.items.all()
            ],
            'issue_date': str(pf.issue_date),
            'due_date': str(pf.due_date),
            'delivery_date': str(pf.delivery_date) if pf.delivery_date else None,
            'currency': pf.currency,
            'exchange_rate': 1,
            'payment_method': pf.payment_method,
            'invoice_category': category or 'SIMPLIFIED',
            'invoice_appearance': 'ELECTRONIC',
            'completeness_indicator': False,
            'order_reference': pf.proforma_number,
            'notes': pf.notes or '',
        }
        if invoice_block_id:
            data['invoice_block_id'] = invoice_block_id
        else:
            data['company_id'] = company_id
        ser = InvoiceCreateSerializer(data=data, context={'request': request})
        ser.is_valid(raise_exception=True)
        inv = ser.save()
        return Response(InvoiceSerializer(inv).data, status=status.HTTP_201_CREATED)


class PaymentBatchViewSet(viewsets.ModelViewSet):
    queryset = PaymentBatch.objects.select_related('company', 'bank_account', 'created_by').all()
    serializer_class = PaymentBatchSerializer
    permission_classes = []

    def get_queryset(self):
        # Avoid filtering here to prevent 404 on detail actions; list filters handled separately.
        return PaymentBatch.objects.select_related('company', 'bank_account', 'created_by').all()

    def get_object(self):
        from django.http import Http404
        pk = self.kwargs.get('pk')
        obj = PaymentBatch.objects.select_related('company', 'bank_account', 'created_by').filter(id=pk).first()
        if not obj:
            raise Http404('Fizetési csomag nem található')
        return obj

    @action(detail=False, methods=['post'], url_path='pending-count')
    def pending_count(self, request):
        company_id = request.data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        cnt = PaymentBatch.objects.filter(company_id=company_id, status='PENDING').count()
        return Response({'count': cnt})

    @action(detail=True, methods=['post'], url_path='add-items')
    def add_items(self, request, pk=None):
        batch = self.get_object()
        items = request.data.get('items') or []
        if not isinstance(items, list):
            return Response({'error': 'items tömb szükséges'}, status=status.HTTP_400_BAD_REQUEST)
        created = 0
        skipped = 0
        mismatched = []
        not_approved = []
        valid_items = []
        def _can_skip_approval():
            user = getattr(request, 'user', None)
            if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
                return True
            sys_user = None
            try:
                if isinstance(user, SystemUser):
                    sys_user = user
                else:
                    email = getattr(user, 'email', None) or getattr(user, 'username', None)
                    if email:
                        sys_user = SystemUser.objects.filter(email=email, is_active=True).prefetch_related('roles').first()
            except Exception:
                sys_user = None
            if not sys_user:
                # If we cannot resolve a SystemUser, trust the authenticated caller (UI superadmin cases)
                return True
            allowed = []
            for r in sys_user.roles.filter(is_active=True):
                allowed.extend(r.menu_permissions or [])
            if not allowed:
                return True
            return 'payment_batch_without_approval' in allowed

        skip_approval_check = _can_skip_approval()
        for it in items:
            inv = (it or {})
            if inv.get('currency') and batch.currency and inv.get('currency') != batch.currency:
                mismatched.append(inv.get('invoice_number'))
                continue
            if not skip_approval_check:
                tax = inv.get('supplier_tax_number')
                digest_qs = IncomingInvoiceDigest.objects.filter(
                    company=batch.company,
                    invoice_number=inv.get('invoice_number') or '',
                )
                if tax:
                    digest_qs = digest_qs.filter(supplier_tax_number=tax)
                digest = digest_qs.order_by('-ins_date').first()
                if digest and not digest.is_approved:
                    not_approved.append(inv.get('invoice_number') or digest.invoice_number)
                    continue
            valid_items.append(inv)
        if not_approved and not skip_approval_check:
            return Response(
                {
                    'error': 'Csak jóváhagyott számlák adhatók fizetési csomaghoz',
                    'not_approved': not_approved,
                    'currency_mismatched': mismatched,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        for inv in valid_items:
            try:
                PaymentBatchItem.objects.create(
                    batch=batch,
                    invoice_number=inv.get('invoice_number'),
                    supplier_tax_number=inv.get('supplier_tax_number'),
                    supplier_name=inv.get('supplier_name'),
                    amount_gross=inv.get('amount_gross') or inv.get('gross_amount') or 0,
                    currency=inv.get('currency') or batch.currency or 'HUF',
                )
                created += 1
            except Exception:
                skipped += 1
                continue
        return Response({'success': True, 'created': created, 'skipped': skipped, 'currency_mismatched': mismatched})

    @action(detail=True, methods=['post'], url_path='set-items')
    def set_items(self, request, pk=None):
        """Replace batch items with provided list. Expects { items: [...] } like add-items.
        Validates currency and runs in a transaction.
        """
        from django.db import transaction
        batch = self.get_object()
        items = request.data.get('items') or []
        if not isinstance(items, list):
            return Response({'error': 'items tömb szükséges'}, status=status.HTTP_400_BAD_REQUEST)
        mismatched = []
        not_approved = []
        def _can_skip_approval():
            user = getattr(request, 'user', None)
            if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
                return True
            sys_user = None
            try:
                if isinstance(user, SystemUser):
                    sys_user = user
                else:
                    email = getattr(user, 'email', None) or getattr(user, 'username', None)
                    if email:
                        sys_user = SystemUser.objects.filter(email=email, is_active=True).prefetch_related('roles').first()
            except Exception:
                sys_user = None
            if not sys_user:
                # If we cannot resolve a SystemUser, trust the authenticated caller (UI superadmin cases)
                return True
            allowed = []
            for r in sys_user.roles.filter(is_active=True):
                allowed.extend(r.menu_permissions or [])
            if not allowed:
                return True
            return 'payment_batch_without_approval' in allowed

        skip_approval_check = _can_skip_approval()
        # Validate currencies before applying
        for it in items:
            cur = (it or {}).get('currency')
            if cur and batch.currency and cur != batch.currency:
                mismatched.append((it or {}).get('invoice_number'))
            if not skip_approval_check:
                tax = (it or {}).get('supplier_tax_number')
                digest_qs = IncomingInvoiceDigest.objects.filter(
                    company=batch.company,
                    invoice_number=(it or {}).get('invoice_number') or '',
                )
                if tax:
                    digest_qs = digest_qs.filter(supplier_tax_number=tax)
                digest = digest_qs.order_by('-ins_date').first()
                if digest and not digest.is_approved:
                    not_approved.append((it or {}).get('invoice_number') or digest.invoice_number)
        if mismatched:
            return Response({'error': 'Eltérő pénznemű tételek', 'currency_mismatched': mismatched}, status=status.HTTP_400_BAD_REQUEST)
        if not_approved and not skip_approval_check:
            return Response(
                {
                    'error': 'Csak jóváhagyott számlák adhatók fizetési csomaghoz',
                    'not_approved': not_approved,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            batch.items.all().delete()
            created = 0
            for it in items:
                inv = (it or {})
                PaymentBatchItem.objects.create(
                    batch=batch,
                    invoice_number=inv.get('invoice_number'),
                    supplier_tax_number=inv.get('supplier_tax_number'),
                    supplier_name=inv.get('supplier_name'),
                    amount_gross=inv.get('amount_gross') or inv.get('gross_amount') or 0,
                    currency=inv.get('currency') or batch.currency or 'HUF',
                )
                created += 1
        data = PaymentBatchItemSerializer(batch.items.all(), many=True).data
        return Response({'success': True, 'replaced': created, 'batch': PaymentBatchSerializer(batch).data, 'items': data})

    @action(detail=True, methods=['post'], url_path='export')
    def export(self, request, pk=None):
        batch = self.get_object()
        data = PaymentBatchItemSerializer(batch.items.all(), many=True).data
        return Response({'success': True, 'batch': PaymentBatchSerializer(batch).data, 'items': data})

    @action(detail=True, methods=['get', 'post'], url_path='bank-export')
    def export_file(self, request, pk=None):
        batch = self.get_object()
        fmt = (request.data.get('format') or request.query_params.get('format') or 'sepa').lower()
        exec_date_str = request.data.get('execution_date') or request.query_params.get('execution_date')
        try:
            exec_date = datetime.strptime(exec_date_str, '%Y-%m-%d').date() if exec_date_str else timezone.now().date()
        except Exception:
            return Response({'error': 'execution_date formátum: YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        skip_missing = False
        try:
            raw_skip = request.data.get('skip_missing') if hasattr(request, 'data') else None
            if raw_skip is None:
                raw_skip = request.query_params.get('skip_missing')
            skip_missing = str(raw_skip).lower() in ('1', 'true', 'yes', 'on')
        except Exception:
            skip_missing = False
        sepa_aliases = ('sepa', 'pain.001', 'pain001', 'pain')
        if fmt not in (*sepa_aliases, 'csv'):
            return Response({'error': 'Nem támogatott export formátum (engedélyezett: pain.001, csv)'}, status=status.HTTP_400_BAD_REQUEST)

        # Determine debtor account - use batch account or company's primary/first account
        debtor_account = batch.bank_account
        if not debtor_account:
            debtor_account = batch.company.bank_accounts.filter(is_primary=True).first() or batch.company.bank_accounts.first()
        if not debtor_account:
            return Response({'error': f'{batch.company.name}: Nincs bankszámla megadva a csomaghoz vagy a céghez'}, status=status.HTTP_400_BAD_REQUEST)

        # Debtor account level rounding flag (fallback to company setting)
        round_to_whole = getattr(batch.company, 'round_transfer_to_whole', False)
        try:
            if getattr(debtor_account, 'round_transfer_to_whole', None) is not None:
                round_to_whole = bool(debtor_account.round_transfer_to_whole)
        except Exception:
            pass

        # Build items with supplier account numbers from cached NAV XML if available
        missing_accounts = []
        missing_items = []
        skipped_missing = []
        tx_items = []
        
        # Grouping dictionary: (account, currency) -> aggregation data
        grouped_data = {}

        for it in batch.items.all():
            acct_type = None
            account = None
            # Try find cached full invoice XML
            try:
                from invoices.models import IncomingInvoiceData
                q = IncomingInvoiceData.objects.filter(company=batch.company, invoice_number=it.invoice_number)
                if it.supplier_tax_number:
                    q = q.filter(supplier_tax_number=it.supplier_tax_number)
                invdata = q.order_by('-created_at').first()
                if invdata and invdata.xml_text:
                    acct_type, account = self._extract_supplier_account(invdata.xml_text, batch.company, it.supplier_tax_number, it.currency or batch.currency)
                elif invdata:
                    # Nincs XML cache, de van supplier_tax_number -> próbáljuk az ügyféltörzsből
                    acct_type, account = self._extract_supplier_account('', batch.company, it.supplier_tax_number, it.currency or batch.currency)
                else:
                    # Nincs invdata se -> próbáljuk az ügyféltörzsből
                    acct_type, account = self._extract_supplier_account('', batch.company, it.supplier_tax_number, it.currency or batch.currency)
            except Exception:
                pass
            if not account:
                missing_accounts.append({
                    'invoice_number': it.invoice_number,
                    'supplier': it.supplier_name,
                    'supplier_tax_number': it.supplier_tax_number,
                    'company': batch.company.name,
                })
                missing_items.append(it)
                continue
            
            amount_val = decimal.Decimal(str(it.amount_gross))
            if round_to_whole:
                amount_val = amount_val.quantize(decimal.Decimal('1'), rounding=decimal.ROUND_HALF_UP)
            else:
                amount_val = amount_val.quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
            
            # Grouping logic
            currency = it.currency or batch.currency or 'HUF'
            key = (account, currency)
            
            if key not in grouped_data:
                grouped_data[key] = {
                    'amount': decimal.Decimal(0),
                    'invoices': [],
                    'name': it.supplier_name or (it.supplier_tax_number or 'Ismeretlen partner'),
                    'acct_type': acct_type or 'IBAN',
                    'account': account,
                    'first_invoice': it.invoice_number
                }
            
            grouped_data[key]['amount'] += amount_val
            grouped_data[key]['invoices'].append(it.invoice_number)

        # Convert grouped data to tx_items
        for (account, currency), data in grouped_data.items():
            invoices_str = ", ".join(data['invoices'])
            remittance = f"Számlák: {invoices_str}"
            # Truncate if too long (optional, but good practice for SEPA max 140 chars)
            # if len(remittance) > 135: remittance = remittance[:135] + "..."
            
            tx_items.append({
                'end_to_end': data['first_invoice'],
                'amount': str(data['amount']),
                'currency': currency,
                'name': data['name'],
                'acct_type': data['acct_type'],
                'account': account,
                'remittance': remittance,
            })

        if missing_accounts and not skip_missing:
            error_details = '\n'.join([
                f"{m.get('supplier') or 'Ismeretlen partner'} (adószám: {m.get('supplier_tax_number') or 'n/a'}, cég: {m.get('company')}): Bankszámlaszám üres!"
                for m in missing_accounts
            ])
            return Response({'error': f'Hiányzó bankszámlaszámok:\n{error_details}', 'missing': missing_accounts}, status=status.HTTP_400_BAD_REQUEST)
        if missing_accounts and skip_missing:
            skipped_missing = missing_accounts[:]
            # Move missing items to a new pending batch so they stay actionable
            try:
                from django.utils import timezone as dj_tz
                ts = dj_tz.now().strftime('%Y%m%d_%H%M%S')
                new_batch = PaymentBatch.objects.create(
                    company=batch.company,
                    name=f"Kihagyott_{ts}",
                    bank_account=batch.bank_account,
                    currency=batch.currency,
                    status='PENDING',
                    created_by=getattr(batch, 'created_by', None),
                )
                for it in missing_items:
                    PaymentBatchItem.objects.create(
                        batch=new_batch,
                        invoice_number=it.invoice_number,
                        supplier_tax_number=it.supplier_tax_number,
                        supplier_name=it.supplier_name,
                        amount_gross=it.amount_gross,
                        currency=it.currency,
                    )
                # Remove the missing items from the exported batch
                PaymentBatchItem.objects.filter(id__in=[m.id for m in missing_items]).delete()
            except Exception:
                # If moving fails, keep behavior but still skip in export
                pass

        if not tx_items:
            error_details = '\n'.join([
                f"{m.get('supplier') or 'Ismeretlen partner'} (adószám: {m.get('supplier_tax_number') or 'n/a'}, cég: {m.get('company')}): Bankszámlaszám üres!"
                for m in missing_accounts
            ])
            return Response({'error': f'Nem exportálható: hiányzó bankszámlaszámok.\n{error_details}', 'missing': missing_accounts}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if fmt in sepa_aliases:
                content = self._build_pain_001(batch, tx_items, exec_date, debtor_account)
                content_type = 'application/xml'
                filename = f"payment_batch_{(batch.name or str(batch.id)).replace(' ', '_')}_pain.001.xml"
            else:
                header = ['account','account_type','beneficiary_name','amount','currency','remittance','execution_date','end_to_end']
                rows = []
                for it in tx_items:
                    amount_for_csv = decimal.Decimal(it['amount']).quantize(decimal.Decimal('0.01'))
                    rows.append([
                        it['account'], it['acct_type'], it['name'], f"{amount_for_csv:.2f}", it['currency'], it['remittance'], exec_date.strftime('%Y-%m-%d'), it['end_to_end']
                    ])
                csv = ';'.join(header) + '\n' + '\n'.join([';'.join([str(col).replace(';', ',') for col in r]) for r in rows])
                content = ("\ufeff" + csv).encode('utf-8')
                content_type = 'text/csv; charset=utf-8'
                filename = f"payment_batch_{(batch.name or str(batch.id)).replace(' ', '_')}.csv"
        except ValueError as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception('Export build error')
            return Response({'error': f'Export hiba: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Optionally mark as exported
        try:
            if batch.status != 'EXPORTED':
                batch.status = 'EXPORTED'
                batch.save(update_fields=['status', 'updated_at'])
        except Exception:
            pass

        resp = HttpResponse(content, content_type=content_type)
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        if skipped_missing:
            try:
                resp['X-Missing-Accounts'] = json.dumps(skipped_missing)
            except Exception:
                resp['X-Missing-Accounts'] = ','.join([str(m.get('invoice_number') or '') for m in skipped_missing])
        return resp

    def _extract_supplier_account(self, xml_text: str, company=None, supplier_tax_number: str = None, preferred_currency: str = None):
        """
        Kinyeri a beszállító bankszámlaszámát.
        1. Először az XML-ből próbálja
        2. Ha nincs az XML-ben, akkor az ügyféltörzsből (ha van company és supplier_tax_number)
        """
        if not xml_text:
            # Ha nincs XML, próbáljuk az ügyféltörzsből
            if company and supplier_tax_number:
                account = get_supplier_bank_account_for_invoice(company, supplier_tax_number, '', preferred_currency)
                if account:
                    # Tisztítjuk és detektáljuk az account típusát
                    clean_account = account.replace(' ', '').replace('-', '')
                    if re.match(r'^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$', clean_account):
                        return 'IBAN', clean_account
                    elif re.match(r'^\d{24}$', clean_account):  # 24 számjegy (8+8+8 kötőjel nélkül)
                        return 'BBAN', clean_account
                    else:
                        return 'OTHER', clean_account
            return None, None
        try:
            # Először tisztítsuk meg az XML-t szóközöktől
            clean_xml = xml_text.replace(' ', '').replace('-', '')
            # Prefer IBAN
            iban_match = re.search(r'\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b', clean_xml)
            if iban_match:
                return 'IBAN', iban_match.group(0)
            # Fallback: Hungarian domestic account number (24 számjegy)
            acct_match = re.search(r'\b\d{24}\b', clean_xml)
            if acct_match:
                return 'BBAN', acct_match.group(0)
            
            # Ha nincs az XML-ben, próbáljuk az ügyféltörzsből
            if company and supplier_tax_number:
                account = get_supplier_bank_account_for_invoice(company, supplier_tax_number, xml_text, preferred_currency)
                if account:
                    # Tisztítjuk és detektáljuk az account típusát
                    clean_account = account.replace(' ', '').replace('-', '')
                    if re.match(r'^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$', clean_account):
                        return 'IBAN', clean_account
                    elif re.match(r'^\d{24}$', clean_account):  # 24 számjegy
                        return 'BBAN', clean_account
                    else:
                        return 'OTHER', clean_account
        except Exception:
            pass
        return None, None

    def _build_pain_001(self, batch: PaymentBatch, items: list, execution_date: date, debtor_account):
        ns = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'
        ET.register_namespace('', ns)
        d = ET.Element(ET.QName(ns, 'Document'))
        c = ET.SubElement(d, ET.QName(ns, 'CstmrCdtTrfInitn'))

        # Group Header
        gh = ET.SubElement(c, ET.QName(ns, 'GrpHdr'))
        ET.SubElement(gh, ET.QName(ns, 'MsgId')).text = f"{batch.name}-{batch.id}"
        ET.SubElement(gh, ET.QName(ns, 'CreDtTm')).text = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        nb = str(len(items))
        ET.SubElement(gh, ET.QName(ns, 'NbOfTxs')).text = nb
        ctrl_sum = sum(decimal.Decimal(it['amount']) for it in items)
        ET.SubElement(gh, ET.QName(ns, 'CtrlSum')).text = f"{ctrl_sum:.2f}"
        initg = ET.SubElement(gh, ET.QName(ns, 'InitgPty'))
        ET.SubElement(initg, ET.QName(ns, 'Nm')).text = batch.company.name

        # Payment Info
        pi = ET.SubElement(c, ET.QName(ns, 'PmtInf'))
        ET.SubElement(pi, ET.QName(ns, 'PmtInfId')).text = f"{batch.name}-{batch.id}"
        ET.SubElement(pi, ET.QName(ns, 'PmtMtd')).text = 'TRF'
        ET.SubElement(pi, ET.QName(ns, 'BtchBookg')).text = 'true'
        ET.SubElement(pi, ET.QName(ns, 'NbOfTxs')).text = nb
        ET.SubElement(pi, ET.QName(ns, 'CtrlSum')).text = f"{ctrl_sum:.2f}"
        # Optional service level; some banks require SEPA for EUR
        # pmt_tp = ET.SubElement(pi, ET.QName(ns, 'PmtTpInf'))
        # svc = ET.SubElement(pmt_tp, ET.QName(ns, 'SvcLvl'))
        # ET.SubElement(svc, ET.QName(ns, 'Cd')).text = 'SEPA'
        ET.SubElement(pi, ET.QName(ns, 'ReqdExctnDt')).text = execution_date.strftime('%Y-%m-%d')
        dbtr = ET.SubElement(pi, ET.QName(ns, 'Dbtr'))
        ET.SubElement(dbtr, ET.QName(ns, 'Nm')).text = batch.company.name
        
        dbtr_acct = ET.SubElement(pi, ET.QName(ns, 'DbtrAcct'))
        dbtr_id = ET.SubElement(dbtr_acct, ET.QName(ns, 'Id'))
        if debtor_account.iban:
            ET.SubElement(dbtr_id, ET.QName(ns, 'IBAN')).text = debtor_account.iban.replace(' ', '').replace('-', '')
        elif debtor_account.account_number:
            othr = ET.SubElement(dbtr_id, ET.QName(ns, 'Othr'))
            ET.SubElement(othr, ET.QName(ns, 'Id')).text = debtor_account.account_number.replace(' ', '').replace('-', '')
        else:
            raise ValueError(f'{batch.company.name}: A bankszámlának IBAN vagy számlaszám szükséges')
        ET.SubElement(pi, ET.QName(ns, 'ChrgBr')).text = 'SLEV'

        # Transactions
        for it in items:
            tx = ET.SubElement(pi, ET.QName(ns, 'CdtTrfTxInf'))
            pmtid = ET.SubElement(tx, ET.QName(ns, 'PmtId'))
            ET.SubElement(pmtid, ET.QName(ns, 'EndToEndId')).text = it['end_to_end']
            amt = ET.SubElement(tx, ET.QName(ns, 'Amt'))
            instd = ET.SubElement(amt, ET.QName(ns, 'InstdAmt'))
            instd.set('Ccy', it['currency'])
            instd.text = f"{decimal.Decimal(it['amount']):.2f}"
            cdtr = ET.SubElement(tx, ET.QName(ns, 'Cdtr'))
            ET.SubElement(cdtr, ET.QName(ns, 'Nm')).text = it['name']
            cdtr_acct = ET.SubElement(tx, ET.QName(ns, 'CdtrAcct'))
            cdtr_id = ET.SubElement(cdtr_acct, ET.QName(ns, 'Id'))
            if it['acct_type'] == 'IBAN':
                ET.SubElement(cdtr_id, ET.QName(ns, 'IBAN')).text = it['account'].replace(' ', '').replace('-', '')
            else:
                othr = ET.SubElement(cdtr_id, ET.QName(ns, 'Othr'))
                ET.SubElement(othr, ET.QName(ns, 'Id')).text = it['account'].replace(' ', '').replace('-', '')
            rmt = ET.SubElement(tx, ET.QName(ns, 'RmtInf'))
            ET.SubElement(rmt, ET.QName(ns, 'Ustrd')).text = it['remittance']

        return ET.tostring(d, encoding='utf-8', xml_declaration=True)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        batch = self.get_object()
        today = timezone.now().date()
        total_updated = 0
        # Mark matching incoming invoice digests as paid for this company
        for it in batch.items.all():
            qs = IncomingInvoiceDigest.objects.filter(company=batch.company, invoice_number=it.invoice_number)
            if it.supplier_tax_number:
                qs = qs.filter(supplier_tax_number=it.supplier_tax_number)
            updated = qs.update(payment_date=today)
            total_updated += updated
        try:
            if batch.status != 'EXPORTED':
                batch.status = 'EXPORTED'
                batch.save(update_fields=['status', 'updated_at'])
        except Exception:
            pass
        return Response({'success': True, 'updated': total_updated, 'payment_date': str(today)})

    @action(detail=True, methods=['delete'], url_path='delete')
    def delete_batch(self, request, pk=None):
        batch = self.get_object()
        batch.delete()
        return Response({'success': True})

    @action(detail=False, methods=['post'], url_path='list-pending')
    def list_pending(self, request):
        company_id = request.data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        qs = PaymentBatch.objects.filter(company_id=company_id, status='PENDING').order_by('-created_at')
        return Response(PaymentBatchSerializer(qs, many=True).data)

    @action(detail=False, methods=['post'], url_path='list-completed')
    def list_completed(self, request):
        company_id = request.data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        qs = PaymentBatch.objects.filter(company_id=company_id).exclude(status='PENDING').order_by('-created_at')
        return Response(PaymentBatchSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='update-item')
    def update_item(self, request, pk=None):
        batch = self.get_object()
        item_id = request.data.get('item_id')
        amount_raw = request.data.get('amount_gross')
        if not item_id:
            return Response({'error': 'item_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            item = PaymentBatchItem.objects.get(id=item_id, batch=batch)
        except PaymentBatchItem.DoesNotExist:
            return Response({'error': 'Tétel nem található ebben a csomagban'}, status=status.HTTP_404_NOT_FOUND)
        try:
            new_amount = decimal.Decimal(str(amount_raw))
        except Exception:
            return Response({'error': 'Érvénytelen összeg'}, status=status.HTTP_400_BAD_REQUEST)
        if new_amount < decimal.Decimal('0'):
            return Response({'error': 'Az összeg nem lehet negatív'}, status=status.HTTP_400_BAD_REQUEST)
        item.amount_gross = new_amount
        item.save(update_fields=['amount_gross'])
        total = batch.items.aggregate(s=Sum('amount_gross')).get('s')
        return Response({'success': True, 'item': PaymentBatchItemSerializer(item).data, 'gross_total': str(total) if total is not None else None})


# Backup Management Views
class BackupConfigurationViewSet(viewsets.ModelViewSet):
    """ViewSet for backup configurations"""
    queryset = BackupConfiguration.objects.all()
    serializer_class = BackupConfigurationSerializer
    permission_classes = []  # API kulcs alapú autentikáció van használatban


class BackupFileViewSet(viewsets.ModelViewSet):
    """ViewSet for backup files"""
    queryset = BackupFile.objects.all()
    serializer_class = BackupFileSerializer
    permission_classes = []  # API kulcs alapú autentikáció van használatban
    http_method_names = ['get', 'post', 'delete']
    
    @action(detail=False, methods=['post'])
    def create_backup(self, request):
        """Create a manual backup using pg_dump for PostgreSQL"""
        import os
        import subprocess
        from django.conf import settings
        
        try:
            # Create backups directory if not exists
            backup_dir = os.path.join(settings.BASE_DIR, 'backups')
            os.makedirs(backup_dir, exist_ok=True)
            
            # Generate filename
            timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            filename = f'manual_backup_{timestamp}.sql'
            filepath = os.path.join(backup_dir, filename)
            
            # Get database configuration
            db_config = settings.DATABASES['default']
            db_name = db_config['NAME']
            db_user = db_config['USER']
            db_host = db_config.get('HOST', 'localhost')
            db_port = db_config.get('PORT', '5432')
            db_password = db_config.get('PASSWORD', '')
            
            # Set environment variable for password
            env = os.environ.copy()
            if db_password:
                env['PGPASSWORD'] = db_password
            
            # Run pg_dump
            cmd = [
                'pg_dump',
                '-h', db_host,
                '-p', str(db_port),
                '-U', db_user,
                '-F', 'c',  # Custom format (compressed)
                '-f', filepath,
                db_name
            ]
            
            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )
            
            # Get file size
            file_size = os.path.getsize(filepath)
            
            # Create backup record (no user authentication in PixInvoice)
            backup = BackupFile.objects.create(
                filename=filename,
                filepath=filepath,
                file_size=file_size,
                created_by=None,  # PixInvoice doesn't use Django user auth
                is_manual=True
            )
            
            serializer = self.get_serializer(backup)
            return Response({
                'message': 'Backup sikeresen létrehozva',
                'backup': serializer.data
            })
        except subprocess.CalledProcessError as e:
            return Response({
                'error': f'pg_dump hiba: {e.stderr}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            import traceback
            return Response({
                'error': f'Hiba a backup létrehozása során: {str(e)}',
                'traceback': traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def upload_backup(self, request):
        """Upload a backup file for restoration"""
        import os
        from django.conf import settings
        
        try:
            uploaded_file = request.FILES.get('file')
            if not uploaded_file:
                return Response({
                    'error': 'Nincs fájl feltöltve'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Validate file extension
            if not uploaded_file.name.endswith('.sql'):
                return Response({
                    'error': 'Csak .sql kiterjesztésű fájlok tölthetők fel'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Create backups directory if not exists
            backup_dir = os.path.join(settings.BASE_DIR, 'backups')
            os.makedirs(backup_dir, exist_ok=True)
            
            # Generate unique filename
            timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            original_name = uploaded_file.name.rsplit('.', 1)[0]
            filename = f'uploaded_{original_name}_{timestamp}.sql'
            filepath = os.path.join(backup_dir, filename)
            
            # Save uploaded file
            with open(filepath, 'wb+') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            
            # Get file size
            file_size = os.path.getsize(filepath)
            
            # Create backup record
            backup = BackupFile.objects.create(
                filename=filename,
                filepath=filepath,
                file_size=file_size,
                created_by=None,
                is_manual=True
            )
            
            serializer = self.get_serializer(backup)
            return Response({
                'message': 'Backup fájl sikeresen feltöltve',
                'backup': serializer.data
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            import traceback
            return Response({
                'error': f'Hiba a feltöltés során: {str(e)}',
                'traceback': traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download a backup file"""
        import os
        from django.http import HttpResponse
        
        try:
            backup = self.get_object()
            
            if not os.path.exists(backup.filepath):
                return Response({
                    'error': 'A backup fájl nem található'
                }, status=status.HTTP_404_NOT_FOUND)
            
            with open(backup.filepath, 'rb') as f:
                response = HttpResponse(f.read(), content_type='application/octet-stream')
                response['Content-Disposition'] = f'attachment; filename="{backup.filename}"'
                return response
        except Exception as e:
            return Response({
                'error': f'Hiba a letöltés során: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore from a backup file using pg_restore for PostgreSQL"""
        import os
        import subprocess
        from django.conf import settings
        
        try:
            backup = self.get_object()
            
            if not os.path.exists(backup.filepath):
                return Response({
                    'error': 'A backup fájl nem található'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Get database configuration
            db_config = settings.DATABASES['default']
            db_name = db_config['NAME']
            db_user = db_config['USER']
            db_host = db_config.get('HOST', 'localhost')
            db_port = db_config.get('PORT', '5432')
            db_password = db_config.get('PASSWORD', '')
            
            # Set environment variable for password
            env = os.environ.copy()
            if db_password:
                env['PGPASSWORD'] = db_password
            
            # First, create a safety backup of current database
            safety_backup_dir = os.path.join(settings.BASE_DIR, 'backups')
            timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            safety_filename = f'before_restore_{timestamp}.sql'
            safety_filepath = os.path.join(safety_backup_dir, safety_filename)
            
            subprocess.run(
                [
                    'pg_dump',
                    '-h', db_host,
                    '-p', str(db_port),
                    '-U', db_user,
                    '-F', 'c',
                    '-f', safety_filepath,
                    db_name
                ],
                env=env,
                check=True,
                capture_output=True
            )
            
            # Drop and recreate database (requires superuser or database owner)
            # Alternative: use --clean --if-exists with pg_restore
            cmd = [
                'pg_restore',
                '-h', db_host,
                '-p', str(db_port),
                '-U', db_user,
                '-d', db_name,
                '--clean',  # Drop existing objects before recreating
                '--if-exists',  # Don't error on missing objects
                backup.filepath
            ]
            
            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True
            )
            
            # pg_restore may return warnings (non-zero exit) but still succeed
            # Check stderr for actual errors
            if result.returncode != 0 and 'ERROR' in result.stderr:
                return Response({
                    'error': f'pg_restore hiba: {result.stderr}',
                    'safety_backup': safety_filepath
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            return Response({
                'message': 'Adatbázis sikeresen visszaállítva. Kérjük jelentkezzen be újra.',
                'safety_backup': safety_filepath,
                'warnings': result.stderr if result.stderr else None
            })
        except subprocess.CalledProcessError as e:
            return Response({
                'error': f'Hiba a visszaállítás során: {e.stderr}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            import traceback
            return Response({
                'error': f'Hiba a visszaállítás során: {str(e)}',
                'traceback': traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def cleanup_old_backups(self, request):
        """Clean up old backups based on retention policy"""
        import os
        from datetime import timedelta
        
        try:
            deleted_count = 0
            configs = BackupConfiguration.objects.filter(is_active=True)
            
            for config in configs:
                cutoff_date = timezone.now() - timedelta(days=config.retention_days)
                old_backups = BackupFile.objects.filter(
                    configuration=config,
                    created_at__lt=cutoff_date,
                    is_manual=False
                )
                
                for backup in old_backups:
                    if os.path.exists(backup.filepath):
                        os.remove(backup.filepath)
                    backup.delete()
                    deleted_count += 1
            
            return Response({
                'message': f'{deleted_count} régi backup törölve',
                'deleted_count': deleted_count
            })
        except Exception as e:
            return Response({
                'error': f'Hiba a tisztítás során: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
