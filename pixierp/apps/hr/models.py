from django.db import models
from django.contrib.auth import get_user_model
from django.db.models import Max
from apps.core.models import BaseModel

User = get_user_model()


class Department(models.Model):
    """Department model"""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    managers = models.ManyToManyField(User, blank=True, related_name='managed_departments')
    budget = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Szerepkörök az osztályhoz rendelve
    # Az osztály tagjai automatikusan megkapják ezeket a szerepköröket
    roles = models.ManyToManyField('core.Role', blank=True, related_name='departments')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'departments'
        ordering = ['name']

    def __str__(self):
        return self.name


class Position(models.Model):
    """Job position model"""
    title = models.CharField(max_length=100)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='positions')
    description = models.TextField()
    requirements = models.TextField()
    salary_min = models.DecimalField(max_digits=10, decimal_places=2)
    salary_max = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'positions'
        ordering = ['title', 'department__name']

    def __str__(self):
        return f"{self.title} - {self.department.name}"


class Employee(BaseModel):
    """Employee model extending User"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='employee_profile')
    employee_id = models.CharField(max_length=20, unique=True)
    departments = models.ManyToManyField(Department, blank=True, related_name='employees')
    position = models.ForeignKey(Position, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Jogosultságok (kapcsolódó UserRole-okon keresztül kezelve a core modulban)
    # roles:Many-to-Many kapcsolat a core.Role-lal a UserRole táblán keresztül
    
    # Bejelentési adatok
    tb_number = models.CharField(max_length=20, blank=True, null=True, verbose_name='TB szám')
    tax_number = models.CharField(max_length=20, blank=True, null=True, verbose_name='Adószám')
    
    # Születési adatok
    birth_first_name = models.CharField(max_length=50, blank=True, null=True, verbose_name='Születési keresztnév')
    birth_last_name = models.CharField(max_length=50, blank=True, null=True, verbose_name='Születési vezetéknév')
    birth_place = models.CharField(max_length=100, blank=True, null=True, verbose_name='Születés helye')
    birth_date = models.DateField(blank=True, null=True, verbose_name='Születés ideje')
    
    GENDER_CHOICES = [
        ('male', 'Férfi'),
        ('female', 'Nő'),
    ]
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True, null=True, verbose_name='Nem')
    
    # Anyja neve
    mother_first_name = models.CharField(max_length=50, blank=True, null=True, verbose_name='Anyja keresztneve')
    mother_last_name = models.CharField(max_length=50, blank=True, null=True, verbose_name='Anyja vezetékneve')
    
    # Fizetés
    gross_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='Bruttó fizetés')
    net_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='Nettó fizetés')
    net_hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='Nettó órabér', blank=True, null=True)
    overhead_hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='Rezsi órabér', blank=True, null=True)
    daily_work_hours = models.DecimalField(max_digits=4, decimal_places=2, default=8.0, verbose_name='Napi munkaóra', blank=True, null=True)
    
    # Lakcím mezők (mint a cégeknél)
    address_country = models.CharField(max_length=100, default='Magyarország', verbose_name='Ország')
    address_postal_code = models.CharField(max_length=10, blank=True, null=True, verbose_name='Irányítószám')
    address_city = models.CharField(max_length=100, blank=True, null=True, verbose_name='Város')
    address_street_name = models.CharField(max_length=100, blank=True, null=True, verbose_name='Közterület neve')
    address_street_type = models.CharField(max_length=50, blank=True, null=True, verbose_name='Közterület típusa')
    address_house_number = models.CharField(max_length=20, blank=True, null=True, verbose_name='Házszám')
    address_generic = models.TextField(blank=True, null=True, verbose_name='Cím')
    
    # Jogosultság
    PERMISSION_LEVELS = [
        ('basic', 'Alapvető'),
        ('manager', 'Menedzser'),
        ('admin', 'Adminisztrátor'),
        ('superuser', 'Szuper felhasználó'),
    ]
    permission_level = models.CharField(max_length=20, choices=PERMISSION_LEVELS, default='basic', verbose_name='Jogosultság szint')
    # Jelszó: A Django User modellben tárolva (user.set_password() / user.check_password())
    
    # Meglévő mezők
    hire_date = models.DateField(null=True, blank=True)
    termination_date = models.DateField(null=True, blank=True)
    emergency_contact = models.CharField(max_length=100, blank=True, null=True)
    emergency_phone = models.CharField(max_length=20, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name='Telefonszám')
    bank_account = models.CharField(max_length=50, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'employees'
        ordering = ['user__last_name', 'user__first_name', 'employee_id']

    def __str__(self):
        return f"{self.user.get_full_name()} ({self.employee_id})"
    
    def get_all_roles(self):
        """Összes szerepkör: osztályok szerepkörei + egyéni UserRole-ok"""
        from apps.core.models import Role, UserRole
        
        role_ids = set()
        
        # Osztályok szerepkörei
        for department in self.departments.all():
            for role in department.roles.all():
                role_ids.add(role.id)
        
        # Egyéni UserRole-ok
        for user_role in UserRole.objects.filter(user=self.user):
            role_ids.add(user_role.role.id)
        
        return Role.objects.filter(id__in=role_ids)
    
    def get_department_roles(self):
        """Csak az osztályok szerepkörei"""
        from apps.core.models import Role
        
        role_ids = set()
        for department in self.departments.all():
            for role in department.roles.all():
                role_ids.add(role.id)
        
        return Role.objects.filter(id__in=role_ids)
    
    def get_individual_roles(self):
        """Csak az egyéni UserRole-ok"""
        from apps.core.models import UserRole
        return [ur.role for ur in UserRole.objects.filter(user=self.user)]
    
    def get_custom_permissions(self):
        """Egyéni jogosultságok (nem szerepkör alapú)"""
        from apps.core.models import Permission
        return Permission.objects.filter(user=self.user)
    
    @staticmethod
    def generate_employee_id():
        """Automatikus alkalmazott ID generálása - csak numerikus ID-k alapján"""
        # Csak a numerikus employee_id-kat vegyük figyelembe
        numeric_ids = []
        for emp in Employee.objects.all():
            try:
                numeric_ids.append(int(emp.employee_id))
            except (ValueError, TypeError):
                # Skip non-numeric IDs
                pass
        
        if not numeric_ids:
            return '10001'
        else:
            return str(max(numeric_ids) + 1)
    
    @staticmethod
    def generate_username(first_name, last_name):
        """Automatikus felhasználónév generálása"""
        import unicodedata
        import re
        
        def remove_accents(text):
            """Ékezetek eltávolítása"""
            return unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('ascii')
        
        # Alap felhasználónév: keresztnev.vezeteknev (ékezetek nélkül)
        clean_first = re.sub(r'[^a-zA-Z0-9]', '', remove_accents(first_name.lower()))
        clean_last = re.sub(r'[^a-zA-Z0-9]', '', remove_accents(last_name.lower()))
        base_username = f"{clean_first}.{clean_last}"
        username = base_username
        
        # Ha foglalt, akkor számot adunk hozzá
        counter = 2
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{counter}"
            counter += 1
        
        return username


class Attendance(BaseModel):
    """Employee attendance tracking"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField()
    check_in = models.TimeField()
    check_out = models.TimeField(null=True, blank=True)
    break_duration = models.DurationField(default=0)  # in minutes
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'attendances'
        unique_together = ['employee', 'date']

    def __str__(self):
        return f"{self.employee.user.get_full_name()} - {self.date}"


