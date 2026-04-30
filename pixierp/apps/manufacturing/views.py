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
                'supplier_email_sent_at': ci.supplier_email_sent_at.isoformat() if ci.supplier_email_sent_at else None,
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

    def _build_group_context(self, items):
        """Return ctx dict used by both the render endpoint and the
        send endpoint. `items` is an iterable of ManufacturingCostItem.

        Same-named items are aggregated: quantities summed, order numbers
        comma-separated in the reference column. Columns:
            Tétel | Mennyiség | ME | Hivatkozási szám
        """
        items_list = list(items)
        # Aggregate by (lowercased name, unit) to merge duplicates
        from collections import OrderedDict
        agg = OrderedDict()
        for ci in items_list:
            order, _coi = self._resolve_order_context(ci)
            ord_no = order.order_number if order else '-'
            key = ((ci.name or '').strip().lower(), (ci.unit or '').strip().lower())
            entry = agg.get(key)
            if entry is None:
                entry = {
                    'name': ci.name or '',
                    'unit': ci.unit or '',
                    'qty': 0.0,
                    'orders': [],
                }
                agg[key] = entry
            try:
                entry['qty'] += float(ci.quantity)
            except Exception:
                pass
            if ord_no and ord_no not in entry['orders']:
                entry['orders'].append(ord_no)

        html_rows = []
        text_rows = []
        for entry in agg.values():
            refs = ', '.join(entry['orders']) or '-'
            qty_str = f"{entry['qty']:g}"
            html_rows.append(
                f"<tr>"
                f"<td style='border:1px solid #ddd;padding:4px 8px'>{entry['name']}</td>"
                f"<td style='border:1px solid #ddd;padding:4px 8px;text-align:right'>{qty_str}</td>"
                f"<td style='border:1px solid #ddd;padding:4px 8px'>{entry['unit']}</td>"
                f"<td style='border:1px solid #ddd;padding:4px 8px'>{refs}</td>"
                f"</tr>"
            )
            text_rows.append(f"- {entry['name']} — {qty_str} {entry['unit']} (hivatk.: {refs})")

        html_table = (
            "<table style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px'>"
            "<thead><tr>"
            "<th style='border:1px solid #ddd;padding:4px 8px;background:#f5f5f5'>Tétel</th>"
            "<th style='border:1px solid #ddd;padding:4px 8px;background:#f5f5f5'>Mennyiség</th>"
            "<th style='border:1px solid #ddd;padding:4px 8px;background:#f5f5f5'>ME</th>"
            "<th style='border:1px solid #ddd;padding:4px 8px;background:#f5f5f5'>Hivatkozási szám</th>"
            "</tr></thead><tbody>"
            + ''.join(html_rows) +
            "</tbody></table>"
        )
        return {
            'item_count': len(items_list),
            'item_table_html': html_table,
            'item_list_text': '\n'.join(text_rows),
        }

    @action(detail=False, methods=['post'], url_path='render_supplier_order')
    def render_supplier_order(self, request):
        """Body: { cost_item_ids: [int, ...] }
        Returns groups with rendered context (item_table_html, item_list_text,
        recipient default, label, items meta) so the modal can do template
        substitution and preview client-side."""
        ids = request.data.get('cost_item_ids') or []
        if not isinstance(ids, list) or not ids:
            return Response({'error': 'cost_item_ids required'}, status=400)

        items_qs = (ManufacturingCostItem.objects
                    .select_related('product', 'supplier', 'department')
                    .filter(id__in=ids))

        groups = {}
        for ci in items_qs:
            if ci.is_internal and ci.department_id:
                key = f"dep:{ci.department_id}"
                label = ci.department.name if ci.department else f"Belső #{ci.department_id}"
                default_email = ''
                if ci.department:
                    mgr = ci.department.managers.exclude(email='').first()
                    if mgr:
                        default_email = mgr.email
            elif ci.supplier_id:
                key = f"sup:{ci.supplier_id}"
                label = ci.supplier.name if ci.supplier else f"Beszállító #{ci.supplier_id}"
                default_email = (ci.supplier.email or '') if ci.supplier else ''
            else:
                continue
            g = groups.setdefault(key, {
                'key': key,
                'label': label,
                'recipient': default_email,
                'item_objs': [],
            })
            g['item_objs'].append(ci)

        out = []
        for g in groups.values():
            ctx = self._build_group_context(g['item_objs'])
            out.append({
                'key': g['key'],
                'label': g['label'],
                'recipient': g['recipient'],
                'item_count': len(g['item_objs']),
                'item_ids': [ci.id for ci in g['item_objs']],
                'recipient_label': g['label'],
                'item_table_html': ctx['item_table_html'],
                'item_list_text': ctx['item_list_text'],
            })
        return Response({'groups': out})

    @action(detail=False, methods=['post'], url_path='send_supplier_order')
    def send_supplier_order(self, request):
        """Body (preferred new format):
            {
              groups: [
                {
                  key: 'sup:42' | 'dep:7',
                  cost_item_ids: [int, ...],
                  recipients: 'a@b,c@d',
                  cc: 'x@y',                # optional
                  reply_to: 'r@y',          # optional
                  subject: '...',
                  body: '<html or text>',
                  is_html: true,
                }
              ]
            }

        Legacy format (still supported):
            { cost_item_ids: [...], recipients: { '<key>': 'a@b' } }
        In the legacy case the body/subject is rendered server-side from the
        EmailTemplate `manufacturing_supplier_order` (or a Hungarian fallback).
        """
        from django.core.mail import get_connection, EmailMultiAlternatives
        from apps.core.models import EmailServerConfig, EmailTemplate

        body_payload = request.data
        groups_payload = body_payload.get('groups')

        cfg = EmailServerConfig.objects.filter(is_active=True).first()
        if not cfg:
            return Response({'error': 'Nincs aktív email szerver konfiguráció'}, status=500)

        connection = get_connection(
            backend='django.core.mail.backends.smtp.EmailBackend',
            host=cfg.smtp_host, port=cfg.smtp_port,
            username=cfg.smtp_username, password=cfg.smtp_password,
            use_tls=cfg.smtp_use_tls, use_ssl=cfg.smtp_use_ssl,
            fail_silently=False, timeout=15,
        )
        from_email = f"{cfg.from_name} <{cfg.from_email}>" if cfg.from_name else cfg.from_email

        results = []

        if isinstance(groups_payload, list) and groups_payload:
            # ── New per-group format ─────────────────────────────────────
            for g in groups_payload:
                key = g.get('key') or ''
                label = g.get('label') or key
                rcpt = (g.get('recipients') or '').strip()
                if not rcpt:
                    results.append({'key': key, 'label': label, 'sent': False, 'error': 'Hiányzó címzett'})
                    continue
                recipients_list = [e.strip() for e in rcpt.replace(';', ',').split(',') if e.strip()]
                cc_list = [e.strip() for e in (g.get('cc') or '').replace(';', ',').split(',') if e.strip()]
                reply_to = (g.get('reply_to') or '').strip()
                subject = g.get('subject') or 'Gyártási megrendelés'
                body = g.get('body') or ''
                is_html = bool(g.get('is_html', True))

                # Substitute placeholders (the frontend leaves
                # `{item_table_html}` in the body because Quill strips
                # <table> tags). Build the context server-side from the
                # actual cost-item ids.
                cost_item_ids = g.get('cost_item_ids') or []
                if cost_item_ids:
                    ci_qs = (ManufacturingCostItem.objects
                             .select_related('product', 'supplier', 'department')
                             .filter(id__in=cost_item_ids))
                    ctx = self._build_group_context(list(ci_qs))
                else:
                    ctx = {'item_count': 0, 'item_table_html': '', 'item_list_text': ''}
                ctx['recipient_label'] = label
                for ph in ('recipient_label', 'item_count', 'item_table_html', 'item_list_text'):
                    token = '{' + ph + '}'
                    subject = subject.replace(token, str(ctx[ph]))
                    body = body.replace(token, str(ctx[ph]))

                # Build a plain-text fallback so non-HTML clients see something
                if is_html:
                    import re as _re
                    text = _re.sub(r'<[^>]+>', '', body or '').strip() or subject
                else:
                    text = body or subject

                try:
                    msg = EmailMultiAlternatives(
                        subject=subject, body=text,
                        from_email=from_email, to=recipients_list,
                        cc=cc_list or None,
                        reply_to=[reply_to] if reply_to else None,
                        connection=connection,
                    )
                    if is_html and body:
                        msg.attach_alternative(body, 'text/html')
                    msg.send()
                    try:
                        from apps.core.email_utils import archive_to_imap_sent
                        archive_to_imap_sent(cfg, msg)
                    except Exception:
                        pass
                    # Stamp the send timestamp on each cost-item.
                    if cost_item_ids:
                        from django.utils import timezone as _tz
                        ManufacturingCostItem.objects.filter(id__in=cost_item_ids).update(
                            supplier_email_sent_at=_tz.now()
                        )
                    results.append({'key': key, 'label': label, 'sent': True,
                                    'recipients': recipients_list,
                                    'item_count': len(cost_item_ids)})
                except Exception as e:
                    results.append({'key': key, 'label': label, 'sent': False, 'error': str(e)})
            return Response({'results': results})

        # ── Legacy single-blob format ────────────────────────────────────
        ids = body_payload.get('cost_item_ids') or []
        recipients_override = body_payload.get('recipients') or {}
        if not isinstance(ids, list) or not ids:
            return Response({'error': 'cost_item_ids required'}, status=400)

        items_qs = (ManufacturingCostItem.objects
                    .select_related('product', 'supplier', 'department')
                    .filter(id__in=ids))

        groups = {}
        for ci in items_qs:
            if ci.is_internal and ci.department_id:
                key = f"dep:{ci.department_id}"
                label = ci.department.name if ci.department else f"Belső #{ci.department_id}"
                default_email = ''
                if ci.department:
                    mgr = ci.department.managers.exclude(email='').first()
                    if mgr:
                        default_email = mgr.email
            elif ci.supplier_id:
                key = f"sup:{ci.supplier_id}"
                label = ci.supplier.name if ci.supplier else f"Beszállító #{ci.supplier_id}"
                default_email = (ci.supplier.email or '') if ci.supplier else ''
            else:
                continue
            g = groups.setdefault(key, {
                'label': label,
                'email': recipients_override.get(key) or default_email,
                'items': [],
            })
            g['items'].append(ci)

        if not groups:
            return Response({'error': 'A kijelölt tételekhez nincs címzett'}, status=400)

        tpl = EmailTemplate.objects.filter(key='manufacturing_supplier_order').first()
        for key, g in groups.items():
            if not g['email']:
                results.append({'key': key, 'label': g['label'], 'sent': False, 'error': 'Hiányzó címzett'})
                continue
            ctx = self._build_group_context(g['items'])
            ctx['recipient_label'] = g['label']

            if tpl:
                try:
                    subject = (tpl.subject_template or 'Gyártási megrendelés - {item_count} tétel').format(**ctx)
                    body_core = (tpl.body_template or '').format(**ctx)
                    is_html = tpl.is_html
                except Exception:
                    subject = f"Gyártási megrendelés - {len(g['items'])} tétel"
                    body_core = ''
                    is_html = True
                html = body_core if is_html else None
                text = body_core if not is_html else ctx['item_list_text']
            else:
                subject = f"Gyártási megrendelés - {len(g['items'])} tétel ({g['label']})"
                html = (
                    f"<p>Tisztelt {g['label']}!</p>"
                    f"<p>Kérjük, az alábbi tételek gyártását / leszállítását szíveskedjenek megkezdeni:</p>"
                    f"{ctx['item_table_html']}"
                    f"<p>Köszönettel,<br>PixiERP</p>"
                )
                text = ctx['item_list_text']

            recipients_list = [e.strip() for e in g['email'].replace(';', ',').split(',') if e.strip()]
            try:
                msg = EmailMultiAlternatives(
                    subject=subject, body=text,
                    from_email=from_email, to=recipients_list,
                    connection=connection,
                )
                if html:
                    msg.attach_alternative(html, 'text/html')
                msg.send()
                try:
                    from apps.core.email_utils import archive_to_imap_sent
                    archive_to_imap_sent(cfg, msg)
                except Exception:
                    pass
                # Stamp the send timestamp on each cost-item.
                _ids = [i.id for i in g['items']]
                if _ids:
                    from django.utils import timezone as _tz
                    ManufacturingCostItem.objects.filter(id__in=_ids).update(
                        supplier_email_sent_at=_tz.now()
                    )
                results.append({'key': key, 'label': g['label'], 'sent': True,
                                'recipients': recipients_list, 'item_count': len(g['items'])})
            except Exception as e:
                results.append({'key': key, 'label': g['label'], 'sent': False, 'error': str(e)})

        return Response({'results': results})

    @action(detail=True, methods=['get'], url_path='work_sheet')
    def work_sheet(self, request, pk=None):
        """Per-item worksheet PDF — A4, két részes (külső + belső).

        Felül a KÜLSŐ rész: csak az alap információk + tételnév + leírás
        + altételek lista (checkbox + név + mennyiség, beszállító nélkül).
        Alul a BELSŐ rész: minden látszik (belső leírás, megjegyzés,
        beszállító/részleg oszlop, altétel megjegyzések). A két részt
        szaggatott vonal választja el, mint a sales/customer-orders
        munkalapját.
        """
        from django.http import HttpResponse
        from io import BytesIO
        try:
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.units import cm
            from reportlab.lib.utils import ImageReader
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont
            import qrcode
        except ImportError:
            return Response({'error': 'ReportLab not installed'}, status=500)
        from django.conf import settings as dj_settings
        import re as _re
        from html import unescape as _html_unescape

        def strip_html(s):
            if not s:
                return ''
            # Replace block-level tags with newlines so multi-paragraph text
            # doesn't run together, then strip remaining tags.
            s = _re.sub(r'(?i)<\s*(br|/p|/div|/li|/h[1-6])\s*[^>]*>', '\n', s)
            s = _re.sub(r'<[^>]+>', '', s)
            s = _html_unescape(s)
            # Collapse excessive whitespace, keep paragraph breaks
            s = _re.sub(r'[ \t]+', ' ', s)
            s = _re.sub(r'\n\s*\n+', '\n', s)
            return s.strip()

        ci = self.get_object()
        product = ci.product
        order, coi = self._resolve_order_context(ci)

        # Font setup
        try:
            pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
            pdfmetrics.registerFont(TTFont('DejaVu-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
            font_normal = 'DejaVu'
            font_bold = 'DejaVu-Bold'
        except Exception:
            font_normal = 'Helvetica'
            font_bold = 'Helvetica-Bold'

        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4

        # Header info
        order_number = order.order_number if order else '-'
        customer_name = '-'
        contact_name = ''
        project_name = ''
        deadline = ''
        item_note = ''
        item_qty_str = ''
        if order and order.quote_request:
            rfq = order.quote_request
            if rfq.company:
                customer_name = rfq.company.name
            elif rfq.customer:
                customer_name = rfq.customer.name
            try:
                c = rfq.contacts.first()
                if c:
                    contact_name = c.name
                    # Fallback: derive customer from the first contact's
                    # company when the RFQ has no company / customer FK.
                    if customer_name == '-' and getattr(c, 'company', None):
                        customer_name = c.company.name or '-'
            except Exception:
                pass
            if rfq.project:
                project_name = rfq.project.name
            if rfq.deadline:
                deadline = rfq.deadline.strftime('%Y.%m.%d')
        if coi:
            try:
                item_qty_str = f"{float(coi.quantity):g}"
                qi = coi.quote_item
                if qi and qi.unit:
                    item_qty_str += f" {qi.unit}"
            except Exception:
                pass
            item_note = strip_html(coi.description or (coi.quote_item.description if coi.quote_item else '') or '')

        product_code = getattr(product, 'code', '') or ''
        product_name = product.name or ''
        product_internal_desc = strip_html(getattr(product, 'internal_description', '') or '')
        product_desc = strip_html(getattr(product, 'description', '') or '')

        # QR (link back to the order page)
        base_url = getattr(dj_settings, 'FRONTEND_BASE_URL', 'https://e.pixisys.eu').rstrip('/')
        if order:
            target_url = f"{base_url}/sales/customer-orders/{order.id}"
        else:
            target_url = f"{base_url}/manufacturing/queue"
        try:
            qr = qrcode.QRCode(version=1, box_size=10, border=2)
            qr.add_data(target_url)
            qr.make(fit=True)
            qr_pil = qr.make_image(fill_color='black', back_color='white')
            qr_buf = BytesIO()
            qr_pil.save(qr_buf, format='PNG')
            qr_buf.seek(0)
            qr_image = ImageReader(qr_buf)
        except Exception:
            qr_image = None

        # Sub-items (altételek) — all cost items belonging to the same
        # ManufacturingProduct (parent of the clicked row). Ordered to
        # match the queue page: by queue_position (nulls last), then id.
        from django.db.models import F
        sub_items = list(
            ManufacturingCostItem.objects
            .select_related('supplier', 'department')
            .filter(product=product)
            .order_by(F('queue_position').asc(nulls_last=True), 'id')
        )

        # ── Drawing helpers ─────────────────────────────────────────────
        from reportlab.pdfbase.pdfmetrics import stringWidth
        left = 2 * cm
        right_margin = 2 * cm

        def wrap_to_width(text, fname, fsize, max_w):
            """Wrap text honoring explicit newlines AND word boundaries."""
            out = []
            for paragraph in (text or '').split('\n'):
                words = paragraph.split()
                if not words:
                    out.append('')
                    continue
                cur = ''
                for w in words:
                    cand = (cur + ' ' + w).strip()
                    if stringWidth(cand, fname, fsize) <= max_w:
                        cur = cand
                    else:
                        if cur:
                            out.append(cur)
                        cur = w
                if cur:
                    out.append(cur)
            return out or ['']

        def draw_section(start_y, *, internal):
            """Draw one half of the worksheet.

            external (internal=False): only the basic info + product +
                description + altételek (checkbox + név + mennyiség).
            internal (internal=True): everything — including belső leírás,
                megjegyzés, beszállító oszlop és altétel-megjegyzések.
            Returns the final y coordinate.
            """
            y = start_y
            qr_size = 2.5 * cm

            # Title + section tag + QR top right
            p.setFont(font_bold, 12)
            tag = 'BELSŐ' if internal else 'KÜLSŐ'
            p.drawString(left, y, f"MUNKALAP - {order_number}  ({tag})")
            if qr_image:
                p.drawImage(qr_image, width - right_margin - qr_size,
                            y - qr_size + 0.4 * cm, width=qr_size, height=qr_size)
            text_right_limit = width - right_margin - qr_size - 0.5 * cm
            max_text_w = text_right_limit - left
            y -= 0.8 * cm

            def header_row(label, value):
                nonlocal y
                if not value:
                    return
                p.setFont(font_bold, 9)
                p.drawString(left, y, f"{label}:")
                p.setFont(font_normal, 9)
                lo = 2.6 * cm
                lines = wrap_to_width(str(value), font_normal, 9, max_text_w - lo)
                for i, line in enumerate(lines[:2]):
                    p.drawString(left + lo, y - i * 0.4 * cm, line)
                y -= max(0.45 * cm, len(lines[:2]) * 0.4 * cm)

            header_row('Megrendelő', f"{customer_name}{(' - ' + contact_name) if contact_name else ''}")
            header_row('Projekt', project_name)
            header_row('Határidő', deadline)
            # Move below QR area before the wide content blocks
            y = min(y, start_y - qr_size - 0.2 * cm)

            # Product block
            p.setStrokeColorRGB(0.6, 0.6, 0.6)
            p.setLineWidth(0.4)
            p.line(left, y, width - right_margin, y)
            y -= 0.45 * cm

            p.setFont(font_bold, 10)
            p.drawString(left, y, "TÉTEL")
            y -= 0.45 * cm

            p.setFont(font_bold, 9)
            p.drawString(left, y, "Cikkszám:")
            p.setFont(font_normal, 9)
            p.drawString(left + 2.6 * cm, y, product_code or '-')
            if item_qty_str:
                p.setFont(font_bold, 9)
                p.drawString(left + 8 * cm, y, "Mennyiség:")
                p.setFont(font_normal, 9)
                p.drawString(left + 10.4 * cm, y, item_qty_str)
            y -= 0.45 * cm

            p.setFont(font_bold, 9)
            p.drawString(left, y, "Megnevezés:")
            p.setFont(font_normal, 9)
            for i, line in enumerate(wrap_to_width(product_name, font_normal, 9,
                                                   width - left - right_margin - 2.6 * cm)[:2]):
                p.drawString(left + 2.6 * cm, y - i * 0.4 * cm, line)
            y -= 0.45 * cm

            if product_desc:
                p.setFont(font_bold, 9)
                p.drawString(left, y, "Leírás:")
                y -= 0.4 * cm
                p.setFont(font_normal, 9)
                max_lines = 4 if internal else 6
                for line in wrap_to_width(product_desc, font_normal, 9,
                                          width - left - right_margin)[:max_lines]:
                    p.drawString(left, y, line)
                    y -= 0.38 * cm
                y -= 0.05 * cm

            # The following blocks are BELSŐ only.
            if internal and product_internal_desc:
                p.setFont(font_bold, 9)
                p.drawString(left, y, "Belső leírás:")
                y -= 0.4 * cm
                p.setFont(font_normal, 9)
                for line in wrap_to_width(product_internal_desc, font_normal, 9,
                                          width - left - right_margin)[:4]:
                    p.drawString(left, y, line)
                    y -= 0.38 * cm
                y -= 0.05 * cm

            if internal and item_note:
                p.setFont(font_bold, 9)
                p.drawString(left, y, "Megjegyzés:")
                y -= 0.4 * cm
                p.setFont(font_normal, 9)
                for line in wrap_to_width(item_note, font_normal, 9,
                                          width - left - right_margin)[:5]:
                    p.drawString(left, y, line)
                    y -= 0.38 * cm
                y -= 0.05 * cm

            # ── Altételek ──────────────────────────────────────────── (csak BELSŐ)
            if not internal:
                return y
            y -= 0.15 * cm
            p.line(left, y, width - right_margin, y)
            y -= 0.4 * cm

            p.setFont(font_bold, 10)
            p.drawString(left, y, f"ALTÉTELEK ({len(sub_items)})")
            y -= 0.4 * cm

            # Column layout differs between halves
            col_x_box = left
            col_x_name = left + 0.55 * cm
            col_x_qty = width - right_margin - (5.5 * cm if internal else 3 * cm)
            col_x_supp = width - right_margin - 3.5 * cm  # only on internal

            p.setFont(font_bold, 8)
            p.drawString(col_x_name, y, "Tétel")
            p.drawString(col_x_qty, y, "Mennyiség")
            if internal:
                p.drawString(col_x_supp, y, "Beszállító / Részleg")
            y -= 0.12 * cm
            p.setLineWidth(0.3)
            p.line(left, y, width - right_margin, y)
            y -= 0.32 * cm

            p.setFont(font_normal, 8)
            for sub in sub_items:
                # Stop drawing when out of this section's space
                if y < (height / 2 + 0.5 * cm if not internal else 1.5 * cm):
                    p.setFont(font_normal, 7)
                    p.setFillGray(0.4)
                    p.drawString(col_x_name, y, '… (a lista folytatódik)')
                    p.setFillGray(0)
                    break

                box = 0.3 * cm
                p.setLineWidth(0.6)
                p.rect(col_x_box, y - box + 0.05 * cm, box, box, stroke=1, fill=0)

                is_self = sub.id == ci.id
                if is_self:
                    p.setFont(font_bold, 8)

                name_max = (col_x_qty - col_x_name - 0.2 * cm)
                name_lines = wrap_to_width(sub.name or '', font_normal, 8, name_max)
                p.drawString(col_x_name, y, name_lines[0])

                try:
                    qty_txt = f"{float(sub.quantity):g} {sub.unit or ''}".strip()
                except Exception:
                    qty_txt = f"{sub.quantity} {sub.unit or ''}".strip()
                p.drawString(col_x_qty, y, qty_txt)

                if internal:
                    if sub.is_internal:
                        supp_txt = f"Belső: {sub.department.name}" if sub.department else "Belső"
                    elif sub.supplier:
                        supp_txt = sub.supplier.name
                    else:
                        supp_txt = '-'
                    p.drawString(col_x_supp, y,
                                 wrap_to_width(supp_txt, font_normal, 8,
                                               width - right_margin - col_x_supp)[0])

                y -= 0.38 * cm

                # Continuation lines for very long names
                for extra in name_lines[1:2]:
                    p.drawString(col_x_name, y, extra)
                    y -= 0.34 * cm

                # Sub-item notes only on the internal half
                if internal and sub.notes:
                    p.setFont(font_normal, 7)
                    p.setFillGray(0.4)
                    notes_clean = strip_html(sub.notes)
                    for line in wrap_to_width(f"↳ {notes_clean}", font_normal, 7,
                                              width - col_x_name - right_margin)[:3]:
                        p.drawString(col_x_name, y, line)
                        y -= 0.3 * cm
                    p.setFillGray(0)

                if is_self:
                    p.setFont(font_normal, 8)

                y -= 0.05 * cm

            return y

        # Top half = KÜLSŐ
        top_end = draw_section(height - 1.5 * cm, internal=False)

        # Dashed separator at the page's vertical mid
        sep_y = height / 2
        p.setDash(6, 3)
        p.setLineWidth(0.5)
        p.line(2 * cm, sep_y, width - 2 * cm, sep_y)
        p.setDash()

        # Bottom half = BELSŐ
        bottom_start = sep_y - 0.6 * cm
        draw_section(bottom_start, internal=True)

        p.showPage()
        p.save()
        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="munkalap_item_{ci.id}.pdf"'
        return response


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
