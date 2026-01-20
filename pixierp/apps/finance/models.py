from django.db import models
from django.contrib.auth import get_user_model
from apps.crm.models import Company
from apps.core.models import Currency

User = get_user_model()


class Invoice(models.Model):
    """Számla, külső (PIXINVOICE) szinkron támogatással"""
    external_id = models.CharField(max_length=100, unique=True, db_index=True, help_text="Külső rendszer azonosító")
    number = models.CharField(max_length=50, db_index=True, verbose_name="Számlaszám")
    partner = models.ForeignKey(Company, on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices', verbose_name="Partner")
    partner_external_id = models.CharField(max_length=100, blank=True, default='', db_index=True, verbose_name="Partner külső azonosító")
    currency = models.ForeignKey(Currency, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Pénznem")
    issue_date = models.DateField(null=True, blank=True, verbose_name="Keltezés")
    due_date = models.DateField(null=True, blank=True, verbose_name="Esedékesség")
    paid_date = models.DateField(null=True, blank=True, verbose_name="Fizetés dátuma")
    net_total = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="Nettó összesen")
    vat_total = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="ÁFA összesen")
    gross_total = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="Bruttó összesen")
    status = models.CharField(max_length=50, default='issued', verbose_name="Státusz")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Számla"
        verbose_name_plural = "Számlák"
        ordering = ['-issue_date', '-id']

    def __str__(self):
        return f"{self.number} ({self.gross_total})"


class InvoiceItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items', verbose_name="Számla")
    line_no = models.IntegerField(default=1, verbose_name="Sorszám")
    description = models.CharField(max_length=255, verbose_name="Megnevezés")
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1, verbose_name="Mennyiség")
    unit = models.CharField(max_length=20, default='db', verbose_name="Egység")
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="Egységár (nettó)")
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=27, verbose_name="ÁFA %")
    net_total = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="Nettó összesen")
    vat_total = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="ÁFA összesen")
    gross_total = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="Bruttó összesen")

    class Meta:
        verbose_name = "Számlatétel"
        verbose_name_plural = "Számlatételek"


class Payment(models.Model):
    """Kifizetés/befizetés, számlához kapcsolva"""
    external_id = models.CharField(max_length=100, unique=True, db_index=True, help_text="Külső rendszer azonosító")
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='payments', verbose_name="Számla")
    amount = models.DecimalField(max_digits=14, decimal_places=2, verbose_name="Összeg")
    currency = models.ForeignKey(Currency, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Pénznem")
    date = models.DateField(null=True, blank=True, verbose_name="Dátum")
    method = models.CharField(max_length=50, blank=True, default='', verbose_name="Mód")
    note = models.CharField(max_length=255, blank=True, default='', verbose_name="Megjegyzés")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Kifizetés"
        verbose_name_plural = "Kifizetések"
        ordering = ['-date', '-id']
