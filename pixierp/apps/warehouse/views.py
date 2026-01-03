from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Sum
from .models import (
    MaterialType, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialReceipt
)
from .serializers import (
    MaterialTypeSerializer, MaterialSerializer, WarehouseSerializer, 
    ShelfSerializer, MaterialSupplierSerializer, InventorySerializer, 
    MaterialReceiptSerializer, MaterialReceiptCreateSerializer
)

class MaterialTypeViewSet(viewsets.ModelViewSet):
    """Alapanyag típusok kezelése"""
    queryset = MaterialType.objects.all()
    serializer_class = MaterialTypeSerializer

class MaterialViewSet(viewsets.ModelViewSet):
    """Alapanyagok kezelése"""
    queryset = Material.objects.all()
    serializer_class = MaterialSerializer
    
    def get_queryset(self):
        queryset = Material.objects.all()
        material_type = self.request.query_params.get('material_type', None)
        search = self.request.query_params.get('search', None)
        
        if material_type:
            queryset = queryset.filter(material_type_id=material_type)
        
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | 
                Q(code__icontains=search) |
                Q(description__icontains=search)
            )
        
        return queryset

class WarehouseViewSet(viewsets.ModelViewSet):
    """Raktárak kezelése"""
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer

class ShelfViewSet(viewsets.ModelViewSet):
    """Polcok kezelése"""
    queryset = Shelf.objects.all()
    serializer_class = ShelfSerializer
    
    def get_queryset(self):
        queryset = Shelf.objects.all()
        warehouse = self.request.query_params.get('warehouse', None)
        
        if warehouse:
            queryset = queryset.filter(warehouse_id=warehouse)
        
        return queryset

class MaterialSupplierViewSet(viewsets.ModelViewSet):
    """Alapanyag beszállítók kezelése"""
    queryset = MaterialSupplier.objects.all()
    serializer_class = MaterialSupplierSerializer
    
    def get_queryset(self):
        queryset = MaterialSupplier.objects.all()
        material = self.request.query_params.get('material', None)
        supplier = self.request.query_params.get('supplier', None)
        
        if material:
            queryset = queryset.filter(material_id=material)
        
        if supplier:
            queryset = queryset.filter(supplier_id=supplier)
        
        return queryset

class InventoryViewSet(viewsets.ModelViewSet):
    """Készlet kezelése"""
    queryset = Inventory.objects.all()
    serializer_class = InventorySerializer
    
    def get_queryset(self):
        queryset = Inventory.objects.all()
        material = self.request.query_params.get('material', None)
        warehouse = self.request.query_params.get('warehouse', None)
        low_stock = self.request.query_params.get('low_stock', None)
        
        if material:
            queryset = queryset.filter(material_id=material)
        
        if warehouse:
            queryset = queryset.filter(warehouse_id=warehouse)
        
        if low_stock == 'true':
            # Készlet alacsonyabb, mint a minimum készletszint
            queryset = queryset.filter(quantity__lt=models.F('material__min_stock_level'))
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Készlet összesítés"""
        queryset = self.get_queryset()
        
        # Összesítés anyag szerint
        material_summary = queryset.values(
            'material__name', 'material__code', 'material__unit'
        ).annotate(
            total_quantity=Sum('quantity')
        ).order_by('material__name')
        
        # Összesítés raktár szerint
        warehouse_summary = queryset.values(
            'warehouse__name'
        ).annotate(
            total_quantity=Sum('quantity')
        ).order_by('warehouse__name')
        
        return Response({
            'material_summary': material_summary,
            'warehouse_summary': warehouse_summary
        })

class MaterialReceiptViewSet(viewsets.ModelViewSet):
    """Alapanyag bevételezések kezelése"""
    queryset = MaterialReceipt.objects.all()
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return MaterialReceiptCreateSerializer
        return MaterialReceiptSerializer
    
    def get_queryset(self):
        queryset = MaterialReceipt.objects.all()
        material = self.request.query_params.get('material', None)
        supplier = self.request.query_params.get('supplier', None)
        warehouse = self.request.query_params.get('warehouse', None)
        status_filter = self.request.query_params.get('status', None)
        
        if material:
            queryset = queryset.filter(material_id=material)
        
        if supplier:
            queryset = queryset.filter(supplier_id=supplier)
        
        if warehouse:
            queryset = queryset.filter(warehouse_id=warehouse)
        
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def confirm_receipt(self, request, pk=None):
        """Bevételezés megerősítése és készlet frissítése"""
        receipt = self.get_object()
        
        if receipt.status != 'pending':
            return Response(
                {'error': 'Csak függőben lévő bevételezés erősíthető meg!'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Készlet frissítése
        inventory, created = Inventory.objects.get_or_create(
            material=receipt.material,
            warehouse=receipt.warehouse,
            shelf=receipt.shelf,
            defaults={'quantity': 0}
        )
        
        inventory.quantity += receipt.quantity
        inventory.updated_by = request.user
        inventory.save()
        
        # Bevételezés státuszának frissítése
        receipt.status = 'received'
        receipt.save()
        
        return Response({'message': 'Bevételezés sikeresen megerősítve!'})
    
    @action(detail=True, methods=['post'])
    def cancel_receipt(self, request, pk=None):
        """Bevételezés törlése"""
        receipt = self.get_object()
        
        if receipt.status == 'received':
            return Response(
                {'error': 'Már bevételezett tétel nem törölhető!'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        receipt.status = 'cancelled'
        receipt.save()
        
        return Response({'message': 'Bevételezés sikeresen törölve!'})