class LeaveRequest(BaseModel):
    """Leave request model"""
    LEAVE_TYPES = [
        ('vacation', 'Vacation'),
        ('sick', 'Sick Leave'),
        ('personal', 'Personal Leave'),
        ('maternity', 'Maternity Leave'),
        ('paternity', 'Paternity Leave'),
        ('emergency', 'Emergency Leave'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leave_requests')
    leave_type = models.CharField(max_length=20, choices=LEAVE_TYPES)
    start_date = models.DateField()
    end_date = models.DateField()
    days_requested = models.PositiveIntegerField()
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_leaves')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'leave_requests'

    def __str__(self):
        return f"{self.employee.user.get_full_name()} - {self.leave_type} ({self.start_date} to {self.end_date})"


class Payroll(BaseModel):
    """Payroll model"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payrolls')
    pay_period_start = models.DateField()
    pay_period_end = models.DateField()
    basic_salary = models.DecimalField(max_digits=10, decimal_places=2)
    overtime_pay = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    bonuses = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deductions = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=10, decimal_places=2)
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'payrolls'

    def __str__(self):
        return f"{self.employee.user.get_full_name()} - {self.pay_period_start} to {self.pay_period_end}"


class TimeLog(BaseModel):
    """Munkaidő napló - Projektekre és feladatokra logolt idők"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='time_logs', verbose_name='Alkalmazott')
    project = models.ForeignKey('manufacturing.Project', on_delete=models.CASCADE, related_name='time_logs', null=True, blank=True, verbose_name='Projekt')
    work_order = models.ForeignKey('manufacturing.WorkOrder', on_delete=models.CASCADE, related_name='time_logs', null=True, blank=True, verbose_name='Munkalap')
    task_description = models.TextField(verbose_name='Feladat leírása')
    start_time = models.DateTimeField(verbose_name='Kezdés időpontja')
    end_time = models.DateTimeField(null=True, blank=True, verbose_name='Befejezés időpontja')
    duration_hours = models.DecimalField(max_digits=6, decimal_places=2, default=0, verbose_name='Időtartam (óra)')
    notes = models.TextField(blank=True, null=True, verbose_name='Megjegyzések')
    is_billable = models.BooleanField(default=True, verbose_name='Számlázható')
    
    class Meta:
        db_table = 'time_logs'
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['employee', 'start_time']),
            models.Index(fields=['project', 'start_time']),
        ]
    
    def __str__(self):
        project_name = self.project.name if self.project else 'Nincs projekt'
        return f"{self.employee.user.get_full_name()} - {project_name} - {self.duration_hours}h"
    
    def save(self, *args, **kwargs):
        # Automatikus időtartam számítás, ha van kezdés és befejezés
        if self.start_time and self.end_time:
            delta = self.end_time - self.start_time
            self.duration_hours = round(delta.total_seconds() / 3600, 2)
        super().save(*args, **kwargs)


