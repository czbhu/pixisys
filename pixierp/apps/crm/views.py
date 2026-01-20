from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from apps.finance.views import PixinvoiceClient
from apps.core.models import PixinvoiceConfig
import requests


def _resolve_company_id(request):
    """Resolve PixInvoice company_id: explicit param -> mapping -> default config."""
    company_id = request.query_params.get('company_id') or (request.data.get('company_id') if hasattr(request, 'data') else None)
    erp_company_id = request.query_params.get('erp_company_id') or (request.data.get('erp_company_id') if hasattr(request, 'data') else None)
    cfg = PixinvoiceConfig.objects.filter(is_active=True).order_by('-updated_at').first()
    mappings = (cfg.sync_settings or {}).get('company_mappings') if cfg else []
    if company_id:
        return company_id
    if erp_company_id and mappings:
        for m in mappings:
            if str(m.get('erp_company_id')) == str(erp_company_id):
                return m.get('invoice_company_id') or (cfg.company_id if cfg else None)
    if cfg and cfg.company_id:
        return cfg.company_id
    return None


def _filter_by_query(items, query):
    if not query:
        return items
    q = query.lower()
    filtered = []
    for it in items:
        name = str((it or {}).get('name') or it.get('full_name') or '').lower()
        email = str((it or {}).get('email') or '').lower()
        tax = str((it or {}).get('tax_number') or it.get('taxNumber') or '').lower()
        if q in name or q in email or q in tax:
            filtered.append(it)
    return filtered


def _ensure_company_id(client):
    """Return a usable company_id: prefer explicit client.company_id, otherwise first company from PixInvoice."""
    if getattr(client, 'company_id', None):
        return client.company_id
    try:
        companies = client.list_companies()
        if companies:
            # Prefer first active company if flag present, else first
            active = next((c for c in companies if c.get('is_active') is True), None)
            return (active or companies[0]).get('id') or (active or companies[0]).get('company_id')
    except Exception:
        # Swallow and let caller handle missing ID
        return None
    return None


class CompanyViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    def list(self, request):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            items = client.list_customers(company_id=company_id)
            items = _filter_by_query(items, request.query_params.get('q'))
            return Response(items)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def retrieve(self, request, pk=None):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            item = client.get_customer(pk, company_id=company_id)
            try:
                if item is not None and not item.get('bank_accounts'):
                    item['bank_accounts'] = client.list_customer_bank_accounts(pk, company_id=company_id)
            except Exception:
                pass
            # Derive EU adószám, ha hiányzik
            if item is not None and not item.get('eu_tax_number'):
                tax_digits = ''.join(filter(str.isdigit, str(item.get('tax_number') or '')[:8]))
                if tax_digits:
                    item['eu_tax_number'] = f"HU{tax_digits}"
            return Response(item)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else status.HTTP_502_BAD_GATEWAY
            return Response({'error': str(e)}, status=code)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def create(self, request):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            data = client.upsert_customer(request.data, company_id=company_id)
            return Response(data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def update(self, request, pk=None):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            data = client.upsert_customer(request.data, customer_id=pk, company_id=company_id)
            return Response(data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            client.delete_customer(pk, company_id=company_id)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class ContactViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    def list(self, request):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            items = client.list_contacts(company_id=company_id)
            customer_id = request.query_params.get('customer_id') or request.query_params.get('customer') or request.query_params.get('customerId')
            if customer_id:
                items = [
                    it for it in items
                    if str((it or {}).get('customer') or (it or {}).get('customer_id') or (it or {}).get('company') or (it or {}).get('company_id')) == str(customer_id)
                ]
            items = _filter_by_query(items, request.query_params.get('q'))
            return Response(items)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def retrieve(self, request, pk=None):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            item = client.get_contact(pk, company_id=company_id)
            return Response(item)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else status.HTTP_502_BAD_GATEWAY
            return Response({'error': str(e)}, status=code)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def create(self, request):
        try:
            company_id = _resolve_company_id(request)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            client = PixinvoiceClient()
            data = client.upsert_contact(request.data, company_id=company_id)
            return Response(data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def update(self, request, pk=None):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            data = client.upsert_contact(request.data, contact_id=pk, company_id=company_id)
            return Response(data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            client.delete_contact(pk, company_id=company_id)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    @action(detail=False, methods=['get'])
    def by_company(self, request):
        try:
            company_id = request.query_params.get('company_id') or _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            items = client.list_contacts(company_id=company_id)
            cid = request.query_params.get('company_id') or None
            if cid and cid != 'private':
                items = [
                    it for it in items
                    if str((it or {}).get('customer') or (it or {}).get('customer_id') or (it or {}).get('company') or (it or {}).get('company_id')) == str(cid)
                ]
            elif cid == 'private':
                items = [
                    it for it in items
                    if not ((it or {}).get('customer') or (it or {}).get('customer_id') or (it or {}).get('company') or (it or {}).get('company_id'))
                ]
            return Response(items)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    @action(detail=False, methods=['get'])
    def search(self, request):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            items = client.list_contacts(company_id=company_id)
            items = _filter_by_query(items, request.query_params.get('q'))
            return Response(items)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)
