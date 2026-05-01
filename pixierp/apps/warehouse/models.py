from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.contrib.auth import get_user_model
from apps.crm.models import Company
import uuid

User = get_user_model()

class MaterialType(models.Model):
    """Alapanyag típus modell"""
    name = models.CharField(max_length=100, verbose_name="Típus neve")
    description = models.TextField(blank=True, verbose_name="Leírás")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    
    class Meta:
        verbose_name = "Alapanyag típus"
        verbose_name_plural = "Alapanyag típusok"
        ordering = ['name']
    
    def __str__(self):
        return self.name


class MaterialGroup(models.Model):
    """Alapanyag gyűjtő/kategória modell
    
    Lehetővé teszi több alapanyag csoportosítását egy gyűjtő név alá.
    Például: 'Épületháló' gyűjtő alatt lehet 270gr, 300gr, stb. változatok.
    """
    name = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="Gyűjtő neve"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Leírás",
        help_text="Opcionális leírás a gyűjtőről"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Aktív"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_material_groups',
        verbose_name="Létrehozta"
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        verbose_name="Szülő kategória"
    )
    
    class Meta:
        verbose_name = "Alapanyag gyűjtő"
        verbose_name_plural = "Alapanyag gyűjtők"
        ordering = ['name']
    
    def get_full_name(self):
        """Recursively builds the full category path."""
        if self.parent:
            return f"{self.parent.get_full_name()} > {self.name}"
        return self.name

    def __str__(self):
        return self.get_full_name()
    
    def get_materials_count(self):
        """Visszaadja a gyűjtőhöz tartozó alapanyagok számát"""
        return self.materials.count()


