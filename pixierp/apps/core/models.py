from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey

# Import emergency access model
from .models_emergency import EmergencyAccessToken

# User model is handled by Django's built-in User model


class Notification(models.Model):
    """System notifications for users"""
    TYPE_CHOICES = [
        ('info', 'Információ'),
        ('success', 'Siker'),
        ('warning', 'Figyelmeztetés'),
        ('error', 'Hiba'),
    ]
    
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='notifications', verbose_name="Felhasználó")
    title = models.CharField(max_length=255, verbose_name="Cím")
    message = models.TextField(verbose_name="Üzenet")
    link = models.CharField(max_length=500, blank=True, null=True, verbose_name="Hivatkozás")
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='info', verbose_name="Típus")
    is_read = models.BooleanField(default=False, verbose_name="Olvasott")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    
    class Meta:
        verbose_name = "Értesítés"
        verbose_name_plural = "Értesítések"
        ordering = ['-created_at']
        db_table = 'notifications'
        
    def __str__(self):
        return f"{self.user.username} - {self.title}"


class Company(models.Model):
    """Company information"""
    name = models.CharField(max_length=200, verbose_name="Cégnév")
    tax_number = models.CharField(max_length=20, unique=True, verbose_name="Adószám")
    eu_tax_number = models.CharField(max_length=20, blank=True, default='', verbose_name="EU adószám")
    address = models.TextField(verbose_name="Cím")
    phone = models.CharField(max_length=20, blank=True, default='', verbose_name="Telefon")
    email = models.EmailField(verbose_name="E-mail")
    website = models.URLField(blank=True, null=True, verbose_name="Weboldal")
    logo = models.ImageField(upload_to='company/logos/', blank=True, null=True, verbose_name="Logó")
    is_default = models.BooleanField(default=False, verbose_name="Alapértelmezett")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Cég"
        verbose_name_plural = "Cégek"
        db_table = 'companies'

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Ha ez az alapértelmezett, akkor a többi nem lehet
        if self.is_default:
            Company.objects.filter(is_default=True).exclude(id=self.id).update(is_default=False)
        super().save(*args, **kwargs)


class Currency(models.Model):
    """Currency model for multi-currency support"""
    code = models.CharField(max_length=3, unique=True, verbose_name="Valuta kód")
    name = models.CharField(max_length=100, verbose_name="Valuta név")
    symbol = models.CharField(max_length=10, verbose_name="Szimbólum")
    is_default = models.BooleanField(default=False, verbose_name="Alapértelmezett")
    exchange_rate = models.DecimalField(
        max_digits=10, 
        decimal_places=4, 
        default=1.0000,
        validators=[MinValueValidator(0.0001)],
        verbose_name="Árfolyam"
    )
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")

    class Meta:
        verbose_name = "Valuta"
        verbose_name_plural = "Valuták"
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.name} ({self.symbol})"

    def save(self, *args, **kwargs):
        # Ha ez az alapértelmezett, akkor a többi nem lehet
        if self.is_default:
            Currency.objects.filter(is_default=True).update(is_default=False)
        super().save(*args, **kwargs)


class BankAccount(models.Model):
    """Bank account information for a company"""
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='bank_accounts', verbose_name="Cég")
    company_external_id = models.CharField(max_length=100, blank=True, default='', db_index=True, verbose_name="Cég külső azonosító")
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, verbose_name="Deviza")
    account_number = models.CharField(max_length=50, verbose_name="Bankszámlaszám")
    bank_name = models.CharField(max_length=200, blank=True, default='', verbose_name="Bank neve")
    swift = models.CharField(max_length=11, blank=True, default='', verbose_name="SWIFT/BIC kód")
    iban = models.CharField(max_length=34, blank=True, default='', verbose_name="IBAN")
    is_primary = models.BooleanField(default=False, verbose_name="Elsődleges")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")

    class Meta:
        verbose_name = "Bankszámla"
        verbose_name_plural = "Bankszámlák"
        ordering = ['-is_primary', 'currency__code']
        unique_together = ['company', 'account_number']

    def __str__(self):
        return f"{self.company.name} - {self.currency.code}: {self.account_number}"

    def save(self, *args, **kwargs):
        # Ha ez az elsődleges számla ehhez a céghez és devizához, akkor a többi nem lehet
        if self.is_primary:
            BankAccount.objects.filter(
                company=self.company, 
                currency=self.currency, 
                is_primary=True
            ).exclude(id=self.id).update(is_primary=False)
        super().save(*args, **kwargs)


