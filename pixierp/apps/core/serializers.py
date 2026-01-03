from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Company, EmailServerConfig, EmailTemplate, SignatureTemplate, PixinvoiceConfig

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