class Material(models.Model):
    """Alapanyag modell"""
    PRICE_SOURCE_MODE_CHOICES = [
        ('manual', 'Kézi nettó egységár'),
        ('default_version', 'Alapértelmezett árkalkuláció'),
        ('optimal_version', 'Optimális árkalkuláció'),
    ]

    UNIT_CHOICES = [
        ('db', 'db'),
        ('m', 'm'),
        ('m2', 'm²'),
        ('m3', 'm³'),
        ('kg', 'kg'),
        ('liter', 'liter'),
    ]
    
    DIMENSION_UNIT_CHOICES = [
        ('mm', 'mm'),
        ('cm', 'cm'),
        ('m', 'm'),
    ]
    
    DENSITY_UNIT_CHOICES = [
        ('kg/m3', 'kg/m³'),
        ('g/cm3', 'g/cm³'),
        ('kg/liter', 'kg/liter'),
    ]
    
    AREA_WEIGHT_UNIT_CHOICES = [
        ('g/m2', 'g/m²'),
        ('kg/m2', 'kg/m²'),
    ]
    
    WEIGHT_UNIT_CHOICES = [
        ('g', 'g'),
        ('kg', 'kg'),
        ('t', 't'),
    ]
    
    MATERIAL_FORMAT_CHOICES = [
        ('sheet', 'Táblás/Íves'),
        ('roll', 'Tekercses'),
        ('linear', 'Folyóméter alapú'),
        ('piece', 'Darab'),
        ('weight', 'Súly alapú'),
        ('liter', 'Liter alapú'),
    ]
    
    SHEET_DIVISION_CHOICES = [
        ('full', 'Csak egész tábla'),
        ('half', '1/2 és egész'),
        ('third', '1/3, 1/2 és egész'),
    ]
    
    is_material = models.BooleanField(
        default=True,
        verbose_name="Alapanyag",
        help_text="Gyártáshoz használható alapanyag"
    )
    
    is_product = models.BooleanField(
        default=False,
        verbose_name="Termék",
        help_text="Értékesíthető termék"
    )
    
    name = models.CharField(max_length=200, verbose_name="Alapanyag neve")
    code = models.CharField(max_length=50, unique=True, verbose_name="Kód")
    description = models.TextField(blank=True, verbose_name="Leírás")
    material_type = models.ForeignKey(
        MaterialType, 
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name="Típus"
    )
    material_group = models.ForeignKey(
        MaterialGroup,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='materials',
        verbose_name="Alapanyag gyűjtő",
        help_text="Opcionális gyűjtő kategória (pl. Épületháló)"
    )
    unit = models.CharField(
        max_length=20, 
        choices=UNIT_CHOICES,
        default="db", 
        verbose_name="Mértékegység"
    )
    min_stock_level = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Minimum készletszint"
    )
    
    # Fizikai méretek
    width = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Szélesség"
    )
    length = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Hosszúság"
    )
    height = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Magasság"
    )
    dimension_unit = models.CharField(
        max_length=10,
        choices=DIMENSION_UNIT_CHOICES,
        default="mm",
        verbose_name="Méret mértékegység"
    )
    
    # FIX jelölések (méretek rögzítettsége)
    width_fixed = models.BooleanField(
        default=False,
        verbose_name="Szélesség rögzített",
        help_text="Ha be van kapcsolva, a szélesség nem módosítható bevételezéskor"
    )
    length_fixed = models.BooleanField(
        default=False,
        verbose_name="Hosszúság rögzített",
        help_text="Ha be van kapcsolva, a hosszúság nem módosítható bevételezéskor"
    )
    height_fixed = models.BooleanField(
        default=False,
        verbose_name="Magasság rögzített",
        help_text="Ha be van kapcsolva, a magasság nem módosítható bevételezéskor"
    )
    
    # Fajsúly
    density = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Fajsúly"
    )
    density_unit = models.CharField(
        max_length=10,
        choices=DENSITY_UNIT_CHOICES,
        default="kg/m3",
        verbose_name="Fajsúly mértékegység"
    )
    
    # Anyagformátum és kihozatal
    material_format = models.CharField(
        max_length=20,
        choices=MATERIAL_FORMAT_CHOICES,
        default='piece',
        verbose_name="Anyagformátum"
    )
    
    # Tekercses anyagokhoz
    roll_width = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Tekercs szélesség",
        help_text="Tekercses anyag szélessége (cm vagy m)"
    )
    
    # Táblás anyagokhoz
    sheet_division = models.CharField(
        max_length=20,
        choices=SHEET_DIVISION_CHOICES,
        null=True,
        blank=True,
        verbose_name="Tábla oszthatóság",
        help_text="Hogyan osztható a tábla"
    )
    
    # Kihozatal/hulló %
    yield_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100.00,
        validators=[MinValueValidator(0)],
        verbose_name="Kihozatal %",
        help_text="Hány százalék a tényleges kihozatal (pl. 85% = 15% hulló)"
    )
    
    # Terület súly (szélesség x hosszúság súlya)
    area_weight = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Terület súly",
        help_text="Szélesség x hosszúság egységnyi súlya"
    )
    area_weight_unit = models.CharField(
        max_length=10,
        choices=AREA_WEIGHT_UNIT_CHOICES,
        default="g/m2",
        verbose_name="Terület súly mértékegység"
    )
    
    # Fajsúly (térfogat súlya)
    specific_weight = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Fajsúly",
        help_text="Térfogat egységnyi súlya"
    )
    specific_weight_unit = models.CharField(
        max_length=10,
        choices=DENSITY_UNIT_CHOICES,
        default="kg/m3",
        verbose_name="Fajsúly mértékegység"
    )
    
    # Teljes súly
    weight = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Súly",
        help_text="Teljes súly (számított vagy megadott)"
    )
    weight_unit = models.CharField(
        max_length=10,
        choices=WEIGHT_UNIT_CHOICES,
        default="kg",
        verbose_name="Súly mértékegység"
    )
    
    # Liter (liter alapú anyagokhoz)
    volume_liter = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Térfogat (liter)",
        help_text="Liter alapú anyagok térfogata"
    )
    
    # Árazás
    unit_cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár (bekerülési)",
        help_text="Bekerülési ár mértékegységenként"
    )
    
    markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=30.00,
        validators=[MinValueValidator(0)],
        verbose_name="Haszonkulcs %",
        help_text="Haszonkulcs százalékban"
    )
    
    unit_selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár (eladási)",
        help_text="Eladási ár mértékegységenként (számított vagy manuális)"
    )
    
    # ÁFA osztály (reference to invoice app's VATType via UUID)
    vat_type_id = models.UUIDField(
        null=True,
        blank=True,
        verbose_name="ÁFA osztály",
        help_text="Az alapértelmezett ÁFA osztály (PixInvoice VATType UUID)"
    )
    
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")

    price_source_mode = models.CharField(
        max_length=30,
        choices=PRICE_SOURCE_MODE_CHOICES,
        default='manual',
        verbose_name="Ár forrása",
        help_text="Kézi ár, alapértelmezett verzió vagy optimális verzió alapján számolt nettó egységár"
    )
    default_price_calculation_version = models.CharField(
        max_length=100,
        blank=True,
        default='',
        verbose_name="Alapértelmezett árkalkulációs verzió"
    )
    
    # Beszállítók és belső gyártás
    default_supplier = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_supplier': True},
        related_name='default_materials',
        verbose_name="Alapértelmezett beszállító",
        help_text="Ez a beszállító lesz használva a kalkulációban"
    )
    
    is_internal_production = models.BooleanField(
        default=False,
        verbose_name="Belső gyártás",
        help_text="Házon belül gyártjuk"
    )
    
    internal_production_department = models.ForeignKey(
        'hr.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='produced_materials',
        verbose_name="Gyártó osztály",
        help_text="Melyik osztály gyártja"
    )
    
    # Belső gyártás árkalkuláció komponensek
    internal_fixed_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Belső fix költség"
    )
    internal_price_per_unit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Belső egységár"
    )
    internal_price_per_perimeter = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Belső ár kerület alapján"
    )
    internal_price_per_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Belső ár terület alapján"
    )
    internal_price_per_weight = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Belső ár súly alapján"
    )
    internal_price_per_time = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Belső ár idő alapján"
    )
    
    # Deprecated - internal_production_cost már nem használt, komponensek helyettesítik
    internal_production_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Belső gyártási költség (deprecated)",
        help_text="Használd helyette az árkalkulációs komponenseket"
    )
    
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    
    # Opcionális méretek (több érték lehet, JSON array)
    available_widths = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Elérhető szélességek",
        help_text="Opcionális szélességek JSON array formában, pl. [100, 150, 200]"
    )
    available_lengths = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Elérhető hosszúságok",
        help_text="Opcionális hosszúságok JSON array formában"
    )
    available_thicknesses = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Elérhető vastagságok",
        help_text="Opcionális vastagságok JSON array formában"
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    
    class Meta:
        verbose_name = "Alapanyag"
        verbose_name_plural = "Alapanyagok"
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.code})"
    
    def calculate_selling_price(self):
        """Eladási ár számítása bekerülési árból és haszonkulcsból"""
        if self.unit_cost_price:
            self.unit_selling_price = self.unit_cost_price * (1 + self.markup_percentage / 100)
    
    def calculate_markup(self):
        """Haszonkulcs számítása bekerülési és eladási árból"""
        if self.unit_cost_price and self.unit_cost_price > 0 and self.unit_selling_price:
            profit = self.unit_selling_price - self.unit_cost_price
            self.markup_percentage = (profit / self.unit_cost_price) * 100
    
    def save(self, *args, **kwargs):
        # Ha van bekerülési ár és haszonkulcs, de nincs eladási ár, akkor számoljuk
        if self.unit_cost_price and not self.unit_selling_price:
            self.calculate_selling_price()
        super().save(*args, **kwargs)

