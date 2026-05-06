from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from apps.finance.views import PixinvoiceClient
from apps.core.models import PixinvoiceConfig
from .models import Company
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
        
        # Search in company/customer name as well
        company_name = str((it or {}).get('company_name') or (it or {}).get('customer_name') or '').lower()
        if not company_name:
            # Try to find deeper
            cust = (it or {}).get('customer') or (it or {}).get('company')
            if isinstance(cust, dict):
                company_name = str(cust.get('name') or cust.get('full_name') or '').lower()
            elif isinstance(cust, str):
                # Maybe it is just an ID or string name, already handled if flat, but let's be safe
                pass

        if q in name or q in email or q in tax or q in company_name:
            filtered.append(it)
    return filtered


def _is_truthy_flag(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in ('1', 'true', 'yes', 'y', 'on')


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


from .utils import sync_company_to_local_db as _sync_to_local_db


class CompanyViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    def list(self, request):
        try:
            client = PixinvoiceClient()
            explicit_company_id = request.query_params.get('company_id')

            # Use PixInvoice as the Source of Truth
            if explicit_company_id:
                items = client.list_customers(company_id=explicit_company_id)
            else:
                items = client.list_customers()

            items = _filter_by_query(items, request.query_params.get('q'))

            is_supplier_filter = request.query_params.get('is_supplier') == 'true'
            is_customer_filter = request.query_params.get('is_customer') == 'true'
            compact_mode = request.query_params.get('compact') in ('1', 'true', 'True')

            # Handle Supplier filtering and Sync
            if is_supplier_filter:
                # Filter strictly based on the source data
                items = [i for i in items if i.get('is_supplier') is True]

                # Sync these suppliers to local DB and swap ID to local ID
                synced_items = []
                for item in items:
                    local_comp = _sync_to_local_db(item)
                    if local_comp:
                        # Use local ID for the frontend to be compatible with ERP ForeignKeys
                        item['external_id'] = item['id']  # Save PixInvoice UUID
                        item['id'] = local_comp.id        # Swap to local Integer ID
                        synced_items.append(item)

                items = synced_items

            if is_customer_filter:
                filtered_items = []
                for item in items:
                    flag = _is_truthy_flag(item.get('is_customer'))
                    if flag is not False:
                        filtered_items.append(item)
                items = filtered_items

            if compact_mode:
                items = [
                    {
                        'id': item.get('id'),
                        'name': item.get('name') or item.get('full_name') or '',
                        'tax_number': item.get('tax_number') or item.get('taxNumber') or '',
                        'full_tax_number': item.get('full_tax_number') or item.get('fullTaxNumber') or '',
                        'is_customer': _is_truthy_flag(item.get('is_customer')) is not False,
                        'is_supplier': _is_truthy_flag(item.get('is_supplier')) is True,
                    }
                    for item in items
                ]

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

    @action(detail=False, methods=['post'])
    def validate_eu_vat(self, request):
        """Validate EU VAT number using VIES API"""
        vat_number = request.data.get('vat_number', '').strip()
        if not vat_number:
            return Response({'error': 'Adószám megadása kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Remove country code if present (2 chars)
        country_code = vat_number[:2].upper()
        number_part = vat_number[2:]

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
                return Response(data)
            else:
                return Response({'error': 'VIES API hiba', 'details': resp.text}, status=resp.status_code)
        except Exception as e:
            return Response({'error': f'VIES hálózati hiba: {str(e)}'}, status=500)

    def create(self, request):
        try:
            company_id = _resolve_company_id(request)
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            data = client.upsert_customer(request.data, company_id=company_id)
            _sync_to_local_db(data)
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
            _sync_to_local_db(data)
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
            # Enrich with customer_name so the frontend can display "Name — Company"
            try:
                customers = client.list_customers(company_id=company_id)
                customer_map = {
                    str(c.get('id') or c.get('customer_id') or ''): c.get('name') or c.get('full_name') or ''
                    for c in (customers or []) if c.get('id') or c.get('customer_id')
                }
                for it in items:
                    cid = str((it or {}).get('customer') or (it or {}).get('customer_id') or (it or {}).get('company') or (it or {}).get('company_id') or '')
                    if cid and not it.get('customer_name'):
                        it['customer_name'] = customer_map.get(cid) or ''
            except Exception:
                pass
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
            client = PixinvoiceClient()
            if not company_id:
                company_id = _ensure_company_id(client)
            if not company_id:
                return Response({'error': 'PixInvoice company_id hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
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
            # We need the Tenant ID to call PixInvoice API
            client = PixinvoiceClient()
            tenant_id = _ensure_company_id(client)
            
            # We need the Customer ID to filter the contacts
            customer_id_param = request.query_params.get('company_id')
            
            remote_customer_id = customer_id_param

            # If customer_id is a local ID (digit), map it to remote ID
            if customer_id_param and str(customer_id_param).isdigit():
                try:
                    c = Company.objects.get(id=int(customer_id_param))
                    # Try to find corresponding customer in PixInvoice
                    if tenant_id:
                        # Fetch customers to match
                        customers = client.list_customers(company_id=tenant_id)
                        
                        found = None
                        # 1. Match by Tax Number
                        if c.tax_number:
                            found = next((cust for cust in customers if (cust.get('tax_number') or cust.get('taxNumber') or '').startswith(c.tax_number[:8])), None)
                        
                        # 2. Match by Name if not found
                        if not found and c.name:
                            found = next((cust for cust in customers if (cust.get('name') or cust.get('full_name') or '').lower() == c.name.lower()), None)
                        
                        if found:
                            remote_customer_id = found.get('id') or found.get('company_id')
                except Exception as e:
                    print(f"[CRM] Error resolving local company: {e}")
                    pass

            if not tenant_id:
                return Response({'error': 'PixInvoice company_id (Tenant) hiányzik'}, status=status.HTTP_400_BAD_REQUEST)
            
            # List all contacts for the Tenant
            items = client.list_contacts(company_id=tenant_id)
            
            # Filter by the Resolved Customer ID
            cid = remote_customer_id
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
