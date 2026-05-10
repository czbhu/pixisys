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


class PrintMaterial(models.Model):
    """Nyomtatáshoz választható alapanyag (papír, fólia, stb.)"""
    name = models.CharField(max_length=200, verbose_name='Neve')
    description = models.TextField(blank=True, verbose_name='Leírás')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    sort_order = models.IntegerField(default=0, verbose_name='Sorrend')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Alapanyag'
        verbose_name_plural = 'Alapanyagok'

    def __str__(self):
        return self.name


class PrintOrderItem(models.Model):
    order = models.ForeignKey(
        PrintOrder, related_name='items',
        on_delete=models.CASCADE, verbose_name='Megrendelés')
    product_name = models.CharField(max_length=200, default='Nyomtatvány', verbose_name='Termék neve')
    material = models.ForeignKey(
        PrintMaterial, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='order_items',
        verbose_name='Alapanyag')
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

    # Zárolás
    editor_locked = models.BooleanField(default=False, verbose_name='Szerkesztő zárolva')
    preview_locked = models.BooleanField(default=False, verbose_name='Preview zárolva')
    locked_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='locked_print_items', verbose_name='Zárolta')
    locked_at = models.DateTimeField(null=True, blank=True, verbose_name='Zárolás időpontja')

    # Preview megosztás ügyfeleknek
    preview_share_enabled = models.BooleanField(default=False, verbose_name='Preview megosztás engedélyezve')
    preview_share_token = models.CharField(max_length=64, blank=True, null=True, unique=True, verbose_name='Preview megosztási token')
    preview_share_editable = models.BooleanField(default=False, verbose_name='Ügyfél szerkesztheti a preview-t')
    preview_share_commentable = models.BooleanField(default=True, verbose_name='Ügyfél kommentelheti a preview-t')
    preview_share_exportable = models.BooleanField(default=False, verbose_name='Ügyfél exportálhatja a preview-t')

    class Meta:
        verbose_name = 'Nyomtatási tétel'
        verbose_name_plural = 'Nyomtatási tételek'

    def __str__(self):
        return f"{self.product_name} — {self.quantity} db ({self.width_mm}×{self.height_mm} mm)"


class PrintOrderItemComment(models.Model):
    COMMENT_TYPE_CHOICES = [
        ('area', 'Terület'),
        ('pin', 'Jelölő'),
        ('arrow', 'Nyíl'),
    ]

    item = models.ForeignKey(
        PrintOrderItem, related_name='comments',
        on_delete=models.CASCADE, verbose_name='Nyomtatási tétel')
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='print_order_item_comments', verbose_name='Létrehozó user')
    author_name = models.CharField(max_length=200, verbose_name='Szerző neve')
    x = models.FloatField(verbose_name='X pozíció')
    y = models.FloatField(verbose_name='Y pozíció')
    w = models.FloatField(default=0, verbose_name='Szélesség')
    h = models.FloatField(default=0, verbose_name='Magasság')
    x2 = models.FloatField(null=True, blank=True, verbose_name='Nyíl X2')
    y2 = models.FloatField(null=True, blank=True, verbose_name='Nyíl Y2')
    type = models.CharField(max_length=20, choices=COMMENT_TYPE_CHOICES, default='area', verbose_name='Típus')
    page = models.PositiveIntegerField(default=1, verbose_name='Oldal')
    text = models.TextField(verbose_name='Komment szövege')
    resolved = models.BooleanField(default=False, verbose_name='Megoldva')
    color = models.CharField(max_length=20, default='#1890ff', verbose_name='Szín')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Nyomtatási preview komment'
        verbose_name_plural = 'Nyomtatási preview kommentek'

    def __str__(self):
        return f"Komment #{self.pk} - {self.item.product_name}"


