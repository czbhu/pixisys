from rest_framework import serializers
from .models import ProductClass, Project, ManufacturingProduct
from apps.crm.models import Contact
from apps.hr.models import Department, Employee
from apps.core.models import Currency


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