class Warehouse(models.Model):
    """Raktár modell"""
    name = models.CharField(max_length=100, verbose_name="Raktár neve")
    code = models.CharField(max_length=20, unique=True, verbose_name="Kód")
    address = models.TextField(verbose_name="Cím")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    
    class Meta:
        verbose_name = "Raktár"
        verbose_name_plural = "Raktárak"
        ordering = ['name']
    
    def __str__(self):
        return self.name

class Shelf(models.Model):
    """Polc modell"""
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, verbose_name="Raktár")
    name = models.CharField(max_length=50, verbose_name="Polc neve")
    code = models.CharField(max_length=20, verbose_name="Kód")
    description = models.TextField(blank=True, verbose_name="Leírás")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    
    class Meta:
        verbose_name = "Polc"
        verbose_name_plural = "Polcok"
        ordering = ['warehouse', 'name']
        unique_together = ['warehouse', 'code']
    
    def __str__(self):
        return f"{self.warehouse.name} - {self.name} ({self.code})"

class MaterialSupplier(models.Model):
    """Alapanyag beszállító kapcsolat modell"""
    material = models.ForeignKey(Material, on_delete=models.CASCADE, verbose_name="Alapanyag")
    supplier = models.ForeignKey(Company, on_delete=models.CASCADE, verbose_name="Beszállító")
    supplier_external_id = models.CharField(max_length=100, blank=True, default='', db_index=True, verbose_name="Beszállító külső azonosító")
    supplier_code = models.CharField(max_length=50, blank=True, verbose_name="Beszállító kód")
    unit_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        validators=[MinValueValidator(0)],
        verbose_name="Egységár"
    )
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    is_primary = models.BooleanField(default=False, verbose_name="Elsődleges beszállító")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    
    class Meta:
        verbose_name = "Alapanyag beszállító"
        verbose_name_plural = "Alapanyag beszállítók"
        ordering = ['material', 'supplier']
        unique_together = ['material', 'supplier']
    
    def __str__(self):
        return f"{self.material.name} - {self.supplier.name}"

