from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator
from apps.core.models import Company, Currency
from apps.sales.models import Order, OrderItem, Product
from apps.crm.models import Contact
from apps.hr.models import Department
from apps.warehouse.models import Material
from django.utils import timezone
import json

User = get_user_model()

class WorkOrder(models.Model):
    """Munkalap"""
    STATUS_CHOICES = [
        ('draft', 'Vázlat'),
        ('planned', 'Tervezett'),
        ('in_progress', 'Folyamatban'),
        ('completed', 'Kész'),
        ('cancelled', 'Törölve'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Alacsony'),
        ('normal', 'Normál'),
        ('high', 'Magas'),
        ('urgent', 'Sürgős'),
    ]
    
    order = models.ForeignKey(Order, on_delete=models.CASCADE, verbose_name="Megrendelés")
    work_order_number = models.CharField(max_length=50, unique=True, verbose_name="Munkalap szám")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', verbose_name="Státusz")
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal', verbose_name="Prioritás")
    planned_start_date = models.DateTimeField(verbose_name="Tervezett kezdés")
    planned_end_date = models.DateTimeField(verbose_name="Tervezett befejezés")
    actual_start_date = models.DateTimeField(null=True, blank=True, verbose_name="Tényleges kezdés")
    actual_end_date = models.DateTimeField(null=True, blank=True, verbose_name="Tényleges befejezés")
    assigned_to = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, verbose_name="Felelős")
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_work_orders', verbose_name="Készítette")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Munkalap"
        verbose_name_plural = "Munkalapok"

    def __str__(self):
        return f"{self.work_order_number} - {self.order.order_number}"

class WorkOrderItem(models.Model):
    """Munkalap tételek"""
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name='items', verbose_name="Munkalap")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Termék")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    description = models.TextField(blank=True, verbose_name="Leírás")
    status = models.CharField(max_length=20, choices=WorkOrder.STATUS_CHOICES, default='draft', verbose_name="Státusz")

    class Meta:
        verbose_name = "Munkalap tétel"
        verbose_name_plural = "Munkalap tételek"

class DesignPhase(models.Model):
    """Tervezési fázis"""
    STATUS_CHOICES = [
        ('assigned', 'Kiosztva'),
        ('in_progress', 'Folyamatban'),
        ('completed', 'Kész'),
        ('approved', 'Jóváhagyva'),
        ('rejected', 'Elutasítva'),
        ('revision', 'Átnézésre küldve'),
    ]
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, verbose_name="Munkalap")
    assigned_to = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Tervező")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='assigned', verbose_name="Státusz")
    description = models.TextField(verbose_name="Tervezési feladat")
    deadline = models.DateTimeField(verbose_name="Határidő")
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="Befejezve")
    approved_by = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='approved_designs', verbose_name="Jóváhagyta")
    approved_at = models.DateTimeField(null=True, blank=True, verbose_name="Jóváhagyva")
    rejection_reason = models.TextField(blank=True, verbose_name="Elutasítás oka")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Tervezési fázis"
        verbose_name_plural = "Tervezési fázisok"

    def __str__(self):
        return f"Tervezés - {self.work_order.work_order_number}"

class ProductionPhase(models.Model):
    """Gyártási fázis"""
    STATUS_CHOICES = [
        ('assigned', 'Kiosztva'),
        ('in_progress', 'Folyamatban'),
        ('completed', 'Kész'),
        ('approved', 'Jóváhagyva'),
        ('rejected', 'Elutasítva'),
        ('revision', 'Átnézésre küldve'),
    ]
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, verbose_name="Munkalap")
    assigned_to = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Gyártó")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='assigned', verbose_name="Státusz")
    description = models.TextField(verbose_name="Gyártási feladat")
    deadline = models.DateTimeField(verbose_name="Határidő")
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="Befejezve")
    approved_by = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='approved_productions', verbose_name="Jóváhagyta")
    approved_at = models.DateTimeField(null=True, blank=True, verbose_name="Jóváhagyva")
    rejection_reason = models.TextField(blank=True, verbose_name="Elutasítás oka")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Gyártási fázis"
        verbose_name_plural = "Gyártási fázisok"

    def __str__(self):
        return f"Gyártás - {self.work_order.work_order_number}"

