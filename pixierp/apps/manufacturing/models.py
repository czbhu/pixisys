from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator, MaxValueValidator
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
    description = models.TextField(blank=True, verbose_name="Leírás")
    is_default = models.BooleanField(default=False, verbose_name="Alapértelmezett")
    calculators = models.JSONField(default=list, blank=True, verbose_name="Kalkulátorok")
    hr_departments = models.ManyToManyField(Department, blank=True, verbose_name="HR osztályok")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        verbose_name="Szülő kategória"
    )

    class Meta:
        verbose_name = "Termék osztály"
        verbose_name_plural = "Termék osztályok"

    def get_full_name(self):
        if self.parent:
            return f"{self.parent.get_full_name()} > {self.name}"
        return self.name

    def __str__(self):
        return self.get_full_name()


class Project(models.Model):
    """Projekt"""
    STATUS_CHOICES = [
        ('open', 'Nyitott'),
        ('closed', 'Zárt'),
    ]
    
    name = models.CharField(max_length=200, verbose_name="Név")
    description = models.TextField(blank=True, verbose_name="Leírás")
    deadline = models.DateField(verbose_name="Határidő")
    company = models.ForeignKey('crm.Company', on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Cég")
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
    code = models.CharField(max_length=50, blank=True, null=True, verbose_name="Cikkszám")
    description = models.TextField(blank=True, verbose_name="Leírás")
    internal_description = models.TextField(blank=True, verbose_name="Belső leírás")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    quantity_unit = models.CharField(max_length=20, default='db', verbose_name="Mennyiségi egység")
    is_fixed_quantity = models.BooleanField(default=False, verbose_name="Fix mennyiség")
    product_class = models.ForeignKey(ProductClass, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Termék osztály")
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Projekt")
    allowed_companies = models.ManyToManyField('crm.Company', blank=True, verbose_name="Engedélyezett cégek")
    allowed_contacts = models.ManyToManyField('crm.Contact', blank=True, related_name='allowed_products', verbose_name="Engedélyezett kapcsolattartók")
    net_unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Nettó egység ár")
    net_total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Nettó ár")
    price_from_cost_calc = models.BooleanField(default=True, verbose_name="Ár az árkalkulációból")
    currency = models.ForeignKey(Currency, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Valuta")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='quote_request_open', verbose_name="Állapot")
    contact = models.ForeignKey(Contact, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Ügyfél")
    contact_external_id = models.CharField(max_length=100, blank=True, default='', db_index=True, verbose_name="Kapcsolattartó külső azonosító")
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


class ManufacturingCostItem(models.Model):
    """Gyártási termék költség elem"""
    STATUS_CHOICES = [
        ('new', 'Új'),
        ('confirmed', 'Megerősítve'),
        ('in_production', 'Gyártásban'),
        ('ready', 'Kész'),
        ('in_delivery', 'Szállítás alatt'),
        ('delivered', 'Kiszállítva'),
        ('cancelled', 'Törölve'),
    ]

    product = models.ForeignKey(ManufacturingProduct, on_delete=models.CASCADE, related_name='cost_items', verbose_name="Termék")
    type = models.CharField(max_length=20, default='other', verbose_name="Típus") # material, service, other
    ref_id = models.IntegerField(null=True, blank=True, verbose_name="Referencia ID") # material_id or service_id
    name = models.CharField(max_length=200, verbose_name="Megnevezés")
    quantity = models.DecimalField(max_digits=10, decimal_places=4, default=1, verbose_name="Mennyiség")
    unit = models.CharField(max_length=20, default='db', verbose_name="Egység")
    unit_price = models.DecimalField(max_digits=15, decimal_places=4, default=0, verbose_name="Egységár (Eladási)")
    cost_price = models.DecimalField(max_digits=15, decimal_places=4, default=0, verbose_name="Bekerülési ár")
    markup_percent = models.DecimalField(max_digits=15, decimal_places=4, default=0, verbose_name="Haszonkulcs %")
    selling_unit_price = models.DecimalField(max_digits=15, decimal_places=4, default=0, verbose_name="Eladási egységár")
    selling_price = models.DecimalField(max_digits=15, decimal_places=4, default=0, verbose_name="Eladási ár összesen")
    supplier = models.ForeignKey('crm.Company', on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Beszállító")
    is_internal = models.BooleanField(default=False, verbose_name="Belső gyártás")
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Belső részleg")
    currency = models.CharField(max_length=3, default='HUF', verbose_name="Pénznem")
    is_per_unit = models.BooleanField(default=False, verbose_name="Egységre vetített")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new', verbose_name="Státusz")
    notes = models.TextField(blank=True, default='', verbose_name="Megjegyzések")
    supplier_email_sent_at = models.DateTimeField(null=True, blank=True, verbose_name="Beszállítói e-mail kiküldve")

    # Gyártási sor (queue) – globális sorrend
    queue_position = models.PositiveIntegerField(null=True, blank=True, db_index=True, verbose_name="Sorhely")
    is_paused = models.BooleanField(default=False, verbose_name="Szünetel")

    # Sorrend & alá-felérendelés
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Sorrend")
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='children', verbose_name="Szülő költség"
    )

    class Meta:
        verbose_name = "Gyártási költség elem"
        verbose_name_plural = "Gyártási költség elemek"
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f"{self.name} ({self.product.name})"


class ServiceGroup(models.Model):
    """Szolgáltatás csoport modell"""
    name = models.CharField(max_length=100, unique=True, verbose_name="Csoport neve")
    description = models.TextField(blank=True, verbose_name="Leírás")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        verbose_name="Szülő csoport"
    )

    is_protected = models.BooleanField(
        default=False, verbose_name="Védett",
        help_text="Védett csoport és benne lévő szolgáltatások nem törölhetők."
    )

    class Meta:
        verbose_name = "Szolgáltatás csoport"
        verbose_name_plural = "Szolgáltatás csoportok"
        ordering = ['name']

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        if self.is_protected:
            raise ValueError("Védett szolgáltatás csoport nem törölhető.")
        super().delete(*args, **kwargs)


class Service(models.Model):
    """Gyártási szolgáltatás modell (munkadíjak, szolgáltatási díjak)"""
    UNIT_CHOICES = [
        ('db', 'darab'),
        ('m', 'folyóméter'),
        ('m2', 'négyzetméter'),
        ('kg', 'kilogramm'),
        ('hour', 'óra'),
        ('perimeter', 'kerület (méter)'),
        ('sheet', 'ív (ív alapú)'),
        ('click', 'klikk (klikkdíjas)'),
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
    
    calculation_unit = models.CharField(
        max_length=20,
        choices=UNIT_CHOICES + [('minute', 'perc')],
        default='db',
        blank=True,
        verbose_name="Kalkulációs mértékegység",
        help_text="Ha eltér az alap mértékegységtől, a rendszer átváltja. Klikkdíjas esetén az ív nyomtatási klikkszám alapján számol."
    )

    calculation_basis = models.CharField(
        max_length=20,
        choices=CALCULATION_BASIS_CHOICES,
        default='fixed',
        verbose_name="Kalkuláció alapja",
        help_text="DEPRECATED: A kalkuláció alapját a beszállítói vagy belső gyártási árkalkuláció határozza meg"
    )
    
    # Árazás
    unit_cost_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár (bekerülési)",
        help_text="Bekerülési ár mértékegységenként"
    )
    
    markup_percentage = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=35.00,
        validators=[MinValueValidator(0)],
        verbose_name="Haszonkulcs %",
        help_text="Haszonkulcs százalékban"
    )
    
    unit_selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár (eladási)",
        help_text="Eladási ár mértékegységenként (számított vagy manuális)"
    )
    
    # Régi mező kompatibilitásért (deprecated - unit_selling_price-ra mutat)
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár (nettó) - DEPRECATED",
        help_text="Használd helyette: unit_selling_price"
    )
    
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    
    # Kategória/csoport (pl. nyomtatás, utómunka, szállítás)
    category = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Kategória (Legacy)",
        help_text="pl. Nyomtatás, Utómunka, Szállítás"
    )

    groups = models.ManyToManyField(
        ServiceGroup,
        blank=True,
        verbose_name="Szolgáltatás csoportok",
        related_name="services"
    )
    
    # Beszállítók és belső gyártás
    default_supplier = models.ForeignKey(
        'crm.Company',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_supplier': True},
        related_name='default_services',
        verbose_name="Alapértelmezett beszállító",
        help_text="Ez a beszállító lesz használva a kalkulációban"
    )
    
    is_internal_production = models.BooleanField(
        default=False,
        verbose_name="Belső gyártás",
        help_text="Házon belül végezzük"
    )
    
    internal_production_department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='provided_services',
        verbose_name="Gyártó osztály",
        help_text="Melyik osztály végzi"
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

    # ── Méretkorlát ─────────────────────────────────────────────────────────
    max_width_mm = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="Max szélesség (mm)",
        help_text="0 = korlátlan / végtelen"
    )
    max_height_mm = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="Max magasság (mm)",
        help_text="0 = korlátlan / végtelen"
    )

    # ── Egyszerűsített árazási modell ────────────────────────────────────────
    PRICING_TYPE_CHOICES = [
        ('per_sheet', 'Ívenként'),
        ('per_job',   'Munkánként (flat)'),
        ('per_cut',   'Vágásonként (kapacitással)'),
    ]
    pricing_type = models.CharField(
        max_length=20, choices=PRICING_TYPE_CHOICES, default='per_sheet', blank=True,
        verbose_name="Árazás típusa",
    )
    setup_cost_selling = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Beállítási díj (eladási Ft)",
        help_text="Fix beállítási / indítási díj, egyszer számolódik munkánként",
    )
    unit_cost_selling = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységköltség (eladási Ft / ív|db|vágás)",
    )
    capacity = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="Kapacitás (ív/vágás)",
        help_text="Pl. 1 vágással hány ívet lehet feldolgozni. 0 = korlátlan.",
    )

    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    is_protected = models.BooleanField(
        default=False, verbose_name="Védett",
        help_text="Védett szolgáltatások nem törölhetők. Rendszer-szintű kalkulációhoz szükségesek."
    )
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
    
    def calculate_selling_price(self):
        """Eladási ár számítása bekerülési árból és haszonkulcsból"""
        if self.unit_cost_price:
            self.unit_selling_price = self.unit_cost_price * (1 + self.markup_percentage / 100)
            self.unit_price = self.unit_selling_price  # kompatibilitás
    
    def calculate_markup(self):
        """Haszonkulcs számítása bekerülési és eladási árból"""
        if self.unit_cost_price and self.unit_cost_price > 0 and self.unit_selling_price:
            profit = self.unit_selling_price - self.unit_cost_price
            self.markup_percentage = (profit / self.unit_cost_price) * 100
    
    def save(self, *args, **kwargs):
        # Szinkronizálás: unit_price = unit_selling_price (kompatibilitás)
        if self.unit_selling_price:
            self.unit_price = self.unit_selling_price
        
        # Ha van bekerülési ár és haszonkulcs, de nincs eladási ár, akkor számoljuk
        if self.unit_cost_price and not self.unit_selling_price:
            self.calculate_selling_price()
        
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.is_protected:
            raise ValueError("Védett szolgáltatás nem törölhető.")
        if self.groups.filter(is_protected=True).exists():
            raise ValueError("Védett csoportba tartozó szolgáltatás nem törölhető.")
        super().delete(*args, **kwargs)


