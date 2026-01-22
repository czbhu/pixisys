from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db.models import Q
from .models import (
    Company, BankAccount, EmailServerConfig, EmailTemplate, 
    SignatureTemplate, PixinvoiceConfig, BackupConfiguration, 
    BackupFile, UserPreference, Role, Permission, UserRole, Notification
)

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'is_active', 'is_staff', 'is_superuser', 'date_joined',
            'roles', 'permissions'
        ]
        read_only_fields = ['id', 'date_joined']

    def get_roles(self, obj):
        """Get user roles from department assignments (Employee → Department → Role)"""
        from apps.hr.models import Employee
        
        # Check if user has an employee profile
        try:
            employee = Employee.objects.get(user=obj)
            roles = employee.get_all_roles()
            return [
                {
                    'id': role.id,
                    'name': role.name,
                    'description': role.description,
                    'is_system': role.is_system,
                }
                for role in roles
            ]
        except Employee.DoesNotExist:
            return []

    def get_permissions(self, obj):
        """Get permissions from department-assigned roles (Employee → Department → Role → Permission)"""
        from apps.hr.models import Employee
        
        # Check if user has an employee profile
        try:
            employee = Employee.objects.get(user=obj)
            # Collect all role IDs from departments
            role_ids = set()
            for department in employee.departments.all():
                for role in department.roles.all():
                    role_ids.add(role.id)
            
            if not role_ids:
                return []
            
            # Get all permissions for these roles
            perms_qs = Permission.objects.filter(
                role_id__in=role_ids
            ).select_related('role').distinct()
            
            seen = set()
            perms = []
            for perm in perms_qs:
                key = (perm.module, perm.resource, perm.action, perm.allowed, perm.role_id)
                if key in seen:
                    continue
                seen.add(key)
                perms.append({
                    'module': perm.module,
                    'resource': perm.resource,
                    'action': perm.action,
                    'allowed': perm.allowed,
                    'role_id': perm.role_id,
                    'role_name': perm.role.name if perm.role else None,
                })
            return perms
        except Employee.DoesNotExist:
            return []


class BankAccountSerializer(serializers.ModelSerializer):
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    currency_symbol = serializers.CharField(source='currency.symbol', read_only=True)
    
    class Meta:
        model = BankAccount
        fields = ['id', 'company', 'company_external_id', 'currency', 'currency_code', 'currency_symbol', 'account_number', 'bank_name', 'swift', 'iban', 'is_primary', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CompanySerializer(serializers.ModelSerializer):
    bank_accounts = BankAccountSerializer(many=True, read_only=True)
    
    class Meta:
        model = Company
        fields = ['id', 'name', 'tax_number', 'eu_tax_number', 'address', 'phone', 'email', 'website', 'logo', 'is_default', 'is_active', 'bank_accounts', 'created_at', 'updated_at']
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
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    phone_number = serializers.SerializerMethodField()
    
    class Meta:
        model = UserPreference
        fields = [
            'id', 'user', 
            'first_name', 'last_name', 'name', 'email', 'phone_number',
            'default_signature', 'default_signature_name', 'default_signature_key'
        ]
        read_only_fields = ['id', 'user']
    
    def get_name(self, obj):
        return obj.user.get_full_name()

    
    def get_default_signature_name(self, obj):
        return obj.default_signature.name if obj.default_signature else None
    
    def get_default_signature_key(self, obj):
        return obj.default_signature.key if obj.default_signature else None

    def get_phone_number(self, obj):
        if hasattr(obj.user, 'employee_profile'):
            return obj.user.employee_profile.phone
        return None


class PermissionSerializer(serializers.ModelSerializer):
    module_display = serializers.CharField(source='get_module_display', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    resource_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Permission
        fields = ['id', 'role', 'user', 'module', 'module_display', 'resource', 'resource_display', 'action', 'action_display', 'allowed', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_resource_display(self, obj):
        if obj.resource:
            return dict(Permission.RESOURCE_CHOICES).get(obj.resource, obj.resource)
        return None


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    permissions_count = serializers.SerializerMethodField()
    users_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'is_system', 'permissions', 'permissions_count', 'users_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_permissions_count(self, obj):
        return obj.permissions.count()
    
    def get_users_count(self, obj):
        return obj.user_assignments.count()


class UserRoleSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source='role.name', read_only=True)
    user_name = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = UserRole
        fields = ['id', 'user', 'user_name', 'role', 'role_name', 'assigned_at', 'assigned_by', 'assigned_by_name']
        read_only_fields = ['id', 'assigned_at']
    
    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username
    
    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return None


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'link', 'type', 'is_read', 'created_at']
        read_only_fields = ['id', 'created_at']

