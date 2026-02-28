from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db.models import Max
from django.core.cache import cache
from .models import Department, Position, Employee, Attendance, LeaveRequest, Payroll, TimeLog, AccessLog, ProjectParticipation, AccessControlConfig, EmployeeAccessCredentials, AttendanceKioskConfig, TaskConfiguration, TaskExecution

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
    last_activity = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()
    
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

    def get_last_activity(self, obj):
        """Utolsó belépés a rendszerbe (User last_login)."""
        return obj.user.last_login

    def get_is_online(self, obj):
        """Ellenőrzi, hogy a felhasználó aktív-e:
           1. VAGY cache alapján aktív (weboldal használat)
           2. VAGY be van csekkolva a jelenléti íven (Attendance) és nincs kicsekkolva
        """
        # 1. Weboldal aktivitás check
        is_web_active = cache.get(f'seen_user_{obj.user.id}') is not None
        if is_web_active:
            return True
            
        # 2. Jelenléti ív check (ma be van csekkolva és nincs kicsekkolva)
        from django.utils import timezone
        today = timezone.now().date()
        is_clocked_in = Attendance.objects.filter(
            employee=obj, 
            date=today, 
            check_out__isnull=True
        ).exists()
        
        return is_clocked_in
    
    def create(self, validated_data):
        user_data = validated_data.pop('user', {})
        departments_data = validated_data.pop('departments', [])
        individual_role_ids = validated_data.pop('individual_role_ids', [])
        from apps.core.models import UserRole, Role
        
        # Automatikus felhasználónév generálása
        first_name = user_data.get('first_name', '')
        last_name = user_data.get('last_name', '')
        username = Employee.generate_username(first_name, last_name)
        
        # Automatikus alkalmazott ID generálása
        employee_id = Employee.generate_employee_id()
        
        # Determine initial active status
        is_active = validated_data.get('is_active', True)

        user = User.objects.create_user(
            username=username,
            email=user_data.get('email', ''),
            first_name=first_name,
            last_name=last_name,
            password=user_data.get('password', 'defaultpassword123'),
        )
        # Ensure user.is_active matches employee.is_active
        if user.is_active != is_active:
            user.is_active = is_active
            user.save()

        employee = Employee.objects.create(
            user=user, 
            employee_id=employee_id,
            **validated_data
        )
        
        # Many-to-many kapcsolat beállítása
        if departments_data:
            employee.departments.set(departments_data)
        # Szinkronizáljuk a szerepköröket: osztály szerepkörök + egyéniek
        self._sync_user_roles(user, departments_data, individual_role_ids)
        
        return employee
    
    def update(self, instance, validated_data):
        import logging
        logger = logging.getLogger(__name__)
        
        user_data = validated_data.pop('user', {})
        departments_data = validated_data.pop('departments', None)
        individual_role_ids = validated_data.pop('individual_role_ids', None)
        from apps.core.models import UserRole, Role
        
        logger.info(f"EmployeeSerializer.update called for {instance.user.username}")
        logger.info(f"individual_role_ids from validated_data: {individual_role_ids}")
        logger.info(f"departments_data: {departments_data}")
        
        if user_data:
            user = instance.user
            for attr, value in user_data.items():
                setattr(user, attr, value)
            user.save()
        
        # Sync User.is_active if Employee.is_active is changed
        if 'is_active' in validated_data:
            user = instance.user
            if user.is_active != validated_data['is_active']:
                user.is_active = validated_data['is_active']
                user.save()
                logger.info(f"Updated User {user.username} is_active to {user.is_active}")

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Many-to-many kapcsolat frissítése
        if departments_data is not None:
            instance.departments.set(departments_data)
        
        # Szerepkörök szinkronizálása: osztály szerepkörök + opcionális egyéniek
        self._sync_user_roles(
            instance.user,
            departments_data if departments_data is not None else list(instance.departments.all()),
            individual_role_ids
        )
        
        return instance

    def _sync_user_roles(self, user, departments, individual_role_ids=None):
        """Állítsuk be a UserRole-okat az osztály szerepkörei és az egyéni szerepkörök alapján."""
        from apps.core.models import UserRole, Role

        # Department szerepkörök
        dept_role_ids = set()
        for dept in departments or []:
            for role in getattr(dept, 'roles', []).all():
                dept_role_ids.add(role.id)

        # Egyéni szerepkörök: ha nincs megadva, tartsuk meg a meglévőket
        if individual_role_ids is None:
            current_ids = set(UserRole.objects.filter(user=user).values_list('role_id', flat=True))
            individual_ids = current_ids - dept_role_ids
        else:
            individual_ids = set(individual_role_ids)

        desired_ids = dept_role_ids | individual_ids

        existing_ids = set(UserRole.objects.filter(user=user).values_list('role_id', flat=True))
        to_add = desired_ids - existing_ids
        to_remove = existing_ids - desired_ids

        if to_remove:
            UserRole.objects.filter(user=user, role_id__in=to_remove).delete()

        if to_add:
            # Bulk create for efficiency
            roles = Role.objects.filter(id__in=to_add)
            to_create = [
                UserRole(
                    user=user,
                    role=role,
                    assigned_by=self.context.get('request').user if self.context.get('request') else None
                ) for role in roles
            ]
            UserRole.objects.bulk_create(to_create)


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


