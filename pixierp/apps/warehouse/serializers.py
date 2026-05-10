from rest_framework import serializers
from django.db import models
from .models import (
    MaterialType, MaterialGroup, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialCostItem, MaterialSize,
    MaterialStock, MaterialReceipt, StockMovement,
    SupplierInvoice, InvoiceItem,
    ScrapRecord, ScrapItem, MaterialRemnant,
)
from apps.crm.models import Company

class MaterialTypeSerializer(serializers.ModelSerializer):
    """Alapanyag típus serializer"""
    
    class Meta:
        model = MaterialType
        fields = ['id', 'name', 'description', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class MaterialGroupSerializer(serializers.ModelSerializer):
    """Alapanyag gyűjtő serializer"""
    materials_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    
    class Meta:
        model = MaterialGroup
        fields = [
            'id', 'name', 'description', 'is_active', 
            'materials_count', 'created_at', 'updated_at', 
            'created_by', 'created_by_name', 'parent', 'parent_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'materials_count']
    
    def get_materials_count(self, obj):
        return obj.get_materials_count()


class MaterialSerializer(serializers.ModelSerializer):
    """Alapanyag serializer"""
    material_type_name = serializers.CharField(source='material_type.name', read_only=True)
    material_group_name = serializers.CharField(source='material_group.get_full_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    default_supplier_name = serializers.CharField(source='default_supplier.name', read_only=True)
    internal_production_department_name = serializers.CharField(
        source='internal_production_department.name', read_only=True
    )
    base_price = serializers.SerializerMethodField()
    gross_price = serializers.SerializerMethodField()
    net_price = serializers.SerializerMethodField()
    vat_rate = serializers.SerializerMethodField()
    current_stock = serializers.SerializerMethodField()
    discount_price = serializers.SerializerMethodField()
    
    # Cache for VAT types to avoid repeated API calls
    _vat_types_cache = {}
    
    def get_base_price(self, obj):
        """Return unit_selling_price as base_price for compatibility with product selector"""
        return obj.unit_selling_price
    
    def get_net_price(self, obj):
        """Return unit_selling_price as net_price for POS"""
        return float(obj.unit_selling_price or 0)
    
    def get_vat_rate(self, obj):
        """Get VAT rate from vat_type_id"""
        if not obj.vat_type_id:
            return 27.0  # Default VAT rate in Hungary
        
        # Try to get from cache first
        if obj.vat_type_id in self._vat_types_cache:
            return self._vat_types_cache[obj.vat_type_id]
        
        try:
            import requests
            response = requests.get(
                f'http://localhost:4001/api/vat-types/{obj.vat_type_id}/',
                timeout=2
            )
            if response.status_code == 200:
                vat_data = response.json()
                vat_percentage = float(vat_data.get('percentage', 27.0))
                # Cache it
                self._vat_types_cache[obj.vat_type_id] = vat_percentage
                return vat_percentage
        except Exception as e:
            print(f"Error fetching VAT type: {e}")
        
        return 27.0  # Fallback to default
    
    def get_gross_price(self, obj):
        """Calculate gross price from net price and VAT rate"""
        net_price = self.get_net_price(obj)
        vat_rate = self.get_vat_rate(obj)
        gross_price = net_price * (1 + vat_rate / 100)
        return round(gross_price, 2)
    
    def get_current_stock(self, obj):
        """Get total current stock from all warehouses"""
        from apps.warehouse.models import Inventory
        total = Inventory.objects.filter(material=obj).aggregate(
            total=models.Sum('quantity')
        )['total']
        return float(total or 0)
    
    def get_discount_price(self, obj):
        """Placeholder for discount price - can be implemented based on campaigns"""
        return None
    
    class Meta:
        model = Material
        fields = [
            'id', 'is_material', 'is_product', 'name', 'code', 'description', 
            'material_type', 'material_type_name',
            'material_group', 'material_group_name',
            'unit', 'min_stock_level', 'width', 'length', 'height', 'dimension_unit',
            'width_fixed', 'length_fixed', 'height_fixed',
            'density', 'density_unit', 'material_format', 'roll_width', 'sheet_division',
            'yield_percentage',
            'area_weight', 'area_weight_unit', 'specific_weight', 'specific_weight_unit',
            'weight', 'weight_unit', 'volume_liter',
            'unit_cost_price', 'markup_percentage', 'unit_selling_price', 'base_price',
            'vat_type_id', 'gross_price', 'net_price', 'vat_rate', 'current_stock', 'discount_price',
            'currency', 'price_source_mode', 'default_price_calculation_version',
            'default_supplier', 'default_supplier_name',
            'is_internal_production', 'internal_production_department',
            'internal_production_department_name', 'internal_production_cost',
            'internal_fixed_cost', 'internal_price_per_unit', 'internal_price_per_perimeter',
            'internal_price_per_area', 'internal_price_per_weight', 'internal_price_per_time',
            'available_widths', 'available_lengths', 'available_thicknesses',
            'is_active', 'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']

class WarehouseSerializer(serializers.ModelSerializer):
    """Raktár serializer"""
    
    class Meta:
        model = Warehouse
        fields = ['id', 'name', 'code', 'address', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

class ShelfSerializer(serializers.ModelSerializer):
    """Polc serializer"""
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    
    class Meta:
        model = Shelf
        fields = [
            'id', 'warehouse', 'warehouse_name', 'name', 'code', 
            'description', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

class MaterialSupplierSerializer(serializers.ModelSerializer):
    """Alapanyag beszállító serializer"""
    material_name = serializers.CharField(source='material.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    
    class Meta:
        model = MaterialSupplier
        fields = [
            'id', 'material', 'material_name', 'supplier', 'supplier_name',
            'supplier_external_id', 'supplier_code', 'unit_price', 'currency', 'is_primary', 
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

class InventorySerializer(serializers.ModelSerializer):
    """Készlet serializer"""
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    material_unit = serializers.CharField(source='material.unit', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    shelf_name = serializers.CharField(source='shelf.name', read_only=True)
    updated_by_name = serializers.CharField(source='updated_by.get_full_name', read_only=True)
    
    class Meta:
        model = Inventory
        fields = [
            'id', 'material', 'material_name', 'material_code', 'material_unit',
            'warehouse', 'warehouse_name', 'shelf', 'shelf_name',
            'quantity', 'last_updated', 'updated_by', 'updated_by_name'
        ]
        read_only_fields = ['last_updated', 'updated_by']

class MaterialReceiptSerializer(serializers.ModelSerializer):
    """Alapanyag bevételezés serializer"""
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    material_unit = serializers.CharField(source='material.unit', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    shelf_name = serializers.CharField(source='shelf.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = MaterialReceipt
        fields = [
            'id', 'receipt_number', 'material', 'material_name', 'material_code', 'material_unit',
            'supplier', 'supplier_name', 'warehouse', 'warehouse_name', 'shelf', 'shelf_name',
            'quantity', 'unit_price', 'total_price', 'currency', 'status',
            'receipt_date', 'notes', 'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'total_price']

class MaterialReceiptCreateSerializer(serializers.ModelSerializer):
    """Alapanyag bevételezés létrehozó serializer"""
    
    def create(self, validated_data):
        # Automatikusan generáljuk a bevételezési számot
        if not validated_data.get('receipt_number'):
            import uuid
            validated_data['receipt_number'] = f"BR-{uuid.uuid4().hex[:8].upper()}"
        return super().create(validated_data)
    
    class Meta:
        model = MaterialReceipt
        fields = [
            'receipt_number', 'material', 'supplier', 'warehouse', 'shelf',
            'quantity', 'unit_price', 'currency', 'receipt_date', 'notes'
        ]




class MaterialCostItemSerializer(serializers.ModelSerializer):
    """Alapanyag költség elem serializer"""
    supplier = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.filter(is_supplier=True),
        required=False, allow_null=True
    )
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    calculation_type_display = serializers.CharField(source='get_calculation_type_display', read_only=True)
    
    class Meta:
        model = MaterialCostItem
        fields = [
            'id', 'material', 'supplier', 'supplier_name', 'is_internal',
            'name', 'calculation_type', 'calculation_type_display', 'unit',
            'price_calculation_version', 'unit_price', 'price_quantity',
            'markup_percentage', 'selling_price', 'currency',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'selling_price']


class MaterialSizeSerializer(serializers.ModelSerializer):
    """Rendelhető méret serializer"""
    effective_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    pricing_type_display = serializers.CharField(source='get_pricing_type_display', read_only=True)

    class Meta:
        model = MaterialSize
        fields = [
            'id', 'material', 'name', 'width', 'length', 'height',
            'dimension_unit', 'pricing_type', 'pricing_type_display',
            'custom_price', 'calculated_price', 'effective_price',
            'is_active', 'sort_order', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'calculated_price']


class MaterialStockSerializer(serializers.ModelSerializer):
    """Készlet serializer"""
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    material_unit = serializers.CharField(source='material.unit', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    receipt_info = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = MaterialStock
        fields = [
            'id', 'material', 'material_name', 'material_code', 'material_unit',
            'warehouse', 'warehouse_name', 'quantity',
            'width', 'length', 'thickness', 'dimension_unit',
            'unit_value', 'total_value', 'currency', 'status', 'status_display',
            'used_length',
            'receipt', 'receipt_info', 'created_at', 'updated_at',
            'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'total_value']
    
    def get_receipt_info(self, obj):
        if obj.receipt:
            return {
                'id': obj.receipt.id,
                'date': obj.receipt.receipt_date,
                'supplier': obj.receipt.supplier.name if obj.receipt.supplier else None,
                'invoice_number': obj.receipt.invoice_number
            }
        return None


class MaterialReceiptSerializer(serializers.ModelSerializer):
    """Bevételezés serializer"""
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = MaterialReceipt
        fields = [
            'id', 'material', 'material_name', 'material_code',
            'warehouse', 'warehouse_name', 'supplier', 'supplier_name',
            'receipt_date', 'invoice_number', 'invoice_value', 'currency',
            'quantity', 'unit_price', 'width', 'length', 'thickness',
            'dimension_unit', 'stock_count', 'notes', 'created_at', 'updated_at',
            'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at']


class StockMovementSerializer(serializers.ModelSerializer):
    """Készlet mozgás serializer"""
    stock_info = serializers.SerializerMethodField()
    from_warehouse_name = serializers.CharField(source='from_warehouse.name', read_only=True)
    to_warehouse_name = serializers.CharField(source='to_warehouse.name', read_only=True)
    movement_type_display = serializers.CharField(source='get_movement_type_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = StockMovement
        fields = [
            'id', 'stock', 'stock_info', 'movement_type', 'movement_type_display',
            'from_warehouse', 'from_warehouse_name', 'to_warehouse', 'to_warehouse_name',
            'quantity', 'notes', 'created_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at']
    
    def get_stock_info(self, obj):
        return {
            'id': obj.stock.id,
            'material_name': obj.stock.material.name,
            'material_code': obj.stock.material.code
        }


class InvoiceItemSerializer(serializers.ModelSerializer):
    """Számla tétel serializer"""
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    material_unit = serializers.CharField(source='material.unit', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    
    # Figyelmeztetés, ha az egységár eltér a beállított bekerülési ártól
    price_warning = serializers.SerializerMethodField()
    
    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'invoice', 'material', 'material_name', 'material_code', 'material_unit',
            'warehouse', 'warehouse_name', 'quantity', 'unit', 'unit_price', 'total_price',
            'width', 'length', 'thickness', 'dimension_unit', 'notes',
            'price_warning', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'total_price', 'price_warning']
    
    def get_price_warning(self, obj):
        """Ellenőrzi, hogy az egységár eltér-e a beállított bekerülési ártól"""
        if obj.material and obj.material.unit_cost_price:
            expected_price = float(obj.material.unit_cost_price)
            actual_price = float(obj.unit_price)
            difference = abs(expected_price - actual_price)
            percentage_diff = (difference / expected_price * 100) if expected_price > 0 else 0
            
            if percentage_diff > 5:  # 5% eltérés felett figyelmeztet
                return {
                    'has_warning': True,
                    'expected_price': expected_price,
                    'actual_price': actual_price,
                    'difference': round(difference, 2),
                    'percentage_diff': round(percentage_diff, 2)
                }
        return {'has_warning': False}


class SupplierInvoiceSerializer(serializers.ModelSerializer):
    """Beszállítói számla serializer"""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    # Tételek
    items = InvoiceItemSerializer(many=True, read_only=True)
    items_count = serializers.SerializerMethodField()
    
    class Meta:
        model = SupplierInvoice
        fields = [
            'id', 'invoice_number', 'supplier', 'supplier_name',
            'invoice_date', 'fulfillment_date', 'receipt_date', 'due_date', 'payment_date',
            'payment_method', 'payment_method_display', 'currency', 'total_amount',
            'status', 'status_display', 'invoice_images', 'notes',
            'items', 'items_count',
            'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'items', 'items_count']
    
    def get_items_count(self, obj):
        return obj.items.count()


class ScrapItemSerializer(serializers.ModelSerializer):
    """Selejtezett tétel serializer"""
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    
    class Meta:
        model = ScrapItem
        fields = [
            'id', 'scrap_record', 'stock', 'material', 'material_name', 'material_code',
            'warehouse', 'warehouse_name', 'quantity',
            'width', 'length', 'thickness', 'dimension_unit',
            'unit_cost_value', 'unit_selling_value',
            'total_cost_value', 'total_selling_value', 'currency',
            'created_at'
        ]
        read_only_fields = ['created_at', 'total_cost_value', 'total_selling_value']


class ScrapRecordSerializer(serializers.ModelSerializer):
    """Selejtezési jegyzőkönyv serializer"""
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    items = ScrapItemSerializer(many=True, read_only=True)
    items_count = serializers.SerializerMethodField()
    materials_summary = serializers.SerializerMethodField()
    
    class Meta:
        model = ScrapRecord
        fields = [
            'id', 'scrap_date', 'scrap_number', 'reason', 'images',
            'total_cost_value', 'total_selling_value', 'currency',
            'is_approved', 'approved_by', 'approved_by_name', 'approved_at',
            'notes', 'items', 'items_count', 'materials_summary',
            'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = [
            'scrap_number', 'total_cost_value', 'total_selling_value',
            'created_at', 'updated_at', 'items', 'items_count', 'materials_summary'
        ]
    
    def get_items_count(self, obj):
        return obj.items.count()
    
    def get_materials_summary(self, obj):
        """Összesítés selejtezett termékekről"""
        items = obj.items.select_related('material').all()
        summary = []
        for item in items:
            summary.append(f"{item.material.name} ({item.quantity} {item.material.unit})")
        return ", ".join(summary) if summary else "-"



class MaterialRemnantSerializer(serializers.ModelSerializer):
    """Alapanyag maradék serializer."""
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    material_unit = serializers.CharField(source='material.unit', read_only=True)
    material_format = serializers.CharField(source='material.material_format', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    area_m2 = serializers.FloatField(source='area_m2', read_only=True)

    class Meta:
        model = MaterialRemnant
        fields = [
            'id', 'material', 'material_name', 'material_code', 'material_unit',
            'material_format', 'warehouse', 'warehouse_name',
            'width_mm', 'height_mm', 'length_mm',
            'quantity', 'is_available', 'area_m2',
            'unit_value', 'currency',
            'source_job_ref', 'source_stock',
            'notes', 'created_at', 'updated_at',
            'created_by', 'created_by_name',
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']
