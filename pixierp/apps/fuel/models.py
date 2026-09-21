from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

from apps.warehouse.models import Material, Warehouse


User = get_user_model()

# ÁFA kulcs a POS termék serializerben használt logikával egyezően (27%)
FUEL_VAT_RATE = 27


def fuel_gross_price(material):
    """Üzemanyagtermék bruttó, literenkénti ára – a POS-szal azonos árképzés:
    nettó egységár × 1.27, akciós ár esetén a promo_price (bruttó)."""
    if material is None:
        return None
    if material.promo_price is not None:
        return material.promo_price
    if material.unit_selling_price is None:
        return None
    vat_multiplier = Decimal(1) + Decimal(FUEL_VAT_RATE) / Decimal(100)
    return (material.unit_selling_price * vat_multiplier).quantize(Decimal('0.01'))


class FuelStationConfig(models.Model):
    """Benzinkút modul globális beállításai (egypéldányos - singleton)."""

    AUTH_TYPE_CHOICES = [
        ('digest', 'Digest autentikáció (DIP-2 OFF)'),
        ('basic', 'Basic autentikáció (DIP-2 ON)'),
    ]

    enabled = models.BooleanField(default=False, verbose_name='Modul engedélyezve')
    controller_url = models.CharField(
        max_length=255, default='http://192.168.1.117',
        verbose_name='PTS-2 vezérlő címe',
        help_text='Pl. http://192.168.1.117 vagy https://192.168.1.117 (DIP-1 OFF esetén HTTPS)',
    )
    auth_type = models.CharField(
        max_length=10, choices=AUTH_TYPE_CHOICES, default='digest', verbose_name='Autentikáció típusa'
    )
    username = models.CharField(max_length=50, default='admin', verbose_name='Felhasználónév')
    password = models.CharField(max_length=50, default='admin', verbose_name='Jelszó')
    request_timeout = models.PositiveSmallIntegerField(
        default=5, verbose_name='Kérés időkorlát (mp)',
        help_text='Ennyi másodpercig várja a PTS-2 vezérlő válaszát egy kérésnél.',
    )
    poll_interval = models.PositiveSmallIntegerField(
        default=2, verbose_name='Kútállapot lekérdezés gyakorisága (mp)',
        help_text='A kassza képernyő ekkora időközzel kérdezi le a kútfejek állapotát.',
    )
    auto_sync_prices = models.BooleanField(
        default=True, verbose_name='Árak automatikus szinkronizálása',
        help_text='A termék bruttó árából számolt kútár automatikusan felkerül a PTS-2 vezérlőre.',
    )
    auto_close_transaction = models.BooleanField(
        default=True, verbose_name='Tranzakció automatikus lezárása',
        help_text='Fizetés után a kút tranzakciója automatikusan lezárásra (nullázásra) kerül a vezérlőben.',
    )
    fuel_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fuel_station_config',
        verbose_name='Üzemanyag raktár',
        help_text='Ebből a raktárból kerül levonásra az eladott üzemanyag mennyisége.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'fuel_station_config'
        verbose_name = 'Benzinkút modul beállítás'
        verbose_name_plural = 'Benzinkút modul beállítások'

    def __str__(self):
        return 'Benzinkút modul beállítás'

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj

    def get_client(self):
        from .pts_client import PTS2Client
        return PTS2Client(
            base_url=self.controller_url,
            auth_type=self.auth_type,
            username=self.username,
            password=self.password,
            timeout=self.request_timeout or 5,
        )


