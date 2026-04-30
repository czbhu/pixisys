from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import models
from rest_framework.permissions import AllowAny
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from apps.core.permissions import OwnDataFilterMixin
from .models import (
    ProductClass, Project, ManufacturingProduct, Service, ServiceGroup,
    CalculatorTemplate, Calculation, ServiceSupplierPrice, ServiceCostItem,
    ProductTemplate, ProductTemplateSize, ManufacturingProductAttachment,
    ManufacturingCostItem,
)
from .serializers import (
    ProductClassSerializer, ProjectSerializer, ManufacturingProductSerializer,
    CurrencySerializer, ServiceSerializer, ServiceGroupSerializer, CalculatorTemplateSerializer,
    CalculationSerializer, ServiceSupplierPriceSerializer, ServiceCostItemSerializer,
    ProductTemplateSerializer, ManufacturingProductAttachmentSerializer,
    ManufacturingCostItemSerializer,
)
from apps.crm.models import Contact
from apps.hr.models import Employee
from apps.core.models import Currency
from django.core.management import call_command
from io import StringIO


class LargeResultsSetPagination(PageNumberPagination):
    page_size = 1000
    page_size_query_param = 'page_size'
    max_page_size = 10000


class ProductClassViewSet(viewsets.ModelViewSet):
    queryset = ProductClass.objects.all()
    serializer_class = ProductClassSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']


class ProjectViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [AllowAny]
    permission_module = 'manufacturing'
    permission_resource = 'manufacturing.projects'
    own_data_user_field = 'manager'  # Project.manager = User
    own_data_project_field = None  # Direkt projekt kapcsolat, nem kell
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'deadline', 'created_at']
    ordering = ['-created_at']
    
    @action(detail=False, methods=['get'])
    def open_projects(self, request):
        """Nyitott projektek listája"""
        queryset = self.get_queryset().filter(status='open')
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def products(self, request, pk=None):
        """Projekthez tartozó termékek"""
        project = self.get_object()
        products = ManufacturingProduct.objects.filter(project=project)
        serializer = ManufacturingProductSerializer(products, many=True)
        return Response(serializer.data)


class ManufacturingProductViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = ManufacturingProduct.objects.prefetch_related('allowed_companies', 'allowed_contacts', 'cost_items').all()
    serializer_class = ManufacturingProductSerializer
    permission_classes = [AllowAny]
    permission_module = 'manufacturing'
    permission_resource = 'manufacturing.products'
    own_data_user_field = 'created_by'  # ManufacturingProduct.created_by = User
    own_data_project_field = 'project'  # ManufacturingProduct.project -> Project.members
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'product_class', 'project', 'contact']
    filterset_fields = ['status', 'product_class', 'project', 'contact', 'contact_external_id']
    search_fields = ['name', 'description', 'internal_description', 'contact_external_id']
    ordering_fields = ['date', 'name', 'deadline', 'created_at']
    ordering = ['-created_at']
    
    def update(self, request, *args, **kwargs):
        # DEBUG: Log incoming request data
        import datetime
        with open("/tmp/debug_view_update.log", "a") as f:
             f.write(f"\n{datetime.datetime.now()} - ManufacturingProductViewSet.update\n")
             f.write(f"Request data allowed_companies: {request.data.get('allowed_companies')}\n")
             f.write(f"Request data customer_ids: {request.data.get('customer_ids')}\n")
             f.write(f"Request keys: {list(request.data.keys())}\n")
             
        return super().update(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def by_status(self, request):
        """Állapot szerinti szűrés"""
        status_param = request.query_params.get('status')
        if status_param:
            queryset = self.get_queryset().filter(status=status_param)
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        return Response([])
    
    @action(detail=False, methods=['get'])
    def by_project(self, request):
        """Projekt szerinti szűrés"""
        project_id = request.query_params.get('project_id')
        if project_id:
            queryset = self.get_queryset().filter(project_id=project_id)
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        return Response([])

    @action(detail=True, methods=['get'])
    def attachments(self, request, pk=None):
        product = self.get_object()
        serializer = ManufacturingProductAttachmentSerializer(product.attachments.all(), many=True, context={'request': request})
        return Response(serializer.data)

    @attachments.mapping.post
    def upload_attachment(self, request, pk=None):
        product = self.get_object()
        file_obj = request.FILES.get('file')
        remark = request.data.get('remark', '')
        if not file_obj:
            return Response({'error': 'file kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = ManufacturingProductAttachment.objects.create(
            product=product,
            file=file_obj,
            remark=remark,
            uploaded_by=request.user if request.user and request.user.is_authenticated else None
        )
        return Response(ManufacturingProductAttachmentSerializer(att, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def update_attachment_remark(self, request, pk=None):
        product = self.get_object()
        att_id = request.data.get('attachment_id')
        remark = request.data.get('remark', '')
        if not att_id:
            return Response({'error': 'attachment_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = get_object_or_404(ManufacturingProductAttachment, id=att_id, product=product)
        att.remark = remark
        att.save(update_fields=['remark'])
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def delete_attachment(self, request, pk=None):
        product = self.get_object()
        att_id = request.data.get('attachment_id')
        if not att_id:
            return Response({'error': 'attachment_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = get_object_or_404(ManufacturingProductAttachment, id=att_id, product=product)
        att.delete()
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Deep-copy a ManufacturingProduct including all cost items and M2M relations."""
        import re
        from .models import ManufacturingCostItem
        original = self.get_object()

        # Generate a unique code based on the original
        base_code = original.code or f'GY-{original.id}'
        base = re.sub(r'-COPY(-\d+)?$', '', base_code)
        n_copies = ManufacturingProduct.objects.filter(code__startswith=f'{base}-COPY').count()
        new_code = f'{base}-COPY-{n_copies + 1}' if n_copies > 0 else f'{base}-COPY'

        new_product = ManufacturingProduct(
            date=original.date,
            name=original.name,
            code=new_code,
            description=original.description,
            internal_description=original.internal_description,
            quantity=original.quantity,
            quantity_unit=original.quantity_unit,
            is_fixed_quantity=original.is_fixed_quantity,
            product_class=original.product_class,
            project=original.project,
            net_unit_price=original.net_unit_price,
            net_total_price=original.net_total_price,
            currency=original.currency,
            status=original.status,
            contact=original.contact,
            contact_external_id=original.contact_external_id,
            deadline=original.deadline,
        )
        if hasattr(ManufacturingProduct, 'created_by'):
            new_product.created_by = request.user if request.user and request.user.is_authenticated else None
        new_product.save()

        for c in original.allowed_companies.all():
            new_product.allowed_companies.add(c)
        for c in original.allowed_contacts.all():
            new_product.allowed_contacts.add(c)

        for ci in original.cost_items.all():
            ManufacturingCostItem.objects.create(
                product=new_product,
                type=ci.type,
                ref_id=ci.ref_id,
                name=ci.name,
                quantity=ci.quantity,
                unit=ci.unit,
                unit_price=ci.unit_price,
                cost_price=ci.cost_price,
                markup_percent=ci.markup_percent,
                selling_unit_price=ci.selling_unit_price,
                selling_price=ci.selling_price,
                supplier=ci.supplier,
                is_internal=ci.is_internal,
                department=ci.department,
                currency=ci.currency,
                is_per_unit=ci.is_per_unit,
                status=ci.status,
            )

        serializer = self.get_serializer(new_product)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def unit_suggestions(self, request):
        """Return unit values used in cost items, ordered by frequency."""
        from django.db.models import Count
        from .models import ManufacturingCostItem
        db_units = list(
            ManufacturingCostItem.objects.exclude(unit='')
            .values('unit').annotate(count=Count('unit')).order_by('-count')[:40]
        )
        seen = {item['unit'] for item in db_units}
        result = [{'unit': item['unit'], 'count': item['count']} for item in db_units]
        for d in ['db', 'óra', 'alkalom', 'm', 'm²', 'm³', 'kg', 'l', 'csomag', 'készlet', 'pár']:
            if d not in seen:
                result.append({'unit': d, 'count': 0})
                seen.add(d)
        return Response(result)


class CurrencyViewSet(viewsets.ModelViewSet):
    queryset = Currency.objects.filter(is_active=True)
    serializer_class = CurrencySerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name']
    ordering = ['code']
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Aktív valuták listája"""
        queryset = self.get_queryset().filter(is_active=True)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def update_rates(self, request):
        """Árfolyamok frissítése MNB API-ból"""
        try:
            # Management command futtatása
            output = StringIO()
            call_command('update_exchange_rates', stdout=output)
            output_text = output.getvalue()
            
            return Response({
                'message': 'Árfolyamok sikeresen frissítve!',
                'details': output_text
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': f'Hiba történt az árfolyamok frissítése során: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def mnb_currencies(self, request):
        """MNB-ből elérhető valuták listája árfolyamokkal"""
        try:
            from apps.core.mnb_api import mnb_api
            
            rates = mnb_api.get_current_exchange_rates()
            currencies = []
            
            for code, rate_data in rates.items():
                currencies.append({
                    'code': code,
                    'name': rate_data['name'],
                    'symbol': mnb_api.get_currency_symbol(code),
                    'exchange_rate': float(rate_data['rate']),
                    'rate_huf': float(rate_data['rate_huf']),
                })
            
            # Sort by code
            currencies.sort(key=lambda x: x['code'])
            
            return Response(currencies, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'error': f'Hiba történt az MNB valuták lekérése során: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ServiceGroupViewSet(viewsets.ModelViewSet):
    queryset = ServiceGroup.objects.all()
    serializer_class = ServiceGroupSerializer
    pagination_class = LargeResultsSetPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_protected:
            return Response(
                {'error': 'Védett szolgáltatás csoport nem törölhető.'},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)


class ServiceViewSet(viewsets.ModelViewSet):
    """Szolgáltatás viewset"""
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'category']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'category', 'unit_price', 'created_at']
    ordering = ['category', 'name']

    def get_queryset(self):
        qs = super().get_queryset()
        ids_param = self.request.query_params.get('ids')
        if ids_param:
            id_list = [int(i) for i in ids_param.split(',') if i.strip().isdigit()]
            qs = qs.filter(id__in=id_list)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_protected:
            return Response(
                {'error': 'Védett szolgáltatás nem törölhető.'},
                status=400,
            )
        if instance.groups.filter(is_protected=True).exists():
            return Response(
                {'error': 'Védett csoportba tartozó szolgáltatás nem törölhető.'},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)


class CalculatorTemplateViewSet(viewsets.ModelViewSet):
    """Kalkulátor sablon viewset"""
    queryset = CalculatorTemplate.objects.all()
    serializer_class = CalculatorTemplateSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)
    
    @action(detail=True, methods=['post'])
    def calculate(self, request, pk=None):
        """Kalkuláció végrehajtása sablon alapján"""
        template = self.get_object()
        
        # Input adatok a request body-ból
        input_values = request.data.get('input_values', {})
        selected_materials = request.data.get('selected_materials', [])
        selected_services = request.data.get('selected_services', [])
        markup_percentage = request.data.get('markup_percentage', template.default_markup_percentage)
        
        # Kalkuláció létrehozása
        calculation = Calculation.objects.create(
            template=template,
            input_values=input_values,
            selected_materials=selected_materials,
            selected_services=selected_services,
            markup_percentage=markup_percentage,
            created_by=self.request.user if self.request.user.is_authenticated else None
        )
        
        serializer = CalculationSerializer(calculation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CalculationViewSet(viewsets.ModelViewSet):
    """Kalkuláció viewset"""
    queryset = Calculation.objects.all()
    serializer_class = CalculationSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['template']
    search_fields = ['notes', 'quote_reference']
    ordering_fields = ['created_at', 'total_cost', 'selling_price']
    ordering = ['-created_at']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)
    
    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        """Kalkuláció újraszámítása"""
        calculation = self.get_object()
        
        # Frissítjük az adatokat ha vannak
        if 'selected_materials' in request.data:
            calculation.selected_materials = request.data['selected_materials']
        if 'selected_services' in request.data:
            calculation.selected_services = request.data['selected_services']
        if 'markup_percentage' in request.data:
            calculation.markup_percentage = request.data['markup_percentage']
        
        calculation.save()  # Ez automatikusan újraszámolja az árakat
        
        serializer = self.get_serializer(calculation)
        return Response(serializer.data)


class ServiceSupplierPriceViewSet(viewsets.ModelViewSet):
    """Szolgáltatás beszállítói árak kezelése"""
    queryset = ServiceSupplierPrice.objects.all()
    serializer_class = ServiceSupplierPriceSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = ServiceSupplierPrice.objects.select_related('service', 'supplier')
        service_id = self.request.query_params.get('service', None)
        supplier_id = self.request.query_params.get('supplier', None)
        
        if service_id:
            queryset = queryset.filter(service_id=service_id)
        
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        
        return queryset


class ServiceCostItemViewSet(viewsets.ModelViewSet):
    """Szolgáltatás költség elemek kezelése"""
    queryset = ServiceCostItem.objects.all()
    serializer_class = ServiceCostItemSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = ServiceCostItem.objects.select_related('service', 'supplier')
        service_id = self.request.query_params.get('service_id', None)
        supplier_id = self.request.query_params.get('supplier_id', None)
        is_internal = self.request.query_params.get('is_internal', None)
        
        if service_id:
            queryset = queryset.filter(service_id=service_id)
        
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        
        if is_internal is not None:
            queryset = queryset.filter(is_internal=is_internal.lower() == 'true')

        is_standalone = self.request.query_params.get('is_standalone')
        if is_standalone == 'true':
            queryset = queryset.filter(supplier__isnull=True, is_internal=False)

        return queryset


class ManufacturingCostItemViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Single-cost-item endpoint, primarily for status updates from the
    customer-order subitems page. Full CRUD on the embedded list still
    happens via PATCH /manufacturing/products/{id}/."""
    queryset = ManufacturingCostItem.objects.all()
    serializer_class = ManufacturingCostItemSerializer

    def _resolve_order_context(self, ci):
        """Return (customer_order, customer_order_item) for a cost_item, or (None, None)."""
        from apps.sales.models import QuoteRequestItem, CustomerOrderItem
        try:
            mp = ci.product
            qris = QuoteRequestItem.objects.filter(manufacturing_product=mp).only('id')
            if not qris.exists():
                return None, None
            coi = (CustomerOrderItem.objects
                   .select_related('customer_order',
                                   'customer_order__quote_request',
                                   'customer_order__quote_request__company',
                                   'customer_order__quote_request__customer')
                   .filter(quote_item__in=qris)
                   .exclude(status='cancelled')
                   .order_by('-customer_order__order_date')
                   .first())
            if not coi:
                return None, None
            return coi.customer_order, coi
        except Exception:
            return None, None

    @action(detail=False, methods=['get'], url_path='queue')
    def queue(self, request):
        """List all cost_items belonging to non-cancelled/non-delivered customer orders.
        Sorted by queue_position (nulls last by id)."""
        from django.db.models import F
        qs = (ManufacturingCostItem.objects
              .select_related('product', 'supplier', 'department')
              .order_by(F('queue_position').asc(nulls_last=True), 'id'))

        # Optional filters
        customer_id = request.query_params.get('customer')
        order_id = request.query_params.get('order')
        supplier_id = request.query_params.get('supplier')

        data = []
        for ci in qs:
            order, coi = self._resolve_order_context(ci)
            if not order:
                continue
            if order.status in ('delivered', 'cancelled'):
                continue
            qr = order.quote_request
            company = (qr.company if qr else None) or (qr.customer if qr else None)
            cust_name = company.name if company else ''
            cust_id = company.id if company else None
            # Fallback: first contact's company (legacy data with no FK)
            if not cust_name and qr:
                try:
                    first_contact = qr.contacts.first()
                    if first_contact and getattr(first_contact, 'company', None):
                        cust_name = first_contact.company.name or ''
                        cust_id = first_contact.company.id
                except Exception:
                    pass
            if customer_id and str(cust_id) != str(customer_id):
                continue
            if order_id and str(order.id) != str(order_id):
                continue
            if supplier_id and str(ci.supplier_id or '') != str(supplier_id):
                continue

            # Resolve code via serializer logic
            code = ''
            try:
                if ci.type == 'material' and ci.ref_id:
                    from apps.warehouse.models import Material
                    m = Material.objects.filter(id=ci.ref_id).only('code').first()
                    if m:
                        code = m.code
                elif ci.type == 'service' and ci.ref_id:
                    s = Service.objects.filter(id=ci.ref_id).only('code').first()
                    if s:
                        code = s.code
            except Exception:
                pass

            data.append({
                'id': ci.id,
                'queue_position': ci.queue_position,
                'is_paused': ci.is_paused,
                'order_id': order.id,
                'order_number': order.order_number,
                'order_date': order.order_date.isoformat() if order.order_date else None,
                'deadline': qr.deadline.isoformat() if qr and qr.deadline else None,
                'customer_id': cust_id,
                'customer_name': cust_name,
                'customer_order_item_id': coi.id if coi else None,
                'manufacturing_product_id': ci.product_id,
                'product_name': ci.product.name if ci.product else '',
                'item_name': ci.name,
                'code': code,
                'status': ci.status,
                'notes': ci.notes or '',
                'supplier_id': ci.supplier_id,
                'supplier_name': ci.supplier.name if ci.supplier else '',
                'is_internal': ci.is_internal,
                'department_id': ci.department_id,
                'department_name': ci.department.name if ci.department else '',
                'quantity': float(ci.quantity),
                'unit': ci.unit,
            })
        return Response(data)

    def _full_queue_ids(self, exclude_id=None):
        """Return all visible-queue cost-item ids in current display order
        (queue_position asc nulls last, then id). Items belonging to
        delivered/cancelled customer orders are skipped (mirrors `queue`)."""
        from django.db.models import F
        qs = (ManufacturingCostItem.objects
              .select_related('product')
              .order_by(F('queue_position').asc(nulls_last=True), 'id'))
        ids = []
        for ci in qs:
            if exclude_id is not None and ci.id == exclude_id:
                continue
            order, _coi = self._resolve_order_context(ci)
            if not order or order.status in ('delivered', 'cancelled'):
                continue
            ids.append(ci.id)
        return ids

    def _renumber(self, ordered_ids):
        """Set queue_position = index for the given id list, in one transaction."""
        from django.db import transaction
        items = {ci.id: ci for ci in ManufacturingCostItem.objects.filter(id__in=ordered_ids)}
        with transaction.atomic():
            for idx, cid in enumerate(ordered_ids):
                ci = items.get(int(cid))
                if not ci:
                    continue
                if ci.queue_position != idx:
                    ci.queue_position = idx
                    ci.save(update_fields=['queue_position'])

    @action(detail=True, methods=['post'], url_path='sos')
    def sos(self, request, pk=None):
        """Move this cost-item to the very top of the queue (position 0)
        and renumber the rest. Always safe (never produces negative
        queue_position values)."""
        ci = self.get_object()
        rest = self._full_queue_ids(exclude_id=ci.id)
        new_order = [ci.id] + rest
        ci.is_paused = False
        ci.save(update_fields=['is_paused'])
        self._renumber(new_order)
        ci.refresh_from_db(fields=['queue_position'])
        return Response({'queue_position': ci.queue_position, 'is_paused': ci.is_paused})

    @action(detail=True, methods=['post'], url_path='pause')
    def pause(self, request, pk=None):
        """Move this cost-item to the very end of the queue and mark
        is_paused=True. Renumbers the queue compactly."""
        ci = self.get_object()
        rest = self._full_queue_ids(exclude_id=ci.id)
        new_order = rest + [ci.id]
        ci.is_paused = True
        ci.save(update_fields=['is_paused'])
        self._renumber(new_order)
        ci.refresh_from_db(fields=['queue_position'])
        return Response({'queue_position': ci.queue_position, 'is_paused': ci.is_paused})

    @action(detail=True, methods=['post'], url_path='resume')
    def resume(self, request, pk=None):
        ci = self.get_object()
        ci.is_paused = False
        ci.save(update_fields=['is_paused'])
        return Response({'is_paused': ci.is_paused})

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Body: { ids: [id1, id2, ...] } – sets queue_position by index."""
        ids = request.data.get('ids') or []
        if not isinstance(ids, list):
            return Response({'error': 'ids must be a list'}, status=400)
        self._renumber([int(x) for x in ids])
        return Response({'updated': len(ids)})


class ProductTemplateViewSet(viewsets.ModelViewSet):
    """Termék sablonok CRUD"""
    serializer_class = ProductTemplateSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = ProductTemplate.objects.select_related('category').prefetch_related(
            'allowed_materials', 'allowed_material_groups', 'allowed_services',
            'sizes', 'service_groups__services', 'quantity_discounts',
        )
        is_active = self.request.query_params.get('is_active')
        category = self.request.query_params.get('category')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        if category:
            qs = qs.filter(category_id=category)
        return qs
