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
from invoices.models import Customer, Invoice, InvoiceItem, NAVConfiguration, Contact, Company, SystemUser, InvoiceBlock, CompanyNAVConfiguration, CustomerBankAccount, CompanyBankAccount, VATType, BankStatement, BankStatementItem, ProformaInvoice, AdvanceAllocation, CompanyEmailSettings, PaymentBatch, PaymentBatchItem, IncomingInvoiceDigest, IncomingInvoiceData, APIAccessRule, APIClient, APIClientAccessRule, IncomingDocument, BackupConfiguration, BackupFile
from invoices.serializers import (
    CustomerSerializer, InvoiceSerializer, InvoiceCreateSerializer,
    InvoiceItemSerializer, NAVConfigurationSerializer, ContactSerializer, ContactCreateSerializer,
    CompanySerializer, SystemUserSerializer, SystemUserCreateSerializer, InvoiceBlockSerializer, CompanyNAVConfigurationSerializer,
    CustomerBankAccountSerializer, CompanyBankAccountSerializer, VATTypeSerializer, BankStatementSerializer,
    ProformaSerializer, ProformaCreateSerializer
)
from invoices.serializers import CompanyEmailSettingsSerializer, PaymentBatchSerializer, PaymentBatchItemSerializer, IncomingDocumentSerializer, BackupConfigurationSerializer, BackupFileSerializer
from invoices.nav_service import NAVService
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

logger = logging.getLogger(__name__)