class CalculatorTemplate(models.Model):
    """Kalkulátor sablon (pl. molinó nyomtatás, matrica, stb.)"""
    name = models.CharField(max_length=200, verbose_name="Kalkulátor neve")
    code = models.CharField(max_length=50, unique=True, verbose_name="Kód")
    description = models.TextField(blank=True, verbose_name="Leírás")

    CATEGORY_CHOICES = [
        ('sheet_print', 'Íves/Táblás nyomtatás'),
        ('roll_print', 'Tekercses nyomtatás'),
        ('lightbox', 'Világító tábla'),
        ('other', 'Egyéb'),
    ]
    category = models.CharField(
        max_length=50,
        choices=CATEGORY_CHOICES,
        default='other',
        blank=True,
        verbose_name="Kategória",
    )

    CALCULATOR_TYPE_CHOICES = [
        ('generic', 'Általános'),
        ('sheet_print', 'Íves/Táblás optimalizálás'),
        ('roll_print', 'Tekercses kalkuláció'),
    ]
    calculator_type = models.CharField(
        max_length=50,
        choices=CALCULATOR_TYPE_CHOICES,
        default='generic',
        blank=True,
        verbose_name="Működési logika",
    )
    
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


class ServiceSupplierPrice(models.Model):
    """Szolgáltatás beszállítói árazás"""
    service = models.ForeignKey(
        Service,
        on_delete=models.CASCADE,
        related_name='supplier_prices',
        verbose_name="Szolgáltatás"
    )
    supplier = models.ForeignKey(
        'crm.Company',
        on_delete=models.CASCADE,
        limit_choices_to={'is_supplier': True},
        related_name='service_prices',
        verbose_name="Beszállító"
    )
    is_default = models.BooleanField(
        default=False,
        verbose_name="Alapértelmezett beszállító",
        help_text="Ez a beszállító lesz használva a kalkulációban"
    )
    
    # Árazási komponensek
    fixed_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Fix költség",
        help_text="Fix költség (pl. beállítási díj)"
    )
    price_per_unit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Egységár",
        help_text="Ár darabonként/mértékegységenként"
    )
    price_per_perimeter = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Ár kerület alapján",
        help_text="Ár folyóméterenként (kerület)"
    )
    price_per_area = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Ár terület alapján",
        help_text="Ár négyzetméterenként"
    )
    price_per_weight = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Ár súly alapján",
        help_text="Ár kilogrammonként"
    )
    price_per_time = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Ár idő alapján",
        help_text="Ár óránként"
    )
    
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Pénznem")
    min_order_quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Minimum rendelési mennyiség"
    )
    lead_time_days = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name="Szállítási határidő (nap)"
    )
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")
    
    class Meta:
        verbose_name = "Szolgáltatás beszállítói ár"
        verbose_name_plural = "Szolgáltatás beszállítói árak"
        ordering = ['service', 'supplier']
        unique_together = ['service', 'supplier']
    
    def __str__(self):
        default = " (alapértelmezett)" if self.is_default else ""
        return f"{self.service.name} - {self.supplier.name}{default}"
    
    def save(self, *args, **kwargs):
        # Ha ez az alapértelmezett, akkor a többi ne legyen az
        if self.is_default:
            ServiceSupplierPrice.objects.filter(
                service=self.service,
                is_default=True
            ).exclude(id=self.id).update(is_default=False)
        super().save(*args, **kwargs)
    
    def calculate_total_cost(self, quantity=1, perimeter=0, area=0, weight=0, time=0):
        """Teljes költség számítása a különböző komponensek alapján"""
        total = self.fixed_cost
        total += self.price_per_unit * quantity
        total += self.price_per_perimeter * perimeter
        total += self.price_per_area * area
        total += self.price_per_weight * weight
        total += self.price_per_time * time
        return total


