from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
import uuid

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
    ssh_key_id = models.CharField(max_length=255, blank=True, default='pixierp-hestia')
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
    ui_preferences = models.JSONField(default=dict, blank=True, verbose_name='UI beállítások')
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
        ('dashboard', 'Dashboard'),
        ('hr', 'HR'),
        ('sales', 'Értékesítés'),
        ('manufacturing', 'Gyártás'),
        ('finance', 'Pénzügy'),
        ('crm', 'CRM'),
        ('orders', 'Megrendelések'),
        ('warehouse', 'Raktár'),
        ('pos', 'POS'),
        ('tickets', 'Jegyek'),
        ('site_management', 'Weboldal kezelés'),
        ('storage', 'Tárhely'),
        ('printshop', 'Nyomda'),
        ('settings', 'Beállítások'),
    ]
    
    # Almodulok/Erőforrások modulonként
    RESOURCE_CHOICES = [
        # Dashboard
        ('dashboard.manufacturing', 'Dashboard - Általános / Gyártás nézet'),
        ('dashboard.sales', 'Dashboard - Értékesítési nézet'),

        # HR
        ('hr.employees', 'HR - Alkalmazottak'),
        ('hr.departments', 'HR - Osztályok'),
        ('hr.positions', 'HR - Pozíciók'),
        ('hr.attendance', 'HR - Jelenléti ív'),
        ('hr.work_logs', 'HR - Munkanaplók'),
        ('hr.leave_requests', 'HR - Szabadságok'),
        ('hr.payroll', 'HR - Bérszámfejtés'),
        ('hr.analytics', 'HR - Teljesítmény elemzés'),
        ('hr.activity_log', 'HR - Tevékenység napló'),
        ('hr.task_settings', 'HR - Feladatok beállítása'),

        # Manufacturing
        ('manufacturing.products', 'Gyártás - Termékek'),
        ('manufacturing.product_editor', 'Gyártás - Termék szerkesztő'),
        ('manufacturing.product_classes', 'Gyártás - Termékkategóriák'),
        ('manufacturing.ordered_products', 'Gyártás - Megrendelt gyártások'),
        ('manufacturing.queue', 'Gyártás - Gyártási sor'),
        ('manufacturing.projects', 'Gyártás - Projektek'),
        ('manufacturing.services', 'Gyártás - Szolgáltatások'),
        ('manufacturing.service_groups', 'Gyártás - Szolgáltatás csoportok'),
        ('manufacturing.materials', 'Gyártás - Anyagok'),
        ('manufacturing.work_sheets', 'Gyártás - Munkalapok'),
        ('manufacturing.print_templates', 'Gyártás - Nyomda sablonok'),
        ('manufacturing.calculators', 'Gyártás - Kalkulátorok'),

        # Sales
        ('sales.rfqs', 'Értékesítés - Árajánlatok'),
        ('sales.orders', 'Értékesítés - Megrendelések'),
        ('sales.delivery_notes', 'Értékesítés - Szállítólevelek'),
        ('sales.invoicing', 'Értékesítés - Számlázás'),
        ('sales.invitations', 'Értékesítés - Meghívók'),
        ('sales.projects', 'Értékesítés - Projektek'),
        ('sales.leads', 'Értékesítés - Leadek'),
        ('sales.opportunities', 'Értékesítés - Lehetőségek'),

        # CRM
        ('crm.companies', 'CRM - Cégek'),
        ('crm.contacts', 'CRM - Kapcsolattartók'),
        ('crm.activities', 'CRM - Tevékenységek'),
        ('crm.campaigns', 'CRM - Kampányok'),

        # Finance
        ('finance.invoices', 'Pénzügy - Számlák'),
        ('finance.payments', 'Pénzügy - Kifizetések'),
        ('finance.cash_registers', 'Pénzügy - Kasszák'),
        ('finance.cash_register_setup', 'Pénzügy - Kassza beállítás'),
        ('finance.budgets', 'Pénzügy - Költségvetések'),
        ('finance.reports', 'Pénzügy - Jelentések'),
        ('finance.expenses', 'Pénzügy - Kiadások'),
        ('finance.cash_transactions', 'Pénzügy - Kassza tranzakciók'),

        # Warehouse
        ('warehouse.materials', 'Raktár - Anyagok'),
        ('warehouse.material_groups', 'Raktár - Anyag csoportok'),
        ('warehouse.inventory', 'Raktár - Készlet'),
        ('warehouse.receipts', 'Raktár - Bevételezések'),
        ('warehouse.supplier_invoices', 'Raktár - Szállítói számlák'),
        ('warehouse.scraps', 'Raktár - Selejtezések'),
        ('warehouse.warehouses', 'Raktár - Raktárak'),
        ('warehouse.suppliers', 'Raktár - Szállítók'),
        ('warehouse.reports', 'Raktár - Jelentések'),
        ('warehouse.picking', 'Raktár - Komissiózás'),
        ('warehouse.picking_list', 'Raktár - Komissiózási lista'),
        ('warehouse.movements', 'Raktár - Mozgások'),

        # Orders
        ('orders.customer_orders', 'Megrendelések - Vevői megrendelések'),
        ('orders.purchase_orders', 'Megrendelések - Beszerzési megrendelések'),
        ('orders.shipments', 'Megrendelések - Szállítmányok'),
        ('orders.returns', 'Megrendelések - Visszaáruk'),
        ('orders.suppliers', 'Megrendelések - Szállítók'),

        # POS
        ('pos.sales', 'POS - Értékesítés'),
        ('pos.registration', 'POS - Regisztráció'),
        ('pos.terminals', 'POS - Terminálok'),
        ('pos.products', 'POS - Termékek'),

        # Settings
        ('settings.users', 'Beállítások - Felhasználók'),
        ('settings.roles', 'Beállítások - Szerepkörök'),
        ('settings.company', 'Beállítások - Cégadatok'),
        ('settings.currencies', 'Beállítások - Pénznemek'),
        ('settings.email', 'Beállítások - E-mail szerver'),
        ('settings.email_templates', 'Beállítások - E-mail sablonok'),
        ('settings.signatures', 'Beállítások - Aláírások'),
        ('settings.zones', 'Beállítások - Zónák'),
        ('settings.integrations', 'Beállítások - Integrációk'),
        ('settings.access_control', 'Beállítások - Beléptető rendszer'),
        ('settings.attendance_kiosk', 'Beállítások - Jelenlét kioszk'),
        ('settings.pixinvoice', 'Beállítások - PIXINVOICE'),
        ('settings.hestia', 'Beállítások - Hestia'),
        ('settings.backup', 'Beállítások - Backup'),
        ('settings.public_site', 'Beállítások - Publikus oldal'),
        ('settings.iot', 'Beállítások - IoT eszközök'),
        ('settings.nfc', 'Beállítások - NFC tagek'),
        ('settings.print_products', 'Beállítások - Termékszerkesztők'),

        # Printshop
        ('printshop.preview', 'Nyomda - Preview'),
        ('printshop.sheet', 'Nyomda - Íves nyomtatás'),
        ('printshop.shop', 'Nyomda - Nyomdai megrendelés'),

        # Storage
        ('storage.manage', 'Tárhely - Teljes hozzáférés (admin)'),

        # Tickets
        ('tickets.list', 'Jegyek - Lista'),
        ('tickets.settings', 'Jegyek - Beállítások'),

        # Site management
        ('site_management.manage', 'Weboldal kezelés'),
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


class IoTDevice(models.Model):
    """IoT eszköz (pl. Shelly relé, szenzor, stb.)"""

    DEVICE_TYPE_CHOICES = [
        ('shelly_1mini_gen3_relay', 'Shelly 1 Mini Gen3 Relay'),
    ]

    name = models.CharField(max_length=150, verbose_name='Eszköz neve')
    device_type = models.CharField(max_length=60, choices=DEVICE_TYPE_CHOICES, verbose_name='Típus')
    location = models.CharField(max_length=200, blank=True, default='', verbose_name='Hely')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')

    # Shelly connection fields
    shelly_host = models.CharField(max_length=255, blank=True, default='', verbose_name='IP / Hostnév (Shelly)')
    shelly_auth_user = models.CharField(max_length=100, blank=True, default='', verbose_name='Felhasználónév (Shelly)')
    shelly_auth_pass = models.CharField(max_length=255, blank=True, default='', verbose_name='Jelszó (Shelly)')
    shelly_channel = models.PositiveSmallIntegerField(default=0, verbose_name='Csatorna (0=alap)')
    type_settings = models.JSONField(default=dict, blank=True, verbose_name='Típus beállítások')

    # Jogosultság: ha üres → mindenki bejelentkezett user mehet, ha ki van töltve → csak a megadott osztályok
    allowed_departments = models.ManyToManyField(
        'hr.Department',
        blank=True,
        related_name='iot_devices',
        verbose_name='Jogosult HR osztályok',
        help_text='Ha üres, minden bejelentkezett felhasználó használhatja. Ha meg van adva, csak a listában szereplő osztályok tagjai.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'IoT eszköz'
        verbose_name_plural = 'IoT eszközök'
        ordering = ['name']
        db_table = 'iot_devices'

    def __str__(self):
        return f"{self.name} ({self.get_device_type_display()})"


class NfcTag(models.Model):
    """NFC tag, amely egy IoT eszköz egy csatornáját aktiválja érintésre."""

    TAG_TYPE_CHOICES = [
        ('ntag215', 'NTAG215'),
        ('ntag424', 'NTAG424'),
    ]

    name = models.CharField(max_length=150, verbose_name='Név')
    tag_type = models.CharField(max_length=20, choices=TAG_TYPE_CHOICES, verbose_name='Tag típusa')
    location = models.CharField(max_length=200, blank=True, default='', verbose_name='Hely / leírás')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')

    # Linked IoT action
    iot_device = models.ForeignKey(
        'IoTDevice', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='nfc_tags',
        verbose_name='IoT eszköz',
    )
    iot_channel = models.PositiveSmallIntegerField(default=0, verbose_name='IoT csatorna')

    # NTAG424 SUN (Secure Unique NFC) authentication
    sun_key = models.CharField(
        max_length=32, blank=True, default='',
        verbose_name='SUN AES kulcs (hex)',
        help_text='32 hex karakter (16 bájt AES-128 kulcs). Csak NTAG424-hez szükséges.',
    )
    last_counter = models.PositiveIntegerField(
        default=0,
        verbose_name='Utolsó SUN számláló',
        help_text='Visszajátszás elleni védelem — az utolsó érvényes tap számlálója.',
    )
    require_login = models.BooleanField(
        default=True,
        verbose_name='Bejelentkezés szükséges',
        help_text='Ha ki van kapcsolva, az NFC tag bejelentkezés nélkül is aktivál (csak NTAG424 SUN kriptó szükséges). Zárolt képernyőnél is működik.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'NFC tag'
        verbose_name_plural = 'NFC tagek'
        ordering = ['name']
        db_table = 'nfc_tags'

    def __str__(self):
        return f"{self.name} ({self.get_tag_type_display()})"


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


class TicketTopic(models.Model):
    """Jegy témakörök"""
    name = models.CharField(max_length=120, unique=True, verbose_name="Témakör neve")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Sorrend")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Jegy témakör"
        verbose_name_plural = "Jegy témakörök"
        ordering = ['sort_order', 'name']
        db_table = 'ticket_topics'

    def __str__(self):
        return self.name


class TicketType(models.Model):
    """Jegy típusok dinamikus kezelése"""
    code = models.SlugField(max_length=50, unique=True, verbose_name='Kód')
    name = models.CharField(max_length=120, verbose_name='Megnevezés')
    sort_order = models.PositiveIntegerField(default=0, verbose_name='Sorrend')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Jegy típus'
        verbose_name_plural = 'Jegy típusok'
        ordering = ['sort_order', 'name']
        db_table = 'ticket_types'

    def __str__(self):
        return self.name


class Ticket(models.Model):
    """Általános jegy (belső/külső)"""
    STATUS_CHOICES = [
        ('open', 'Nyitott'),
        ('in_progress', 'Folyamatban'),
        ('answered', 'Megválaszolva'),
        ('closed', 'Lezárt'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Alacsony'),
        ('normal', 'Normál'),
        ('high', 'Magas'),
        ('urgent', 'Sürgős'),
    ]

    AUDIENCE_CHOICES = [
        ('internal', 'Belsős'),
        ('external', 'Külsős'),
        ('both', 'Mindkettő'),
    ]

    ticket_number = models.CharField(max_length=20, unique=True, blank=True, default='', db_index=True, verbose_name='Jegyszám')
    title = models.CharField(max_length=255, verbose_name='Cím')
    ticket_type = models.CharField(max_length=50, default='other', verbose_name='Típus')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open', verbose_name='Státusz')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal', verbose_name='Prioritás')
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES, default='internal', verbose_name='Címzett típusa')

    topic = models.ForeignKey(TicketTopic, on_delete=models.SET_NULL, null=True, blank=True, related_name='tickets', verbose_name='Témakör')
    departments = models.ManyToManyField('hr.Department', blank=True, related_name='tickets', verbose_name='HR osztályok')
    assigned_users = models.ManyToManyField('auth.User', blank=True, related_name='assigned_tickets', verbose_name='Személyek')

    requester_name = models.CharField(max_length=255, blank=True, default='', verbose_name='Külsős név')
    requester_email = models.EmailField(blank=True, default='', verbose_name='Külsős e-mail')
    public_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True, verbose_name='Publikus token')
    public_reply_enabled = models.BooleanField(default=True, verbose_name='Publikus válasz engedélyezve')

    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='created_tickets', verbose_name='Létrehozta')
    first_response_due_at = models.DateTimeField(null=True, blank=True, verbose_name='Első válasz határidő')
    resolution_due_at = models.DateTimeField(null=True, blank=True, verbose_name='Megoldási határidő')
    first_responded_at = models.DateTimeField(null=True, blank=True, verbose_name='Első válasz időpontja')
    resolved_at = models.DateTimeField(null=True, blank=True, verbose_name='Megoldva ekkor')
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name='Lezárva ekkor')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Jegy'
        verbose_name_plural = 'Jegyek'
        ordering = ['-created_at']
        db_table = 'tickets'

    def __str__(self):
        return f"{self.ticket_number or '#'} - {self.title}"

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        if is_new and self.audience == 'internal':
            self.public_reply_enabled = False
        if self.status == 'closed' and not self.closed_at:
            self.closed_at = timezone.now()
        if self.status != 'closed' and self.closed_at:
            self.closed_at = None

        if self.status in ('answered', 'closed') and not self.resolved_at:
            self.resolved_at = timezone.now()
        if self.status in ('open', 'in_progress') and self.resolved_at:
            self.resolved_at = None

        super().save(*args, **kwargs)
        if (is_new and not self.ticket_number) or self.ticket_number == '':
            self.ticket_number = f"JEGY-{self.id:06d}"
            super().save(update_fields=['ticket_number'])