class FuelGrade(models.Model):
    """Üzemanyag fajta (fuel grade) – a PTS-2 vezérlő FuelGradeId-jához rendelt ERP termék."""

    fuel_grade_id = models.PositiveSmallIntegerField(
        unique=True, verbose_name='Fuel Grade ID',
        help_text='A PTS-2 vezérlőben beállított üzemanyag azonosító (1-20).',
    )
    name = models.CharField(max_length=100, verbose_name='Név', help_text='Pl. Benzin 95, Gázolaj, LPG')
    material = models.ForeignKey(
        Material,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fuel_grades',
        verbose_name='Termék',
        help_text='A hozzárendelt raktári termék (benzinkút raktárból vételezett tétel).',
    )
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'fuel_grades'
        ordering = ['fuel_grade_id']
        verbose_name = 'Üzemanyag fajta'
        verbose_name_plural = 'Üzemanyag fajták'

    def __str__(self):
        return f'#{self.fuel_grade_id} {self.name}'

    @property
    def gross_price(self):
        return fuel_gross_price(self.material)


class FuelPump(models.Model):
    """Kútfej (pump) – a PTS-2 vezérlő logikai kút száma."""

    pump_id = models.PositiveSmallIntegerField(
        unique=True, verbose_name='Kút száma',
        help_text='A PTS-2 vezérlőben beállított logikai kút azonosító (1-100).',
    )
    name = models.CharField(max_length=100, blank=True, default='', verbose_name='Név')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'fuel_pumps'
        ordering = ['pump_id']
        verbose_name = 'Kútfej'
        verbose_name_plural = 'Kútfejek'

    def __str__(self):
        return self.name or f'{self.pump_id}. kút'


class FuelPumpNozzle(models.Model):
    """Kútpisztoly (nozzle) – a kútfej egy adagolópisztolya, üzemanyag fajtához rendelve."""

    pump = models.ForeignKey(
        FuelPump, on_delete=models.CASCADE, related_name='nozzles', verbose_name='Kútfej'
    )
    nozzle_number = models.PositiveSmallIntegerField(verbose_name='Pisztoly száma')
    fuel_grade = models.ForeignKey(
        FuelGrade,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='nozzles',
        verbose_name='Üzemanyag fajta',
    )

    class Meta:
        db_table = 'fuel_pump_nozzles'
        ordering = ['pump', 'nozzle_number']
        unique_together = [('pump', 'nozzle_number')]
        verbose_name = 'Kútpisztoly'
        verbose_name_plural = 'Kútpisztolyok'

    def __str__(self):
        grade = self.fuel_grade.name if self.fuel_grade else '—'
        return f'{self.pump} / {self.nozzle}. pisztoly ({grade})'


class FuelSaleTransaction(models.Model):
    """Kútosztás (pump transaction) – a kúton mért, a POS-ban számlázott töltés."""

    STATE_CHOICES = [
        ('authorized', 'Engedélyezve'),
        ('filling', 'Töltés folyamatban'),
        ('end_of_transaction', 'Töltés befejezve'),
        ('paid', 'Kifizetve'),
        ('rebill', 'Újrakibizonylatolandó (sztnó után)'),
        ('cancelled', 'Törölve'),
    ]
    SOURCE_CHOICES = [
        ('pos', 'POS indítású'),
        ('auto', 'Automatikusan átvett / kézi kútüzem'),
    ]

    pump = models.ForeignKey(
        FuelPump, on_delete=models.PROTECT, related_name='fuel_transactions', verbose_name='Kútfej'
    )
    nozzle_number = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name='Pisztoly')
    fuel_grade = models.ForeignKey(
        FuelGrade, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Üzemanyag fajta'
    )
    pts_transaction_number = models.PositiveIntegerField(
        null=True, blank=True, verbose_name='PTS tranzakciószám'
    )
    state = models.CharField(
        max_length=30, choices=STATE_CHOICES, default='authorized', verbose_name='Állapot', db_index=True
    )
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='pos', verbose_name='Eredet')

    volume = models.DecimalField(max_digits=12, decimal_places=3, default=0, verbose_name='Mennyiség (liter)')
    unit_price = models.DecimalField(
        max_digits=12, decimal_places=3, default=0, verbose_name='Egységár (bruttó)'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name='Összeg (bruttó)')
    is_test = models.BooleanField(default=False, verbose_name='Teszt/kalibrációs töltés')

    pos_transaction = models.OneToOneField(
        'sales.POSTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fuel_transaction',
        verbose_name='POS bizonylat',
    )
    terminal = models.ForeignKey(
        'pos.POSTerminal', on_delete=models.SET_NULL, null=True, blank=True, verbose_name='POS terminál'
    )
    cashier = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='fuel_transactions', verbose_name='Kasszás'
    )

    stock_deducted = models.BooleanField(default=False, verbose_name='Készletlevonás megtörtént')
    raw = models.JSONField(null=True, blank=True, verbose_name='Utolsó PTS állapot válasz')

    started_at = models.DateTimeField(null=True, blank=True, verbose_name='Töltés kezdete')
    ended_at = models.DateTimeField(null=True, blank=True, verbose_name='Töltés vége')
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name='Kútzárás (nullázás) időpontja')
    paid_at = models.DateTimeField(null=True, blank=True, verbose_name='Fizetés időpontja')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'fuel_sale_transactions'
        ordering = ['-created_at']
        verbose_name = 'Kút tranzakció'
        verbose_name_plural = 'Kút tranzakciók'

    def __str__(self):
        return f'#{self.pk} {self.pump} – {self.volume} l ({self.get_state_display()})'