class CustomerViewSet(viewsets.ModelViewSet):
    """ViewSet for managing customers"""
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = []  # Nincs autentikáció szükséges

    def get_queryset(self):
        queryset = Customer.objects.all()
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(tax_number__icontains=search) |
                Q(email__icontains=search)
            )
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
        data = request.data or {}
        to = data.get('to') or []
        cc = data.get('cc') or []
        bcc = data.get('bcc') or []
        subject = data.get('subject') or f"Számla {inv.invoice_number}"
        body = data.get('body')
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

        pdf_buf = io.BytesIO()
        if HTML:
            ctx = {
                'invoice': inv,
                'bilingual': (inv.currency or '').upper() != 'HUF',
            }
            html = render_to_string('invoices/print_invoice.html', ctx)
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
            c.showPage()
            c.save()

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
            en_subj = fill(getattr(ces, 'subject_template_en', None)) or f"Invoice {inv.invoice_number}"
            if subject and en_subj and en_subj not in subject:
                subject = f"{subject} / {en_subj}"
            if body and (getattr(ces, 'body_template_en', None)):
                body = body + "\n\n---\n\n" + fill(ces.body_template_en)
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
        # Append default sender signature if provided in settings and not already present
        if ces:
            sig_lines = []
            if getattr(ces, 'default_sender_name', None):
                sig_lines.append(str(ces.default_sender_name))
            if getattr(ces, 'default_sender_phone', None):
                sig_lines.append(str(ces.default_sender_phone))
            if sig_lines and (body or '').find('--') == -1:
                body = (body or '') + "\n--\n" + "\n".join(sig_lines)
        msg.set_content(body)

        filename = f"{inv.invoice_number or 'szamla'}.pdf"
        msg.add_attachment(pdf_buf.read(), maintype='application', subtype='pdf', filename=filename)

        host = (ces.smtp_host if ces and ces.smtp_host else None) or os.environ.get('SMTP_HOST')
        port = int((ces.smtp_port if ces and ces.smtp_port else None) or os.environ.get('SMTP_PORT') or 587)
        user = (ces.smtp_user if ces and ces.smtp_user else None) or os.environ.get('SMTP_USER')
        pwd = (ces.smtp_password if ces and ces.smtp_password else None) or os.environ.get('SMTP_PASSWORD')
        use_tls = bool(ces.smtp_use_tls) if ces and ces.smtp_use_tls is not None else (os.environ.get('SMTP_USE_TLS', '1') == '1')
        if not host or not user or not pwd:
            return Response({'error': 'SMTP beállítások hiányoznak (HOST/USER/PASSWORD)'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if use_tls:
                context = ssl.create_default_context()
                with smtplib.SMTP(host, port) as server:
                    server.starttls(context=context)
                    server.login(user, pwd)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(host, port) as server:
                    server.login(user, pwd)
                    server.send_message(msg)
        except Exception as e:
            return Response({'error': f'E-mail küldési hiba: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            imap_host = (ces.imap_host if ces and ces.imap_host else None) or os.environ.get('IMAP_HOST')
            imap_user = (ces.imap_user if ces and ces.imap_user else None) or os.environ.get('IMAP_USER') or user
            imap_pwd = (ces.imap_password if ces and ces.imap_password else None) or os.environ.get('IMAP_PASSWORD') or pwd
            imap_port = int((ces.imap_port if ces and getattr(ces, 'imap_port', None) else None) or os.environ.get('IMAP_PORT') or 993)
            sent_folder = (ces.imap_sent_folder if ces and ces.imap_sent_folder else None) or os.environ.get('IMAP_SENT_FOLDER') or 'Sent'
            if imap_host and imap_user and imap_pwd:
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
                except Exception:
                    pass
                finally:
                    M.logout()
        except Exception:
            pass

        return Response({'success': True})

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        import io
        from django.http import HttpResponse
        from django.template.loader import render_to_string
        try:
            from weasyprint import HTML
        except Exception:
            HTML = None
        inv = self.get_object()
        pdf_buf = io.BytesIO()
        if HTML:
            ctx = { 'invoice': inv, 'bilingual': (inv.currency or '').upper() != 'HUF' }
            html = render_to_string('invoices/print_invoice.html', ctx)
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
        resp = HttpResponse(pdf_buf.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="{inv.invoice_number or "szamla"}.pdf"'
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
        import io, smtplib, ssl, imaplib
        from email.message import EmailMessage
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
        # Validate all in same company
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

        # Subject/body
        subject = (data.get('subject') or '').strip()
        body = data.get('body')

        def fill(tpl, inv=None):
            inv = inv or invoices[0]
            return (tpl or '')\
                .replace('{invoice_number}', getattr(inv, 'invoice_number', '') or '')\
                .replace('{customer_name}', getattr(inv.customer, 'name', '') if getattr(inv, 'customer', None) else '')\
                .replace('{company_name}', getattr(inv.company, 'name', '') if getattr(inv, 'company', None) else '')

        if not subject:
            if ces and getattr(ces, 'default_subject_template', None):
                subject = fill(ces.default_subject_template)
            else:
                if len(invoices) == 1:
                    subject = f"Számla {invoices[0].invoice_number}"
                else:
                    subject = f"Számlák: {', '.join([inv.invoice_number for inv in invoices])}"

        if not body:
            try:
                rows = [
                    "Számla sorszám\tKelt\tNetto(HUF)\tÁfa(HUF)",
                ]
                for inv in invoices:
                    row = f"{inv.invoice_number}\t{inv.issue_date}\t{float(inv.total_net_amount):,.0f} (HUF)\t{float(inv.total_vat_amount):,.0f} (HUF)".replace(',', ' ').replace('\xa0',' ')
                    rows.append(row)
                customer = invoices[0].customer
                header = [
                    f"Tisztelt {getattr(customer, 'name', 'Ügyfelünk')}!",
                    "",
                    "Mellékelve küldöm az alábbi számlát/számlákat:",
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
            body = fill(ces.default_body_template)
        if not body:
            body = 'Küldjük a számlákat PDF csatolmányként.'

        # Bilingual extension
        any_fx = any(((inv.currency or '').upper() != 'HUF') for inv in invoices)
        if any_fx and ces:
            en_subj = fill(getattr(ces, 'subject_template_en', None)) or f"Invoice {invoices[0].invoice_number}"
            if en_subj and en_subj not in subject:
                subject = f"{subject} / {en_subj}"
            if getattr(ces, 'body_template_en', None):
                body = body + "\n\n---\n\n" + fill(ces.body_template_en)

        # Thunderbird compose mode for bulk
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

        # SMTP sending
        msg = EmailMessage()
        msg['Subject'] = subject

        from_addr = (data.get('from') or '').strip() or (ces.smtp_from if ces and ces.smtp_from else None) or os.environ.get('SMTP_FROM') or os.environ.get('SMTP_USER')
        if not from_addr:
            return Response({'error': 'SMTP_FROM vagy SMTP_USER nincs beállítva'}, status=status.HTTP_400_BAD_REQUEST)
        msg['From'] = from_addr
        msg['To'] = ', '.join(to)
        if cc:
            msg['Cc'] = ', '.join(cc)
        if bcc:
            msg['Bcc'] = ', '.join(bcc)

        if ces:
            sig_lines = []
            if getattr(ces, 'default_sender_name', None):
                sig_lines.append(str(ces.default_sender_name))
            if getattr(ces, 'default_sender_phone', None):
                sig_lines.append(str(ces.default_sender_phone))
            if sig_lines and (body or '').find('--') == -1:
                body = (body or '') + "\n--\n" + "\n".join(sig_lines)
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

        host = (ces.smtp_host if ces and ces.smtp_host else None) or os.environ.get('SMTP_HOST')
        port = int((ces.smtp_port if ces and ces.smtp_port else None) or os.environ.get('SMTP_PORT') or 587)
        user = (ces.smtp_user if ces and ces.smtp_user else None) or os.environ.get('SMTP_USER')
        pwd = (ces.smtp_password if ces and ces.smtp_password else None) or os.environ.get('SMTP_PASSWORD')
        use_tls = bool(ces.smtp_use_tls) if ces and ces.smtp_use_tls is not None else (os.environ.get('SMTP_USE_TLS', '1') == '1')
        if not host or not user or not pwd:
            return Response({'error': 'SMTP beállítások hiányoznak (HOST/USER/PASSWORD)'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if use_tls:
                context = ssl.create_default_context()
                with smtplib.SMTP(host, port) as server:
                    server.starttls(context=context)
                    server.login(user, pwd)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(host, port) as server:
                    server.login(user, pwd)
                    server.send_message(msg)
        except Exception as e:
            return Response({'error': f'E-mail küldési hiba: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            imap_host = (ces.imap_host if ces and ces.imap_host else None) or os.environ.get('IMAP_HOST')
            imap_user = (ces.imap_user if ces and ces.imap_user else None) or os.environ.get('IMAP_USER') or user
            imap_pwd = (ces.imap_password if ces and ces.imap_password else None) or os.environ.get('IMAP_PASSWORD') or pwd
            imap_port = int((ces.imap_port if ces and getattr(ces, 'imap_port', None) else None) or os.environ.get('IMAP_PORT') or 993)
            sent_folder = (ces.imap_sent_folder if ces and ces.imap_sent_folder else None) or os.environ.get('IMAP_SENT_FOLDER') or 'Sent'
            if imap_host and imap_user and imap_pwd:
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
                try:
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
                    flags = '(\\Seen)'
                    try:
                        typ_app, _ = M.append(used_folder, flags, None, raw)
                        if typ_app != 'OK':
                            try:
                                M.create(used_folder)
                                M.append(used_folder, flags, None, raw)
                            except Exception:
                                pass
                    except Exception:
                        pass
                finally:
                    M.logout()
        except Exception:
            pass

        return Response({'success': True})

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
        from django.db.models import Q
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

            # Determine fetch window: incremental by insDate from last refresh to now; otherwise a default backfill window
            fetch_by_insdate = sync.last_refreshed_at is not None and has_any
            if fetch_by_insdate:
                df = sync.last_refreshed_at.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
                dt = timezone.now().astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
                src_from, src_to = df, dt
            else:
                if date_from and date_to:
                    src_from, src_to = date_from, date_to
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
                sync.last_refreshed_at = timezone.now()
                sync.save(update_fields=['last_refreshed_at'])
                did_refresh = True

        # Serve from DB
        qs = IncomingInvoiceDigest.objects.filter(company=company)
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

        # Payment method filter
        if payment_method_filter and payment_method_filter != 'all':
            qs = qs.filter(payment_method__iexact=payment_method_filter.upper())

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

        def fetch_due_date_from_nav(inv_number, supplier_tax_number=None, digest_index=None):
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
                due_date_str = fetch_due_date_from_nav(r.invoice_number, getattr(r, 'supplier_tax_number', None), getattr(r, 'index', None))
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
            paid_amount = pay_map.get(pay_key, {}).get('total') or decimal.Decimal('0')
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
                'isPaid': is_paid,
                'isPartial': is_partial,
                'inPaymentBatch': pay_key in pay_map,
            })

        page_items = items_all

        return Response({
            'success': True,
            'page': page_obj.number,
            'pageCount': paginator.num_pages,
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
                    customer, conflict = auto_register_or_update_supplier(company, xml_text)
                    if conflict:
                        logger.warning(f"Beszállító adatok eltérnek ({d.supplier_tax_number}): {conflict['differences']}")
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
        if company_id:
            qs = qs.filter(company_id=company_id)
        if invoice_number:
            qs = qs.filter(invoice_number=invoice_number)
        if supplier_tax_number:
            qs = qs.filter(supplier_tax_number=supplier_tax_number)
        if doc_type:
            qs = qs.filter(type=doc_type)
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
                        # Flags
                        m_flags = _re.search(r"\(([^)]*)\)", s)
                        flags_txt = m_flags.group(1) if m_flags else ''
                        # Delimiter may appear after flags in quotes
                        m_quoted = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                        delim = None
                        name = None
                        if len(m_quoted) >= 2:
                            delim, name = m_quoted[-2], m_quoted[-1]
                        elif len(m_quoted) == 1:
                            name = m_quoted[0]
                        else:
                            name = (s.split()[-1] if s.split() else '')
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
            queryset = queryset.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(position__icontains=search) |
                Q(department__icontains=search)
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


class SystemUserViewSet(viewsets.ModelViewSet):
    """ViewSet for managing system users"""
    queryset = SystemUser.objects.all()
    permission_classes = []  # Nincs autentikáció szükséges

    def get_serializer_class(self):
        if self.action in ['create']:
            return SystemUserCreateSerializer
        return SystemUserSerializer

    def get_queryset(self):
        queryset = SystemUser.objects.prefetch_related('companies').all()
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
        skipped = []
        errors = []
        preview = []

        # Prepare bank account lookup by account number fragment present in filenames
        # Filename pattern example:
        # PDF_STATEMENT_YYYYMMDD_109180010000007368410003_N.pdf
        #                         ^^^^^^^^^^^^^^^^^^^^^^^ account number
        acct_map = {}
        for acc in CompanyBankAccount.objects.filter(company=company):
            if acc.iban:
                acct_map[re.sub(r'\s+', '', acc.iban)] = acc
            if acc.account_number:
                acct_map[re.sub(r'\D+', '', acc.account_number)] = acc

        def normalize_acct(s: str):
            return re.sub(r'\D+', '', (s or ''))

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
        from invoices.models import Customer, CustomerBankAccount, Invoice
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
                    if ratio >= 0.75:
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
                customer = all_customers[0] if (top and top[0] in all_customers and top[0] not in []) else (contains[0] if contains else None)
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
            invoice = None
            candidates = []
            if token:
                qs = Invoice.objects.filter(company=company, invoice_number__icontains=token).order_by('-issue_date')[:5]
                candidates = [{'id': str(inv.id), 'invoice_number': inv.invoice_number, 'customer_id': str(inv.customer_id), 'amount': float(inv.total_gross_amount)} for inv in qs]
                if len(qs) == 1:
                    invoice = qs[0]
            # Amount check: match by amount when possible
            if not invoice and customer and (it.get('amount') is not None):
                amt = it['amount']
                qs = Invoice.objects.filter(company=company, customer=customer).order_by('-issue_date')[:50]
                for inv in qs:
                    try:
                        total = float(inv.total_gross_amount)
                    except Exception:
                        continue
                    if abs(total - float(amt)) <= 1.0:
                        invoice = inv
                        break
            can_auto = bool(customer and invoice)
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
                'proposed_invoice': {'id': str(invoice.id), 'invoice_number': invoice.invoice_number} if invoice else None,
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
                text = self._decode_bytes(f.read())
            except Exception as e:
                return Response({'error': f'Fájl olvasási hiba: {getattr(f, "name", "?")} - {e}'}, status=status.HTTP_400_BAD_REQUEST)
            stmts = self._parse_stm(text)
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
                    header = BankStatement(company=company, bank_account=bank_acc, statement_date=stmt_date, sequence_number=f"{stmt_date}-{str(bank_acc.id)[:6]}", currency=currency)
                    if request.user and request.user.is_authenticated:
                        header.created_by = request.user
                    header.save()
                    created_headers += 1
                # Items
                for it in (st.get('items') or []):
                    if not it.get('approved'):
                        continue
                    cust_id = it.get('customer_id') or (it.get('proposed_customer') or {}).get('id')
                    inv_id = it.get('invoice_id') or (it.get('proposed_invoice') or {}).get('id')
                    customer = Customer.objects.filter(id=cust_id).first() if cust_id else None
                    invoice = Invoice.objects.filter(id=inv_id, company=company).first() if inv_id else None
                    amount = it.get('amount')
                    note = it.get('remittance') or ''
                    bsi = BankStatementItem.objects.create(
                        bank_statement=header,
                        customer=customer if customer else (invoice.customer if invoice else None),
                        invoice=invoice,
                        amount=amount or 0,
                        note=note[:500]
                    )
                    created_items += 1
                    # Reconcile invoice payment
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
                    # Save new customer bank account if requested
                    if it.get('save_bank_account') and customer and it.get('counterparty_account'):
                        acct = it.get('counterparty_account')
                        exists = CustomerBankAccount.objects.filter(customer=customer).filter(models.Q(iban__iexact=acct) | models.Q(account_number__icontains=acct)).exists()
                        if not exists:
                            CustomerBankAccount.objects.create(customer=customer, iban=acct if acct[:2].isalpha() else None, account_number=None if acct[:2].isalpha() else acct, currency=currency)
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
        for it in items:
            inv = (it or {})
            if inv.get('currency') and batch.currency and inv.get('currency') != batch.currency:
                mismatched.append(inv.get('invoice_number'))
                continue
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
        # Validate currencies before applying
        for it in items:
            cur = (it or {}).get('currency')
            if cur and batch.currency and cur != batch.currency:
                mismatched.append((it or {}).get('invoice_number'))
        if mismatched:
            return Response({'error': 'Eltérő pénznemű tételek', 'currency_mismatched': mismatched}, status=status.HTTP_400_BAD_REQUEST)
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

        sepa_aliases = ('sepa', 'pain.001', 'pain001', 'pain')
        if fmt not in (*sepa_aliases, 'csv'):
            return Response({'error': 'Nem támogatott export formátum (engedélyezett: pain.001, csv)'}, status=status.HTTP_400_BAD_REQUEST)

        # Build items with supplier account numbers from cached NAV XML if available
        missing_accounts = []
        tx_items = []
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
                    acct_type, account = self._extract_supplier_account(invdata.xml_text, batch.company, it.supplier_tax_number)
                elif invdata:
                    # Nincs XML cache, de van supplier_tax_number -> próbáljuk az ügyféltörzsből
                    acct_type, account = self._extract_supplier_account('', batch.company, it.supplier_tax_number)
                else:
                    # Nincs invdata se -> próbáljuk az ügyféltörzsből
                    acct_type, account = self._extract_supplier_account('', batch.company, it.supplier_tax_number)
            except Exception:
                pass
            if not account:
                missing_accounts.append({'invoice_number': it.invoice_number, 'supplier': it.supplier_name})
                continue
            tx_items.append({
                'end_to_end': it.invoice_number,
                'amount': str(it.amount_gross),
                'currency': it.currency or batch.currency or 'HUF',
                'name': it.supplier_name or (it.supplier_tax_number or 'Ismeretlen partner'),
                'acct_type': acct_type or 'IBAN',
                'account': account,
                'remittance': f"Számla {it.invoice_number}",
            })

        if not tx_items:
            error_details = '\n'.join([f"{m['supplier']}: Bankszámlaszám üres!" for m in missing_accounts])
            return Response({'error': f'Hiányzó bankszámlaszámok:\n{error_details}', 'missing': missing_accounts}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if fmt in sepa_aliases:
                content = self._build_pain_001(batch, tx_items, exec_date)
                content_type = 'application/xml'
                filename = f"payment_batch_{(batch.name or str(batch.id)).replace(' ', '_')}_pain.001.xml"
            else:
                header = ['account','account_type','beneficiary_name','amount','currency','remittance','execution_date','end_to_end']
                rows = []
                for it in tx_items:
                    rows.append([
                        it['account'], it['acct_type'], it['name'], f"{decimal.Decimal(it['amount']):.2f}", it['currency'], it['remittance'], exec_date.strftime('%Y-%m-%d'), it['end_to_end']
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
        return resp

    def _extract_supplier_account(self, xml_text: str, company=None, supplier_tax_number: str = None):
        """
        Kinyeri a beszállító bankszámlaszámát.
        1. Először az XML-ből próbálja
        2. Ha nincs az XML-ben, akkor az ügyféltörzsből (ha van company és supplier_tax_number)
        """
        if not xml_text:
            # Ha nincs XML, próbáljuk az ügyféltörzsből
            if company and supplier_tax_number:
                account = get_supplier_bank_account_for_invoice(company, supplier_tax_number, '')
                if account:
                    # Detektáljuk az account típusát
                    if re.match(r'^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$', account):
                        return 'IBAN', account
                    elif re.match(r'^\d{8}-\d{8}(?:-\d{8})?$', account):
                        return 'BBAN', account
                    else:
                        return 'OTHER', account
            return None, None
        try:
            # Prefer IBAN
            iban_match = re.search(r'\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b', xml_text)
            if iban_match:
                return 'IBAN', iban_match.group(0)
            # Fallback: Hungarian domestic account number nnnnnnnn-nnnnnnnn(-nnnnnnnn)
            acct_match = re.search(r'\b\d{8}-\d{8}(?:-\d{8})?\b', xml_text)
            if acct_match:
                return 'BBAN', acct_match.group(0)
            
            # Ha nincs az XML-ben, próbáljuk az ügyféltörzsből
            if company and supplier_tax_number:
                account = get_supplier_bank_account_for_invoice(company, supplier_tax_number, xml_text)
                if account:
                    # Detektáljuk az account típusát
                    if re.match(r'^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$', account):
                        return 'IBAN', account
                    elif re.match(r'^\d{8}-\d{8}(?:-\d{8})?$', account):
                        return 'BBAN', account
                    else:
                        return 'OTHER', account
        except Exception:
            pass
        return None, None

    def _build_pain_001(self, batch: PaymentBatch, items: list, execution_date: date):
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
        
        # Determine debtor account - use batch account or company's primary/first account
        debtor_account = batch.bank_account
        if not debtor_account:
            # Try to find primary account or first available
            debtor_account = batch.company.bank_accounts.filter(is_primary=True).first()
            if not debtor_account:
                debtor_account = batch.company.bank_accounts.first()
        
        if not debtor_account:
            raise ValueError(f'{batch.company.name}: Nincs bankszámla megadva a csomaghoz vagy a céghez')
        
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