class ServiceCostItem(models.Model):
    """Szolgáltatás költség elem (beszállítóhoz vagy belső gyártáshoz)"""
    
    CALCULATION_TYPE_CHOICES = [
        ('fixed', 'Fix költség'),
        ('unit', 'Darab alapú'),
        ('click', 'Klikkdíjas (ív-produkció alapú)'),
        ('length', 'Folyóméter'),
        ('perimeter', 'Kerület'),
        ('area', 'Terület'),
        ('weight', 'Súly'),
        ('time', 'Idő'),
    ]
    
    service = models.ForeignKey(
        Service,
        on_delete=models.CASCADE,
        related_name='cost_items',
        verbose_name="Szolgáltatás"
    )
    
    supplier = models.ForeignKey(
        'crm.Company',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        limit_choices_to={'is_supplier': True},
        related_name='service_cost_items',
        verbose_name="Beszállító",
        help_text="Null = belső gyártás"
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

    rounding_step = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=1.0,
        verbose_name="Elszámolási egység (kerekítés)",
        help_text="Pl. 0.5 óra, 10 perc, 1 db. Mindig felfelé kerekít."
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
    
    markup_percentage = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
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
        verbose_name = "Szolgáltatás költség elem"
        verbose_name_plural = "Szolgáltatás költség elemek"
        ordering = ['service', 'supplier', 'name']
    
    def __str__(self):
        source = "Belső" if self.is_internal else (self.supplier.name if self.supplier else "Ismeretlen")
        return f"{self.service.name} - {source} - {self.name}"
    
    def save(self, *args, **kwargs):
        # Automatikus eladási ár számítás
        if self.unit_price and self.markup_percentage:
            self.selling_price = self.unit_price * (1 + self.markup_percentage / 100)
        super().save(*args, **kwargs)


class ProductTemplate(models.Model):
    """Termék sablon – újrafelhasználható termékdefiníció kalkulátor-beállításokkal és méretekkel."""
    name = models.CharField(max_length=200, verbose_name="Termék neve")
    code = models.CharField(max_length=50, blank=True, null=True, unique=True, verbose_name="Cikkszám")
    description = models.TextField(blank=True, verbose_name="Leírás")
    category = models.ForeignKey(
        ProductClass,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='product_templates',
        verbose_name="Termékkategória",
    )

    CALCULATOR_TYPE_CHOICES = [
        ('generic', 'Általános'),
        ('sheet_print', 'Íves/Táblás optimalizálás'),
        ('roll_print', 'Tekercses kalkuláció'),
        ('click_sheet_print', 'Klikkdíjas íves nyomtatás'),
    ]
    calculator_type = models.CharField(
        max_length=50,
        choices=CALCULATOR_TYPE_CHOICES,
        default='generic',
        blank=True,
        verbose_name="Működési logika",
    )
    default_material_markup_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=30.00,
        validators=[MinValueValidator(0)],
        verbose_name="Alapanyag haszonkulcs %",
    )
    default_service_markup_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=35.00,
        validators=[MinValueValidator(0)],
        verbose_name="Szolgáltatás haszonkulcs %",
    )
    allowed_materials = models.ManyToManyField(
        Material,
        blank=True,
        related_name='product_templates',
        verbose_name="Engedélyezett alapanyagok",
    )
    allowed_services = models.ManyToManyField(
        Service,
        blank=True,
        related_name='product_templates',
        verbose_name="Engedélyezett szolgáltatások",
    )
    allowed_material_groups = models.ManyToManyField(
        'warehouse.MaterialGroup',
        blank=True,
        related_name='product_templates',
        verbose_name="Engedélyezett alapanyag kategóriák",
    )
    required_services = models.ManyToManyField(
        Service,
        blank=True,
        related_name='required_for_templates',
        verbose_name="Kötelező kapcsolódó szolgáltatások",
    )
    finishing_services = models.ManyToManyField(
        Service,
        blank=True,
        related_name='finishing_for_templates',
        verbose_name="Kész termékre vonatkozó szolgáltatások",
    )

    custom_size_enabled = models.BooleanField(default=False, verbose_name="Egyedi méret engedélyezett")
    UNIT_CHOICES = [('mm', 'mm'), ('cm', 'cm'), ('m', 'm')]
    custom_size_unit = models.CharField(max_length=5, choices=UNIT_CHOICES, default='mm', blank=True, verbose_name="Egyedi méret egység")
    custom_size_width_min = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, verbose_name="Egyedi Sz. min")
    custom_size_width_max = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, verbose_name="Egyedi Sz. max")
    custom_size_height_min = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, verbose_name="Egyedi M. min")
    custom_size_height_max = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, verbose_name="Egyedi M. max")

    # ── Nyomtatási beállítások (sheet_print kalkulátor típushoz) ────────────
    PRINT_SIDES_CHOICES = [
        (1, 'Egyoldalas (simplex)'),
        (2, 'Kétoldalas (duplex)'),
    ]
    print_sides = models.PositiveSmallIntegerField(
        choices=PRINT_SIDES_CHOICES,
        default=1,
        verbose_name="Nyomtatás oldalak száma",
        help_text="1 = simplex, 2 = duplex. Klikkdíjas számításnál 1 ív = 1×sides klikk.",
    )
    print_service = models.ForeignKey(
        'Service',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='print_service_templates',
        verbose_name="Nyomtatási szolgáltatás",
        help_text="Az íves nyomtatáshoz rendelt szolgáltatás (pl. Fekete-fehér íves nyomtatás). Ha klikkdíjas, a klikk díjjal számol.",
    )
    print_service_options = models.ManyToManyField(
        'Service',
        blank=True,
        related_name='click_print_product_templates',
        verbose_name="Klikkdíjas nyomtatási opciók",
        help_text="Válasszon klikkdíjas nyomtatási szolgáltatásokat (pl. Konica 1 old. színes, Konica 2 old. FH). A felhasználó ezek közül választ a PrintEditorban.",
    )
    print_service_options_order = models.JSONField(
        default=list, blank=True,
        verbose_name="Klikkdíjas opciók sorrendje",
        help_text="A print_service_options M2M mezőhöz tartozó rendezési sorrend (ID-k listája).",
    )
    fix_cost_first_side_only = models.BooleanField(
        default=False,
        verbose_name="Fix költségek csak az 1. oldalra",
        help_text="Ha igaz, 2 oldalas nyomtatásnál a fix költségeket csak az 1. oldalra számolja.",
    )
    multi_sheet_enabled = models.BooleanField(
        default=False,
        verbose_name="Több ív engedélyezése",
        help_text="Ha igaz, a felhasználó több ívet (oldalt) adhat a megrendeléshez.",
    )

    template_categories = models.ManyToManyField(
        'printshop.PrintTemplateCategory',
        blank=True,
        related_name='product_templates',
        verbose_name="Sablon kategóriák",
        help_text="Válaszd ki, mely sablon kategóriák jelenjenek meg a Print Editorban ennél a terméknél.",
    )

    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")

    class Meta:
        verbose_name = "Termék sablon"
        verbose_name_plural = "Termék sablonok"
        ordering = ['name']

    def __str__(self):
        return self.name