class FuelPumpTotalsLog(models.Model):
    """Kútóra (regiszter total counter) kiolvasási napló."""

    SOURCE_CHOICES = [
        ('pump_totals', 'Kútból kiolvasva (PumpGetTotals)'),
        ('last_saved', 'Vezérlő memóriából (PumpGetLastSavedTotals)'),
    ]

    pump = models.ForeignKey(FuelPump, on_delete=models.PROTECT, related_name='totals_logs', verbose_name='Kútfej')
    nozzle_number = models.PositiveSmallIntegerField(verbose_name='Pisztoly')
    fuel_grade = models.ForeignKey(
        FuelGrade, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Üzemanyag fajta'
    )
    volume_total = models.DecimalField(max_digits=14, decimal_places=3, verbose_name='Ömlési óra (liter)')
    amount_total = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='Pénz óra')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, verbose_name='Forrás')
    read_at = models.DateTimeField(auto_now_add=True, verbose_name='Kiolvashoz idő')
    read_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Olvasta'
    )

    class Meta:
        db_table = 'fuel_pump_totals_logs'
        ordering = ['-read_at']
        verbose_name = 'Kútóra kiolvasás'
        verbose_name_plural = 'Kútóra kiolvasások'

    def __str__(self):
        return f'{self.pump} / {self.nozzle}. pisztoly óra: {self.volume_total} l'


class FuelShift(models.Model):
    """Üzemanyagtöltő állomási műszak (nyitástól a műszakátadási zárásig)."""

    STATUS_CHOICES = [
        ('open', 'Nyitott'),
        ('closed', 'Zárva'),
    ]

    number = models.PositiveIntegerField(verbose_name='Műszak sorszáma')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open', verbose_name='Állapot')
    terminal = models.ForeignKey(
        'pos.POSTerminal', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fuel_shifts', verbose_name='Kassza terminál',
    )
    opened_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fuel_shifts_opened', verbose_name='Nyitotta',
    )
    opened_at = models.DateTimeField(default=timezone.now, verbose_name='Nyitás időpontja')
    closed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fuel_shifts_closed', verbose_name='Zárta',
    )
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name='Zárás időpontja')
    # A zárás pillanatában rögzített összesítés (értékesítések, pénzforgalom) – a PDF
    # később is ebből újragenerálható.
    summary = models.JSONField(null=True, blank=True, verbose_name='Zárási összesítés')
    counted_cash = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, verbose_name='Számolt készpénz'
    )
    notes = models.TextField(blank=True, default='', verbose_name='Megjegyzés')
    pdf_file = models.FileField(upload_to='fuel_shifts/', null=True, blank=True, verbose_name='Jegyzőkönyv PDF')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Létrehozva')

    class Meta:
        db_table = 'fuel_shifts'
        ordering = ['-opened_at']
        verbose_name = 'Üzemanyag műszak'
        verbose_name_plural = 'Üzemanyag műszakok'

    def __str__(self):
        return f'{self.number}. műszak ({self.opened_at:%Y-%m-%d %H:%M} – ' + (
            f'{self.closed_at:%H:%M})' if self.closed_at else 'nyitott)')