class TicketMessage(models.Model):
    """Jegy üzenetfolyam eleme"""
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='messages', verbose_name='Jegy')
    author = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='ticket_messages', verbose_name='Szerző')
    author_name = models.CharField(max_length=255, blank=True, default='', verbose_name='Szerző neve')
    author_email = models.EmailField(blank=True, default='', verbose_name='Szerző e-mail')
    body_html = models.TextField(verbose_name='HTML üzenet')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = 'Jegy üzenet'
        verbose_name_plural = 'Jegy üzenetek'
        ordering = ['created_at']
        db_table = 'ticket_messages'

    def __str__(self):
        author = self.author.get_full_name() if self.author else (self.author_name or 'Ismeretlen')
        return f"{self.ticket.ticket_number} - {author}"


class TicketAttachment(models.Model):
    """Jegy üzenet csatolmány"""
    message = models.ForeignKey(TicketMessage, on_delete=models.CASCADE, related_name='attachments', verbose_name='Üzenet')
    file = models.FileField(upload_to='tickets/attachments/%Y/%m/', verbose_name='Fájl')
    uploaded_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='ticket_attachments', verbose_name='Feltöltő')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Jegy csatolmány'
        verbose_name_plural = 'Jegy csatolmányok'
        ordering = ['created_at']
        db_table = 'ticket_attachments'

    def __str__(self):
        return self.file.name.split('/')[-1]


