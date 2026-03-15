from decimal import Decimal
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

COLOR_MODE_CHOICES = [
    ('color', 'Színes'),
    ('bw', 'Fekete-fehér'),
    ('color_white', 'Színes + fehér'),
    ('none', 'Nyomatlan'),
]

BINDING_CHOICES = [
    ('cut', 'Méretre vágás'),
    ('fold', 'Hajtogatás'),
]


class PrintSizePreset(models.Model):
    """Előre beállított papírméret."""
    name = models.CharField(max_length=100, verbose_name='Név')
    width_mm = models.DecimalField(max_digits=8, decimal_places=2, verbose_name='Szélesség (mm)')
    height_mm = models.DecimalField(max_digits=8, decimal_places=2, verbose_name='Magasság (mm)')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    sort_order = models.IntegerField(default=0, verbose_name='Sorrend')

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Méret preset'
        verbose_name_plural = 'Méret presetek'

    def __str__(self):
        return f"{self.name} ({self.width_mm}×{self.height_mm} mm)"


class PrintPricingConfig(models.Model):
    """Singleton árazási konfiguráció."""
    # Papír
    paper_cost_per_m2 = models.DecimalField(
        max_digits=10, decimal_places=2, default=500,
        verbose_name='Papír ár (HUF/m²)')
    # Nyomtatás
    print_color_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=50,
        verbose_name='Színes nyomtatás (HUF/lap/oldal)')
    print_bw_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=20,
        verbose_name='F-F nyomtatás (HUF/lap/oldal)')
    print_color_white_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=80,
        verbose_name='Színes+Fehér nyomtatás (HUF/lap/oldal)')
    # Kötészet
    cutting_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=2000,
        verbose_name='Vágási munkadíj (HUF/munka)')
    folding_cost_per_fold = models.DecimalField(
        max_digits=10, decimal_places=2, default=500,
        verbose_name='Hajtás díj (HUF/hajtáspont)')
    # Fedezet
    margin_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=40,
        verbose_name='Fedezet (%)')

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Árazási konfiguráció'

    def __str__(self):
        return f"Árazási konfiguráció (frissítve: {self.updated_at.strftime('%Y-%m-%d') if self.pk else 'új'})"

    @classmethod
    def get_config(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class PrintOrder(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Vázlat'),
        ('pending', 'Függőben'),
        ('confirmed', 'Visszaigazolva'),
        ('in_print', 'Nyomtatásban'),
        ('done', 'Kész'),
        ('cancelled', 'Törölve'),
    ]

    company = models.ForeignKey(
        'crm.Company', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='print_orders',
        verbose_name='Cég')
    contact = models.ForeignKey(
        'crm.Contact', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='print_orders',
        verbose_name='Kapcsolattartó')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='print_orders',
        verbose_name='Létrehozó')
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='draft',
        verbose_name='Státusz')
    notes = models.TextField(blank=True, verbose_name='Megjegyzés')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Nyomtatási megrendelés'
        verbose_name_plural = 'Nyomtatási megrendelések'

    def __str__(self):
        return f"Megrendelés #{self.pk} — {self.get_status_display()}"

    @property
    def total_price(self):
        return sum((item.total_price or Decimal('0')) for item in self.items.all())


class PrintOrderItem(models.Model):
    order = models.ForeignKey(
        PrintOrder, related_name='items',
        on_delete=models.CASCADE, verbose_name='Megrendelés')
    product_name = models.CharField(max_length=200, default='Nyomtatvány', verbose_name='Termék neve')
    quantity = models.PositiveIntegerField(default=100, verbose_name='Mennyiség (db)')

    # Méretek
    width_mm = models.DecimalField(max_digits=8, decimal_places=2, verbose_name='Szélesség (mm)')
    height_mm = models.DecimalField(max_digits=8, decimal_places=2, verbose_name='Magasság (mm)')

    # Nyomtatás
    sides = models.CharField(
        max_length=1,
        choices=[('1', '1 oldalas'), ('2', '2 oldalas')],
        default='1', verbose_name='Oldalak száma')
    side1_mode = models.CharField(
        max_length=20, choices=COLOR_MODE_CHOICES, default='color',
        verbose_name='1. oldal nyomtatási mód')
    side2_mode = models.CharField(
        max_length=20, choices=COLOR_MODE_CHOICES, default='none',
        verbose_name='2. oldal nyomtatási mód')

    # Kötészet
    binding = models.CharField(
        max_length=20, choices=BINDING_CHOICES, default='cut',
        verbose_name='Kötészet')
    folding_count = models.IntegerField(default=0, verbose_name='Hajtások száma')
    folding_specs = models.JSONField(
        default=list, blank=True,
        verbose_name='Hajtás specifikáció')
    # Pl: [{"axis": "H", "pos_mm": 100}, {"axis": "V", "pos_mm": 50}]

    # Design (Fabric.js canvas JSON)
    design_json_side1 = models.JSONField(null=True, blank=True, verbose_name='Tervezés 1. oldal')
    design_json_side2 = models.JSONField(null=True, blank=True, verbose_name='Tervezés 2. oldal')

    # Feltöltött fájlok (végső artwork)
    artwork_side1 = models.FileField(
        upload_to='printshop/artwork/', null=True, blank=True,
        verbose_name='Artwork 1. oldal')
    artwork_side2 = models.FileField(
        upload_to='printshop/artwork/', null=True, blank=True,
        verbose_name='Artwork 2. oldal')

    # Generált nyomdakész PDF
    generated_pdf = models.FileField(
        upload_to='printshop/pdf/', null=True, blank=True,
        verbose_name='Nyomdakész PDF')

    # Árak
    unit_price = models.DecimalField(
        max_digits=12, decimal_places=4, default=0, verbose_name='Egységár (HUF)')
    total_price = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, verbose_name='Végösszeg (HUF)')
    price_breakdown = models.JSONField(null=True, blank=True, verbose_name='Árkalkuláció részlet')

    class Meta:
        verbose_name = 'Nyomtatási tétel'
        verbose_name_plural = 'Nyomtatási tételek'

    def __str__(self):
        return f"{self.product_name} — {self.quantity} db ({self.width_mm}×{self.height_mm} mm)"
