from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
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