class Inventory(models.Model):
    """Készlet"""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Termék")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    location = models.CharField(max_length=100, verbose_name="Hely")
    min_stock = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Minimum készlet")
    max_stock = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Maximum készlet")
    last_updated = models.DateTimeField(auto_now=True, verbose_name="Utolsó frissítés")

    class Meta:
        verbose_name = "Készlet"
        verbose_name_plural = "Készletek"

    def __str__(self):
        return f"{self.product.name} - {self.quantity} {self.product.unit}"

class InventoryTransaction(models.Model):
    """Készlet mozgás"""
    TRANSACTION_TYPES = [
        ('in', 'Bevételezés'),
        ('out', 'Kiadás'),
        ('adjustment', 'Korrekció'),
        ('transfer', 'Áthelyezés'),
    ]
    
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Termék")
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES, verbose_name="Mozgás típusa")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    reference = models.CharField(max_length=100, blank=True, verbose_name="Hivatkozás")
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Készítette")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Dátum")

    class Meta:
        verbose_name = "Készlet mozgás"
        verbose_name_plural = "Készlet mozgások"

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.product.name} - {self.quantity}"

class QualityControl(models.Model):
    """Minőségbiztosítás"""
    STATUS_CHOICES = [
        ('pending', 'Függőben'),
        ('passed', 'Megfelelő'),
        ('failed', 'Nem megfelelő'),
        ('rework', 'Újramunka'),
    ]
    
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, verbose_name="Munkalap")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Termék")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', verbose_name="Státusz")
    inspector = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Ellenőr")
    inspection_date = models.DateTimeField(verbose_name="Ellenőrzés dátuma")
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Minőségbiztosítás"
        verbose_name_plural = "Minőségbiztosítások"

    def __str__(self):
        return f"QC - {self.work_order.work_order_number} - {self.product.name}"

class BOM(models.Model):
    """Anyagjegyzék (Bill of Materials)"""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='bom_items', verbose_name="Termék")
    component = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='used_in_bom', verbose_name="Komponens")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    unit = models.CharField(max_length=20, verbose_name="Mértékegység")
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Anyagjegyzék"
        verbose_name_plural = "Anyagjegyzékek"
        unique_together = ['product', 'component']

    def __str__(self):
        return f"{self.product.name} -> {self.component.name} ({self.quantity})"

# Régi modelljeinket is megtartjuk kompatibilitás miatt
class Quality(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    test_name = models.CharField(max_length=200)
    result = models.CharField(max_length=50)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


# Új modellek a kért specifikációk szerint

class ProductClass(models.Model):
    """Termék osztály"""
    name = models.CharField(max_length=100, verbose_name="Név")
    is_default = models.BooleanField(default=False, verbose_name="Alapértelmezett")
    calculators = models.JSONField(default=list, blank=True, verbose_name="Kalkulátorok")
    hr_departments = models.ManyToManyField(Department, blank=True, verbose_name="HR osztályok")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Termék osztály"
        verbose_name_plural = "Termék osztályok"

    def __str__(self):
        return self.name


class Project(models.Model):
    """Projekt"""
    STATUS_CHOICES = [
        ('open', 'Nyitott'),
        ('closed', 'Zárt'),
    ]
    
    name = models.CharField(max_length=200, verbose_name="Név")
    description = models.TextField(blank=True, verbose_name="Leírás")
    deadline = models.DateField(verbose_name="Határidő")
    contacts = models.ManyToManyField(Contact, blank=True, verbose_name="Kapcsolattartók")
    project_manager = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, 
                                      limit_choices_to={'is_staff': True}, verbose_name="Projektvezető")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open', verbose_name="Állapot")
    
    # Pénzügyi adatok
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Összesített bevétel")
    total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Összesített költség")
    profit = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Profit")
    profit_margin_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name="Profitarány (%)")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Projekt"
        verbose_name_plural = "Projektek"

    def __str__(self):
        return self.name
    
    def calculate_profit(self):
        """Profit számítása"""
        self.profit = self.total_revenue - self.total_cost
        if self.total_revenue > 0:
            self.profit_margin_percentage = (self.profit / self.total_revenue) * 100
        else:
            self.profit_margin_percentage = 0
        self.save()


class ManufacturingProduct(models.Model):
    """Gyártási termék"""
    STATUS_CHOICES = [
        ('quote_request_open', 'Ajánlatkérés nyitott'),
        ('quote_request_priced', 'Ajánlatkérés árazott'),
        ('quote_request_sent', 'Ajánlatkérés kiküldött'),
        ('ordered', 'Megrendelve'),
        ('design_in_progress', 'Tervezés alatt'),
        ('design_approved', 'Tervezés jóváhagyva'),
        ('production_in_progress', 'Gyártás alatt'),
        ('production_completed', 'Gyártás kész'),
        ('finished_goods_warehouse', 'Készárú raktárban'),
        ('installation_in_progress', 'Kihelyezés alatt'),
        ('delivered', 'Kiszállítva'),
        ('invoiced', 'Számlázva'),
        ('paid', 'Kifizetve'),
    ]
    
    date = models.DateField(default=timezone.now, verbose_name="Dátum")
    name = models.CharField(max_length=200, verbose_name="Név")
    description = models.TextField(blank=True, verbose_name="Leírás")
    internal_description = models.TextField(blank=True, verbose_name="Belső leírás")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    quantity_unit = models.CharField(max_length=20, default='db', verbose_name="Mennyiségi egység")
    product_class = models.ForeignKey(ProductClass, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Termék osztály")
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Projekt")
    net_unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Nettó egység ár")
    net_total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Nettó ár")
    currency = models.ForeignKey(Currency, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Valuta")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='quote_request_open', verbose_name="Állapot")
    contact = models.ForeignKey(Contact, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Ügyfél")
    deadline = models.DateField(verbose_name="Határidő")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Gyártási termék"
        verbose_name_plural = "Gyártási termékek"

    def __str__(self):
        return f"{self.name} - {self.get_status_display()}"

    def save(self, *args, **kwargs):
        # Automatikus nettó ár számítás
        self.net_total_price = self.quantity * self.net_unit_price
        super().save(*args, **kwargs)


class Service(models.Model):
    """Gyártási szolgáltatás modell (munkadíjak, szolgáltatási díjak)"""
    UNIT_CHOICES = [
        ('db', 'darab'),
        ('m', 'folyóméter'),
        ('m2', 'négyzetméter'),
        ('kg', 'kilogramm'),
        ('hour', 'óra'),
        ('perimeter', 'kerület (méter)'),
    ]
    
    CALCULATION_BASIS_CHOICES = [
        ('fixed', 'Fix ár'),
        ('area', 'Terület alapú'),
        ('perimeter', 'Kerület alapú'),
        ('length', 'Hossz alapú'),
        ('weight', 'Súly alapú'),
        ('quantity', 'Darabszám alapú'),
    ]
    
    name = models.CharField(max_length=200, verbose_name="Szolgáltatás neve")
    code = models.CharField(max_length=50, unique=True, verbose_name="Kód")
    description = models.TextField(blank=True, verbose_name="Leírás")
    
    unit = models.CharField(
        max_length=20,
        choices=UNIT_CHOICES,
        default='db',
        verbose_name="Mértékegység"
    )
    
    calculation_basis = models.CharField(
        max_length=20,
        choices=CALCULATION_BASIS_CHOICES,
        default='fixed',
        verbose_name="Kalkuláció alapja"
    )
    
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár (nettó)",
        help_text="Ár mértékegységenként"
    )
    
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    
    # Kategória/csoport (pl. nyomtatás, utómunka, szállítás)
    category = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Kategória",
        help_text="pl. Nyomtatás, Utómunka, Szállítás"
    )
    
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
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
        verbose_name = "Szolgáltatás"
        verbose_name_plural = "Szolgáltatások"
        ordering = ['category', 'name']
    
    def __str__(self):
        return f"{self.name} ({self.code})"


class CalculatorTemplate(models.Model):
    """Kalkulátor sablon (pl. molinó nyomtatás, matrica, stb.)"""
    name = models.CharField(max_length=200, verbose_name="Kalkulátor neve")
    code = models.CharField(max_length=50, unique=True, verbose_name="Kód")
    description = models.TextField(blank=True, verbose_name="Leírás")
    
    # Megengedett alapanyagok és szolgáltatások
    allowed_materials = models.ManyToManyField(
        Material,
        blank=True,
        verbose_name="Engedélyezett alapanyagok",
        help_text="Ezekből az alapanyagokból lehet választani"
    )
    
    allowed_services = models.ManyToManyField(
        Service,
        blank=True,
        verbose_name="Engedélyezett szolgáltatások",
        help_text="Ezeket a szolgáltatásokat lehet hozzáadni"
    )
    
    # Haszonkulcs (markup) - külön alapanyagra és szolgáltatásokra
    default_material_markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=30.00,
        validators=[MinValueValidator(0)],
        verbose_name="Alapanyag haszonkulcs %"
    )
    
    default_service_markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=35.00,
        validators=[MinValueValidator(0)],
        verbose_name="Szolgáltatás haszonkulcs %"
    )
    
    # Régi mező kompatibilitásért (deprecated)
    default_markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=30.00,
        validators=[MinValueValidator(0)],
        verbose_name="Alapértelmezett haszonkulcs % (deprecated)"
    )
    
    # Input mezők definíciója JSON-ban
    # pl: [{"name": "width", "label": "Szélesség", "type": "number", "unit": "cm", "required": true}]
    input_fields = models.JSONField(
        default=list,
        verbose_name="Bemenet mezők",
        help_text="Kalkulátorhoz szükséges input mezők definíciója"
    )
    
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_calculator_templates',
        verbose_name="Létrehozta"
    )
    
    class Meta:
        verbose_name = "Kalkulátor sablon"
        verbose_name_plural = "Kalkulátor sablonok"
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Calculation(models.Model):
    """Kalkuláció (sablon alapján elkészített számítás)"""
    template = models.ForeignKey(
        CalculatorTemplate,
        on_delete=models.CASCADE,
        verbose_name="Kalkulátor sablon"
    )
    
    # Bemenet értékek (JSON)
    input_values = models.JSONField(
        default=dict,
        verbose_name="Bemenet értékek"
    )
    
    # Kiválasztott alapanyagok és mennyiségek
    # [{material_id: 1, quantity: 10, calculated_price: 5000}]
    selected_materials = models.JSONField(
        default=list,
        verbose_name="Kiválasztott alapanyagok"
    )
    
    # Kiválasztott szolgáltatások és mennyiségek
    # [{service_id: 1, quantity: 5, calculated_price: 2500}]
    selected_services = models.JSONField(
        default=list,
        verbose_name="Kiválasztott szolgáltatások"
    )
    
    # Számított árak
    material_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name="Alapanyag költség"
    )
    
    service_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name="Szolgáltatás költség"
    )
    
    total_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name="Össz bekerülési ár"
    )
    
    material_markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=30.00,
        validators=[MinValueValidator(0)],
        verbose_name="Alapanyag haszonkulcs %"
    )
    
    service_markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=35.00,
        validators=[MinValueValidator(0)],
        verbose_name="Szolgáltatás haszonkulcs %"
    )
    
    # Régi mező kompatibilitásért (deprecated)
    markup_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Haszonkulcs % (deprecated)",
        null=True,
        blank=True
    )
    
    material_selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name="Alapanyag eladási ár"
    )
    
    service_selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name="Szolgáltatás eladási ár"
    )
    
    selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name="Össz eladási ár"
    )
    
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    
    # Referencia ajánlat ID-ra (string, mert később lesz Quote modell)
    quote_reference = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Ajánlat referencia",
        help_text="Hivatkozás ajánlatra"
    )
    
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    
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
        verbose_name = "Kalkuláció"
        verbose_name_plural = "Kalkulációk"
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.template.name} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"
    
    def calculate_prices(self):
        """Árak újraszámítása külön haszonkulcsokkal"""
        from decimal import Decimal
        
        # Alapanyag költség
        self.material_cost = Decimal(sum(
            item.get('calculated_price', 0) for item in self.selected_materials
        ))
        
        # Szolgáltatás költség
        self.service_cost = Decimal(sum(
            item.get('calculated_price', 0) for item in self.selected_services
        ))
        
        # Össz bekerülési ár
        self.total_cost = self.material_cost + self.service_cost
        
        # Eladási árak külön haszonkulcsokkal
        self.material_selling_price = self.material_cost * (1 + self.material_markup_percentage / 100)
        self.service_selling_price = self.service_cost * (1 + self.service_markup_percentage / 100)
        self.selling_price = self.material_selling_price + self.service_selling_price
        
        # Kompatibilitás régi markup_percentage-el (átlagos haszonkulcs)
        if self.total_cost > 0:
            profit = self.selling_price - self.total_cost
            self.markup_percentage = (profit / self.total_cost) * 100
        else:
            self.markup_percentage = 0
    
    def save(self, *args, **kwargs):
        self.calculate_prices()
        super().save(*args, **kwargs)
