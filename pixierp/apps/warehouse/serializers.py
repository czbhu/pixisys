from rest_framework import serializers
from .models import (
    MaterialType, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialReceipt
)

class MaterialTypeSerializer(serializers.ModelSerializer):
    """Alapanyag típus serializer"""
    
    class Meta:
        model = MaterialType
        fields = ['id', 'name', 'description', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

class MaterialSerializer(serializers.ModelSerializer):
    """Alapanyag serializer"""
    material_type_name = serializers.CharField(source='material_type.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = Material
        fields = [
            'id', 'name', 'code', 'description', 'material_type', 'material_type_name',
            'unit', 'min_stock_level', 'width', 'length', 'height', 'dimension_unit',
            'density', 'density_unit', 'is_active', 'created_at', 'updated_at',
            'created_by', 'created_by_name'
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
            'supplier_code', 'unit_price', 'currency', 'is_primary', 
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
