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
            'short_name', 'tax_number', 'full_tax_number', 'group_tax_number', 'eu_tax_number', 'vat_code', 'county_code', 'vat_group_id', 'vat_group_member_tax_number',
            'country', 'postal_code', 'city', 'street_name', 'street_type', 'public_place_category',
            'house_number', 'street_number', 'building', 'staircase', 'floor', 'door',
            'address', 'email', 'phone', 'full_address', 'is_active',
            'created_at', 'updated_at', 'created_by', 'created_by_name',
            'vat_status', 'is_hungarian_taxpayer'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']

    def validate(self, attrs):
        vat_status = attrs.get('vat_status', getattr(self.instance, 'vat_status', 'DOMESTIC'))
        attrs['is_hungarian_taxpayer'] = (vat_status == 'DOMESTIC')
        
        # Only validate tax number for Hungarian companies
        if attrs['is_hungarian_taxpayer']:
            # Allow skipping if it was already valid or unchange (instance check)
            # But the requirement is to validate format if domestic.
            # In update, tax_number might not be in attrs.
            tax_number = attrs.get('tax_number', getattr(self.instance, 'tax_number', '')) or ''
            
            # Note: pixierp uses full formatted tax numbers usually? 
            # The model help_text says "12345678-1-41"
            # But users might input just 8 digits and we format it?
            # Or we strictly require format?
            # The previous validator was strict regex. 
            # If the user inputs data via UI, we should probably be flexible or enforce format.
            # Let's enforce strict format if it's provided, OR basic length check if we want to be nice.
            # But the prompt said "A mezők validációját is ehhez igazítsd." (Align field validation to this).
            # In PixInvoice, we loosened it to 8 digits.
            # In PixiERP, the validator was `^\d{8}-\d{1}-\d{2}$`.
            # I will apply a basic check here. If they want strict format, they should provide it.
            # But wait, PixiERP UI might be formatting it automatically?
            # Looking at frontend code later.
            
            if tax_number:
                # Basic sanity check
                if len(tax_number.replace('-', '')) < 8:
                     raise serializers.ValidationError({'tax_number': 'Az adószámnak legalább 8 számjegynek kell lennie.'})
        
        return attrs

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
            'id', 'first_name', 'last_name', 'name', 'full_name', 'phone', 'email', 'company', 'company_name',
            'position', 'is_receipt', 'notes', 'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'name', 'full_name']

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
            'first_name', 'last_name', 'phone', 'email', 'company', 'position', 'is_receipt', 'notes'
        ]
