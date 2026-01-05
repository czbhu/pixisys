from django.contrib import admin
from .models import Customer, Invoice, InvoiceItem, NAVConfiguration, Contact, Company, SystemUser, InvoiceBlock, CompanyNAVConfiguration


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['name', 'tax_number', 'city', 'email', 'created_at']
    list_filter = ['city', 'country', 'created_at']
    search_fields = ['name', 'tax_number', 'email']
    readonly_fields = ['id', 'created_at', 'updated_at']


class InvoiceItemInline(admin.TabularInline):
    model = Invoice.items.through
    extra = 0
    fields = ['invoiceitem', 'invoiceitem__description', 'invoiceitem__quantity', 'invoiceitem__unit_price', 'invoiceitem__vat_rate']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'customer', 'status', 'total_gross_amount', 'issue_date', 'created_at']
    list_filter = ['status', 'currency', 'issue_date', 'created_at']
    search_fields = ['invoice_number', 'customer__name', 'notes']
    readonly_fields = ['id', 'total_net_amount', 'total_vat_amount', 'total_gross_amount', 'created_at', 'updated_at']
    inlines = [InvoiceItemInline]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('invoice_number', 'customer', 'status', 'notes')
        }),
        ('Dates', {
            'fields': ('issue_date', 'due_date', 'delivery_date')
        }),
        ('Financial', {
            'fields': ('currency', 'exchange_rate', 'total_net_amount', 'total_vat_amount', 'total_gross_amount')
        }),
        ('NAV Integration', {
            'fields': ('nav_transaction_id', 'nav_submission_date', 'nav_response'),
            'classes': ('collapse',)
        }),
        ('System', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(InvoiceItem)
class InvoiceItemAdmin(admin.ModelAdmin):
    list_display = ['description', 'quantity', 'unit_price', 'vat_rate', 'net_amount', 'vat_amount', 'gross_amount']
    list_filter = ['vat_rate']
    search_fields = ['description']


@admin.register(NAVConfiguration)
class NAVConfigurationAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'is_test_environment', 'api_url', 'created_at']
    list_filter = ['is_active', 'is_test_environment', 'created_at']
    search_fields = ['name', 'software_name']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'is_active', 'is_test_environment')
        }),
        ('API Configuration', {
            'fields': ('api_url',)
        }),
        ('User Credentials', {
            'fields': ('login', 'password', 'tax_number', 'sign_key', 'exchange_key'),
            'classes': ('collapse',)
        }),
        ('Software Information', {
            'fields': ('software_id', 'software_name', 'software_operation', 'software_main_version',
                      'software_dev_name', 'software_dev_contact', 'software_dev_country_code', 'software_dev_tax_number')
        }),
        ('System', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'customer', 'position', 'contact_type', 'email', 'phone', 'is_primary', 'is_active']
    list_filter = ['contact_type', 'is_primary', 'is_active', 'department', 'created_at']
    search_fields = ['first_name', 'last_name', 'email', 'position', 'department', 'customer__name']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Alapadatok', {
            'fields': ('customer', 'first_name', 'last_name', 'position', 'department', 'contact_type')
        }),
        ('Kapcsolattartási adatok', {
            'fields': ('email', 'phone', 'mobile', 'fax')
        }),
        ('Beállítások', {
            'fields': ('is_primary', 'is_active', 'notes')
        }),
        ('Rendszer', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def full_name(self, obj):
        return obj.full_name
    full_name.short_description = 'Teljes név'


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ['name', 'tax_number', 'city', 'email', 'is_active', 'created_at']
    list_filter = ['is_active', 'city', 'country', 'created_at']
    search_fields = ['name', 'tax_number', 'email']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Alapadatok', {
            'fields': ('name', 'short_name', 'tax_number', 'full_tax_number', 'is_active')
        }),
        ('Címadatok', {
            'fields': ('address', 'city', 'postal_code', 'country')
        }),
        ('Kapcsolattartás', {
            'fields': ('email', 'phone')
        }),
        ('Rendszer', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(SystemUser)
class SystemUserAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'email', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['first_name', 'last_name', 'email']
    readonly_fields = ['id', 'created_at', 'updated_at']
    filter_horizontal = ['companies']
    
    fieldsets = (
        ('Alapadatok', {
            'fields': ('first_name', 'last_name', 'email', 'is_active')
        }),
        ('Jelszó', {
            'fields': ('password_hash',),
            'classes': ('collapse',)
        }),
        ('Cégek', {
            'fields': ('companies',)
        }),
        ('Rendszer', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(InvoiceBlock)
class InvoiceBlockAdmin(admin.ModelAdmin):
    list_display = ['name', 'company', 'prefix', 'current_number', 'invoice_count', 'is_active', 'created_at']
    list_filter = ['is_active', 'company', 'created_at']
    search_fields = ['name', 'prefix', 'company__name']
    readonly_fields = ['id', 'invoice_count', 'cancelled_count', 'total_net_amount', 'total_vat_amount', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Alapadatok', {
            'fields': ('company', 'name', 'prefix', 'is_active')
        }),
        ('Sorszámozás', {
            'fields': ('start_number', 'current_number')
        }),
        ('Statisztikák', {
            'fields': ('invoice_count', 'cancelled_count', 'total_net_amount', 'total_vat_amount'),
            'classes': ('collapse',)
        }),
        ('Rendszer', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(CompanyNAVConfiguration)
class CompanyNAVConfigurationAdmin(admin.ModelAdmin):
    list_display = ['name', 'company', 'is_active', 'is_default', 'is_test_environment', 'created_at']
    list_filter = ['is_active', 'is_default', 'is_test_environment', 'company', 'created_at']
    search_fields = ['name', 'company__name', 'software_name']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Alapadatok', {
            'fields': ('company', 'name', 'is_active', 'is_default', 'is_test_environment')
        }),
        ('API Konfiguráció', {
            'fields': ('api_url',)
        }),
        ('Felhasználói adatok', {
            'fields': ('login', 'password', 'tax_number', 'sign_key', 'exchange_key'),
            'classes': ('collapse',)
        }),
        ('Szoftver információk', {
            'fields': ('software_id', 'software_name', 'software_operation', 'software_main_version',
                      'software_dev_name', 'software_dev_contact', 'software_dev_country_code', 'software_dev_tax_number')
        }),
        ('Rendszer', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )