from django.db import models
from django.core.validators import MinValueValidator
from django.contrib.auth import get_user_model
from apps.crm.models import Company

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

class Material(models.Model):
    """Alapanyag modell"""
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
    
    name = models.CharField(max_length=200, verbose_name="Alapanyag neve")
    code = models.CharField(max_length=50, unique=True, verbose_name="Kód")
    description = models.TextField(blank=True, verbose_name="Leírás")
    material_type = models.ForeignKey(
        MaterialType, 
        on_delete=models.CASCADE, 
        verbose_name="Típus"
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
    
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    
    class Meta:
        verbose_name = "Alapanyag"
        verbose_name_plural = "Alapanyagok"
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.code})"

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

class MaterialReceipt(models.Model):
    """Alapanyag bevételezés modell"""
    RECEIPT_STATUS_CHOICES = [
        ('pending', 'Függőben'),
        ('received', 'Bevételezve'),
        ('cancelled', 'Törölve'),
    ]
    
    receipt_number = models.CharField(max_length=50, unique=True, verbose_name="Bevételezési szám")
    material = models.ForeignKey(Material, on_delete=models.CASCADE, verbose_name="Alapanyag")
    supplier = models.ForeignKey(Company, on_delete=models.CASCADE, verbose_name="Beszállító")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, verbose_name="Raktár")
    shelf = models.ForeignKey(Shelf, on_delete=models.CASCADE, verbose_name="Polc")
    quantity = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Mennyiség"
    )
    unit_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár"
    )
    total_price = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Összes ár"
    )
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    status = models.CharField(
        max_length=20, 
        choices=RECEIPT_STATUS_CHOICES, 
        default='pending',
        verbose_name="Státusz"
    )
    receipt_date = models.DateTimeField(verbose_name="Bevételezés dátuma")
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    
    class Meta:
        verbose_name = "Alapanyag bevételezés"
        verbose_name_plural = "Alapanyag bevételezések"
        ordering = ['-receipt_date']
    
    def __str__(self):
        return f"{self.receipt_number} - {self.material.name} - {self.quantity} {self.material.unit}"
    
    def save(self, *args, **kwargs):
        # Automatikusan számítsuk ki az összes árat
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)