class FuelShiftNozzleReading(models.Model):
    """Műszak kútóra (regiszter óra) bejegyzés: nyitó és záró állás pisztolyonként."""

    shift = models.ForeignKey(
        FuelShift, on_delete=models.CASCADE, related_name='nozzle_readings',
        verbose_name='Műszak',
    )
    pump = models.ForeignKey(FuelPump, on_delete=models.PROTECT, verbose_name='Kútfej')
    nozzle_number = models.PositiveSmallIntegerField(verbose_name='Pisztoly')
    fuel_grade = models.ForeignKey(
        FuelGrade, on_delete=models.PROTECT, verbose_name='Üzemanyag fajta'
    )
    opening_total = models.DecimalField(
        max_digits=14, decimal_places=3, default=0, verbose_name='Nyitó óraállás (liter)'
    )
    closing_total = models.DecimalField(
        max_digits=14, decimal_places=3, null=True, blank=True, verbose_name='Záró óraállás (liter)'
    )
    closing_source = models.CharField(
        max_length=10, choices=[('auto', 'Kiolvasva'), ('manual', 'Kézi')],
        default='manual', verbose_name='Záró állás forrása',
    )

    class Meta:
        db_table = 'fuel_shift_nozzle_readings'
        unique_together = [('shift', 'pump', 'nozzle_number')]
        ordering = ['pump__pump_id', 'nozzle_number']
        verbose_name = 'Műszak kútóra bejegyzés'
        verbose_name_plural = 'Műszak kútóra bejegyzések'

    def __str__(self):
        return f'{self.pump}/{self.nozzle} — {self.opening_total} → {self.closing_total}'

    @property
    def movement(self):
        """Elmozdulás (liter) a műszakban; None, amíg nincs záró állás."""
        if self.closing_total is None:
            return None
        return (self.closing_total - self.opening_total).quantize(Decimal('0.001'))


class FuelShiftTankReading(models.Model):
    """Műszak tartály-leltár bejegyzés üzemanyag fajtánként (elszámolás)."""

    shift = models.ForeignKey(
        FuelShift, on_delete=models.CASCADE, related_name='tank_readings',
        verbose_name='Műszak',
    )
    fuel_grade = models.ForeignKey(FuelGrade, on_delete=models.PROTECT, verbose_name='Üzemanyag fajta')
    material = models.ForeignKey(
        'warehouse.Material', on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Termék (denormalizált)',
    )
    opening_stock = models.DecimalField(
        max_digits=14, decimal_places=3, default=0, verbose_name='Nyitó tartály készlet (liter)'
    )
    received = models.DecimalField(
        max_digits=14, decimal_places=3, default=0, verbose_name='Bevételezés (liter)'
    )
    dispensed = models.DecimalField(
        max_digits=14, decimal_places=3, default=0, verbose_name='Készletcsökkenés – kútóra elmozdulás (liter)'
    )
    calculated_closing = models.DecimalField(
        max_digits=14, decimal_places=3, null=True, blank=True,
        verbose_name='Számított záró készlet (liter)',
    )
    measured_closing = models.DecimalField(
        max_digits=14, decimal_places=3, null=True, blank=True,
        verbose_name='Mért (tényleges) záró készlet (liter)',
    )
    difference = models.DecimalField(
        max_digits=14, decimal_places=3, null=True, blank=True,
        verbose_name='Eltérés (mért – számított)',
    )

    class Meta:
        db_table = 'fuel_shift_tank_readings'
        unique_together = [('shift', 'fuel_grade')]
        ordering = ['fuel_grade__fuel_grade_id']
        verbose_name = 'Műszak tartály bejegyzés'
        verbose_name_plural = 'Műszak tartály bejegyzések'

    def __str__(self):
        return f'{self.fuel_grade} — nyitó {self.opening_stock} l'
