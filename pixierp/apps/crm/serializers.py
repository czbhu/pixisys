from rest_framework import serializers
from .models import Company, Contact

class CompanySerializer(serializers.ModelSerializer):
    """Cég serializer"""
    full_address = serializers.ReadOnlyField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    company_type_display = serializers.SerializerMethodField()
    
    def get_company_type_display(self, obj):
        """Megjelenítési szöveg a cég típusához"""
        types = []
        if obj.is_customer:
            types.append('Ügyfél')
        if obj.is_supplier:
            types.append('Beszállító')
        return ', '.join(types) if types else 'Nincs szerepkör'
    
    class Meta:
        model = Company
        fields = [
            'id', 'name', 'is_customer', 'is_supplier', 'company_type_display',
            'tax_number', 'group_tax_number', 'eu_tax_number', 
            'country', 'postal_code', 'city', 'street_name', 'street_type', 
            'house_number', 'address', 'full_address',
            'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']

class ContactSerializer(serializers.ModelSerializer):
    """Kapcsolattartó serializer"""
    full_name = serializers.CharField(source='name', read_only=True)
    company_name = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    def get_company_name(self, obj):
        if obj.company:
            return obj.company.name
        return None
    
    class Meta:
        model = Contact
        fields = [
            'id', 'name', 'full_name', 'phone', 'email', 'company', 'company_name',
            'position', 'notes', 'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']

class ContactCreateSerializer(serializers.ModelSerializer):
    """Kapcsolattartó létrehozó serializer"""
    
    def create(self, validated_data):
        # Ha "maganszemely" van megadva, akkor company = None
        if validated_data.get('company') == 'maganszemely':
            validated_data['company'] = None
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        # Ha "maganszemely" van megadva, akkor company = None
        if validated_data.get('company') == 'maganszemely':
            validated_data['company'] = None
        return super().update(instance, validated_data)
    
    class Meta:
        model = Contact
        fields = [
            'name', 'phone', 'email', 'company', 'position', 'notes'
        ]