class TicketStatusLog(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='status_logs', verbose_name='Jegy')
    from_status = models.CharField(max_length=20, blank=True, default='', verbose_name='Előző státusz')
    to_status = models.CharField(max_length=20, verbose_name='Új státusz')
    changed_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='ticket_status_changes', verbose_name='Módosította')
    note = models.CharField(max_length=255, blank=True, default='', verbose_name='Megjegyzés')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = 'Jegy státusznapló'
        verbose_name_plural = 'Jegy státusznaplók'
        ordering = ['-created_at']
        db_table = 'ticket_status_logs'

    def __str__(self):
        return f"{self.ticket.ticket_number}: {self.from_status} -> {self.to_status}"


class PublicSiteConfig(models.Model):
    name = models.CharField(max_length=120, default='Alapértelmezett publikus site')
    public_domain = models.CharField(max_length=255, blank=True, default='', verbose_name='Publikus domain')
    portal_domain = models.CharField(max_length=255, blank=True, default='', verbose_name='Portál domain')
    site_title = models.CharField(max_length=255, default='Pixi Portal', verbose_name='Oldal cím')
    hero_title = models.CharField(max_length=255, default='Üdvözlünk a Pixi publikus felületén', verbose_name='Főcím')
    hero_subtitle = models.TextField(blank=True, default='Marketing, kalkulátorok és kliens portál egy helyen.', verbose_name='Alcím')
    primary_cta_text = models.CharField(max_length=100, blank=True, default='Kapcsolatfelvétel', verbose_name='Elsődleges CTA szöveg')
    primary_cta_url = models.CharField(max_length=500, blank=True, default='', verbose_name='Elsődleges CTA URL')
    calculators_enabled = models.BooleanField(default=True, verbose_name='Publikus kalkulátorok engedélyezve')
    portal_enabled = models.BooleanField(default=True, verbose_name='Kliens portál engedélyezve')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Publikus oldal beállítás'
        verbose_name_plural = 'Publikus oldal beállítások'
        ordering = ['-is_active', '-updated_at']
        db_table = 'public_site_configs'

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_active:
            PublicSiteConfig.objects.exclude(id=self.id).filter(is_active=True).update(is_active=False)

    def __str__(self):
        return self.name


