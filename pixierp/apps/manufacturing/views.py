from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from apps.core.permissions import OwnDataFilterMixin
from .models import (
    ProductClass, Project, ManufacturingProduct, Service, 
    CalculatorTemplate, Calculation, ServiceSupplierPrice, ServiceCostItem
)
from .serializers import (
    ProductClassSerializer, ProjectSerializer, ManufacturingProductSerializer, 
    CurrencySerializer, ServiceSerializer, CalculatorTemplateSerializer, 
    CalculationSerializer, ServiceSupplierPriceSerializer, ServiceCostItemSerializer
)
from apps.crm.models import Contact
from apps.hr.models import Employee
from apps.core.models import Currency
from django.core.management import call_command
from io import StringIO


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
    queryset = ManufacturingProduct.objects.all()
    serializer_class = ManufacturingProductSerializer
    permission_classes = [AllowAny]
    permission_module = 'manufacturing'
    permission_resource = 'manufacturing.products'
    own_data_user_field = 'created_by'  # ManufacturingProduct.created_by = User
    own_data_project_field = 'project'  # ManufacturingProduct.project -> Project.members
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'product_class', 'project', 'contact']
    search_fields = ['name', 'description', 'internal_description']
    ordering_fields = ['date', 'name', 'deadline', 'created_at']
    ordering = ['-created_at']
    
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
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)


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
        
        return queryset
