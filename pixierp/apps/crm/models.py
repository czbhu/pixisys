from django.db import models
from django.core.validators import RegexValidator
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

User = get_user_model()

def validate_hungarian_tax_number(value):
    """Magyar adószám validátor"""
    if value and not RegexValidator(regex=r'^\d{8}-\d{1}-\d{2}$')(value) is None:
        raise ValidationError('Magyar adószám formátuma: 12345678-1-41')

def validate_group_tax_number(value):
    """Csoport adószám validátor"""
    if value and not RegexValidator(regex=r'^\d{8}-\d{1}-12$')(value) is None:
        raise ValidationError('Csoport adószám formátuma: 12345678-1-12')

def validate_eu_tax_number(value):
    """EU adószám validátor"""
    if value and not RegexValidator(regex=r'^[A-Z]{2}\d{8,10}$')(value) is None:
        raise ValidationError('EU adószám formátuma: HU11956541')

class Company(models.Model):
    """Cég modell"""
    
    name = models.CharField(max_length=200, verbose_name="Cégnév")
    short_name = models.CharField(max_length=100, blank=True, default='', verbose_name="Rövid név")
    
    # Többszörös szerep támogatás
    is_customer = models.BooleanField(default=True, verbose_name="Ügyfél")
    is_supplier = models.BooleanField(default=False, verbose_name="Beszállító")
    
    PAYMENT_METHOD_CHOICES = [
        ('CASH', 'Készpénz'),
        ('TRANSFER', 'Átutalás')
    ]
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='CASH', verbose_name="Fizetési mód")
    
    external_id = models.CharField(max_length=100, unique=True, null=True, blank=True, verbose_name="Külső azonosító (PixInvoice UUID)")

    # Adószám mezők - egyik sem kötelező
    # Validators removed from model to allow conditional validation in Serializer/Form
    tax_number = models.CharField(
        max_length=20, 
        blank=True,
        null=True,
        verbose_name="Adószám",
        help_text="Magyar adószám: 12345678-1-41"
    )
    full_tax_number = models.CharField(max_length=50, blank=True, default='', verbose_name="Teljes adószám")
    vat_code = models.CharField(max_length=10, blank=True, default='', verbose_name="ÁFA kód")
    county_code = models.CharField(max_length=10, blank=True, default='', verbose_name="Megye kód")
    
    VAT_STATUS_CHOICES = [
        ('DOMESTIC', 'Magyar adószámos'),
        ('PRIVATE_PERSON', 'Magánszemély'),
        ('OTHER', 'Egyéb')
    ]
    vat_status = models.CharField(max_length=20, choices=VAT_STATUS_CHOICES, default='DOMESTIC', verbose_name="Vevő adóalanyisága")
    is_hungarian_taxpayer = models.BooleanField(default=True, verbose_name="Magyar adóalany")
    
    group_tax_number = models.CharField(
        max_length=20, 
        blank=True, 
        null=True, 
        verbose_name="Csoport adószám",
        help_text="Csoport adószám: 12345678-1-12"
    )
    group_tax_number = models.CharField(
        max_length=20, 
        blank=True,
        null=True,
        verbose_name="Csoport adószám",
        validators=[validate_group_tax_number],
        help_text="Csoport adószám: 12345678-1-12"
    )
    eu_tax_number = models.CharField(
        max_length=20, 
        blank=True,
        null=True,
        verbose_name="EU adószám",
        validators=[validate_eu_tax_number],
        help_text="EU adószám: HU11956541"
    )
    vat_group_id = models.CharField(max_length=50, blank=True, default='', verbose_name="ÁFA csoport azonosító")
    vat_group_member_tax_number = models.CharField(max_length=20, blank=True, default='', verbose_name="ÁFA csoport tag adószám")
    
    country = models.CharField(max_length=100, default="Magyarország", verbose_name="Ország")
    
    # Magyarország esetén részletes cím
    postal_code = models.CharField(max_length=10, blank=True, verbose_name="Irányítószám")
    city = models.CharField(max_length=100, blank=True, verbose_name="Város")
    street_name = models.CharField(max_length=200, blank=True, verbose_name="Közterület neve")
    street_type = models.CharField(max_length=50, blank=True, verbose_name="Közterület típusa", default="utca")
    house_number = models.CharField(max_length=20, blank=True, verbose_name="Házszám")
    public_place_category = models.CharField(max_length=50, blank=True, default='', verbose_name="Közterület jellege")
    street_number = models.CharField(max_length=20, blank=True, default='', verbose_name="Közterület szám")
    building = models.CharField(max_length=50, blank=True, default='', verbose_name="Épület")
    staircase = models.CharField(max_length=20, blank=True, default='', verbose_name="Lépcsőház")
    floor = models.CharField(max_length=10, blank=True, default='', verbose_name="Emelet")
    door = models.CharField(max_length=10, blank=True, default='', verbose_name="Ajtó")
    
    # Nem magyarország esetén egyszerű cím
    address = models.TextField(blank=True, verbose_name="Cím")
    email = models.EmailField(blank=True, null=True, verbose_name="E-mail")
    phone = models.CharField(max_length=20, blank=True, default='', verbose_name="Telefon")
    
    # Meta adatok
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    
    class Meta:
        verbose_name = "Cég"
        verbose_name_plural = "Cégek"
        ordering = ['name']
    
    def __str__(self):
        # Első nem üres adószám megjelenítése
        tax_display = self.tax_number or self.group_tax_number or self.eu_tax_number or "Nincs adószám"
        return f"{self.name} ({tax_display})"
    
    @property
    def is_hungary(self):
        """Magyarország-e az ország"""
        return self.country == "Magyarország"
    
    @property
    def full_address(self):
        """Teljes cím formázása"""
        if self.is_hungary:
            if self.postal_code and self.city and self.street_name:
                house = self.house_number or self.street_number or ''
                plc = self.public_place_category or self.street_type
                extra = " ".join([self.building, self.staircase, self.floor, self.door]).strip()
                house_part = f" {house}" if house else ""
                base = f"{self.postal_code} {self.city}, {self.street_name} {plc}{house_part}".strip()
                return f"{base} {extra}".strip()
            return self.address or ""
        else:
            return self.address or ""
    
    def clean(self):
        """Modell validáció"""
        super().clean()
        
        # Legalább egy adószám megadva legyen
        if not any([self.tax_number, self.group_tax_number, self.eu_tax_number]):
            raise ValidationError("Legalább egy adószám megadása kötelező.")
        
        # Magyarország esetén részletes cím kötelező
        if self.is_hungary:
            if not all([self.postal_code, self.city, self.street_name]):
                raise ValidationError("Magyarország esetén irányítószám, város és közterület neve kötelező.")
        
        # Nem magyarország esetén egyszerű cím kötelező
        else:
            if not self.address:
                raise ValidationError("Nem magyarország esetén cím megadása kötelező.")