class ClientPortalUser(models.Model):
    email = models.EmailField(unique=True, db_index=True, verbose_name='E-mail')
    full_name = models.CharField(max_length=255, blank=True, default='', verbose_name='Név')
    password_hash = models.CharField(max_length=255, verbose_name='Jelszó hash')
    company = models.ForeignKey('crm.Company', on_delete=models.SET_NULL, null=True, blank=True, related_name='portal_users', verbose_name='Cég')
    contact = models.ForeignKey('crm.Contact', on_delete=models.SET_NULL, null=True, blank=True, related_name='portal_users', verbose_name='Kapcsolattartó')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    last_login = models.DateTimeField(null=True, blank=True, verbose_name='Utolsó belépés')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Kliens portál felhasználó'
        verbose_name_plural = 'Kliens portál felhasználók'
        ordering = ['email']
        db_table = 'client_portal_users'

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password_hash)

    def __str__(self):
        return self.email


class ClientPortalSession(models.Model):
    user = models.ForeignKey(ClientPortalUser, on_delete=models.CASCADE, related_name='sessions', verbose_name='Portál user')
    token = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True, editable=False)
    expires_at = models.DateTimeField(verbose_name='Lejárat')
    revoked_at = models.DateTimeField(null=True, blank=True, verbose_name='Visszavonva')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Kliens portál session'
        verbose_name_plural = 'Kliens portál sessionök'
        ordering = ['-created_at']
        db_table = 'client_portal_sessions'

    @property
    def is_active(self):
        if self.revoked_at:
            return False
        return timezone.now() < self.expires_at

    def __str__(self):
        return f"{self.user.email} ({self.token})"