class SharedPrintPreviewFolder(models.Model):
    """Mappa a megosztott preview PDF-ek rendszerezésére (felhasználónként)."""
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='shared_print_preview_folders', verbose_name='Tulajdonos')
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.CASCADE,
        related_name='children', verbose_name='Szülő mappa')
    name = models.CharField(max_length=200, verbose_name='Mappa neve')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Tárhely mappa'
        verbose_name_plural = 'Tárhely mappák'

    def __str__(self):
        return self.name


class SharedPrintPreview(models.Model):
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='shared_print_previews', verbose_name='Létrehozó user')
    folder = models.ForeignKey(
        SharedPrintPreviewFolder, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='previews', verbose_name='Mappa')
    title = models.CharField(max_length=200, blank=True, verbose_name='Preview neve')
    pdf = models.FileField(upload_to='printshop/shared_preview/', verbose_name='Megosztott PDF')
    token = models.CharField(max_length=64, unique=True, verbose_name='Megosztási token')
    editable = models.BooleanField(default=False, verbose_name='Szerkeszthető')
    commentable = models.BooleanField(default=True, verbose_name='Kommentelhető')
    exportable = models.BooleanField(default=False, verbose_name='Exportálható')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    expires_at = models.DateTimeField(null=True, blank=True, verbose_name='Megosztás lejárati ideje')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Megosztott preview'
        verbose_name_plural = 'Megosztott previewk'

    def __str__(self):
        return self.title or f"Megosztott preview #{self.pk}"

    @property
    def is_expired(self) -> bool:
        from django.utils import timezone
        return bool(self.expires_at and self.expires_at <= timezone.now())


class SharedPrintPreviewVersion(models.Model):
    """Egy preview-hoz tartozó PDF verzió (snapshot). Minden mentés új verziót készít."""
    preview = models.ForeignKey(
        SharedPrintPreview, on_delete=models.CASCADE,
        related_name='versions', verbose_name='Preview')
    version_number = models.PositiveIntegerField(verbose_name='Verziószám')
    pdf = models.FileField(upload_to='printshop/shared_preview/versions/', verbose_name='Verzió PDF')
    annotations = models.JSONField(default=list, blank=True, verbose_name='Kommentek snapshot')
    note = models.CharField(max_length=500, blank=True, verbose_name='Verzió megjegyzés')
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='shared_print_preview_versions', verbose_name='Készítő')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version_number']
        unique_together = [('preview', 'version_number')]
        verbose_name = 'Preview verzió'
        verbose_name_plural = 'Preview verziók'

    def __str__(self):
        return f"{self.preview_id} v{self.version_number}"


class SharedPrintPreviewComment(models.Model):
    COMMENT_TYPE_CHOICES = [
        ('area', 'Terület'),
        ('pin', 'Jelölő'),
        ('arrow', 'Nyíl'),
    ]

    preview = models.ForeignKey(
        SharedPrintPreview, related_name='comments',
        on_delete=models.CASCADE, verbose_name='Megosztott preview')
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='shared_print_preview_comments', verbose_name='Létrehozó user')
    author_name = models.CharField(max_length=200, verbose_name='Szerző neve')
    x = models.FloatField(verbose_name='X pozíció')
    y = models.FloatField(verbose_name='Y pozíció')
    w = models.FloatField(default=0, verbose_name='Szélesség')
    h = models.FloatField(default=0, verbose_name='Magasság')
    x2 = models.FloatField(null=True, blank=True, verbose_name='Nyíl X2')
    y2 = models.FloatField(null=True, blank=True, verbose_name='Nyíl Y2')
    type = models.CharField(max_length=20, choices=COMMENT_TYPE_CHOICES, default='area', verbose_name='Típus')
    page = models.PositiveIntegerField(default=1, verbose_name='Oldal')
    text = models.TextField(verbose_name='Komment szövege')
    resolved = models.BooleanField(default=False, verbose_name='Megoldva')
    color = models.CharField(max_length=20, default='#1890ff', verbose_name='Szín')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Megosztott preview komment'
        verbose_name_plural = 'Megosztott preview kommentek'

    def __str__(self):
        return f"Megosztott preview komment #{self.pk}"