class Inventory(models.Model):
    """Készlet modell"""
    material = models.ForeignKey(Material, on_delete=models.CASCADE, verbose_name="Alapanyag")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, verbose_name="Raktár")
    shelf = models.ForeignKey(Shelf, on_delete=models.CASCADE, verbose_name="Polc")
    quantity = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Mennyiség"
    )
    last_updated = models.DateTimeField(auto_now=True, verbose_name="Utolsó frissítés")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Frissítette")
    
    class Meta:
        verbose_name = "Készlet"
        verbose_name_plural = "Készletek"
        ordering = ['material', 'warehouse', 'shelf']
        unique_together = ['material', 'warehouse', 'shelf']
    
    def __str__(self):
        return f"{self.material.name} - {self.warehouse.name} - {self.shelf.name}: {self.quantity} {self.material.unit}"
class MaterialCostItem(models.Model):
    """Alapanyag költség elem (beszállítóhoz vagy belső gyártáshoz)"""
    
    CALCULATION_TYPE_CHOICES = [
        ('fixed', 'Fix költség'),
        ('unit', 'Darab alapú'),
        ('length', 'Folyóméter'),
        ('perimeter', 'Kerület'),
        ('area', 'Terület'),
        ('weight', 'Súly'),
        ('time', 'Idő'),
    ]
    
    material = models.ForeignKey(
        Material,
        on_delete=models.CASCADE,
        related_name='cost_items',
        verbose_name="Alapanyag"
    )
    
    supplier = models.ForeignKey(
        'crm.Company',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        limit_choices_to={'is_supplier': True},
        related_name='material_cost_items',
        verbose_name="Beszállító",
        help_text="Null = belső gyártás"
    )

    price_calculation_version = models.CharField(
        max_length=100,
        default='1. verzió',
        blank=True,
        verbose_name="Árkalkulációs verzió",
        help_text="Azonos verziónév alá tartozó költségelemek együtt adnak egy egységárat"
    )
    
    is_internal = models.BooleanField(
        default=False,
        verbose_name="Belső gyártás",
        help_text="Ez a költség elem belső gyártáshoz tartozik"
    )
    
    name = models.CharField(
        max_length=200,
        verbose_name="Megnevezés",
        help_text="pl. Anyagköltség, Munkadíj, stb."
    )
    
    calculation_type = models.CharField(
        max_length=20,
        choices=CALCULATION_TYPE_CHOICES,
        default='unit',
        verbose_name="Számítás típusa"
    )
    
    unit = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Egység",
        help_text="pl. db, kg, m, m², óra"
    )
    
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár",
        help_text="Bekerülési egységár"
    )

    price_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=1,
        validators=[MinValueValidator(0.0001)],
        verbose_name="Ár mennyisége",
        help_text="Az ár hány alapanyag mértékegységre vonatkozik. Pl. 10 db-os csomagolási árnál 10."
    )
    
    markup_percentage = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(10000)],
        verbose_name="Haszon kulcs (%)"
    )
    
    selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Eladási ár",
        help_text="Automatikusan számított"
    )
    
    currency = models.CharField(
        max_length=3,
        default='HUF',
        verbose_name="Pénznem"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Aktív"
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    
    class Meta:
        verbose_name = "Alapanyag költség elem"
        verbose_name_plural = "Alapanyag költség elemek"
        ordering = ['material', 'supplier', 'name']
    
    def __str__(self):
        source = "Belső" if self.is_internal else (self.supplier.name if self.supplier else "Ismeretlen")
        return f"{self.material.name} - {source} - {self.name}"
    
    def save(self, *args, **kwargs):
        # Automatikus eladási ár számítás
        if self.unit_price and self.markup_percentage:
            self.selling_price = self.unit_price * (1 + self.markup_percentage / 100)
        super().save(*args, **kwargs)


class MaterialSize(models.Model):
    """Rendelhető méret variáns az alapanyaghoz"""

    PRICING_TYPE_CHOICES = [
        ('custom', 'Egyedi'),
        ('area', 'Terület alapján'),
        ('weight', 'Súly alapján'),
        ('volume', 'Térfogat alapján'),
    ]

    material = models.ForeignKey(
        Material,
        on_delete=models.CASCADE,
        related_name='sizes',
        verbose_name="Alapanyag"
    )
    name = models.CharField(
        max_length=200, blank=True,
        verbose_name="Megnevezés",
        help_text="Opcionális elnevezés, pl. A4, A3"
    )
    width = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        verbose_name="Szélesség"
    )
    length = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        verbose_name="Hosszúság"
    )
    height = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="Magasság"
    )
    dimension_unit = models.CharField(
        max_length=5, choices=Material.DIMENSION_UNIT_CHOICES,
        default='mm', verbose_name="Mértékegység"
    )
    pricing_type = models.CharField(
        max_length=10, choices=PRICING_TYPE_CHOICES,
        default='custom', verbose_name="Ár típusa"
    )
    custom_price = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        verbose_name="Egyedi ár"
    )
    calculated_price = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        verbose_name="Számított ár"
    )
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    sort_order = models.IntegerField(default=0, verbose_name="Sorrend")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")

    class Meta:
        verbose_name = "Rendelhető méret"
        verbose_name_plural = "Rendelhető méretek"
        ordering = ['material', 'sort_order', 'width', 'length']

    def __str__(self):
        label = self.name or f"{self.width}×{self.length}"
        if self.height:
            label += f"×{self.height}"
        return f"{self.material.name} - {label} {self.dimension_unit}"

    @property
    def effective_price(self):
        if self.pricing_type == 'custom':
            return self.custom_price
        return self.calculated_price

    def save(self, *args, **kwargs):
        if self.pricing_type != 'custom':
            self._calculate_price()
        else:
            self.calculated_price = self.custom_price
        super().save(*args, **kwargs)

    def _calculate_price(self):
        """Ár arányosítás az eredeti mérethez képest."""
        mat = self.material
        base_price = mat.unit_selling_price or 0
        if not base_price:
            self.calculated_price = 0
            return

        if self.pricing_type == 'area':
            orig_area = (mat.width or 0) * (mat.length or 0)
            new_area = self.width * self.length
            ratio = (new_area / orig_area) if orig_area else 0
        elif self.pricing_type == 'weight':
            # weight ∝ volume (w × l × h)
            orig_vol = (mat.width or 0) * (mat.length or 0) * (mat.height or 1)
            new_h = self.height or (mat.height or 1)
            new_vol = self.width * self.length * new_h
            ratio = (new_vol / orig_vol) if orig_vol else 0
        elif self.pricing_type == 'volume':
            orig_vol = (mat.width or 0) * (mat.length or 0) * (mat.height or 1)
            new_h = self.height or (mat.height or 1)
            new_vol = self.width * self.length * new_h
            ratio = (new_vol / orig_vol) if orig_vol else 0
        else:
            ratio = 1

        from decimal import Decimal
        self.calculated_price = round(base_price * Decimal(str(ratio)), 2)