class SiteFeature(models.Model):
    code = models.SlugField(max_length=80, unique=True, verbose_name='Kód')
    name = models.CharField(max_length=120, verbose_name='Név')
    description = models.TextField(blank=True, default='', verbose_name='Leírás')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    sort_order = models.PositiveIntegerField(default=0, verbose_name='Sorrend')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Site funkció'
        verbose_name_plural = 'Site funkciók'
        ordering = ['sort_order', 'name']
        db_table = 'site_features'

    def __str__(self):
        return self.name


class SalesSite(models.Model):
    SITE_TYPE_CHOICES = [
        ('marketing', 'Marketing'),
        ('sales', 'Sales'),
        ('portal', 'Portál'),
        ('mixed', 'Vegyes'),
    ]

    name = models.CharField(max_length=150, verbose_name='Oldal neve')
    slug = models.SlugField(max_length=80, unique=True, verbose_name='Slug')
    domains = models.JSONField(default=list, blank=True, verbose_name='Domainek')
    site_type = models.CharField(max_length=20, choices=SITE_TYPE_CHOICES, default='marketing', verbose_name='Típus')
    site_title = models.CharField(max_length=255, blank=True, default='', verbose_name='Oldal cím')
    hero_title = models.CharField(max_length=255, blank=True, default='', verbose_name='Főcím')
    hero_subtitle = models.TextField(blank=True, default='', verbose_name='Alcím')
    calculators_enabled = models.BooleanField(default=True, verbose_name='Kalkulátorok engedélyezve')
    portal_enabled = models.BooleanField(default=True, verbose_name='Portál engedélyezve')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    product_classes = models.ManyToManyField('manufacturing.ProductClass', blank=True, related_name='sales_sites', verbose_name='Termékkategóriák')
    calculators = models.ManyToManyField('manufacturing.CalculatorTemplate', blank=True, related_name='sales_sites', verbose_name='Kalkulátorok')
    features = models.ManyToManyField(SiteFeature, blank=True, related_name='sales_sites', verbose_name='Funkciók')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Sales/Marketing oldal'
        verbose_name_plural = 'Sales/Marketing oldalak'
        ordering = ['name']
        db_table = 'sales_sites'

    def __str__(self):
        return self.name