class AccessLog(BaseModel):
    """Beléptetőrendszer napló - Munkahelyen töltött idő nyilvántartása"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='access_logs', verbose_name='Alkalmazott')
    check_in_time = models.DateTimeField(verbose_name='Belépés időpontja')
    check_out_time = models.DateTimeField(null=True, blank=True, verbose_name='Kilépés időpontja')
    location = models.CharField(max_length=100, default='Főiroda', verbose_name='Helyszín')
    duration_hours = models.DecimalField(max_digits=6, decimal_places=2, default=0, verbose_name='Időtartam (óra)')
    notes = models.TextField(blank=True, null=True, verbose_name='Megjegyzések')
    
    class Meta:
        db_table = 'access_logs'
        ordering = ['-check_in_time']
        indexes = [
            models.Index(fields=['employee', 'check_in_time']),
        ]
    
    def __str__(self):
        date_str = self.check_in_time.strftime('%Y-%m-%d')
        return f"{self.employee.user.get_full_name()} - {date_str} - {self.duration_hours}h"
    
    def save(self, *args, **kwargs):
        # Automatikus időtartam számítás, ha van belépés és kilépés
        if self.check_in_time and self.check_out_time:
            delta = self.check_out_time - self.check_in_time
            self.duration_hours = round(delta.total_seconds() / 3600, 2)
        super().save(*args, **kwargs)


class ProjectParticipation(BaseModel):
    """Projekt résztvevők és profit részesedés"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='project_participations', verbose_name='Alkalmazott')
    project = models.ForeignKey('manufacturing.Project', on_delete=models.CASCADE, related_name='participations', verbose_name='Projekt')
    role = models.CharField(max_length=100, verbose_name='Szerep')
    participation_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name='Részesedési arány (%)')
    start_date = models.DateField(verbose_name='Kezdés dátuma')
    end_date = models.DateField(null=True, blank=True, verbose_name='Befejezés dátuma')
    contribution_description = models.TextField(blank=True, null=True, verbose_name='Hozzájárulás leírása')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    
    class Meta:
        db_table = 'project_participations'
        ordering = ['-start_date']
        unique_together = ['employee', 'project', 'role']
        indexes = [
            models.Index(fields=['employee', 'project']),
        ]
    
    def __str__(self):
        return f"{self.employee.user.get_full_name()} - {self.project.name} ({self.role})"


class AccessControlConfig(BaseModel):
    """Access control device configuration"""
    name = models.CharField(max_length=200, verbose_name='Eszköz név')
    device_id = models.CharField(max_length=100, unique=True, verbose_name='Eszköz azonosító')
    device_ip = models.GenericIPAddressField(verbose_name='IP cím')
    device_port = models.IntegerField(default=8001, verbose_name='Port')
    location = models.CharField(max_length=200, blank=True, null=True, verbose_name='Helyszín')
    description = models.TextField(blank=True, null=True, verbose_name='Leírás')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    is_online = models.BooleanField(default=False, verbose_name='Online')
    last_seen = models.DateTimeField(blank=True, null=True, verbose_name='Utolsó csatlakozás')
    
    class Meta:
        db_table = 'access_control_configs'
        ordering = ['name']
        verbose_name = 'Beléptető eszköz konfiguráció'
        verbose_name_plural = 'Beléptető eszköz konfigurációk'
    
    def __str__(self):
        return f"{self.name} ({self.device_id})"


class AccessControlFunction(models.TextChoices):
    """Access control function types"""
    CHECK_IN = 'check_in', 'Belépés'
    CHECK_OUT = 'check_out', 'Kilépés'
    DOOR_ACCESS = 'door_access', 'Ajtó nyitás'


class EmployeeAccessCredentials(BaseModel):
    """Employee access control credentials"""
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='access_credentials', verbose_name='Alkalmazott')
    device_config = models.ForeignKey(AccessControlConfig, on_delete=models.CASCADE, related_name='employee_credentials', verbose_name='Eszköz')
    credential_type = models.CharField(max_length=50, verbose_name='Azonosító típus', help_text='face, fingerprint, card, password')
    credential_data = models.TextField(blank=True, null=True, verbose_name='Azonosító adat')
    function = models.CharField(max_length=50, choices=AccessControlFunction.choices, default=AccessControlFunction.CHECK_IN, verbose_name='Funkció')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    
    class Meta:
        db_table = 'employee_access_credentials'
        ordering = ['employee', 'device_config']
        verbose_name = 'Beléptetőeszköz hozzáférés'
        verbose_name_plural = 'Beléptetőeszköz hozzáférések'
    
    def __str__(self):
        return f"{self.employee.user.get_full_name()} - {self.device_config.name} ({self.get_function_display()})"
