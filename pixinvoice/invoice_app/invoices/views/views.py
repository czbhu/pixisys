from django.http import HttpResponseForbidden
from django.http import FileResponse
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
from django.core.exceptions import ValidationError
from invoices.models import Customer, Invoice, InvoiceItem, NAVConfiguration, Contact, Company, SystemUser, Role, InvoiceBlock, CompanyNAVConfiguration, CustomerBankAccount, CompanyBankAccount, VATType, BankStatement, BankStatementItem, ProformaInvoice, AdvanceAllocation, CompanyEmailSettings, PaymentBatch, PaymentBatchItem, IncomingInvoiceDigest, IncomingInvoiceData, APIAccessRule, APIClient, APIClientAccessRule, IncomingDocument, BackupConfiguration, BackupFile, Currency, EmailTemplate, EmailSignature, CashRegister, CashRegisterTransaction, ScheduledInvoice, ScheduledInvoiceRun, CronJobConfiguration
from django.contrib.auth.hashers import make_password
from invoices.serializers import (
    CustomerSerializer, InvoiceSerializer, InvoiceCreateSerializer,
    InvoiceItemSerializer, NAVConfigurationSerializer, ContactSerializer, ContactCreateSerializer,
    CompanySerializer, SystemUserSerializer, SystemUserCreateSerializer, RoleSerializer, InvoiceBlockSerializer, CompanyNAVConfigurationSerializer,
    CustomerBankAccountSerializer, CompanyBankAccountSerializer, VATTypeSerializer, BankStatementSerializer,
    ProformaSerializer, ProformaCreateSerializer, CurrencySerializer, CashRegisterSerializer, CashRegisterTransactionSerializer
)
from invoices.serializers import CompanyEmailSettingsSerializer, PaymentBatchSerializer, PaymentBatchItemSerializer, IncomingDocumentSerializer, BackupConfigurationSerializer, BackupFileSerializer, EmailTemplateSerializer, EmailSignatureSerializer, CronJobConfigurationSerializer
from invoices.serializers import IncomingProformaSerializer, IncomingProformaDocumentSerializer, IncomingProformaInvoiceLinkSerializer
from invoices.nav_service import NAVService
from invoices.mnb_api import MNBApiClient
from invoices.supplier_auto_register import auto_register_or_update_supplier, get_supplier_bank_account_for_invoice
import logging
import time
import os
import re
import calendar
import decimal
import uuid
from django.http import HttpResponse
from datetime import datetime, date, timedelta
import xml.etree.ElementTree as ET
import json
from django.forms.models import model_to_dict
from django.db import transaction


ROLE_MENU_OPTIONS = [
    {'key': 'dashboard', 'label': 'Dashboard'},
    {'key': 'invoices', 'label': 'Számlák'},
    {'key': 'scheduled_invoices', 'label': 'Időzített számlák'},
    {'key': 'incoming_invoices', 'label': 'Bejövő számlák'},
    {'key': 'incoming_invoices_approve', 'label': 'Bejövő számlák jóváhagyás'},
    {'key': 'payment_batch_without_approval', 'label': 'Fizetési csomag jóváhagyás nélkül'},
    {'key': 'proformas', 'label': 'Díjbekérők'},
    {'key': 'incoming_proformas', 'label': 'Bejövő Díjbekérők'},
    {'key': 'bank_statements', 'label': 'Bank'},
    {'key': 'arrears', 'label': 'Kintlévőség'},
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


DEFAULT_EMAIL_TEMPLATE_MAP = {
    EmailTemplate.TEMPLATE_INVOICE_SEND: {
        'name': 'Számlaküldés',
        'subject_template': 'Számla {invoice_number}',
        'body_template': 'Tisztelt {customer_name}!\n\nKüldjük a(z) {invoice_number} számú számlát PDF csatolmányként.\n\nÜdvözlettel,\n{company_name}\n{signature_html}',
    },
    EmailTemplate.TEMPLATE_ARREARS: {
        'name': 'Kintlévőségi',
        'subject_template': 'Kintlévőség értesítő - lejárt számlák',
        'body_template': '<p>Tisztelt Ügyfél!</p><p>Nyilvántartásunk szerint {as_of_date} napjáig még nem egyenlítették ki az alábbi számlákat, amelynek hátraléka összesen {total_outstanding}.</p>{invoices_table}<p>Amennyiben az összeg az Önök nyilvántartásában szereplőtől eltér, kérem egyeztessenek velünk az elérhetőségeink egyikén.</p><p>Ha a számlák kiegyenlítése időközben már megtörtént, kérjük jelen levelünket tekintse tárgytalannak!</p><p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_REMINDER_1: {
        'name': '1. felszólítás',
        'subject_template': '1. fizetési felszólítás - lejárt számlák',
        'body_template': '<p>Tisztelt Ügyfél!</p><p>Ezúton küldjük az 1. fizetési felszólítást a lejárt számlákról.</p>{invoices_table}<p>Kérjük a tartozás mielőbbi rendezését.</p><p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_REMINDER_2: {
        'name': '2. felszólítás',
        'subject_template': '2. fizetési felszólítás - lejárt számlák',
        'body_template': '<p>Tisztelt Ügyfél!</p><p>Ez a 2. fizetési felszólítás a lejárt számlákra vonatkozóan.</p>{invoices_table}<p>Kérjük haladéktalanul rendezze tartozását.</p><p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_LEGAL: {
        'name': 'Ügyvédi',
        'subject_template': 'Ügyvédi felszólítás előkészítése',
        'body_template': '<p>Tisztelt Ügyfél!</p><p>Tájékoztatjuk, hogy amennyiben a lejárt tartozások rendezése nem történik meg, ügyvédi úton érvényesítjük követelésünket.</p>{invoices_table}<p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_PAYMENT_ORDER: {
        'name': 'Fizetési meghagyás',
        'subject_template': 'Fizetési meghagyás előkészítése - lejárt számlák',
        'body_template': '<p>Tisztelt Ügyfél!</p><p>Tájékoztatjuk, hogy a lejárt követelések miatt fizetési meghagyásos eljárást indítunk.</p>{invoices_table}<p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_LITIGATION: {
        'name': 'Peresítés',
        'subject_template': 'Peres eljárás indítása - lejárt számlák',
        'body_template': '<p>Tisztelt Ügyfél!</p><p>Tájékoztatjuk, hogy a követelés érvényesítését peres úton folytatjuk.</p>{invoices_table}<p>{today_city_date}</p><p>{signature_html}</p>',
    },
}

DEFAULT_EMAIL_TEMPLATE_MAP_EN = {
    EmailTemplate.TEMPLATE_INVOICE_SEND: {
        'name': 'Invoice Sending',
        'subject_template': 'Invoice {invoice_number}',
        'body_template': 'Dear {customer_name},<br><br>Please find attached invoice {invoice_number}.<br><br>Best regards,<br>{company_name}<br>{signature_html}',
    },
    EmailTemplate.TEMPLATE_ARREARS: {
        'name': 'Arrears Notice',
        'subject_template': 'Outstanding invoices notice',
        'body_template': '<p>Dear Customer,</p><p>According to our records, as of {as_of_date} the following invoices remain unpaid, totaling {total_outstanding}.</p>{invoices_table}<p>If you have already settled these invoices, please disregard this message.</p><p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_REMINDER_1: {
        'name': '1st Reminder',
        'subject_template': '1st payment reminder - overdue invoices',
        'body_template': '<p>Dear Customer,</p><p>This is the 1st payment reminder regarding overdue invoices.</p>{invoices_table}<p>Please settle the outstanding amount as soon as possible.</p><p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_REMINDER_2: {
        'name': '2nd Reminder',
        'subject_template': '2nd payment reminder - overdue invoices',
        'body_template': '<p>Dear Customer,</p><p>This is the 2nd payment reminder regarding overdue invoices.</p>{invoices_table}<p>Please arrange payment immediately.</p><p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_LEGAL: {
        'name': 'Legal Notice',
        'subject_template': 'Preparation of legal notice - overdue invoices',
        'body_template': '<p>Dear Customer,</p><p>Please note that if overdue balances are not settled, we will enforce our claim through legal channels.</p>{invoices_table}<p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_PAYMENT_ORDER: {
        'name': 'Payment Order',
        'subject_template': 'Preparation of payment order - overdue invoices',
        'body_template': '<p>Dear Customer,</p><p>Please be informed that due to overdue receivables we will initiate a payment order procedure.</p>{invoices_table}<p>{today_city_date}</p><p>{signature_html}</p>',
    },
    EmailTemplate.TEMPLATE_LITIGATION: {
        'name': 'Litigation',
        'subject_template': 'Initiation of litigation - overdue invoices',
        'body_template': '<p>Dear Customer,</p><p>Please be informed that we will pursue legal action to enforce this claim.</p>{invoices_table}<p>{today_city_date}</p><p>{signature_html}</p>',
    },
}


def get_default_signature_html(company):
    sig = EmailSignature.objects.filter(company=company, is_active=True, is_default=True).first()
    if not sig:
        sig = EmailSignature.objects.filter(company=company, is_active=True).order_by('name').first()
    return (getattr(sig, 'content_html', None) or '').strip()


def get_company_email_template(company, template_type, language='hu'):
    lang = (language or 'hu').lower()
    tpl = EmailTemplate.objects.filter(
        company=company,
        template_type=template_type,
        language=lang,
        is_active=True
    ).first()
    if not tpl and lang != 'hu':
        tpl = EmailTemplate.objects.filter(
            company=company,
            template_type=template_type,
            language='hu',
            is_active=True
        ).first()

    defaults_map = DEFAULT_EMAIL_TEMPLATE_MAP_EN if lang == 'en' else DEFAULT_EMAIL_TEMPLATE_MAP
    defaults = defaults_map.get(template_type, {})

    if template_type == EmailTemplate.TEMPLATE_INVOICE_SEND:
        if tpl:
            return {
                'subject_template': (getattr(tpl, 'subject_template', None) or '').strip(),
                'body_template': (getattr(tpl, 'body_template', None) or '').strip(),
            }

        ces = CompanyEmailSettings.objects.filter(company=company).first()
        if ces:
            if lang == 'en':
                defaults = {
                    **defaults,
                    'subject_template': (getattr(ces, 'subject_template_en', None) or defaults.get('subject_template') or ''),
                    'body_template': (getattr(ces, 'body_template_en', None) or defaults.get('body_template') or ''),
                }
            else:
                defaults = {
                    **defaults,
                    'subject_template': (getattr(ces, 'default_subject_template', None) or defaults.get('subject_template') or ''),
                    'body_template': (getattr(ces, 'default_body_template', None) or defaults.get('body_template') or ''),
                }
            return {
                'subject_template': defaults.get('subject_template') or '',
                'body_template': defaults.get('body_template') or '',
            }

    return {
        'subject_template': (getattr(tpl, 'subject_template', None) if tpl else None) or defaults.get('subject_template') or '',
        'body_template': (getattr(tpl, 'body_template', None) if tpl else None) or defaults.get('body_template') or '',
    }


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


def _get_system_user_allowed_company_ids(request):
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return []
    email = (getattr(user, 'email', None) or '').strip()
    if not email:
        return []
    try:
        system_user = SystemUser.objects.filter(email__iexact=email, is_active=True).first()
        if not system_user:
            return []
        return list(system_user.companies.filter(is_active=True).values_list('id', flat=True))
    except Exception:
        return []


def _filter_customers_by_companies(queryset, company_ids):
    ids = [cid for cid in (company_ids or []) if cid]
    if not ids:
        return queryset
    return queryset.filter(
        Q(invoice__company_id__in=ids) |
        Q(proformas__company_id__in=ids) |
        Q(scheduled_invoices__company_id__in=ids) |
        Q(bank_statement_items__bank_statement__company_id__in=ids)
    ).distinct()


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
        allowed_company_ids = _get_system_user_allowed_company_ids(self.request)
        company_id = self.request.query_params.get('company_id')

        if company_id:
            # If user has company restrictions, company_id must be within allowed set.
            if allowed_company_ids and str(company_id) not in {str(x) for x in allowed_company_ids}:
                return Customer.objects.none()
            queryset = _filter_customers_by_companies(queryset, [company_id])
        elif allowed_company_ids:
            queryset = _filter_customers_by_companies(queryset, allowed_company_ids)

        search = self.request.query_params.get('search', None)
        if search:
            search_regex = get_fuzzy_search_regex(search)
            search_filter = (
                Q(name__iregex=search_regex) |
                Q(tax_number__icontains=search) |
                Q(eu_tax_number__icontains=search) |
                Q(email__icontains=search)
            )
            filtered = queryset.filter(search_filter)

            # If company-scoped filters hide standalone CRM suppliers,
            # fall back to global supplier search for explicit search queries.
            if not filtered.exists():
                filtered = Customer.objects.filter(is_supplier=True).filter(search_filter)

            queryset = filtered
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
    
    # Determine display_decimals (0 for HUF, else from Currency model)
    from decimal import Decimal, ROUND_HALF_UP
    _is_huf_v2 = (inv.currency or 'HUF').upper() == 'HUF'
    if _is_huf_v2:
        display_decimals = 0
    else:
        try:
            _curr_obj = Currency.objects.get(code=inv.currency)
            display_decimals = _curr_obj.display_decimals
        except Exception:
            display_decimals = 2
    _dec_fmt = Decimal('1') if display_decimals == 0 else Decimal('0.' + '0' * display_decimals)
    def _rnd_v2(v):
        return float(Decimal(str(v)).quantize(_dec_fmt, rounding=ROUND_HALF_UP))

    # Round vat_summary rows
    for row in vat_summary:
        row['net'] = _rnd_v2(row['net'])
        row['vat'] = _rnd_v2(row['vat'])
        row['gross'] = _rnd_v2(row['gross'])

    huf_totals = None
    if not _is_huf_v2:
         ex = inv.exchange_rate or 1
         _huf_rnd = lambda v: float(Decimal(str(v)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
         huf_totals = {
             'net': _huf_rnd(inv.total_net_amount * ex),
             'vat': _huf_rnd(inv.total_vat_amount * ex),
             'gross': _huf_rnd(inv.total_gross_amount * ex)
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
        bilingual = _resolve_invoice_bilingual(inv)
        ctx = { 
            'invoice': inv, 
            'bilingual': bilingual,
            'block': inv.invoice_block,
            'vat_summary': vat_summary,
            'huf_totals': huf_totals,
            'rounding_diff': rounding_diff,
            'payable_amount': payable_amount,
            'amount_words': amount_words,
            'display_decimals': display_decimals,
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


def _resolve_invoice_bilingual(inv):
    snapshot = getattr(inv, 'print_snapshot', None) or {}
    if isinstance(snapshot, dict) and 'bilingual' in snapshot:
        return bool(snapshot.get('bilingual'))

    is_bilingual = (inv.currency or '').upper() != 'HUF'
    try:
        block = getattr(inv, 'invoice_block', None)
        if block and getattr(block, 'second_language', None):
            is_bilingual = True
    except Exception:
        pass
    return is_bilingual

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

    def _scheduled_bool(self, value, default=False):
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        return str(value).strip().lower() in ('1', 'true', 'igen', 'yes', 'on')

    def _scheduled_frequency_label(self, schedule):
        if schedule.schedule_mode == ScheduledInvoice.MODE_INTERVAL:
            unit_map = {
                ScheduledInvoice.INTERVAL_DAY: 'naponta',
                ScheduledInvoice.INTERVAL_WEEK: 'hetente',
                ScheduledInvoice.INTERVAL_MONTH: 'havonta',
                ScheduledInvoice.INTERVAL_YEAR: 'évente',
            }
            val = max(int(schedule.interval_value or 1), 1)
            if val == 1:
                return f"Minden {unit_map.get(schedule.interval_unit, 'időszakban')}"
            return f"{val} {unit_map.get(schedule.interval_unit, 'időszakonként')}"
        if schedule.schedule_mode == ScheduledInvoice.MODE_WEEKDAY:
            days = ['hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat', 'vasárnap']
            idx = int(schedule.weekday or 0)
            idx = max(0, min(6, idx))
            return f"Minden hét {days[idx]}"
        if schedule.schedule_mode == ScheduledInvoice.MODE_MONTHDAY:
            if schedule.month_last_day:
                return 'Minden hónap utolsó napja'
            return f"Minden hónap {int(schedule.month_day or 1)}. napja"
        return 'Ismeretlen'

    def _scheduled_add_months(self, base_date, months_to_add):
        month_index = (base_date.month - 1) + months_to_add
        year = base_date.year + (month_index // 12)
        month = (month_index % 12) + 1
        last_day = calendar.monthrange(year, month)[1]
        day = min(base_date.day, last_day)
        return date(year, month, day)

    def _scheduled_next_issue_date(self, schedule, from_date):
        if schedule.schedule_mode == ScheduledInvoice.MODE_INTERVAL:
            value = max(int(schedule.interval_value or 1), 1)
            if schedule.interval_unit == ScheduledInvoice.INTERVAL_DAY:
                return from_date + timedelta(days=value)
            if schedule.interval_unit == ScheduledInvoice.INTERVAL_WEEK:
                return from_date + timedelta(weeks=value)
            if schedule.interval_unit == ScheduledInvoice.INTERVAL_MONTH:
                return self._scheduled_add_months(from_date, value)
            if schedule.interval_unit == ScheduledInvoice.INTERVAL_YEAR:
                return self._scheduled_add_months(from_date, 12 * value)
            return from_date + timedelta(days=value)

        if schedule.schedule_mode == ScheduledInvoice.MODE_WEEKDAY:
            target = int(schedule.weekday or 0)
            target = max(0, min(6, target))
            current = from_date.weekday()
            delta = (target - current) % 7
            if delta == 0:
                delta = 7
            return from_date + timedelta(days=delta)

        if schedule.schedule_mode == ScheduledInvoice.MODE_MONTHDAY:
            next_month_base = self._scheduled_add_months(from_date.replace(day=1), 1)
            year = next_month_base.year
            month = next_month_base.month
            last_day = calendar.monthrange(year, month)[1]
            if schedule.month_last_day:
                day = last_day
            else:
                day = max(1, min(int(schedule.month_day or 1), last_day))
            return date(year, month, day)

        return from_date + timedelta(days=30)

    def _scheduled_amount_from_payload(self, payload):
        total = decimal.Decimal('0')
        for row in (payload or {}).get('items', []) or []:
            try:
                qty = decimal.Decimal(str(row.get('quantity') or 0))
                unit = decimal.Decimal(str(row.get('unit_price') or 0))
                vat = decimal.Decimal(str(row.get('vat_rate') or 0))
                net = qty * unit
                gross = net * (decimal.Decimal('1') + (vat / decimal.Decimal('100')))
                total += gross
            except Exception:
                continue
        return total

    def _scheduled_resolve_note_template(self, schedule, issue_date, template_text):
        base_text = str(template_text or '')
        if not base_text:
            return base_text

        month_names_hu = [
            'január', 'február', 'március', 'április', 'május', 'június',
            'július', 'augusztus', 'szeptember', 'október', 'november', 'december'
        ]
        current_year_month = issue_date.strftime('%Y.%m')
        next_month = self._scheduled_add_months(issue_date.replace(day=1), 1)
        next_year_month = next_month.strftime('%Y.%m')
        current_year = issue_date.strftime('%Y')
        month_name = month_names_hu[issue_date.month - 1] if 1 <= issue_date.month <= 12 else ''
        next_issue_date_str = issue_date.strftime('%Y.%m.%d')
        current_month_last_day = calendar.monthrange(issue_date.year, issue_date.month)[1]
        current_month_last_day_str = issue_date.replace(day=current_month_last_day).strftime('%Y.%m.%d')
        next_month_last_day = calendar.monthrange(next_month.year, next_month.month)[1]
        next_month_last_day_str = next_month.replace(day=next_month_last_day).strftime('%Y.%m.%d')
        frequency = self._scheduled_frequency_label(schedule)

        return (
            base_text
            .replace('{év_hónap}', current_year_month)
            .replace('{év_hónap]', current_year_month)
            .replace('{év_következő hónap}', next_year_month)
            .replace('{év}', current_year)
            .replace('{hónap_nev}', month_name)
            .replace('{következő_keltezés}', next_issue_date_str)
            .replace('{hónap_utolsó_napja}', current_month_last_day_str)
            .replace('{hónap utolsó napja}', current_month_last_day_str)
            .replace('{következő_hónap_utolsó_napja}', next_month_last_day_str)
            .replace('{következő hónap utolsó napja}', next_month_last_day_str)
            .replace('{gyakoriság}', frequency)
        )

    def _scheduled_delivery_date(self, schedule, issue_date, payload):
        if not self._scheduled_bool(payload.get('use_delivery_date'), default=False):
            return None

        mode = str(payload.get('delivery_mode') or 'issue_offset').strip().lower()
        if mode == 'next_month_day':
            month_day = max(1, min(int(payload.get('delivery_month_day') or 1), 31))
            next_month = self._scheduled_add_months(issue_date.replace(day=1), 1)
            last_day = calendar.monthrange(next_month.year, next_month.month)[1]
            return date(next_month.year, next_month.month, min(month_day, last_day))

        if mode == 'next_year_day':
            year_day = max(1, min(int(payload.get('delivery_year_day') or 1), 366))
            next_year_start = date(issue_date.year + 1, 1, 1)
            return next_year_start + timedelta(days=year_day - 1)

        return issue_date + timedelta(days=int(schedule.delivery_offset_days or 0))

    def _scheduled_resolve_recipients(self, schedule):
        recipients = []
        try:
            if schedule.customer and schedule.customer.email:
                recipients.append(schedule.customer.email.strip())
        except Exception:
            pass
        try:
            contact_qs = Contact.objects.filter(customer=schedule.customer, is_active=True).exclude(email__isnull=True).exclude(email='')
            for email_val in contact_qs.values_list('email', flat=True):
                if email_val:
                    recipients.append(str(email_val).strip())
        except Exception:
            pass
        for extra in (schedule.extra_emails or []):
            if extra:
                recipients.append(str(extra).strip())
        uniq = []
        seen = set()
        for value in recipients:
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            uniq.append(value)
        return uniq

    def _scheduled_send_invoice_email(self, schedule, invoice):
        if not schedule.auto_send_email:
            return None

        company = schedule.company
        recipients = self._scheduled_resolve_recipients(schedule)
        if not recipients:
            return 'E-mail küldés kimaradt: nincs címzett.'

        template_type = schedule.email_template_type or EmailTemplate.TEMPLATE_INVOICE_SEND
        template = get_company_email_template(company, template_type)
        default_signature_html = get_default_signature_html(company)

        context = {
            'invoice_number': invoice.invoice_number or '',
            'customer_name': getattr(invoice.customer, 'name', '') or '',
            'company_name': getattr(company, 'name', '') or '',
            'signature_html': default_signature_html,
        }

        subject = str(template.get('subject_template') or 'Számla {invoice_number}')
        body = str(template.get('body_template') or 'Tisztelt {customer_name}!')
        for key, value in context.items():
            subject = subject.replace('{' + key + '}', str(value if value is not None else ''))
            body = body.replace('{' + key + '}', str(value if value is not None else ''))

        ces = getattr(company, 'email_settings', None)
        host = (ces.smtp_host if ces and ces.smtp_host else None) or os.environ.get('SMTP_HOST') or os.environ.get('EMAIL_HOST')
        port = int((ces.smtp_port if ces and ces.smtp_port else None) or os.environ.get('SMTP_PORT') or os.environ.get('EMAIL_PORT') or 587)
        user = (ces.smtp_user if ces and ces.smtp_user else None) or os.environ.get('SMTP_USER') or os.environ.get('EMAIL_HOST_USER')
        pwd = (ces.smtp_password if ces and ces.smtp_password else None) or os.environ.get('SMTP_PASSWORD') or os.environ.get('EMAIL_HOST_PASSWORD')
        use_tls = bool(ces.smtp_use_tls) if ces and ces.smtp_use_tls is not None else (os.environ.get('SMTP_USE_TLS', '1') == '1')
        if not host or not user or not pwd:
            return 'E-mail küldés kimaradt: SMTP beállítások hiányoznak.'

        imap_host = (ces.imap_host if ces and ces.imap_host else None) or os.environ.get('IMAP_HOST')
        imap_user = (ces.imap_user if ces and ces.imap_user else None) or os.environ.get('IMAP_USER') or user
        imap_pwd = (ces.imap_password if ces and ces.imap_password else None) or os.environ.get('IMAP_PASSWORD') or pwd
        imap_port = int((ces.imap_port if ces and getattr(ces, 'imap_port', None) else None) or os.environ.get('IMAP_PORT') or 993)
        sent_folder = (ces.imap_sent_folder if ces and ces.imap_sent_folder else None) or os.environ.get('IMAP_SENT_FOLDER') or 'Sent'
        from_addr = (ces.smtp_from if ces and ces.smtp_from else None) or os.environ.get('SMTP_FROM') or user

        smtp_config = (host, port, user, pwd, use_tls)
        imap_config = (imap_host, imap_user, imap_pwd, imap_port, sent_folder)

        import threading
        thread = threading.Thread(
            target=_send_bulk_email_thread,
            args=([str(invoice.id)], subject, body, from_addr, recipients, [], [], smtp_config, imap_config, [])
        )
        thread.start()
        return None

    def _scheduled_generate_invoice(self, request, schedule, issue_date):
        payload = dict(schedule.template_payload or {})
        payload['customer_id'] = str(schedule.customer_id)
        payload['company_id'] = str(schedule.company_id)
        if schedule.invoice_block_id:
            payload['invoice_block_id'] = str(schedule.invoice_block_id)

        payload['issue_date'] = issue_date.isoformat()
        payload['due_date'] = (issue_date + timedelta(days=int(schedule.due_offset_days or 0))).isoformat()
        delivery_date = self._scheduled_delivery_date(schedule, issue_date, payload)
        payload['delivery_date'] = delivery_date.isoformat() if delivery_date else None
        payload['notes'] = self._scheduled_resolve_note_template(schedule, issue_date, payload.get('notes'))

        currency = str(payload.get('currency') or 'HUF').upper()
        if currency != 'HUF':
            try:
                fx = MNBApiClient().get_exchange_rate_for_date(currency, payload['issue_date'])
                if fx:
                    payload['exchange_rate'] = float(fx)
            except Exception:
                pass
        elif not payload.get('exchange_rate'):
            payload['exchange_rate'] = 1

        serializer = InvoiceCreateSerializer(data=payload, context={'request': request})
        if not serializer.is_valid():
            return None, serializer.errors

        invoice = serializer.save()
        try:
            user = request.user if getattr(request.user, 'is_authenticated', False) else None
            if user:
                invoice.created_by = user
                invoice.save(update_fields=['created_by', 'updated_at'])
        except Exception:
            pass
        return invoice, None

    def _scheduled_submit_to_nav(self, request, invoice):
        try:
            response = self.submit_to_nav(request, pk=str(invoice.id))
            status_code = getattr(response, 'status_code', 200)
            if status_code >= 400:
                data = getattr(response, 'data', None)
                if isinstance(data, dict):
                    return data.get('error') or data.get('error_message') or str(data)
                return f'NAV beküldés sikertelen (HTTP {status_code})'
            try:
                invoice.refresh_from_db()
            except Exception:
                pass
            return None
        except Exception as exc:
            return f'NAV beküldési hiba: {exc}'

    def _scheduled_process_due(self, request, company):
        today = timezone.localdate()
        processed = 0
        blocked = 0
        failed = 0

        schedules = ScheduledInvoice.objects.filter(
            company=company,
            is_active=True,
            next_issue_date__isnull=False,
            next_issue_date__lte=today,
        ).select_related('customer', 'invoice_block', 'company').order_by('next_issue_date')

        for schedule in schedules:
            guard = 0
            while schedule.next_issue_date and schedule.next_issue_date <= today and guard < 24:
                guard += 1

                if schedule.approval_required and not schedule.is_approved:
                    schedule.last_error = 'Kiállítás sikertelen: nincs jóváhagyva.'
                    schedule.save(update_fields=['last_error', 'updated_at'])
                    blocked += 1
                    break

                issue_for = today if schedule.approval_required else schedule.next_issue_date
                invoice, error = self._scheduled_generate_invoice(request, schedule, issue_for)
                if error:
                    schedule.last_error = f'Kiállítás sikertelen: {error}'
                    schedule.save(update_fields=['last_error', 'updated_at'])
                    failed += 1
                    break

                ScheduledInvoiceRun.objects.create(
                    scheduled_invoice=schedule,
                    invoice=invoice,
                    issued_for_date=issue_for,
                )

                schedule.last_issue_date = issue_for
                schedule.last_generated_invoice = invoice
                schedule.next_issue_date = self._scheduled_next_issue_date(schedule, issue_for)
                schedule.last_error = None
                if schedule.approval_required:
                    schedule.is_approved = False
                    schedule.approved_at = None
                    schedule.approved_by = None
                schedule.save(update_fields=[
                    'last_issue_date',
                    'last_generated_invoice',
                    'next_issue_date',
                    'last_error',
                    'is_approved',
                    'approved_at',
                    'approved_by',
                    'updated_at',
                ])

                email_error = self._scheduled_send_invoice_email(schedule, invoice)
                if email_error:
                    schedule.last_error = email_error
                    schedule.save(update_fields=['last_error', 'updated_at'])

                if not schedule.approval_required:
                    nav_error = self._scheduled_submit_to_nav(request, invoice)
                    if nav_error:
                        schedule.last_error = nav_error
                        schedule.save(update_fields=['last_error', 'updated_at'])

                processed += 1

        return {'processed': processed, 'blocked': blocked, 'failed': failed}

    @action(detail=False, methods=['post'], url_path='scheduled-invoices/process')
    def scheduled_invoices_process(self, request):
        company_id = request.data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_404_NOT_FOUND)
        result = self._scheduled_process_due(request, company)
        return Response(result)

    @action(detail=False, methods=['post'], url_path='scheduled-invoices/create')
    def scheduled_invoices_create(self, request):
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        customer_id = data.get('customer_id')
        start_issue_date = data.get('start_issue_date')
        template_payload = data.get('template_payload') or {}

        if not company_id or not customer_id or not start_issue_date:
            return Response({'error': 'company_id, customer_id, start_issue_date kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
            customer = Customer.objects.get(id=customer_id)
        except (Company.DoesNotExist, Customer.DoesNotExist):
            return Response({'error': 'Cég vagy ügyfél nem található'}, status=status.HTTP_404_NOT_FOUND)

        try:
            start_date = datetime.strptime(str(start_issue_date), '%Y-%m-%d').date()
        except Exception:
            return Response({'error': 'Hibás start_issue_date formátum (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

        invoice_block = None
        invoice_block_id = data.get('invoice_block_id')
        if invoice_block_id:
            try:
                invoice_block = InvoiceBlock.objects.get(id=invoice_block_id)
            except InvoiceBlock.DoesNotExist:
                return Response({'error': 'Számlatömb nem található'}, status=status.HTTP_404_NOT_FOUND)

        approval_required = self._scheduled_bool(data.get('approval_required'), default=False)
        first_invoice = self._scheduled_bool(data.get('first_invoice'), default=False)

        schedule = ScheduledInvoice.objects.create(
            company=company,
            customer=customer,
            invoice_block=invoice_block,
            schedule_mode=(data.get('schedule_mode') or ScheduledInvoice.MODE_INTERVAL),
            interval_unit=(data.get('interval_unit') or ScheduledInvoice.INTERVAL_MONTH),
            interval_value=max(int(data.get('interval_value') or 1), 1),
            weekday=(int(data.get('weekday')) if str(data.get('weekday') or '').strip() != '' else None),
            month_day=(int(data.get('month_day')) if str(data.get('month_day') or '').strip() != '' else None),
            month_last_day=self._scheduled_bool(data.get('month_last_day'), default=False),
            next_issue_date=start_date,
            due_offset_days=int(data.get('due_offset_days') or 0),
            delivery_offset_days=int(data.get('delivery_offset_days') or 0),
            approval_required=approval_required,
            is_approved=(not approval_required),
            auto_send_email=self._scheduled_bool(data.get('auto_send_email'), default=False),
            email_template_type=(data.get('email_template_type') or EmailTemplate.TEMPLATE_INVOICE_SEND),
            extra_emails=data.get('extra_emails') or [],
            template_payload=template_payload,
            is_active=self._scheduled_bool(data.get('is_active'), default=True),
            created_by=(request.user if getattr(request.user, 'is_authenticated', False) else None),
        )

        created_invoice_number = None
        if first_invoice:
            invoice, error = self._scheduled_generate_invoice(request, schedule, start_date)
            if error:
                schedule.last_error = f'Kezdő számla kiállítása sikertelen: {error}'
                schedule.save(update_fields=['last_error', 'updated_at'])
            else:
                created_invoice_number = invoice.invoice_number
                ScheduledInvoiceRun.objects.create(
                    scheduled_invoice=schedule,
                    invoice=invoice,
                    issued_for_date=start_date,
                )
                schedule.last_issue_date = start_date
                schedule.last_generated_invoice = invoice
                schedule.next_issue_date = self._scheduled_next_issue_date(schedule, start_date)
                schedule.last_error = None
                if schedule.approval_required:
                    schedule.is_approved = False
                    schedule.approved_at = None
                    schedule.approved_by = None
                schedule.save(update_fields=[
                    'last_issue_date',
                    'last_generated_invoice',
                    'next_issue_date',
                    'last_error',
                    'is_approved',
                    'approved_at',
                    'approved_by',
                    'updated_at',
                ])
                email_error = self._scheduled_send_invoice_email(schedule, invoice)
                if email_error:
                    schedule.last_error = email_error
                    schedule.save(update_fields=['last_error', 'updated_at'])

                if not schedule.approval_required:
                    nav_error = self._scheduled_submit_to_nav(request, invoice)
                    if nav_error:
                        schedule.last_error = nav_error
                        schedule.save(update_fields=['last_error', 'updated_at'])

        return Response({
            'id': str(schedule.id),
            'created_invoice_number': created_invoice_number,
            'next_issue_date': str(schedule.next_issue_date),
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='scheduled-invoices/list')
    def scheduled_invoices_list(self, request):
        company_id = request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_404_NOT_FOUND)

        process_result = self._scheduled_process_due(request, company)

        approval_filter = (request.query_params.get('approval_filter') or 'all').strip().lower()
        active_filter = (request.query_params.get('active_filter') or 'active').strip().lower()
        search = (request.query_params.get('search') or '').strip().lower()
        sort_by = (request.query_params.get('sort_by') or 'next').strip().lower()
        sort_dir = (request.query_params.get('sort_dir') or 'asc').strip().lower()

        qs = ScheduledInvoice.objects.filter(company=company).select_related('customer', 'last_generated_invoice').order_by('created_at')
        if active_filter == 'active':
            qs = qs.filter(is_active=True)
        elif active_filter == 'inactive':
            qs = qs.filter(is_active=False)

        rows = []
        for schedule in qs:
            if search and search not in (schedule.customer.name or '').lower():
                continue

            if approval_filter == 'automatic' and schedule.approval_required:
                continue
            if approval_filter == 'approved' and (not schedule.approval_required or not schedule.is_approved):
                continue
            if approval_filter == 'unapproved' and (not schedule.approval_required or schedule.is_approved):
                continue

            amount_gross = self._scheduled_amount_from_payload(schedule.template_payload)
            currency = str((schedule.template_payload or {}).get('currency') or 'HUF').upper()

            approval_value = 2 if not schedule.approval_required else (1 if schedule.is_approved else 0)
            rows.append({
                'id': str(schedule.id),
                'customer_id': str(schedule.customer_id),
                'customer_name': schedule.customer.name,
                'frequency_label': self._scheduled_frequency_label(schedule),
                'last_issue_date': str(schedule.last_issue_date) if schedule.last_issue_date else None,
                'next_issue_date': str(schedule.next_issue_date) if schedule.next_issue_date else None,
                'gross_amount': float(amount_gross),
                'currency': currency,
                'approval_required': schedule.approval_required,
                'is_approved': schedule.is_approved,
                'approval_label': ('Automatikus' if not schedule.approval_required else ('Jóváhagyva' if schedule.is_approved else 'Nincs jóváhagyva')),
                'approval_sort_value': approval_value,
                'is_active': schedule.is_active,
                'last_error': schedule.last_error,
                'last_generated_invoice_id': str(schedule.last_generated_invoice_id) if schedule.last_generated_invoice_id else None,
                'last_generated_invoice_number': (schedule.last_generated_invoice.invoice_number if schedule.last_generated_invoice else None),
            })

        reverse = sort_dir == 'desc'
        if sort_by == 'customer':
            rows.sort(key=lambda r: (r['customer_name'] or '').lower(), reverse=reverse)
        elif sort_by == 'last':
            rows.sort(key=lambda r: (r['last_issue_date'] or ''), reverse=reverse)
        elif sort_by == 'next':
            rows.sort(key=lambda r: (r['next_issue_date'] or ''), reverse=reverse)
        elif sort_by == 'amount':
            rows.sort(key=lambda r: r['gross_amount'] or 0, reverse=reverse)
        elif sort_by == 'approval':
            rows.sort(key=lambda r: r['approval_sort_value'], reverse=reverse)

        return Response({'results': rows, 'process': process_result})

    @action(detail=False, methods=['post'], url_path='scheduled-invoices/approve')
    def scheduled_invoices_approve(self, request):
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        schedule_ids = data.get('schedule_ids') or []
        if not company_id or not isinstance(schedule_ids, list) or not schedule_ids:
            return Response({'error': 'company_id és schedule_ids kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        qs = ScheduledInvoice.objects.filter(company_id=company_id, id__in=schedule_ids, approval_required=True)
        now_ts = timezone.now()
        today = timezone.localdate()
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        updated = 0
        generated = 0
        failed = 0
        for row in qs:
            row.is_approved = True
            row.approved_at = now_ts
            row.approved_by = user
            row.last_error = None
            row.save(update_fields=['is_approved', 'approved_at', 'approved_by', 'last_error', 'updated_at'])
            updated += 1

            if not row.is_active:
                continue

            invoice, error = self._scheduled_generate_invoice(request, row, today)
            if error:
                row.last_error = f'Jóváhagyás utáni kiállítás sikertelen: {error}'
                row.save(update_fields=['last_error', 'updated_at'])
                failed += 1
                continue

            ScheduledInvoiceRun.objects.create(
                scheduled_invoice=row,
                invoice=invoice,
                issued_for_date=today,
            )

            row.last_issue_date = today
            row.last_generated_invoice = invoice
            row.next_issue_date = self._scheduled_next_issue_date(row, today)
            row.last_error = None
            row.is_approved = False
            row.approved_at = None
            row.approved_by = None
            row.save(update_fields=[
                'last_issue_date',
                'last_generated_invoice',
                'next_issue_date',
                'last_error',
                'is_approved',
                'approved_at',
                'approved_by',
                'updated_at',
            ])
            generated += 1

        return Response({'approved': updated, 'generated': generated, 'failed': failed})

    @action(detail=False, methods=['get'], url_path='scheduled-invoices/(?P<schedule_id>[^/.]+)/template')
    def scheduled_invoices_template(self, request, schedule_id=None):
        schedule = get_object_or_404(ScheduledInvoice, id=schedule_id)
        payload = dict(schedule.template_payload or {})
        payload['customer_id'] = str(schedule.customer_id)
        payload['company_id'] = str(schedule.company_id)
        if schedule.invoice_block_id:
            payload['invoice_block_id'] = str(schedule.invoice_block_id)

        return Response({
            'id': str(schedule.id),
            'template_payload': payload,
            'schedule_mode': schedule.schedule_mode,
            'interval_unit': schedule.interval_unit,
            'interval_value': schedule.interval_value,
            'weekday': schedule.weekday,
            'month_day': schedule.month_day,
            'month_last_day': schedule.month_last_day,
            'next_issue_date': str(schedule.next_issue_date),
            'due_offset_days': schedule.due_offset_days,
            'delivery_offset_days': schedule.delivery_offset_days,
            'approval_required': schedule.approval_required,
            'is_approved': schedule.is_approved,
            'auto_send_email': schedule.auto_send_email,
            'email_template_type': schedule.email_template_type,
            'extra_emails': schedule.extra_emails or [],
            'is_active': schedule.is_active,
        })

    @action(detail=False, methods=['put'], url_path='scheduled-invoices/(?P<schedule_id>[^/.]+)/update')
    def scheduled_invoices_update(self, request, schedule_id=None):
        schedule = get_object_or_404(ScheduledInvoice, id=schedule_id)
        data = request.data or {}

        if str(data.get('company_id') or schedule.company_id) != str(schedule.company_id):
            return Response({'error': 'A schedule másik céghez tartozik'}, status=status.HTTP_400_BAD_REQUEST)

        if data.get('customer_id'):
            try:
                schedule.customer = Customer.objects.get(id=data.get('customer_id'))
            except Customer.DoesNotExist:
                return Response({'error': 'Ügyfél nem található'}, status=status.HTTP_404_NOT_FOUND)

        if 'invoice_block_id' in data:
            invoice_block_id = data.get('invoice_block_id')
            if invoice_block_id:
                try:
                    schedule.invoice_block = InvoiceBlock.objects.get(id=invoice_block_id)
                except InvoiceBlock.DoesNotExist:
                    return Response({'error': 'Számlatömb nem található'}, status=status.HTTP_404_NOT_FOUND)
            else:
                schedule.invoice_block = None

        for field_name in ['schedule_mode', 'interval_unit', 'email_template_type']:
            if field_name in data and data.get(field_name) is not None:
                setattr(schedule, field_name, data.get(field_name))

        if 'interval_value' in data:
            schedule.interval_value = max(int(data.get('interval_value') or 1), 1)
        if 'weekday' in data:
            schedule.weekday = (int(data.get('weekday')) if str(data.get('weekday') or '').strip() != '' else None)
        if 'month_day' in data:
            schedule.month_day = (int(data.get('month_day')) if str(data.get('month_day') or '').strip() != '' else None)
        if 'month_last_day' in data:
            schedule.month_last_day = self._scheduled_bool(data.get('month_last_day'), default=False)
        if 'next_issue_date' in data and data.get('next_issue_date'):
            try:
                schedule.next_issue_date = datetime.strptime(str(data.get('next_issue_date')), '%Y-%m-%d').date()
            except Exception:
                return Response({'error': 'Hibás next_issue_date formátum'}, status=status.HTTP_400_BAD_REQUEST)

        if 'due_offset_days' in data:
            schedule.due_offset_days = int(data.get('due_offset_days') or 0)
        if 'delivery_offset_days' in data:
            schedule.delivery_offset_days = int(data.get('delivery_offset_days') or 0)
        if 'approval_required' in data:
            prev = schedule.approval_required
            schedule.approval_required = self._scheduled_bool(data.get('approval_required'), default=False)
            if schedule.approval_required and not prev:
                schedule.is_approved = False
                schedule.approved_at = None
                schedule.approved_by = None
            if not schedule.approval_required:
                schedule.is_approved = True
                schedule.approved_at = None
                schedule.approved_by = None
        if 'auto_send_email' in data:
            schedule.auto_send_email = self._scheduled_bool(data.get('auto_send_email'), default=False)
        if 'extra_emails' in data:
            schedule.extra_emails = data.get('extra_emails') or []
        if 'template_payload' in data and isinstance(data.get('template_payload'), dict):
            schedule.template_payload = data.get('template_payload')
        if 'is_active' in data:
            schedule.is_active = self._scheduled_bool(data.get('is_active'), default=True)

        schedule.save()
        return Response({'success': True, 'id': str(schedule.id)})

    @action(detail=False, methods=['delete'], url_path='scheduled-invoices/(?P<schedule_id>[^/.]+)/delete')
    def scheduled_invoices_delete(self, request, schedule_id=None):
        schedule = get_object_or_404(ScheduledInvoice, id=schedule_id)
        schedule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], url_path='scheduled-invoices/(?P<schedule_id>[^/.]+)/toggle-active')
    def scheduled_invoices_toggle_active(self, request, schedule_id=None):
        schedule = get_object_or_404(ScheduledInvoice, id=schedule_id)
        if 'is_active' in request.data:
            schedule.is_active = self._scheduled_bool(request.data.get('is_active'), default=schedule.is_active)
        else:
            schedule.is_active = not schedule.is_active
        schedule.save(update_fields=['is_active', 'updated_at'])
        return Response({'id': str(schedule.id), 'is_active': schedule.is_active})

    @action(detail=False, methods=['get'], url_path='scheduled-invoices/(?P<schedule_id>[^/.]+)/invoices')
    def scheduled_invoices_invoices(self, request, schedule_id=None):
        schedule = get_object_or_404(ScheduledInvoice, id=schedule_id)
        rows = []
        for run in schedule.runs.select_related('invoice').order_by('-created_at')[:200]:
            inv = run.invoice
            rows.append({
                'run_id': str(run.id),
                'invoice_id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'issue_date': str(inv.issue_date) if inv.issue_date else None,
                'due_date': str(inv.due_date) if inv.due_date else None,
                'status': inv.status,
                'gross_amount': float(inv.total_gross_amount or 0),
                'currency': inv.currency,
                'created_at': str(run.created_at),
            })
        return Response({'results': rows})

    @action(detail=False, methods=['get'])
    def unpaid(self, request):
        """List invoices considered unpaid (status not 'paid' or 'cancelled').
        Only 'transfer' and 'cod' payment methods are considered.
        Excludes storno invoices and their originals.
        """
        queryset = (
            Invoice.objects
            .exclude(status='paid')
            .exclude(status='cancelled')
            .filter(Q(payment_method__iexact='transfer') | Q(payment_method__iexact='cod'))
        )
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
        company_id = request.query_params.get('company_id') or request.query_params.get('company')
        if company_id in (None, '', 'null', 'undefined'):
            company_id = None
        customer_id = request.query_params.get('customer_id')
        if company_id:
            queryset = queryset.filter(company_id=company_id)
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
        data = []
        for inv in queryset.select_related('customer').order_by('-issue_date')[:500]:
            gross = inv.total_gross_amount
            paid = inv.amount_paid or 0
            outstanding_val = float((gross - paid) if gross is not None else 0)
            exc_rate = getattr(inv, 'exchange_rate', None)
            inv_currency = (str(inv.currency or '') or 'HUF').strip().upper()
            gross_huf = None
            if gross is not None and exc_rate is not None and inv_currency != 'HUF':
                try:
                    import decimal as _dec
                    _rate = _dec.Decimal(str(exc_rate))
                    if _rate > _dec.Decimal('1.01'):
                        gross_huf = float((_dec.Decimal(str(gross)) * _rate).quantize(_dec.Decimal('0.01')))
                except Exception:
                    pass
            data.append({
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'company_id': str(inv.company_id),
                'company': str(inv.company_id),
                'customer_id': str(inv.customer.id),
                'customer_name': inv.customer.name,
                'currency': inv_currency,
                'gross_amount': float(gross) if gross is not None else 0,
                'gross_amount_huf': gross_huf,
                'exchange_rate': float(exc_rate) if exc_rate is not None else None,
                'amount_paid': float(paid),
                'outstanding': outstanding_val,
                'issue_date': str(inv.issue_date),
                'due_date': str(inv.due_date),
                'status': inv.status,
            })
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
        requested_language = (data.get('language') or getattr(getattr(inv, 'invoice_block', None), 'language', None) or 'hu').lower()
        template_language = 'en' if requested_language.startswith('en') else 'hu'
        subject = data.get('subject') or ''
        body = data.get('body')
        body_from_request = bool(body)
        if not subject or not body:
            company = inv.company
            default_signature_html = get_default_signature_html(company)
            invoice_template = get_company_email_template(company, EmailTemplate.TEMPLATE_INVOICE_SEND, template_language)

            def render_curly(tpl_str, ctx_dict):
                out = str(tpl_str or '')
                for key, value in (ctx_dict or {}).items():
                    out = out.replace('{' + str(key) + '}', str(value if value is not None else ''))
                return out

            invoice_ctx = {
                'invoice_number': inv.invoice_number or '',
                'customer_name': getattr(inv.customer, 'name', '') or '',
                'company_name': getattr(inv.company, 'name', '') or '',
                'signature_html': default_signature_html,
            }

            if not subject:
                subject = render_curly(invoice_template.get('subject_template') or '', invoice_ctx).strip()
            if not body:
                body = render_curly(invoice_template.get('body_template') or '', invoice_ctx).strip()

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
        if not subject:
            subject = f"Számla {inv.invoice_number}"

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

        # Determine display_decimals (0 for HUF, else from Currency model)
        from decimal import Decimal, ROUND_HALF_UP
        _is_huf_pdf = (inv.currency or 'HUF').upper() == 'HUF'
        if _is_huf_pdf:
            display_decimals = 0
        else:
            try:
                _curr_obj = Currency.objects.get(code=inv.currency)
                display_decimals = _curr_obj.display_decimals
            except Exception:
                display_decimals = 2
        _dec_fmt = Decimal('1') if display_decimals == 0 else Decimal('0.' + '0' * display_decimals)
        def _rnd_pdf(v):
            return float(Decimal(str(v)).quantize(_dec_fmt, rounding=ROUND_HALF_UP))

        # Round vat_summary rows to match frontend display
        for row in vat_summary:
            row['net'] = _rnd_pdf(row['net'])
            row['vat'] = _rnd_pdf(row['vat'])
            row['gross'] = _rnd_pdf(row['gross'])

        # Calculate HUF totals if needed
        huf_totals = None
        if not _is_huf_pdf:
             ex = inv.exchange_rate or 1
             _huf_rnd = lambda v: float(Decimal(str(v)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
             huf_totals = {
                 'net': _huf_rnd(inv.total_net_amount * ex),
                 'vat': _huf_rnd(inv.total_vat_amount * ex),
                 'gross': _huf_rnd(inv.total_gross_amount * ex)
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

        bilingual = _resolve_invoice_bilingual(inv)

        pdf_buf = io.BytesIO()
        if HTML:
            try:
                ctx = { 
                    'invoice': inv, 
                    'bilingual': bilingual,
                    'block': inv.invoice_block,
                    'vat_summary': vat_summary,
                    'huf_totals': huf_totals,
                    'rounding_diff': rounding_diff,
                    'payable_amount': payable_amount,
                    'amount_words': amount_words,
                    'display_decimals': display_decimals,
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
                'bilingual': _resolve_invoice_bilingual(inv),
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
                        'bilingual': _resolve_invoice_bilingual(inv),
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

        def render_curly(tpl_str, ctx_dict):
            out = str(tpl_str or '')
            for key, value in (ctx_dict or {}).items():
                out = out.replace('{' + str(key) + '}', str(value if value is not None else ''))
            return out

        requested_language = (data.get('language') or getattr(getattr(invoices[0], 'invoice_block', None), 'language', None) or 'hu').lower()
        template_language = 'en' if requested_language.startswith('en') else 'hu'
        invoice_template = get_company_email_template(company, EmailTemplate.TEMPLATE_INVOICE_SEND, template_language)
        default_signature_html = get_default_signature_html(company)
        invoice_ctx = {
            'invoice_number': invoices[0].invoice_number or '',
            'customer_name': getattr(invoices[0].customer, 'name', '') or '',
            'company_name': getattr(company, 'name', '') or '',
            'signature_html': default_signature_html,
        }

        if not subject:
            subject = render_curly(invoice_template.get('subject_template') or '', invoice_ctx).strip()

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
        
        if not body and invoice_template.get('body_template'):
            body = render_curly(invoice_template.get('body_template'), invoice_ctx)

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

    def _outgoing_payable_and_remaining(self, invoice):
        gross = decimal.Decimal(str(invoice.total_gross_amount or 0))
        paid = decimal.Decimal(str(invoice.amount_paid or 0))
        currency = str(getattr(invoice, 'currency', '') or 'HUF').upper()
        payment_method = str(getattr(invoice, 'payment_method', '') or '').lower()

        payable = gross
        if currency == 'HUF' and payment_method in ('cash', 'cod'):
            payable = (gross / decimal.Decimal('5')).quantize(decimal.Decimal('1'), rounding=decimal.ROUND_HALF_UP) * decimal.Decimal('5')

        remaining = payable - paid
        if remaining < 0:
            remaining = decimal.Decimal('0')

        tolerance = decimal.Decimal('5.0') if currency == 'HUF' else decimal.Decimal('0.01')
        is_settled = payable > 0 and remaining < tolerance
        return payable, remaining, is_settled

    def _arrears_status_label_map(self):
        return {
            Invoice.ARREARS_STATUS_OVERDUE: 'Lejárt',
            Invoice.ARREARS_STATUS_NOTICE: 'Kintlévőségi értesítő kiküldése',
            Invoice.ARREARS_STATUS_REMINDER_1: '1. Felszólítás',
            Invoice.ARREARS_STATUS_REMINDER_2: '2. Felszólítás',
            Invoice.ARREARS_STATUS_LEGAL: 'Ügyvédi levél',
            Invoice.ARREARS_STATUS_PAYMENT_ORDER: 'Fizetési meghagyás',
            Invoice.ARREARS_STATUS_LITIGATION: 'Peresítés',
            Invoice.ARREARS_STATUS_WON: 'Pert nyert',
            Invoice.ARREARS_STATUS_LOST: 'Pert vesztett',
        }

    def _arrears_next_status_map(self):
        return {
            Invoice.ARREARS_STATUS_OVERDUE: Invoice.ARREARS_STATUS_NOTICE,
            Invoice.ARREARS_STATUS_NOTICE: Invoice.ARREARS_STATUS_REMINDER_1,
            Invoice.ARREARS_STATUS_REMINDER_1: Invoice.ARREARS_STATUS_REMINDER_2,
            Invoice.ARREARS_STATUS_REMINDER_2: Invoice.ARREARS_STATUS_LEGAL,
            Invoice.ARREARS_STATUS_LEGAL: Invoice.ARREARS_STATUS_PAYMENT_ORDER,
            Invoice.ARREARS_STATUS_PAYMENT_ORDER: Invoice.ARREARS_STATUS_LITIGATION,
        }

    def _arrears_template_for_target_status(self, target_status):
        return {
            Invoice.ARREARS_STATUS_NOTICE: EmailTemplate.TEMPLATE_ARREARS,
            Invoice.ARREARS_STATUS_REMINDER_1: EmailTemplate.TEMPLATE_REMINDER_1,
            Invoice.ARREARS_STATUS_REMINDER_2: EmailTemplate.TEMPLATE_REMINDER_2,
            Invoice.ARREARS_STATUS_LEGAL: EmailTemplate.TEMPLATE_LEGAL,
            Invoice.ARREARS_STATUS_PAYMENT_ORDER: EmailTemplate.TEMPLATE_PAYMENT_ORDER,
            Invoice.ARREARS_STATUS_LITIGATION: EmailTemplate.TEMPLATE_LITIGATION,
        }.get(target_status)

    def _resolve_invoice_arrears_status(self, invoice):
        return (invoice.arrears_status or Invoice.ARREARS_STATUS_OVERDUE)

    def _collect_overdue_entries(self, company, invoice_ids=None):
        today = timezone.localdate()
        qs = Invoice.objects.filter(company=company).exclude(status='cancelled').select_related('customer')
        if invoice_ids:
            qs = qs.filter(id__in=invoice_ids)

        status_labels = self._arrears_status_label_map()
        next_map = self._arrears_next_status_map()
        entries = []
        for inv in qs:
            if not inv.due_date or inv.due_date >= today:
                continue
            payable, remaining, is_settled = self._outgoing_payable_and_remaining(inv)
            if is_settled:
                continue
            arrears_status = self._resolve_invoice_arrears_status(inv)
            next_status = next_map.get(arrears_status)
            if arrears_status == Invoice.ARREARS_STATUS_OVERDUE:
                days_in_status = max((today - inv.due_date).days, 0)
            elif inv.arrears_status_changed_at:
                days_in_status = max((today - timezone.localtime(inv.arrears_status_changed_at).date()).days, 0)
            else:
                days_in_status = max((today - inv.due_date).days, 0)
            entries.append({
                'invoice': inv,
                'payable': payable,
                'remaining': remaining,
                'days_overdue': (today - inv.due_date).days,
                'arrears_status': arrears_status,
                'arrears_status_label': status_labels.get(arrears_status, arrears_status),
                'days_in_status': days_in_status,
                'next_status': next_status,
                'next_status_label': status_labels.get(next_status) if next_status else None,
            })
        return entries

    def _set_arrears_status(self, invoices, new_status):
        if not invoices:
            return 0
        now_ts = timezone.now()
        changed = 0
        for inv in invoices:
            inv.arrears_status = new_status
            inv.arrears_status_changed_at = now_ts
            inv.save(update_fields=['arrears_status', 'arrears_status_changed_at', 'updated_at'])
            changed += 1
        return changed

    def _send_arrears_emails_by_template(self, company, entries, template_type):
        import smtplib
        import ssl
        from email.message import EmailMessage

        if not entries:
            return {'sent': 0, 'skipped': 0, 'details': [], 'failed_customer_ids': []}

        ces = CompanyEmailSettings.objects.filter(company=company).first()
        host = (getattr(ces, 'smtp_host', None) or os.environ.get('SMTP_HOST') or os.environ.get('EMAIL_HOST'))
        port = int((getattr(ces, 'smtp_port', None) or os.environ.get('SMTP_PORT') or os.environ.get('EMAIL_PORT') or 587))
        user = (getattr(ces, 'smtp_user', None) or os.environ.get('SMTP_USER') or os.environ.get('EMAIL_HOST_USER'))
        pwd = (getattr(ces, 'smtp_password', None) or os.environ.get('SMTP_PASSWORD') or os.environ.get('EMAIL_HOST_PASSWORD'))
        use_tls = bool(getattr(ces, 'smtp_use_tls', True)) if ces else (os.environ.get('SMTP_USE_TLS', '1') == '1')
        from_addr = ((getattr(ces, 'smtp_from', None) if ces else None) or os.environ.get('SMTP_FROM') or user)
        if not host or not user or not pwd or not from_addr:
            raise ValueError('SMTP beállítások hiányoznak (host/user/password/from)')

        grouped = {}
        for item in entries:
            inv = item['invoice']
            cust = inv.customer
            key = str(cust.id)
            row = grouped.setdefault(key, {'customer': cust, 'items': []})
            row['items'].append(item)

        def fmt_money(amount, currency):
            try:
                d = decimal.Decimal(str(amount or 0))
            except Exception:
                d = decimal.Decimal('0')
            if (currency or '').upper() == 'HUF':
                return f"{int(d):,}".replace(',', ' ') + ' Ft'
            return f"{d:.2f} {currency}"

        def render_tpl(tpl, ctx):
            out = str(tpl or '')
            for k, v in ctx.items():
                out = out.replace('{' + k + '}', str(v if v is not None else ''))
            return out

        today = timezone.localdate()
        city = (getattr(company, 'city', None) or '').strip()
        today_city_date = f"{city}, {today.strftime('%Y.%m.%d')}" if city else today.strftime('%Y.%m.%d')

        tpl_data = get_company_email_template(company, template_type)
        default_signature_html = get_default_signature_html(company)
        subject_tpl = tpl_data.get('subject_template') or 'Kintlévőség értesítő - lejárt számlák'
        body_tpl = tpl_data.get('body_template') or '<p>Tisztelt Ügyfél!</p><p>Nyilvántartásunk szerint lejárt tartozásuk van.</p>{invoices_table}<p>{today_city_date}</p><p>{signature_html}</p>'

        details = []
        sent_count = 0
        skipped_count = 0
        sent_customer_ids = set()
        failed_customer_ids = []
        for row in grouped.values():
            customer = row['customer']
            items = row['items']
            recipient = (getattr(customer, 'email', None) or '').strip()
            if not recipient:
                skipped_count += 1
                details.append({'customer_id': str(customer.id), 'customer_name': customer.name, 'status': 'skipped', 'reason': 'Nincs ügyfél e-mail cím'})
                continue

            currency = (items[0]['invoice'].currency or 'HUF').upper()
            total_outstanding = sum((it['remaining'] for it in items), decimal.Decimal('0'))
            table_rows = []
            for it in sorted(items, key=lambda x: (x['invoice'].due_date or timezone.localdate())):
                inv = it['invoice']
                table_rows.append(
                    f"<tr><td>{inv.invoice_number}</td><td>{inv.issue_date or ''}</td><td>{inv.due_date or ''}</td><td style='text-align:right'>{fmt_money(it['remaining'], currency)}</td></tr>"
                )
            invoices_table = (
                "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'>"
                "<thead><tr><th>Számla sorszám</th><th>Kelt</th><th>Esedékesség</th><th>Tartozás</th></tr></thead>"
                f"<tbody>{''.join(table_rows)}</tbody></table>"
            )

            ctx = {
                'customer_name': customer.name,
                'company_name': company.name,
                'as_of_date': today.isoformat(),
                'today_date': today.strftime('%Y.%m.%d'),
                'today_city_date': today_city_date,
                'company_city': city,
                'total_outstanding': fmt_money(total_outstanding, currency),
                'invoice_count': len(items),
                'currency': currency,
                'invoices_table': invoices_table,
                'sender_name': (getattr(ces, 'default_sender_name', None) if ces else '') or '',
                'sender_phone': (getattr(ces, 'default_sender_phone', None) if ces else '') or '',
                'signature_html': default_signature_html,
            }
            subject = render_tpl(subject_tpl, ctx)
            body = render_tpl(body_tpl, ctx)

            msg = EmailMessage()
            msg['Subject'] = subject
            msg['From'] = from_addr
            msg['To'] = recipient
            if '<' in body and '>' in body:
                msg.set_content('HTML levél')
                msg.add_alternative(body, subtype='html')
            else:
                msg.set_content(body)
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
                sent_count += 1
                details.append({'customer_id': str(customer.id), 'customer_name': customer.name, 'to': recipient, 'status': 'sent', 'invoice_count': len(items)})
            except Exception as e:
                skipped_count += 1
                failed_customer_ids.append(str(customer.id))
                details.append({'customer_id': str(customer.id), 'customer_name': customer.name, 'to': recipient, 'status': 'failed', 'reason': str(e)})

        return {
            'sent': sent_count,
            'skipped': skipped_count,
            'details': details,
            'failed_customer_ids': failed_customer_ids,
        }

    @action(detail=False, methods=['get'], url_path='arrears-list')
    def arrears_list(self, request):
        company = getattr(request, 'company', None)
        company_id = request.query_params.get('company_id') or request.query_params.get('company')
        if not company and company_id:
            company = Company.objects.filter(id=company_id).first()
        if not company:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        status_filter = (request.query_params.get('arrears_status') or '').strip()
        invoice_ids_raw = request.query_params.get('invoice_ids') or ''
        invoice_ids = [s.strip() for s in invoice_ids_raw.split(',') if s.strip()] if invoice_ids_raw else None
        entries = self._collect_overdue_entries(company, invoice_ids=invoice_ids)
        if status_filter:
            entries = [e for e in entries if e.get('arrears_status') == status_filter]
        entries.sort(key=lambda e: ((e['invoice'].due_date or timezone.localdate()), e['invoice'].invoice_number or ''))

        items = []
        for e in entries:
            inv = e['invoice']
            items.append({
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'issue_date': str(inv.issue_date) if inv.issue_date else None,
                'delivery_date': str(inv.delivery_date) if inv.delivery_date else None,
                'due_date': str(inv.due_date) if inv.due_date else None,
                'payment_method': inv.payment_method,
                'status': inv.status,
                'currency': (inv.currency or 'HUF').upper(),
                'total_net_amount': float(inv.total_net_amount or 0),
                'total_vat_amount': float(inv.total_vat_amount or 0),
                'total_gross_amount': float(inv.total_gross_amount or 0),
                'remaining_amount': float(e['remaining']),
                'days_overdue': e['days_overdue'],
                'customer': {
                    'id': str(inv.customer.id),
                    'name': inv.customer.name,
                    'email': inv.customer.email or '',
                },
                'arrears_status': e['arrears_status'],
                'arrears_status_label': e['arrears_status_label'],
                'days_in_status': e['days_in_status'],
                'next_status': e['next_status'],
                'next_status_label': e['next_status_label'],
            })

        return Response({'count': len(items), 'results': items, 'as_of_date': str(timezone.localdate())})

    @action(detail=False, methods=['post'], url_path='arrears-advance-status')
    def arrears_advance_status(self, request):
        data = request.data or {}
        company = getattr(request, 'company', None)
        company_id = data.get('company_id') or data.get('company')
        if not company and company_id:
            company = Company.objects.filter(id=company_id).first()
        if not company:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        invoice_ids = data.get('invoice_ids') or []
        if not isinstance(invoice_ids, list) or not invoice_ids:
            return Response({'error': 'invoice_ids lista kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        target_status = (data.get('target_status') or '').strip()
        if not target_status:
            return Response({'error': 'target_status kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        valid_statuses = set(self._arrears_status_label_map().keys())
        if target_status not in valid_statuses:
            return Response({'error': 'Érvénytelen target_status'}, status=status.HTTP_400_BAD_REQUEST)

        send_email = bool(data.get('send_email'))
        entries = self._collect_overdue_entries(company, invoice_ids=invoice_ids)
        entry_by_id = {str(e['invoice'].id): e for e in entries}
        selected_entries = [entry_by_id.get(str(iid)) for iid in invoice_ids]
        selected_entries = [e for e in selected_entries if e]
        if not selected_entries:
            return Response({'error': 'Nincs léptethető lejárt számla a kiválasztásban'}, status=status.HTTP_400_BAD_REQUEST)

        changed_invoices = [e['invoice'] for e in selected_entries]
        send_result = {'sent': 0, 'skipped': 0, 'details': []}
        if send_email:
            template_type = self._arrears_template_for_target_status(target_status)
            if not template_type:
                return Response({'error': 'Ehhez a státuszhoz nincs e-mail sablon küldés.'}, status=status.HTTP_400_BAD_REQUEST)
            send_result = self._send_arrears_emails_by_template(company, selected_entries, template_type)
            failed_customer_ids = set(send_result.get('failed_customer_ids') or [])
            changed_invoices = [
                e['invoice'] for e in selected_entries
                if str(e['invoice'].customer_id) not in failed_customer_ids
            ]

        changed_count = self._set_arrears_status(changed_invoices, target_status)
        labels = self._arrears_status_label_map()
        return Response({
            'success': True,
            'target_status': target_status,
            'target_status_label': labels.get(target_status, target_status),
            'changed': changed_count,
            'email': send_result,
        })

    @action(detail=False, methods=['get'])
    def arrears_preview(self, request):
        company = getattr(request, 'company', None)
        company_id = request.query_params.get('company_id') or request.query_params.get('company')
        if not company and company_id:
            company = Company.objects.filter(id=company_id).first()
        if not company:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        invoice_ids_raw = request.query_params.get('invoice_ids') or ''
        invoice_ids = [s.strip() for s in invoice_ids_raw.split(',') if s.strip()] if invoice_ids_raw else None
        entries = self._collect_overdue_entries(company, invoice_ids=invoice_ids)

        grouped = {}
        for item in entries:
            inv = item['invoice']
            cust = inv.customer
            key = str(cust.id)
            block = grouped.setdefault(key, {
                'customer_id': key,
                'customer_name': cust.name,
                'customer_email': cust.email or '',
                'totals_by_currency': {},
                'invoices': [],
            })
            curr = (inv.currency or 'HUF').upper()
            block['totals_by_currency'][curr] = float(decimal.Decimal(str(block['totals_by_currency'].get(curr, 0))) + item['remaining'])
            block['invoices'].append({
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'issue_date': str(inv.issue_date) if inv.issue_date else None,
                'due_date': str(inv.due_date) if inv.due_date else None,
                'total_net_amount': float(inv.total_net_amount or 0),
                'total_vat_amount': float(inv.total_vat_amount or 0),
                'total_gross_amount': float(inv.total_gross_amount or 0),
                'remaining_amount': float(item['remaining']),
                'currency': curr,
                'days_overdue': item['days_overdue'],
            })

        customers = sorted(grouped.values(), key=lambda x: (x['customer_name'] or '').lower())
        total_invoice_count = sum(len(c['invoices']) for c in customers)
        total_by_currency = {}
        for c in customers:
            for curr, val in (c.get('totals_by_currency') or {}).items():
                total_by_currency[curr] = float(decimal.Decimal(str(total_by_currency.get(curr, 0))) + decimal.Decimal(str(val or 0)))

        return Response({
            'customers': customers,
            'summary': {
                'customer_count': len(customers),
                'invoice_count': total_invoice_count,
                'total_by_currency': total_by_currency,
                'as_of_date': str(timezone.localdate()),
            }
        })

    @action(detail=False, methods=['post'])
    def send_arrears_emails(self, request):
        import smtplib
        import ssl
        from email.message import EmailMessage

        data = request.data or {}
        company = getattr(request, 'company', None)
        company_id = data.get('company_id') or data.get('company')
        if not company and company_id:
            company = Company.objects.filter(id=company_id).first()
        if not company:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        invoice_ids = data.get('invoice_ids')
        if invoice_ids and not isinstance(invoice_ids, list):
            return Response({'error': 'invoice_ids lista kell legyen'}, status=status.HTTP_400_BAD_REQUEST)

        entries = self._collect_overdue_entries(company, invoice_ids=invoice_ids)
        if not entries:
            return Response({'success': True, 'sent': 0, 'skipped': 0, 'details': [], 'message': 'Nincs kiküldhető lejárt kintlévőség.'})

        ces = CompanyEmailSettings.objects.filter(company=company).first()
        host = (getattr(ces, 'smtp_host', None) or os.environ.get('SMTP_HOST') or os.environ.get('EMAIL_HOST'))
        port = int((getattr(ces, 'smtp_port', None) or os.environ.get('SMTP_PORT') or os.environ.get('EMAIL_PORT') or 587))
        user = (getattr(ces, 'smtp_user', None) or os.environ.get('SMTP_USER') or os.environ.get('EMAIL_HOST_USER'))
        pwd = (getattr(ces, 'smtp_password', None) or os.environ.get('SMTP_PASSWORD') or os.environ.get('EMAIL_HOST_PASSWORD'))
        use_tls = bool(getattr(ces, 'smtp_use_tls', True)) if ces else (os.environ.get('SMTP_USE_TLS', '1') == '1')
        from_addr = (data.get('from') or (getattr(ces, 'smtp_from', None) if ces else None) or os.environ.get('SMTP_FROM') or user)

        if not host or not user or not pwd or not from_addr:
            return Response({'error': 'SMTP beállítások hiányoznak (host/user/password/from)'}, status=status.HTTP_400_BAD_REQUEST)

        grouped = {}
        for item in entries:
            inv = item['invoice']
            cust = inv.customer
            key = str(cust.id)
            row = grouped.setdefault(key, {'customer': cust, 'items': []})
            row['items'].append(item)

        def fmt_money(amount, currency):
            try:
                d = decimal.Decimal(str(amount or 0))
            except Exception:
                d = decimal.Decimal('0')
            if (currency or '').upper() == 'HUF':
                return f"{int(d):,}".replace(',', ' ') + ' Ft'
            return f"{d:.2f} {currency}"

        def render_tpl(tpl, ctx):
            out = str(tpl or '')
            for k, v in ctx.items():
                out = out.replace('{' + k + '}', str(v if v is not None else ''))
            return out

        today = timezone.localdate()
        city = (getattr(company, 'city', None) or '').strip()
        today_city_date = f"{city}, {today.strftime('%Y.%m.%d')}" if city else today.strftime('%Y.%m.%d')

        arrears_template = get_company_email_template(company, EmailTemplate.TEMPLATE_ARREARS)
        default_signature_html = get_default_signature_html(company)

        subject_tpl = arrears_template.get('subject_template') or (getattr(ces, 'arrears_subject_template', None) if ces else None) or 'Kintlévőség értesítő - lejárt számlák'
        body_tpl = arrears_template.get('body_template') or (getattr(ces, 'arrears_body_template', None) if ces else None) or '<p>Tisztelt Ügyfél!</p><p>Nyilvántartásunk szerint {as_of_date} napjáig még nem egyenlítették ki az alábbi számlákat, amelynek hátraléka összesen {total_outstanding}.</p>{invoices_table}<p>Amennyiben az összeg az Önök nyilvántartásában szereplőtől eltér, kérem egyeztessenek velünk az elérhetőségeink egyikén.</p><p>Ha a számlák kiegyenlítése időközben már megtörtént, kérjük jelen levelünket tekintse tárgytalannak!</p><p>{today_city_date}</p>'

        details = []
        sent_count = 0
        skipped_count = 0

        for row in grouped.values():
            customer = row['customer']
            items = row['items']
            recipient = (getattr(customer, 'email', None) or '').strip()
            if not recipient:
                skipped_count += 1
                details.append({'customer_id': str(customer.id), 'customer_name': customer.name, 'status': 'skipped', 'reason': 'Nincs ügyfél e-mail cím'})
                continue

            currency = (items[0]['invoice'].currency or 'HUF').upper()
            total_outstanding = sum((it['remaining'] for it in items), decimal.Decimal('0'))

            table_rows = []
            for it in sorted(items, key=lambda x: (x['invoice'].due_date or timezone.localdate())):
                inv = it['invoice']
                table_rows.append(
                    f"<tr><td>{inv.invoice_number}</td><td>{inv.issue_date or ''}</td><td style='text-align:right'>{fmt_money(inv.total_net_amount or 0, currency)}</td><td style='text-align:right'>{fmt_money(inv.total_vat_amount or 0, currency)}</td></tr>"
                )
            invoices_table = (
                "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%'>"
                "<thead><tr><th>Számla sorszám</th><th>Kelt</th><th>Nettó(HUF)</th><th>Áfa(HUF)</th></tr></thead>"
                f"<tbody>{''.join(table_rows)}</tbody></table>"
            )

            ctx = {
                'customer_name': customer.name,
                'company_name': company.name,
                'as_of_date': today.isoformat(),
                'today_date': today.strftime('%Y.%m.%d'),
                'today_city_date': today_city_date,
                'company_city': city,
                'total_outstanding': fmt_money(total_outstanding, currency),
                'invoice_count': len(items),
                'currency': currency,
                'invoices_table': invoices_table,
                'sender_name': (getattr(ces, 'default_sender_name', None) if ces else '') or '',
                'sender_phone': (getattr(ces, 'default_sender_phone', None) if ces else '') or '',
                'signature_html': default_signature_html,
            }

            subject = render_tpl(subject_tpl, ctx)
            body = render_tpl(body_tpl, ctx)

            msg = EmailMessage()
            msg['Subject'] = subject
            msg['From'] = from_addr
            msg['To'] = recipient
            if '<' in body and '>' in body:
                msg.set_content('HTML levél')
                msg.add_alternative(body, subtype='html')
            else:
                msg.set_content(body)

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

                sent_count += 1
                sent_customer_ids.add(str(customer.id))
                details.append({
                    'customer_id': str(customer.id),
                    'customer_name': customer.name,
                    'to': recipient,
                    'status': 'sent',
                    'invoice_count': len(items),
                    'total_outstanding': fmt_money(total_outstanding, currency),
                })
            except Exception as e:
                skipped_count += 1
                details.append({
                    'customer_id': str(customer.id),
                    'customer_name': customer.name,
                    'to': recipient,
                    'status': 'failed',
                    'reason': str(e),
                })

        invoices_to_advance = [
            e['invoice'] for e in entries if str(e['invoice'].customer_id) in sent_customer_ids
        ]
        self._set_arrears_status(invoices_to_advance, Invoice.ARREARS_STATUS_NOTICE)

        return Response({
            'success': True,
            'sent': sent_count,
            'skipped': skipped_count,
            'details': details,
        })

    @action(detail=True, methods=['post'], url_path='update_rejected_items')
    def update_rejected_items(self, request, pk=None):
        """NAV által elutasított számla tételeinek szerkesztése.
        Csak 'nav_rejected' státuszú számlánál engedett.
        Payload: { items: [{ id, description, quantity, unit_price, vat_rate, ... }] }
        """
        invoice = self.get_object()
        if invoice.status != 'nav_rejected':
            return Response(
                {'error': 'Csak NAV által elutasított számlánál szerkeszthetők a tételek.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        items_data = request.data.get('items', [])
        if not isinstance(items_data, list):
            return Response({'error': 'items lista szükséges.'}, status=status.HTTP_400_BAD_REQUEST)

        from invoices.models import InvoiceItem
        import re as _re

        def _sanitize(text):
            if not text:
                return ''
            s = _re.sub(r'[\r\n\t]+', ' ', str(text))
            return _re.sub(r' {2,}', ' ', s).strip()

        updated = []
        errors = []
        for item_data in items_data:
            item_id = item_data.get('id')
            if not item_id:
                errors.append({'error': 'id mező hiányzik', 'data': item_data})
                continue
            try:
                item = invoice.items.get(id=item_id)
            except InvoiceItem.DoesNotExist:
                errors.append({'id': item_id, 'error': 'Tétel nem tartozik ehhez a számlához'})
                continue
            if 'description' in item_data:
                item.description = _sanitize(item_data['description'])
            if 'quantity' in item_data:
                item.quantity = item_data['quantity']
            if 'unit_price' in item_data:
                item.unit_price = item_data['unit_price']
            if 'vat_rate' in item_data:
                item.vat_rate = item_data['vat_rate']
            if 'unit_of_measure' in item_data:
                item.unit_of_measure = item_data['unit_of_measure']
            if 'nature_indicator' in item_data:
                item.nature_indicator = item_data['nature_indicator']
            if 'note' in item_data:
                item.note = item_data['note']
            item.save()
            updated.append(item_id)

        return Response({'updated': updated, 'errors': errors})

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
                        latest_status_response = status_result.get('response')
                        if latest_status_response:
                            invoice.nav_response = latest_status_response
                        # Állapot frissítése a NAV feldolgozás alapján
                        if processing == 'DONE':
                            invoice.status = 'nav_processed'
                            invoice.save(update_fields=['status', 'nav_response'])
                        elif processing in ('ABORTED', 'REJECTED', 'NOT_FOUND'):
                            invoice.status = 'nav_rejected'
                            invoice.save(update_fields=['status', 'nav_response'])
                        elif latest_status_response:
                            invoice.save(update_fields=['nav_response'])
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
            latest_status_response = result.get('response')
            if latest_status_response:
                invoice.nav_response = latest_status_response
            # Frissítsük a számla státuszt a NAV feldolgozás alapján (processing_status vagy invoice_status)
            processing = result.get('processing_status') or result.get('invoice_status')
            if processing == 'DONE':
                invoice.status = 'nav_processed'
                invoice.save(update_fields=['status', 'nav_response'])
            elif processing in ('ABORTED', 'REJECTED', 'NOT_FOUND'):
                invoice.status = 'nav_rejected'
                invoice.save(update_fields=['status', 'nav_response'])
            elif latest_status_response:
                invoice.save(update_fields=['nav_response'])

            return Response(result)
            
        except Exception as e:
            logger.error(f"Error checking NAV status: {str(e)}")
            return Response(
                {'error': f'Error checking status: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Dashboard statisztikák (kimenő/bejövő összesítések, grafikon, top listák)."""
        from collections import defaultdict

        def _as_decimal(value):
            try:
                return decimal.Decimal(str(value or 0))
            except Exception:
                return decimal.Decimal('0')

        def _as_float(value):
            try:
                return float(value)
            except Exception:
                return 0.0

        def _currency(code):
            cleaned = str(code or '').strip().upper()
            return cleaned or 'HUF'

        def _invoice_gross(inv):
            try:
                return _as_decimal(inv.total_gross_amount)
            except Exception:
                return decimal.Decimal('0')

        def _incoming_gross(entry):
            net = _as_decimal(getattr(entry, 'invoice_net_amount', 0))
            vat = _as_decimal(getattr(entry, 'invoice_vat_amount', 0))
            gross = net + vat
            if gross > 0:
                return gross
            return net

        def _norm_tax(value):
            return ''.join(ch for ch in str(value or '') if ch.isdigit())

        def _tax_base(value):
            digits = ''.join(ch for ch in str(value or '') if ch.isdigit())
            return digits[:8]

        currency_rates = {'HUF': decimal.Decimal('1')}
        for row in Currency.objects.filter(is_active=True).only('code', 'current_rate'):
            code = _currency(row.code)
            rate = _as_decimal(getattr(row, 'current_rate', None))
            if rate > 0:
                currency_rates[code] = rate

        def _to_huf(amount, currency_code, exchange_rate=None):
            amount_dec = _as_decimal(amount)
            curr = _currency(currency_code)
            if curr == 'HUF':
                return amount_dec

            rate = _as_decimal(exchange_rate)
            if rate <= 0:
                rate = _as_decimal(currency_rates.get(curr))
            if rate <= 0:
                return amount_dec
            return amount_dec * rate

        def _incoming_gross_huf(entry):
            net_huf = _as_decimal(getattr(entry, 'invoice_net_amount_huf', 0))
            vat_huf = _as_decimal(getattr(entry, 'invoice_vat_amount_huf', 0))
            gross_huf = net_huf + vat_huf
            if gross_huf > 0:
                return gross_huf
            return _to_huf(
                _incoming_gross(entry),
                getattr(entry, 'currency', None),
                getattr(entry, 'exchange_rate', None),
            )

        def _is_external_outgoing_digest(entry):
            company = getattr(entry, 'company', None)
            company_tax_base = _tax_base(getattr(company, 'tax_number', None))
            supplier_tax = _norm_tax(getattr(entry, 'supplier_tax_number', None))
            customer_tax = _norm_tax(getattr(entry, 'customer_tax_number', None))
            supplier_name = str(getattr(entry, 'supplier_name', '') or '').strip().upper()
            company_name = str(getattr(company, 'name', '') or '').strip().upper()
            op = str(getattr(entry, 'invoice_operation', '') or '').strip().upper()

            if op in ('OUTBOUND', 'EXTERNAL_OUTGOING'):
                return True
            if op in ('INBOUND',):
                return False

            supplier_match = bool(company_tax_base and _tax_base(supplier_tax) == company_tax_base)
            customer_match = bool(company_tax_base and _tax_base(customer_tax) == company_tax_base)
            name_match = bool(company_name and supplier_name and company_name in supplier_name)

            if supplier_match or name_match:
                return True
            if customer_match:
                return False
            if str(getattr(entry, 'invoice_category', '') or '').upper() == 'SIMPLIFIED':
                return False
            return False

        def _aggregate_with_currency(items, amount_getter, currency_getter, amount_huf_getter=None):
            by_currency = {}
            total_count = 0
            total_amount = decimal.Decimal('0')
            total_amount_huf = decimal.Decimal('0')
            for item in items:
                amount = _as_decimal(amount_getter(item))
                curr = _currency(currency_getter(item))
                amount_huf = _as_decimal(amount_huf_getter(item)) if amount_huf_getter else _to_huf(
                    amount,
                    curr,
                    getattr(item, 'exchange_rate', None),
                )
                if curr not in by_currency:
                    by_currency[curr] = {
                        'count': 0,
                        'amount': decimal.Decimal('0'),
                        'amount_huf': decimal.Decimal('0'),
                    }
                by_currency[curr]['count'] += 1
                by_currency[curr]['amount'] += amount
                by_currency[curr]['amount_huf'] += amount_huf
                total_count += 1
                total_amount += amount
                total_amount_huf += amount_huf

            return {
                'count': total_count,
                'amount': _as_float(total_amount),
                'amount_huf': _as_float(total_amount_huf),
                'currencies': {
                    curr: {
                        'count': values['count'],
                        'amount': _as_float(values['amount']),
                        'amount_huf': _as_float(values['amount_huf']),
                    }
                    for curr, values in sorted(by_currency.items(), key=lambda pair: pair[0])
                }
            }

        base_queryset = self.get_queryset().select_related('customer', 'company').prefetch_related('items')
        requested_company_id = request.query_params.get('company_id') or request.query_params.get('company')
        allowed_company_ids = _get_system_user_allowed_company_ids(request)

        if requested_company_id and allowed_company_ids:
            allowed_set = {str(cid) for cid in allowed_company_ids}
            if str(requested_company_id) not in allowed_set:
                base_queryset = Invoice.objects.none()
                incoming_base = IncomingInvoiceDigest.objects.none()
            else:
                base_queryset = base_queryset.filter(company_id=requested_company_id)
                incoming_base = IncomingInvoiceDigest.objects.filter(company_id=requested_company_id)
        elif requested_company_id:
            base_queryset = base_queryset.filter(company_id=requested_company_id)
            incoming_base = IncomingInvoiceDigest.objects.filter(company_id=requested_company_id)
        elif allowed_company_ids:
            base_queryset = base_queryset.filter(company_id__in=allowed_company_ids)
            incoming_base = IncomingInvoiceDigest.objects.filter(company_id__in=allowed_company_ids)
        else:
            incoming_base = IncomingInvoiceDigest.objects.all()

        today = timezone.localdate()
        month_start = today.replace(day=1)
        requested_year = request.query_params.get('year')
        try:
            selected_year = int(requested_year) if requested_year is not None else today.year
        except Exception:
            selected_year = today.year
        if selected_year < 2000 or selected_year > 2100:
            selected_year = today.year

        month_end = today if selected_year == today.year else date(selected_year, 12, 31)
        month_start = month_end.replace(day=1)
        year_start = date(selected_year, 1, 1)
        year_end = today if selected_year == today.year else date(selected_year, 12, 31)

        outgoing_issued = base_queryset.exclude(status='cancelled')
        own_invoice_numbers = set(str(n) for n in outgoing_issued.values_list('invoice_number', flat=True))

        incoming_all_raw = list(incoming_base.select_related('company').order_by('-invoice_issue_date', '-created_at'))
        external_outgoing_all = []
        incoming_all = []
        for inv in incoming_all_raw:
            inv_no = str(getattr(inv, 'invoice_number', '') or '').strip()
            if _is_external_outgoing_digest(inv):
                if inv_no and inv_no in own_invoice_numbers:
                    continue
                if str(getattr(inv, 'invoice_category', '') or '').upper() == 'SIMPLIFIED':
                    continue
                external_outgoing_all.append(inv)
            else:
                incoming_all.append(inv)

        outgoing_all = list(outgoing_issued) + external_outgoing_all

        incoming_bank_paid_map = {}
        incoming_ids = [inv.id for inv in incoming_all if getattr(inv, 'id', None)]
        if incoming_ids:
            bank_paid_rows = (
                BankStatementItem.objects
                .filter(incoming_invoice_id__in=incoming_ids)
                .values('incoming_invoice_id')
                .annotate(total=models.Sum('amount'))
            )
            for row in bank_paid_rows:
                key = str(row.get('incoming_invoice_id') or '')
                if key:
                    incoming_bank_paid_map[key] = _as_decimal(row.get('total'))

        # Payment batch paid map: keyed by (invoice_number, supplier_tax_number)
        # If an invoice is in any payment batch (PENDING or EXPORTED), treat it as handled
        batch_paid_map = {}
        incoming_company_ids = set(
            str(getattr(inv, 'company_id', '') or '')
            for inv in incoming_all
            if getattr(inv, 'company_id', None)
        )
        if incoming_company_ids:
            for item in PaymentBatchItem.objects.filter(
                batch__company_id__in=incoming_company_ids
            ).values('invoice_number', 'supplier_tax_number', 'amount_gross'):
                inv_no = str(item.get('invoice_number') or '').strip()
                tax_no = str(item.get('supplier_tax_number') or '').strip()
                if inv_no:
                    key = (inv_no, tax_no)
                    batch_paid_map[key] = batch_paid_map.get(key, decimal.Decimal('0')) + _as_decimal(item.get('amount_gross'))

        def _incoming_effective_paid(inv):
            paid_model = _as_decimal(getattr(inv, 'amount_paid', 0))
            paid_bank = _as_decimal(incoming_bank_paid_map.get(str(getattr(inv, 'id', ''))))
            inv_no = str(getattr(inv, 'invoice_number', '') or '').strip()
            tax_no = str(getattr(inv, 'supplier_tax_number', '') or '').strip()
            paid_batch = batch_paid_map.get((inv_no, tax_no), decimal.Decimal('0'))
            return max(paid_model, paid_bank, paid_batch)

        def _incoming_outstanding(inv):
            return _incoming_gross(inv) - _incoming_effective_paid(inv)

        def _item_issue_date(item):
            if isinstance(item, Invoice):
                return getattr(item, 'issue_date', None)
            return getattr(item, 'invoice_issue_date', None) or (item.ins_date.date() if getattr(item, 'ins_date', None) else None)

        def _outgoing_amount(item):
            return _invoice_gross(item) if isinstance(item, Invoice) else _incoming_gross(item)

        def _outgoing_amount_huf(item):
            if isinstance(item, Invoice):
                return _to_huf(_invoice_gross(item), item.currency, item.exchange_rate)
            return _incoming_gross_huf(item)

        outgoing_month = [inv for inv in outgoing_all if _item_issue_date(inv) and month_start <= _item_issue_date(inv) <= month_end]
        outgoing_year = [inv for inv in outgoing_all if _item_issue_date(inv) and year_start <= _item_issue_date(inv) <= year_end]

        incoming_month = [
            inv for inv in incoming_all
            if inv.invoice_issue_date and month_start <= inv.invoice_issue_date <= month_end
        ]
        incoming_year = [
            inv for inv in incoming_all
            if inv.invoice_issue_date and year_start <= inv.invoice_issue_date <= year_end
        ]

        incoming_unpaid_all = [
            inv for inv in incoming_all
            if _incoming_outstanding(inv) > decimal.Decimal('0.005')
        ]
        incoming_unpaid_month = [
            inv for inv in incoming_unpaid_all
            if inv.invoice_issue_date and month_start <= inv.invoice_issue_date <= month_end
        ]
        incoming_unpaid_year = [
            inv for inv in incoming_unpaid_all
            if inv.invoice_issue_date and year_start <= inv.invoice_issue_date <= year_end
        ]

        incoming_overdue_all = [
            inv for inv in incoming_unpaid_all
            if inv.due_date and inv.due_date < today
        ]
        incoming_overdue_month = [
            inv for inv in incoming_overdue_all
            if month_start <= inv.due_date <= month_end
        ]
        incoming_overdue_year = [
            inv for inv in incoming_overdue_all
            if year_start <= inv.due_date <= year_end
        ]

        def _incoming_due_row(inv):
            outstanding = _incoming_outstanding(inv)
            if outstanding <= 0:
                return None
            return {
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'partner_name': (inv.supplier_name or '').strip() or 'Ismeretlen beszállító',
                'amount': _as_float(outstanding),
                'currency': _currency(inv.currency),
                'due_date': inv.due_date,
            }

        def _is_transfer_payment(inv):
            return str(getattr(inv, 'payment_method', '') or '').strip().lower() == 'transfer'

        def _sum_due_huf(rows):
            total = decimal.Decimal('0')
            for inv in rows:
                outstanding = _incoming_outstanding(inv)
                if outstanding <= 0:
                    continue
                total += _to_huf(outstanding, getattr(inv, 'currency', None), getattr(inv, 'exchange_rate', None))
            return _as_float(total)

        due_overdue_source = [
            inv for inv in incoming_unpaid_all
            if inv.due_date and inv.due_date < today and _is_transfer_payment(inv)
        ]
        due_today_source = [
            inv for inv in incoming_unpaid_all
            if inv.due_date and inv.due_date == today and _is_transfer_payment(inv)
        ]
        due_upcoming_source = [
            inv for inv in incoming_unpaid_all
            if inv.due_date and inv.due_date > today and _is_transfer_payment(inv)
        ]

        incoming_due_overdue_rows = [
            _incoming_due_row(inv)
            for inv in sorted(
                due_overdue_source,
                key=lambda item: item.due_date,
                reverse=True,
            )[:10]
        ]
        incoming_due_today_rows = [
            _incoming_due_row(inv)
            for inv in sorted(
                due_today_source,
                key=lambda item: item.invoice_issue_date or date.min,
                reverse=True,
            )[:10]
        ]
        incoming_due_next_rows = [
            _incoming_due_row(inv)
            for inv in sorted(
                due_upcoming_source,
                key=lambda item: item.due_date,
            )[:10]
        ]

        incoming_due_overdue_rows = [row for row in incoming_due_overdue_rows if row]
        incoming_due_today_rows = [row for row in incoming_due_today_rows if row]
        incoming_due_next_rows = [row for row in incoming_due_next_rows if row]

        total_amount = sum((_outgoing_amount(invoice) for invoice in outgoing_all), decimal.Decimal('0'))
        unpaid_amount = decimal.Decimal('0')
        unpaid_amount += sum(
            (_invoice_gross(invoice) - _as_decimal(getattr(invoice, 'amount_paid', 0))
             for invoice in outgoing_issued if invoice.status not in ['paid', 'cancelled']),
            decimal.Decimal('0')
        )
        unpaid_amount += sum(
            (_incoming_gross(invoice) - _as_decimal(getattr(invoice, 'amount_paid', 0))
             for invoice in external_outgoing_all if str(getattr(invoice, 'payment_status', '')).lower() != 'paid'),
            decimal.Decimal('0')
        )

        year_unpaid_amount = decimal.Decimal('0')
        year_unpaid_amount += sum(
            (_invoice_gross(invoice) - _as_decimal(getattr(invoice, 'amount_paid', 0))
             for invoice in outgoing_issued
             if invoice.status not in ['paid', 'cancelled'] and invoice.issue_date and year_start <= invoice.issue_date <= year_end),
            decimal.Decimal('0')
        )
        year_unpaid_amount += sum(
            (_incoming_gross(invoice) - _as_decimal(getattr(invoice, 'amount_paid', 0))
             for invoice in external_outgoing_all
             if str(getattr(invoice, 'payment_status', '')).lower() != 'paid'
             and (invoice.invoice_issue_date and year_start <= invoice.invoice_issue_date <= year_end)),
            decimal.Decimal('0')
        )

        # 14 hónapos bevétel-kiadás oszlop grafikon
        month_labels = []
        cursor = date(today.year, today.month, 1)
        for _ in range(14):
            month_labels.append(cursor)
            cursor = (cursor.replace(day=1) - timedelta(days=1)).replace(day=1)
        month_labels = list(reversed(month_labels))
        month_keys = [d.strftime('%Y-%m') for d in month_labels]

        revenue_by_month = defaultdict(lambda: decimal.Decimal('0'))
        expense_by_month = defaultdict(lambda: decimal.Decimal('0'))

        if month_labels:
            min_month = month_labels[0]
            max_month_end = (month_labels[-1].replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        else:
            min_month = today.replace(day=1)
            max_month_end = today

        for inv in outgoing_all:
            issue_dt = _item_issue_date(inv)
            if not issue_dt or issue_dt < min_month or issue_dt > max_month_end:
                continue
            mk = issue_dt.strftime('%Y-%m')
            revenue_by_month[mk] += _outgoing_amount_huf(inv)

        for inv in incoming_all:
            dt = inv.invoice_issue_date or (inv.ins_date.date() if getattr(inv, 'ins_date', None) else None)
            if not dt or dt < min_month or dt > max_month_end:
                continue
            mk = dt.strftime('%Y-%m')
            expense_by_month[mk] += _incoming_gross_huf(inv)

        monthly_chart = [
            {
                'month': month_dt.strftime('%Y-%m'),
                'label': month_dt.strftime('%Y.%m'),
                'revenue': _as_float(revenue_by_month.get(key, decimal.Decimal('0'))),
                'expense': _as_float(expense_by_month.get(key, decimal.Decimal('0'))),
            }
            for month_dt, key in zip(month_labels, month_keys)
        ]

        recent_outgoing_rows = []
        for inv in outgoing_issued.order_by('-issue_date', '-created_at')[:50]:
            created_dt = getattr(inv, 'created_at', None)
            recent_outgoing_rows.append({
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'partner_name': getattr(inv.customer, 'name', '') or '',
                'issue_date': inv.issue_date,
                'due_date': inv.due_date,
                'status': inv.status,
                'currency': _currency(inv.currency),
                'amount': _as_float(_invoice_gross(inv)),
                '_sort_date': (inv.issue_date.isoformat() if inv.issue_date else ''),
                '_sort_created': (created_dt.isoformat() if created_dt else ''),
            })
        for inv in external_outgoing_all[:50]:
            issue_dt = inv.invoice_issue_date or (inv.ins_date.date() if getattr(inv, 'ins_date', None) else None)
            created_dt = getattr(inv, 'created_at', None)
            recent_outgoing_rows.append({
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'partner_name': (inv.customer_name or inv.supplier_name or ''),
                'issue_date': issue_dt,
                'due_date': inv.due_date,
                'status': inv.payment_status,
                'currency': _currency(inv.currency),
                'amount': _as_float(_incoming_gross(inv)),
                '_sort_date': (issue_dt.isoformat() if issue_dt else ''),
                '_sort_created': (created_dt.isoformat() if created_dt else ''),
            })
        recent_outgoing_sorted = sorted(
            recent_outgoing_rows,
            key=lambda row: (row['_sort_date'], row['_sort_created']),
            reverse=True,
        )
        seen_recent_outgoing = set()
        recent_outgoing = []
        for row in recent_outgoing_sorted:
            dedupe_key = str(row.get('invoice_number') or row.get('id') or '').strip().upper()
            if not dedupe_key or dedupe_key in seen_recent_outgoing:
                continue
            seen_recent_outgoing.add(dedupe_key)
            recent_outgoing.append(row)
            if len(recent_outgoing) >= 10:
                break
        for row in recent_outgoing:
            row.pop('_sort_date', None)
            row.pop('_sort_created', None)

        recent_incoming = []
        seen_recent_incoming = set()
        for inv in incoming_all:
            dedupe_key = str(getattr(inv, 'invoice_number', None) or getattr(inv, 'id', None) or '').strip().upper()
            if not dedupe_key or dedupe_key in seen_recent_incoming:
                continue
            seen_recent_incoming.add(dedupe_key)
            recent_incoming.append({
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'partner_name': (inv.supplier_name or ''),
                'issue_date': inv.invoice_issue_date,
                'due_date': inv.due_date,
                'status': inv.payment_status,
                'currency': _currency(inv.currency),
                'amount': _as_float(_incoming_gross(inv)),
            })
            if len(recent_incoming) >= 10:
                break

        debtors = defaultdict(lambda: {'partner_name': '', 'amount_huf': decimal.Decimal('0'), 'currency': defaultdict(lambda: decimal.Decimal('0'))})
        for inv in outgoing_issued:
            if not inv.issue_date or not (year_start <= inv.issue_date <= year_end):
                continue
            if inv.status in ['paid', 'cancelled']:
                continue
            outstanding = _invoice_gross(inv) - _as_decimal(getattr(inv, 'amount_paid', 0))
            if outstanding <= 0:
                continue
            pname = (getattr(inv.customer, 'name', None) or '').strip() or 'Ismeretlen ügyfél'
            curr = _currency(inv.currency)
            debtors[pname]['partner_name'] = pname
            debtors[pname]['amount_huf'] += _to_huf(outstanding, curr, inv.exchange_rate)
            debtors[pname]['currency'][curr] += outstanding
        for inv in external_outgoing_all:
            if not inv.invoice_issue_date or not (year_start <= inv.invoice_issue_date <= year_end):
                continue
            outstanding = _incoming_gross(inv) - _as_decimal(getattr(inv, 'amount_paid', 0))
            if outstanding <= 0 or str(getattr(inv, 'payment_status', '')).lower() == 'paid':
                continue
            pname = (inv.customer_name or inv.supplier_name or '').strip() or 'Ismeretlen ügyfél'
            curr = _currency(inv.currency)
            debtors[pname]['partner_name'] = pname
            debtors[pname]['amount_huf'] += _to_huf(outstanding, curr, getattr(inv, 'exchange_rate', None))
            debtors[pname]['currency'][curr] += outstanding

        top_debtors = sorted(debtors.values(), key=lambda row: row['amount_huf'], reverse=True)[:10]
        top_debtors = [
            {
                'partner_name': row['partner_name'],
                'amount': _as_float(row['amount_huf']),
                'amount_huf': _as_float(row['amount_huf']),
                'currencies': {k: _as_float(v) for k, v in sorted(row['currency'].items(), key=lambda pair: pair[0])},
            }
            for row in top_debtors
        ]

        creditors = defaultdict(lambda: {'partner_name': '', 'amount_huf': decimal.Decimal('0'), 'currency': defaultdict(lambda: decimal.Decimal('0'))})
        for inv in incoming_unpaid_year:
            gross = _incoming_gross(inv)
            outstanding = gross - _as_decimal(getattr(inv, 'amount_paid', 0))
            if outstanding <= 0:
                continue
            pname = (inv.supplier_name or '').strip() or 'Ismeretlen beszállító'
            curr = _currency(inv.currency)
            creditors[pname]['partner_name'] = pname
            creditors[pname]['amount_huf'] += _to_huf(outstanding, curr, getattr(inv, 'exchange_rate', None))
            creditors[pname]['currency'][curr] += outstanding

        top_creditors = sorted(creditors.values(), key=lambda row: row['amount_huf'], reverse=True)[:10]
        top_creditors = [
            {
                'partner_name': row['partner_name'],
                'amount': _as_float(row['amount_huf']),
                'amount_huf': _as_float(row['amount_huf']),
                'currencies': {k: _as_float(v) for k, v in sorted(row['currency'].items(), key=lambda pair: pair[0])},
            }
            for row in top_creditors
        ]

        customer_spend = defaultdict(lambda: decimal.Decimal('0'))
        for inv in outgoing_year:
            if isinstance(inv, Invoice):
                pname = (getattr(inv.customer, 'name', None) or '').strip() or 'Ismeretlen ügyfél'
                customer_spend[pname] += _to_huf(_invoice_gross(inv), inv.currency, inv.exchange_rate)
            else:
                pname = (inv.customer_name or inv.supplier_name or '').strip() or 'Ismeretlen ügyfél'
                customer_spend[pname] += _incoming_gross_huf(inv)

        top_customers_year = [
            {'partner_name': name, 'amount': _as_float(amount), 'amount_huf': _as_float(amount)}
            for name, amount in sorted(customer_spend.items(), key=lambda pair: pair[1], reverse=True)[:10]
        ]

        supplier_spend = defaultdict(lambda: decimal.Decimal('0'))
        for inv in incoming_year:
            pname = (inv.supplier_name or '').strip() or 'Ismeretlen beszállító'
            supplier_spend[pname] += _incoming_gross_huf(inv)

        top_suppliers_year = [
            {'partner_name': name, 'amount': _as_float(amount), 'amount_huf': _as_float(amount)}
            for name, amount in sorted(supplier_spend.items(), key=lambda pair: pair[1], reverse=True)[:10]
        ]

        stats = {
            # Legacy mezők (kompatibilitás)
            'total_invoices': len(outgoing_all),
            'draft_invoices': base_queryset.filter(status='draft').count(),
            'sent_invoices': base_queryset.filter(status='sent').count(),
            'paid_invoices': base_queryset.filter(status='paid').count(),
            'total_amount': _as_float(total_amount),
            'unpaid_amount': _as_float(unpaid_amount),
            'selected_year': selected_year,
            'summary_year': {
                'year': selected_year,
                'total_invoices': len(outgoing_year),
                'total_amount_huf': _aggregate_with_currency(outgoing_year, _outgoing_amount, lambda inv: inv.currency, _outgoing_amount_huf).get('amount_huf', 0),
                'unpaid_amount_huf': _as_float(year_unpaid_amount),
                'draft_invoices': base_queryset.filter(status='draft', issue_date__gte=year_start, issue_date__lte=year_end).count(),
            },

            # Új dashboard adatok
            'outgoing': {
                'month': _aggregate_with_currency(
                    outgoing_month,
                    _outgoing_amount,
                    lambda inv: inv.currency,
                    _outgoing_amount_huf,
                ),
                'year': _aggregate_with_currency(
                    outgoing_year,
                    _outgoing_amount,
                    lambda inv: inv.currency,
                    _outgoing_amount_huf,
                ),
            },
            'incoming': {
                'month': _aggregate_with_currency(
                    incoming_month,
                    _incoming_gross,
                    lambda inv: inv.currency,
                    _incoming_gross_huf,
                ),
                'year': _aggregate_with_currency(
                    incoming_year,
                    _incoming_gross,
                    lambda inv: inv.currency,
                    _incoming_gross_huf,
                ),
            },
            'incoming_unpaid': {
                'month': _aggregate_with_currency(
                    incoming_unpaid_month,
                    lambda inv: _incoming_gross(inv) - _as_decimal(getattr(inv, 'amount_paid', 0)),
                    lambda inv: inv.currency,
                    lambda inv: _incoming_gross_huf(inv) - _to_huf(
                        _as_decimal(getattr(inv, 'amount_paid', 0)),
                        inv.currency,
                        getattr(inv, 'exchange_rate', None),
                    ),
                ),
                'year': _aggregate_with_currency(
                    incoming_unpaid_year,
                    lambda inv: _incoming_gross(inv) - _as_decimal(getattr(inv, 'amount_paid', 0)),
                    lambda inv: inv.currency,
                    lambda inv: _incoming_gross_huf(inv) - _to_huf(
                        _as_decimal(getattr(inv, 'amount_paid', 0)),
                        inv.currency,
                        getattr(inv, 'exchange_rate', None),
                    ),
                ),
            },
            'incoming_overdue': {
                'month': _aggregate_with_currency(
                    incoming_overdue_month,
                    lambda inv: _incoming_gross(inv) - _as_decimal(getattr(inv, 'amount_paid', 0)),
                    lambda inv: inv.currency,
                    lambda inv: _incoming_gross_huf(inv) - _to_huf(
                        _as_decimal(getattr(inv, 'amount_paid', 0)),
                        inv.currency,
                        getattr(inv, 'exchange_rate', None),
                    ),
                ),
                'year': _aggregate_with_currency(
                    incoming_overdue_year,
                    lambda inv: _incoming_gross(inv) - _as_decimal(getattr(inv, 'amount_paid', 0)),
                    lambda inv: inv.currency,
                    lambda inv: _incoming_gross_huf(inv) - _to_huf(
                        _as_decimal(getattr(inv, 'amount_paid', 0)),
                        inv.currency,
                        getattr(inv, 'exchange_rate', None),
                    ),
                ),
            },
            'monthly_revenue_expense': monthly_chart,
            'recent': {
                'outgoing': recent_outgoing,
                'incoming': recent_incoming,
            },
            'credit': {
                'top_debtors': top_debtors,
                'top_creditors': top_creditors,
            },
            'top_customers_year': top_customers_year,
            'top_suppliers_year': top_suppliers_year,
            'incoming_due_lists': {
                'overdue': incoming_due_overdue_rows,
                'due_today': incoming_due_today_rows,
                'upcoming': incoming_due_next_rows,
                'overdue_total_huf': _sum_due_huf(due_overdue_source),
                'due_today_total_huf': _sum_due_huf(due_today_source),
                'upcoming_total_huf': _sum_due_huf(due_upcoming_source),
            },
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
        manual_only = (request.query_params.get('manual_only') or '').strip().lower() in ('1', 'true', 'yes')
        external_outgoing = (request.query_params.get('external_outgoing') or '').strip().lower() in ('1', 'true', 'yes')
        nav_direction = 'OUTBOUND' if external_outgoing else 'INBOUND'
        amount_from = request.query_params.get('amount_from')
        amount_to = request.query_params.get('amount_to')
        today_date = timezone.now().date()

        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)
        company_tax_base = ''.join(ch for ch in str(getattr(company, 'tax_number', '') or '') if ch.isdigit())[:8]
        company_name_norm = str(getattr(company, 'name', '') or '').strip().upper()

        def _parse_external_meta_basic(xml_text: str):
            result = {'customer_tax_number': None, 'currency': None}
            try:
                root = ET.fromstring(xml_text)
            except Exception:
                return result

            def _local(tag):
                try:
                    if isinstance(tag, str) and '}' in tag:
                        return tag.split('}', 1)[-1].lower()
                    return str(tag or '').lower()
                except Exception:
                    return ''

            def _clean_tax(v):
                val = str(v or '').strip().replace(' ', '')
                return val or None

            tax_buckets = {
                'normal': [],
                'group': [],
                'eu': [],
                'third': [],
                'other': [],
            }
            currency_candidates = []

            def _walk(node, path):
                tag = _local(node.tag)
                cur_path = path + [tag]
                path_txt = '/'.join(cur_path)
                txt = (node.text or '').strip()

                in_customer = any('customer' in p or 'buyer' in p for p in cur_path)
                in_supplier = any('supplier' in p or 'seller' in p for p in cur_path)

                if txt and in_customer and not in_supplier:
                    if tag in ('taxpayerid', 'taxnumber'):
                        c = _clean_tax(txt)
                        if c:
                            if 'customertaxnumber' in cur_path:
                                tax_buckets['normal'].append(c)
                            else:
                                tax_buckets['other'].append(c)
                    elif tag in ('groupmembertaxnumber',):
                        c = _clean_tax(txt)
                        if c:
                            tax_buckets['group'].append(c)
                    elif tag in ('communityvatnumber', 'eutaxnumber', 'vatnumber'):
                        c = _clean_tax(txt)
                        if c:
                            tax_buckets['eu'].append(c)
                    elif tag in ('thirdstatetaxid',):
                        c = _clean_tax(txt)
                        if c:
                            tax_buckets['third'].append(c)

                if txt and tag in ('currencycode', 'currency', 'invoicecurrency', 'invoicenetamountcurrency'):
                    cv = txt.upper()
                    if cv and len(cv) <= 5 and 'huf' not in path_txt:
                        currency_candidates.append(cv)

                if tag in ('invoicenetamount', 'invoicegrossamount', 'linegrossamountnormal', 'linenetamounthuf', 'linegrossamounthuf'):
                    if 'huf' not in path_txt:
                        attr_cur = (
                            (node.attrib.get('currency') if hasattr(node, 'attrib') else None)
                            or (node.attrib.get('currencyCode') if hasattr(node, 'attrib') else None)
                            or (node.attrib.get('currencycode') if hasattr(node, 'attrib') else None)
                        )
                        if attr_cur:
                            cv = str(attr_cur).strip().upper()
                            if cv and len(cv) <= 5:
                                currency_candidates.append(cv)

                for ch in list(node):
                    _walk(ch, cur_path)

            _walk(root, [])

            for key in ('normal', 'group', 'eu', 'third', 'other'):
                if tax_buckets[key]:
                    result['customer_tax_number'] = tax_buckets[key][0]
                    break

            if currency_candidates:
                uniq = []
                for c in currency_candidates:
                    if c not in uniq:
                        uniq.append(c)
                non_huf = [c for c in uniq if c != 'HUF']
                result['currency'] = non_huf[0] if non_huf else uniq[0]

            return result

        def _decode_nav_invoice_data_response(response_text: str):
            try:
                import base64, gzip, io
                root = ET.fromstring(response_text)
            except Exception:
                return ''

            def _find_any(root_el, local):
                for el in root_el.iter():
                    tag = el.tag
                    if tag == local or (isinstance(tag, str) and tag.endswith('}' + local)):
                        return el
                return None

            try:
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

        def _get_external_meta_from_cache_basic(inv_number, supplier_tax_number=None):
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
                return _parse_external_meta_basic(cached.xml_text)
            except Exception:
                return None

        fetched_external_meta_cache = {}

        def _fetch_external_meta_from_nav(inv_number, supplier_tax_number=None, digest_index=None, allow_network=True):
            key = f"{inv_number}|{supplier_tax_number or ''}|{digest_index or ''}"
            if key in fetched_external_meta_cache:
                return fetched_external_meta_cache[key]
            if not allow_network:
                fetched_external_meta_cache[key] = None
                return None
            try:
                from invoices.models import CompanyNAVConfiguration, IncomingInvoiceData
                cfg = CompanyNAVConfiguration.objects.filter(company=company, is_active=True).order_by('-is_default').first()
                if not cfg:
                    fetched_external_meta_cache[key] = None
                    return None
                nav_service = NAVService(cfg)
                variants = [
                    (digest_index, None),
                    (None, None),
                    (digest_index, supplier_tax_number),
                    (None, supplier_tax_number),
                ]
                for bi, stn in variants:
                    try:
                        res = nav_service.query_invoice_data('OUTBOUND', inv_number, None, bi)
                        decoded_xml = _decode_nav_invoice_data_response(res.get('response') or '')
                        if not decoded_xml:
                            continue
                        meta = _parse_external_meta_basic(decoded_xml)
                        try:
                            IncomingInvoiceData.objects.update_or_create(
                                company=company,
                                invoice_number=inv_number,
                                supplier_tax_number=stn or supplier_tax_number,
                                defaults={'xml_text': decoded_xml},
                            )
                        except Exception:
                            pass
                        if meta and (meta.get('customer_tax_number') or meta.get('currency')):
                            fetched_external_meta_cache[key] = meta
                            return meta
                    except Exception:
                        continue
            except Exception:
                pass
            fetched_external_meta_cache[key] = None
            return None

        # decide refresh
        import logging
        logger = logging.getLogger('invoices.incoming')
        sync, _ = IncomingSyncState.objects.get_or_create(company=company)
        sync_last_refreshed = sync.external_last_refreshed_at if external_outgoing else sync.last_refreshed_at
        external_full_synced = bool(getattr(sync, 'external_full_sync_at', None)) if external_outgoing else True
        # Perform refresh only if requested or stale: initial or older than 6h
        from datetime import timedelta
        refresh_param = (request.query_params.get('refresh') or '').strip().lower()
        force_refresh = refresh_param in ('1', 'true', 'yes')
        needs_refresh = False
        if force_refresh or not sync_last_refreshed:
            needs_refresh = True
        else:
            try:
                if timezone.now() - sync_last_refreshed > timedelta(hours=6):
                    needs_refresh = True
            except Exception:
                needs_refresh = True
        if external_outgoing and not external_full_synced:
            needs_refresh = True

        # If we have no local data for the requested range, force a backfill for that range
        from django.db.models import Q, F, Value, DecimalField
        from django.db.models.functions import Coalesce, Trim, Replace, Upper
        has_any_qs = IncomingInvoiceDigest.objects.filter(company=company)
        if external_outgoing:
            own_invoice_numbers = Invoice.objects.filter(company=company).values_list('invoice_number', flat=True)
            has_any_qs = has_any_qs.exclude(invoice_number__in=own_invoice_numbers)
            has_any_qs = has_any_qs.exclude(invoice_category__iexact='SIMPLIFIED')
            has_any_qs = has_any_qs.annotate(
                _supplier_tax_norm=Replace(
                    Replace(
                        Replace(
                            Trim(Coalesce(F('supplier_tax_number'), Value(''))),
                            Value('-'),
                            Value(''),
                        ),
                        Value(' '),
                        Value(''),
                    ),
                    Value('/'),
                    Value(''),
                ),
            )
            if company_tax_base:
                has_any_qs = has_any_qs.filter(Q(_supplier_tax_norm__contains=company_tax_base) | Q(supplier_name__icontains=company.name))
            elif company_name_norm:
                has_any_qs = has_any_qs.filter(supplier_name__icontains=company.name)
        if date_from and date_to:
            has_any_qs = has_any_qs.filter(
                Q(invoice_issue_date__gte=date_from, invoice_issue_date__lte=date_to) |
                Q(ins_date__date__gte=date_from, ins_date__date__lte=date_to)
            )
        has_any = has_any_qs.exists()

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
            fetch_by_insdate = sync_last_refreshed is not None and has_any and not (external_outgoing and not external_full_synced)
            
            # If explicit date range provided, use it (by invoiceIssueDate)
            if date_from and date_to:
                fetch_by_insdate = False
                
            if fetch_by_insdate:
                # Automatic/Delta sync: use insDate (arrival date)
                # Overlap: look back 5 days from the last fetch to catch delayed items
                from datetime import timedelta
                start_time = sync_last_refreshed - timedelta(days=5)
                
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
                    from datetime import timedelta
                    today = timezone.now().date()
                    if external_outgoing and not external_full_synced:
                        src_from, src_to = '2010-01-01', today.isoformat()
                        logger.info(f"External outgoing full historical sync: {src_from} -> {src_to}")
                    elif external_outgoing:
                        src_from, src_to = (today - timedelta(days=30)).isoformat(), today.isoformat()
                    else:
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
                    res = nav_service.query_invoice_digest(nav_direction, span_from, span_to, page=nav_page)
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

                        customer_tax_id = child_map.get('customerTaxNumber')
                        if not customer_tax_id:
                            ctn = d.find(f'{ns_api}customerTaxNumber') or d.find('customerTaxNumber')
                            if ctn is not None:
                                ti = ctn.find(f'{ns_base}taxpayerId') or ctn.find('taxpayerId')
                                customer_tax_id = (ti.text.strip() if (ti is not None and ti.text) else (ctn.text.strip() if ctn.text else None))

                        currency_val = child_map.get('currency') or child_map.get('invoiceCurrency') or child_map.get('invoiceNetAmountCurrency')
                        if not currency_val:
                            c_el = d.find(f'.//{ns_api}currency') or d.find(f'.//{ns_base}currency') or d.find('.//currency')
                            if c_el is not None and c_el.text:
                                currency_val = c_el.text.strip()
                        if not currency_val:
                            n_el = d.find(f'.//{ns_api}invoiceNetAmount') or d.find(f'.//{ns_base}invoiceNetAmount') or d.find('.//invoiceNetAmount')
                            if n_el is not None:
                                currency_val = (
                                    n_el.attrib.get('currency')
                                    or n_el.attrib.get('currencyCode')
                                    or n_el.attrib.get('currencycode')
                                )

                        if external_outgoing:
                            meta = _get_external_meta_from_cache_basic(inv_number, supplier_tax_id) or {}
                            meta_tax = meta.get('customer_tax_number')
                            meta_currency = meta.get('currency')
                            if meta_tax and (not customer_tax_id or customer_tax_id == supplier_tax_id or customer_tax_id != meta_tax):
                                customer_tax_id = meta_tax
                            if meta_currency and (not currency_val or str(currency_val).strip().upper() != str(meta_currency).strip().upper()):
                                currency_val = meta_currency

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
                            'customer_tax_number': customer_tax_id,
                            'customer_name': child_map.get('customerName'),
                            'payment_method': child_map.get('paymentMethod'),
                            'payment_date': None,  # NAV digest paymentDate is due date; keep DB if any
                            'invoice_appearance': child_map.get('invoiceAppearance'),
                            'currency': currency_val,
                            'invoice_net_amount': child_map.get('invoiceNetAmount'),
                            'invoice_vat_amount': child_map.get('invoiceVatAmount'),
                            'transaction_id': child_map.get('TransactionId') or child_map.get('transactionId'),
                            'index': int((child_map.get('index') or '1') or '1'),
                            'original_invoice_number': child_map.get('originalInvoiceNumber'),
                            'modification_index': int(child_map['modificationIndex']) if child_map.get('modificationIndex') else None,
                            'ins_date': child_map.get('insDate'),
                            'completeness_indicator': (child_map.get('completenessIndicator') == 'true'),
                        }

                        if external_outgoing:
                            if str(fields.get('invoice_category') or '').upper() == 'SIMPLIFIED':
                                continue
                            supplier_tax_base = ''.join(ch for ch in str(supplier_tax_id or '') if ch.isdigit())[:8]
                            supplier_name_norm = str(supplier_name or '').strip().upper()
                            if company_tax_base:
                                if supplier_tax_base and supplier_tax_base != company_tax_base:
                                    if not company_name_norm or company_name_norm not in supplier_name_norm:
                                        continue
                            elif company_name_norm and company_name_norm not in supplier_name_norm:
                                continue

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
                        if not created:
                            changed_fields = []
                            refreshable = (
                                'invoice_issue_date',
                                'invoice_delivery_date',
                                'supplier_tax_number',
                                'supplier_name',
                                'customer_tax_number',
                                'customer_name',
                                'currency',
                                'invoice_net_amount',
                                'invoice_vat_amount',
                                'ins_date',
                                'index',
                            )
                            for fname in refreshable:
                                new_val = fields.get(fname)
                                if new_val is None:
                                    continue
                                old_val = getattr(obj, fname, None)
                                if old_val != new_val:
                                    setattr(obj, fname, new_val)
                                    changed_fields.append(fname)

                            if fields.get('due_date') and getattr(obj, 'due_date', None) != fields['due_date']:
                                obj.due_date = fields['due_date']
                                changed_fields.append('due_date')

                            if changed_fields:
                                try:
                                    obj.save(update_fields=list(dict.fromkeys(changed_fields + ['updated_at'])))
                                except Exception:
                                    pass
                        if created:
                            upsert_count += 1
                            window_new += 1

                    cp = (
                        root.find(f'.//{ns_api}currentPage')
                        or root.find(f'.//{ns_base}currentPage')
                        or root.find('.//currentPage')
                    )
                    pc = (
                        root.find(f'.//{ns_api}pageCount')
                        or root.find(f'.//{ns_api}availablePage')
                        or root.find(f'.//{ns_base}pageCount')
                        or root.find(f'.//{ns_base}availablePage')
                        or root.find('.//pageCount')
                        or root.find('.//availablePage')
                    )
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
                    now_ts = timezone.now()
                    if external_outgoing:
                        sync.external_last_refreshed_at = now_ts
                        update_fields = ['external_last_refreshed_at']
                        if not external_full_synced:
                            sync.external_full_sync_at = now_ts
                            update_fields.append('external_full_sync_at')
                        sync.save(update_fields=update_fields)
                    else:
                        sync.last_refreshed_at = now_ts
                        sync.save(update_fields=['last_refreshed_at'])
                elif fetch_by_insdate:
                    # Should not be reachable if (date_from and date_to) forces fetch_by_insdate=False, 
                    # but kept for logical completeness.
                    now_ts = timezone.now()
                    if external_outgoing:
                        sync.external_last_refreshed_at = now_ts
                        sync.save(update_fields=['external_last_refreshed_at'])
                    else:
                        sync.last_refreshed_at = now_ts
                        sync.save(update_fields=['last_refreshed_at'])

                did_refresh = True

        if external_outgoing:
            try:
                missing_meta_qs = (
                    IncomingInvoiceDigest.objects
                    .filter(company=company)
                    .filter(
                        Q(customer_tax_number__isnull=True)
                        | Q(customer_tax_number='')
                        | Q(currency__isnull=True)
                        | Q(currency='')
                        | Q(customer_tax_number=F('supplier_tax_number'))
                    )
                    .exclude(invoice_category__iexact='SIMPLIFIED')
                    .order_by('-updated_at')[:500]
                )
                for obj in missing_meta_qs:
                    meta = _get_external_meta_from_cache_basic(obj.invoice_number, obj.supplier_tax_number) or {}
                    updates = {}
                    meta_tax = meta.get('customer_tax_number')
                    meta_currency = meta.get('currency')
                    if meta_tax and (
                        not (obj.customer_tax_number or '').strip()
                        or (obj.customer_tax_number == obj.supplier_tax_number)
                        or (obj.customer_tax_number != meta_tax)
                    ):
                        updates['customer_tax_number'] = meta.get('customer_tax_number')
                    if meta_currency and (
                        not (obj.currency or '').strip()
                        or str(obj.currency).strip().upper() != str(meta_currency).strip().upper()
                    ):
                        updates['currency'] = meta.get('currency')
                    if updates:
                        IncomingInvoiceDigest.objects.filter(id=obj.id).update(**updates)
            except Exception:
                pass

        # Serve from DB
        qs = IncomingInvoiceDigest.objects.filter(company=company).select_related('approved_by')
        if company_tax_base:
            qs = qs.annotate(
                _supplier_tax_norm=Replace(
                    Replace(
                        Replace(
                            Trim(Coalesce(F('supplier_tax_number'), Value(''))),
                            Value('-'),
                            Value(''),
                        ),
                        Value(' '),
                        Value(''),
                    ),
                    Value('/'),
                    Value(''),
                ),
                _customer_tax_norm=Replace(
                    Replace(
                        Replace(
                            Trim(Coalesce(F('customer_tax_number'), Value(''))),
                            Value('-'),
                            Value(''),
                        ),
                        Value(' '),
                        Value(''),
                    ),
                    Value('/'),
                    Value(''),
                ),
            )
            if external_outgoing:
                qs = qs.filter(Q(_supplier_tax_norm__contains=company_tax_base) | Q(supplier_name__icontains=company.name))
            else:
                qs = qs.filter(
                    Q(_customer_tax_norm__contains=company_tax_base)
                    | (Q(_customer_tax_norm='') & ~Q(_supplier_tax_norm__contains=company_tax_base))
                )
        elif external_outgoing and company_name_norm:
            qs = qs.filter(supplier_name__icontains=company.name)

        if external_outgoing:
            own_invoice_numbers = Invoice.objects.filter(company=company).values_list('invoice_number', flat=True)
            qs = qs.exclude(invoice_number__in=own_invoice_numbers)
            qs = qs.exclude(invoice_category__iexact='SIMPLIFIED')
            manual_tx_prefix = 'OUTBOUND_MANUAL::'
            nav_external_invoice_numbers = (
                IncomingInvoiceDigest.objects
                .filter(company=company)
                .exclude(transaction_id__startswith=manual_tx_prefix)
                .exclude(invoice_number__isnull=True)
                .exclude(invoice_number='')
                .values_list('invoice_number', flat=True)
                .distinct()
            )
            # If a NAV external outgoing record exists for the same invoice number,
            # hide the manual fallback duplicate from list view.
            qs = qs.exclude(
                Q(transaction_id__startswith=manual_tx_prefix)
                & Q(invoice_number__in=nav_external_invoice_numbers)
            )
        else:
            # Incoming view must not show external outbound snapshots that share the same digest table.
            qs = qs.exclude(
                Q(invoice_operation__iexact='OUTBOUND')
                | Q(invoice_operation__iexact='EXTERNAL_OUTGOING')
                | Q(transaction_id__startswith='OUTBOUND_MANUAL::')
            )
            if company_tax_base:
                qs = qs.exclude(_supplier_tax_norm__contains=company_tax_base)
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
            if external_outgoing:
                # In external outgoing mode: supplier = the company itself;
                # the user searches by invoice number, customer name or customer tax number
                qs = qs.filter(
                    Q(invoice_number__icontains=search)
                    | Q(customer_name__icontains=search)
                    | Q(customer_tax_number__icontains=search)
                )
            else:
                qs = qs.filter(
                    Q(invoice_number__icontains=search)
                    | Q(supplier_name__icontains=search)
                    | Q(supplier_tax_number__icontains=search)
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

        # Payment method filter (single or multi: TRANSFER,CASH,...)
        payment_method_values = [
            v.strip().upper()
            for v in str(payment_method_filter).split(',')
            if v and v.strip()
        ]
        payment_method_values = [v for v in payment_method_values if v != 'ALL']
        if payment_method_values:
            include_unknown = 'UNKNOWN' in payment_method_values
            normal_values = [v for v in payment_method_values if v != 'UNKNOWN']
            payment_method_aliases = {
                'TRANSFER': {'TRANSFER', 'ÁTUTALÁS', 'ATUTALAS'},
                'CASH': {'CASH', 'KÉSZPÉNZ', 'KESZPENZ'},
                'CARD': {'CARD', 'KÁRTYA', 'KARTYA'},
                'UTANVET': {'UTANVET', 'UTÁNVÉT'},
                'OTHER': {'OTHER', 'EGYÉB', 'EGYEB'},
                'VOUCHER': {'VOUCHER', 'UTALVÁNY', 'UTALVANY'},
            }
            qs = qs.annotate(
                _pm_normalized=Upper(Trim(Coalesce(F('payment_method'), Value(''))))
            )
            q_pm = Q()
            if normal_values:
                expanded_values = set()
                for code in normal_values:
                    expanded_values.update(payment_method_aliases.get(code, {code}))
                q_pm |= Q(_pm_normalized__in=list(expanded_values))
            if include_unknown:
                qs = qs.annotate(
                    _pm_unknown_normalized=Replace(
                        Replace(
                            Replace(
                                Replace(
                                    Trim(Coalesce(F('payment_method'), Value(''))),
                                    Value('-'),
                                    Value(''),
                                ),
                                Value('–'),
                                Value(''),
                            ),
                            Value('—'),
                            Value(''),
                        ),
                        Value(' '),
                        Value(''),
                    )
                )
                q_pm |= Q(_pm_unknown_normalized='')
            if q_pm:
                qs = qs.filter(q_pm)

        # Approval filter
        if approval_filter == 'approved':
            qs = qs.filter(is_approved=True)
        elif approval_filter == 'unapproved':
            qs = qs.filter(is_approved=False)

        # Manual-only filter: invoices not coming from NAV sync (created in app manually)
        if manual_only:
            qs = qs.filter(Q(invoice_operation__iexact='MANUAL') | Q(transaction_id__startswith='MANUAL-'))

        # Paid/unpaid coarse filter in DB (due handled later)
        if status_filter == 'paid':
            qs = qs.filter(
                Q(payment_date__isnull=False)
                | (~Q(payment_method__iexact='TRANSFER') & ~Q(payment_method__iexact='COD'))
            )
        elif status_filter in ('unpaid', 'due'):
            qs = qs.filter(
                (Q(payment_method__iexact='TRANSFER') | Q(payment_method__iexact='COD'))
                & Q(payment_date__isnull=True)
            )

        ordered_qs = qs.order_by('-invoice_issue_date', '-invoice_number', '-ins_date')
        storno_invoice_q = Q(invoice_operation__icontains='STORNO') | Q(invoice_operation__icontains='CANCEL')
        storno_original_numbers = set(
            ordered_qs
            .filter(storno_invoice_q)
            .exclude(original_invoice_number__isnull=True)
            .exclude(original_invoice_number='')
            .values_list('original_invoice_number', flat=True)
            .distinct()
        )
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

        # Aggregate bank statement-based incoming payments per invoice (only current page items)
        bank_sum_map = {}
        bank_items_map = {}
        if page_items_raw:
            q_bank = Q()
            for r in page_items_raw:
                q_bank |= (
                    Q(incoming_invoice__invoice_number=r.invoice_number)
                    & (Q(incoming_invoice__supplier_tax_number=r.supplier_tax_number) | Q(incoming_invoice__supplier_tax_number__isnull=True))
                )

            bank_rows = (
                BankStatementItem.objects
                .filter(bank_statement__company=company, incoming_invoice__isnull=False)
                .filter(q_bank)
                .values(
                    'incoming_invoice__invoice_number',
                    'incoming_invoice__supplier_tax_number',
                    'amount',
                    'bank_statement_id',
                    'bank_statement__sequence_number',
                    'bank_statement__statement_date',
                )
            )

            for row in bank_rows:
                key = f"{row.get('incoming_invoice__invoice_number') or ''}|{row.get('incoming_invoice__supplier_tax_number') or ''}"
                amt = row.get('amount') or decimal.Decimal('0')
                bank_sum_map[key] = (bank_sum_map.get(key) or decimal.Decimal('0')) + amt
                bank_items_map.setdefault(key, []).append({
                    'statementId': str(row.get('bank_statement_id')) if row.get('bank_statement_id') else None,
                    'sequenceNumber': row.get('bank_statement__sequence_number'),
                    'statementDate': row.get('bank_statement__statement_date').isoformat() if row.get('bank_statement__statement_date') else None,
                    'amount': str(amt),
                })

        items_all = []

        def _normalize_tax_value(raw_value):
            return ''.join(ch for ch in str(raw_value or '') if ch.isdigit())

        supplier_tax_values = set()
        supplier_name_values = set()
        for _row in page_items_raw:
            try:
                tx = str(getattr(_row, 'supplier_tax_number', '') or '').strip()
            except Exception:
                tx = ''
            if tx:
                supplier_tax_values.add(tx)
            ntx = _normalize_tax_value(tx)
            if ntx:
                supplier_tax_values.add(ntx)
            try:
                nm = str(getattr(_row, 'supplier_name', '') or '').strip()
            except Exception:
                nm = ''
            if nm:
                supplier_name_values.add(nm)

        supplier_customers_by_tax = {}
        supplier_customers_by_name = {}
        all_customers_by_tax = {}
        all_customers_by_name = {}

        def _customer_tax_keys(cust_obj):
            keys = set()
            try:
                tx = _normalize_tax_value(getattr(cust_obj, 'tax_number', ''))
                if tx:
                    keys.add(tx)
            except Exception:
                pass
            try:
                ftx = _normalize_tax_value(getattr(cust_obj, 'full_tax_number', ''))
                if ftx:
                    keys.add(ftx)
                    if len(ftx) >= 8:
                        keys.add(ftx[:8])
            except Exception:
                pass
            return keys
        if supplier_tax_values or supplier_name_values:
            supplier_candidates = Customer.objects.filter(is_supplier=True)
            if supplier_tax_values and supplier_name_values:
                supplier_candidates = supplier_candidates.filter(
                    Q(tax_number__in=list(supplier_tax_values))
                    | Q(full_tax_number__in=list(supplier_tax_values))
                    | Q(name__in=list(supplier_name_values))
                )
            elif supplier_tax_values:
                supplier_candidates = supplier_candidates.filter(
                    Q(tax_number__in=list(supplier_tax_values))
                    | Q(full_tax_number__in=list(supplier_tax_values))
                )
            else:
                supplier_candidates = supplier_candidates.filter(name__in=list(supplier_name_values))
            for c in supplier_candidates:
                for tax_key in _customer_tax_keys(c):
                    if tax_key and tax_key not in supplier_customers_by_tax:
                        supplier_customers_by_tax[tax_key] = c
                name_key = str(getattr(c, 'name', '') or '').strip().lower()
                if name_key and name_key not in supplier_customers_by_name:
                    supplier_customers_by_name[name_key] = c

            all_candidates = Customer.objects.all()
            if supplier_tax_values and supplier_name_values:
                all_candidates = all_candidates.filter(
                    Q(tax_number__in=list(supplier_tax_values))
                    | Q(full_tax_number__in=list(supplier_tax_values))
                    | Q(name__in=list(supplier_name_values))
                )
            elif supplier_tax_values:
                all_candidates = all_candidates.filter(
                    Q(tax_number__in=list(supplier_tax_values))
                    | Q(full_tax_number__in=list(supplier_tax_values))
                )
            else:
                all_candidates = all_candidates.filter(name__in=list(supplier_name_values))

            for c in all_candidates:
                for tax_key in _customer_tax_keys(c):
                    if tax_key and tax_key not in all_customers_by_tax:
                        all_customers_by_tax[tax_key] = c
                name_key = str(getattr(c, 'name', '') or '').strip().lower()
                if name_key and name_key not in all_customers_by_name:
                    all_customers_by_name[name_key] = c

        supplier_bank_accounts_by_customer_id = {}
        if supplier_customers_by_tax or supplier_customers_by_name:
            supplier_customer_ids = {
                str(c.id)
                for c in list(supplier_customers_by_tax.values()) + list(supplier_customers_by_name.values())
                if getattr(c, 'id', None)
            }

            def _normalize_bank_value(raw_value):
                s = str(raw_value or '').strip().upper()
                if not s:
                    return ''
                return ''.join(ch for ch in s if ch.isalnum())

            if supplier_customer_ids:
                bank_rows = CustomerBankAccount.objects.filter(customer_id__in=list(supplier_customer_ids)).values(
                    'customer_id',
                    'account_number',
                    'iban',
                )
                for b in bank_rows:
                    cid = str(b.get('customer_id') or '')
                    if not cid:
                        continue
                    vals = supplier_bank_accounts_by_customer_id.setdefault(cid, set())
                    acc = _normalize_bank_value(b.get('account_number'))
                    iban = _normalize_bank_value(b.get('iban'))
                    if acc:
                        vals.add(acc)
                    if iban:
                        vals.add(iban)

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

        def _parse_huf_amounts_from_xml(xml_text: str):
            """Extract HUF amounts and exchange rate from invoice XML"""
            try:
                import xml.etree.ElementTree as ET
                from decimal import Decimal
                root = ET.fromstring(xml_text)
                result = {
                    'invoice_net_amount_huf': None,
                    'invoice_vat_amount_huf': None,
                    'exchange_rate': None
                }
                for el in root.iter():
                    try:
                        tag_raw = el.tag.split('}', 1)[-1] if isinstance(el.tag, str) and '}' in el.tag else el.tag
                        tag = (tag_raw or '').lower()
                        val = (el.text or '').strip()
                        if tag == 'invoicenetamounthuf' and val:
                            result['invoice_net_amount_huf'] = Decimal(val)
                        elif tag == 'invoicevatamounthuf' and val:
                            result['invoice_vat_amount_huf'] = Decimal(val)
                        elif tag == 'exchangerate' and val:
                            result['exchange_rate'] = Decimal(val)
                    except Exception:
                        continue
                return result
            except Exception:
                return None

        def _parse_supplier_bank_from_xml_text(xml_text: str):
            try:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(xml_text)
            except Exception:
                return None
            wanted = {
                'supplierbankaccountnumber',
                'bankaccountnumber',
                'creditoraccountnumber',
                'payeefinancialaccount',
            }
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

        def _parse_external_meta_from_xml_text(xml_text: str):
            return _parse_external_meta_basic(xml_text)

        def extract_external_meta_from_cache(inv_number, supplier_tax_number=None):
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
                return _parse_external_meta_from_xml_text(cached.xml_text)
            except Exception:
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

        def extract_huf_amounts_from_cache(inv_number, supplier_tax_number=None):
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
                return _parse_huf_amounts_from_xml(cached.xml_text)
            except Exception:
                return None

        def extract_supplier_bank_from_cache(inv_number, supplier_tax_number=None):
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
                return _parse_supplier_bank_from_xml_text(cached.xml_text)
            except Exception:
                return None

        fetched_due_cache = {}
        supplier_promoted_ids = set()

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
                huf_amounts = _parse_huf_amounts_from_xml(decoded_xml)
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
                                details = conflict.get('differences') or conflict.get('changes') or conflict
                                logger.warning(f"Beszállító adatok eltérnek ({supplier_tax_number}): {details}")
                        except Exception as e:
                            logger.error(f"Hiba a beszállító auto-regisztráció során: {e}")
                except Exception:
                    pass

                # Update digest with due_date and HUF amounts if extracted
                if due_val or huf_amounts:
                    try:
                        qs = IncomingInvoiceDigest.objects.filter(company=company, invoice_number=inv_number)
                        if supplier_tax_number:
                            qs = qs.filter(supplier_tax_number=supplier_tax_number)
                        if digest_index:
                            qs = qs.filter(index=digest_index)
                        
                        update_fields = {}
                        if due_val:
                            update_fields['due_date'] = due_val
                        if huf_amounts:
                            if huf_amounts.get('invoice_net_amount_huf') is not None:
                                update_fields['invoice_net_amount_huf'] = huf_amounts['invoice_net_amount_huf']
                            if huf_amounts.get('invoice_vat_amount_huf') is not None:
                                update_fields['invoice_vat_amount_huf'] = huf_amounts['invoice_vat_amount_huf']
                            if huf_amounts.get('exchange_rate') is not None:
                                update_fields['exchange_rate'] = huf_amounts['exchange_rate']
                        
                        if update_fields:
                            qs.update(**update_fields)
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
            resolved_customer_tax = getattr(r, 'customer_tax_number', None)
            resolved_currency = getattr(r, 'currency', None)
            if external_outgoing and (
                not resolved_customer_tax
                or resolved_customer_tax == getattr(r, 'supplier_tax_number', None)
                or not resolved_currency
                or str(resolved_currency).strip().upper() == 'HUF'
            ):
                ext_meta = extract_external_meta_from_cache(r.invoice_number, getattr(r, 'supplier_tax_number', None)) or {}
                if not (ext_meta.get('customer_tax_number') and ext_meta.get('currency')):
                    nav_meta = _fetch_external_meta_from_nav(
                        r.invoice_number,
                        getattr(r, 'supplier_tax_number', None),
                        getattr(r, 'index', None),
                        allow_network=True,
                    ) or {}
                    if nav_meta.get('customer_tax_number'):
                        ext_meta['customer_tax_number'] = nav_meta.get('customer_tax_number')
                    if nav_meta.get('currency'):
                        ext_meta['currency'] = nav_meta.get('currency')
                meta_tax = ext_meta.get('customer_tax_number')
                meta_currency = ext_meta.get('currency')
                changed_fields = []
                if meta_tax and (
                    not resolved_customer_tax
                    or resolved_customer_tax == getattr(r, 'supplier_tax_number', None)
                    or resolved_customer_tax != meta_tax
                ):
                    resolved_customer_tax = meta_tax
                    try:
                        r.customer_tax_number = meta_tax
                    except Exception:
                        pass
                    changed_fields.append('customer_tax_number')
                if meta_currency and (
                    not resolved_currency
                    or str(resolved_currency).strip().upper() != str(meta_currency).strip().upper()
                ):
                    resolved_currency = meta_currency
                    try:
                        r.currency = meta_currency
                    except Exception:
                        pass
                    changed_fields.append('currency')
                if changed_fields:
                    try:
                        IncomingInvoiceDigest.objects.filter(id=r.id).update(**{f: getattr(r, f) for f in changed_fields})
                    except Exception:
                        pass

            row_currency = (str(resolved_currency).strip().upper() if resolved_currency else str(getattr(r, 'currency', '') or '').strip().upper()) or 'HUF'

            supplier_tax_key = _normalize_tax_value(getattr(r, 'supplier_tax_number', ''))
            supplier_name_key = str(getattr(r, 'supplier_name', '') or '').strip().lower()
            supplier_customer = None
            if supplier_tax_key:
                supplier_customer = supplier_customers_by_tax.get(supplier_tax_key)
            if not supplier_customer and supplier_name_key:
                supplier_customer = supplier_customers_by_name.get(supplier_name_key)
            if not supplier_customer and supplier_tax_key:
                supplier_customer = all_customers_by_tax.get(supplier_tax_key)
            if not supplier_customer and supplier_name_key:
                supplier_customer = all_customers_by_name.get(supplier_name_key)

            # If an existing customer appears as issuer on incoming invoices,
            # ensure it is marked as supplier as well.
            if (
                not external_outgoing
                and supplier_customer is not None
                and not bool(getattr(supplier_customer, 'is_supplier', False))
            ):
                sup_id = str(getattr(supplier_customer, 'id', '') or '')
                if sup_id and sup_id not in supplier_promoted_ids:
                    try:
                        Customer.objects.filter(id=supplier_customer.id).update(is_supplier=True)
                        supplier_customer.is_supplier = True
                        supplier_promoted_ids.add(sup_id)
                    except Exception:
                        pass

            supplier_customer_id = str(supplier_customer.id) if supplier_customer and getattr(supplier_customer, 'id', None) else None
            supplier_missing_in_crm = (not external_outgoing) and (supplier_customer is None)

            nav_supplier_bank_account = None
            has_new_supplier_bank_account = False
            if not external_outgoing:
                nav_supplier_bank_account = extract_supplier_bank_from_cache(r.invoice_number, getattr(r, 'supplier_tax_number', None))

                if supplier_customer_id and nav_supplier_bank_account:
                    nav_norm = ''.join(ch for ch in str(nav_supplier_bank_account).strip().upper() if ch.isalnum())
                    existing_norm = supplier_bank_accounts_by_customer_id.get(supplier_customer_id, set())
                    if nav_norm and nav_norm not in existing_norm:
                        has_new_supplier_bank_account = True

            needs_huf_enrichment = (
                row_currency != 'HUF' and (
                    getattr(r, 'invoice_net_amount_huf', None) is None
                    or getattr(r, 'invoice_vat_amount_huf', None) is None
                    or getattr(r, 'exchange_rate', None) is None
                )
            )
            if needs_huf_enrichment:
                cached_huf = extract_huf_amounts_from_cache(r.invoice_number, getattr(r, 'supplier_tax_number', None)) or {}
                huf_updates = {}
                if getattr(r, 'invoice_net_amount_huf', None) is None and cached_huf.get('invoice_net_amount_huf') is not None:
                    try:
                        r.invoice_net_amount_huf = cached_huf.get('invoice_net_amount_huf')
                        huf_updates['invoice_net_amount_huf'] = r.invoice_net_amount_huf
                    except Exception:
                        pass
                if getattr(r, 'invoice_vat_amount_huf', None) is None and cached_huf.get('invoice_vat_amount_huf') is not None:
                    try:
                        r.invoice_vat_amount_huf = cached_huf.get('invoice_vat_amount_huf')
                        huf_updates['invoice_vat_amount_huf'] = r.invoice_vat_amount_huf
                    except Exception:
                        pass
                if getattr(r, 'exchange_rate', None) is None and cached_huf.get('exchange_rate') is not None:
                    try:
                        r.exchange_rate = cached_huf.get('exchange_rate')
                        huf_updates['exchange_rate'] = r.exchange_rate
                    except Exception:
                        pass
                if huf_updates:
                    try:
                        IncomingInvoiceDigest.objects.filter(id=r.id).update(**huf_updates)
                    except Exception:
                        pass

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
            bank_paid_amount = bank_sum_map.get(pay_key) or decimal.Decimal('0')
            reconciled_paid_amount = r.amount_paid or decimal.Decimal('0')
            paid_amount = max(batch_paid_amount, reconciled_paid_amount)
            last_payment_dt = pay_map.get(pay_key, {}).get('last_payment')
            # For card, cash, voucher, other, utanvet: always paid, payment date = issue date
            if payment_method in ['card', 'cash', 'voucher', 'other', 'utanvet']:
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
                    is_paid = bool(payment_date) or payment_method in ['card','cash','voucher','other','utanvet']
            except Exception:
                pass
            
            # Keep model paid state only if there is payment evidence.
            # This self-heals stale rows where a payment batch was already deleted earlier.
            try:
                tol = decimal.Decimal('0.005')
                has_payment_evidence = (
                    (paid_amount > tol)
                    or (bank_paid_amount > tol)
                    or payment_method in ['card', 'cash', 'voucher', 'other', 'utanvet']
                )
            except Exception:
                has_payment_evidence = payment_method in ['card', 'cash', 'voucher', 'other', 'utanvet']

            model_payment_status = str(getattr(r, 'payment_status', '') or '').lower()
            if model_payment_status == 'paid' and has_payment_evidence:
                is_paid = True
                remaining_amount = decimal.Decimal('0')
            elif model_payment_status in ('paid', 'partially_paid') and not has_payment_evidence:
                is_paid = False
                is_partial = False
                payment_date = None
                try:
                    if gross_val is not None:
                        remaining_amount = gross_val
                except Exception:
                    pass
                try:
                    update_fields = []
                    if r.payment_status != 'unpaid':
                        r.payment_status = 'unpaid'
                        update_fields.append('payment_status')
                    if r.payment_date is not None:
                        r.payment_date = None
                        update_fields.append('payment_date')
                    if decimal.Decimal(str(r.amount_paid or 0)) != decimal.Decimal('0'):
                        r.amount_paid = decimal.Decimal('0')
                        update_fields.append('amount_paid')
                    if r.payment_reference:
                        r.payment_reference = None
                        update_fields.append('payment_reference')
                    if update_fields:
                        r.save(update_fields=update_fields)
                except Exception:
                    pass

            # payment display date: NAV/issue for instant methods, mark-paid date or last payment for transfers
            payment_display_date = None
            if payment_date:
                payment_display_date = payment_date
            elif payment_method in ['card', 'cash', 'voucher', 'other', 'utanvet']:
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
            party_name = r.customer_name if external_outgoing else r.supplier_name
            party_tax = (resolved_customer_tax or '') if external_outgoing else r.supplier_tax_number
            row_currency = (str(resolved_currency).strip().upper() if resolved_currency else '') or 'HUF'
            op_val = str(getattr(r, 'invoice_operation', '') or '').upper()
            tx_val = str(getattr(r, 'transaction_id', '') or '')
            is_manual = (op_val == 'MANUAL') or tx_val.startswith('MANUAL-')
            is_storno_invoice = ('STORNO' in op_val) or ('CANCEL' in op_val)
            is_storno_original = str(getattr(r, 'invoice_number', '') or '') in storno_original_numbers

            items_all.append({
                'id': str(r.id),
                'invoiceNumber': r.invoice_number,
                'invoiceOperation': r.invoice_operation,
                'transactionId': getattr(r, 'transaction_id', None),
                'isManual': bool(is_manual),
                'originalInvoiceNumber': r.original_invoice_number,
                'isStornoInvoice': bool(is_storno_invoice),
                'isStornoOriginal': bool(is_storno_original),
                'invoiceIssueDate': date_val.isoformat() if date_val else None,
                'supplierTaxNumber': party_tax,
                'supplierName': party_name,
                'supplierCustomerId': supplier_customer_id,
                'supplierMissingInCrm': bool(supplier_missing_in_crm),
                'supplierNavBankAccount': nav_supplier_bank_account,
                'supplierHasNewBankAccount': bool(has_new_supplier_bank_account),
                'currency': row_currency,
                'exchangeRate': (str(r.exchange_rate) if getattr(r, 'exchange_rate', None) is not None else None),
                'netAmount': (str(r.invoice_net_amount) if r.invoice_net_amount is not None else None),
                'vatAmount': (str(r.invoice_vat_amount) if r.invoice_vat_amount is not None else None),
                'grossAmount': (str(gross_val) if gross_val is not None else None),
                'netAmountHUF': (str(r.invoice_net_amount_huf) if getattr(r, 'invoice_net_amount_huf', None) is not None else None),
                'vatAmountHUF': (str(r.invoice_vat_amount_huf) if getattr(r, 'invoice_vat_amount_huf', None) is not None else None),
                'grossAmountHUF': (
                    str(
                        (
                            decimal.Decimal(str(getattr(r, 'invoice_net_amount_huf', None) or 0)) +
                            decimal.Decimal(str(getattr(r, 'invoice_vat_amount_huf', None) or 0))
                        )
                    ) if (
                        getattr(r, 'invoice_net_amount_huf', None) is not None or
                        getattr(r, 'invoice_vat_amount_huf', None) is not None
                    ) else (
                        str(
                            (gross_val * decimal.Decimal(str(r.exchange_rate))).quantize(decimal.Decimal('0.01'))
                        ) if (
                            gross_val is not None and
                            getattr(r, 'exchange_rate', None) is not None and
                            decimal.Decimal(str(r.exchange_rate)) > decimal.Decimal('1.01') and
                            row_currency != 'HUF'
                        ) else None
                    )
                ),
                'deliveryDate': (r.invoice_delivery_date.isoformat() if r.invoice_delivery_date else None),
                'paymentDate': (payment_display_date.isoformat() if hasattr(payment_display_date, 'isoformat') and payment_display_date else None),
                'paymentMethod': r.payment_method,
                'dueDate': due_date_str,
                'paidAmount': (str(paid_amount) if paid_amount is not None else None),
                'bankPaidAmount': (str(bank_paid_amount) if bank_paid_amount is not None else None),
                'remainingAmount': (str(remaining_amount) if (remaining_amount is not None and remaining_amount > decimal.Decimal('0')) else None),
                'overpaidAmount': (str(overpaid_amount) if overpaid_amount is not None else None),
                'paymentDisplayDate': (payment_display_date.isoformat() if hasattr(payment_display_date, 'isoformat') and payment_display_date else None),
                'paymentReference': getattr(r, 'payment_reference', None),
                'isPaid': is_paid,
                'isPartial': is_partial,
                'inPaymentBatch': pay_key in pay_map,
                'bankStatements': bank_items_map.get(pay_key, []),
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

    def _incoming_parse_decimal(self, raw_value):
        try:
            if raw_value is None:
                return None
            s = str(raw_value).strip()
            if not s:
                return None
            s = s.replace('\u00A0', ' ').replace(' ', '')
            if ',' in s and '.' in s:
                if s.rfind(',') > s.rfind('.'):
                    s = s.replace('.', '').replace(',', '.')
                else:
                    s = s.replace(',', '')
            elif ',' in s:
                s = s.replace('.', '').replace(',', '.')
            return decimal.Decimal(s)
        except Exception:
            return None

    def _incoming_parse_date(self, raw_value):
        if not raw_value:
            return None
        v = str(raw_value).strip()
        for fmt in ('%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d', '%d.%m.%Y', '%d-%m-%Y', '%d/%m/%Y'):
            try:
                d = datetime.strptime(v, fmt).date()
                if d.year < 1990 or d.year > 2100:
                    continue
                return d.isoformat()
            except Exception:
                continue
        return None

    def _incoming_extract_text_from_document(self, upload):
        errors = []
        content_type = str(getattr(upload, 'content_type', '') or '').lower()
        filename = str(getattr(upload, 'name', '') or '').lower()
        try:
            raw = upload.read()
        finally:
            try:
                upload.seek(0)
            except Exception:
                pass

        is_pdf = content_type == 'application/pdf' or filename.endswith('.pdf')
        is_image = content_type.startswith('image/') or filename.endswith(('.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.webp'))

        if is_pdf:
            try:
                from pypdf import PdfReader
                import io
                reader = PdfReader(io.BytesIO(raw))
                pages = []
                for p in reader.pages:
                    pages.append((p.extract_text() or '').strip())
                text = '\n'.join([t for t in pages if t])
                if text:
                    return text, errors
            except Exception as ex:
                errors.append(f'PDF szövegkinyerés hiba: {ex}')

        if is_image:
            try:
                import io
                from PIL import Image
                import pytesseract
                image = Image.open(io.BytesIO(raw))
                text = (pytesseract.image_to_string(image, lang='hun+eng') or '').strip()
                if text:
                    return text, errors
            except Exception as ex:
                errors.append(f'Képi OCR hiba: {ex}')

        return '', errors

    def _incoming_extract_fields_from_text(self, text):
        source = str(text or '')
        one_line = re.sub(r'\s+', ' ', source)
        lines = [ln.strip() for ln in source.splitlines() if str(ln or '').strip()]
        date_re = r'([0-9]{1,4}[./-][0-9]{1,2}[./-][0-9]{1,4})'

        def _find_in_lines(label_patterns):
            for ln in lines:
                for pat in label_patterns:
                    m = re.search(pat, ln, flags=re.IGNORECASE)
                    if m:
                        return (m.group(1) or '').strip()
            return None

        def _find_labelled_date(label_patterns):
            pats = [rf'{p}\s*[:#]?\s*{date_re}' for p in label_patterns]
            direct = _find_in_lines(pats)
            if direct:
                return direct
            for idx, ln in enumerate(lines):
                for p in label_patterns:
                    if not re.search(p, ln, flags=re.IGNORECASE):
                        continue
                    for offs in (0, 1, 2):
                        pos = idx + offs
                        if pos >= len(lines):
                            break
                        m = re.search(date_re, lines[pos])
                        if m:
                            return (m.group(1) or '').strip()
            return None

        def _parse_all_dates():
            out = []
            for ln in lines:
                for m in re.finditer(date_re, ln):
                    parsed = self._incoming_parse_date(m.group(1))
                    if parsed:
                        out.append(parsed)
            # preserve order, unique
            uniq = []
            for d in out:
                if d not in uniq:
                    uniq.append(d)
            return uniq

        proforma_number = None
        proforma_label_patterns = [
            r'(?:d[ií]jbek[eé]r[őo](?:\s*sz[aá]m[aá]?)?|proforma(?:\s*invoice)?(?:\s*number)?|el[őo]legbek[eé]r[őo](?:\s*sz[aá]m[aá]?)?)\s*[:#]?\s*([A-Z0-9](?=[A-Z0-9\/_\-.]*\d)[A-Z0-9\/_\-.]{3,40})',
        ]
        proforma_number = _find_in_lines(proforma_label_patterns)
        if not proforma_number:
            for ln in lines:
                if not re.search(r'(d[ií]jbek[eé]r|proforma|el[őo]legbek[eé]r)', ln, flags=re.IGNORECASE):
                    continue
                candidates = re.findall(r'\b([A-Z0-9][A-Z0-9\/_\-.]{4,40})\b', ln.upper())
                for cand in candidates:
                    if re.fullmatch(r'[0-9\-]+', cand):
                        continue
                    if re.search(r'[0-9]', cand):
                        proforma_number = cand
                        break
                if proforma_number:
                    break

        invoice_number = None
        inv_label_patterns = [
            r'(?:sz[aá]mla(?:\s*sz[aá]m[aá]?)?|invoice(?:\s*number)?|fakt[uú]ra|cislo\s*faktury|č[ií]slo\s*fakt[úu]ry)\s*[:#]?\s*([A-Z0-9](?=[A-Z0-9\/_\-.]*\d)[A-Z0-9\/_\-.]{3,40})',
        ]
        invoice_number = _find_in_lines(inv_label_patterns)
        if not invoice_number:
            for ln in lines:
                if not re.search(r'(sz[aá]mla|invoice|fakt)', ln, flags=re.IGNORECASE):
                    continue
                candidates = re.findall(r'\b([A-Z0-9][A-Z0-9\/_\-.]{4,40})\b', ln.upper())
                for cand in candidates:
                    if re.fullmatch(r'[0-9\-]+', cand):
                        continue
                    if re.search(r'[0-9]', cand):
                        invoice_number = cand
                        break
                if invoice_number:
                    break

        if not invoice_number and proforma_number:
            invoice_number = proforma_number

        issue_raw = _find_labelled_date([
            r'ki[aá]ll[ií]t[aá]s\s*d[aá]tuma', r'sz[aá]mla\s*kelte', r'kelt(?:ez[eé]s)?', r'invoice\s*date',
            r'vystaven[eé]', r'd[aá]tum\s*vystavenia', r'datum\s*vystaveni'
        ])
        due_raw = _find_labelled_date([
            r'esed[eé]kess[eé]g(?:\s*d[aá]tuma)?', r'fizet[eé]si\s*hat[aá]rid[őo]',
            r'due\s*date', r'splatnos[ťt]', r'd[aá]tum\s*splatnosti'
        ])
        delivery_raw = _find_labelled_date([
            r'teljes[ií]t[eé]s(?:\s*d[aá]tuma)?', r'sz[aá]ll[ií]t[aá]s\s*d[aá]tuma',
            r'delivery\s*date', r'sale\s*date', r'd[aá]tum\s*dodania'
        ])

        all_dates = _parse_all_dates()
        issue_date = self._incoming_parse_date(issue_raw)
        due_date = self._incoming_parse_date(due_raw)
        delivery_date = self._incoming_parse_date(delivery_raw)
        if not issue_date and all_dates:
            issue_date = all_dates[0]
        if not due_date and len(all_dates) > 1:
            due_date = all_dates[-1]
        if not delivery_date and len(all_dates) > 2:
            mid = [d for d in all_dates if d not in (issue_date, due_date)]
            if mid:
                delivery_date = mid[0]

        if issue_date and due_date and due_date < issue_date:
            issue_date, due_date = due_date, issue_date

        supplier_marker = re.compile(r'(?:\bsz[aá]ll[ií]t[oó]\b|\bsz[aá]mlakibocs[aá]t[oó]\b|\bkibocs[aá]t[oó]\b|\bissuer\b|\bsupplier\b|\bseller\b|\bsprzedawc[ay]\b|\bvystavitel\b|\bvystavovatel\b|\bdod[aá]vate[ľl]\b|\bdodavatel\b|\bpred[aá]vaj[úu]ci\b|\bpredavajuci\b|\belad[oó]\b)', re.IGNORECASE)
        buyer_marker = re.compile(r'(vev[őo]|buyer|customer|odberate[ľl]|el[őo]fizet[őo])', re.IGNORECASE)
        # Require at least one digit in prefixed tax IDs to avoid false positives like street names.
        tax_pat = re.compile(r'\b([A-Z]{2}\s*(?=[A-Z0-9]*\d)[A-Z0-9]{8,14}|[0-9]{8}(?:-[0-9]{1,2}-[0-9]{1,2})?)\b', re.IGNORECASE)

        supplier_windows = []
        buyer_windows = []
        for idx, ln in enumerate(lines):
            if re.search(r'sz[aá]ll[ií]t[oó]lev[eé]l', ln, flags=re.IGNORECASE):
                continue
            if supplier_marker.search(ln):
                supplier_windows.extend(range(idx, min(len(lines), idx + 7)))
            if buyer_marker.search(ln):
                buyer_windows.extend(range(idx, min(len(lines), idx + 7)))
        supplier_windows = set(supplier_windows)
        buyer_windows = set(buyer_windows)

        # Explicit section parsing: extract lines under Seller/Supplier-like headers.
        supplier_block = []
        supplier_section_re = re.compile(r'^\s*(seller|supplier|sprzedawc[ay]|issuer|vystavitel|vystavovatel|sz[aá]ll[ií]t[oó]|sz[aá]mlakibocs[aá]t[oó]|kibocs[aá]t[oó]|dod[aá]vate[ľl]|dodavatel)\s*:?\s*(.*)$', re.IGNORECASE)
        stop_section_re = re.compile(r'^\s*(buyer|customer|vev[őo]|el[őo]fizet[őo]|odberate[ľl])\s*:?', re.IGNORECASE)
        table_start_re = re.compile(r'(commercial\s*invoice|nr\s+code\s+product|mennyis[eé]g|egys[eé]g[aá]r|[aá]r\s*o?sszesen|total\s*:)', re.IGNORECASE)
        for idx, ln in enumerate(lines):
            msec = supplier_section_re.match(str(ln or ''))
            if not msec:
                continue
            inline = str(msec.group(2) or '').strip(' :;-')
            if inline:
                supplier_block.append(inline)
            for j in range(idx + 1, min(len(lines), idx + 12)):
                row = str(lines[j] or '').strip()
                if not row:
                    continue
                if stop_section_re.search(row) or table_start_re.search(row):
                    break
                supplier_block.append(row)
            if supplier_block:
                break

        supplier_tax_number = None
        if supplier_block:
            block_text = ' '.join(supplier_block)
            m_block_tax = tax_pat.search(block_text)
            if m_block_tax:
                supplier_tax_number = re.sub(r'\s+', '', (m_block_tax.group(1) or '').strip()).upper()

        # First pass: explicit labelled supplier/issuer tax lines (most reliable on invoice-like layouts)
        for idx, ln in enumerate(lines):
            line = str(ln or '').strip()
            if not line:
                continue
            if buyer_marker.search(line):
                continue
            has_supplier_ctx = bool(supplier_marker.search(line))
            has_tax_label = bool(re.search(r'(ad[oó]sz[aá]m|tax\s*number|vat(?:\s*number)?|i[čc]\s*dph|di[čc])', line, flags=re.IGNORECASE))
            if not has_tax_label:
                continue
            local_window = ' '.join(lines[idx:min(len(lines), idx + 2)])
            if not has_supplier_ctx and not supplier_marker.search(local_window):
                continue
            m_tax = tax_pat.search(local_window)
            if m_tax:
                supplier_tax_number = re.sub(r'\s+', '', (m_tax.group(1) or '').strip()).upper()
                break

        scored_taxes = []
        for idx, ln in enumerate(lines):
            has_supplier_marker = bool(supplier_marker.search(ln))
            has_buyer_marker = bool(buyer_marker.search(ln))
            if has_supplier_marker and has_buyer_marker:
                continue
            for m in tax_pat.finditer(ln):
                tax = re.sub(r'\s+', '', (m.group(1) or '').strip()).upper()
                score = 0
                if idx in supplier_windows:
                    score += 3
                if idx in buyer_windows:
                    score -= 5
                if re.search(r'(ksh|ad[oó]sz[aá]m|tax|vat|nip|dic|i[čc]\s*dph)', ln, flags=re.IGNORECASE):
                    score += 1
                if re.search(r'(i[čc]\s*dph|dph|di[čc]|eu\s*vat|vat\s*number)', ln, flags=re.IGNORECASE):
                    score += 2
                if re.search(r'(ksh\s*[aá]fa|ksh-sz|el[őo]fizet[őo]|vev[őo]|buyer|customer)', ln, flags=re.IGNORECASE):
                    score -= 3
                scored_taxes.append((score, tax))
        if (not supplier_tax_number) and scored_taxes:
            scored_taxes.sort(key=lambda x: (x[0], len(x[1])), reverse=True)
            best_score, best_tax = scored_taxes[0]
            if best_score > 0:
                supplier_tax_number = best_tax

        supplier_name = None
        if supplier_block:
            for row in supplier_block:
                candidate = str(row or '').strip(' ,.;:-')
                if not candidate or len(candidate) < 3:
                    continue
                if re.search(r'(ad[oó]sz[aá]m|tax|ksh|iban|swift|dic|i[čc]\s*dph|telef[oó]n|fax|bank|bdo)', candidate, flags=re.IGNORECASE):
                    continue
                if re.search(r'\b[0-9]{3,}\b', candidate):
                    continue
                supplier_name = candidate
                break

        for idx, ln in enumerate(lines):
            if idx not in supplier_windows:
                continue
            clean = ln.strip(' :;-')
            if not clean:
                continue
            if supplier_marker.search(clean) and ':' in clean:
                parts = clean.split(':', 1)
                candidate = parts[1].strip()
            else:
                candidate = clean
            if re.fullmatch(r'(seller|supplier|sz[aá]ll[ií]t[oó])\s*:?\s*', candidate, flags=re.IGNORECASE):
                candidate = ''
                for next_idx in range(idx + 1, min(len(lines), idx + 5)):
                    nxt = lines[next_idx].strip(' :;-')
                    if not nxt or buyer_marker.search(nxt) or supplier_marker.search(nxt):
                        continue
                    candidate = nxt
                    break
            if not candidate or len(candidate) < 3:
                continue
            if supplier_marker.search(candidate) and buyer_marker.search(candidate):
                continue
            if '/' in candidate and re.search(r'(customer|vev[őo]|odberate[ľl]|el[őo]fizet[őo]|info)', candidate, flags=re.IGNORECASE):
                continue
            if re.search(r'(ad[oó]sz[aá]m|tax|ksh|iban|swift|dic|i[čc] dph|telef[oó]n|fax|bank)', candidate, flags=re.IGNORECASE):
                continue
            if re.search(r'(customer\s*info|vev[őo]\s*adat|odberate[ľl]|supplier\s*info)', candidate, flags=re.IGNORECASE):
                continue
            if re.search(r'[0-9]{3,}', candidate):
                continue
            supplier_name = candidate.strip(' ,.;')
            break

        if supplier_name and re.search(r'(sz[aá]ml[aá]zunk|mennyis[eé]g|kedvezm[eé]ny|egys[eé]g[aá]r|[aá]r\s*[oö]sszesen)', supplier_name, flags=re.IGNORECASE):
            supplier_name = None
        if not supplier_name:
            buyer_start_idx = None
            for idx, ln in enumerate(lines):
                if buyer_marker.search(ln):
                    buyer_start_idx = idx
                    break
            company_hint = re.compile(r'(kft\.?|zrt\.?|bt\.?|s\.?r\.?o\.?|sp\.\s*z\s*o\.\s*o\.?|ltd\.?|llc|a\.s\.|s\.a\.)', re.IGNORECASE)
            scan_until = buyer_start_idx if buyer_start_idx is not None else min(len(lines), 18)
            for ln in lines[:scan_until]:
                candidate = ln.strip(' ,.;:-')
                if not candidate or len(candidate) < 3:
                    continue
                if re.search(r'(ksh|iban|swift|bank|rendelve|fizet[eé]si\s*m[oó]d|sz[aá]mla|sz[aá]ll[ií]t[aá]s|d[aá]tuma|ad[oó]sz[aá]m|kifizet[eé]s)', candidate, flags=re.IGNORECASE):
                    continue
                if company_hint.search(candidate):
                    supplier_name = candidate
                    break

        currencies = ['HUF', 'EUR', 'USD', 'GBP', 'CZK', 'RON', 'PLN', 'CHF']
        currency = None
        for c in currencies:
            if re.search(rf'\b{c}\b', one_line, flags=re.IGNORECASE):
                currency = c
                break

        payment_method = 'transfer'
        if re.search(r'\b(bank(?:ing)?\s*transfer|wire\s*transfer|transfer)\b', one_line, flags=re.IGNORECASE):
            payment_method = 'transfer'
        elif re.search(r'\b(k[eé]szp[eé]nz|cash|hotovos[ťt])\b', one_line, flags=re.IGNORECASE):
            payment_method = 'cash'
        elif re.search(r'\b(ut[aá]nv[eé]t|cod|nachnahme|dobierk)\b', one_line, flags=re.IGNORECASE):
            payment_method = 'cod'
        elif re.search(r'\b(k[aá]rtya|card)\b', one_line, flags=re.IGNORECASE):
            payment_method = 'card'

        amount_raw = _find_in_lines([
            r'(?:fizetend[őo]|v[eé]g[oö]sszeg|megt[eé]r[ií]t[eé]snek|total(?:\s+due)?|k\s*[úu]hrad[eu]|celkom\s*k\s*[úu]hrade|spolu\s*na\s*[úu]hradu|brutt[oó]\s*(?:[oö]sszesen)?)\s*[:#]?\s*([0-9][0-9\s.,]{1,24})',
            r'(?:[aá]r\s*[oö]sszesen)\s*[:#]?\s*([0-9][0-9\s.,]{1,24})',
        ])

        gross_total = self._incoming_parse_decimal(amount_raw)
        if gross_total is None:
            nums = []
            for raw in re.findall(r'([0-9]{1,3}(?:[ .][0-9]{3})*(?:[,.][0-9]{2}))', one_line):
                val = self._incoming_parse_decimal(raw)
                if val is not None and val > decimal.Decimal('1'):
                    nums.append(val)
            if nums:
                gross_total = max(nums)

        net_raw = _find_in_lines([
            r'(?:nett[oó](?:\s+[oö]sszeg)?|z[aá]klad\s*dane|z[aá]klad\s*dan[eě])\s*[:#]?\s*([0-9][0-9\s.,]{1,24})',
            r'[aá]fa\s*alapon\s*([0-9][0-9\s.,]{1,24})',
        ])
        vat_raw = _find_in_lines([
            r'(?:[aá]fa(?:\s+[eé]rt[eé]ke|\s+[oö]sszeg)?|dph|vat(?:\s+amount)?)\s*[:#]?\s*([0-9][0-9\s.,]{1,24})',
        ])
        net_total = self._incoming_parse_decimal(net_raw)
        vat_total = self._incoming_parse_decimal(vat_raw)

        suggested_vat_rate = None
        tax_exempt_hint = bool(re.search(r'(áfa\s*mentes|afa\s*mentes|exempt|osloboden[eé]\s*od\s*dane|ford[ií]tott\s*ad[oó]z[aá]s|reverse\s*charge)', one_line, flags=re.IGNORECASE))
        percents = []
        for m in re.finditer(r'([0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*%', one_line):
            p = self._incoming_parse_decimal(m.group(1))
            if p is None:
                continue
            pv = float(p)
            if 0 <= pv <= 40:
                percents.append(pv)
        if tax_exempt_hint:
            suggested_vat_rate = 0
        elif percents:
            common = [0, 5, 18, 20, 27]
            best = max(percents, key=lambda v: sum(1 for x in percents if abs(x - v) < 0.2))
            suggested_vat_rate = min(common, key=lambda c: abs(c - best))

        extracted_items = []
        item_keys = set()
        amount_token_ocr = r'(?:[0-9]{1,3}(?:[\s\u00A0][0-9]{3})+|[0-9]+)(?:[.,][0-9]{2})'
        item_start_re = re.compile(
            r'^\s*(?P<idx>\d{1,3})\s*[\.)\-:]\s*(?:(?P<code>[A-Z0-9\-_./]{2,40})\s+)?(?P<desc>.+?)\s*$',
            re.IGNORECASE,
        )
        code_start_re = re.compile(
            r'^\s*(?P<code>[A-Z0-9\-_./]{4,40})\s+(?P<desc>[A-Za-z].+?)\s*$',
            re.IGNORECASE,
        )
        qty_unit_re = re.compile(
            r'^(?P<desc>.+?)\s+(?P<qty>[0-9]+(?:[.,][0-9]+)?)\s+(?P<unit>[0-9][0-9\s.,]{1,20})\s*(?:HUF|EUR|USD|GBP|PLN|CZK|RON|CHF)?\s*$',
            re.IGNORECASE,
        )
        row_totals_re = re.compile(
            r'(?P<net>[0-9][0-9\s.,]{1,20})\s*(?:HUF|EUR|USD|GBP|PLN|CZK|RON|CHF)?\s+'
            r'(?P<vat>[0-9][0-9\s.,]{1,20})\s*[^0-9%\n]{0,8}\s*'
            r'(?P<vat_rate>[0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*%\s+'
            r'(?P<gross>[0-9][0-9\s.,]{1,20})\s*(?:HUF|EUR|USD|GBP|PLN|CZK|RON|CHF)?',
            re.IGNORECASE,
        )

        item_blocks = []
        i = 0
        while i < len(lines):
            ln = lines[i]
            # Prefer explicit indexed rows ("1.", "2)") to avoid false positives
            # from wrapped descriptive lines.
            if item_start_re.match(ln):
                block = [ln]
                j = i + 1
                while j < len(lines):
                    nxt = lines[j]
                    if item_start_re.match(nxt):
                        break
                    if re.search(r'^\s*(TOTAL\s*:|[oö]sszeg|megt[eé]r[ií]t[eé]snek|[aá]r\s*o?sszesen)\b', nxt, flags=re.IGNORECASE):
                        break
                    block.append(nxt)
                    j += 1
                item_blocks.append(block)
                i = j
                continue
            i += 1

        for block in item_blocks:
            if not block:
                continue
            m0 = item_start_re.match(block[0])
            m0_code = code_start_re.match(block[0])
            if not m0:
                if not m0_code:
                    continue

            item_code = ((m0.group('code') if m0 else None) or (m0_code.group('code') if m0_code else '') or '').strip()
            base_desc = ((m0.group('desc') if m0 else None) or (m0_code.group('desc') if m0_code else '') or '').strip()
            block_text = ' '.join(part.strip() for part in block if part and part.strip())

            qty = None
            unit_price = None
            description = base_desc
            gross_line = None
            vat_rate_line = suggested_vat_rate if suggested_vat_rate is not None else 0

            for row in block[1:4]:
                mq = qty_unit_re.match(row.strip())
                if not mq:
                    continue
                qty_val = self._incoming_parse_decimal(mq.group('qty'))
                unit_val = self._incoming_parse_decimal(mq.group('unit'))
                if qty_val is None or unit_val is None:
                    continue
                qty = qty_val
                unit_price = unit_val
                row_desc = str(mq.group('desc') or '').strip()
                if row_desc and len(row_desc) >= len(description):
                    description = row_desc
                break

            if qty is None or unit_price is None:
                # Fallback for wrapped table rows: "... qty unitPrice HUF ..."
                m_qu = re.search(
                    rf'(?P<qty>[0-9]+(?:[.,][0-9]+)?)\s+(?P<unit>{amount_token_ocr})\s*(?:HUF|EUR|USD|GBP|PLN|CZK|RON|CHF)\b',
                    block_text,
                    flags=re.IGNORECASE,
                )
                if m_qu:
                    qty_val = self._incoming_parse_decimal(m_qu.group('qty'))
                    unit_val = self._incoming_parse_decimal(m_qu.group('unit'))
                    if qty_val is not None and unit_val is not None:
                        qty = qty_val
                        unit_price = unit_val

            if qty is None or unit_price is None:
                # Last-resort fallback: first plausible qty + price pair in the block.
                m_qu2 = re.search(
                    rf'\b(?P<qty>[0-9]+(?:[.,][0-9]+)?)\b\s+\b(?P<unit>{amount_token_ocr})\b',
                    block_text,
                )
                if m_qu2:
                    qty_val = self._incoming_parse_decimal(m_qu2.group('qty'))
                    unit_val = self._incoming_parse_decimal(m_qu2.group('unit'))
                    if qty_val is not None and unit_val is not None and qty_val > 0:
                        qty = qty_val
                        unit_price = unit_val

            mt = row_totals_re.search(block_text)
            if mt:
                gross_line = self._incoming_parse_decimal(mt.group('gross'))
                vat_val = self._incoming_parse_decimal(mt.group('vat_rate'))
                if vat_val is not None:
                    vat_rate_line = float(vat_val)

            # When OCR column alignment is off, gross may parse as 0.00; recover from largest positive amount in the block.
            amount_vals = []
            for raw in re.findall(rf'({amount_token_ocr})', block_text):
                v = self._incoming_parse_decimal(raw)
                if v is not None and v > 0:
                    amount_vals.append(v)
            if (gross_line is None or gross_line <= 0) and amount_vals:
                gross_line = max(amount_vals)

            if qty is None or unit_price is None:
                continue

            if (gross_line is not None) and (qty > 0):
                inferred_unit = (gross_line / qty) if qty else None
                if inferred_unit is not None and abs(inferred_unit - unit_price) < decimal.Decimal('0.05'):
                    pass

            clean_desc = f"{item_code} {description}".strip()
            dedupe_key = (item_code or '').upper() or clean_desc.upper()
            if dedupe_key in item_keys:
                continue
            item_keys.add(dedupe_key)
            extracted_items.append({
                'description': clean_desc,
                'quantity': float(qty),
                'unit_price': float(unit_price),
                'vat_rate': float((0 if tax_exempt_hint else (vat_rate_line or 0))),
                'unit_of_measure': 'db',
                'code': item_code,
                'gross_total': (str(gross_line) if gross_line is not None else None),
            })

        # Supplemental pass: only run when primary pass found no valid rows.
        amount_token = amount_token_ocr
        row_supp_re = re.compile(
            rf'^\s*(?P<idx>\d{{1,3}})\.\s+(?:(?P<code>[A-Z0-9\-_./]{{2,40}})\s+)?(?P<desc>.+?)\s+'
            rf'(?P<qty>[0-9]+(?:[.,][0-9]+)?)\s+(?P<unit>{amount_token})\s*(?:HUF|EUR|USD|GBP|PLN|CZK|RON|CHF)?\s+'
            rf'(?P<net>{amount_token})\s*(?:HUF|EUR|USD|GBP|PLN|CZK|RON|CHF)?\s+'
            rf'(?P<vat_rate>[0-9]{{1,2}}(?:[.,][0-9]{{1,2}})?)\s*%\s+.*?(?P<gross>{amount_token})\s*(?:HUF|EUR|USD|GBP|PLN|CZK|RON|CHF)?',
            re.IGNORECASE,
        )

        if not extracted_items:
            for i in range(len(lines)):
                base = str(lines[i] or '').strip()
                if not item_start_re.match(base):
                    continue
                merged = ' '.join(str(lines[j] or '').strip() for j in range(i, min(len(lines), i + 6)) if str(lines[j] or '').strip())
                ms = row_supp_re.match(merged)
                if not ms:
                    continue
                code = str(ms.group('code') or '').strip()
                desc = str(ms.group('desc') or '').strip()
                qty_val = self._incoming_parse_decimal(ms.group('qty'))
                unit_val = self._incoming_parse_decimal(ms.group('unit'))
                gross_val = self._incoming_parse_decimal(ms.group('gross'))
                vat_val = self._incoming_parse_decimal(ms.group('vat_rate'))
                if qty_val is None or qty_val <= 0 or unit_val is None:
                    continue
                dedupe_key = (code or '').upper() or f"{code} {desc}".strip().upper()
                if dedupe_key in item_keys:
                    continue
                item_keys.add(dedupe_key)
                extracted_items.append({
                    'description': f"{code} {desc}".strip(),
                    'quantity': float(qty_val),
                    'unit_price': float(unit_val),
                    'vat_rate': float((0 if tax_exempt_hint else (float(vat_val) if vat_val is not None else (suggested_vat_rate or 0)))),
                    'unit_of_measure': 'db',
                    'code': code or None,
                    'gross_total': (str(gross_val) if gross_val is not None else None),
                })

        if not extracted_items:
            dense_item_re = re.compile(
                r'^(?P<desc>.+?)\s+(?:(?P<vat_rate>[0-9]{1,2}(?:[.,][0-9]{1,2})?)%\s*)?'
                rf'(?P<unit>{amount_token})\s+(?P<line_total>{amount_token})'
                r'(?P<uom>ks|db)\s*(?P<qty>[0-9]+(?:[.,][0-9]+)?)\s*$',
                re.IGNORECASE,
            )
            for ln in lines:
                row = ln.strip()
                if not row or re.search(r'\b(total|megt[eé]r[ií]t[eé]snek|[aá]rengedm[eé]ny|[aá]fa\s*menetrend)\b', row, flags=re.IGNORECASE):
                    continue
                m = dense_item_re.match(row)
                if not m:
                    continue
                desc = str(m.group('desc') or '').strip(' .;-')
                if len(desc) < 3:
                    continue
                qty_val = self._incoming_parse_decimal(m.group('qty'))
                unit_val = self._incoming_parse_decimal(m.group('unit'))
                vat_rate_val = self._incoming_parse_decimal(m.group('vat_rate')) if m.group('vat_rate') else decimal.Decimal(str(suggested_vat_rate or 0))
                if qty_val is None or unit_val is None or qty_val <= 0:
                    continue
                uom_raw = str(m.group('uom') or '').strip().lower()
                unit_of_measure = 'db'
                if uom_raw in ('kg', 'g', 'm', 'm2', 'm3', 'l', 'ks', 'db'):
                    unit_of_measure = 'db' if uom_raw == 'ks' else uom_raw
                extracted_items.append({
                    'description': desc,
                    'quantity': float(qty_val),
                    'unit_price': float(unit_val),
                    'vat_rate': float((0 if tax_exempt_hint else (vat_rate_val or 0))),
                    'unit_of_measure': unit_of_measure,
                    'code': None,
                    'gross_total': (str(self._incoming_parse_decimal(m.group('line_total'))) if self._incoming_parse_decimal(m.group('line_total')) is not None else None),
                })

        return {
            'proforma_number': proforma_number,
            'invoice_number': invoice_number,
            'issue_date': issue_date,
            'due_date': due_date,
            'delivery_date': delivery_date,
            'supplier_name': supplier_name,
            'supplier_tax_number': supplier_tax_number,
            'currency': currency,
            'payment_method': payment_method,
            'gross_total': gross_total,
            'net_total': net_total,
            'vat_total': vat_total,
            'suggested_vat_rate': suggested_vat_rate,
            'items': extracted_items,
        }

    @action(detail=False, methods=['post'], url_path='incoming/parse-document')
    def parse_incoming_document(self, request):
        from invoices.models import Customer

        upload = request.FILES.get('file')
        if not upload:
            return Response({'success': False, 'error': 'A fájl kötelező.'}, status=status.HTTP_400_BAD_REQUEST)

        extracted_text, extract_errors = self._incoming_extract_text_from_document(upload)
        if not extracted_text:
            return Response({
                'success': False,
                'error': 'Nem sikerült olvasható szöveget kinyerni a fájlból.',
                'details': extract_errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        parsed = self._incoming_extract_fields_from_text(extracted_text)

        def _norm_tax(v):
            return ''.join(ch for ch in str(v or '') if ch.isdigit())

        matched_supplier = None
        tax_norm = _norm_tax(parsed.get('supplier_tax_number'))
        if tax_norm:
            candidates = Customer.objects.filter(is_supplier=True) if hasattr(Customer, 'is_supplier') else Customer.objects.all()
            if not candidates.exists():
                candidates = Customer.objects.all()
            for cand in candidates:
                cand_nums = [
                    _norm_tax(getattr(cand, 'tax_number', None)),
                    _norm_tax(getattr(cand, 'full_tax_number', None)),
                    _norm_tax(getattr(cand, 'eu_tax_number', None)),
                    _norm_tax(getattr(cand, 'vat_group_member_tax_number', None)),
                ]
                cand_nums = [n for n in cand_nums if n]
                if any((n == tax_norm) or (len(tax_norm) >= 8 and n.startswith(tax_norm[:8])) or (len(n) >= 8 and tax_norm.startswith(n[:8])) for n in cand_nums):
                    matched_supplier = cand
                    break

        if not matched_supplier and parsed.get('supplier_name'):
            sname = str(parsed.get('supplier_name') or '').strip()
            sup_qs = Customer.objects.filter(is_supplier=True) if hasattr(Customer, 'is_supplier') else Customer.objects.all()
            if not sup_qs.exists():
                sup_qs = Customer.objects.all()
            matched_supplier = sup_qs.filter(name__iexact=sname).first() or sup_qs.filter(name__icontains=sname).first()

        payload = {
            'invoice_number': parsed.get('invoice_number'),
            'issue_date': parsed.get('issue_date'),
            'due_date': parsed.get('due_date'),
            'delivery_date': parsed.get('delivery_date'),
            'supplier_name': parsed.get('supplier_name'),
            'supplier_tax_number': parsed.get('supplier_tax_number'),
            'currency': parsed.get('currency') or 'HUF',
            'payment_method': parsed.get('payment_method') or 'transfer',
            'gross_total': (str(parsed['gross_total']) if parsed.get('gross_total') is not None else None),
            'net_total': (str(parsed['net_total']) if parsed.get('net_total') is not None else None),
            'vat_total': (str(parsed['vat_total']) if parsed.get('vat_total') is not None else None),
            'suggested_vat_rate': parsed.get('suggested_vat_rate'),
            'items': parsed.get('items') or [],
            'matched_supplier_id': (str(matched_supplier.id) if matched_supplier else None),
            'matched_supplier_name': (matched_supplier.name if matched_supplier else None),
        }

        return Response({
            'success': True,
            'data': payload,
            'extract_warnings': extract_errors,
        })

    @action(detail=False, methods=['post'], url_path='incoming/manual_create')
    def create_manual_incoming(self, request):
        """Create a manual incoming invoice digest for non-NAV invoices (e.g. foreign suppliers)."""
        from decimal import Decimal, ROUND_HALF_UP
        from invoices.models import Company, Customer, IncomingInvoiceDigest
        import uuid

        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        supplier_id = data.get('customer_id')
        invoice_number = str(data.get('invoice_number') or '').strip()
        issue_date = data.get('issue_date')
        due_date = data.get('due_date')
        delivery_date = data.get('delivery_date')
        payment_method = str(data.get('payment_method') or 'TRANSFER').strip().upper()
        currency = str(data.get('currency') or 'HUF').strip().upper()
        exchange_rate = data.get('exchange_rate')
        items = data.get('items') or []
        invoice_category = str(data.get('invoice_category') or 'NORMAL').strip().upper()

        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not supplier_id:
            return Response({'error': 'Szállító (customer_id) kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not invoice_number:
            return Response({'error': 'Számlaszám kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not issue_date:
            return Response({'error': 'Kibocsátás dátuma kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not due_date:
            return Response({'error': 'Esedékesség dátuma kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(items, list) or not items:
            return Response({'error': 'Legalább egy tétel kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        supplier = Customer.objects.filter(id=supplier_id).first()
        if not supplier:
            return Response({'error': 'Szállító nem található'}, status=status.HTTP_400_BAD_REQUEST)

        supplier_tax_number = (supplier.tax_number or supplier.full_tax_number or supplier.eu_tax_number or '')

        def _norm_invoice(v):
            return re.sub(r'[\s\u00A0]+', '', str(v or '')).upper()

        def _norm_tax(v):
            return re.sub(r'[^A-Z0-9]+', '', str(v or '').upper())

        inv_norm = _norm_invoice(invoice_number)
        sup_tax_norm = _norm_tax(supplier_tax_number)
        sup_name_norm = str(supplier.name or '').strip().lower()

        possible_dupes = IncomingInvoiceDigest.objects.filter(company=company)
        duplicate = None
        for row in possible_dupes.only('id', 'invoice_number', 'supplier_tax_number', 'supplier_name'):
            if _norm_invoice(row.invoice_number) != inv_norm:
                continue

            row_tax_norm = _norm_tax(getattr(row, 'supplier_tax_number', None))
            row_name_norm = str(getattr(row, 'supplier_name', '') or '').strip().lower()

            same_supplier = False
            if sup_tax_norm:
                same_supplier = (row_tax_norm == sup_tax_norm) or (sup_name_norm and row_name_norm == sup_name_norm)
            else:
                same_supplier = bool(sup_name_norm and row_name_norm == sup_name_norm)

            if same_supplier:
                duplicate = row
                break

        if duplicate:
            return Response({
                'error': 'Ez a bejövő számla már létezik a rendszerben ennél a szállítónál.',
                'code': 'duplicate_incoming_invoice',
                'existing_id': str(duplicate.id),
                'invoice_number': duplicate.invoice_number,
            }, status=status.HTTP_409_CONFLICT)

        def d(v):
            try:
                return Decimal(str(v or 0))
            except Exception:
                return Decimal('0')

        net_total = Decimal('0')
        vat_total = Decimal('0')
        for item in items:
            qty = d(item.get('quantity') or 0)
            unit_price = d(item.get('unit_price') or 0)
            vat_rate = d(item.get('vat_rate') or 0)
            line_net = qty * unit_price
            line_vat = (line_net * vat_rate / Decimal('100'))
            net_total += line_net
            vat_total += line_vat

        net_total = net_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        vat_total = vat_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        try:
            ex_rate = d(exchange_rate or 1)
            if ex_rate <= 0:
                ex_rate = Decimal('1')
        except Exception:
            ex_rate = Decimal('1')

        transaction_id = f"MANUAL-{uuid.uuid4()}"
        digest = IncomingInvoiceDigest.objects.create(
            company=company,
            invoice_number=invoice_number,
            invoice_operation='MANUAL',
            invoice_category=invoice_category,
            invoice_issue_date=issue_date,
            invoice_delivery_date=delivery_date or None,
            due_date=due_date,
            supplier_tax_number=supplier_tax_number,
            supplier_name=supplier.name,
            customer_tax_number=(company.tax_number or company.full_tax_number or company.eu_tax_number or ''),
            customer_name=company.name,
            payment_method=payment_method,
            payment_date=None,
            invoice_appearance='PAPER',
            currency=currency,
            exchange_rate=ex_rate,
            invoice_net_amount=net_total,
            invoice_vat_amount=vat_total,
            transaction_id=transaction_id,
            index=1,
            ins_date=timezone.now(),
            completeness_indicator=True,
            is_approved=False,
            payment_status='unpaid',
            amount_paid=Decimal('0'),
        )

        return Response({
            'success': True,
            'id': str(digest.id),
            'invoice_number': digest.invoice_number,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='incoming/manual_get')
    def get_manual_incoming(self, request):
        from invoices.models import Company, IncomingInvoiceDigest

        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        digest_id = request.data.get('digest_id') or request.data.get('id')

        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not digest_id:
            return Response({'error': 'digest_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        digest = IncomingInvoiceDigest.objects.filter(
            id=digest_id,
            company=company,
            invoice_operation='MANUAL',
        ).first()
        if not digest:
            return Response({'error': 'Kézi bejövő számla nem található'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'success': True,
            'data': {
                'id': str(digest.id),
                'invoice_number': digest.invoice_number,
                'issue_date': digest.invoice_issue_date.isoformat() if digest.invoice_issue_date else None,
                'due_date': digest.due_date.isoformat() if digest.due_date else None,
                'delivery_date': digest.invoice_delivery_date.isoformat() if digest.invoice_delivery_date else None,
                'payment_method': (digest.payment_method or '').upper(),
                'currency': (digest.currency or 'HUF').upper(),
                'exchange_rate': str(digest.exchange_rate) if digest.exchange_rate is not None else '1',
                'supplier_name': digest.supplier_name,
                'supplier_tax_number': digest.supplier_tax_number,
                'net_total': str(digest.invoice_net_amount) if digest.invoice_net_amount is not None else '0',
                'vat_total': str(digest.invoice_vat_amount) if digest.invoice_vat_amount is not None else '0',
                'invoice_category': digest.invoice_category or 'NORMAL',
            }
        })

    @action(detail=False, methods=['post'], url_path='incoming/manual_update')
    def update_manual_incoming(self, request):
        from decimal import Decimal, ROUND_HALF_UP
        from invoices.models import Company, Customer, IncomingInvoiceDigest

        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        digest_id = data.get('digest_id') or data.get('id')
        supplier_id = data.get('customer_id')
        invoice_number = str(data.get('invoice_number') or '').strip()
        issue_date = data.get('issue_date')
        due_date = data.get('due_date')
        delivery_date = data.get('delivery_date')
        payment_method = str(data.get('payment_method') or 'TRANSFER').strip().upper()
        currency = str(data.get('currency') or 'HUF').strip().upper()
        exchange_rate = data.get('exchange_rate')
        items = data.get('items') or []
        invoice_category = str(data.get('invoice_category') or 'NORMAL').strip().upper()

        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not digest_id:
            return Response({'error': 'digest_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not supplier_id:
            return Response({'error': 'Szállító (customer_id) kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not invoice_number:
            return Response({'error': 'Számlaszám kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not issue_date:
            return Response({'error': 'Kibocsátás dátuma kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not due_date:
            return Response({'error': 'Esedékesség dátuma kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(items, list) or not items:
            return Response({'error': 'Legalább egy tétel kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        digest = IncomingInvoiceDigest.objects.filter(
            id=digest_id,
            company=company,
            invoice_operation='MANUAL',
        ).first()
        if not digest:
            return Response({'error': 'Kézi bejövő számla nem található'}, status=status.HTTP_404_NOT_FOUND)

        supplier = Customer.objects.filter(id=supplier_id).first()
        if not supplier:
            return Response({'error': 'Szállító nem található'}, status=status.HTTP_400_BAD_REQUEST)

        supplier_tax_number = (supplier.tax_number or supplier.full_tax_number or supplier.eu_tax_number or '')

        def d(v):
            try:
                return Decimal(str(v or 0))
            except Exception:
                return Decimal('0')

        net_total = Decimal('0')
        vat_total = Decimal('0')
        for item in items:
            qty = d(item.get('quantity') or 0)
            unit_price = d(item.get('unit_price') or 0)
            vat_rate = d(item.get('vat_rate') or 0)
            line_net = qty * unit_price
            line_vat = (line_net * vat_rate / Decimal('100'))
            net_total += line_net
            vat_total += line_vat

        net_total = net_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        vat_total = vat_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        try:
            ex_rate = d(exchange_rate or 1)
            if ex_rate <= 0:
                ex_rate = Decimal('1')
        except Exception:
            ex_rate = Decimal('1')

        digest.invoice_number = invoice_number
        digest.invoice_category = invoice_category
        digest.invoice_issue_date = issue_date
        digest.invoice_delivery_date = delivery_date or None
        digest.due_date = due_date
        digest.supplier_tax_number = supplier_tax_number
        digest.supplier_name = supplier.name
        digest.payment_method = payment_method
        digest.currency = currency
        digest.exchange_rate = ex_rate
        digest.invoice_net_amount = net_total
        digest.invoice_vat_amount = vat_total
        digest.save(update_fields=[
            'invoice_number', 'invoice_category', 'invoice_issue_date', 'invoice_delivery_date',
            'due_date', 'supplier_tax_number', 'supplier_name', 'payment_method',
            'currency', 'exchange_rate', 'invoice_net_amount', 'invoice_vat_amount'
        ])

        return Response({
            'success': True,
            'id': str(digest.id),
            'invoice_number': digest.invoice_number,
        })

    @action(detail=False, methods=['post'], url_path='incoming/manual_delete')
    def delete_manual_incoming(self, request):
        from invoices.models import Company, IncomingInvoiceDigest

        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        digest_id = request.data.get('digest_id') or request.data.get('id')

        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not digest_id:
            return Response({'error': 'digest_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        digest = IncomingInvoiceDigest.objects.filter(
            id=digest_id,
            company=company,
            invoice_operation='MANUAL',
        ).first()
        if not digest:
            return Response({'error': 'Kézi bejövő számla nem található'}, status=status.HTTP_404_NOT_FOUND)

        digest.delete()
        return Response({'success': True})

    @action(detail=False, methods=['post'], url_path='incoming/manual-delete')
    def delete_manual_incoming_alias(self, request):
        return self.delete_manual_incoming(request)

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
        external_outgoing = str(request.data.get('external_outgoing') or request.query_params.get('external_outgoing') or '').strip().lower() in ('1', 'true', 'yes')
        nav_direction = 'OUTBOUND' if external_outgoing else 'INBOUND'
        force_refresh = str(request.data.get('force') or request.query_params.get('force') or '').strip().lower() in ('1', 'true', 'yes')
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
                if external_outgoing:
                    dqs = dqs.filter(customer_tax_number=supplier_tax_number)
                else:
                    dqs = dqs.filter(supplier_tax_number=supplier_tax_number)
            digest = dqs.order_by('-ins_date').first()
            if digest and getattr(digest, 'index', None):
                digest_index = int(digest.index)
            if not supplier_tax_number:
                if external_outgoing and getattr(digest, 'customer_tax_number', None):
                    supplier_tax_number_fallback = digest.customer_tax_number
                elif getattr(digest, 'supplier_tax_number', None):
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
                                        if external_outgoing:
                                            res = nav_service.query_invoice_data(nav_direction, invoice_number, None, bi)
                                        else:
                                            res = nav_service.query_invoice_data(nav_direction, invoice_number, stn, bi)
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
                                                                details = conflict.get('differences') or conflict.get('changes') or conflict
                                                                logger.warning(f"Beszállító adatok eltérnek ({supplier_tax_number}): {details}")
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
            if external_outgoing:
                res = nav_service.query_invoice_data(nav_direction, invoice_number, None, digest_index)
            else:
                res = nav_service.query_invoice_data(nav_direction, invoice_number, stn_try, digest_index)
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
                        if external_outgoing:
                            res2 = nav_service.query_invoice_data(nav_direction, invoice_number, None, bi)
                        else:
                            res2 = nav_service.query_invoice_data(nav_direction, invoice_number, stn, bi)
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
                            details = conflict.get('differences') or conflict.get('changes') or conflict
                            logger.warning(f"Beszállító adatok eltérnek ({supplier_tax_number}): {details}")
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

        # Ensure supplier auto-register/update also runs for cached XML responses.
        # (Previously this path could be skipped when XML came straight from cache.)
        if xml_text and not external_outgoing:
            try:
                customer, conflict = auto_register_or_update_supplier(company, xml_text)
                if conflict:
                    details = conflict.get('differences') or conflict.get('changes') or conflict
                    logger.warning(f"Beszállító auto-regisztráció/frissítés ({supplier_tax_number or invoice_number}): {details}")
            except Exception as e:
                logger.error(f"Hiba a beszállító auto-regisztráció során (cache path): {e}")

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
        external_outgoing = str(request.data.get('external_outgoing') or '').strip().lower() in ('1', 'true', 'yes')
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
            if external_outgoing:
                qs = qs.filter(customer_tax_number=supplier_tax_number)
            else:
                qs = qs.filter(supplier_tax_number=supplier_tax_number)
        obj = qs.order_by('-ins_date').first()
        if not obj:
            return Response({'error': 'Számla nem található'}, status=status.HTTP_404_NOT_FOUND)
        obj.payment_method = payment_method
        update_fields = ['payment_method']
        # Auto-settle non-transfer methods (cash, card, voucher, other, utanvet)
        if payment_method.lower() in ('cash', 'card', 'voucher', 'other', 'utanvet'):
            if not obj.payment_date:
                # Payment date = issue date (keltezés dátuma)
                obj.payment_date = obj.invoice_issue_date
                update_fields.append('payment_date')
            obj.payment_status = 'paid'
            update_fields.append('payment_status')
        obj.save(update_fields=update_fields)
        return Response({'success': True, 'payment_method': obj.payment_method})

    @action(detail=False, methods=['post'], url_path='incoming/set_approval')
    def set_incoming_approval(self, request):
        """Approve or revoke approval for an incoming invoice digest."""
        from invoices.models import IncomingInvoiceDigest, Company, SystemUser
        from django.utils import timezone

        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        invoice_number = request.data.get('invoice_number') or ''
        supplier_tax_number = request.data.get('supplier_tax_number') or None
        external_outgoing = str(request.data.get('external_outgoing') or '').strip().lower() in ('1', 'true', 'yes')
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
            if external_outgoing:
                qs = qs.filter(customer_tax_number=supplier_tax_number)
            else:
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

    @action(detail=False, methods=['post'], url_path='incoming/external-cz-backfill')
    def backfill_external_cz_series(self, request):
        """Backfill CZ (or custom prefix) external OUTBOUND invoices by invoice number range.
        Params:
        - company_id: required
        - year: required (e.g. 2025)
        - from_seq: optional default 1
        - to_seq: optional default 999
        - prefix: optional default 'CZ'
        """
        from invoices.models import CompanyNAVConfiguration, Company, IncomingInvoiceDigest
        import xml.etree.ElementTree as ET
        import base64
        import gzip
        import io
        import re
        from decimal import Decimal
        from datetime import datetime

        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        year_raw = request.data.get('year')
        prefix = str(request.data.get('prefix') or 'CZ').strip().upper()
        from_seq_raw = request.data.get('from_seq') or 1
        to_seq_raw = request.data.get('to_seq') or 999

        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            year = int(year_raw)
        except Exception:
            return Response({'error': 'year kötelező és szám kell legyen'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            from_seq = int(from_seq_raw)
            to_seq = int(to_seq_raw)
        except Exception:
            return Response({'error': 'from_seq/to_seq szám kell legyen'}, status=status.HTTP_400_BAD_REQUEST)
        if from_seq < 1 or to_seq < from_seq:
            return Response({'error': 'Hibás tartomány: from_seq <= to_seq és from_seq >= 1'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

        cfg = CompanyNAVConfiguration.objects.filter(company_id=company_id, is_active=True).order_by('-is_default').first()
        if not cfg:
            return Response({'error': 'Nincs aktív NAV konfiguráció a céghez'}, status=status.HTTP_400_BAD_REQUEST)

        nav_service = NAVService(cfg)

        def _find_any(root_el, local):
            for el in root_el.iter():
                tag = el.tag
                if tag == local or (isinstance(tag, str) and tag.endswith('}' + local)):
                    return el
            return None

        def _text_any(root_el, local):
            el = _find_any(root_el, local)
            return (el.text or '').strip() if el is not None and el.text else None

        def _parse_date(val):
            if not val:
                return None
            try:
                if 'T' in val:
                    return datetime.fromisoformat(val.replace('Z', '+00:00')).date()
                return datetime.strptime(val[:10], '%Y-%m-%d').date()
            except Exception:
                return None

        series_pattern = re.compile(r'^\s*' + re.escape(prefix) + r'\s*' + str(year) + r'\s*/\s*(\d{1,5})\s*$', flags=re.IGNORECASE)

        def _extract_seq(invoice_no):
            if not invoice_no:
                return None
            m = series_pattern.match(str(invoice_no))
            if not m:
                return None
            try:
                n = int(m.group(1))
                return n if from_seq <= n <= to_seq else None
            except Exception:
                return None

        def _existing_set():
            nums = set()
            marker = f"{prefix} {year}/"
            qs = IncomingInvoiceDigest.objects.filter(company=company, invoice_number__icontains=marker)
            for inv_no in qs.values_list('invoice_number', flat=True):
                seq = _extract_seq(inv_no)
                if seq is not None:
                    nums.add(seq)
            return nums

        def _decode_invoice_xml(wrapper_xml):
            root = ET.fromstring(wrapper_xml)
            invoice_data_el = _find_any(root, 'invoiceData')
            if invoice_data_el is None or not (invoice_data_el.text or '').strip():
                return None
            raw = base64.b64decode((invoice_data_el.text or '').strip())
            compressed = str(_text_any(root, 'compressedContentIndicator') or '').lower() == 'true'
            if compressed:
                try:
                    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
                        raw = gz.read()
                except Exception:
                    pass
            return raw.decode('utf-8', errors='replace')

        def _upsert_invoice(candidate_invoice_number):
            try:
                res = nav_service.query_invoice_data('OUTBOUND', candidate_invoice_number, None, None)
            except Exception:
                return False, 'query_exception'
            if not res.get('success'):
                return False, 'query_error'
            wrapper = res.get('response') or ''
            if not wrapper:
                return False, 'empty_wrapper'
            try:
                decoded_xml = _decode_invoice_xml(wrapper)
            except Exception:
                return False, 'decode_error'
            if not decoded_xml:
                return False, 'no_invoice_data'
            try:
                root = ET.fromstring(decoded_xml)
            except Exception:
                return False, 'invoice_xml_parse_error'

            invoice_number = _text_any(root, 'invoiceNumber') or candidate_invoice_number
            seq = _extract_seq(invoice_number)
            if seq is None:
                return False, 'not_target_series'

            issue_date = _parse_date(_text_any(root, 'invoiceIssueDate'))
            delivery_date = _parse_date(_text_any(root, 'invoiceDeliveryDate'))
            due_date = _parse_date(_text_any(root, 'paymentDueDate') or _text_any(root, 'dueDate') or _text_any(root, 'paymentDate'))
            supplier_name = _text_any(root, 'supplierName')
            customer_name = _text_any(root, 'customerName')
            payment_method = _text_any(root, 'paymentMethod')
            invoice_category = _text_any(root, 'invoiceCategory')
            invoice_appearance = _text_any(root, 'invoiceAppearance')
            currency = _text_any(root, 'invoiceCurrency') or _text_any(root, 'currency')
            supplier_tax = _text_any(root, 'supplierTaxNumber') or _text_any(root, 'taxpayerId')
            customer_tax = _text_any(root, 'customerTaxNumber')
            transaction_id = _text_any(root, 'transactionId') or f'OUTBOUND_MANUAL::{invoice_number}'

            net = _text_any(root, 'invoiceNetAmount')
            vat = _text_any(root, 'invoiceVatAmount')
            try:
                net = Decimal(net) if net is not None else None
            except Exception:
                net = None
            try:
                vat = Decimal(vat) if vat is not None else None
            except Exception:
                vat = None

            obj, created = IncomingInvoiceDigest.objects.get_or_create(
                company=company,
                invoice_number=invoice_number,
                transaction_id=transaction_id,
                defaults={
                    'invoice_operation': _text_any(root, 'invoiceOperation') or 'CREATE',
                    'invoice_category': invoice_category,
                    'invoice_issue_date': issue_date,
                    'invoice_delivery_date': delivery_date,
                    'due_date': due_date,
                    'supplier_tax_number': supplier_tax,
                    'supplier_name': supplier_name,
                    'customer_tax_number': customer_tax,
                    'customer_name': customer_name,
                    'payment_method': payment_method,
                    'invoice_appearance': invoice_appearance,
                    'currency': currency,
                    'invoice_net_amount': net,
                    'invoice_vat_amount': vat,
                    'index': 1,
                    'completeness_indicator': True,
                }
            )

            if created:
                return True, 'created'

            changed = False
            for k, v in {
                'invoice_category': invoice_category,
                'invoice_issue_date': issue_date,
                'invoice_delivery_date': delivery_date,
                'due_date': due_date,
                'supplier_tax_number': supplier_tax,
                'supplier_name': supplier_name,
                'customer_tax_number': customer_tax,
                'customer_name': customer_name,
                'payment_method': payment_method,
                'invoice_appearance': invoice_appearance,
                'currency': currency,
                'invoice_net_amount': net,
                'invoice_vat_amount': vat,
            }.items():
                if v is not None and getattr(obj, k) != v:
                    setattr(obj, k, v)
                    changed = True
            if changed:
                obj.save()
                return True, 'updated'
            return True, 'existing'

        existing_before = _existing_set()
        missing_before = [n for n in range(from_seq, to_seq + 1) if n not in existing_before]

        created_count = 0
        updated_count = 0
        existing_count = 0
        failed = []

        for seq in missing_before:
            done = False
            candidates = [
                f'{prefix} {year}/{seq}',
                f'{prefix} {year}/{seq:02d}',
                f'{prefix}{year}/{seq}',
                f'{prefix}{year}/{seq:02d}',
            ]
            seen = set()
            unique_candidates = []
            for c in candidates:
                if c not in seen:
                    seen.add(c)
                    unique_candidates.append(c)

            last_code = None
            for candidate in unique_candidates:
                ok, code = _upsert_invoice(candidate)
                last_code = code
                if ok:
                    if code == 'created':
                        created_count += 1
                    elif code == 'updated':
                        updated_count += 1
                    else:
                        existing_count += 1
                    done = True
                    break
            if not done:
                failed.append({'seq': seq, 'reason': last_code or 'unknown'})

        existing_after = _existing_set()
        missing_after = [n for n in range(from_seq, to_seq + 1) if n not in existing_after]

        return Response({
            'success': True,
            'prefix': prefix,
            'year': year,
            'from_seq': from_seq,
            'to_seq': to_seq,
            'missing_before_count': len(missing_before),
            'missing_before': missing_before,
            'created_count': created_count,
            'updated_count': updated_count,
            'existing_count': existing_count,
            'failed_count': len(failed),
            'failed': failed,
            'missing_after_count': len(missing_after),
            'missing_after': missing_after,
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
                        else:
                            details = result.get('differences') or result.get('changes') or result
                            logger.warning(f"Beszállító adatok eltérnek ({d.supplier_tax_number}): {details}")
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

    def _resolve_company_from_request(self, request):
        company = getattr(request, 'company', None)
        if company:
            return company

        cid = (
            request.data.get('company')
            or request.query_params.get('company')
            or request.data.get('company_id')
            or request.query_params.get('company_id')
        )
        if cid in (None, '', 'undefined', 'null', 'None'):
            return None
        try:
            return Company.objects.filter(id=cid).first()
        except (ValidationError, ValueError, TypeError):
            return None

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
        company = self._resolve_company_from_request(request)
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
        try:
            smtp_port = int(val('smtp_port', 587) or 587)
        except (TypeError, ValueError):
            return Response({"success": False, "error": "Érvénytelen smtp_port"}, status=status.HTTP_400_BAD_REQUEST)
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
        except ssl.SSLCertVerificationError as e:
            try:
                server.quit()
            except Exception:
                pass
            return Response(
                {
                    "success": False,
                    "error": "A levelezőszerver SSL tanúsítványa nem megbízható (önaláírt vagy hibás lánc).",
                    "details": str(e),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except smtplib.SMTPAuthenticationError as e:
            try:
                server.quit()
            except Exception:
                pass
            return Response(
                {
                    "success": False,
                    "error": "SMTP hitelesítési hiba (felhasználónév/jelszó).",
                    "details": str(e),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, smtplib.SMTPHeloError, smtplib.SMTPNotSupportedError, TimeoutError, OSError) as e:
            try:
                server.quit()
            except Exception:
                pass
            return Response(
                {
                    "success": False,
                    "error": "SMTP kapcsolódási vagy TLS hiba.",
                    "details": str(e),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except smtplib.SMTPException as e:
            try:
                server.quit()
            except Exception:
                pass
            return Response(
                {
                    "success": False,
                    "error": "SMTP hiba.",
                    "details": str(e),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
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
        company = self._resolve_company_from_request(request)
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
        try:
            imap_port = int(val('imap_port', 993) or 993)
        except (TypeError, ValueError):
            return Response({"success": False, "error": "Érvénytelen imap_port"}, status=status.HTTP_400_BAD_REQUEST)
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
        company = self._resolve_company_from_request(request)
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
        try:
            imap_port = int(val('imap_port', 993) or 993)
        except (TypeError, ValueError):
            return Response({"success": False, "error": "Érvénytelen imap_port"}, status=status.HTTP_400_BAD_REQUEST)
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


class EmailTemplateViewSet(viewsets.ModelViewSet):
    queryset = EmailTemplate.objects.select_related('company').all()
    serializer_class = EmailTemplateSerializer
    permission_classes = []

    def get_queryset(self):
        qs = EmailTemplate.objects.select_related('company').all()
        company_id = (
            self.request.query_params.get('company_id')
            or self.request.query_params.get('company')
            or (getattr(self.request, 'company', None) and str(self.request.company.id))
        )
        if company_id:
            qs = qs.filter(company_id=company_id)
        return qs

    def perform_create(self, serializer):
        company = serializer.validated_data.get('company')
        if not company:
            req_company = getattr(self.request, 'company', None)
            if req_company:
                serializer.save(company=req_company)
                return
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        required_types = {
            EmailTemplate.TEMPLATE_INVOICE_SEND,
            EmailTemplate.TEMPLATE_ARREARS,
            EmailTemplate.TEMPLATE_REMINDER_1,
            EmailTemplate.TEMPLATE_REMINDER_2,
            EmailTemplate.TEMPLATE_LEGAL,
            EmailTemplate.TEMPLATE_PAYMENT_ORDER,
            EmailTemplate.TEMPLATE_LITIGATION,
        }
        if obj.template_type in required_types:
            return Response(
                {'error': 'A kötelező sablon típusok nem törölhetők.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def ensure_defaults(self, request):
        company = getattr(request, 'company', None)
        company_id = request.data.get('company_id') or request.data.get('company') or request.query_params.get('company_id')
        if not company and company_id:
            try:
                company = Company.objects.filter(id=company_id).first()
            except (ValidationError, ValueError, TypeError):
                company = None
        if not company:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        ces = CompanyEmailSettings.objects.filter(company=company).first()

        created = []
        language_maps = {
            'hu': DEFAULT_EMAIL_TEMPLATE_MAP,
            'en': DEFAULT_EMAIL_TEMPLATE_MAP_EN,
        }

        for language, defaults_map in language_maps.items():
            for template_type, defaults in defaults_map.items():
                subject_template = defaults.get('subject_template') or ''
                body_template = defaults.get('body_template') or ''

                if template_type == EmailTemplate.TEMPLATE_INVOICE_SEND and ces:
                    if language == 'en':
                        subject_template = (getattr(ces, 'subject_template_en', None) or subject_template or '').strip()
                        body_template = (getattr(ces, 'body_template_en', None) or body_template or '').strip()
                    else:
                        subject_template = (getattr(ces, 'default_subject_template', None) or subject_template or '').strip()
                        body_template = (getattr(ces, 'default_body_template', None) or body_template or '').strip()
                elif template_type == EmailTemplate.TEMPLATE_ARREARS and ces and language == 'hu':
                    subject_template = (getattr(ces, 'arrears_subject_template', None) or subject_template or '').strip()
                    body_template = (getattr(ces, 'arrears_body_template', None) or body_template or '').strip()

                obj, was_created = EmailTemplate.objects.get_or_create(
                    company=company,
                    template_type=template_type,
                    language=language,
                    defaults={
                        'name': defaults.get('name') or template_type,
                        'subject_template': subject_template,
                        'body_template': body_template,
                        'is_active': True,
                    }
                )
                if was_created:
                    created.append(str(obj.id))

                expected_name = defaults.get('name') or template_type
                update_fields = []
                if obj.name != expected_name:
                    obj.name = expected_name
                    update_fields.append('name')
                if not obj.subject_template:
                    obj.subject_template = subject_template
                    update_fields.append('subject_template')
                if not obj.body_template:
                    obj.body_template = body_template
                    update_fields.append('body_template')
                if update_fields:
                    obj.save(update_fields=update_fields)
        return Response({'success': True, 'created_count': len(created), 'created_ids': created})


class EmailSignatureViewSet(viewsets.ModelViewSet):
    queryset = EmailSignature.objects.select_related('company').all()
    serializer_class = EmailSignatureSerializer
    permission_classes = []

    def get_queryset(self):
        qs = EmailSignature.objects.select_related('company').all()
        company_id = (
            self.request.query_params.get('company_id')
            or self.request.query_params.get('company')
            or (getattr(self.request, 'company', None) and str(self.request.company.id))
        )
        if company_id:
            qs = qs.filter(company_id=company_id)
        return qs

    def perform_create(self, serializer):
        company = serializer.validated_data.get('company')
        if not company:
            req_company = getattr(self.request, 'company', None)
            if req_company:
                obj = serializer.save(company=req_company)
                if obj.is_default:
                    EmailSignature.objects.filter(company=obj.company, is_default=True).exclude(id=obj.id).update(is_default=False)
                return
        obj = serializer.save()
        if obj.is_default:
            EmailSignature.objects.filter(company=obj.company, is_default=True).exclude(id=obj.id).update(is_default=False)

    def perform_update(self, serializer):
        obj = serializer.save()
        if obj.is_default:
            EmailSignature.objects.filter(company=obj.company, is_default=True).exclude(id=obj.id).update(is_default=False)

    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        obj = self.get_object()
        EmailSignature.objects.filter(company=obj.company, is_default=True).exclude(id=obj.id).update(is_default=False)
        if not obj.is_default:
            obj.is_default = True
            obj.save(update_fields=['is_default'])
        return Response({'success': True})


class CronJobConfigurationViewSet(viewsets.ModelViewSet):
    queryset = CronJobConfiguration.objects.all()
    serializer_class = CronJobConfigurationSerializer
    permission_classes = []

    def get_queryset(self):
        return CronJobConfiguration.objects.all().order_by('name')

    def create(self, request, *args, **kwargs):
        return Response({'error': 'Új cron job itt nem hozható létre.'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
        return Response({'error': 'Cron job törlése nem engedélyezett.'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def perform_update(self, serializer):
        user = request_user = getattr(self.request, 'user', None)
        if user is None or not getattr(request_user, 'is_authenticated', False):
            serializer.save(updated_by=None)
            return
        serializer.save(updated_by=user)


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
        allowed_company_ids = _get_system_user_allowed_company_ids(self.request)
        if allowed_company_ids:
            queryset = queryset.filter(id__in=allowed_company_ids)
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
        queryset = InvoiceBlock.objects.select_related('company', 'nav_configuration', 'default_vat_type').all()
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

    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Toggle default status for company NAV configuration.
        If already default, removes it. If not default, sets it as default (clearing ALL others system-wide).
        Only ONE default configuration is allowed across all companies.
        """
        cfg = self.get_object()

        if cfg.is_default:
            # Remove default status
            cfg.is_default = False
            cfg.save(update_fields=['is_default', 'updated_at'])
            message = 'Alapértelmezett NAV konfiguráció eltávolítva'
        else:
            # Set as default and clear ALL others (system-wide, not just company)
            CompanyNAVConfiguration.objects.all().update(is_default=False)
            cfg.is_default = True
            if not cfg.is_active:
                cfg.is_active = True
                cfg.save(update_fields=['is_default', 'is_active', 'updated_at'])
            else:
                cfg.save(update_fields=['is_default', 'updated_at'])
            message = 'Alapértelmezett NAV konfiguráció beállítva'

        return Response({
            'message': message,
            'id': str(cfg.id),
            'company_id': str(cfg.company_id),
            'is_default': cfg.is_default,
        })


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


class CashRegisterViewSet(viewsets.ModelViewSet):
    queryset = CashRegister.objects.select_related('company').all()
    serializer_class = CashRegisterSerializer
    permission_classes = []

    def get_queryset(self):
        qs = super().get_queryset()
        company_id = self.request.query_params.get('company_id') or self.request.query_params.get('company')
        if company_id:
            qs = qs.filter(company_id=company_id)
        return qs

    def perform_create(self, serializer):
        user = self.request.user if getattr(self.request, 'user', None) and self.request.user.is_authenticated else None
        serializer.save(created_by=user)


class CashRegisterTransactionViewSet(viewsets.ModelViewSet):
    queryset = CashRegisterTransaction.objects.select_related('company', 'cash_register', 'invoice', 'incoming_invoice').all()
    serializer_class = CashRegisterTransactionSerializer
    permission_classes = []
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        company_id = self.request.query_params.get('company_id') or self.request.query_params.get('company')
        cash_register_id = self.request.query_params.get('cash_register_id') or self.request.query_params.get('cash_register')
        if company_id:
            qs = qs.filter(company_id=company_id)
        if cash_register_id:
            qs = qs.filter(cash_register_id=cash_register_id)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user if getattr(self.request, 'user', None) and self.request.user.is_authenticated else None
        serializer.save(created_by=user)


class VATTypeViewSet(viewsets.ModelViewSet):
    queryset = VATType.objects.all()
    serializer_class = VATTypeSerializer
    permission_classes = []


class BankStatementViewSet(viewsets.ModelViewSet):
    queryset = BankStatement.objects.all().select_related('company', 'bank_account')
    serializer_class = BankStatementSerializer
    permission_classes = []

    NAV_PROGRESS_STATUSES = {'submitted_to_nav', 'nav_processed', 'nav_rejected'}

    def _is_effectively_paid_outgoing(self, invoice, paid_amount):
        try:
            gross = decimal.Decimal(str(invoice.total_gross_amount or 0))
            paid = decimal.Decimal(str(paid_amount or 0))
        except Exception:
            return False
        currency = str(getattr(invoice, 'currency', '')).upper()
        payment_method = str(getattr(invoice, 'payment_method', '')).lower()
        payable = gross
        if currency == 'HUF' and payment_method in ('cash', 'cod'):
            payable = (gross / decimal.Decimal('5')).quantize(decimal.Decimal('1'), rounding=decimal.ROUND_HALF_UP) * decimal.Decimal('5')
        tolerance = decimal.Decimal('5.0') if currency == 'HUF' else decimal.Decimal('0.01')
        return (payable - paid) < tolerance

    def _normalize_bank_statement_item_signs(self, statement):
        fixed = 0
        if not statement:
            return fixed

        company = getattr(statement, 'company', None)
        if not company:
            return fixed

        company_tax_base = re.sub(r'\D+', '', str(getattr(company, 'tax_number', None) or getattr(company, 'full_tax_number', None) or getattr(company, 'eu_tax_number', None) or ''))
        company_name_norm = str(getattr(company, 'name', None) or '').strip().lower()

        def _is_external_outgoing_incoming(inv):
            if not inv:
                return False
            supplier_tax = re.sub(r'\D+', '', str(getattr(inv, 'supplier_tax_number', None) or ''))
            supplier_name = str(getattr(inv, 'supplier_name', None) or '').strip().lower()
            if company_tax_base and supplier_tax and supplier_tax.startswith(company_tax_base):
                return True
            if company_name_norm and supplier_name and company_name_norm in supplier_name:
                return True
            return False

        for item in statement.items.select_related('invoice', 'incoming_invoice').all():
            try:
                amount = decimal.Decimal(str(item.amount or 0))
            except Exception:
                amount = decimal.Decimal('0')
            amount_abs = abs(amount)
            expected = amount

            if item.invoice_id:
                expected = amount_abs
            elif item.incoming_invoice_id:
                expected = amount_abs if _is_external_outgoing_incoming(item.incoming_invoice) else -amount_abs

            if expected != amount:
                item.amount = expected
                item.save(update_fields=['amount'])
                fixed += 1

        return fixed

    def get_queryset(self):
        qs = super().get_queryset()
        company_id = self.request.query_params.get('company')
        bank_account_id = self.request.query_params.get('bank_account')
        if company_id:
            qs = qs.filter(company_id=company_id)
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)
        return qs.order_by('-statement_date', '-created_at')

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self._normalize_bank_statement_item_signs(instance)
        except Exception:
            pass
        serializer = self.get_serializer(instance)
        data = dict(serializer.data)

        reopen_preview = str(request.query_params.get('reopen_preview', '0')).lower() in ('1', 'true', 'yes')
        if not reopen_preview:
            return Response(data)

        preview_items = []
        _reopen_source_file_token = None
        _reopen_source_file_name = ''
        try:
            note = str(getattr(instance, 'note', '') or '')
            match = re.search(r'\[\[IMPORT_META:(.*?)\]\]', note, flags=re.S)
            if match:
                meta = json.loads(match.group(1))
                if isinstance(meta, dict) and isinstance(meta.get('preview_items'), list):
                    preview_items = meta.get('preview_items')
                if isinstance(meta, dict):
                    _reopen_source_file_token = meta.get('xml_file_token') or None
                    _reopen_source_file_name = str(meta.get('xml') or '')
        except Exception:
            preview_items = []

        if not preview_items:
            # Fallback for older statements without stored preview metadata.
            preview_items = []
            for bsi in instance.items.select_related('customer', 'invoice', 'incoming_invoice').order_by('created_at'):
                inv = bsi.invoice
                incoming = getattr(bsi, 'incoming_invoice', None)
                proposed_invoice = None
                if inv:
                    proposed_invoice = {
                        'id': str(inv.id),
                        'invoice_number': inv.invoice_number,
                        'type': 'outgoing',
                        'amount': float(abs(bsi.amount or 0)),
                    }
                elif incoming:
                    proposed_invoice = {
                        'id': str(incoming.id),
                        'invoice_number': incoming.invoice_number,
                        'type': 'incoming',
                        'amount': float(abs(bsi.amount or 0)),
                    }

                preview_items.append({
                    'amount': float(bsi.amount or 0),
                    'currency': instance.currency,
                    'value_date': str(instance.statement_date),
                    'remittance': bsi.note or '',
                    'comment': bsi.note or '',
                    'counterparty_account': '',
                    'counterparty_name': bsi.customer.name if bsi.customer_id else '',
                    'proposed_customer': {'id': str(bsi.customer_id), 'name': bsi.customer.name} if bsi.customer_id else None,
                    'proposed_invoice': proposed_invoice,
                    'allocations': [],
                    'approved': True,
                    'pairing_marked_at': bsi.created_at.isoformat() if bsi.created_at else None,
                    'save_bank_account': False,
                    'save_bank_account_marked_at': None,
                    'remove_conflicting_bank_accounts': False,
                })

        # Attempt to recover counterparty_name from the original source file for statements
        # where counterparty_name was not stored in the import metadata (e.g. older imports).
        if _reopen_source_file_token:
            try:
                from django.conf import settings as _dj_settings_src
                import os as _os_src
                _media_root_src = getattr(_dj_settings_src, 'MEDIA_ROOT', None) or _os_src.path.join(_os_src.getcwd(), 'media')
                _src_path = _os_src.path.join(_media_root_src, 'bank_statement_sources', _reopen_source_file_token)
                if _os_src.path.isfile(_src_path):
                    with open(_src_path, 'rb') as _fsrc:
                        _src_content = _fsrc.read()
                    _is_xml_src = (_reopen_source_file_name or '').lower().endswith('.xml') or (
                        _src_content.strip().startswith(b'<') and b'camt.053' in _src_content
                    )
                    _raw_stmts_src = self._parse_camt053_xml(_src_content) if _is_xml_src else self._parse_stm_txt(_src_content)
                    def _norm_acct_digits(s):
                        return re.sub(r'\D+', '', str(s or ''))[:20]
                    # Build multi-keyed lookup for counterparty name recovery:
                    #   1. (acct_digits, value_date) — most precise
                    #   2. acct_digits alone          — for stored items that lack value_date
                    #   3. (rounded_amount, value_date) — when no account stored
                    #   4. rounded_amount alone        — last resort (same-amount transactions
                    #                                    within the statement might collide, but
                    #                                    the first match is usually correct)
                    _src_by_acct_date = {}  # (acct, date) -> name
                    _src_by_acct      = {}  # acct -> name  (date-agnostic fallback)
                    _src_by_amt_date  = {}  # (amt, date) -> name
                    _src_by_amt       = {}  # amt -> name   (date-agnostic last resort)
                    for _rs_src in _raw_stmts_src:
                        for _ri_src in (_rs_src.get('items') or []):
                            _cp = (_ri_src.get('counterparty_name') or '').strip()
                            if not _cp:
                                continue
                            try:
                                _ri_amt_k = str(round(float(_ri_src.get('amount') or 0)))
                            except Exception:
                                _ri_amt_k = '0'
                            _ri_vd_k = str(_ri_src.get('value_date') or _ri_src.get('booking_date') or '').strip()[:10]
                            _ri_acct_k = _norm_acct_digits(_ri_src.get('counterparty_account') or '')
                            if _ri_acct_k:
                                _key_ad = (_ri_acct_k, _ri_vd_k)
                                if _key_ad not in _src_by_acct_date:
                                    _src_by_acct_date[_key_ad] = _cp
                                if _ri_acct_k not in _src_by_acct:
                                    _src_by_acct[_ri_acct_k] = _cp
                            _key_md = (_ri_amt_k, _ri_vd_k)
                            if _key_md not in _src_by_amt_date:
                                _src_by_amt_date[_key_md] = _cp
                            if _ri_amt_k not in _src_by_amt:
                                _src_by_amt[_ri_amt_k] = _cp
                    # Fill missing counterparty_name in preview_items
                    for _pi_src in (preview_items or []):
                        if (_pi_src.get('counterparty_name') or '').strip():
                            continue
                        try:
                            _pi_amt_k = str(round(float(_pi_src.get('amount') or 0)))
                        except Exception:
                            _pi_amt_k = '0'
                        _pi_vd_k = str(_pi_src.get('value_date') or _pi_src.get('booking_date') or '').strip()[:10]
                        _pi_acct_k = _norm_acct_digits(_pi_src.get('counterparty_account') or '')
                        _found_cp = None
                        if _pi_acct_k:
                            # Try with date first, then without date
                            _found_cp = _src_by_acct_date.get((_pi_acct_k, _pi_vd_k))
                            if not _found_cp:
                                _found_cp = _src_by_acct.get(_pi_acct_k)
                        if not _found_cp:
                            # Try amount with date, then without date
                            _found_cp = _src_by_amt_date.get((_pi_amt_k, _pi_vd_k))
                        if not _found_cp and _pi_vd_k == '':
                            # Stored item has no date at all — use amount-only as last resort
                            _found_cp = _src_by_amt.get(_pi_amt_k)
                        if _found_cp:
                            _pi_src['counterparty_name'] = _found_cp
            except Exception:
                pass

        proposal_input = []
        for it in (preview_items or []):
            try:
                amount_val = float(it.get('amount') or 0)
            except Exception:
                amount_val = 0.0
            proposal_input.append({
                'amount': amount_val,
                'currency': it.get('currency') or instance.currency,
                'booking_date': it.get('booking_date') or it.get('value_date') or instance.statement_date,
                'value_date': it.get('value_date') or it.get('booking_date') or instance.statement_date,
                'remittance': it.get('remittance') or it.get('comment') or '',
                'counterparty_name': it.get('counterparty_name') or '',
                'counterparty_account': it.get('counterparty_account') or '',
            })

        try:
            proposals = self._propose_matches(instance.company, instance.currency or 'HUF', proposal_input)
        except Exception:
            proposals = []

        customer_ids = set()
        for _it in (preview_items or []):
            pc = _it.get('proposed_customer') if isinstance(_it, dict) else None
            if isinstance(pc, dict) and pc.get('id'):
                customer_ids.add(str(pc.get('id')))
        for _p in (proposals or []):
            if not isinstance(_p, dict):
                continue
            pc = _p.get('proposed_customer')
            if isinstance(pc, dict) and pc.get('id'):
                customer_ids.add(str(pc.get('id')))

        customer_name_map = {}
        if customer_ids:
            try:
                for c in Customer.objects.filter(id__in=list(customer_ids)).only('id', 'name'):
                    customer_name_map[str(c.id)] = c.name
            except Exception:
                customer_name_map = {}

        outgoing_refs = set()
        incoming_refs = set()

        def _collect_invoice_ref(inv_type, inv_id):
            ref = str(inv_id or '').strip()
            if not ref:
                return
            if str(inv_type or 'outgoing') == 'incoming':
                incoming_refs.add(ref)
            else:
                outgoing_refs.add(ref)

        for _it in (preview_items or []):
            if not isinstance(_it, dict):
                continue
            pi = _it.get('proposed_invoice')
            if isinstance(pi, dict):
                _collect_invoice_ref(pi.get('type'), pi.get('id') or pi.get('invoice_number'))
            for alloc in (_it.get('allocations') or []):
                if not isinstance(alloc, dict):
                    continue
                _collect_invoice_ref(alloc.get('invoice_type'), alloc.get('invoice_id') or alloc.get('invoice_number'))

        for _p in (proposals or []):
            if not isinstance(_p, dict):
                continue
            pi = _p.get('proposed_invoice')
            if isinstance(pi, dict):
                _collect_invoice_ref(pi.get('type'), pi.get('id') or pi.get('invoice_number'))

        outgoing_lookup = {}
        incoming_lookup = {}

        def _split_uuid_refs(refs):
            import uuid
            as_uuid = []
            as_text = []
            for ref in refs:
                sval = str(ref or '').strip()
                if not sval:
                    continue
                try:
                    uuid.UUID(sval)
                    as_uuid.append(sval)
                except Exception:
                    as_text.append(sval)
            return as_uuid, as_text

        out_uuid, out_text = _split_uuid_refs(outgoing_refs)
        if out_uuid or out_text:
            out_q = Invoice.objects.filter(company=instance.company)
            out_filter = Q()
            if out_uuid:
                out_filter |= Q(id__in=out_uuid)
            if out_text:
                out_filter |= Q(invoice_number__in=out_text)
            for inv in out_q.filter(out_filter).select_related('customer').only('id', 'invoice_number', 'customer_id'):
                cust_name = ''
                try:
                    if inv.customer_id and inv.customer:
                        cust_name = inv.customer.name or ''
                except Exception:
                    cust_name = ''
                payload = {
                    'id': str(inv.id),
                    'invoice_number': inv.invoice_number,
                    'type': 'outgoing',
                    'customer_name': cust_name,
                }
                outgoing_lookup[str(inv.id)] = payload
                outgoing_lookup[str(inv.invoice_number or '').strip()] = payload

        in_uuid, in_text = _split_uuid_refs(incoming_refs)
        if in_uuid or in_text:
            in_q = IncomingInvoiceDigest.objects.filter(company=instance.company)
            in_filter = Q()
            if in_uuid:
                in_filter |= Q(id__in=in_uuid)
            if in_text:
                in_filter |= Q(invoice_number__in=in_text)
            for inv in in_q.filter(in_filter).only('id', 'invoice_number', 'invoice_net_amount', 'invoice_vat_amount', 'amount_paid'):
                gross = decimal.Decimal(str((inv.invoice_net_amount or 0) + (inv.invoice_vat_amount or 0)))
                paid = decimal.Decimal(str(inv.amount_paid or 0))
                payload = {
                    'id': str(inv.id),
                    'invoice_number': inv.invoice_number,
                    'type': 'incoming',
                    'amount': float(max(gross - paid, decimal.Decimal('0'))),
                }
                incoming_lookup[str(inv.id)] = payload
                incoming_lookup[str(inv.invoice_number or '').strip()] = payload

        def _enrich_invoice(inv_data):
            if not isinstance(inv_data, dict):
                return inv_data
            inv_type = str(inv_data.get('type') or 'outgoing')
            ref = str(inv_data.get('id') or inv_data.get('invoice_number') or '').strip()
            lookup = incoming_lookup if inv_type == 'incoming' else outgoing_lookup
            found = lookup.get(ref)
            enriched = dict(inv_data)
            if found:
                enriched.setdefault('type', found.get('type'))
                enriched['id'] = enriched.get('id') or found.get('id')
                enriched['invoice_number'] = enriched.get('invoice_number') or found.get('invoice_number')
                if enriched.get('amount') in (None, '') and found.get('amount') is not None:
                    enriched['amount'] = found.get('amount')
                # Propagate customer_name from lookup if not already set
                if not enriched.get('customer_name') and found.get('customer_name'):
                    enriched['customer_name'] = found.get('customer_name')
            return enriched

        def _enrich_allocations(allocs):
            result = []
            for alloc in (allocs or []):
                if not isinstance(alloc, dict):
                    continue
                inv_type = str(alloc.get('invoice_type') or 'outgoing')
                ref = str(alloc.get('invoice_id') or alloc.get('invoice_number') or '').strip()
                lookup = incoming_lookup if inv_type == 'incoming' else outgoing_lookup
                found = lookup.get(ref)
                row = dict(alloc)
                if found:
                    row['invoice_number'] = row.get('invoice_number') or found.get('invoice_number')
                result.append(row)
            return result

        merged_items = []
        for idx, base in enumerate(preview_items or []):
            prop = proposals[idx] if idx < len(proposals) else {}
            is_saved = bool(base.get('approved') or base.get('pairing_marked_at'))

            base_customer = base.get('proposed_customer')
            base_invoice = _enrich_invoice(base.get('proposed_invoice'))
            base_allocations = _enrich_allocations(base.get('allocations') if isinstance(base.get('allocations'), list) else [])
            prop_customer = prop.get('proposed_customer') if isinstance(prop, dict) else None
            prop_invoice = _enrich_invoice(prop.get('proposed_invoice')) if isinstance(prop, dict) else None
            prop_allocations = _enrich_allocations(prop.get('allocations') if isinstance(prop, dict) and isinstance(prop.get('allocations'), list) else [])

            def _normalize_customer(pc):
                if not isinstance(pc, dict):
                    return None
                cid = str(pc.get('id') or '').strip()
                if not cid:
                    return None
                name = str(pc.get('name') or '').strip() or customer_name_map.get(cid, '')
                return {'id': cid, 'name': name}

            base_customer_norm = _normalize_customer(base_customer)
            prop_customer_norm = _normalize_customer(prop_customer)

            merged_items.append({
                'amount': base.get('amount'),
                'currency': base.get('currency') or instance.currency,
                'value_date': base.get('value_date') or base.get('booking_date') or str(instance.statement_date),
                'remittance': base.get('remittance') or base.get('comment') or '',
                'comment': base.get('comment') or base.get('remittance') or '',
                'counterparty_account': base.get('counterparty_account') or '',
                'counterparty_name': base.get('counterparty_name') or '',
                'proposed_customer': prop_customer_norm or base_customer_norm,
                'proposed_invoice': prop_invoice or base_invoice,
                'allocations': prop_allocations if prop_allocations else base_allocations,
                'saved_customer': base_customer_norm,
                'saved_invoice': base_invoice,
                'saved_allocations': base_allocations,
                'approved': bool(base.get('approved') or is_saved),
                'pairing_marked_at': base.get('pairing_marked_at') or None,
                'saved_pairing_marked_at': base.get('pairing_marked_at') or None,
                'save_bank_account': bool(base.get('save_bank_account')),
                'save_bank_account_marked_at': base.get('save_bank_account_marked_at') or None,
                'remove_conflicting_bank_accounts': bool(base.get('remove_conflicting_bank_accounts')),
                'candidates': prop.get('candidates') if isinstance(prop, dict) and isinstance(prop.get('candidates'), list) else [],
                'customer_candidates': prop.get('customer_candidates') if isinstance(prop, dict) and isinstance(prop.get('customer_candidates'), list) else [],
            })

        data['reopen_preview'] = {
            'source_statement_id': str(instance.id),
            'account_id': str(instance.bank_account_id) if instance.bank_account_id else None,
            'account_label': data.get('bank_account_name') or str(instance.bank_account_id or ''),
            'statement_date': str(instance.statement_date),
            'sequence_number': instance.sequence_number,
            'currency': instance.currency,
            'source_file_name': data.get('source_file_name') or None,
            'items': merged_items,
        }

        return Response(data)

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

        global_accounts = []
        for acc in CompanyBankAccount.objects.select_related('company').all():
            normalized_keys = set()
            if acc.iban:
                normalized_keys.add(normalize_acct(acc.iban))
            if acc.account_number:
                normalized_keys.add(normalize_acct(acc.account_number))
            normalized_keys = {k for k in normalized_keys if k}
            if normalized_keys:
                global_accounts.append((acc, normalized_keys))

        mismatch_companies = {}

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
                    detected_company = None
                    for g_acc, keys in global_accounts:
                        if any((key and (key in k or k in key)) for k in keys):
                            detected_company = g_acc.company
                            break

                    if detected_company and str(detected_company.id) != str(company.id):
                        mismatch_companies[str(detected_company.id)] = detected_company.name
                    reason = 'Bankszámla nem található a cégnél'
                    skipped.append({'file': name, 'reason': reason})
                    preview.append({
                        'file': name,
                        'statement_date': str(stmt_date),
                        'currency': None,
                        'creatable': False,
                        'reason': reason,
                        'detected_company_id': str(detected_company.id) if detected_company else None,
                        'detected_company_name': detected_company.name if detected_company else None,
                    })
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
            mismatches = [
                {'company_id': cid, 'company_name': cname}
                for cid, cname in mismatch_companies.items()
            ]
            return Response({'success': True, 'preview': preview, 'counts': counts, 'errors': errors, 'detected_company_mismatches': mismatches})
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

        def first_text(node, paths):
            for path in paths:
                val = get_text(node, path)
                if val:
                    return val
            return None

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

                def append_text(text_value):
                    clean = str(text_value or '').strip()
                    if clean and clean not in remittance_parts:
                        remittance_parts.append(clean)

                ntry_dtls = find(ntry, 'NtryDtls')
                tx_detail_nodes = []
                if ntry_dtls is not None:
                    tx_detail_nodes = findall(ntry_dtls, 'TxDtls') or []

                for tx_dtls in tx_detail_nodes:
                    if tx_dtls is None:
                        continue

                    # Remittance text from all transaction detail rows
                    rmt = find(tx_dtls, 'RmtInf')
                    if rmt:
                        for ustrd in findall(rmt, 'Ustrd'):
                            if ustrd.text:
                                append_text(ustrd.text)
                        append_text(get_text(rmt, 'Strd/AddtlRmtInf'))

                    add_tx_inf = get_text(tx_dtls, 'AddtlTxInf')
                    if add_tx_inf:
                        append_text(add_tx_inf)

                    # Parties / account extraction with broad fallback paths
                    if ind == 'DBIT':
                        preferred_name_paths = [
                            'RltdPties/Cdtr/Nm',
                            'RltdPties/UltmtCdtr/Nm',
                            'RltdPties/Dbtr/Nm',
                            'RltdPties/UltmtDbtr/Nm',
                            'RltdAgts/CdtrAgt/FinInstnId/Nm',
                            'RltdAgts/DbtrAgt/FinInstnId/Nm',
                        ]
                        preferred_acct_paths = [
                            'RltdPties/CdtrAcct/Id/IBAN',
                            'RltdPties/CdtrAcct/Id/Othr/Id',
                            'RltdPties/DbtrAcct/Id/IBAN',
                            'RltdPties/DbtrAcct/Id/Othr/Id',
                        ]
                    else:
                        preferred_name_paths = [
                            'RltdPties/Dbtr/Nm',
                            'RltdPties/UltmtDbtr/Nm',
                            'RltdPties/Cdtr/Nm',
                            'RltdPties/UltmtCdtr/Nm',
                            'RltdAgts/DbtrAgt/FinInstnId/Nm',
                            'RltdAgts/CdtrAgt/FinInstnId/Nm',
                        ]
                        preferred_acct_paths = [
                            'RltdPties/DbtrAcct/Id/IBAN',
                            'RltdPties/DbtrAcct/Id/Othr/Id',
                            'RltdPties/CdtrAcct/Id/IBAN',
                            'RltdPties/CdtrAcct/Id/Othr/Id',
                        ]

                    if not cp_name:
                        cp_name = first_text(tx_dtls, preferred_name_paths)
                    if not cp_acct:
                        cp_acct = first_text(tx_dtls, preferred_acct_paths)

                # Add AddtlNtryInf (Comment/Megjegyzés) if available
                addtl_info = get_text(ntry, 'AddtlNtryInf')
                if addtl_info and addtl_info not in remittance_parts:
                    append_text(addtl_info)

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
        def norm_alnum(s):
            import re
            return re.sub(r'[^A-Z0-9]+', '', str(s or '').upper())
        import unicodedata, difflib, re
        def strip_accents(s: str) -> str:
            if not s:
                return ''
            return ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch))
        def norm_name(s: str) -> str:
            return strip_accents((s or '').lower())
        def normalize_invoice_token(value: str) -> str:
            return re.sub(r'[^A-Z0-9]+', '', str(value or '').upper())
        def is_storno_like(op_value: str, explicit_flag=False) -> bool:
            op = str(op_value or '').upper()
            return bool(explicit_flag) or ('STORNO' in op) or ('STORN' in op) or ('CANCEL' in op)
        def signed_digest_outstanding(inv):
            gross = abs(float((inv.invoice_net_amount or 0) + (inv.invoice_vat_amount or 0)))
            paid = float(inv.amount_paid or 0)
            outstanding = max(gross - paid, 0.0)
            storno_flag = bool(getattr(inv, 'is_storno_invoice', False) or getattr(inv, 'is_storno', False))
            storno_like = is_storno_like(getattr(inv, 'invoice_operation', None), storno_flag)
            return -abs(outstanding) if storno_like else outstanding

        company_tax_base = re.sub(r'\D+', '', str(getattr(company, 'tax_number', None) or getattr(company, 'full_tax_number', None) or getattr(company, 'eu_tax_number', None) or ''))
        company_name = str(getattr(company, 'name', None) or '').strip()
        incoming_base_qs = IncomingInvoiceDigest.objects.filter(company=company)
        if company_tax_base:
            incoming_external_outgoing_qs = incoming_base_qs.filter(
                Q(supplier_tax_number__icontains=company_tax_base) | Q(supplier_name__icontains=company_name)
            )
            incoming_supplier_qs = incoming_base_qs.filter(
                Q(customer_tax_number__icontains=company_tax_base) | Q(customer_tax_number__isnull=True) | Q(customer_tax_number='')
            )
        elif company_name:
            incoming_external_outgoing_qs = incoming_base_qs.filter(supplier_name__icontains=company_name)
            incoming_supplier_qs = incoming_base_qs.exclude(supplier_name__icontains=company_name)
        else:
            incoming_external_outgoing_qs = incoming_base_qs.none()
            incoming_supplier_qs = incoming_base_qs
        # Map accounts to customers
        acct_to_customer = {}
        account_cache = []
        account_qs = CustomerBankAccount.objects.select_related('customer')
        for acc in account_qs:
            iban_alnum = norm_alnum(acc.iban)
            num_alnum = norm_alnum(acc.account_number)
            iban_digits = norm_digits(iban_alnum)
            num_digits = norm_digits(num_alnum)
            if iban_alnum:
                acct_to_customer[iban_alnum] = acc.customer
            if num_alnum:
                acct_to_customer[num_alnum] = acc.customer
            if iban_digits:
                acct_to_customer[iban_digits] = acc.customer
            if num_digits:
                acct_to_customer[num_digits] = acc.customer
            account_cache.append((acc.customer, iban_alnum, num_alnum, iban_digits, num_digits))

        # Preload customers once for fuzzy matching
        all_customers = list(Customer.objects.only('id', 'name'))
        customer_by_id = {str(c.id): c for c in all_customers}
        for idx, it in enumerate(items):
            cp_acct = norm_alnum(it.get('counterparty_account') or '')
            ndig = norm_digits(cp_acct)
            customer = acct_to_customer.get(cp_acct) or acct_to_customer.get(ndig)
            if not customer and ndig:
                for c, iban_alnum, num_alnum, iban_digits, num_digits in account_cache:
                    if (ndig and iban_digits and (ndig.endswith(iban_digits) or iban_digits.endswith(ndig))) or \
                       (ndig and num_digits and (ndig.endswith(num_digits) or num_digits.endswith(ndig))):
                        customer = c
                        break
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
            rem = str(it.get('remittance') or '')
            tokens = []
            # Pattern 0: PREFIX/NNNNN or PREFIX-NNNNN (e.g. G/00002024, G-00002051)
            for m in re.findall(r'([A-Z]{1,4}[-/]\d{4,})', rem):
                v = str(m or '').strip().upper()
                if v:
                    tokens.append(v)
            # Patterns: PREFIX YYYY/NN, PREFIXYYYYNNNN, bare numbers with slashes
            for m in re.findall(r'([A-Z]{1,4}\s?\d{4}/\d{1,6})', rem):
                v = str(m or '').strip().upper()
                if v:
                    tokens.append(v)
            for m in re.findall(r'([A-Z]{1,3}\d{4,10})', rem):
                v = str(m or '').strip().upper()
                if v:
                    tokens.append(v)
            for m in re.findall(r'(\d{4}/\d{1,6})', rem):
                v = str(m or '').strip().upper()
                if v:
                    tokens.append(v)
            seen_tokens = set()
            unique_tokens = []
            for tok in tokens:
                k = tok.upper()
                if k in seen_tokens:
                    continue
                seen_tokens.add(k)
                unique_tokens.append(tok)

            expanded_tokens = []
            seen_expanded = set()
            for tok in unique_tokens:
                raw = str(tok or '').strip().upper()
                if raw and raw not in seen_expanded:
                    seen_expanded.add(raw)
                    expanded_tokens.append(raw)
                compact = re.sub(r'[^A-Z0-9]+', '', raw)
                if compact and compact not in seen_expanded:
                    seen_expanded.add(compact)
                    expanded_tokens.append(compact)
                m_compact = re.match(r'^([A-Z]{1,6})(\d{4})(\d{1,8})$', compact)
                if m_compact:
                    slash_variant = f"{m_compact.group(1)}{m_compact.group(2)}/{m_compact.group(3)}"
                    if slash_variant not in seen_expanded:
                        seen_expanded.add(slash_variant)
                        expanded_tokens.append(slash_variant)
                    spaced_variant = f"{m_compact.group(1)} {m_compact.group(2)}/{m_compact.group(3)}"
                    if spaced_variant not in seen_expanded:
                        seen_expanded.add(spaced_variant)
                        expanded_tokens.append(spaced_variant)
            
            candidates = []
            best_candidate = None

            # Determine direction
            try:
                amt_val = float(it.get('amount') or 0)
            except:
                amt_val = 0
            
            # Search by token
            if expanded_tokens:
                seen_cands = set()
                for token_idx, token in enumerate(expanded_tokens[:12]):
                    token_norm = normalize_invoice_token(token)
                    # Positive bank transaction: prioritize own outgoing invoices, then external outgoing NAV invoices
                    if amt_val >= 0:
                        qs = Invoice.objects.filter(company=company, invoice_number__icontains=token).order_by('-issue_date')[:10]
                        for inv in qs:
                            ckey = f"out:{inv.id}"
                            if ckey in seen_cands:
                                continue
                            seen_cands.add(ckey)
                            outstanding = float((inv.total_gross_amount or 0) - (inv.amount_paid or 0))
                            storno_like = is_storno_like(getattr(inv, 'invoice_operation', None), bool(getattr(inv, 'is_storno_invoice', False)))
                            signed_outstanding = -abs(outstanding) if storno_like else max(outstanding, 0.0)
                            _out_cust = customer_by_id.get(str(inv.customer_id or ''))
                            candidates.append({
                                'id': str(inv.id),
                                'invoice_number': inv.invoice_number,
                                'customer_id': str(inv.customer_id),
                                'customer_name': _out_cust.name if _out_cust else '',
                                'amount': signed_outstanding,
                                'type': 'outgoing',
                                '_token_matched': True,
                                '_token_rank': token_idx,
                                '_token_norm': token_norm,
                                'is_storno_invoice': bool(storno_like),
                            })

                        qs_ext = incoming_external_outgoing_qs.filter(
                            invoice_number__icontains=token,
                        ).order_by('-invoice_issue_date')[:10]
                        for inv in qs_ext:
                            ckey = f"ext:{inv.id}"
                            if ckey in seen_cands:
                                continue
                            seen_cands.add(ckey)
                            outstanding = signed_digest_outstanding(inv)
                            candidates.append({
                                'id': str(inv.id),
                                'invoice_number': inv.invoice_number,
                                'supplier_name': inv.supplier_name,
                                'customer_name': getattr(inv, 'customer_name', None),
                                'customer_tax_number': getattr(inv, 'customer_tax_number', None),
                                'amount': outstanding,
                                'type': 'incoming',
                                'external_outgoing': True,
                                '_token_matched': True,
                                '_token_rank': token_idx,
                                '_token_norm': token_norm,
                                'is_storno_invoice': bool(outstanding < 0),
                            })

                    # Negative bank transaction: incoming supplier invoices
                    if amt_val <= 0:
                        qs_in = incoming_supplier_qs.filter(
                            invoice_number__icontains=token,
                        ).order_by('-invoice_issue_date')[:10]
                        for inv in qs_in:
                            ckey = f"in:{inv.id}"
                            if ckey in seen_cands:
                                continue
                            seen_cands.add(ckey)
                            outstanding = signed_digest_outstanding(inv)
                            candidates.append({
                                'id': str(inv.id),
                                'invoice_number': inv.invoice_number,
                                'supplier_name': inv.supplier_name,
                                'amount': outstanding,
                                'type': 'incoming',
                                '_token_matched': True,
                                '_token_rank': token_idx,
                                '_token_norm': token_norm,
                                'is_storno_invoice': bool(outstanding < 0),
                            })

            has_token_candidates = any(bool(c.get('_token_matched')) for c in candidates)

            # Search by Amount only when remittance token did not hit any invoice
            # (remittance match is primary, amount match is secondary fallback)
            # Skip amount-based matching for very small amounts (bank fees, interest, rounding cents)
            # to avoid accidental matches on invoices with tiny outstanding balances.
            if amt_val != 0 and not has_token_candidates and abs(amt_val) >= 5.0:
                abs_amt = abs(amt_val)
                seen_amount_cands = {
                    f"{str(c.get('type') or '')}:{str(c.get('id') or c.get('invoice_number') or '')}"
                    for c in candidates
                }
                # If negative (payment out) -> IncomingInvoice (Supplier bill)
                # If positive (payment in) -> Invoice (Customer bill)
                
                # Dynamic tolerance: 0.5% of amount, minimum 1.0, maximum 100.0
                # This prevents tiny-amount "false positives" while still catching rounding differences.
                _amt_tol = min(100.0, max(1.0, abs_amt * 0.005))
                if amt_val > 0: # Payment IN -> Invoice
                    qs = Invoice.objects.filter(company=company).order_by('-issue_date')[:100]
                    # Filter for amount match
                    for inv in qs:
                        outstanding = float((inv.total_gross_amount or 0) - (inv.amount_paid or 0))
                        rounded_outstanding = round(outstanding)
                        rounded_paid = round(abs_amt)
                        if abs(outstanding - abs_amt) <= _amt_tol or abs(rounded_outstanding - rounded_paid) <= _amt_tol:
                             key = f"outgoing:{inv.id}"
                             if key in seen_amount_cands:
                                 continue
                             seen_amount_cands.add(key)
                             _out_cust_a = customer_by_id.get(str(inv.customer_id or ''))
                             candidates.append({
                                'id': str(inv.id),
                                'invoice_number': inv.invoice_number,
                                'customer_id': str(inv.customer_id),
                                'customer_name': _out_cust_a.name if _out_cust_a else '',
                                'amount': max(outstanding, 0.0),
                                          'type': 'outgoing',
                                          '_token_matched': False,
                                          '_token_rank': 999,
                                          '_token_norm': '',
                                          'is_storno_invoice': False,
                             })
                    qs_ext = incoming_external_outgoing_qs.order_by('-invoice_issue_date')[:200]
                    for inv in qs_ext:
                        gross = abs(float((inv.invoice_net_amount or 0) + (inv.invoice_vat_amount or 0)))
                        paid = float(inv.amount_paid or 0)
                        outstanding = max(gross - paid, 0.0)
                        rounded_outstanding = round(outstanding)
                        rounded_paid = round(abs_amt)
                        if abs(outstanding - abs_amt) <= _amt_tol or abs(rounded_outstanding - rounded_paid) <= _amt_tol:
                            key = f"incoming:{inv.id}"
                            if key in seen_amount_cands:
                                continue
                            seen_amount_cands.add(key)
                            candidates.append({
                                'id': str(inv.id),
                                'invoice_number': inv.invoice_number,
                                'supplier_name': inv.supplier_name,
                                'customer_name': getattr(inv, 'customer_name', None),
                                'customer_tax_number': getattr(inv, 'customer_tax_number', None),
                                'amount': outstanding,
                                'type': 'incoming',
                                'external_outgoing': True,
                                '_token_matched': False,
                                '_token_rank': 999,
                                '_token_norm': '',
                                'is_storno_invoice': bool(outstanding < 0),
                            })
                elif amt_val < 0: # Payment OUT -> IncomingInvoice
                    qs_in = incoming_supplier_qs.order_by('-invoice_issue_date')[:100]
                    for inv in qs_in:
                        gross = abs(float((inv.invoice_net_amount or 0) + (inv.invoice_vat_amount or 0)))
                        paid = float(inv.amount_paid or 0)
                        outstanding = max(gross - paid, 0.0)
                        if abs(outstanding - abs_amt) <= _amt_tol:
                             key = f"incoming:{inv.id}"
                             if key in seen_amount_cands:
                                 continue
                             seen_amount_cands.add(key)
                             candidates.append({
                                'id': str(inv.id),
                                'invoice_number': inv.invoice_number,
                                'supplier_name': inv.supplier_name,
                                'amount': outstanding,
                                          'type': 'incoming',
                                          '_token_matched': False,
                                          '_token_rank': 999,
                                          '_token_norm': '',
                                          'is_storno_invoice': bool(outstanding < 0),
                             })
            
            # Select best candidate with direction-aware priority
            if candidates:
                abs_amt = abs(amt_val)
                rem_norm = normalize_invoice_token(rem)

                def _pick(preferred_type):
                    pool = [c for c in candidates if c.get('type') == preferred_type]
                    if not pool:
                        return None

                    def _score(c):
                        token_matched = bool(c.get('_token_matched'))
                        token_rank = int(c.get('_token_rank') or 999)
                        token_norm = str(c.get('_token_norm') or '')
                        rem_exact = 0 if (token_norm and rem_norm and token_norm in rem_norm) else 1
                        amount_diff = abs(abs(float(c.get('amount') or 0)) - abs_amt)
                        storno_penalty = 0 if bool(c.get('is_storno_invoice')) else 1
                        return (
                            0 if token_matched else 1,
                            token_rank,
                            rem_exact,
                            amount_diff,
                            storno_penalty,
                        )

                    return sorted(pool, key=_score)[0]

                if amt_val > 0:
                    # Primary: external outgoing NAV invoices (stored as incoming digests). Secondary: own outgoing invoices.
                    best_candidate = _pick('incoming') or _pick('outgoing')
                elif amt_val < 0:
                    best_candidate = _pick('incoming') or _pick('outgoing')
                else:
                    exact_matches = [c for c in candidates if abs((c.get('amount') or 0) - abs_amt) < 1.0]
                    best_candidate = exact_matches[0] if exact_matches else candidates[0]

            # If no direct customer hit, but we found an outgoing invoice candidate,
            # derive customer from that invoice candidate.
            if not customer and best_candidate and best_candidate.get('type') == 'outgoing':
                cid = str(best_candidate.get('customer_id') or '')
                if cid and cid in customer_by_id:
                    customer = customer_by_id[cid]

            # For incoming candidates that actually represent external outgoing invoices,
            # derive customer from candidate customer_name/customer_tax_number.
            if not customer and best_candidate and best_candidate.get('type') == 'incoming' and bool(best_candidate.get('external_outgoing')):
                cand_tax = re.sub(r'\D+', '', str(best_candidate.get('customer_tax_number') or ''))
                if cand_tax:
                    by_tax = next((c for c in all_customers if re.sub(r'\D+', '', str(getattr(c, 'tax_number', '') or '')) == cand_tax), None)
                    if by_tax:
                        customer = by_tax
                if not customer:
                    cand_name = str(best_candidate.get('customer_name') or '').strip()
                    cand_name_norm = norm_name(cand_name)
                    if cand_name_norm:
                        by_exact_name = next((c for c in all_customers if norm_name(c.name) == cand_name_norm), None)
                        if by_exact_name:
                            customer = by_exact_name
                        else:
                            by_contains = next((c for c in all_customers if cand_name_norm in norm_name(c.name) or norm_name(c.name) in cand_name_norm), None)
                            if by_contains:
                                customer = by_contains

            can_auto = bool(best_candidate and (customer or (best_candidate.get('type') == 'incoming' and amt_val < 0)))

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
        skip_existing = str(request.data.get('skip_existing', '0')).strip().lower() in ('1', 'true', 'yes')
        if not files:
            return Response({'error': 'Nem kaptam fájlokat (files)'}, status=status.HTTP_400_BAD_REQUEST)
        if not company_id:
            return Response({'error': 'company kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        company = get_object_or_404(Company, id=company_id)

        import re
        import uuid
        from django.conf import settings
        results = []
        skipped_duplicate_statements = []
        mismatch_companies = {}
        from invoices.models import CompanyBankAccount, CustomerBankAccount, BankStatement, BankStatementItem, Customer, Invoice

        all_company_accounts = []
        for acc in CompanyBankAccount.objects.select_related('company').all():
            keys = []
            if acc.account_number:
                keys.append(re.sub(r'\D+', '', (acc.account_number or '')))
            if acc.iban:
                keys.append(re.sub(r'\D+', '', (acc.iban or '')))
            keys = [k for k in keys if k]
            if keys:
                all_company_accounts.append((acc, keys))

        for f in files:
            try:
                content = f.read()
            except Exception as e:
                return Response({'error': f'Fájl olvasási hiba: {getattr(f, "name", "?")} - {e}'}, status=status.HTTP_400_BAD_REQUEST)

            source_file_name = os.path.basename(getattr(f, 'name', '') or 'statement.xml')
            source_file_token = None
            try:
                media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(os.getcwd(), 'media')
                store_dir = os.path.join(media_root, 'bank_statement_sources')
                os.makedirs(store_dir, exist_ok=True)
                source_file_token = f"{uuid.uuid4().hex}_{source_file_name}"
                with open(os.path.join(store_dir, source_file_token), 'wb') as _fw:
                    _fw.write(content)
            except Exception:
                source_file_token = None
            
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
                bank_acc = None
                # Better matching: find by digits substring
                for acc in CompanyBankAccount.objects.filter(company=company):
                    key = re.sub(r'\D+', '', (acc.account_number or acc.iban or ''))
                    if acct_clean and key and (acct_clean in key or key in acct_clean):
                        bank_acc = acc
                        break

                detected_company = None
                if not bank_acc and acct_clean:
                    for acc, keys in all_company_accounts:
                        if any((acct_clean in key or key in acct_clean) for key in keys):
                            detected_company = acc.company
                            break
                    if detected_company and str(detected_company.id) != str(company.id):
                        mismatch_companies[str(detected_company.id)] = detected_company.name

                stmt_date = st.get('statement_date')
                seq_num = str(st.get('sequence_number') or '').strip()
                if bank_acc and stmt_date and seq_num:
                    exists_dup = BankStatement.objects.filter(
                        company=company,
                        bank_account=bank_acc,
                        statement_date=stmt_date,
                        sequence_number=seq_num,
                    ).exists()
                    if exists_dup:
                        bank_label = (f"{bank_acc.bank_name or ''} {bank_acc.iban or bank_acc.account_number or ''}").strip()
                        if skip_existing:
                            skipped_duplicate_statements.append({
                                'account_id': str(bank_acc.id),
                                'account_label': bank_label or acct_raw,
                                'statement_date': stmt_date,
                                'sequence_number': seq_num,
                            })
                            continue
                        return Response(
                            {
                                'error': (
                                    f'Már létezik ilyen bankkivonat: Számla: {bank_label or acct_raw} | '
                                    f'Dátum: {stmt_date} | Sorszám: {seq_num}. '
                                    'Előbb töröld a meglévő kivonatot.'
                                ),
                                'duplicate_statement': {
                                    'account_id': str(bank_acc.id),
                                    'account_label': bank_label or acct_raw,
                                    'statement_date': stmt_date,
                                    'sequence_number': seq_num,
                                },
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                proposals = self._propose_matches(company, st.get('currency') or 'HUF', st.get('items') or [])
                header = {
                    'account_id': str(bank_acc.id) if bank_acc else None,
                    'account_label': (f"{bank_acc.bank_name or ''} {(bank_acc.iban or bank_acc.account_number or '')}".strip()) if bank_acc else acct_raw,
                    'statement_date': st.get('statement_date'),
                    'sequence_number': st.get('sequence_number'),
                    'currency': st.get('currency') or 'HUF',
                    'source_file_name': source_file_name,
                    'source_file_token': source_file_token,
                    'items': proposals,
                    'detected_company_id': str(detected_company.id) if detected_company else None,
                    'detected_company_name': detected_company.name if detected_company else None,
                }
                results.append(header)

        if dry_run:
            mismatches = [
                {'company_id': cid, 'company_name': cname}
                for cid, cname in mismatch_companies.items()
            ]
            return Response({
                'success': True,
                'preview': results,
                'detected_company_mismatches': mismatches,
                'skipped_duplicate_statements': skipped_duplicate_statements,
                'skipped_duplicates_count': len(skipped_duplicate_statements),
            })

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
        saved_account_updates = 0
        saved_account_creates = 0
        moved_accounts = []
        skipped_conflicts = 0
        skipped_duplicate_statements = []
        touched_outgoing_ids = set()
        touched_incoming_ids = set()

        company_tax_base = re.sub(r'\D+', '', str(getattr(company, 'tax_number', None) or getattr(company, 'full_tax_number', None) or getattr(company, 'eu_tax_number', None) or ''))
        company_name_norm = str(getattr(company, 'name', None) or '').strip().lower()

        def is_external_outgoing_incoming(inv):
            if not inv:
                return False
            supplier_tax = re.sub(r'\D+', '', str(getattr(inv, 'supplier_tax_number', None) or ''))
            supplier_name = str(getattr(inv, 'supplier_name', None) or '').strip().lower()
            if company_tax_base and supplier_tax:
                if supplier_tax.startswith(company_tax_base):
                    return True
            if company_name_norm and supplier_name and company_name_norm in supplier_name:
                return True
            return False

        def resolve_incoming_invoice(ref):
            if ref in (None, ''):
                return None
            # Try by primary key first (uuid/int depending on DB schema), then fall back to invoice_number
            try:
                obj = IncomingInvoiceDigest.objects.filter(id=ref, company=company).first()
                if obj:
                    return obj
            except Exception:
                pass
            try:
                return IncomingInvoiceDigest.objects.filter(invoice_number=str(ref).strip(), company=company).order_by('-invoice_issue_date', '-ins_date').first()
            except Exception:
                return None

        def resolve_outgoing_invoice(ref):
            if ref in (None, ''):
                return None
            # Try by primary key first (uuid/int depending on DB schema), then fall back to invoice_number
            try:
                obj = Invoice.objects.filter(id=ref, company=company).first()
                if obj:
                    return obj
            except Exception:
                pass
            try:
                return Invoice.objects.filter(invoice_number=str(ref).strip(), company=company).order_by('-issue_date').first()
            except Exception:
                return None

        def persist_customer_bank_account(it, customer, currency):
            nonlocal saved_accounts, saved_account_updates, saved_account_creates, moved_accounts, skipped_conflicts
            customer_obj = customer if isinstance(customer, Customer) else None
            if customer_obj is None and isinstance(customer, dict):
                cid = customer.get('id')
                if cid:
                    customer_obj = Customer.objects.filter(id=cid).first()
            if customer_obj is None and customer not in (None, ''):
                try:
                    customer_obj = Customer.objects.filter(id=str(customer)).first()
                except Exception:
                    customer_obj = None

            logger.warning(
                f"[bank_acct] save_flag={it.get('save_bank_account')} "
                f"customer={'%s(%s)' % (customer_obj.name, customer_obj.id) if customer_obj else None} "
                f"acct={it.get('counterparty_account')} "
                f"remove_conflicts={it.get('remove_conflicting_bank_accounts')}"
            )
            if not (it.get('save_bank_account') and customer_obj and it.get('counterparty_account')):
                return True

            acct = str(it.get('counterparty_account') or '').strip().upper()
            import re
            acct_compact = re.sub(r'\s+', '', acct)
            acct_alnum = re.sub(r'[^A-Z0-9]', '', acct_compact)
            is_iban = bool(re.match(r'^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$', acct_alnum))
            iban_clean = acct_alnum if is_iban else None
            normalized_account = acct_alnum if not is_iban else None
            existing_acc = None
            allow_conflict_delete = bool(it.get('remove_conflicting_bank_accounts'))
            acct_digits = re.sub(r'\D', '', acct_alnum)

            def _clean_alnum(val):
                return re.sub(r'[^A-Z0-9]', '', str(val or '').upper())

            def _digits(val):
                return re.sub(r'\D', '', str(val or ''))

            def _is_same_account_for_target(c_iban, c_num):
                c_iban_clean = _clean_alnum(c_iban)
                c_num_clean = _clean_alnum(c_num)
                c_iban_digits = _digits(c_iban_clean)
                c_num_digits = _digits(c_num_clean)

                if is_iban:
                    if c_iban_clean and iban_clean and c_iban_clean == iban_clean:
                        return True
                    if acct_digits and c_num_digits and acct_digits.endswith(c_num_digits):
                        return True
                    if acct_digits and c_iban_digits and acct_digits == c_iban_digits:
                        return True
                    return False

                if normalized_account and c_num_clean and normalized_account == c_num_clean:
                    return True
                if acct_digits and c_num_digits and acct_digits == c_num_digits:
                    return True
                if acct_digits and c_iban_digits and c_iban_digits.endswith(acct_digits):
                    return True
                return False

            conflicts = []
            customer_id = str(customer_obj.id)
            try:
                other_accounts = CustomerBankAccount.objects.exclude(customer_id=customer_id)
            except Exception as exc:
                logger.warning(f"[bank_acct] other_accounts query failed: {exc}")
                other_accounts = CustomerBankAccount.objects.none()
            for cand in other_accounts:
                if _is_same_account_for_target(cand.iban, cand.account_number):
                    conflicts.append(cand)
                    continue

            try:
                matches = CustomerBankAccount.objects.filter(customer_id=customer_id)
            except Exception as exc:
                logger.warning(f"[bank_acct] matches query failed: {exc}")
                matches = CustomerBankAccount.objects.none()
            for cand in matches:
                if _is_same_account_for_target(cand.iban, cand.account_number):
                    existing_acc = cand
                    break

            # If selected customer already has this account, allow local format update even when
            # other-customer conflicts exist. Only block when this would create a new assignment.
            if conflicts and not allow_conflict_delete and not existing_acc:
                logger.warning(f"[bank_acct] SKIP conflicts={len(conflicts)} no_existing_acc")
                skipped_conflicts += 1
                return False
            logger.warning(
                f"[bank_acct] existing_acc={existing_acc.id if existing_acc else None} "
                f"conflicts={len(conflicts)} allow_delete={allow_conflict_delete}"
            )
            if conflicts and allow_conflict_delete:
                for c in conflicts:
                    try:
                        moved_accounts.append({
                            'account': iban_clean or normalized_account or acct,
                            'from_customer_id': str(c.customer_id),
                            'from_customer_name': c.customer.name if c.customer_id else '',
                            'to_customer_id': customer_id,
                            'to_customer_name': customer_obj.name,
                        })
                    except Exception:
                        pass
                CustomerBankAccount.objects.filter(id__in=[c.id for c in conflicts]).delete()

            if existing_acc:
                update_fields = []
                existing_iban_clean = _clean_alnum(existing_acc.iban)
                existing_num_clean = _clean_alnum(existing_acc.account_number)

                if is_iban:
                    if iban_clean and existing_iban_clean != iban_clean:
                        existing_acc.iban = iban_clean
                        update_fields.append('iban')
                    if existing_acc.account_number and existing_acc.account_number != existing_num_clean:
                        existing_acc.account_number = existing_num_clean
                        update_fields.append('account_number')
                else:
                    if normalized_account and (existing_acc.account_number or '') != normalized_account:
                        existing_acc.account_number = normalized_account
                        update_fields.append('account_number')

                if currency and existing_acc.currency != currency:
                    existing_acc.currency = currency
                    update_fields.append('currency')

                if update_fields:
                    existing_acc.save(update_fields=list(dict.fromkeys(update_fields + ['updated_at'])))
                    saved_accounts += 1
                    saved_account_updates += 1
                    logger.warning(
                        f"[bank_acct] UPDATED id={existing_acc.id} fields={list(dict.fromkeys(update_fields))}"
                    )
            else:
                CustomerBankAccount.objects.create(
                    customer=customer_obj,
                    iban=iban_clean if is_iban else None,
                    account_number=None if is_iban else normalized_account,
                    currency=currency
                )
                saved_accounts += 1
                saved_account_creates += 1
                logger.warning(
                    f"[bank_acct] CREATED customer={customer_id} iban={bool(iban_clean)} acct={normalized_account or ''}"
                )
            return True

        def mark_touched(invoice_obj=None, incoming_obj=None):
            if invoice_obj is not None and getattr(invoice_obj, 'id', None):
                touched_outgoing_ids.add(str(invoice_obj.id))
            if incoming_obj is not None and getattr(incoming_obj, 'id', None):
                touched_incoming_ids.add(str(incoming_obj.id))

        with transaction.atomic():
            for st in payload:
                acc_id = st.get('account_id')
                bank_acc = CompanyBankAccount.objects.filter(id=acc_id, company=company).first()
                if not bank_acc:
                    return Response({'error': 'Ismeretlen company bank account'}, status=status.HTTP_400_BAD_REQUEST)
                # Header: upsert by date+account
                stmt_date = st.get('statement_date')
                currency = st.get('currency') or bank_acc.currency or 'HUF'
                source_statement_id = st.get('source_statement_id')
                sequence_number_raw = str(st.get('sequence_number') or '').strip()

                if not source_statement_id and sequence_number_raw:
                    duplicate_header = BankStatement.objects.filter(
                        company=company,
                        bank_account=bank_acc,
                        statement_date=stmt_date,
                        sequence_number=sequence_number_raw,
                    ).first()
                    if duplicate_header:
                        skipped_duplicate_statements.append({
                            'statement_date': stmt_date,
                            'sequence_number': sequence_number_raw,
                            'bank_account_id': str(bank_acc.id),
                            'existing_statement_id': str(duplicate_header.id),
                        })
                        continue

                header = None
                if source_statement_id:
                    header = BankStatement.objects.filter(company=company, id=source_statement_id).first()
                if not header:
                    header_qs = BankStatement.objects.filter(company=company, bank_account=bank_acc, statement_date=stmt_date)
                    if sequence_number_raw:
                        header_qs = header_qs.filter(sequence_number=sequence_number_raw)
                    header = header_qs.first()
                if not header:
                    seq_num = sequence_number_raw or f"{stmt_date}-{str(bank_acc.id)[:6]}"
                    header = BankStatement(company=company, bank_account=bank_acc, statement_date=stmt_date, sequence_number=seq_num, currency=currency)
                    if request.user and request.user.is_authenticated:
                        header.created_by = request.user
                    header.save()
                    created_headers += 1
                else:
                    changed_fields = []
                    seq_num = st.get('sequence_number') or header.sequence_number
                    if header.bank_account_id != bank_acc.id:
                        header.bank_account = bank_acc
                        changed_fields.append('bank_account')
                    if str(header.statement_date) != str(stmt_date):
                        header.statement_date = stmt_date
                        changed_fields.append('statement_date')
                    if seq_num and header.sequence_number != seq_num:
                        header.sequence_number = seq_num
                        changed_fields.append('sequence_number')
                    if header.currency != currency:
                        header.currency = currency
                        changed_fields.append('currency')
                    if changed_fields:
                        header.save(update_fields=list(dict.fromkeys(changed_fields + ['updated_at'])))

                if source_statement_id and str(header.id) == str(source_statement_id):
                    existing_items = list(header.items.only('id', 'invoice_id', 'incoming_invoice_id'))
                    for old in existing_items:
                        if old.invoice_id:
                            touched_outgoing_ids.add(str(old.invoice_id))
                        if old.incoming_invoice_id:
                            touched_incoming_ids.add(str(old.incoming_invoice_id))
                    if existing_items:
                        header.items.all().delete()

                # Persist import metadata in note prefix for uploaded-statements modal and edit-reopen flow.
                try:
                    raw_items = st.get('items') or []
                    preview_items = []
                    for _it in raw_items:
                        preview_items.append({
                            'amount': _it.get('amount'),
                            'currency': _it.get('currency') or currency,
                            'value_date': _it.get('value_date') or _it.get('booking_date'),
                            'remittance': _it.get('remittance'),
                            'comment': _it.get('comment'),
                            'counterparty_account': _it.get('counterparty_account'),
                            'counterparty_name': _it.get('counterparty_name'),
                            'proposed_customer': _it.get('proposed_customer') or ({
                                'id': _it.get('customer_id'),
                                'name': '',
                            } if _it.get('customer_id') else None),
                            'proposed_invoice': _it.get('proposed_invoice') or ({
                                'id': _it.get('invoice_id'),
                                'type': _it.get('invoice_type') or 'outgoing',
                            } if _it.get('invoice_id') else None),
                            'allocations': _it.get('allocations') or [],
                            'approved': bool(_it.get('approved')),
                            'pairing_marked_at': _it.get('pairing_marked_at') or (_it.get('approved') and timezone.now().isoformat()) or None,
                        })

                    existing_note = str(header.note or '')
                    existing_meta = {}
                    existing_meta_match = re.search(r'\[\[IMPORT_META:(.*?)\]\]', existing_note, flags=re.S)
                    if existing_meta_match:
                        try:
                            parsed_existing_meta = json.loads(existing_meta_match.group(1))
                            if isinstance(parsed_existing_meta, dict):
                                existing_meta = parsed_existing_meta
                        except Exception:
                            existing_meta = {}

                    source_file_name = (st.get('source_file_name') or '').strip()
                    source_file_token = (st.get('source_file_token') or '').strip()
                    if not source_file_name:
                        source_file_name = str(existing_meta.get('xml') or '').strip()
                    if not source_file_token:
                        source_file_token = str(existing_meta.get('xml_file_token') or '').strip()

                    import_meta = {
                        'xml': source_file_name,
                        'xml_file_token': source_file_token,
                        'saved_items': int(sum(1 for _it in (st.get('items') or []) if _it.get('approved'))),
                        'total_items': int(len(st.get('items') or [])),
                        'preview_items': preview_items,
                    }
                    meta_prefix = f"[[IMPORT_META:{json.dumps(import_meta, ensure_ascii=False)}]]"
                    current_note = existing_note
                    current_note = re.sub(r'^\[\[IMPORT_META:.*?\]\]\s*', '', current_note, flags=re.S)
                    header.note = f"{meta_prefix}\n{current_note}".strip()
                    header.save(update_fields=['note', 'updated_at'])
                except Exception:
                    pass
                # Items
                from invoices.models import IncomingInvoiceDigest
                for it in (st.get('items') or []):
                    allocations = it.get('allocations') or []
                    try:
                        txn_amount = decimal.Decimal(str(it.get('amount') or 0))
                    except Exception:
                        txn_amount = decimal.Decimal('0')
                    is_positive_txn = txn_amount > 0
                    is_negative_txn = txn_amount < 0
                    cust_id = it.get('customer_id') or (it.get('proposed_customer') or {}).get('id')
                    
                    prop_inv = it.get('proposed_invoice') or {}
                    inv_id = it.get('invoice_id') or prop_inv.get('id')
                    inv_type = it.get('invoice_type') or prop_inv.get('type') or 'outgoing'
                    
                    customer = Customer.objects.filter(id=cust_id).first() if cust_id else None

                    if not persist_customer_bank_account(it, customer, currency):
                        continue

                    if not it.get('approved'):
                        continue
                    
                    invoice = None
                    incoming_invoice = None
                    
                    if inv_id:
                        if inv_type == 'outgoing':
                            invoice = resolve_outgoing_invoice(inv_id)
                        elif inv_type == 'incoming':
                            incoming_invoice = resolve_incoming_invoice(inv_id)

                    if is_positive_txn:
                        if incoming_invoice and not is_external_outgoing_incoming(incoming_invoice):
                            incoming_invoice = None
                    elif is_negative_txn:
                        invoice = None
                        if incoming_invoice and is_external_outgoing_incoming(incoming_invoice):
                            incoming_invoice = None
                    else:
                        invoice = None
                        incoming_invoice = None

                    # Multi-invoice allocation (for incoming/+ bank entries)
                    if isinstance(allocations, list) and allocations:
                        allocation_saved = False
                        for alloc in allocations:
                            alloc_invoice_id = alloc.get('invoice_id')
                            alloc_invoice_type = alloc.get('invoice_type') or inv_type or 'outgoing'
                            alloc_invoice = None
                            alloc_amount_raw = alloc.get('amount')
                            try:
                                from decimal import Decimal
                                alloc_amount = Decimal(str(alloc_amount_raw or 0))
                            except Exception:
                                alloc_amount = decimal.Decimal('0')
                            alloc_amount_txn_raw = alloc.get('amount_txn')
                            try:
                                from decimal import Decimal
                                alloc_amount_txn = Decimal(str(alloc_amount_txn_raw or 0))
                            except Exception:
                                alloc_amount_txn = decimal.Decimal('0')
                            alloc_amount_abs = abs(alloc_amount)
                            alloc_amount_txn_abs = abs(alloc_amount_txn)
                            amount_to_store_abs = alloc_amount_txn_abs if alloc_amount_txn_abs > 0 else alloc_amount_abs
                            if alloc_amount_abs <= 0:
                                continue

                            if is_positive_txn:
                                if alloc_invoice_type == 'incoming':
                                    alloc_incoming = resolve_incoming_invoice(alloc_invoice_id)
                                    if not alloc_incoming or not is_external_outgoing_incoming(alloc_incoming):
                                        continue
                                    alloc_customer = customer
                                    if not alloc_customer:
                                        continue
                                    note = (it.get('remittance') or '')[:500]
                                    BankStatementItem.objects.create(
                                        bank_statement=header,
                                        customer=alloc_customer,
                                        invoice=None,
                                        incoming_invoice=alloc_incoming,
                                        amount=amount_to_store_abs,
                                        note=note
                                    )
                                    allocation_saved = True
                                    created_items += 1
                                    mark_touched(incoming_obj=alloc_incoming)

                                    gross = decimal.Decimal(str((alloc_incoming.invoice_net_amount or 0) + (alloc_incoming.invoice_vat_amount or 0)))
                                    current_paid = decimal.Decimal(str(alloc_incoming.amount_paid or 0))
                                    new_paid = current_paid + amount_to_store_abs
                                    alloc_incoming.amount_paid = new_paid
                                    if new_paid >= (gross - decimal.Decimal('1.0')):
                                        alloc_incoming.payment_status = 'paid'
                                        alloc_incoming.payment_date = header.statement_date
                                    elif new_paid > 0:
                                        alloc_incoming.payment_status = 'partially_paid'
                                    seq_info = f"{header.sequence_number}"
                                    if alloc_incoming.payment_reference:
                                        if seq_info not in alloc_incoming.payment_reference:
                                            alloc_incoming.payment_reference = f"{alloc_incoming.payment_reference}, {seq_info}"[:100]
                                    else:
                                        alloc_incoming.payment_reference = seq_info[:100]
                                    alloc_incoming.save(update_fields=['amount_paid', 'payment_status', 'payment_date', 'payment_reference'])
                                    continue

                                alloc_invoice = resolve_outgoing_invoice(alloc_invoice_id)
                                if not alloc_invoice:
                                    continue

                                alloc_customer = customer or alloc_invoice.customer
                                note = (it.get('remittance') or '')[:500]
                                BankStatementItem.objects.create(
                                    bank_statement=header,
                                    customer=alloc_customer,
                                    invoice=alloc_invoice,
                                    incoming_invoice=None,
                                    amount=amount_to_store_abs,
                                    note=note
                                )
                                allocation_saved = True
                                created_items += 1
                                mark_touched(invoice_obj=alloc_invoice)

                                outstanding = alloc_invoice.total_gross_amount - (alloc_invoice.amount_paid or 0)
                                add_amt = amount_to_store_abs
                                if outstanding is not None and add_amt > outstanding:
                                    add_amt = outstanding
                                alloc_invoice.amount_paid = (alloc_invoice.amount_paid or 0) + add_amt
                                is_nav_status = alloc_invoice.status in self.NAV_PROGRESS_STATUSES
                                if self._is_effectively_paid_outgoing(alloc_invoice, alloc_invoice.amount_paid):
                                    if not is_nav_status:
                                        alloc_invoice.status = 'paid'
                                    try:
                                        from datetime import datetime as _dt
                                        alloc_invoice.payment_date = header.statement_date or _dt.utcnow().date()
                                    except Exception:
                                        alloc_invoice.payment_date = header.statement_date
                                elif alloc_invoice.amount_paid > 0:
                                    if not is_nav_status:
                                        alloc_invoice.status = 'partially_paid'
                                alloc_invoice.save(update_fields=['amount_paid', 'status', 'payment_date', 'updated_at'])
                                continue

                            if is_negative_txn:
                                alloc_incoming = resolve_incoming_invoice(alloc_invoice_id)
                                if not alloc_incoming or is_external_outgoing_incoming(alloc_incoming):
                                    continue
                                alloc_customer = customer
                                if not alloc_customer:
                                    continue
                                note = (it.get('remittance') or '')[:500]
                                BankStatementItem.objects.create(
                                    bank_statement=header,
                                    customer=alloc_customer,
                                    invoice=None,
                                    incoming_invoice=alloc_incoming,
                                    amount=-amount_to_store_abs,
                                    note=note
                                )
                                allocation_saved = True
                                created_items += 1
                                mark_touched(incoming_obj=alloc_incoming)

                                gross = decimal.Decimal(str((alloc_incoming.invoice_net_amount or 0) + (alloc_incoming.invoice_vat_amount or 0)))
                                current_paid = decimal.Decimal(str(alloc_incoming.amount_paid or 0))
                                new_paid = current_paid + amount_to_store_abs
                                alloc_incoming.amount_paid = new_paid
                                if new_paid >= (gross - decimal.Decimal('1.0')):
                                    alloc_incoming.payment_status = 'paid'
                                    alloc_incoming.payment_date = header.statement_date
                                elif new_paid > 0:
                                    alloc_incoming.payment_status = 'partially_paid'
                                seq_info = f"{header.sequence_number}"
                                if alloc_incoming.payment_reference:
                                    if seq_info not in alloc_incoming.payment_reference:
                                        alloc_incoming.payment_reference = f"{alloc_incoming.payment_reference}, {seq_info}"[:100]
                                else:
                                    alloc_incoming.payment_reference = seq_info[:100]
                                alloc_incoming.save(update_fields=['amount_paid', 'payment_status', 'payment_date', 'payment_reference'])
                                continue

                            continue

                        # Continue to next statement item only when at least one allocation row was saved.
                        # If all allocation rows were skipped (invalid ref/type), fall back to single-invoice handling below.
                        if allocation_saved:
                            continue

                    amount = it.get('amount')
                    try:
                        amount_decimal = decimal.Decimal(str(amount or 0))
                    except Exception:
                        amount_decimal = decimal.Decimal('0')
                    amount_abs = abs(amount_decimal)
                    if incoming_invoice:
                        amount_to_store = amount_abs if is_external_outgoing_incoming(incoming_invoice) else -amount_abs
                    elif invoice:
                        amount_to_store = amount_abs
                    else:
                        amount_to_store = amount_decimal
                    note = it.get('remittance') or ''
                    bsi = BankStatementItem.objects.create(
                        bank_statement=header,
                        customer=customer if customer else (invoice.customer if invoice else None),
                        invoice=invoice,
                        incoming_invoice=incoming_invoice,
                        amount=amount_to_store,
                        note=note[:500]
                    )
                    created_items += 1
                    mark_touched(invoice_obj=invoice, incoming_obj=incoming_invoice)
                    # Reconcile Outgoing Invoice
                    if invoice and amount:
                        try:
                            from decimal import Decimal
                            add = abs(Decimal(str(amount)))
                        except Exception:
                            try:
                                add = abs(decimal.Decimal(str(amount or 0)))
                            except Exception:
                                add = decimal.Decimal('0')
                        outstanding = invoice.total_gross_amount - (invoice.amount_paid or 0)
                        if add > outstanding:
                            add = outstanding
                        invoice.amount_paid = (invoice.amount_paid or 0) + add
                        is_nav_status = invoice.status in self.NAV_PROGRESS_STATUSES
                        if self._is_effectively_paid_outgoing(invoice, invoice.amount_paid):
                            if not is_nav_status:
                                invoice.status = 'paid'
                            try:
                                from datetime import datetime as _dt
                                invoice.payment_date = header.statement_date or _dt.utcnow().date()
                            except Exception:
                                invoice.payment_date = header.statement_date
                        elif invoice.amount_paid > 0:
                            if not is_nav_status:
                                invoice.status = 'partially_paid'
                        invoice.save(update_fields=['amount_paid', 'status', 'payment_date', 'updated_at'])
                    
                    # Reconcile Incoming Invoice
                    if incoming_invoice and amount:
                        try:
                            from decimal import Decimal
                            val = Decimal(str(amount))
                        except:
                            val = Decimal('0')
                        pay_amt = abs(val) 
                        
                        gross = Decimal(str((incoming_invoice.invoice_net_amount or 0) + (incoming_invoice.invoice_vat_amount or 0)))
                        current_paid = Decimal(str(incoming_invoice.amount_paid or 0))
                        
                        new_paid = current_paid + pay_amt
                        
                        incoming_invoice.amount_paid = new_paid
                        
                        # Status update
                        if new_paid >= (gross - Decimal('1.0')): 
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

                try:
                    self._normalize_bank_statement_item_signs(header)
                except Exception:
                    pass

            if touched_outgoing_ids:
                for inv in Invoice.objects.filter(company=company, id__in=list(touched_outgoing_ids)):
                    agg = BankStatementItem.objects.filter(bank_statement__company=company, invoice=inv).aggregate(
                        total=Sum('amount'),
                        last_date=Max('bank_statement__statement_date')
                    )
                    paid_amount = decimal.Decimal(str(agg.get('total') or 0))
                    if paid_amount < 0:
                        paid_amount = decimal.Decimal('0')

                    is_nav_status = inv.status in self.NAV_PROGRESS_STATUSES
                    if self._is_effectively_paid_outgoing(inv, paid_amount):
                        new_status = inv.status if is_nav_status else 'paid'
                    elif paid_amount > 0:
                        new_status = inv.status if is_nav_status else 'partially_paid'
                    elif inv.status in ('paid', 'partially_paid'):
                        new_status = 'sent'
                    else:
                        new_status = inv.status

                    new_payment_date = agg.get('last_date') if paid_amount > 0 else None
                    update_fields = []
                    if inv.amount_paid != paid_amount:
                        inv.amount_paid = paid_amount
                        update_fields.append('amount_paid')
                    if inv.status != new_status:
                        inv.status = new_status
                        update_fields.append('status')
                    if inv.payment_date != new_payment_date:
                        inv.payment_date = new_payment_date
                        update_fields.append('payment_date')
                    if update_fields:
                        inv.save(update_fields=list(dict.fromkeys(update_fields + ['updated_at'])))

            if touched_incoming_ids:
                for inc in IncomingInvoiceDigest.objects.filter(company=company, id__in=list(touched_incoming_ids)):
                    qs = BankStatementItem.objects.filter(bank_statement__company=company, incoming_invoice=inc).select_related('bank_statement')
                    agg = qs.aggregate(
                        last_date=Max('bank_statement__statement_date')
                    )
                    paid_amount = decimal.Decimal('0')
                    for row in qs:
                        try:
                            paid_amount += abs(decimal.Decimal(str(row.amount or 0)))
                        except Exception:
                            continue
                    gross = decimal.Decimal(str((inc.invoice_net_amount or 0) + (inc.invoice_vat_amount or 0)))

                    if paid_amount >= (gross - decimal.Decimal('1.0')) and gross > 0:
                        payment_status = 'paid'
                    elif paid_amount > 0:
                        payment_status = 'partially_paid'
                    else:
                        payment_status = 'unpaid'

                    seqs = []
                    seen_seq = set()
                    for row in qs:
                        seq = str(getattr(row.bank_statement, 'sequence_number', '') or '').strip()
                        if seq and seq not in seen_seq:
                            seen_seq.add(seq)
                            seqs.append(seq)
                    payment_reference = ', '.join(seqs)[:100] if seqs else None
                    payment_date = agg.get('last_date') if paid_amount > 0 else None

                    update_fields = []
                    if inc.amount_paid != paid_amount:
                        inc.amount_paid = paid_amount
                        update_fields.append('amount_paid')
                    if inc.payment_status != payment_status:
                        inc.payment_status = payment_status
                        update_fields.append('payment_status')
                    if inc.payment_date != payment_date:
                        inc.payment_date = payment_date
                        update_fields.append('payment_date')
                    if (inc.payment_reference or None) != payment_reference:
                        inc.payment_reference = payment_reference
                        update_fields.append('payment_reference')
                    if update_fields:
                        inc.save(update_fields=update_fields)
        return Response({
            'success': True,
            'created_headers': created_headers,
            'created_items': created_items,
            'saved_accounts': saved_accounts,
            'saved_account_updates': saved_account_updates,
            'saved_account_creates': saved_account_creates,
            'moved_accounts': moved_accounts,
            'skipped_conflicts': skipped_conflicts,
            'skipped_duplicate_statements': skipped_duplicate_statements,
            'skipped_duplicates_count': len(skipped_duplicate_statements),
        })

    @action(detail=True, methods=['get'], url_path='download-source-xml')
    def download_source_xml(self, request, pk=None):
        from django.conf import settings
        instance = self.get_object()
        note = str(getattr(instance, 'note', '') or '')
        match = re.search(r'\[\[IMPORT_META:(.*?)\]\]', note, flags=re.S)
        if not match:
            return Response({'error': 'Nincs mentett forrás XML ehhez a kivonathoz.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            meta = json.loads(match.group(1))
            if not isinstance(meta, dict):
                meta = {}
        except Exception:
            meta = {}

        token = os.path.basename(str(meta.get('xml_file_token') or '').strip())
        file_name = str(meta.get('xml') or '').strip() or 'statement.xml'
        if not token:
            return Response({'error': 'Nincs mentett forrás XML ehhez a kivonathoz.'}, status=status.HTTP_404_NOT_FOUND)

        media_root = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(os.getcwd(), 'media')
        file_path = os.path.join(media_root, 'bank_statement_sources', token)
        if not os.path.exists(file_path):
            return Response({'error': 'A mentett XML fájl nem található.'}, status=status.HTTP_404_NOT_FOUND)

        return FileResponse(open(file_path, 'rb'), as_attachment=True, filename=file_name)


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
            try:
                parsed_company_id = uuid.UUID(str(company_id))
            except (ValueError, TypeError, AttributeError):
                return qs.none()
            qs = qs.filter(company_id=parsed_company_id)
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

    @action(detail=False, methods=['get'], url_path='next_number')
    def next_number(self, request):
        """Preview the next auto-generated proforma number (YYYYMMDD + 3-digit seq)."""
        today = timezone.localdate().strftime('%Y%m%d')
        numbers = ProformaInvoice.objects.filter(
            proforma_number__startswith=today
        ).values_list('proforma_number', flat=True)
        max_seq = 0
        for raw in numbers:
            value = str(raw or '')
            tail = value[len(today):]
            if tail.isdigit():
                try:
                    seq = int(tail)
                except Exception:
                    continue
                if seq > max_seq:
                    max_seq = seq
        pfnum = f"{today}{max_seq + 1:03d}"
        return Response({'proforma_number': pfnum})

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

    # ── Proforma PDF ─────────────────────────────────────────────
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        import io
        from django.http import HttpResponse
        from django.template.loader import render_to_string
        try:
            from weasyprint import HTML
        except Exception:
            HTML = None

        pf = ProformaInvoice.objects.select_related(
            'company', 'customer'
        ).prefetch_related(
            'items', 'items__vat_type', 'company__bank_accounts'
        ).get(pk=pk)

        from collections import defaultdict
        from decimal import Decimal, ROUND_HALF_UP

        vat_map = defaultdict(lambda: {'net': 0, 'vat': 0, 'gross': 0, 'rate': 0, 'label': ''})
        for item in pf.items.all():
            r = item.vat_rate
            vt = item.vat_type
            if vt and vt.category != 'PERCENT':
                eff_rate = vt.percentage if vt.percentage is not None else r
                label = f"{int(eff_rate)}%" if eff_rate % 1 == 0 else f"{eff_rate}%"
                key = (r, vt.code)
            else:
                label = f"{int(r)}%" if r % 1 == 0 else f"{r}%"
                key = (r, 'PERCENT')
            vat_map[key]['rate'] = r
            vat_map[key]['label'] = label
            vat_map[key]['net'] += item.net_amount
            vat_map[key]['vat'] += item.vat_amount
            vat_map[key]['gross'] += item.gross_amount
        vat_summary = sorted(vat_map.values(), key=lambda x: x['rate'])

        _is_huf = (pf.currency or 'HUF').upper() == 'HUF'
        display_decimals = 0 if _is_huf else 2
        if not _is_huf:
            try:
                _curr_obj = Currency.objects.get(code=pf.currency)
                display_decimals = _curr_obj.display_decimals
            except Exception:
                pass
        _dec_fmt = Decimal('1') if display_decimals == 0 else Decimal('0.' + '0' * display_decimals)
        def _rnd(v):
            return float(Decimal(str(v)).quantize(_dec_fmt, rounding=ROUND_HALF_UP))
        for row in vat_summary:
            row['net'] = _rnd(row['net'])
            row['vat'] = _rnd(row['vat'])
            row['gross'] = _rnd(row['gross'])

        payable_amount = pf.total_gross_amount
        amount_words = get_amount_words_hu(payable_amount, pf.currency or 'HUF')

        pdf_buf = io.BytesIO()
        if HTML:
            try:
                ctx = {
                    'proforma': pf,
                    'vat_summary': vat_summary,
                    'payable_amount': payable_amount,
                    'amount_words': amount_words,
                    'display_decimals': display_decimals,
                }
                html = render_to_string('invoices/print_proforma.html', ctx)
                HTML(string=html).write_pdf(target=pdf_buf)
            except Exception as e:
                print(f"Proforma WeasyPrint PDF error: {e}")
                import traceback; traceback.print_exc()
                HTML = None
                pdf_buf = io.BytesIO()

        if not HTML or pdf_buf.tell() == 0:
            from reportlab.pdfgen import canvas as rl_canvas
            from reportlab.lib.pagesizes import A4
            c = rl_canvas.Canvas(pdf_buf, pagesize=A4)
            w, h = A4
            c.setFont("Helvetica-Bold", 14)
            c.drawString(40, h - 50, f"Díjbekérő: {pf.proforma_number}")
            c.setFont("Helvetica", 11)
            c.drawString(40, h - 70, f"Kelt: {pf.issue_date}")
            c.drawString(40, h - 85, f"Vevő: {getattr(pf.customer, 'name', '')}")
            c.drawString(40, h - 100, f"Összeg (bruttó): {float(pf.total_gross_amount):,.2f} {pf.currency}")
            c.showPage(); c.save()
        pdf_buf.seek(0)
        resp = HttpResponse(pdf_buf.read(), content_type='application/pdf')
        cust_name = getattr(pf.customer, 'name', '') or ''
        cust_prefix = cust_name[:5] or 'Client'
        filename = f"{cust_prefix}_{pf.proforma_number or 'dijbekero'}.pdf"
        resp['Content-Disposition'] = f'inline; filename="{filename}"'
        return resp

    # ── Proforma Send Email ──────────────────────────────────────
    @action(detail=True, methods=['post'])
    def send_email(self, request, pk=None):
        import sys, datetime as _dt, io, smtplib, ssl, imaplib, email as _email_mod
        from email.message import EmailMessage as _EM
        from django.template.loader import render_to_string
        try:
            from weasyprint import HTML
        except Exception:
            HTML = None

        def log(msg):
            ts = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"[PROFORMA-EMAIL {ts}] {msg}")
            sys.stdout.flush()

        pf = ProformaInvoice.objects.select_related(
            'company', 'customer'
        ).prefetch_related(
            'items', 'items__vat_type', 'company__bank_accounts'
        ).get(pk=pk)
        log(f"send_email called for proforma {pf.proforma_number}")

        data = request.data or {}
        to = data.get('to') or []
        cc = data.get('cc') or []
        bcc = data.get('bcc') or []
        reply_to = data.get('reply_to') or None
        subject = data.get('subject') or ''
        body = data.get('body') or ''

        if not subject:
            subject = f"Díjbekérő {pf.proforma_number}"
        if not body:
            company = pf.company
            customer = pf.customer
            default_signature_html = get_default_signature_html(company)
            tpl = get_company_email_template(company, EmailTemplate.TEMPLATE_INVOICE_SEND, 'hu')

            def render_curly(tpl_str, ctx_dict):
                out = str(tpl_str or '')
                for key, value in (ctx_dict or {}).items():
                    out = out.replace('{' + str(key) + '}', str(value if value is not None else ''))
                return out

            pf_ctx = {
                'invoice_number': pf.proforma_number or '',
                'customer_name': getattr(customer, 'name', '') or '',
                'company_name': getattr(company, 'name', '') or '',
                'signature_html': default_signature_html,
            }
            subject = render_curly(tpl.get('subject_template') or '', pf_ctx).strip()
            if subject:
                subject = subject.replace('Számla', 'Díjbekérő').replace('számla', 'díjbekérő').replace('Invoice', 'Proforma')
            else:
                subject = f"Díjbekérő {pf.proforma_number}"
            body = render_curly(tpl.get('body_template') or '', pf_ctx).strip()
            if body:
                body = body.replace('számlát', 'díjbekérőt').replace('számlákat', 'díjbekérőket').replace('Számla', 'Díjbekérő').replace('számla', 'díjbekérő')

        if not to:
            try:
                if pf.customer and pf.customer.email:
                    to = [pf.customer.email]
            except Exception:
                pass
        if not to:
            return Response({'error': 'Nincs címzett megadva'}, status=status.HTTP_400_BAD_REQUEST)

        # Generate PDF
        from collections import defaultdict
        from decimal import Decimal, ROUND_HALF_UP
        vat_map = defaultdict(lambda: {'net': 0, 'vat': 0, 'gross': 0, 'rate': 0, 'label': ''})
        for item in pf.items.all():
            r = item.vat_rate
            vt = item.vat_type
            if vt and vt.category != 'PERCENT':
                eff_rate = vt.percentage if vt.percentage is not None else r
                label = f"{int(eff_rate)}%" if eff_rate % 1 == 0 else f"{eff_rate}%"
                key = (r, vt.code)
            else:
                label = f"{int(r)}%" if r % 1 == 0 else f"{r}%"
                key = (r, 'PERCENT')
            vat_map[key]['rate'] = r
            vat_map[key]['label'] = label
            vat_map[key]['net'] += item.net_amount
            vat_map[key]['vat'] += item.vat_amount
            vat_map[key]['gross'] += item.gross_amount
        vat_summary = sorted(vat_map.values(), key=lambda x: x['rate'])
        _is_huf = (pf.currency or 'HUF').upper() == 'HUF'
        display_decimals = 0 if _is_huf else 2
        if not _is_huf:
            try:
                _curr_obj = Currency.objects.get(code=pf.currency)
                display_decimals = _curr_obj.display_decimals
            except Exception:
                pass
        _dec_fmt = Decimal('1') if display_decimals == 0 else Decimal('0.' + '0' * display_decimals)
        def _rnd(v):
            return float(Decimal(str(v)).quantize(_dec_fmt, rounding=ROUND_HALF_UP))
        for row in vat_summary:
            row['net'] = _rnd(row['net'])
            row['vat'] = _rnd(row['vat'])
            row['gross'] = _rnd(row['gross'])
        payable_amount = pf.total_gross_amount
        amount_words = get_amount_words_hu(payable_amount, pf.currency or 'HUF')

        pdf_buf = io.BytesIO()
        log("Generating proforma PDF...")
        if HTML:
            try:
                ctx = {
                    'proforma': pf,
                    'vat_summary': vat_summary,
                    'payable_amount': payable_amount,
                    'amount_words': amount_words,
                    'display_decimals': display_decimals,
                }
                html = render_to_string('invoices/print_proforma.html', ctx)
                HTML(string=html).write_pdf(target=pdf_buf)
            except Exception as e:
                log(f"WeasyPrint error: {e}")
                pdf_buf = io.BytesIO()

        if pdf_buf.tell() == 0:
            from reportlab.pdfgen import canvas as rl_canvas
            from reportlab.lib.pagesizes import A4
            c = rl_canvas.Canvas(pdf_buf, pagesize=A4)
            w, h = A4
            c.setFont("Helvetica-Bold", 14)
            c.drawString(40, h - 50, f"Díjbekérő: {pf.proforma_number}")
            c.setFont("Helvetica", 11)
            c.drawString(40, h - 70, f"Kelt: {pf.issue_date}")
            c.drawString(40, h - 85, f"Vevő: {getattr(pf.customer, 'name', '')}")
            c.drawString(40, h - 100, f"Összeg: {float(pf.total_gross_amount):,.2f} {pf.currency}")
            c.showPage(); c.save()
        log("PDF generation finished.")
        pdf_buf.seek(0)

        # Build email
        msg = _EM()
        msg['Subject'] = subject

        try:
            ces = getattr(pf.company, 'email_settings', None)
        except Exception:
            ces = None

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

        if ces:
            sig_lines = []
            if getattr(ces, 'default_sender_name', None):
                sig_lines.append(str(ces.default_sender_name))
            if getattr(ces, 'default_sender_phone', None):
                sig_lines.append(str(ces.default_sender_phone))
            if sig_lines and (body or '').find('--') == -1:
                body = (body or '') + "<br><br>--<br>" + "<br>".join(sig_lines)

        is_html = (body and ('<' in body and '>' in body))
        if is_html:
            msg.set_content("HTML-only e-mail")
            msg.add_alternative(body, subtype='html')
        else:
            msg.set_content(body)

        cust_name = getattr(pf.customer, 'name', '') or ''
        cust_prefix = cust_name[:5] or 'Client'
        filename = f"{cust_prefix}_{pf.proforma_number or 'dijbekero'}.pdf"
        msg.add_attachment(pdf_buf.read(), maintype='application', subtype='pdf', filename=filename)

        # SMTP
        host = (ces.smtp_host if ces and ces.smtp_host else None) or os.environ.get('SMTP_HOST') or os.environ.get('EMAIL_HOST')
        port = int((ces.smtp_port if ces and ces.smtp_port else None) or os.environ.get('SMTP_PORT') or os.environ.get('EMAIL_PORT') or 587)
        user = (ces.smtp_user if ces and ces.smtp_user else None) or os.environ.get('SMTP_USER') or os.environ.get('EMAIL_HOST_USER')
        pwd = (ces.smtp_password if ces and ces.smtp_password else None) or os.environ.get('SMTP_PASSWORD') or os.environ.get('EMAIL_HOST_PASSWORD')
        if ces and ces.smtp_use_tls is not None:
            use_tls = bool(ces.smtp_use_tls)
        else:
            use_tls = (os.environ.get('SMTP_USE_TLS', '1') == '1') or (os.environ.get('EMAIL_USE_TLS', '1') == '1')

        log(f"SMTP: Host={host}, Port={port}, User={user}, TLS={use_tls}")
        if not host or not user or not pwd:
            return Response({'error': 'SMTP beállítások hiányoznak (HOST/USER/PASSWORD)'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            log("Connecting to SMTP...")
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
            log("SMTP send success.")
        except Exception as e:
            log(f"SMTP Error: {e}")
            import traceback; traceback.print_exc()
            return Response({'error': f'E-mail küldési hiba: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # IMAP save to Sent
        try:
            imap_host = (ces.imap_host if ces and ces.imap_host else None) or os.environ.get('IMAP_HOST')
            imap_user = (ces.imap_user if ces and ces.imap_user else None) or os.environ.get('IMAP_USER') or user
            imap_pwd = (ces.imap_password if ces and ces.imap_password else None) or os.environ.get('IMAP_PASSWORD') or pwd
            imap_port = int((ces.imap_port if ces and getattr(ces, 'imap_port', None) else None) or os.environ.get('IMAP_PORT') or 993)
            sent_folder = (ces.imap_sent_folder if ces and ces.imap_sent_folder else None) or os.environ.get('IMAP_SENT_FOLDER') or 'Sent'
            if imap_host and imap_user and imap_pwd:
                log(f"Saving to IMAP {imap_host}")
                raw = msg.as_bytes()
                try:
                    M = imaplib.IMAP4_SSL(imap_host, imap_port)
                except Exception:
                    try:
                        M = imaplib.IMAP4(imap_host, 143)
                        M.starttls(ssl_context=ssl.create_default_context())
                    except Exception:
                        M = imaplib.IMAP4(imap_host)
                M.login(imap_user, imap_pwd)
                try:
                    M.append(sent_folder, '(\\Seen)', None, raw)
                except Exception:
                    pass
                M.logout()
        except Exception as e:
            log(f"IMAP save error: {e}")

        return Response({'success': True})


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

    def retrieve(self, request, *args, **kwargs):
        batch = self.get_object()
        data = PaymentBatchSerializer(batch).data
        enriched = self._enrich_batch_export_accounts([batch], [data])
        return Response(enriched[0] if enriched else data)

    # Ismert országok IBAN hosszai
    _IBAN_LENGTHS = {'HU': 28, 'DE': 22, 'AT': 20, 'SK': 24, 'RO': 24, 'CZ': 24,
                     'PL': 28, 'HR': 21, 'SI': 19, 'RS': 22, 'UA': 29}

    def _validate_and_classify_iban(self, iban_str):
        """IBAN érvényesítés hossz alapján. Hibás hosszúságú (pl. HU+18 jegy=20 char)
        IBAN-t BBAN/OTHER-ré alakít, hogy <Othr> tagként kerüljön az XML-be."""
        upper = iban_str.upper()
        country = upper[:2]
        expected = self._IBAN_LENGTHS.get(country)
        if expected and len(upper) != expected:
            # Érvénytelen IBAN hossz → levágjuk az országkód+ellenőrző jegyeket
            bban = re.sub(r'^[A-Z]{2}\d{2}', '', upper)
            if re.match(r'^\d{24}$', bban):
                return 'BBAN', bban
            return 'OTHER', bban or upper
        return 'IBAN', upper

    def _normalize_export_account(self, raw_account):
        clean_account = str(raw_account or '').strip().replace(' ', '').replace('-', '')
        if not clean_account:
            return None, None
        upper = clean_account.upper()
        if re.match(r'^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$', upper):
            return self._validate_and_classify_iban(upper)
        if re.match(r'^\d{24}$', clean_account):
            return 'BBAN', clean_account
        return 'OTHER', clean_account

    def _pick_customer_bank_account(self, customer, preferred_currency=None):
        if not customer:
            return None
        qs = customer.bank_accounts
        if preferred_currency:
            # BBAN (account_number kitöltött) előnyt élvez IBAN felett → belföldi, olcsóbb
            cand = qs.filter(currency=preferred_currency, is_primary=True).exclude(account_number='').exclude(account_number=None).first()
            if cand:
                return cand
            cand = qs.filter(currency=preferred_currency, is_primary=True).first()
            if cand:
                return cand
            cand = qs.filter(currency=preferred_currency).exclude(account_number='').exclude(account_number=None).first()
            if cand:
                return cand
            cand = qs.filter(currency=preferred_currency).first()
            if cand:
                return cand
        cand = qs.filter(is_primary=True).exclude(account_number='').exclude(account_number=None).first()
        if cand:
            return cand
        return qs.filter(is_primary=True).first() or qs.first()

    def _resolve_payment_batch_item_account(self, batch, batch_item):
        acct_type = None
        account = None
        swift_bic = None

        # Kizárólag a CRM törzsből vesszük a bankszámlaszámot
        def _get_customer_candidates():
            supplier_tax_raw = str(batch_item.supplier_tax_number or '').strip()
            supplier_name_raw = str(batch_item.supplier_name or '').strip()
            normalized_tax = re.sub(r'[^A-Za-z0-9]', '', supplier_tax_raw).upper() if supplier_tax_raw else ''
            digit_tax = ''.join(ch for ch in supplier_tax_raw if ch.isdigit()) if supplier_tax_raw else ''
            tax8 = digit_tax[:8] if len(digit_tax) >= 8 else ''
            candidates = []
            if supplier_tax_raw or normalized_tax or tax8:
                tax_q = Q()
                for value in {supplier_tax_raw, normalized_tax}:
                    if not value:
                        continue
                    tax_q |= Q(tax_number__iexact=value)
                    tax_q |= Q(full_tax_number__iexact=value)
                    tax_q |= Q(vat_group_member_tax_number__iexact=value)
                    tax_q |= Q(eu_tax_number__iexact=value)
                if tax8:
                    tax_q |= Q(tax_number__iexact=tax8)
                    tax_q |= Q(full_tax_number__istartswith=tax8)
                    tax_q |= Q(vat_group_member_tax_number__istartswith=tax8)
                if tax_q:
                    candidates = list(Customer.objects.filter(tax_q).distinct()[:20])
            if not candidates and supplier_name_raw:
                by_exact_name = list(Customer.objects.filter(name__iexact=supplier_name_raw)[:10])
                candidates = by_exact_name or list(Customer.objects.filter(name__icontains=supplier_name_raw)[:10])
            return candidates

        try:
            candidates = _get_customer_candidates()
            for customer in candidates:
                bank_acc = self._pick_customer_bank_account(customer, batch_item.currency or batch.currency)
                if not bank_acc:
                    continue
                raw = (bank_acc.account_number or '').strip() or (bank_acc.iban or '').strip()
                acct_type, account = self._normalize_export_account(raw)
                if account:
                    swift_bic = (bank_acc.swift_bic or '').strip() or None
                    break
        except Exception:
            pass

        return acct_type, account, swift_bic

    def _enrich_batch_export_accounts(self, batch_queryset, serialized_batches):
        try:
            batch_map = {str(b.id): b for b in batch_queryset}
            for batch_data in serialized_batches:
                batch_obj = batch_map.get(str(batch_data.get('id')))
                if not batch_obj:
                    continue
                item_map = {str(it.id): it for it in batch_obj.items.all()}
                for item_data in (batch_data.get('items') or []):
                    item_obj = item_map.get(str(item_data.get('id')))
                    if not item_obj:
                        continue
                    acct_type, account, swift_bic = self._resolve_payment_batch_item_account(batch_obj, item_obj)
                    item_data['export_account'] = account
                    item_data['export_account_type'] = acct_type
                    item_data['export_account_missing'] = not bool(account)
                    item_data['export_swift_bic'] = swift_bic
                    item_data['export_missing_swift'] = (acct_type not in ('IBAN', None) and not swift_bic)
        except Exception:
            pass
        return serialized_batches

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
            acct_type, account, swift_bic = self._resolve_payment_batch_item_account(batch, it)
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
                    'first_invoice': it.invoice_number,
                    'swift_bic': swift_bic,
                }
            elif not grouped_data[key]['swift_bic'] and swift_bic:
                grouped_data[key]['swift_bic'] = swift_bic
            
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
                'swift_bic': data.get('swift_bic'),
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
                    upper = clean_account.upper()
                    if re.match(r'^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$', upper):
                        return self._validate_and_classify_iban(upper)
                    elif re.match(r'^\d{24}$', clean_account):  # 24 számjegy (8+8+8 kötőjel nélkül)
                        return 'BBAN', clean_account
                    else:
                        return 'OTHER', clean_account
            return None, None
        try:
            # Először tisztítsuk meg az XML-t szóközöktől
            clean_xml = xml_text.replace(' ', '').replace('-', '')
            # Prefer BBAN (24 jegyű magyar számlaszám) → belföldi, olcsóbb utalás
            acct_match = re.search(r'\b\d{24}\b', clean_xml)
            if acct_match:
                return 'BBAN', acct_match.group(0)
            # Fallback: IBAN (külföldi vagy IBAN-formátumú hazai) — hossz validációval
            iban_match = re.search(r'\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b', clean_xml)
            if iban_match:
                return self._validate_and_classify_iban(iban_match.group(0))
            
            # Ha nincs az XML-ben, próbáljuk az ügyféltörzsből
            if company and supplier_tax_number:
                account = get_supplier_bank_account_for_invoice(company, supplier_tax_number, xml_text, preferred_currency)
                if account:
                    # Tisztítjuk és detektáljuk az account típusát
                    clean_account = account.replace(' ', '').replace('-', '')
                    upper = clean_account.upper()
                    if re.match(r'^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$', upper):
                        return self._validate_and_classify_iban(upper)
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
        from invoices.models import IncomingProforma
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
            # Also mark matching proformas as paid
            pqs = IncomingProforma.objects.filter(company=batch.company, proforma_number=it.invoice_number, status='unpaid')
            if it.supplier_tax_number:
                pqs = pqs.filter(supplier_tax_number=it.supplier_tax_number)
            pqs.update(status='paid', payment_date=today)
        try:
            if batch.status != 'EXPORTED':
                batch.status = 'EXPORTED'
                batch.save(update_fields=['status', 'updated_at'])
        except Exception:
            pass
        return Response({'success': True, 'updated': total_updated, 'payment_date': str(today)})

    @action(detail=True, methods=['delete'], url_path='delete')
    def delete_batch(self, request, pk=None):
        from invoices.models import IncomingProforma
        batch = self.get_object()
        company = batch.company
        batch_id = batch.id
        affected_items = list(batch.items.values('invoice_number', 'supplier_tax_number'))
        batch.delete()

        # If a removed batch item has no remaining payment linkage, reset paid markers.
        instant_methods = {'cash', 'card', 'voucher', 'other', 'utanvet'}
        seen = set()
        for raw in affected_items:
            invoice_number = str(raw.get('invoice_number') or '').strip()
            supplier_tax_number = str(raw.get('supplier_tax_number') or '').strip()
            if not invoice_number:
                continue
            key = (invoice_number, supplier_tax_number)
            if key in seen:
                continue
            seen.add(key)

            digest_qs = IncomingInvoiceDigest.objects.filter(company=company, invoice_number=invoice_number)
            if supplier_tax_number:
                digest_qs = digest_qs.filter(supplier_tax_number=supplier_tax_number)
            for digest in digest_qs:
                other_batch_qs = PaymentBatchItem.objects.filter(
                    batch__company=company,
                    invoice_number=digest.invoice_number,
                ).exclude(batch_id=batch_id)
                if digest.supplier_tax_number:
                    other_batch_qs = other_batch_qs.filter(supplier_tax_number=digest.supplier_tax_number)
                has_other_batch_item = other_batch_qs.exists()
                has_bank_item = BankStatementItem.objects.filter(
                    bank_statement__company=company,
                    incoming_invoice=digest,
                ).exists()
                if has_other_batch_item or has_bank_item:
                    continue

                payment_method = str(digest.payment_method or '').strip().lower()
                if payment_method in instant_methods:
                    continue

                update_fields = []
                if digest.payment_date is not None:
                    digest.payment_date = None
                    update_fields.append('payment_date')
                if str(digest.payment_status or '').lower() in ('paid', 'partially_paid'):
                    digest.payment_status = 'unpaid'
                    update_fields.append('payment_status')
                if decimal.Decimal(str(digest.amount_paid or 0)) != decimal.Decimal('0'):
                    digest.amount_paid = decimal.Decimal('0')
                    update_fields.append('amount_paid')
                if digest.payment_reference:
                    digest.payment_reference = None
                    update_fields.append('payment_reference')
                if update_fields:
                    digest.save(update_fields=update_fields)

            proforma_qs = IncomingProforma.objects.filter(company=company, proforma_number=invoice_number)
            if supplier_tax_number:
                proforma_qs = proforma_qs.filter(supplier_tax_number=supplier_tax_number)
            for proforma in proforma_qs:
                other_batch_qs = PaymentBatchItem.objects.filter(
                    batch__company=company,
                    invoice_number=proforma.proforma_number,
                ).exclude(batch_id=batch_id)
                if proforma.supplier_tax_number:
                    other_batch_qs = other_batch_qs.filter(supplier_tax_number=proforma.supplier_tax_number)
                if other_batch_qs.exists():
                    continue

                p_update = []
                if proforma.status == 'paid':
                    proforma.status = 'unpaid'
                    p_update.append('status')
                if proforma.payment_date is not None:
                    proforma.payment_date = None
                    p_update.append('payment_date')
                if decimal.Decimal(str(proforma.amount_paid or 0)) != decimal.Decimal('0'):
                    proforma.amount_paid = decimal.Decimal('0')
                    p_update.append('amount_paid')
                if p_update:
                    proforma.save(update_fields=p_update)

        return Response({'success': True})

    @action(detail=False, methods=['post'], url_path='list-pending')
    def list_pending(self, request):
        company_id = request.data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        qs = PaymentBatch.objects.filter(company_id=company_id, status='PENDING').order_by('-created_at')
        data = PaymentBatchSerializer(qs, many=True).data
        data = self._enrich_batch_export_accounts(qs, data)
        return Response(data)

    @action(detail=False, methods=['post'], url_path='list-completed')
    def list_completed(self, request):
        company_id = request.data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        if not company_id:
            return Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        qs = PaymentBatch.objects.filter(company_id=company_id).exclude(status='PENDING').order_by('-created_at')
        data = PaymentBatchSerializer(qs, many=True).data
        data = self._enrich_batch_export_accounts(qs, data)
        return Response(data)

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
class IncomingProformaViewSet(viewsets.ViewSet):
    """CRUD + actions for incoming proforma invoices (bőjövő díjbekérők)."""
    permission_classes = []

    # ── helpers ──────────────────────────────────────────────────────────
    def _get_company(self, company_id, request):
        from invoices.models import Company
        cid = company_id or (getattr(request, 'company', None) and str(request.company.id))
        if not cid:
            return None, Response({'error': 'company_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Company.objects.get(id=cid), None
        except Company.DoesNotExist:
            return None, Response({'error': 'Cég nem található'}, status=status.HTTP_400_BAD_REQUEST)

    def _proforma_to_dict(self, p):
        links = list(p.invoice_links.values('id', 'invoice_number', 'supplier_tax_number', 'supplier_name', 'allocated_amount', 'currency'))
        for lnk in links:
            lnk['id'] = str(lnk['id'])
            lnk['allocated_amount'] = str(lnk['allocated_amount'])
        docs = []
        for d in p.documents.all():
            try:
                file_url = d.file.url if d.file else None
            except Exception:
                file_url = None
            docs.append({'id': str(d.id), 'type': d.type, 'original_name': d.original_name, 'file_url': file_url, 'comment': d.comment, 'size': d.size, 'uploaded_at': d.uploaded_at.isoformat() if d.uploaded_at else None})
        gross = p.gross_amount or 0
        allocated = sum(float(lnk['allocated_amount']) for lnk in links)
        remaining = float(gross) - allocated
        return {
            'id': str(p.id),
            'proforma_number': p.proforma_number,
            'supplier_tax_number': p.supplier_tax_number,
            'supplier_name': p.supplier_name,
            'issue_date': p.issue_date.isoformat() if p.issue_date else None,
            'due_date': p.due_date.isoformat() if p.due_date else None,
            'delivery_date': p.delivery_date.isoformat() if p.delivery_date else None,
            'payment_method': (p.payment_method or '').upper(),
            'currency': (p.currency or 'HUF').upper(),
            'exchange_rate': str(p.exchange_rate) if p.exchange_rate is not None else '1',
            'net_amount': str(p.net_amount or 0),
            'vat_amount': str(p.vat_amount or 0),
            'gross_amount': str(p.gross_amount or 0),
            'status': p.status,
            'payment_date': p.payment_date.isoformat() if p.payment_date else None,
            'amount_paid': str(p.amount_paid or 0),
            'comment': p.comment or '',
            'invoice_links': links,
            'documents': docs,
            'allocated_amount': str(allocated),
            'remaining_amount': str(remaining),
            'is_fully_covered': remaining <= 0.005,
        }

    # ── list ─────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get', 'post'], url_path='list')
    def list_proformas(self, request):
        from invoices.models import IncomingProforma
        data = request.data if request.method == 'POST' else request.query_params
        company_id = data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        qs = IncomingProforma.objects.filter(company=company)
        search = data.get('search') or ''
        if search:
            qs = qs.filter(
                Q(proforma_number__icontains=search) |
                Q(supplier_name__icontains=search) |
                Q(supplier_tax_number__icontains=search)
            )

        # Self-heal stale paid statuses: when no completed batch item backs the proforma,
        # keep transfer-based proformas unpaid. This also fixes already-deleted historic batches.
        try:
            instant_methods = {'CASH', 'CARD', 'VOUCHER', 'OTHER', 'UTANVET'}
            stale_rows = list(
                qs.filter(status__in=['paid', 'invoiced'])
                .only('id', 'proforma_number', 'supplier_tax_number', 'payment_method', 'status', 'payment_date', 'amount_paid', 'gross_amount')
                .prefetch_related('invoice_links')
            )
            invoice_numbers = {str(p.proforma_number or '').strip() for p in stale_rows if str(p.proforma_number or '').strip()}
            item_keys = set()
            if invoice_numbers:
                item_values = PaymentBatchItem.objects.filter(
                    batch__company=company,
                    invoice_number__in=list(invoice_numbers),
                ).exclude(batch__status='PENDING').values('invoice_number', 'supplier_tax_number')
                item_keys = {
                    (
                        str(v.get('invoice_number') or '').strip(),
                        str(v.get('supplier_tax_number') or '').strip(),
                    )
                    for v in item_values
                }

            for p in stale_rows:
                inv_no = str(p.proforma_number or '').strip()
                supp_tax = str(p.supplier_tax_number or '').strip()
                if not inv_no:
                    continue

                try:
                    gross = decimal.Decimal(str(p.gross_amount or 0))
                except Exception:
                    gross = decimal.Decimal('0')
                allocated = decimal.Decimal('0')
                for lnk in p.invoice_links.all():
                    try:
                        allocated += decimal.Decimal(str(lnk.allocated_amount or 0))
                    except Exception:
                        continue
                fully_covered = allocated >= (gross - decimal.Decimal('0.005'))

                pm = str(p.payment_method or '').upper()
                if supp_tax:
                    # When proforma has supplier tax number, accept only exact tax-number match.
                    has_batch_payment = ((inv_no, supp_tax) in item_keys)
                else:
                    # Without tax number we can only match by invoice/proforma number.
                    has_batch_payment = any(k[0] == inv_no for k in item_keys)

                target_status = p.status
                target_payment_date = p.payment_date
                target_amount_paid = p.amount_paid

                if fully_covered:
                    target_status = 'invoiced'
                elif pm in instant_methods or has_batch_payment:
                    target_status = 'paid'
                    if target_amount_paid is None or decimal.Decimal(str(target_amount_paid or 0)) <= decimal.Decimal('0'):
                        target_amount_paid = gross
                else:
                    target_status = 'unpaid'
                    target_payment_date = None
                    target_amount_paid = decimal.Decimal('0')

                update_fields = []
                if p.status != target_status:
                    p.status = target_status
                    update_fields.append('status')
                if p.payment_date != target_payment_date:
                    p.payment_date = target_payment_date
                    update_fields.append('payment_date')
                try:
                    current_amount_paid = decimal.Decimal(str(p.amount_paid or 0))
                    desired_amount_paid = decimal.Decimal(str(target_amount_paid or 0))
                    if current_amount_paid != desired_amount_paid:
                        p.amount_paid = desired_amount_paid
                        update_fields.append('amount_paid')
                except Exception:
                    pass
                if update_fields:
                    p.save(update_fields=list(dict.fromkeys(update_fields + ['updated_at'])))
        except Exception:
            pass

        status_filter = data.get('status') or ''
        if status_filter and status_filter != 'all':
            qs = qs.filter(status=status_filter)
        page = max(1, int(data.get('page', 1) or 1))
        page_size = min(500, max(10, int(data.get('page_size', 50) or 50)))
        total = qs.count()
        offset = (page - 1) * page_size
        rows = list(qs.prefetch_related('invoice_links', 'documents')[offset:offset + page_size])
        return Response({'count': total, 'page': page, 'page_size': page_size, 'results': [self._proforma_to_dict(p) for p in rows]})

    # ── get single ───────────────────────────────────────────────────────
    @action(detail=False, methods=['get', 'post'], url_path='get')
    def get_proforma(self, request):
        from invoices.models import IncomingProforma
        data = request.data if request.method == 'POST' else request.query_params
        company_id = data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        proforma_id = data.get('id') or data.get('proforma_id') or request.query_params.get('id')
        company, err = self._get_company(company_id, request)
        if err:
            return err
        try:
            p = IncomingProforma.objects.prefetch_related('invoice_links', 'documents').get(id=proforma_id, company=company)
        except IncomingProforma.DoesNotExist:
            return Response({'error': 'Díjbekérő nem található'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._proforma_to_dict(p))

    # ── create ───────────────────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='create')
    def create_proforma(self, request):
        from invoices.models import IncomingProforma
        import decimal
        import datetime
        from django.db import DataError, IntegrityError
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        proforma_number = str(data.get('proforma_number') or '').strip()
        if not proforma_number:
            return Response({'error': 'Díjbekérő száma kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        def txt(v, max_len=None):
            val = str(v or '').strip()
            if not val:
                return None
            if max_len:
                return val[:max_len]
            return val

        def parse_date(v):
            val = str(v or '').strip()
            if not val:
                return None
            for fmt in ('%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d', '%d.%m.%Y', '%d/%m/%Y', '%d-%m-%Y', '%Y%m%d'):
                try:
                    return datetime.datetime.strptime(val, fmt).date()
                except Exception:
                    continue
            return None

        def d(v):
            try:
                return decimal.Decimal(str(v or 0))
            except Exception:
                return decimal.Decimal('0')
        net = d(data.get('net_amount', 0))
        vat = d(data.get('vat_amount', 0))
        gross = d(data.get('gross_amount', 0)) or (net + vat)
        try:
            p = IncomingProforma.objects.create(
                company=company,
                proforma_number=txt(proforma_number, 100),
                supplier_tax_number=txt(data.get('supplier_tax_number'), 30),
                supplier_name=txt(data.get('supplier_name'), 300),
                issue_date=parse_date(data.get('issue_date')),
                due_date=parse_date(data.get('due_date')),
                delivery_date=parse_date(data.get('delivery_date')),
                payment_method=(txt(data.get('payment_method') or 'TRANSFER', 30) or 'TRANSFER').upper(),
                currency=(txt(data.get('currency') or 'HUF', 10) or 'HUF').upper(),
                exchange_rate=d(data.get('exchange_rate') or 1) or decimal.Decimal('1'),
                net_amount=net,
                vat_amount=vat,
                gross_amount=gross,
                comment=txt(data.get('comment')),
                status='unpaid',
            )
        except (DataError, IntegrityError) as e:
            return Response({'error': f'Érvénytelen adat: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._proforma_to_dict(p), status=status.HTTP_201_CREATED)

    # ── update ───────────────────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='update')
    def update_proforma(self, request):
        from invoices.models import IncomingProforma
        import decimal
        import datetime
        from django.db import DataError, IntegrityError
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        proforma_id = data.get('id') or data.get('proforma_id')
        if not proforma_id:
            return Response({'error': 'id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            p = IncomingProforma.objects.get(id=proforma_id, company=company)
        except IncomingProforma.DoesNotExist:
            return Response({'error': 'Díjbekérő nem található'}, status=status.HTTP_404_NOT_FOUND)

        def txt(v, max_len=None):
            val = str(v or '').strip()
            if not val:
                return None
            if max_len:
                return val[:max_len]
            return val

        def parse_date(v, fallback=None):
            if v in (None, ''):
                return fallback
            val = str(v or '').strip()
            for fmt in ('%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d', '%d.%m.%Y', '%d/%m/%Y', '%d-%m-%Y', '%Y%m%d'):
                try:
                    return datetime.datetime.strptime(val, fmt).date()
                except Exception:
                    continue
            return fallback

        def d(v):
            try:
                return decimal.Decimal(str(v or 0))
            except Exception:
                return decimal.Decimal('0')
        net = d(data.get('net_amount', p.net_amount))
        vat = d(data.get('vat_amount', p.vat_amount))
        gross = d(data.get('gross_amount', 0)) or (net + vat)
        fields = ['proforma_number', 'supplier_tax_number', 'supplier_name', 'issue_date', 'due_date',
                  'delivery_date', 'payment_method', 'currency', 'exchange_rate', 'net_amount', 'vat_amount',
                  'gross_amount', 'comment', 'updated_at']
        p.proforma_number = txt(data.get('proforma_number') or p.proforma_number, 100)
        p.supplier_tax_number = txt(data.get('supplier_tax_number'), 30)
        p.supplier_name = txt(data.get('supplier_name'), 300)
        p.issue_date = parse_date(data.get('issue_date'), p.issue_date)
        p.due_date = parse_date(data.get('due_date'), p.due_date)
        p.delivery_date = parse_date(data.get('delivery_date'), None)
        p.payment_method = (txt(data.get('payment_method') or p.payment_method or 'TRANSFER', 30) or 'TRANSFER').upper()
        p.currency = (txt(data.get('currency') or p.currency or 'HUF', 10) or 'HUF').upper()
        p.exchange_rate = d(data.get('exchange_rate') or p.exchange_rate or 1)
        p.net_amount = net
        p.vat_amount = vat
        p.gross_amount = gross
        p.comment = txt(data.get('comment'))
        try:
            p.save(update_fields=fields)
        except (DataError, IntegrityError) as e:
            return Response({'error': f'Érvénytelen adat: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        p.refresh_from_db()
        return Response(self._proforma_to_dict(IncomingProforma.objects.prefetch_related('invoice_links', 'documents').get(id=p.id)))

    # ── delete ───────────────────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='delete')
    def delete_proforma(self, request):
        from invoices.models import IncomingProforma
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        proforma_id = data.get('id') or data.get('proforma_id')
        if not proforma_id:
            return Response({'error': 'id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            p = IncomingProforma.objects.get(id=proforma_id, company=company)
        except IncomingProforma.DoesNotExist:
            return Response({'error': 'Díjbekérő nem található'}, status=status.HTTP_404_NOT_FOUND)
        p.delete()
        return Response({'success': True})

    # ── set status ───────────────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='set-status')
    def set_status(self, request):
        from invoices.models import IncomingProforma
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        proforma_id = data.get('id') or data.get('proforma_id')
        new_status = str(data.get('status') or '').lower()
        if new_status not in ('unpaid', 'paid', 'invoiced'):
            return Response({'error': 'Hibás státusz. Lehető: unpaid, paid, invoiced'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            p = IncomingProforma.objects.get(id=proforma_id, company=company)
        except IncomingProforma.DoesNotExist:
            return Response({'error': 'Díjbekérő nem található'}, status=status.HTTP_404_NOT_FOUND)
        update_fields = ['status', 'updated_at']
        p.status = new_status
        if new_status == 'paid' and not p.payment_date:
            p.payment_date = timezone.localdate()
            update_fields.append('payment_date')
        p.save(update_fields=update_fields)
        return Response({'success': True, 'status': p.status})

    # ── set payment method ───────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='set-payment-method')
    def set_payment_method(self, request):
        from invoices.models import IncomingProforma
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        proforma_id = data.get('id') or data.get('proforma_id')
        pm = str(data.get('payment_method') or '').strip().upper()
        allowed = {'TRANSFER', 'CASH', 'CARD', 'VOUCHER', 'OTHER', 'UTANVET'}
        if pm not in allowed:
            return Response({'error': 'Hibás fizetési mód'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            p = IncomingProforma.objects.get(id=proforma_id, company=company)
        except IncomingProforma.DoesNotExist:
            return Response({'error': 'Díjbekérő nem található'}, status=status.HTTP_404_NOT_FOUND)
        p.payment_method = pm
        update_fields = ['payment_method', 'updated_at']
        if pm in ('CASH', 'CARD', 'VOUCHER', 'OTHER', 'UTANVET'):
            if not p.payment_date:
                p.payment_date = p.issue_date or timezone.localdate()
                update_fields.append('payment_date')
            p.status = 'paid'
            update_fields.append('status')
        p.save(update_fields=update_fields)
        return Response({'success': True, 'payment_method': p.payment_method, 'status': p.status})

    # ── mark paid directly ───────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='mark-paid')
    def mark_paid_direct(self, request):
        from invoices.models import IncomingProforma
        import decimal
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        proforma_id = data.get('id') or data.get('proforma_id')
        payment_date = data.get('payment_date') or timezone.localdate().isoformat()
        try:
            p = IncomingProforma.objects.get(id=proforma_id, company=company)
        except IncomingProforma.DoesNotExist:
            return Response({'error': 'Díjbekérő nem található'}, status=status.HTTP_404_NOT_FOUND)
        p.status = 'paid'
        p.payment_date = payment_date
        p.amount_paid = p.gross_amount or decimal.Decimal('0')
        p.save(update_fields=['status', 'payment_date', 'amount_paid', 'updated_at'])
        return Response({'success': True, 'status': p.status, 'payment_date': str(p.payment_date)})

    # ── invoice links ────────────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='add-invoice-link')
    def add_invoice_link(self, request):
        from invoices.models import IncomingProforma, IncomingProformaInvoiceLink
        import decimal
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        proforma_id = data.get('proforma_id') or data.get('id')
        invoice_number = str(data.get('invoice_number') or '').strip()
        supplier_tax_number = str(data.get('supplier_tax_number') or '').strip() or None
        supplier_name = str(data.get('supplier_name') or '').strip() or None
        allocated_amount = data.get('allocated_amount', 0)
        currency = str(data.get('currency') or 'HUF').strip().upper()
        if not proforma_id or not invoice_number:
            return Response({'error': 'proforma_id és invoice_number kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            p = IncomingProforma.objects.get(id=proforma_id, company=company)
        except IncomingProforma.DoesNotExist:
            return Response({'error': 'Díjbekérő nem található'}, status=status.HTTP_404_NOT_FOUND)
        try:
            amt = decimal.Decimal(str(allocated_amount or 0))
        except Exception:
            amt = decimal.Decimal('0')
        link, created = IncomingProformaInvoiceLink.objects.update_or_create(
            proforma=p,
            invoice_number=invoice_number,
            supplier_tax_number=supplier_tax_number,
            defaults={'allocated_amount': amt, 'currency': currency, 'supplier_name': supplier_name or ''}
        )
        # Auto set status to invoiced if fully covered
        total_allocated = sum(float(x.allocated_amount) for x in p.invoice_links.all())
        if total_allocated >= float(p.gross_amount or 0) - 0.005:
            p.status = 'invoiced'
            p.save(update_fields=['status', 'updated_at'])
        p.refresh_from_db()
        return Response(self._proforma_to_dict(IncomingProforma.objects.prefetch_related('invoice_links', 'documents').get(id=p.id)))

    @action(detail=False, methods=['post'], url_path='remove-invoice-link')
    def remove_invoice_link(self, request):
        from invoices.models import IncomingProforma, IncomingProformaInvoiceLink
        data = request.data or {}
        company_id = data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        link_id = data.get('link_id')
        proforma_id = data.get('proforma_id')
        if not link_id:
            return Response({'error': 'link_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            link = IncomingProformaInvoiceLink.objects.get(id=link_id, proforma__company=company)
        except IncomingProformaInvoiceLink.DoesNotExist:
            return Response({'error': 'Kapcsolódó számla link nem található'}, status=status.HTTP_404_NOT_FOUND)
        p = link.proforma
        link.delete()
        # Revert invoiced status if no longer covered
        p.refresh_from_db()
        total_allocated = sum(float(x.allocated_amount) for x in p.invoice_links.all())
        if p.status == 'invoiced' and total_allocated < float(p.gross_amount or 0) - 0.005:
            p.status = 'paid' if p.payment_date else 'unpaid'
            p.save(update_fields=['status', 'updated_at'])
        return Response(self._proforma_to_dict(IncomingProforma.objects.prefetch_related('invoice_links', 'documents').get(id=p.id)))

    # ── suggest invoices (by supplier tax number) ─────────────────────
    @action(detail=False, methods=['get', 'post'], url_path='suggest-invoices')
    def suggest_invoices(self, request):
        from invoices.models import IncomingInvoiceDigest, IncomingProforma, Customer
        import unicodedata
        data = request.data if request.method == 'POST' else request.query_params
        company_id = data.get('company_id') or request.query_params.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        proforma_id = data.get('proforma_id') or data.get('id')
        supplier_customer_id = data.get('supplier_customer_id') or data.get('customer_id')
        supplier_tax_number = data.get('supplier_tax_number') or ''
        search = data.get('search') or ''

        proforma_obj = None
        if proforma_id:
            try:
                proforma_obj = IncomingProforma.objects.filter(company=company, id=proforma_id).first()
            except Exception:
                proforma_obj = None
        if proforma_obj and not supplier_tax_number:
            supplier_tax_number = proforma_obj.supplier_tax_number or ''

        supplier_customer = None
        if supplier_customer_id:
            try:
                supplier_customer = Customer.objects.filter(id=supplier_customer_id).first()
            except Exception:
                supplier_customer = None
        if supplier_customer and not supplier_tax_number:
            supplier_tax_number = (
                supplier_customer.tax_number
                or supplier_customer.full_tax_number
                or supplier_customer.vat_group_member_tax_number
                or supplier_customer.eu_tax_number
                or ''
            )

        qs = IncomingInvoiceDigest.objects.filter(company=company)
        if supplier_tax_number:
            qs = qs.filter(supplier_tax_number__icontains=supplier_tax_number[:8])
        if proforma_obj and proforma_obj.issue_date:
            # Only invoices issued after the proforma date should be suggestable for linking.
            qs = qs.filter(invoice_issue_date__gt=proforma_obj.issue_date)
        if search:
            qs = qs.filter(Q(invoice_number__icontains=search) | Q(supplier_name__icontains=search))

        # Exclude invoices already linked to this proforma from suggestions.
        if proforma_obj:
            linked_numbers = list(proforma_obj.invoice_links.values_list('invoice_number', flat=True))
            if linked_numbers:
                qs = qs.exclude(invoice_number__in=linked_numbers)

        qs = qs.order_by('-invoice_issue_date')

        def _digits(v):
            return ''.join(ch for ch in str(v or '') if ch.isdigit())

        def _norm_name(v):
            txt = unicodedata.normalize('NFD', str(v or ''))
            txt = ''.join(ch for ch in txt if unicodedata.category(ch) != 'Mn')
            txt = ''.join(ch.lower() if ch.isalnum() or ch.isspace() else ' ' for ch in txt)
            return ' '.join(txt.split())

        crm_tax_digits = set()
        crm_name_norm = ''
        if supplier_customer:
            crm_name_norm = _norm_name(supplier_customer.name)
            for raw_tax in [
                supplier_customer.tax_number,
                supplier_customer.full_tax_number,
                supplier_customer.vat_group_member_tax_number,
                supplier_customer.eu_tax_number,
            ]:
                d = _digits(raw_tax)
                if d:
                    crm_tax_digits.add(d)
                    if len(d) >= 8:
                        crm_tax_digits.add(d[:8])

        def _match_supplier_by_crm(inv):
            if not supplier_customer:
                return True
            inv_tax = _digits(inv.supplier_tax_number)
            inv_tax8 = inv_tax[:8] if len(inv_tax) >= 8 else inv_tax

            if crm_tax_digits:
                for ct in crm_tax_digits:
                    if not ct:
                        continue
                    if inv_tax and (inv_tax == ct or inv_tax.startswith(ct) or ct.startswith(inv_tax)):
                        return True
                    if inv_tax8 and (inv_tax8 == ct or ct.startswith(inv_tax8) or inv_tax8.startswith(ct[:8])):
                        return True
                return False

            inv_name = _norm_name(inv.supplier_name)
            if crm_name_norm and inv_name:
                return inv_name == crm_name_norm or inv_name in crm_name_norm or crm_name_norm in inv_name
            return False

        results = []
        for inv in qs:
            if not _match_supplier_by_crm(inv):
                continue
            gross = float(inv.invoice_net_amount or 0) + float(inv.invoice_vat_amount or 0)
            results.append({
                'id': str(inv.id),
                'invoice_number': inv.invoice_number,
                'supplier_name': inv.supplier_name,
                'supplier_tax_number': inv.supplier_tax_number,
                'issue_date': inv.invoice_issue_date.isoformat() if inv.invoice_issue_date else None,
                'gross_amount': str(gross),
                'currency': (inv.currency or 'HUF').upper(),
                'status': inv.payment_status or 'unpaid',
            })
            if len(results) >= 50:
                break
        return Response({'results': results})

    # ── document upload ───────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='upload-document')
    def upload_document(self, request):
        from invoices.models import IncomingProforma, IncomingProformaDocument
        proforma_id = (
            request.data.get('proforma_id')
            or request.data.get('id')
            or request.POST.get('proforma_id')
            or request.POST.get('id')
            or request.query_params.get('proforma_id')
            or request.query_params.get('id')
        )
        file = (
            request.FILES.get('file')
            or request.FILES.get('document')
            or request.FILES.get('upload')
            or (next(iter(request.FILES.values())) if request.FILES else None)
        )
        doc_type = request.data.get('type', 'IMAGE')
        comment = request.data.get('comment', '')
        if not proforma_id or not file:
            return Response({
                'error': 'proforma_id és file kötelező',
                'debug': {
                    'proforma_id': proforma_id,
                    'data_keys': list(getattr(request, 'data', {}).keys()) if hasattr(request, 'data') else [],
                    'post_keys': list(getattr(request, 'POST', {}).keys()) if hasattr(request, 'POST') else [],
                    'file_keys': list(getattr(request, 'FILES', {}).keys()) if hasattr(request, 'FILES') else [],
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            p = IncomingProforma.objects.get(id=proforma_id)
        except IncomingProforma.DoesNotExist:
            return Response({'error': 'Díjbekérő nem található'}, status=status.HTTP_404_NOT_FOUND)
        doc = IncomingProformaDocument.objects.create(
            proforma=p,
            type=doc_type,
            file=file,
            original_name=file.name,
            content_type=getattr(file, 'content_type', '') or '',
            size=getattr(file, 'size', 0) or 0,
            comment=comment or None,
        )
        try:
            file_url = doc.file.url
        except Exception:
            file_url = None
        return Response({'success': True, 'id': str(doc.id), 'original_name': doc.original_name, 'file_url': file_url, 'type': doc.type, 'comment': doc.comment, 'size': doc.size})

    @action(detail=False, methods=['post'], url_path='delete-document')
    def delete_document(self, request):
        from invoices.models import IncomingProformaDocument
        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        doc_id = request.data.get('document_id')
        if not doc_id:
            return Response({'error': 'document_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            doc = IncomingProformaDocument.objects.get(id=doc_id, proforma__company=company)
        except IncomingProformaDocument.DoesNotExist:
            return Response({'error': 'Dokumentum nem található'}, status=status.HTTP_404_NOT_FOUND)
        doc.delete()
        return Response({'success': True})

    @action(detail=False, methods=['post'], url_path='set-document-comment')
    def set_document_comment(self, request):
        from invoices.models import IncomingProformaDocument
        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company, err = self._get_company(company_id, request)
        if err:
            return err
        doc_id = request.data.get('document_id')
        comment = request.data.get('comment', '')
        try:
            doc = IncomingProformaDocument.objects.get(id=doc_id, proforma__company=company)
        except IncomingProformaDocument.DoesNotExist:
            return Response({'error': 'Dokumentum nem található'}, status=status.HTTP_404_NOT_FOUND)
        doc.comment = comment
        doc.save(update_fields=['comment'])
        return Response({'success': True})

    # ── OCR parse document (reuse incoming logic) ─────────────────────
    @action(detail=False, methods=['post'], url_path='parse-document')
    def parse_document(self, request):
        from invoices.models import Customer

        company_id = request.data.get('company_id') or (getattr(request, 'company', None) and str(request.company.id))
        company = None
        if str(company_id or '').strip().lower() not in ('', 'undefined', 'null'):
            company, err = self._get_company(company_id, request)
            if err:
                return err
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'file kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        inv_vs = InvoiceViewSet()
        inv_vs.request = request
        extracted_text, extract_errors = inv_vs._incoming_extract_text_from_document(file)
        if not extracted_text:
            return Response({
                'success': False,
                'error': 'Nem sikerült olvasható szöveget kinyerni a fájlból.',
                'details': extract_errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        fields = inv_vs._incoming_extract_fields_from_text(extracted_text)
        if not fields.get('proforma_number'):
            raw_name = str(getattr(file, 'name', '') or '').strip()
            stem = re.sub(r'\.[^.]+$', '', raw_name)
            if stem and re.fullmatch(r'(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9\/_\-. ]{4,80}', stem):
                fields['proforma_number'] = stem.strip()

        def _norm_tax(v):
            return ''.join(ch for ch in str(v or '') if ch.isdigit())

        def _norm_name(v):
            return re.sub(r'\s+', ' ', str(v or '').strip().lower())

        def _norm_alnum(v):
            return re.sub(r'[^A-Z0-9]', '', str(v or '').upper())

        def _extract_supplier_contexts(text_value):
            txt_lines = [str(ln or '').strip() for ln in str(text_value or '').splitlines()]
            txt_lines = [ln for ln in txt_lines if ln]
            seller_re = re.compile(r'(seller|supplier|sprzedawc[ay]|issuer|vystavitel|vystavovatel|sz[aá]ll[ií]t[oó]|sz[aá]mlakibocs[aá]t[oó]|kibocs[aá]t[oó]|dod[aá]vate[ľl]|dodavatel)', re.IGNORECASE)
            buyer_re = re.compile(r'(buyer|customer|vev[őo]|el[őo]fizet[őo]|odberate[ľl])', re.IGNORECASE)
            table_re = re.compile(r'(commercial\s*invoice|invoice\s*no|nr\s+code\s+product|mennyis[eé]g|egys[eé]g[aá]r|total\s*:|line\s*total)', re.IGNORECASE)
            contexts = []
            for i, ln in enumerate(txt_lines):
                if not seller_re.search(ln):
                    continue
                chunk = [ln]
                for j in range(i + 1, min(len(txt_lines), i + 14)):
                    row = txt_lines[j]
                    if buyer_re.search(row) or table_re.search(row):
                        break
                    chunk.append(row)
                contexts.append(' '.join(chunk))
            return contexts

        def _match_supplier_in_contexts(qs, contexts, full_text):
            if not contexts:
                contexts = []
            context_norm = [_norm_name(c) for c in contexts if c]
            context_alnum = [_norm_alnum(c) for c in contexts if c]
            full_norm = _norm_name(full_text)
            full_alnum = _norm_alnum(full_text)
            best = None
            best_score = 0
            for cand in qs:
                score = 0
                cand_name = _norm_name(getattr(cand, 'name', None))
                cand_tax_raw = [
                    getattr(cand, 'tax_number', None),
                    getattr(cand, 'full_tax_number', None),
                    getattr(cand, 'eu_tax_number', None),
                    getattr(cand, 'vat_group_member_tax_number', None),
                ]
                cand_tax_digits = [_norm_tax(x) for x in cand_tax_raw if x]
                cand_tax_alnum = [_norm_alnum(x) for x in cand_tax_raw if x]

                for tax in cand_tax_digits:
                    if len(tax) < 8:
                        continue
                    if any(tax in c or c in tax for c in context_alnum if c):
                        score += 12
                    elif tax in full_alnum:
                        score += 5
                for tax in cand_tax_alnum:
                    if len(tax) < 8:
                        continue
                    if any(tax in c or c in tax for c in context_alnum if c):
                        score += 10
                    elif tax in full_alnum:
                        score += 4

                if cand_name and len(cand_name) >= 4:
                    if any(cand_name in c or c in cand_name for c in context_norm if c):
                        score += 6
                    elif cand_name in full_norm:
                        score += 2

                if score > best_score:
                    best_score = score
                    best = cand
            return best if best_score >= 6 else None

        def _find_supplier_match(qs):
            tax_value = _norm_tax(fields.get('supplier_tax_number'))
            if tax_value:
                for cand in qs:
                    cand_nums = [
                        _norm_tax(getattr(cand, 'tax_number', None)),
                        _norm_tax(getattr(cand, 'full_tax_number', None)),
                        _norm_tax(getattr(cand, 'eu_tax_number', None)),
                        _norm_tax(getattr(cand, 'vat_group_member_tax_number', None)),
                    ]
                    cand_nums = [n for n in cand_nums if n]
                    if any((n == tax_value) or (len(tax_value) >= 8 and n.startswith(tax_value[:8])) or (len(n) >= 8 and tax_value.startswith(n[:8])) for n in cand_nums):
                        return cand

            name_value = _norm_name(fields.get('supplier_name'))
            if name_value:
                by_exact = qs.filter(name__iexact=fields.get('supplier_name')).first()
                if by_exact:
                    return by_exact
                return qs.filter(name__icontains=fields.get('supplier_name')).first()
            return None

        all_supplier_qs = Customer.objects.filter(is_supplier=True) if hasattr(Customer, 'is_supplier') else Customer.objects.all()
        if company is not None:
            company_supplier_qs = _filter_customers_by_companies(all_supplier_qs, [str(company.id)])
            if not company_supplier_qs.exists():
                company_supplier_qs = _filter_customers_by_companies(Customer.objects.all(), [str(company.id)])
        else:
            company_supplier_qs = Customer.objects.none()

        matched_supplier = _find_supplier_match(company_supplier_qs)
        if not matched_supplier:
            matched_supplier = _find_supplier_match(all_supplier_qs)
        if not matched_supplier:
            all_customer_qs = Customer.objects.all()
            if company is not None:
                company_customer_qs = _filter_customers_by_companies(all_customer_qs, [str(company.id)])
                matched_supplier = _find_supplier_match(company_customer_qs) or _find_supplier_match(all_customer_qs)
            else:
                matched_supplier = _find_supplier_match(all_customer_qs)

        if not matched_supplier:
            contexts = _extract_supplier_contexts(extracted_text)
            matched_supplier = _match_supplier_in_contexts(company_supplier_qs, contexts, extracted_text)
            if not matched_supplier:
                matched_supplier = _match_supplier_in_contexts(all_supplier_qs, contexts, extracted_text)

        if matched_supplier:
            if not fields.get('supplier_name'):
                fields['supplier_name'] = getattr(matched_supplier, 'name', None)
            if not fields.get('supplier_tax_number'):
                fields['supplier_tax_number'] = (
                    getattr(matched_supplier, 'tax_number', None)
                    or getattr(matched_supplier, 'full_tax_number', None)
                    or getattr(matched_supplier, 'eu_tax_number', None)
                    or getattr(matched_supplier, 'vat_group_member_tax_number', None)
                )

        payload = {
            'proforma_number': fields.get('proforma_number') or fields.get('invoice_number'),
            'invoice_number': fields.get('invoice_number') or fields.get('proforma_number'),
            'issue_date': fields.get('issue_date'),
            'due_date': fields.get('due_date'),
            'delivery_date': fields.get('delivery_date'),
            'supplier_name': fields.get('supplier_name'),
            'supplier_tax_number': fields.get('supplier_tax_number'),
            'currency': fields.get('currency') or 'HUF',
            'payment_method': fields.get('payment_method') or 'transfer',
            'gross_total': (str(fields['gross_total']) if fields.get('gross_total') is not None else None),
            'net_total': (str(fields['net_total']) if fields.get('net_total') is not None else None),
            'vat_total': (str(fields['vat_total']) if fields.get('vat_total') is not None else None),
            'suggested_vat_rate': fields.get('suggested_vat_rate'),
            'items': fields.get('items') or [],
            'matched_supplier_id': (str(matched_supplier.id) if matched_supplier else None),
            'matched_supplier_name': (matched_supplier.name if matched_supplier else None),
        }

        return Response({
            'success': True,
            'fields': payload,
            'data': payload,
            'extract_warnings': extract_errors,
        })


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
            
            # Determine pg_restore command (prefer PG 16 if available to support newer backups)
            pg_restore_cmd = 'pg_restore'
            if os.path.exists('/usr/lib/postgresql/16/bin/pg_restore'):
                pg_restore_cmd = '/usr/lib/postgresql/16/bin/pg_restore'

            # Drop and recreate database (requires superuser or database owner)
            # Alternative: use --clean --if-exists with pg_restore
            cmd = [
                pg_restore_cmd,
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
            # Note: pg_restore uses 'error' (lowercase) or 'ERROR' depending on context/locale
            if result.returncode != 0 and ('ERROR' in result.stderr or 'error' in result.stderr or 'fatal' in result.stderr.lower()):
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