class BaseModel(models.Model):
    """Base model with common fields"""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        abstract = True


class EmailServerConfig(models.Model):
    """SMTP/IMAP beállítások levelezéshez"""
    name = models.CharField(max_length=100, default='Alapértelmezett')
    from_name = models.CharField(max_length=100, blank=True, default='')
    from_email = models.EmailField()
    # SMTP
    smtp_host = models.CharField(max_length=255)
    smtp_port = models.PositiveIntegerField(default=587)
    smtp_username = models.CharField(max_length=255, blank=True, default='')
    smtp_password = models.CharField(max_length=255, blank=True, default='')
    smtp_use_tls = models.BooleanField(default=True)
    smtp_use_ssl = models.BooleanField(default=False)
    # IMAP
    imap_host = models.CharField(max_length=255, blank=True, default='')
    imap_port = models.PositiveIntegerField(default=993)
    imap_username = models.CharField(max_length=255, blank=True, default='')
    imap_password = models.CharField(max_length=255, blank=True, default='')
    imap_sent_folder = models.CharField(max_length=255, blank=True, default='Sent')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Email szerver beállítás'
        verbose_name_plural = 'Email szerver beállítások'
        ordering = ['-is_active', 'name']

    def __str__(self):
        return f"{self.name} <{self.from_email}>"


