from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Company, EmailServerConfig, EmailTemplate, SignatureTemplate, PixinvoiceConfig, BackupConfiguration, BackupFile

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = '__all__'


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