class Contact(models.Model):
    """Kapcsolattartó modell"""
    last_name = models.CharField(max_length=50, verbose_name="Vezetéknév", default="")
    first_name = models.CharField(max_length=50, verbose_name="Keresztnév", default="")
    name = models.CharField(max_length=100, verbose_name="Teljes név", blank=True)
    phone = models.CharField(
        max_length=20, 
        blank=True,
        null=True,
        verbose_name="Telefonszám",
        validators=[RegexValidator(
            regex=r'^(\+36|06)?[0-9]{1,2}[0-9]{7,8}$',
            message='Érvényes magyar telefonszám formátum'
        )]
    )
    email = models.EmailField(blank=True, null=True, verbose_name="E-mail cím")
    company = models.ForeignKey(
        Company, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        verbose_name="Cég"
    )
    position = models.CharField(max_length=100, blank=True, verbose_name="Pozíció")
    is_receipt = models.BooleanField(default=False, verbose_name="Nyugtás")
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    external_id = models.CharField(max_length=100, blank=True, default='', db_index=True, verbose_name="Külső azonosító")
    
    # Meta adatok
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    
    class Meta:
        verbose_name = "Kapcsolattartó"
        verbose_name_plural = "Kapcsolattartók"
        ordering = ['name']
    
    def save(self, *args, **kwargs):
        self.name = f"{self.last_name} {self.first_name}".strip()
        super().save(*args, **kwargs)

    def __str__(self):
        company_name = f" ({self.company.name})" if self.company else ""
        return f"{self.name}{company_name}"