class ProductTemplateSize(models.Model):
    """Egy termék sablon méret-variánsa."""
    product = models.ForeignKey(
        ProductTemplate,
        on_delete=models.CASCADE,
        related_name='sizes',
        verbose_name="Termék sablon",
    )
    label = models.CharField(max_length=100, blank=True, verbose_name="Méret neve (pl. A4, B2)")
    width_mm = models.DecimalField(max_digits=8, decimal_places=2, verbose_name="Szélesség min (mm)")
    width_max_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, verbose_name="Szélesség max (mm)")
    height_mm = models.DecimalField(max_digits=8, decimal_places=2, verbose_name="Magasság min (mm)")
    height_max_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, verbose_name="Magasság max (mm)")
    sort_order = models.IntegerField(default=0, verbose_name="Sorrend")
    unit = models.CharField(max_length=5, choices=[('mm', 'mm'), ('cm', 'cm'), ('m', 'm')], default='mm', verbose_name="Mértékegység")

    class Meta:
        verbose_name = "Termék méret"
        verbose_name_plural = "Termék méretek"
        ordering = ['sort_order', 'id']

    def __str__(self):
        label = self.label or f"{self.width_mm}×{self.height_mm} mm"
        return f"{self.product.name} – {label}"


class ProductTemplateServiceGroup(models.Model):
    """Egy OR-csoport: a csoporton belül VAGY logika, csoportok között ÉS logika."""
    product = models.ForeignKey(
        ProductTemplate,
        on_delete=models.CASCADE,
        related_name='service_groups',
        verbose_name="Termék sablon",
    )
    side = models.CharField(
        max_length=1,
        choices=[('1', '1. oldal'), ('2', '2. oldal'), ('F', 'Kész termék')],
        default='1',
        verbose_name="Oldal",
    )
    group_index = models.IntegerField(default=0, verbose_name="Csoport sorrend")
    services = models.ManyToManyField(
        Service,
        blank=True,
        related_name='template_service_groups',
        verbose_name="Szolgáltatások",
    )

    class Meta:
        verbose_name = "Szolgáltatás csoport"
        verbose_name_plural = "Szolgáltatás csoportok"
        ordering = ['side', 'group_index']

    def __str__(self):
        return f"{self.product.name} – {self.side}. oldal / {self.group_index}. csoport"


