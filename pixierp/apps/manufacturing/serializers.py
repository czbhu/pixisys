from rest_framework import serializers
from .models import (
    ProductClass, Project, ManufacturingProduct, Service, 
    CalculatorTemplate, Calculation, ServiceSupplierPrice, ServiceCostItem
)
from apps.crm.models import Contact
from apps.hr.models import Department, Employee
from apps.core.models import Currency
from apps.warehouse.models import Material


class ProductClassSerializer(serializers.ModelSerializer):
    hr_department_names = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductClass
        fields = '__all__'
    
    def get_hr_department_names(self, obj):
        return [dept.name for dept in obj.hr_departments.all()]


class ProjectSerializer(serializers.ModelSerializer):
    contact_names = serializers.SerializerMethodField()
    project_manager_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = '__all__'
    
    def get_contact_names(self, obj):
        return [contact.name for contact in obj.contacts.all()]
    
    def get_project_manager_name(self, obj):
        return obj.project_manager.get_full_name() if obj.project_manager else None


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ['id', 'code', 'name', 'symbol', 'exchange_rate', 'is_default']


class ManufacturingProductSerializer(serializers.ModelSerializer):
    product_class_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    contact_name = serializers.SerializerMethodField()
    contact_company_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    currency_info = serializers.SerializerMethodField()
    
    class Meta:
        model = ManufacturingProduct
        fields = '__all__'
    
    def get_product_class_name(self, obj):
        return obj.product_class.name if obj.product_class else None
    
    def get_project_name(self, obj):
        return obj.project.name if obj.project else None
    
    def get_contact_name(self, obj):
        return obj.contact.name if obj.contact else None
    
    def get_contact_company_name(self, obj):
        return obj.contact.company.name if obj.contact and obj.contact.company else None
    
    def get_status_display(self, obj):
        return obj.get_status_display()
    
    def get_currency_info(self, obj):
        if obj.currency:
            return {
                'id': obj.currency.id,
                'code': obj.currency.code,
                'name': obj.currency.name,
                'symbol': obj.currency.symbol,
                'exchange_rate': obj.currency.exchange_rate
            }
        return None

class ServiceSerializer(serializers.ModelSerializer):
    """Szolgáltatás serializer"""
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    calculation_basis_display = serializers.CharField(source='get_calculation_basis_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    default_supplier_name = serializers.CharField(source='default_supplier.name', read_only=True)
    internal_production_department_name = serializers.CharField(
        source='internal_production_department.name', read_only=True
    )
    
    class Meta:
        model = Service
        fields = '__all__'
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'


class CalculatorTemplateSerializer(serializers.ModelSerializer):
    """Kalkulátor sablon serializer"""
    allowed_materials_details = serializers.SerializerMethodField()
    allowed_services_details = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = CalculatorTemplate
        fields = '__all__'
    
    def get_allowed_materials_details(self, obj):
        materials = obj.allowed_materials.all()
        return [{
            'id': m.id,
            'name': m.name,
            'code': m.code,
            'unit': m.unit,
            'material_format': m.material_format,
            'roll_width': m.roll_width,
            'sheet_division': m.sheet_division,
            'yield_percentage': m.yield_percentage,
            'unit_cost_price': m.unit_cost_price,
            'markup_percentage': m.markup_percentage,
            'unit_selling_price': m.unit_selling_price,
            'currency': m.currency,
            'is_internal_production': m.is_internal_production,
            'internal_production_cost': m.internal_production_cost,  # deprecated
            'internal_fixed_cost': m.internal_fixed_cost,
            'internal_price_per_unit': m.internal_price_per_unit,
            'internal_price_per_perimeter': m.internal_price_per_perimeter,
            'internal_price_per_area': m.internal_price_per_area,
            'internal_price_per_weight': m.internal_price_per_weight,
            'internal_price_per_time': m.internal_price_per_time,
        } for m in materials]
    
    def get_allowed_services_details(self, obj):
        services = obj.allowed_services.all()
        return [{
            'id': s.id,
            'name': s.name,
            'code': s.code,
            'unit': s.unit,
            'unit_price': s.unit_price,
            'calculation_basis': s.calculation_basis,  # deprecated
            'category': s.category,
            'unit_cost_price': s.unit_cost_price,
            'markup_percentage': s.markup_percentage,
            'unit_selling_price': s.unit_selling_price,
            'currency': s.currency,
            'is_internal_production': s.is_internal_production,
            'internal_production_cost': s.internal_production_cost,  # deprecated
            'internal_fixed_cost': s.internal_fixed_cost,
            'internal_price_per_unit': s.internal_price_per_unit,
            'internal_price_per_perimeter': s.internal_price_per_perimeter,
            'internal_price_per_area': s.internal_price_per_area,
            'internal_price_per_weight': s.internal_price_per_weight,
            'internal_price_per_time': s.internal_price_per_time,
        } for s in services]
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'


class CalculationSerializer(serializers.ModelSerializer):
    """Kalkuláció serializer"""
    template_name = serializers.CharField(source='template.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Calculation
        fields = '__all__'
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'


class ServiceSupplierPriceSerializer(serializers.ModelSerializer):
    """Szolgáltatás beszállítói ár serializer"""
    service_name = serializers.CharField(source='service.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    
    class Meta:
        model = ServiceSupplierPrice
        fields = [
            'id', 'service', 'service_name', 'supplier', 'supplier_name',
            'is_default', 'fixed_cost', 'price_per_unit', 'price_per_perimeter',
            'price_per_area', 'price_per_weight', 'price_per_time',
            'currency', 'min_order_quantity', 'lead_time_days', 'notes',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class ServiceCostItemSerializer(serializers.ModelSerializer):
    """Szolgáltatás költség elem serializer"""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    calculation_type_display = serializers.CharField(source='get_calculation_type_display', read_only=True)
    
    class Meta:
        model = ServiceCostItem
        fields = [
            'id', 'service', 'supplier', 'supplier_name', 'is_internal',
            'name', 'calculation_type', 'calculation_type_display', 'unit',
            'unit_price', 'markup_percentage', 'selling_price', 'currency',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'selling_price']
