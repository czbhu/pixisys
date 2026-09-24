"""Hűségprogram: pontgyűjtés, üzemanyagkártya, ügyfél-termék kedvezmények.

A pontok egyszeres könyvelésű (ledger) bejegyzésekből számolódnak
(LoyaltyPointEntry), az üzemanyagkártya külön egyenleggel és saját
tranzakció-naplóval rendelkezik."""
import secrets
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone


class LoyaltyConfig(models.Model):
    """Hűségprogram beállítások (singleton)."""

    points_per_100_ft = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal('1'),
        verbose_name='Pont / 100 Ft vásárlás után',
    )
    welcome_points = models.IntegerField(default=0, verbose_name='Üdvözlő pont regisztrációkor')
    qr_token_ttl_seconds = models.PositiveIntegerField(default=120, verbose_name='QR token élettartama (s)')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'loyalty_config'
        verbose_name = 'Hűségprogram beállítás'
        verbose_name_plural = 'Hűségprogram beállítások'

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        return obj or cls.objects.create()


class LoyaltyPointEntry(models.Model):
    """Pontmozgás: vásárlás ( + ), kézi jóváírás/leírás, regisztrációs bónusz."""

    customer = models.ForeignKey(
        'crm.Company', on_delete=models.CASCADE, related_name='loyalty_entries',
        verbose_name='Ügyfél',
    )
    points = models.IntegerField(verbose_name='Pont (±)')
    reason = models.CharField(max_length=30, verbose_name='Ok')
    pos_transaction = models.ForeignKey(
        'sales.POSTransaction', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='loyalty_entries', verbose_name='POS bizonylat',
    )
    note = models.CharField(max_length=200, blank=True, default='', verbose_name='Megjegyzés')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Rögzítette',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loyalty_point_entries'
        ordering = ['-created_at']
        verbose_name = 'Hűsegpont bejegyzés'
        verbose_name_plural = 'Hűségpont bejegyzések'

    def __str__(self):
        return f'{self.customer_id}: {self.points:+d} p ({self.reason})'


def customer_points_balance(customer):
    from django.db.models import Sum
    agg = LoyaltyPointEntry.objects.filter(customer=customer).aggregate(p=Sum('points'))
    return agg['p'] or 0


class FuelCard(models.Model):
    """Üzemanyagkártya: egy ügyfélhez egy kártya, előre feltölthető egyenleggel."""

    customer = models.OneToOneField(
        'crm.Company', on_delete=models.CASCADE, related_name='fuel_card', verbose_name='Ügyfél',
    )
    card_number = models.CharField(max_length=30, unique=True, verbose_name='Kártyaszám')
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name='Egyenleg (Ft)')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'loyalty_fuel_cards'
        verbose_name = 'Üzemanyagkártya'
        verbose_name_plural = 'Üzemanyagkártyák'

    def save(self, *args, **kwargs):
        if not self.card_number:
            self.card_number = f'FC-{secrets.token_hex(4).upper()}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.card_number} ({self.customer_id}) – {self.balance} Ft'


class FuelCardTransaction(models.Model):
    """Üzemanyagkártya tranzakció: feltöltés (+) / vásárlás (−)."""

    card = models.ForeignKey(
        FuelCard, on_delete=models.CASCADE, related_name='transactions', verbose_name='Kártya',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, verbose_name='Összeg (±)')
    note = models.CharField(max_length=200, blank=True, default='', verbose_name='Megjegyzés')
    pos_transaction = models.ForeignKey(
        'sales.POSTransaction', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fuel_card_transactions', verbose_name='POS bizonylat',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Rögzítette',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loyalty_fuel_card_transactions'
        ordering = ['-created_at']
        verbose_name = 'Üzemanyagkártya tranzakció'
        verbose_name_plural = 'Üzemanyagkártya tranzakciók'


class CustomerProductDiscount(models.Model):
    """Ügyfélre vonatkozó termékkedvezmény: a POS azonosítás után automatikusan alkalmazza."""

    customer = models.ForeignKey(
        'crm.Company', on_delete=models.CASCADE, related_name='product_discounts', verbose_name='Ügyfél',
    )
    material = models.ForeignKey(
        'warehouse.Material', on_delete=models.CASCADE, related_name='customer_discounts',
        verbose_name='Termék',
    )
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, verbose_name='Kedvezmény (%)')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loyalty_customer_product_discounts'
        unique_together = [('customer', 'material')]
        verbose_name = 'Ügyfél termékkedvezmény'
        verbose_name_plural = 'Ügyfél termékkedvezmények'

    def __str__(self):
        return f'{self.customer_id}/{self.material_id}: -{self.discount_percent}%'


# ------------------------------------------------------------ dinamikus QR token

QR_TOKEN_VERSION = 'P1'


def _qr_secret():
    return (getattr(settings, 'SECRET_KEY', '') or 'pixierp').encode()


def generate_qr_token(customer_id, ttl_seconds=None):
    """Változó (időkorlátozott, aláírt) azonosító token a kassza QR-hoz."""
    import hashlib
    import hmac
    import time as _time
    if ttl_seconds is None:
        ttl_seconds = LoyaltyConfig.get_solo().qr_token_ttl_seconds
    expires = int(_time.time()) + int(ttl_seconds)
    payload = f'{QR_TOKEN_VERSION}.{customer_id}.{expires}'
    sig = hmac.new(_qr_secret(), payload.encode(), hashlib.sha256).hexdigest()[:20]
    return f'{payload}.{sig}'


def verify_qr_token(token):
    """Visszaadja a customer_id-t, ha a token érvényes és nem járt le; különben None."""
    import hashlib
    import hmac
    import time as _time
    try:
        version, customer_id, expires, sig = str(token or '').strip().split('.')
        if version != QR_TOKEN_VERSION:
            return None
        payload = f'{version}.{customer_id}.{expires}'
        expect = hmac.new(_qr_secret(), payload.encode(), hashlib.sha256).hexdigest()[:20]
        if not hmac.compare_digest(expect, sig):
            return None
        if int(expires) < _time.time():
            return None
        return int(customer_id)
    except Exception:
        return None
