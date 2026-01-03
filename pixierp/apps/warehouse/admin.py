from django.contrib import admin
from .models import (
    MaterialType, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialReceipt, MaterialStock, StockMovement,
    SupplierInvoice, InvoiceItem
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
    list_display = ['id', 'material', 'warehouse', 'supplier', 'quantity', 'unit_price', 'receipt_date', 'created_by']
    list_filter = ['currency', 'receipt_date', 'created_at']
    search_fields = ['invoice_number', 'material__name', 'supplier__name']
    ordering = ['-receipt_date']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(MaterialStock)
class MaterialStockAdmin(admin.ModelAdmin):
    list_display = ['id', 'material', 'warehouse', 'quantity', 'status', 'unit_value', 'total_value']
    list_filter = ['status', 'warehouse', 'created_at']
    search_fields = ['material__name', 'warehouse__name']
    ordering = ['material', 'warehouse']
    readonly_fields = ['created_at', 'updated_at', 'total_value']


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ['id', 'stock', 'movement_type', 'from_warehouse', 'to_warehouse', 'quantity', 'created_at']
    list_filter = ['movement_type', 'created_at']
    search_fields = ['stock__material__name', 'notes']
    ordering = ['-created_at']
    readonly_fields = ['created_at']


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 1
    fields = ['material', 'warehouse', 'quantity', 'unit_price', 'total_price', 'width', 'length', 'thickness']
    readonly_fields = ['total_price']


@admin.register(SupplierInvoice)
class SupplierInvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'supplier', 'invoice_date', 'total_amount', 'status', 'payment_method']
    list_filter = ['status', 'payment_method', 'invoice_date', 'created_at']
    search_fields = ['invoice_number', 'supplier__name']
    ordering = ['-invoice_date', '-created_at']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [InvoiceItemInline]
    
    fieldsets = (
        ('Alapadatok', {
            'fields': ('invoice_number', 'supplier', 'status')
        }),
        ('Dátumok', {
            'fields': ('invoice_date', 'receipt_date', 'due_date', 'payment_date')
        }),
        ('Pénzügyi adatok', {
            'fields': ('payment_method', 'currency', 'total_amount')
        }),
        ('Egyéb', {
            'fields': ('notes', 'invoice_images', 'created_at', 'updated_at', 'created_by')
        }),
    )


@admin.register(InvoiceItem)
class InvoiceItemAdmin(admin.ModelAdmin):
    list_display = ['invoice', 'material', 'warehouse', 'quantity', 'unit_price', 'total_price']
    list_filter = ['warehouse', 'created_at']
    search_fields = ['invoice__invoice_number', 'material__name']
    ordering = ['invoice', 'id']
    readonly_fields = ['total_price', 'created_at', 'updated_at']