class HestiaConfig(models.Model):
    """Hestia integrációs beállítások (CLI/REST)."""
    MODE_CHOICES = [
        ('cli', 'CLI'),
        ('rest', 'REST API'),
    ]

    name = models.CharField(max_length=100, default='Alapértelmezett')
    is_active = models.BooleanField(default=True)

    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default='cli')
    default_domain = models.CharField(max_length=255, help_text='Az e-mail címek domain része (pl. pixisys.eu)')

    hestia_user = models.CharField(max_length=255, help_text='Hestia user, amelyhez a domain tartozik')

    cli_bin_path = models.CharField(max_length=255, default='/usr/local/hestia/bin')
    cli_use_sudo = models.BooleanField(default=False)
    cli_sudo_runner = models.CharField(max_length=255, blank=True, default='')
    ssh_enabled = models.BooleanField(default=False)
    ssh_host = models.CharField(max_length=255, blank=True, default='')
    ssh_port = models.PositiveIntegerField(default=22)
    ssh_user = models.CharField(max_length=255, blank=True, default='')
    ssh_private_key_path = models.CharField(max_length=500, blank=True, default='')
    ssh_strict_host_key = models.BooleanField(default=True)

    rest_api_url = models.CharField(max_length=500, blank=True, default='')
    rest_api_user = models.CharField(max_length=255, blank=True, default='')
    rest_api_password = models.CharField(max_length=255, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Hestia beállítás'
        verbose_name_plural = 'Hestia beállítások'
        ordering = ['-is_active', 'name']

    def __str__(self):
        return f"{self.name} ({self.default_domain})"


class EmailTemplate(models.Model):
    """E-mail sablon (pl. ajánlat kiküldés)"""
    key = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    subject_template = models.TextField()
    body_template = models.TextField(help_text='HTML vagy szöveges sablon')
    default_cc = models.TextField(blank=True, default='', help_text='Alapértelmezett CC címzettek (vesszővel elválasztva)')
    default_reply_to = models.EmailField(blank=True, default='', help_text='Alapértelmezett Reply-To cím')
    is_html = models.BooleanField(default=True)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'E-mail sablon'
        verbose_name_plural = 'E-mail sablonok'
        ordering = ['name']

    def __str__(self):
        return self.name


class SignatureTemplate(models.Model):
    key = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    body_html = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Aláírás sablon'
        verbose_name_plural = 'Aláírás sablonok'
        ordering = ['name']

    def __str__(self):
        return self.name


class UserPreference(models.Model):
    """User személyes beállítások"""
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, related_name='preferences')
    default_signature = models.ForeignKey(SignatureTemplate, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Alapértelmezett aláírás')
    previous_password_hash = models.CharField(max_length=255, blank=True, null=True, verbose_name="Előző jelszó hash")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Felhasználó beállítás'
        verbose_name_plural = 'Felhasználó beállítások'

    def __str__(self):
        return f"{self.user.username} beállítások"


class PixinvoiceConfig(models.Model):
    """PIXINVOICE API konfiguráció (NAV lekérdezés, ügyfél szinkron, számlázás)"""
    name = models.CharField(max_length=100, default='Alapértelmezett')
    base_url = models.URLField(default='http://inv.pixisys.eu/api/')
    api_key = models.CharField(max_length=255, blank=True, default='')
    company_id = models.CharField(max_length=64, blank=True, default='')
    default_invoice_series_id = models.CharField(max_length=64, blank=True, default='', verbose_name='Alapértelmezett számlatömb')
    sync_settings = models.JSONField(default=dict, blank=True)

    def get_sync_settings(self):
        """Return sync settings dict safely."""
        return self.sync_settings or {}
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'PIXINVOICE beállítás'
        verbose_name_plural = 'PIXINVOICE beállítások'
        ordering = ['-is_active', 'name']

    def __str__(self):
        return f"{self.name} ({'aktív' if self.is_active else 'inaktív'})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_active:
            PixinvoiceConfig.objects.exclude(id=self.id).filter(is_active=True).update(is_active=False)


class BackupConfiguration(models.Model):
    """Backup configuration settings"""
    INTERVAL_CHOICES = [
        ('daily', 'Napi'),
        ('weekly', 'Heti'),
        ('monthly', 'Havi'),
    ]
    
    name = models.CharField(max_length=100, verbose_name="Konfiguráció neve")
    interval = models.CharField(max_length=10, choices=INTERVAL_CHOICES, verbose_name="Mentési gyakoriság")
    retention_days = models.IntegerField(verbose_name="Megőrzési idő (nap)", help_text="Ennyi nap után felülírhatók a régi backup fájlok")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    last_backup = models.DateTimeField(null=True, blank=True, verbose_name="Utolsó mentés")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")

    class Meta:
        verbose_name = 'Backup konfiguráció'
        verbose_name_plural = 'Backup konfigurációk'
        ordering = ['interval']
        db_table = 'backup_configurations'

    def __str__(self):
        return f"{self.name} ({self.get_interval_display()})"


class BackupFile(models.Model):
    """Backup file records"""
    configuration = models.ForeignKey(BackupConfiguration, on_delete=models.SET_NULL, null=True, blank=True, related_name='backups', verbose_name="Konfiguráció")
    filename = models.CharField(max_length=255, verbose_name="Fájlnév")
    filepath = models.CharField(max_length=500, verbose_name="Fájl útvonal")
    file_size = models.BigIntegerField(verbose_name="Fájlméret (byte)")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    is_manual = models.BooleanField(default=False, verbose_name="Manuális mentés")

    class Meta:
        verbose_name = 'Backup fájl'
        verbose_name_plural = 'Backup fájlok'
        ordering = ['-created_at']
        db_table = 'backup_files'

    def __str__(self):
        return self.filename

    @property
    def file_size_mb(self):
        """Return file size in MB"""
        return round(self.file_size / (1024 * 1024), 2)


class Role(models.Model):
    """Szerepkör (preset jogosultság csoport)"""
    name = models.CharField(max_length=100, unique=True, verbose_name="Szerepkör neve")
    description = models.TextField(blank=True, verbose_name="Leírás")
    is_system = models.BooleanField(default=False, verbose_name="Rendszer szerepkör")
    can_approve_orders = models.BooleanField(default=False, verbose_name="Jóváhagyó")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Szerepkör"
        verbose_name_plural = "Szerepkörök"
        ordering = ['name']
        db_table = 'roles'

    def __str__(self):
        return self.name


class Permission(models.Model):
    """Jogosultság - modul/almodul/művelet szintű hozzáférés"""
    MODULE_CHOICES = [
        ('hr', 'HR'),
        ('manufacturing', 'Gyártás'),
        ('sales', 'Értékesítés'),
        ('crm', 'CRM'),
        ('finance', 'Pénzügy'),
        ('warehouse', 'Raktár'),
        ('orders', 'Megrendelések'),
        ('pos', 'POS'),
        ('settings', 'Beállítások'),
    ]
    
    # Almodulok/Erőforrások modulonként
    RESOURCE_CHOICES = [
        # HR
        ('hr.employees', 'HR - Alkalmazottak'),
        ('hr.departments', 'HR - Osztályok'),
        ('hr.positions', 'HR - Pozíciók'),
        ('hr.attendance', 'HR - Jelenléti ív'),
        ('hr.leave_requests', 'HR - Szabadság kérelmek'),
        ('hr.payroll', 'HR - Bérszámfejtés'),
        
        # Manufacturing
        ('manufacturing.projects', 'Gyártás - Projektek'),
        ('manufacturing.products', 'Gyártás - Termékek'),
        ('manufacturing.work_sheets', 'Gyártás - Munkalapok'),
        ('manufacturing.materials', 'Gyártás - Anyagok'),
        
        # Sales
        ('sales.rfqs', 'Értékesítés - Árajánlatok'),
        ('sales.quotes', 'Értékesítés - Ajánlatok'),
        ('sales.orders', 'Értékesítés - Megrendelések'),
        ('sales.leads', 'Értékesítés - Leadek'),
        ('sales.opportunities', 'Értékesítés - Lehetőségek'),
        
        # CRM
        ('crm.companies', 'CRM - Cégek'),
        ('crm.contacts', 'CRM - Kapcsolattartók'),
        ('crm.activities', 'CRM - Tevékenységek'),
        
        # Finance
        ('finance.invoices', 'Pénzügy - Számlák'),
        ('finance.payments', 'Pénzügy - Kifizetések'),
        ('finance.expenses', 'Pénzügy - Kiadások'),
        ('finance.cash_registers', 'Pénzügy - Kasszák'),
        ('finance.cash_transactions', 'Pénzügy - Kassza tranzakciók'),
        
        # Warehouse
        ('warehouse.materials', 'Raktár - Anyagok'),
        ('warehouse.inventory', 'Raktár - Készlet'),
        ('warehouse.movements', 'Raktár - Mozgások'),
        
        # Orders
        ('orders.customer_orders', 'Megrendelések - Vevői megrendelések'),
        ('orders.purchase_orders', 'Megrendelések - Beszerzési megrendelések'),
        
        # POS
        ('pos.transactions', 'POS - Tranzakciók'),
        ('pos.products', 'POS - Termékek'),
        
        # Settings
        ('settings.users', 'Beállítások - Felhasználók'),
        ('settings.roles', 'Beállítások - Szerepkörök'),
        ('settings.company', 'Beállítások - Cégadatok'),
        ('settings.email', 'Beállítások - E-mail'),
        ('settings.integrations', 'Beállítások - Integrációk'),
    ]
    
    ACTION_CHOICES = [
        ('view', 'Megtekintés'),
        ('view_own', 'Saját adatok megtekintése'),
        ('create', 'Létrehozás'),
        ('edit', 'Szerkesztés'),
        ('delete', 'Törlés'),
        ('export', 'Export'),
        ('manage', 'Teljes jogosultság'),
    ]
    
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='permissions', verbose_name="Szerepkör", null=True, blank=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='custom_permissions', verbose_name="Felhasználó", null=True, blank=True)
    module = models.CharField(max_length=50, choices=MODULE_CHOICES, verbose_name="Modul")
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, verbose_name="Művelet")
    resource = models.CharField(max_length=100, choices=RESOURCE_CHOICES, blank=True, verbose_name="Almodul/Erőforrás")
    allowed = models.BooleanField(default=True, verbose_name="Engedélyezett")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Jogosultság"
        verbose_name_plural = "Jogosultságok"
        db_table = 'permissions'
        indexes = [
            models.Index(fields=['module', 'action']),
            models.Index(fields=['role']),
            models.Index(fields=['user']),
        ]

    def __str__(self):
        target = self.role.name if self.role else f"User#{self.user_id}"
        resource_display = dict(self.RESOURCE_CHOICES).get(self.resource, self.resource) if self.resource else self.get_module_display()
        return f"{target} - {resource_display} - {self.get_action_display()}"


