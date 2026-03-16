from django.contrib import admin
from .models import PrintSizePreset, PrintPricingConfig, PrintOrder, PrintOrderItem, PrintMaterial


@admin.register(PrintMaterial)
class PrintMaterialAdmin(admin.ModelAdmin):
    list_display = ['name', 'description', 'is_active', 'sort_order']
    list_editable = ['is_active', 'sort_order']
    search_fields = ['name', 'description']
    ordering = ['sort_order', 'name']


@admin.register(PrintSizePreset)
class PrintSizePresetAdmin(admin.ModelAdmin):
    list_display = ['name', 'width_mm', 'height_mm', 'is_active', 'sort_order']
    list_editable = ['is_active', 'sort_order']
    ordering = ['sort_order', 'name']


@admin.register(PrintPricingConfig)
class PrintPricingConfigAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'paper_cost_per_m2', 'print_color_cost', 'margin_pct', 'updated_at']


class PrintOrderItemInline(admin.TabularInline):
    model = PrintOrderItem
    extra = 0
    fields = [
        'product_name', 'material', 'quantity', 'width_mm', 'height_mm',
        'sides', 'side1_mode', 'side2_mode', 'total_price',
    ]
    readonly_fields = ['total_price']


@admin.register(PrintOrder)
class PrintOrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'company', 'status', 'total_price', 'created_at']
    list_filter = ['status']
    search_fields = ['company__name', 'notes']
    inlines = [PrintOrderItemInline]


@admin.register(PrintOrderItem)
class PrintOrderItemAdmin(admin.ModelAdmin):
    list_display = ['product_name', 'material', 'quantity', 'width_mm', 'height_mm', 'sides', 'total_price']
    list_filter = ['sides', 'side1_mode', 'binding']
    search_fields = ['product_name']
    raw_id_fields = ['material']
