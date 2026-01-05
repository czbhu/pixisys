from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Company, BankAccount, EmailServerConfig, EmailTemplate, SignatureTemplate, PixinvoiceConfig, BackupConfiguration, BackupFile, UserPreference

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']


class BankAccountSerializer(serializers.ModelSerializer):
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    currency_symbol = serializers.CharField(source='currency.symbol', read_only=True)
    
    class Meta:
        model = BankAccount
        fields = ['id', 'company', 'currency', 'currency_code', 'currency_symbol', 'account_number', 'bank_name', 'swift', 'iban', 'is_primary', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CompanySerializer(serializers.ModelSerializer):
    bank_accounts = BankAccountSerializer(many=True, read_only=True)
    
    class Meta:
        model = Company
        fields = ['id', 'name', 'tax_number', 'eu_tax_number', 'address', 'phone', 'email', 'website', 'logo', 'is_default', 'bank_accounts', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class EmailServerConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailServerConfig
        fields = '__all__'


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = '__all__'


class SignatureTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SignatureTemplate
        fields = '__all__'


class PixinvoiceConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PixinvoiceConfig
        fields = '__all__'
        extra_kwargs = {
            'api_key': {'write_only': True}
        }


class BackupConfigurationSerializer(serializers.ModelSerializer):
    interval_display = serializers.CharField(source='get_interval_display', read_only=True)
    
    class Meta:
        model = BackupConfiguration
        fields = ['id', 'name', 'interval', 'interval_display', 'retention_days', 'is_active', 'last_backup', 'created_at', 'updated_at']
        read_only_fields = ['id', 'last_backup', 'created_at', 'updated_at']


class BackupFileSerializer(serializers.ModelSerializer):
    file_size_mb = serializers.ReadOnlyField()
    created_by_name = serializers.SerializerMethodField()
    configuration_name = serializers.CharField(source='configuration.name', read_only=True)
    
    class Meta:
        model = BackupFile
        fields = ['id', 'configuration', 'configuration_name', 'filename', 'filepath', 'file_size', 'file_size_mb', 'created_at', 'created_by', 'created_by_name', 'is_manual']
        read_only_fields = ['id', 'file_size', 'created_at', 'created_by']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'


class UserPreferenceSerializer(serializers.ModelSerializer):
    default_signature_name = serializers.SerializerMethodField()
    default_signature_key = serializers.SerializerMethodField()
    
    class Meta:
        model = UserPreference
        fields = ['id', 'user', 'default_signature', 'default_signature_name', 'default_signature_key']
        read_only_fields = ['id', 'user']
    
    def get_default_signature_name(self, obj):
        return obj.default_signature.name if obj.default_signature else None
    
    def get_default_signature_key(self, obj):
        return obj.default_signature.key if obj.default_signature else None