class UserRole(models.Model):
    """Felhasználó-Szerepkör kapcsolat"""
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='user_roles', verbose_name="Felhasználó")
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='user_assignments', verbose_name="Szerepkör")
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_roles', verbose_name="Hozzárendelte")

    class Meta:
        verbose_name = "Felhasználó szerepkör"
        verbose_name_plural = "Felhasználó szerepkörök"
        unique_together = ['user', 'role']
        db_table = 'user_roles'

    def __str__(self):
        return f"{self.user.username} - {self.role.name}"
class Zone(models.Model):
    """Munkazóna definíció"""
    name = models.CharField(max_length=100, verbose_name="Zóna neve")
    zone_number = models.CharField(max_length=50, unique=True, verbose_name="Zóna szám")
    note = models.TextField(blank=True, default='', verbose_name="Megjegyzés")
    departments = models.ManyToManyField('hr.Department', blank=True, related_name="zones", verbose_name="Osztályok")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")

    class Meta:
        verbose_name = "Zóna"
        verbose_name_plural = "Zónák"
        ordering = ['zone_number']
        db_table = 'zones'

    def __str__(self):
        return f"{self.zone_number} - {self.name}"


class ActivityLog(models.Model):
    """Activity/Audit log for tracking user actions across the system"""
    ACTION_CHOICES = [
        ('create', 'Létrehozva'),
        ('update', 'Módosítva'),
        ('delete', 'Törölve'),
        ('approve', 'Jóváhagyva'),
        ('reject', 'Elutasítva'),
        ('cancel', 'Törölve/Megszakítva'),
        ('send', 'Elküldve'),
        ('complete', 'Befejezve'),
        ('other', 'Egyéb'),
    ]
    
    user = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, related_name='activity_logs', verbose_name="Felhasználó")
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name="Időpont", db_index=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, verbose_name="Művelet")
    description = models.TextField(verbose_name="Leírás")
    
    # Generic foreign key for polymorphic relationship to any model
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE, null=True, blank=True, verbose_name="Objektum típus")
    object_id = models.PositiveIntegerField(null=True, blank=True, verbose_name="Objektum ID")
    content_object = GenericForeignKey('content_type', 'object_id')
    
    # Optional JSON field for storing detailed changes
    changes = models.JSONField(null=True, blank=True, verbose_name="Változások")
    
    # IP address and user agent for additional context
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="IP cím")
    user_agent = models.TextField(blank=True, default='', verbose_name="User Agent")
    
    class Meta:
        verbose_name = "Tevékenység napló"
        verbose_name_plural = "Tevékenység naplók"
        ordering = ['-timestamp']
        db_table = 'activity_logs'
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['user', 'timestamp']),
        ]
    
    def __str__(self):
        user_name = self.user.get_full_name() if self.user else "Rendszer"
        return f"{self.timestamp.strftime('%Y-%m-%d %H:%M')} - {user_name}: {self.description}"