class MaterialStock(models.Model):
    """Készlet nyilvántartás alapanyagokhoz"""
    material = models.ForeignKey(
        Material,
        on_delete=models.CASCADE,
        related_name='stocks',
        verbose_name="Alapanyag"
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='material_stocks',
        verbose_name="Raktár"
    )
    
    # Mennyiség
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Mennyiség"
    )
    
    # Méretek (ha bontott egység)
    width = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Szélesség"
    )
    length = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Hosszúság"
    )
    thickness = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Vastagság"
    )
    dimension_unit = models.CharField(
        max_length=10,
        default="mm",
        verbose_name="Méret mértékegység"
    )
    
    # Értékelés
    unit_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységérték",
        help_text="Bevételezés szerinti egységár"
    )
    total_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Teljes érték",
        help_text="Mennyiség × egységérték"
    )
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")

    # Felhasznált hosszúság (gyártásból automatikusan töltve – később)
    used_length = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Felhasznált hosszúság"
    )

    # Státusz
    STATUS_CHOICES = [
        ('normal', 'Normál'),
        ('defective', 'Hibás'),
        ('scrapped', 'Selejtezett'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='normal',
        verbose_name="Státusz"
    )
    
    # Hivatkozás a bevételezésre
    receipt = models.ForeignKey(
        'MaterialReceipt',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_items',
        verbose_name="Bevételezés"
    )
    
    # Meta adatok
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Létrehozta"
    )
    
    class Meta:
        verbose_name = "Készlet"
        verbose_name_plural = "Készletek"
        ordering = ['material', 'warehouse', '-created_at']
    
    def __str__(self):
        dimensions = ""
        if self.width and self.length:
            dimensions = f" ({self.width}×{self.length}"
            if self.thickness:
                dimensions += f"×{self.thickness}"
            dimensions += f" {self.dimension_unit})"
        return f"{self.material.name} - {self.warehouse.name}: {self.quantity} {self.material.unit}{dimensions}"
    
    def save(self, *args, **kwargs):
        # Automatikus teljes érték számítás
        self.total_value = self.quantity * self.unit_value
        super().save(*args, **kwargs)


