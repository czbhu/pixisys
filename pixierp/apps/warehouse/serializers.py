from rest_framework import serializers
from django.db import models
from .models import (
    MaterialType, MaterialGroup, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialCostItem, MaterialSize,
    MaterialStock, MaterialReceipt, MaterialReceiptBatch, StockMovement,
    SupplierInvoice, InvoiceItem,
    ScrapRecord, ScrapItem, MaterialRemnant, MaterialGroupApiSync, MaterialBarcode,
    Stocktake, StocktakeItem,
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
    image_url = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    
    class Meta:
        model = MaterialGroup
        fields = [
            'id', 'name', 'description', 'is_active', 
            'materials_count', 'image_url', 'created_at', 'updated_at', 
            'created_by', 'created_by_name', 'parent', 'parent_name',
            'public_slug', 'public_title', 'public_description', 'show_prices',
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'materials_count']
    
    def get_materials_count(self, obj):
        # Bulk-precomputed by MaterialGroupViewSet.list() to avoid a per-row COUNT query
        cached = getattr(obj, '_materials_count', None)
        if cached is not None:
            return cached
        return obj.get_materials_count()

    def get_image_url(self, obj):
        # Bulk-precomputed by MaterialGroupViewSet.list(); a representative product image
        # for shop-style category tiles (public shop + POS category browser).
        url = getattr(obj, '_image_url', None)
        if not url:
            return None
        from urllib.parse import quote
        if not url.startswith('http'):
            url = f"https://utteam.com/utt_img/product_images/640/{url.lstrip('/')}"
        # Helyi proxyn keresztül szolgáljuk ki (letöltés + 320px miniatűr +
        # szerver oldali gyorsítótár + böngésző cache fejléc): a külső macma.hu /
        # utteam.com képek közvetlen betöltése lassú a POS terminálokon.
        return f"/api/v1/warehouse/material-groups/category-image/?u={quote(url, safe='')}"


class MaterialGroupApiSyncSerializer(serializers.ModelSerializer):
    default_supplier_name = serializers.CharField(source='default_supplier.name', read_only=True)
    api_headers = serializers.JSONField(required=False, default=dict)
    api_body = serializers.JSONField(required=False, default=dict)
    field_mapping = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = MaterialGroupApiSync
        fields = [
            'id', 'material_group', 'name', 'api_url', 'api_method',
            'api_headers', 'api_body', 'field_mapping', 'items_path',
            'sync_interval_minutes', 'is_active',
            'default_supplier', 'default_supplier_name', 'default_markup_percentage',
            'last_synced_at', 'last_sync_status', 'last_sync_message', 'last_sync_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['last_synced_at', 'last_sync_status', 'last_sync_message', 'last_sync_count', 'created_at', 'updated_at']


class MaterialBarcodeSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)

    class Meta:
        model = MaterialBarcode
        fields = ['id', 'material', 'material_name', 'material_code', 'code', 'created_at']
        read_only_fields = ['created_at']


class POSProductSerializer(serializers.ModelSerializer):
    """Minimális, gyors serializer a Kassza (POS) termékböngészőhöz — csak a ténylegesen
    megjelenített mezők, nincs drága számítás/join, hogy nagy tételszám mellett is gyors legyen."""
    gross_price = serializers.SerializerMethodField()
    net_price = serializers.SerializerMethodField()
    vat_rate = serializers.SerializerMethodField()
    current_stock = serializers.SerializerMethodField()
    discount_price = serializers.SerializerMethodField()

    class Meta:
        model = Material
        fields = [
            'id', 'code', 'name', 'description', 'unit', 'material_group',
            'gross_price', 'net_price', 'vat_rate', 'current_stock', 'discount_price',
        ]

    def get_net_price(self, obj):
        return float(obj.unit_selling_price or 0)

    def get_vat_rate(self, obj):
        return 27.0

    def get_gross_price(self, obj):
        return round(self.get_net_price(obj) * 1.27, 2)

    def get_current_stock(self, obj):
        return 0

    def get_discount_price(self, obj):
        return float(obj.promo_price) if obj.promo_price is not None else None


class PublicMaterialSerializer(serializers.ModelSerializer):
    """Minimális serializer a nyilvános terméklistához."""
    material_group_names = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    external_stock = serializers.SerializerMethodField()

    def get_material_group_names(self, obj):
        return [g.get_full_name() for g in obj.material_groups.all()]

    def get_image_url(self, obj):
        url = obj.image_url
        if not url:
            return None
        if url.startswith('http'):
            return url
        return f"https://utteam.com/utt_img/product_images/640/{url.lstrip('/')}"

    def get_external_stock(self, obj):
        # Uses prefetch_related('variants') on the queryset for efficiency
        variants = obj.variants.all() if hasattr(obj, '_prefetched_objects_cache') else obj.variants.all()
        return sum(v.stock_quantity for v in variants)

    class Meta:
        model = Material
        fields = [
            'id', 'name', 'code', 'description',
            'unit', 'unit_selling_price', 'currency',
            'material_group_names', 'material_format',
            'width', 'length', 'height', 'dimension_unit',
            'is_active', 'image_url', 'external_stock',
        ]


class MaterialSerializer(serializers.ModelSerializer):
    """Alapanyag serializer"""
    material_type_name = serializers.CharField(source='material_type.name', read_only=True)
    material_group_name = serializers.CharField(source='material_group.get_full_name', read_only=True)
    material_groups = serializers.PrimaryKeyRelatedField(
        many=True, queryset=MaterialGroup.objects.all(),
        required=False,
    )
    material_group_names = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    default_supplier_name = serializers.CharField(source='default_supplier.name', read_only=True)
    internal_production_department_name = serializers.CharField(
        source='internal_production_department.name', read_only=True
    )
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    base_price = serializers.SerializerMethodField()
    gross_price = serializers.SerializerMethodField()
    net_price = serializers.SerializerMethodField()
    vat_rate = serializers.SerializerMethodField()
    current_stock = serializers.SerializerMethodField()
    discount_price = serializers.SerializerMethodField()
    sizes = serializers.SerializerMethodField()

    def get_sizes(self, obj):
        # Skip sizes computation in lite/list mode for performance
        if getattr(obj, '_lite_mode', False):
            return []
        _dm = {'mm': 1, 'cm': 10, 'm': 1000}
        result = []
        for ms in obj.sizes.filter(is_active=True).order_by('sort_order', 'width'):
            mult = _dm.get(ms.dimension_unit or 'mm', 1)
            result.append({
                'id': ms.id,
                'name': ms.name,
                'width_mm': float(ms.width or 0) * mult if ms.width else None,
                'length_mm': float(ms.length or 0) * mult if ms.length else None,
                'price': float(ms.effective_price or ms.custom_price or 0),
            })
        return result

    def get_material_group_names(self, obj):
        return [g.get_full_name() for g in obj.material_groups.all()]
    
    # Cache for VAT types to avoid repeated API calls
    _vat_types_cache = {}
    
    def get_base_price(self, obj):
        """Return unit_selling_price as base_price for compatibility with product selector"""
        return obj.unit_selling_price
    
    def get_net_price(self, obj):
        """Return unit_selling_price as net_price for POS"""
        return float(obj.unit_selling_price or 0)
    
    def get_vat_rate(self, obj):
        # Skip expensive pixinvoice HTTP call in lite/list mode
        if getattr(obj, '_lite_mode', False):
            return 27.0
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
        # Skip expensive aggregate in lite/list mode
        if getattr(obj, '_lite_mode', False):
            return 0
        """Get total current stock from all warehouses"""
        from apps.warehouse.models import Inventory
        total = Inventory.objects.filter(material=obj).aggregate(
            total=models.Sum('quantity')
        )['total']
        return float(total or 0)
    
    def get_discount_price(self, obj):
        """Akciós (bruttó) ár, ha be van állítva a termékhez"""
        return float(obj.promo_price) if obj.promo_price is not None else None
    
    class Meta:
        model = Material
        fields = [
            'id', 'is_material', 'is_product', 'name', 'code', 'description', 
            'material_type', 'material_type_name',
            'material_group', 'material_group_name',
            'material_groups', 'material_group_names',
            'unit', 'unit_display', 'min_stock_level', 'width', 'length', 'height', 'dimension_unit',
            'width_fixed', 'length_fixed', 'height_fixed',
            'density', 'density_unit', 'material_format', 'roll_width', 'sheet_division',
            'yield_percentage',
            'area_weight', 'area_weight_unit', 'specific_weight', 'specific_weight_unit',
            'weight', 'weight_unit', 'volume_liter',
            'unit_cost_price', 'markup_percentage', 'unit_selling_price', 'base_price',
            'vat_type_id', 'gross_price', 'net_price', 'vat_rate', 'current_stock', 'discount_price',
            'promo_price',
            'currency', 'price_source_mode', 'default_price_calculation_version',
            'default_supplier', 'default_supplier_name',
            'is_internal_production', 'internal_production_department',
            'internal_production_department_name', 'internal_production_cost',
            'internal_fixed_cost', 'internal_price_per_unit', 'internal_price_per_perimeter',
            'internal_price_per_area', 'internal_price_per_weight', 'internal_price_per_time',
            'available_widths', 'available_lengths', 'available_thicknesses',
            'is_active', 'created_at', 'updated_at', 'created_by', 'created_by_name',
            'sizes',
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']

    def create(self, validated_data):
        groups = validated_data.pop('material_groups', [])
        instance = super().create(validated_data)
        instance.material_groups.set(groups)
        # Sync primary FK from first M2M group
        if groups and not instance.material_group:
            instance.material_group = groups[0]
            instance.save(update_fields=['material_group'])
        return instance

    def update(self, instance, validated_data):
        groups = validated_data.pop('material_groups', None)
        instance = super().update(instance, validated_data)
        if groups is not None:
            instance.material_groups.set(groups)
            # Sync primary FK: use first group or clear
            instance.material_group = groups[0] if groups else None
            instance.save(update_fields=['material_group'])
        return instance

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
    material_unit = serializers.CharField(source='material.unit', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = MaterialReceipt
        fields = [
            'id', 'batch', 'material', 'material_name', 'material_code', 'material_unit',
            'warehouse', 'warehouse_name', 'supplier', 'supplier_name',
            'receipt_date', 'invoice_number', 'invoice_value', 'currency',
            'quantity', 'unit_price', 'unit', 'width', 'length', 'thickness',
            'dimension_unit', 'stock_count', 'notes', 'created_at', 'updated_at',
            'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at']


class MaterialReceiptBatchLineSerializer(serializers.ModelSerializer):
    """Egy termék sor egy bevételezési kötegen belül."""
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    material_unit = serializers.CharField(source='material.unit', read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = MaterialReceipt
        fields = [
            'id', 'material', 'material_name', 'material_code', 'material_unit',
            'quantity', 'unit_price', 'unit', 'line_total',
        ]

    def get_line_total(self, obj):
        return float(obj.quantity or 0) * float(obj.unit_price or 0)


class MaterialReceiptBatchSerializer(serializers.ModelSerializer):
    """Bevételezés fejléc listázva, összesített értékkel."""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    total_amount = serializers.SerializerMethodField()
    line_count = serializers.SerializerMethodField()

    class Meta:
        model = MaterialReceiptBatch
        fields = [
            'id', 'supplier', 'supplier_name', 'warehouse', 'warehouse_name',
            'document_type', 'document_type_display', 'receipt_date', 'invoice_number',
            'notes', 'total_amount', 'line_count', 'created_at', 'created_by',
        ]
        read_only_fields = ['created_at', 'created_by']

    def get_total_amount(self, obj):
        return sum(float(l.quantity or 0) * float(l.unit_price or 0) for l in obj.lines.all())

    def get_line_count(self, obj):
        return obj.lines.count()


class MaterialReceiptBatchDetailSerializer(MaterialReceiptBatchSerializer):
    """Fejléc + sorai (terméklista) együtt."""
    lines = MaterialReceiptBatchLineSerializer(many=True, read_only=True)

    class Meta(MaterialReceiptBatchSerializer.Meta):
        fields = MaterialReceiptBatchSerializer.Meta.fields + ['lines']


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
    material_name = serializers.CharField(source='material.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default='')
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MaterialRemnant
        fields = [
            'id', 'material', 'material_name', 'warehouse', 'warehouse_name',
            'source_stock', 'created_by', 'created_by_name',
            'quantity', 'unit', 'is_available', 'note', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'created_by']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''


class StocktakeItemSerializer(serializers.ModelSerializer):
    """Leltár tétel: mennyiségek + számolt értékek."""
    purchase_value = serializers.SerializerMethodField()
    book_value = serializers.SerializerMethodField()

    class Meta:
        model = StocktakeItem
        fields = [
            'id', 'material', 'material_code', 'material_name', 'material_unit',
            'book_quantity', 'counted_quantity', 'unit_cost_price', 'book_unit_value',
            'purchase_value', 'book_value',
        ]

    def get_purchase_value(self, obj):
        # Leltár értéke beszerzés alapján: megszámolt × beszerzési egységár
        return float((obj.counted_quantity or 0) * (obj.unit_cost_price or 0))

    def get_book_value(self, obj):
        # Leltár értéke rögzítés (nyilvántartás) alapján
        return float((obj.book_quantity or 0) * (obj.book_unit_value or 0))


class StocktakeSerializer(serializers.ModelSerializer):
    """Leltár jegyzőkönyv listához/retrieve-hoz összesített értékekkel."""
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    purchase_value = serializers.SerializerMethodField()
    book_value = serializers.SerializerMethodField()
    difference = serializers.SerializerMethodField()
    items = StocktakeItemSerializer(many=True, read_only=True)

    class Meta:
        model = Stocktake
        fields = [
            'id', 'warehouse', 'warehouse_name', 'date', 'created_by', 'created_by_name',
            'note', 'updated_at', 'item_count', 'purchase_value', 'book_value', 'difference', 'items',
        ]
        read_only_fields = ['id', 'date', 'created_by', 'updated_at', 'warehouse']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''

    def get_item_count(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'items' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['items'])
        return obj.items.count()

    def get_purchase_value(self, obj):
        items = self._items_of(obj)
        return float(sum((i.counted_quantity or 0) * (i.unit_cost_price or 0) for i in items))

    def get_book_value(self, obj):
        items = self._items_of(obj)
        return float(sum((i.book_quantity or 0) * (i.book_unit_value or 0) for i in items))

    def get_difference(self, obj):
        items = self._items_of(obj)
        purchase = sum((i.counted_quantity or 0) * (i.unit_cost_price or 0) for i in items)
        book = sum((i.book_quantity or 0) * (i.book_unit_value or 0) for i in items)
        return float(purchase - book)

    def _items_of(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'items' in obj._prefetched_objects_cache:
            return obj._prefetched_objects_cache['items']
        return list(obj.items.all())


class StocktakeListSerializer(StocktakeSerializer):
    """Leltár lista: items (tételek) nélkül, csak összesített értékekkel."""

    class Meta(StocktakeSerializer.Meta):
        fields = [f for f in StocktakeSerializer.Meta.fields if f != 'items']

    def get_item_count(self, obj):
        return obj.items.count()
