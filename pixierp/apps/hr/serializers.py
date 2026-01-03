from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Department, Position, Employee, Attendance, LeaveRequest, Payroll, TimeLog, AccessLog, ProjectParticipation, AccessControlConfig, EmployeeAccessCredentials

User = get_user_model()


class DepartmentSerializer(serializers.ModelSerializer):
    manager_names = serializers.SerializerMethodField()
    
    class Meta:
        model = Department
        fields = '__all__'
    
    def get_manager_names(self, obj):
        return [manager.get_full_name() for manager in obj.managers.all()]


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
    
    class Meta:
        model = Employee
        fields = '__all__'
        extra_kwargs = {
            'password': {'write_only': True},
            'user': {'write_only': True, 'required': False},
            'employee_id': {'required': False},
        }
    
    def get_full_name(self, obj):
        return obj.user.get_full_name()
    
    def get_department_names(self, obj):
        return [dept.name for dept in obj.departments.all()]
    
    def get_position_name(self, obj):
        return obj.position.title if obj.position else None
    
    def create(self, validated_data):
        user_data = validated_data.pop('user', {})
        departments_data = validated_data.pop('departments', [])
        
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
        
        return employee
    
    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        departments_data = validated_data.pop('departments', None)
        
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