class MaterialReceipt(models.Model):
    """Alapanyag bevételezés"""
    material = models.ForeignKey(
        Material,
        on_delete=models.CASCADE,
        related_name='receipts',
        verbose_name="Alapanyag"
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='material_receipts',
        verbose_name="Raktár"
    )
    supplier = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_supplier': True},
        related_name='material_receipts',
        verbose_name="Beszállító"
    )
    
    # Bevételezés adatai
    receipt_date = models.DateField(verbose_name="Bevételezés dátuma")
    invoice_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Számla szám"
    )
    invoice_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Számla érték"
    )
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    
    # Mennyiség és ár
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Mennyiség"
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár"
    )
    
    # Méretek (opcionális, ha konkrét mérettel érkezik)
    width = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Szélesség"
    )
    length = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Hosszúság"
    )
    thickness = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Vastagság"
    )
    dimension_unit = models.CharField(
        max_length=10,
        default="mm",
        verbose_name="Méret mértékegység"
    )
    
    # Megjegyzés
    notes = models.TextField(blank=True, verbose_name="Megjegyzés")
    
    # Meta adatok
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Rögzítve")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Rögzítette"
    )
    
    class Meta:
        verbose_name = "Bevételezés"
        verbose_name_plural = "Bevételezések"
        ordering = ['-receipt_date', '-created_at']
    
    def __str__(self):
        supplier_name = self.supplier.name if self.supplier else "Ismeretlen"
        return f"{self.material.name} - {supplier_name} - {self.receipt_date}"
    
    def save(self, *args, **kwargs):
        # Mentés előtt
        is_new = self.pk is None
        super().save(*args, **kwargs)
        
        # Ha új bevételezés, készlet létrehozása
        if is_new:
            MaterialStock.objects.create(
                material=self.material,
                warehouse=self.warehouse,
                quantity=self.quantity,
                width=self.width,
                length=self.length,
                thickness=self.thickness,
                dimension_unit=self.dimension_unit,
                unit_value=self.unit_price,
                total_value=self.quantity * self.unit_price,
                currency=self.currency,
                receipt=self,
                created_by=self.created_by
            )


