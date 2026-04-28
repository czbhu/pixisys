from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db.models import Q
from .models import (
    Company, BankAccount, EmailServerConfig, HestiaConfig, EmailTemplate, 
    SignatureTemplate, PixinvoiceConfig, BackupConfiguration, 
    BackupFile, UserPreference, Role, Permission, UserRole, Notification,
    ActivityLog, TicketTopic, TicketType, Ticket, TicketMessage, TicketAttachment,
    PublicSiteConfig, ClientPortalUser, ClientPortalSession, SiteFeature, SalesSite,
    IoTDevice, NfcTag,
    StorageFolder, StorageFile, StorageShare
)
from apps.manufacturing.models import ProductClass, CalculatorTemplate
from apps.hr.models import Department

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'is_active', 'is_staff', 'is_superuser', 'date_joined', 'last_login',
            'roles', 'permissions', 'employee_id'
        ]
        read_only_fields = ['id', 'date_joined']

    def get_employee_id(self, obj):
        from apps.hr.models import Employee
        try:
            return Employee.objects.get(user=obj).id
        except Employee.DoesNotExist:
            return None

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


class HestiaConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = HestiaConfig
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
            'default_signature', 'default_signature_name', 'default_signature_key',
            'ui_preferences',
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
        fields = ['id', 'name', 'description', 'is_system', 'can_approve_orders', 'permissions', 'permissions_count', 'users_count', 'created_at', 'updated_at']
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


from .models import Zone
# We need to import DepartmentSerializer for nested representation or just use PrimaryKeyRelatedField