class TaskConfigurationSerializer(serializers.ModelSerializer):
    employee_ids = serializers.PrimaryKeyRelatedField(many=True, source='employees', queryset=Employee.objects.all(), required=False)
    department_ids = serializers.PrimaryKeyRelatedField(many=True, source='departments', queryset=Department.objects.all(), required=False)
    employee_names = serializers.SerializerMethodField()
    department_names = serializers.SerializerMethodField()
    schedule_summary = serializers.SerializerMethodField()
    target_level_display = serializers.CharField(source='get_target_level_display', read_only=True)

    class Meta:
        model = TaskConfiguration
        fields = [
            'id', 'name', 'description',
            'schedule_type', 'frequency_type', 'interval_minutes', 'required_count', 'days_of_week', 'due_day_of_month', 'due_month_of_year', 'flexibility_minutes', 'schedule_summary',
            'target_level', 'target_level_display',
            'employee_ids', 'department_ids', 'employee_names', 'department_names',
            'qr_code', 'qr_required', 'kiosk_required',
            'is_active', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at', 'employee_names', 'department_names', 'schedule_summary']

    def get_employee_names(self, obj):
        names = []
        for employee in obj.employees.all():
            names.append(employee.user.get_full_name() or employee.user.username)
        return names

    def get_department_names(self, obj):
        return [department.name for department in obj.departments.all()]

    def get_schedule_summary(self, obj):
        parts = []

        if obj.frequency_type == 'once':
            parts.append('Egyszeri')
        elif obj.frequency_type == 'login':
            parts.append('Belépés után')
        elif obj.frequency_type == 'daily':
            parts.append('Napi')
        elif obj.frequency_type == 'weekly':
            if obj.days_of_week:
                day_map = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
                labels = [day_map[d] for d in obj.days_of_week if isinstance(d, int) and 0 <= d <= 6]
                parts.append('Heti: ' + ', '.join(labels) if labels else 'Heti')
            else:
                parts.append('Heti')
        elif obj.frequency_type == 'monthly':
            if obj.due_day_of_month:
                parts.append(f"Havi: minden hónap {obj.due_day_of_month}. napjáig")
            else:
                parts.append('Havi')
        elif obj.frequency_type == 'yearly':
            if obj.due_month_of_year and obj.due_day_of_month:
                parts.append(f"Éves: minden év {obj.due_month_of_year}. hó {obj.due_day_of_month}. napjáig")
            else:
                parts.append('Éves')

        if obj.schedule_type in ('time', 'time_and_count') and obj.interval_minutes:
            parts.append(f"{obj.interval_minutes} percenként")

        if obj.schedule_type in ('count', 'time_and_count') and obj.required_count:
            parts.append(f"{obj.required_count}x")

        if obj.flexibility_minutes:
            parts.append(f"±{obj.flexibility_minutes} perc rugalmasság")

        return ' | '.join(parts) if parts else '-'

    def create(self, validated_data):
        employees = validated_data.pop('employees', [])
        departments = validated_data.pop('departments', [])
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user

        instance = TaskConfiguration.objects.create(**validated_data)
        if employees:
            instance.employees.set(employees)
        if departments:
            instance.departments.set(departments)
        return instance

    def update(self, instance, validated_data):
        employees = validated_data.pop('employees', None)
        departments = validated_data.pop('departments', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if employees is not None:
            instance.employees.set(employees)
        if departments is not None:
            instance.departments.set(departments)
        return instance


class TaskExecutionSerializer(serializers.ModelSerializer):
    task_name = serializers.CharField(source='task_configuration.name', read_only=True)
    started_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()

    class Meta:
        model = TaskExecution
        fields = [
            'id', 'task_configuration', 'task_name', 'employee',
            'started_by', 'started_by_name', 'completed_by', 'completed_by_name',
            'status', 'started_at', 'last_resumed_at', 'paused_at', 'completed_at',
            'total_duration_seconds', 'duration_minutes',
            'notes', 'period_key', 'qr_verified_code', 'kiosk_verified',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'started_by', 'completed_by', 'started_at', 'last_resumed_at', 'paused_at', 'completed_at',
            'total_duration_seconds', 'period_key', 'qr_verified_code', 'kiosk_verified',
            'created_at', 'updated_at'
        ]

    def get_started_by_name(self, obj):
        if not obj.started_by:
            return None
        return obj.started_by.get_full_name() or obj.started_by.username

    def get_completed_by_name(self, obj):
        if not obj.completed_by:
            return None
        return obj.completed_by.get_full_name() or obj.completed_by.username

    def get_duration_minutes(self, obj):
        seconds = obj.get_total_duration_seconds()
        return round(seconds / 60, 2)


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
    segments = serializers.ListField(child=serializers.DictField(), read_only=True, required=False)
    
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

class AttendanceKioskConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceKioskConfig
        fields = '__all__'

from .models import KioskDevice

class KioskDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = KioskDevice
        fields = '__all__'
        read_only_fields = ['last_seen']