class StockMovement(models.Model):
    """Készlet mozgás (raktárak között vagy selejtezés)"""
    MOVEMENT_TYPE_CHOICES = [
        ('transfer', 'Mozgatás'),
        ('scrap', 'Selejtezés'),
        ('mark_defective', 'Hibásnak jelölés'),
    ]
    
    stock = models.ForeignKey(
        MaterialStock,
        on_delete=models.CASCADE,
        related_name='movements',
        verbose_name="Készlet"
    )
    movement_type = models.CharField(
        max_length=20,
        choices=MOVEMENT_TYPE_CHOICES,
        verbose_name="Művelet típusa"
    )
    
    # Mozgatás esetén
    from_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='outgoing_movements',
        verbose_name="Honnan"
    )
    to_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='incoming_movements',
        verbose_name="Hova"
    )
    
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(0)],
        verbose_name="Mennyiség"
    )
    
    notes = models.TextField(blank=True, verbose_name="Megjegyzés")
    
    # Meta adatok
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Dátum")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Végrehajtotta"
    )
    
    class Meta:
        verbose_name = "Készlet mozgás"
        verbose_name_plural = "Készlet mozgások"
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_movement_type_display()} - {self.stock.material.name} - {self.created_at.strftime('%Y-%m-%d')}"


class ScrapRecord(models.Model):
    """Selejtezési jegyzőkönyv"""
    
    # Selejtezés alapadatok
    scrap_date = models.DateField(verbose_name="Selejtezés dátuma")
    scrap_number = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="Selejtezési szám",
        help_text="Automatikusan generált egyedi azonosító"
    )
    
    # Indoklás és dokumentáció
    reason = models.TextField(verbose_name="Selejtezés indoka")
    images = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Fotók",
        help_text="Selejtezett termékekről készült fotók fájlnevei JSON array formában"
    )
    
    # Pénzügyi összesítés
    total_cost_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Beszerzési érték összesen",
        help_text="Selejtezett termékek bekerülési értéke"
    )
    total_selling_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Eladási érték összesen",
        help_text="Selejtezett termékek eladási értéke"
    )
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    
    # Státusz
    is_approved = models.BooleanField(
        default=False,
        verbose_name="Jóváhagyva",
        help_text="Vezető vagy felelős jóváhagyta a selejtezést"
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_scraps',
        verbose_name="Jóváhagyta"
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Jóváhagyás dátuma"
    )
    
    # Meta adatok
    notes = models.TextField(blank=True, verbose_name="Egyéb megjegyzés")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Rögzítve")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_scraps',
        verbose_name="Rögzítette"
    )
    
    class Meta:
        verbose_name = "Selejtezési jegyzőkönyv"
        verbose_name_plural = "Selejtezési jegyzőkönyvek"
        ordering = ['-scrap_date', '-created_at']
    
    def __str__(self):
        return f"{self.scrap_number} - {self.scrap_date}"
    
    def save(self, *args, **kwargs):
        # Automatikus selejtezési szám generálás
        if not self.scrap_number:
            from django.utils import timezone
            date_str = timezone.now().strftime('%Y%m%d')
            last_scrap = ScrapRecord.objects.filter(
                scrap_number__startswith=f'SEL-{date_str}'
            ).order_by('-scrap_number').first()
            
            if last_scrap:
                last_num = int(last_scrap.scrap_number.split('-')[-1])
                new_num = last_num + 1
            else:
                new_num = 1
            
            self.scrap_number = f'SEL-{date_str}-{new_num:04d}'
        
        super().save(*args, **kwargs)


class ScrapItem(models.Model):
    """Selejtezett tétel"""
    
    scrap_record = models.ForeignKey(
        ScrapRecord,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Selejtezési jegyzőkönyv"
    )
    stock = models.ForeignKey(
        MaterialStock,
        on_delete=models.CASCADE,
        related_name='scrap_items',
        verbose_name="Készlet"
    )
    material = models.ForeignKey(
        Material,
        on_delete=models.CASCADE,
        related_name='scrap_items',
        verbose_name="Alapanyag"
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='scrap_items',
        verbose_name="Raktár"
    )
    
    # Selejtezett mennyiség
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(0)],
        verbose_name="Mennyiség"
    )
    
    # Méretek (ha van)
    width = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Szélesség"
    )
    length = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Hosszúság"
    )
    thickness = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Vastagság"
    )
    dimension_unit = models.CharField(
        max_length=10,
        default="mm",
        verbose_name="Méret mértékegység"
    )
    
    # Értékek
    unit_cost_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egység bekerülési érték"
    )
    unit_selling_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egység eladási érték"
    )
    total_cost_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Teljes bekerülési érték"
    )
    total_selling_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Teljes eladási érték"
    )
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    
    # Meta
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    
    class Meta:
        verbose_name = "Selejtezett tétel"
        verbose_name_plural = "Selejtezett tételek"
        ordering = ['scrap_record', 'id']
    
    def save(self, *args, **kwargs):
        # Számoljuk ki az értékeket
        self.total_cost_value = self.quantity * self.unit_cost_value
        self.total_selling_value = self.quantity * self.unit_selling_value
        
        super().save(*args, **kwargs)
        
        # Frissítsük a jegyzőkönyv összértékeit
        self.scrap_record.update_totals()
    
    def __str__(self):
        return f"{self.scrap_record.scrap_number} - {self.material.name} - {self.quantity}"


