from django.contrib import admin
from .models import (
    MaterialType, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialReceipt
)

@admin.register(MaterialType)
class MaterialTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'description', 'created_at']
    search_fields = ['name', 'description']
    ordering = ['name']

@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'material_type', 'unit', 'min_stock_level', 'is_active']
    list_filter = ['material_type', 'is_active', 'created_at']
    search_fields = ['name', 'code', 'description']
    ordering = ['name']

@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'address', 'is_active']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'code', 'address']
    ordering = ['name']

@admin.register(Shelf)
class ShelfAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'warehouse', 'is_active']
    list_filter = ['warehouse', 'is_active', 'created_at']
    search_fields = ['name', 'code', 'description']
    ordering = ['warehouse', 'name']

@admin.register(MaterialSupplier)
class MaterialSupplierAdmin(admin.ModelAdmin):
    list_display = ['material', 'supplier', 'supplier_code', 'unit_price', 'currency', 'is_primary', 'is_active']
    list_filter = ['is_primary', 'is_active', 'currency', 'created_at']
    search_fields = ['material__name', 'supplier__name', 'supplier_code']
    ordering = ['material', 'supplier']

@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ['material', 'warehouse', 'shelf', 'quantity', 'last_updated']
    list_filter = ['warehouse', 'last_updated']
    search_fields = ['material__name', 'warehouse__name', 'shelf__name']
    ordering = ['material', 'warehouse', 'shelf']

@admin.register(MaterialReceipt)
class MaterialReceiptAdmin(admin.ModelAdmin):
    list_display = ['receipt_number', 'material', 'supplier', 'quantity', 'unit_price', 'total_price', 'status', 'receipt_date']
    list_filter = ['status', 'currency', 'receipt_date', 'created_at']
    search_fields = ['receipt_number', 'material__name', 'supplier__name']
    ordering = ['-receipt_date']
    readonly_fields = ['total_price', 'created_at', 'updated_at']
