from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator


# User model is handled by Django's built-in User model


class Company(models.Model):
    """Company information"""
    name = models.CharField(max_length=200)
    tax_number = models.CharField(max_length=20, unique=True)
    address = models.TextField()
    phone = models.CharField(max_length=20)
    email = models.EmailField()
    website = models.URLField(blank=True, null=True)
    logo = models.ImageField(upload_to='company/logos/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Companies"
        db_table = 'companies'

    def __str__(self):
        return self.name


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


class EmailTemplate(models.Model):
    """E-mail sablon (pl. ajánlat kiküldés)"""
    key = models.SlugField(max_length=100, unique=True)
    name = models.CharField(max_length=150)
    subject_template = models.TextField()
    body_template = models.TextField(help_text='HTML vagy szöveges sablon')
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


class PixinvoiceConfig(models.Model):
    """PIXINVOICE API konfiguráció (NAV lekérdezés, ügyfél szinkron, számlázás)"""
    name = models.CharField(max_length=100, default='Alapértelmezett')
    base_url = models.URLField(default='http://localhost:4001/api/')
    api_key = models.CharField(max_length=255, blank=True, default='')
    company_id = models.CharField(max_length=64, blank=True, default='')
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