# Adjuk hozzá az update_totals metódust a ScrapRecord-hoz
def update_totals(self):
    """Frissíti a selejtezési jegyzőkönyv összértékeit"""
    items = self.items.all()
    self.total_cost_value = sum(item.total_cost_value for item in items)
    self.total_selling_value = sum(item.total_selling_value for item in items)
    ScrapRecord.objects.filter(pk=self.pk).update(
        total_cost_value=self.total_cost_value,
        total_selling_value=self.total_selling_value
    )

ScrapRecord.update_totals = update_totals


class SupplierInvoice(models.Model):
    """Beszállítói számla"""
    
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Készpénz'),
        ('transfer', 'Átutalás'),
        ('card', 'Bankkártya'),
        ('credit', 'Halasztott fizetés'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Piszkozat'),
        ('confirmed', 'Megerősített'),
        ('received', 'Bevételezve'),
        ('paid', 'Kifizetve'),
        ('cancelled', 'Törölve'),
    ]
    
    # Számla alapadatok
    invoice_number = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="Számla szám"
    )
    supplier = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        limit_choices_to={'is_supplier': True},
        related_name='supplier_invoices',
        verbose_name="Beszállító"
    )
    
    # Dátumok
    invoice_date = models.DateField(verbose_name="Számla kelte")
    fulfillment_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Teljesítési dátum (NAV)",
        help_text="A számlán feltüntetett teljesítési dátum"
    )
    receipt_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Bevételezés dátuma"
    )
    due_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Fizetési határidő"
    )
    payment_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Fizetés dátuma"
    )
    
    # Pénzügyi adatok
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='transfer',
        verbose_name="Fizetési mód"
    )
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Végösszeg"
    )
    
    # Státusz
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="Státusz"
    )
    
    # Számla kép(ek)
    invoice_images = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Számla képek",
        help_text="Számla kép fájlnevek JSON array formában"
    )
    
    # Meta adatok
    notes = models.TextField(blank=True, verbose_name="Megjegyzés")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_invoices',
        verbose_name="Rögzítette"
    )
    
    class Meta:
        verbose_name = "Beszállítói számla"
        verbose_name_plural = "Beszállítói számlák"
        ordering = ['-invoice_date', '-created_at']
    
    def __str__(self):
        return f"{self.invoice_number} - {self.supplier.name} - {self.total_amount} {self.currency}"


class InvoiceItem(models.Model):
    """Számla tétel (bevételezett termék/anyag)"""
    
    invoice = models.ForeignKey(
        SupplierInvoice,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Számla"
    )
    material = models.ForeignKey(
        Material,
        on_delete=models.PROTECT,
        related_name='invoice_items',
        verbose_name="Alapanyag"
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='invoice_items',
        verbose_name="Raktár"
    )
    
    # Mennyiség és ár
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(0)],
        verbose_name="Mennyiség"
    )
    unit = models.CharField(
        max_length=20,
        default="db",
        verbose_name="Mennyiségi egység",
        help_text="pl. db, kg, m, m2, nm, l, stb."
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár"
    )
    total_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Összesen"
    )
    
    # Méretek (ha van)
    width = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Szélesség"
    )
    length = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Hosszúság"
    )
    thickness = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Vastagság"
    )
    dimension_unit = models.CharField(
        max_length=10,
        default="mm",
        verbose_name="Méret mértékegység"
    )
    
    # Meta
    notes = models.TextField(blank=True, verbose_name="Megjegyzés")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    
    class Meta:
        verbose_name = "Számla tétel"
        verbose_name_plural = "Számla tételek"
        ordering = ['invoice', 'id']
    
    def save(self, *args, **kwargs):
        # Számoljuk ki a total_price-t
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.material.name} - {self.quantity}"