class ZoneSerializer(serializers.ModelSerializer):
    departments_details = serializers.SerializerMethodField()
    department_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = Zone
        fields = ['id', 'name', 'zone_number', 'note', 'department_ids', 'departments_details', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at', 'departments_details']

    def get_departments_details(self, obj):
        return [{'id': d.id, 'name': d.name} for d in obj.departments.all()]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['department_ids'] = list(instance.departments.values_list('id', flat=True))
        return ret

    def create(self, validated_data):
        dept_ids = validated_data.pop('department_ids', [])
        zone = Zone.objects.create(**validated_data)
        if dept_ids:
            from apps.hr.models import Department
            zone.departments.set(Department.objects.filter(id__in=dept_ids))
        return zone

    def update(self, instance, validated_data):
        dept_ids = validated_data.pop('department_ids', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if dept_ids is not None:
             from apps.hr.models import Department
             instance.departments.set(Department.objects.filter(id__in=dept_ids))
        return instance


class ActivityLogSerializer(serializers.ModelSerializer):
    """Serializer for ActivityLog model"""
    user_name = serializers.SerializerMethodField()
    user_email = serializers.CharField(source='user.email', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    content_type_name = serializers.CharField(source='content_type.model', read_only=True)
    timestamp_formatted = serializers.SerializerMethodField()
    
    class Meta:
        model = ActivityLog
        fields = [
            'id', 'user', 'user_name', 'user_email', 'timestamp', 'timestamp_formatted',
            'action', 'action_display', 'description', 'content_type', 'content_type_name',
            'object_id', 'changes', 'ip_address'
        ]
        read_only_fields = ['id', 'timestamp']
    
    def get_user_name(self, obj):
        """Get full name of user or 'Rendszer' if no user"""
        if obj.user:
            full_name = obj.user.get_full_name()
            return full_name if full_name else obj.user.username
        return "Rendszer"
    
    def get_timestamp_formatted(self, obj):
        """Format timestamp as Hungarian datetime string"""
        return obj.timestamp.strftime('%Y.%m.%d %H:%M:%S')


class TicketAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketAttachment
        fields = ['id', 'file', 'file_url', 'file_name', 'uploaded_by', 'uploaded_by_name', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if not obj.file:
            return None
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def get_file_name(self, obj):
        return obj.file.name.split('/')[-1] if obj.file else ''

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return ''


class TicketMessageSerializer(serializers.ModelSerializer):
    attachments = TicketAttachmentSerializer(many=True, read_only=True)
    author_name_display = serializers.SerializerMethodField()

    class Meta:
        model = TicketMessage
        fields = [
            'id', 'ticket', 'author', 'author_name', 'author_email', 'author_name_display',
            'body_html', 'attachments', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_author_name_display(self, obj):
        if obj.author:
            return obj.author.get_full_name() or obj.author.username
        return obj.author_name or 'Külsős'


class TicketTopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketTopic
        fields = '__all__'


class TicketTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketType
        fields = '__all__'


class TicketSerializer(serializers.ModelSerializer):
    departments = serializers.PrimaryKeyRelatedField(many=True, queryset=Department.objects.all(), required=False)
    assigned_users = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.filter(is_active=True), required=False)
    topic_name = serializers.CharField(source='topic.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    department_names = serializers.SerializerMethodField()
    assigned_user_names = serializers.SerializerMethodField()
    messages = TicketMessageSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    ticket_type_display = serializers.SerializerMethodField()
    audience_display = serializers.CharField(source='get_audience_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    is_first_response_overdue = serializers.SerializerMethodField()
    is_resolution_overdue = serializers.SerializerMethodField()
    can_manage_status = serializers.SerializerMethodField()
    public_url = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            'id', 'ticket_number', 'title', 'ticket_type', 'ticket_type_display',
            'status', 'status_display', 'priority', 'priority_display',
            'audience', 'audience_display', 'topic', 'topic_name',
            'departments', 'department_names', 'assigned_users', 'assigned_user_names',
            'requester_name', 'requester_email', 'public_reply_enabled', 'public_url',
            'created_by', 'created_by_name',
            'first_response_due_at', 'resolution_due_at', 'first_responded_at', 'resolved_at', 'closed_at',
            'is_first_response_overdue', 'is_resolution_overdue', 'can_manage_status',
            'created_at', 'updated_at', 'messages'
        ]
        read_only_fields = ['id', 'ticket_number', 'created_at', 'updated_at', 'created_by']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''

    def get_department_names(self, obj):
        return list(obj.departments.values_list('name', flat=True))

    def get_assigned_user_names(self, obj):
        names = []
        for user in obj.assigned_users.all():
            names.append(user.get_full_name() or user.username)
        return names

    def get_is_first_response_overdue(self, obj):
        from django.utils import timezone
        if obj.first_responded_at:
            return False
        if not obj.first_response_due_at:
            return False
        return timezone.now() > obj.first_response_due_at

    def get_is_resolution_overdue(self, obj):
        from django.utils import timezone
        if obj.resolved_at:
            return False
        if not obj.resolution_due_at:
            return False
        return timezone.now() > obj.resolution_due_at

    def get_can_manage_status(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.is_staff:
            return True
        if obj.created_by_id == user.id:
            return True
        return obj.assigned_users.filter(id=user.id).exists()

    def get_ticket_type_display(self, obj):
        ticket_type = TicketType.objects.filter(code=obj.ticket_type).first()
        return ticket_type.name if ticket_type else obj.ticket_type

    def get_public_url(self, obj):
        request = self.context.get('request')
        base_path = f"/public/ticket/{obj.public_token}"
        cfg = PublicSiteConfig.objects.filter(is_active=True).first()
        domain_base = ((cfg.public_domain if cfg and cfg.public_domain else '') or '').strip().rstrip('/')
        if domain_base:
            if not domain_base.startswith('http://') and not domain_base.startswith('https://'):
                domain_base = f"https://{domain_base}"
            return f"{domain_base}{base_path}"
        if request:
            return request.build_absolute_uri(base_path)
        return base_path


class PublicSiteConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PublicSiteConfig
        fields = '__all__'


class ClientPortalUserSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)
    contact_name = serializers.CharField(source='contact.name', read_only=True)

    class Meta:
        model = ClientPortalUser
        fields = [
            'id', 'email', 'full_name', 'company', 'company_name', 'contact', 'contact_name',
            'is_active', 'last_login', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'last_login', 'created_at', 'updated_at']

    def create(self, validated_data):
        password = self.initial_data.get('password')
        if not password:
            raise serializers.ValidationError({'password': 'Kötelező mező'})
        instance = ClientPortalUser(**validated_data)
        instance.set_password(password)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        password = self.initial_data.get('password')
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class ClientPortalSessionSerializer(serializers.ModelSerializer):
    user = ClientPortalUserSerializer(read_only=True)

    class Meta:
        model = ClientPortalSession
        fields = ['id', 'user', 'token', 'expires_at', 'revoked_at', 'created_at']


class SiteFeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteFeature
        fields = '__all__'


class SalesSiteSerializer(serializers.ModelSerializer):
    product_classes = serializers.PrimaryKeyRelatedField(many=True, queryset=ProductClass.objects.all(), required=False)
    calculators = serializers.PrimaryKeyRelatedField(many=True, queryset=CalculatorTemplate.objects.all(), required=False)
    features = serializers.PrimaryKeyRelatedField(many=True, queryset=SiteFeature.objects.all(), required=False)
    product_class_names = serializers.SerializerMethodField()
    calculator_names = serializers.SerializerMethodField()
    feature_names = serializers.SerializerMethodField()
    primary_domain = serializers.SerializerMethodField()

    class Meta:
        model = SalesSite
        fields = [
            'id', 'name', 'slug', 'domains', 'primary_domain', 'site_type',
            'site_title', 'hero_title', 'hero_subtitle', 'calculators_enabled',
            'portal_enabled', 'is_active',
            'product_classes', 'product_class_names',
            'calculators', 'calculator_names',
            'features', 'feature_names',
            'created_at', 'updated_at'
        ]

    def get_product_class_names(self, obj):
        return list(obj.product_classes.values_list('name', flat=True))

    def get_calculator_names(self, obj):
        return list(obj.calculators.values_list('name', flat=True))

    def get_feature_names(self, obj):
        return list(obj.features.values_list('name', flat=True))

    def get_primary_domain(self, obj):
        domains = obj.domains if isinstance(obj.domains, list) else []
        return domains[0] if domains else ''


class IoTDeviceSerializer(serializers.ModelSerializer):
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    allowed_departments = serializers.PrimaryKeyRelatedField(
        many=True, queryset=__import__('apps.hr.models', fromlist=['Department']).Department.objects.all(),
        required=False,
    )
    allowed_department_names = serializers.SerializerMethodField()

    class Meta:
        model = IoTDevice
        fields = [
            'id', 'name', 'device_type', 'device_type_display', 'location', 'is_active',
            'shelly_host', 'shelly_auth_user', 'shelly_auth_pass', 'shelly_channel',
            'type_settings', 'allowed_departments', 'allowed_department_names',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_allowed_department_names(self, obj):
        return [{'id': d.id, 'name': d.name} for d in obj.allowed_departments.all()]


class NfcTagSerializer(serializers.ModelSerializer):
    tag_type_display = serializers.CharField(source='get_tag_type_display', read_only=True)
    iot_device_name = serializers.SerializerMethodField()
    iot_device_type = serializers.SerializerMethodField()

    class Meta:
        model = NfcTag
        fields = [
            'id', 'name', 'tag_type', 'tag_type_display', 'location', 'is_active',
            'iot_device', 'iot_device_name', 'iot_device_type', 'iot_channel',
            'sun_key', 'last_counter', 'require_login',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['last_counter', 'created_at', 'updated_at']

    def get_iot_device_name(self, obj):
        return obj.iot_device.name if obj.iot_device else None

    def get_iot_device_type(self, obj):
        return obj.iot_device.device_type if obj.iot_device else None


class StorageFolderSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    children_count = serializers.SerializerMethodField()
    files_count = serializers.SerializerMethodField()

    class Meta:
        model = StorageFolder
        fields = [
            'id', 'name', 'parent', 'owner', 'owner_username',
            'children_count', 'files_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['owner', 'created_at', 'updated_at']

    def get_children_count(self, obj):
        return obj.children.count()

    def get_files_count(self, obj):
        return obj.files.count()


class StorageFileSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = StorageFile
        fields = [
            'id', 'name', 'folder', 'file', 'url', 'size',
            'content_type', 'owner', 'owner_username', 'created_at', 'updated_at',
        ]
        read_only_fields = ['owner', 'size', 'content_type', 'created_at', 'updated_at']

    def get_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class StorageShareSerializer(serializers.ModelSerializer):
    shared_with_username = serializers.CharField(source='shared_with.username', read_only=True, default=None)
    shared_by_username = serializers.CharField(source='shared_by.username', read_only=True)
    shared_with_department_name = serializers.CharField(source='shared_with_department.name', read_only=True, default=None)
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    file_name = serializers.CharField(source='file.name', read_only=True)

    class Meta:
        model = StorageShare
        fields = [
            'id', 'folder', 'folder_name', 'file', 'file_name',
            'shared_with', 'shared_with_username',
            'shared_with_department', 'shared_with_department_name',
            'shared_by', 'shared_by_username',
            'can_delete', 'created_at',
        ]
        read_only_fields = ['shared_by', 'created_at']
