from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Department, Position, Employee, Attendance, LeaveRequest, Payroll, TimeLog, AccessLog, ProjectParticipation, AccessControlConfig, EmployeeAccessCredentials

User = get_user_model()


class DepartmentSerializer(serializers.ModelSerializer):
    manager_names = serializers.SerializerMethodField()
    role_names = serializers.SerializerMethodField()
    
    class Meta:
        model = Department
        fields = '__all__'
    
    def get_manager_names(self, obj):
        return [manager.get_full_name() for manager in obj.managers.all()]
    
    def get_role_names(self, obj):
        return [role.name for role in obj.roles.all()]


class PositionSerializer(serializers.ModelSerializer):
    department_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Position
        fields = '__all__'
    
    def get_department_name(self, obj):
        return obj.department.name if obj.department else None


class EmployeeSerializer(serializers.ModelSerializer):
    user_first_name = serializers.CharField(source='user.first_name')
    user_last_name = serializers.CharField(source='user.last_name')
    user_email = serializers.EmailField(source='user.email', required=False, allow_blank=True)
    user_username = serializers.CharField(source='user.username', required=False, allow_blank=True)
    
    full_name = serializers.SerializerMethodField()
    department_names = serializers.SerializerMethodField()
    position_name = serializers.SerializerMethodField()
    
    # Jogosultságok
    roles = serializers.SerializerMethodField()  # Összesített szerepkörök (osztályok + egyéni)
    department_roles = serializers.SerializerMethodField()  # Csak osztályok szerepkörei
    individual_role_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        help_text="Egyéni szerepkörök (UserRole) - opcionális"
    )
    custom_permissions = serializers.SerializerMethodField()
    
    class Meta:
        model = Employee
        fields = '__all__'
        extra_kwargs = {
            'user': {'required': False},  # User ID olvasható és írható is
            'employee_id': {'required': False},
        }
    
    def get_full_name(self, obj):
        return obj.user.get_full_name()
    
    def get_department_names(self, obj):
        return [dept.name for dept in obj.departments.all()]
    
    def get_position_name(self, obj):
        return obj.position.title if obj.position else None
    
    def get_roles(self, obj):
        """Összes szerepkör: osztályok szerepkörei + egyéni UserRole-ok"""
        all_roles = obj.get_all_roles()
        return [
            {
                'id': role.id,
                'name': role.name,
                'is_system': role.is_system,
                'source': 'department' if role in obj.get_department_roles() else 'individual'
            }
            for role in all_roles
        ]
    
    def get_department_roles(self, obj):
        """Csak az osztályok szerepkörei"""
        return [
            {
                'id': role.id,
                'name': role.name,
                'is_system': role.is_system,
            }
            for role in obj.get_department_roles()
        ]
    
    def get_role_ids(self, obj):
        """DEPRECATED - használd a roles mezőt"""
        return [role.id for role in obj.get_all_roles()]
    
    def validate_individual_role_ids(self, value):
        """Egyéni szerepkör ID-k validálása"""
        if value is None:
            return []
        return value
    
    def get_custom_permissions(self, obj):
        """Felhasználó egyéni jogosultságai (role-tól független)"""
        from apps.core.models import Permission
        perms = Permission.objects.filter(user=obj.user).select_related()
        return [
            {
                'id': p.id,
                'module': p.module,
                'module_display': p.get_module_display(),
                'action': p.action,
                'action_display': p.get_action_display(),
                'allowed': p.allowed,
            }
            for p in perms
        ]
    
    def create(self, validated_data):
        user_data = validated_data.pop('user', {})
        departments_data = validated_data.pop('departments', [])
        individual_role_ids = validated_data.pop('individual_role_ids', [])
        
        # Automatikus felhasználónév generálása
        first_name = user_data.get('first_name', '')
        last_name = user_data.get('last_name', '')
        username = Employee.generate_username(first_name, last_name)
        
        # Automatikus alkalmazott ID generálása
        employee_id = Employee.generate_employee_id()
        
        user = User.objects.create_user(
            username=username,
            email=user_data.get('email', ''),
            first_name=first_name,
            last_name=last_name,
            password=user_data.get('password', 'defaultpassword123')
        )
        employee = Employee.objects.create(
            user=user, 
            employee_id=employee_id,
            **validated_data
        )
        
        # Many-to-many kapcsolat beállítása
        if departments_data:
            employee.departments.set(departments_data)
        
        # Egyéni szerepkörök hozzárendelése (opcionális)
        if individual_role_ids:
            from apps.core.models import UserRole, Role
            for role_id in individual_role_ids:
                try:
                    role = Role.objects.get(id=role_id)
                    UserRole.objects.create(
                        user=user,
                        role=role,
                        assigned_by=self.context.get('request').user if self.context.get('request') else None
                    )
                except Role.DoesNotExist:
                    pass
        
        return employee
    
    def update(self, instance, validated_data):
        import logging
        logger = logging.getLogger(__name__)
        
        user_data = validated_data.pop('user', {})
        departments_data = validated_data.pop('departments', None)
        individual_role_ids = validated_data.pop('individual_role_ids', None)
        
        logger.info(f"EmployeeSerializer.update called for {instance.user.username}")
        logger.info(f"individual_role_ids from validated_data: {individual_role_ids}")
        logger.info(f"departments_data: {departments_data}")
        
        if user_data:
            user = instance.user
            for attr, value in user_data.items():
                setattr(user, attr, value)
            user.save()
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Many-to-many kapcsolat frissítése
        if departments_data is not None:
            instance.departments.set(departments_data)
        
        # Egyéni szerepkörök frissítése (opcionális)
        if individual_role_ids is not None:
            from apps.core.models import UserRole, Role
            logger.info(f"Updating individual roles: {individual_role_ids}")
            # Töröljük a meglévő egyéni szerepköröket
            deleted_count = UserRole.objects.filter(user=instance.user).delete()[0]
            logger.info(f"Deleted {deleted_count} existing user roles")
            # Új egyéni szerepkörök hozzáadása
            for role_id in individual_role_ids:
                try:
                    role = Role.objects.get(id=role_id)
                    user_role = UserRole.objects.create(
                        user=instance.user,
                        role=role,
                        assigned_by=self.context.get('request').user if self.context.get('request') else None
                    )
                    logger.info(f"Created UserRole: {user_role.id} - {role.name}")
                except Role.DoesNotExist:
                    logger.error(f"Role with id={role_id} does not exist")
                    pass
        else:
            logger.info(f"individual_role_ids is None, not updating individual roles")
        
        return instance


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Attendance
        fields = '__all__'
    
    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name()


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = LeaveRequest
        fields = '__all__'
    
    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name()
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None


class PayrollSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Payroll
        fields = '__all__'
    
    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name()


class TimeLogSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    work_order_number = serializers.SerializerMethodField()
    
    class Meta:
        model = TimeLog
        fields = '__all__'
    
    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name()
    
    def get_project_name(self, obj):
        return obj.project.name if obj.project else None
    
    def get_work_order_number(self, obj):
        return obj.work_order.work_order_number if obj.work_order else None


class AccessLogSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    
    class Meta:
        model = AccessLog
        fields = '__all__'
    
    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name()
    
    def validate(self, data):
        """Validate that check_out is after check_in"""
        check_in = data.get('check_in_time') or (self.instance.check_in_time if self.instance else None)
        check_out = data.get('check_out_time') or (self.instance.check_out_time if self.instance else None)
        
        if check_in and check_out and check_out < check_in:
            raise serializers.ValidationError('A kilépés időpontja nem lehet korábbi, mint a belépés időpontja')
        
        return data


class ProjectParticipationSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ProjectParticipation
        fields = '__all__'
    
    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name()
    
    def get_project_name(self, obj):
        return obj.project.name if obj.project else None


class AttendanceReportSerializer(serializers.Serializer):
    """
    Serializer for attendance report data
    This is a read-only serializer for reporting purposes
    """
    id = serializers.IntegerField(read_only=True)
    employee_id = serializers.IntegerField()
    employee_name = serializers.CharField()
    date = serializers.DateField()
    check_in = serializers.DateTimeField(allow_null=True)
    check_out = serializers.DateTimeField(allow_null=True)
    hours_worked = serializers.DecimalField(max_digits=5, decimal_places=2)
    notes = serializers.CharField(allow_blank=True, allow_null=True)
    is_editable = serializers.BooleanField(default=True)
    
    # For update operations
    def update(self, instance, validated_data):
        """Update AccessLog with edited data"""
        # Handle both field names: check_in/check_out (from API) and check_in_time/check_out_time (model fields)
        if 'check_in' in validated_data:
            instance.check_in_time = validated_data.get('check_in')
        if 'check_in_time' in validated_data:
            instance.check_in_time = validated_data.get('check_in_time')
        if 'check_out' in validated_data:
            instance.check_out_time = validated_data.get('check_out')
        if 'check_out_time' in validated_data:
            instance.check_out_time = validated_data.get('check_out_time')
        if 'notes' in validated_data:
            instance.notes = validated_data.get('notes')
        instance.save()
        return instance


class AccessControlConfigSerializer(serializers.ModelSerializer):
    """Serializer for access control device configurations"""
    class Meta:
        model = AccessControlConfig
        fields = '__all__'


class EmployeeAccessCredentialsSerializer(serializers.ModelSerializer):
    """Serializer for employee access credentials"""
    employee_name = serializers.SerializerMethodField()
    device_name = serializers.SerializerMethodField()
    function_display = serializers.SerializerMethodField()
    
    class Meta:
        model = EmployeeAccessCredentials
        fields = '__all__'
    
    def get_employee_name(self, obj):
        return obj.employee.user.get_full_name()
    
    def get_device_name(self, obj):
        return obj.device_config.name
    
    def get_function_display(self, obj):
        return obj.get_function_display()