class PrintTemplateCategory(models.Model):
    """Nyomtatási sablon kategória."""
    name = models.CharField(max_length=150, verbose_name='Kategória neve')
    description = models.TextField(blank=True, verbose_name='Leírás')
    sort_order = models.IntegerField(default=0, verbose_name='Sorrend')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Sablon kategória'
        verbose_name_plural = 'Sablon kategóriák'

    def __str__(self):
        return self.name


def template_upload_path(instance, filename):
    return f'printshop/templates/{instance.category_id or 0}/{filename}'


class PrintTemplate(models.Model):
    """Feltöltött nyomtatási sablon (PDF/SVG)."""
    name = models.CharField(max_length=200, verbose_name='Sablon neve')
    category = models.ForeignKey(
        PrintTemplateCategory,
        on_delete=models.CASCADE,
        related_name='templates',
        verbose_name='Kategória',
    )
    file = models.FileField(upload_to=template_upload_path, verbose_name='Fájl (PDF/SVG)')
    file_type = models.CharField(
        max_length=10,
        choices=[('pdf', 'PDF'), ('svg', 'SVG')],
        verbose_name='Fájl típus',
    )
    thumbnail = models.ImageField(
        upload_to='printshop/templates/thumbnails/',
        blank=True, null=True,
        verbose_name='Előnézeti kép',
    )
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    sort_order = models.IntegerField(default=0, verbose_name='Sorrend')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Feltöltötte',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Nyomtatási sablon'
        verbose_name_plural = 'Nyomtatási sablonok'

    def __str__(self):
        return f"{self.name} ({self.get_file_type_display()})"


class Machine(models.Model):
    """Nyomtatógép / feldolgozógép modell.

    Minden fizikai gépet reprezentál (UV táblás, UV tekercses, íves digitális,
    szita, tampon stb.). A kalkulátorban rezsiköltséget és nyomtatási árat tárol.
    """
    TECH_CHOICES = [
        ('uv_flatbed', 'UV táblás (flatbed)'),
        ('uv_roll',    'UV tekercses (roll)'),
        ('digital_sheet', 'Íves digitális'),
        ('screen',     'Szita'),
        ('pad',        'Tampon'),
        ('other',      'Egyéb'),
    ]

    name = models.CharField(max_length=200, verbose_name='Gép neve')
    tech_type = models.CharField(
        max_length=30, choices=TECH_CHOICES,
        verbose_name='Technológia típus')
    max_width_mm = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        verbose_name='Max. szélesség (mm)')
    max_height_mm = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        verbose_name='Max. magasság (mm)')

    # Rezsiköltség
    hourly_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        verbose_name='Rezsi (HUF/óra)',
        help_text='Energia + amortizáció + bér összesen')
    setup_time_min = models.DecimalField(
        max_digits=6, decimal_places=2, default=0,
        verbose_name='Beállítási idő (perc)')

    # UV nyomtatás — tinta + gép rezsi m²-enként
    print_cost_per_m2 = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        verbose_name='Nyomtatási ár (HUF/m²)',
        help_text='Tinta + rezsi összesen m²-enként')
    speed_m2_per_hour = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        verbose_name='Sebesség (m²/óra)')

    # Íves digitális (Konica-típus) — klikkdíj
    click_cost_color = models.DecimalField(
        max_digits=10, decimal_places=4, default=0,
        verbose_name='Klikkdíj színes (HUF/lap)')
    click_cost_bw = models.DecimalField(
        max_digits=10, decimal_places=4, default=0,
        verbose_name='Klikkdíj F/F (HUF/lap)')

    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    notes = models.TextField(blank=True, verbose_name='Megjegyzés')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['tech_type', 'name']
        verbose_name = 'Gép'
        verbose_name_plural = 'Gépek'

    def __str__(self):
        return f"{self.name} ({self.get_tech_type_display()})"