import os

def storage_upload_path(instance, filename):
    return f'user_storage/{instance.owner_id}/{filename}'


class StorageFolder(models.Model):
    name = models.CharField(max_length=255, verbose_name='Mappa neve')
    parent = models.ForeignKey(
        'self', null=True, blank=True,
        related_name='children', on_delete=models.CASCADE,
        verbose_name='Szülő mappa'
    )
    owner = models.ForeignKey(
        'auth.User', on_delete=models.CASCADE,
        related_name='storage_folders', verbose_name='Tulajdonos'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Tároló mappa'
        verbose_name_plural = 'Tároló mappák'
        ordering = ['name']

    def __str__(self):
        return self.name

    def get_ancestor_ids(self):
        """Return list of ancestor folder IDs (root first)."""
        ids = []
        folder = self
        while folder.parent_id:
            folder = folder.parent
            ids.insert(0, folder.id)
        return ids


class StorageFile(models.Model):
    name = models.CharField(max_length=255, verbose_name='Fájl neve')
    folder = models.ForeignKey(
        StorageFolder, null=True, blank=True,
        related_name='files', on_delete=models.SET_NULL,
        verbose_name='Mappa'
    )
    file = models.FileField(upload_to=storage_upload_path, verbose_name='Fájl')
    alias_of = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.CASCADE,
        related_name='aliases', verbose_name='Eredeti fájl (alias)'
    )
    size = models.BigIntegerField(default=0, verbose_name='Méret (byte)')
    content_type = models.CharField(max_length=255, blank=True, verbose_name='MIME típus')
    owner = models.ForeignKey(
        'auth.User', on_delete=models.CASCADE,
        related_name='storage_files', verbose_name='Tulajdonos'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Tárolt fájl'
        verbose_name_plural = 'Tárolt fájlok'
        ordering = ['name']

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        # Remove physical file on delete only if this is NOT a virtual alias
        if not self.alias_of_id and self.file and hasattr(self.file, 'path'):
            try:
                if os.path.isfile(self.file.path):
                    os.remove(self.file.path)
            except Exception:
                pass
        super().delete(*args, **kwargs)


class StorageShare(models.Model):
    folder = models.ForeignKey(
        StorageFolder, null=True, blank=True,
        related_name='shares', on_delete=models.CASCADE,
        verbose_name='Mappa'
    )
    file = models.ForeignKey(
        StorageFile, null=True, blank=True,
        related_name='shares', on_delete=models.CASCADE,
        verbose_name='Fájl'
    )
    shared_with = models.ForeignKey(
        'auth.User', on_delete=models.CASCADE, null=True, blank=True,
        related_name='storage_shared_with_me',
        verbose_name='Megosztva ezzel (felhasználó)'
    )
    shared_with_department = models.ForeignKey(
        'hr.Department', on_delete=models.CASCADE, null=True, blank=True,
        related_name='storage_shared_with_dept',
        verbose_name='Megosztva ezzel (osztály)'
    )
    shared_by = models.ForeignKey(
        'auth.User', on_delete=models.CASCADE,
        related_name='storage_shared_by_me',
        verbose_name='Megosztotta'
    )
    can_delete = models.BooleanField(default=False, verbose_name='Törölhet')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Tárhely megosztás'
        verbose_name_plural = 'Tárhely megosztások'
        constraints = [
            models.UniqueConstraint(
                fields=['folder', 'shared_with'],
                condition=models.Q(shared_with__isnull=False),
                name='unique_folder_user_share',
            ),
            models.UniqueConstraint(
                fields=['file', 'shared_with'],
                condition=models.Q(shared_with__isnull=False),
                name='unique_file_user_share',
            ),
            models.UniqueConstraint(
                fields=['folder', 'shared_with_department'],
                condition=models.Q(shared_with_department__isnull=False),
                name='unique_folder_dept_share',
            ),
            models.UniqueConstraint(
                fields=['file', 'shared_with_department'],
                condition=models.Q(shared_with_department__isnull=False),
                name='unique_file_dept_share',
            ),
        ]

    def __str__(self):
        target = self.folder or self.file
        recipient = self.shared_with or self.shared_with_department
        return f'{target} → {recipient}'