class ProductTemplateQuantityDiscount(models.Model):
    """Összeghatárhoz kötött % vagy fix árengedmény."""
    DISCOUNT_TYPE_CHOICES = [
        ('percent', 'Százalékos (%)'),
        ('fixed',   'Fix összeg (Ft)'),
    ]
    product = models.ForeignKey(
        ProductTemplate,
        on_delete=models.CASCADE,
        related_name='quantity_discounts',
        verbose_name="Termék sablon",
    )
    min_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Min. rendelési összeg (Ft-tól)",
    )
    discount_type = models.CharField(
        max_length=10,
        choices=DISCOUNT_TYPE_CHOICES,
        default='percent',
        verbose_name="Kedvezmény típusa",
    )
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Kedvezmény értéke",
    )

    class Meta:
        verbose_name = "Összeghatáros kedvezmény"
        verbose_name_plural = "Összeghatáros kedvezmények"
        ordering = ['min_amount']

    def __str__(self):
        return f"{self.product.name} – {self.min_amount} Ft felett {self.discount_value} {'%' if self.discount_type == 'percent' else 'Ft'}"


class ManufacturingProductAttachment(models.Model):
    """Gyártási termék csatolmány"""
    product = models.ForeignKey(ManufacturingProduct, on_delete=models.CASCADE, related_name='attachments', verbose_name="Termék")
    file = models.FileField(upload_to='manufacturing_products/%Y/%m/%d/', verbose_name="Fájl")
    remark = models.CharField(max_length=255, blank=True, verbose_name="Megjegyzés")
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Feltöltötte")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Feltöltve")

    class Meta:
        verbose_name = "Gyártási termék csatolmány"
        verbose_name_plural = "Gyártási termék csatolmányok"

    def __str__(self):
        return f"Attachment for product {self.product_id}: {self.file.name}"


class ManufacturingCostItemAttachment(models.Model):
    """Gyártási költség elem csatolmány"""
    cost_item = models.ForeignKey(ManufacturingCostItem, on_delete=models.CASCADE, related_name='attachments', verbose_name="Költség elem")
    file = models.FileField(upload_to='cost_item_attachments/%Y/%m/%d/', verbose_name="Fájl")
    remark = models.CharField(max_length=500, blank=True, verbose_name="Megjegyzés")
    storage_file_id = models.IntegerField(null=True, blank=True, verbose_name="Storage fájl ID")
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Feltöltötte")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Feltöltve")

    class Meta:
        verbose_name = "Költség elem csatolmány"
        verbose_name_plural = "Költség elem csatolmányok"

    def __str__(self):
        return f"Attachment for cost_item {self.cost_item_id}: {self.file.name}"
