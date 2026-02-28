from django.db import models
from django.contrib.auth import get_user_model
from apps.crm.models import Company
from apps.core.models import Currency
from apps.hr.models import Employee

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


class CashTransactionReason(models.Model):
    """Kassza tranzakció okok - konfigurálható lista"""
    name = models.CharField(max_length=100, unique=True, verbose_name="Megnevezés")
    is_deposit = models.BooleanField(default=True, verbose_name="Betét művelet")
    is_withdrawal = models.BooleanField(default=True, verbose_name="Kivét művelet")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    order = models.IntegerField(default=0, verbose_name="Sorrend")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Kassza művelet ok"
        verbose_name_plural = "Kassza művelet okok"
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class CashRegister(models.Model):
    """Pénztárgép/Kassza"""
    name = models.CharField(max_length=100, verbose_name="Kassza neve")
    location = models.CharField(max_length=200, blank=True, default='', verbose_name="Kassza helye")
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, verbose_name="Pénznem")
    initial_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="Kezdő egyenleg")
    current_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="Jelenlegi egyenleg")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    is_pos_default = models.BooleanField(default=False, verbose_name="POS alapértelmezett kassza")
    email_notify_on_deposit = models.BooleanField(default=False, verbose_name="E-mail értesítés betétről")
    email_notify_on_withdrawal = models.BooleanField(default=False, verbose_name="E-mail értesítés kivétről")
    notify_users = models.ManyToManyField(Employee, blank=True, related_name='cash_register_notifications', verbose_name="Értesítendő alkalmazottak")
    transaction_view_employees = models.ManyToManyField(Employee, blank=True, related_name='cash_register_transaction_view', verbose_name="Forgalmi lista jogosult alkalmazottak")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, related_name='created_cash_registers', verbose_name="Létrehozta")

    class Meta:
        verbose_name = "Kassza"
        verbose_name_plural = "Kasszák"
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.location})"


class CashRegisterEmployee(models.Model):
    """Kassza-Alkalmazott kapcsolat jogosultságokkal"""
    cash_register = models.ForeignKey(CashRegister, on_delete=models.CASCADE, related_name='employee_permissions', verbose_name="Kassza")
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='cash_register_permissions', verbose_name="Alkalmazott")
    can_deposit = models.BooleanField(default=True, verbose_name="Betét jog")
    can_withdraw = models.BooleanField(default=True, verbose_name="Kivét jog")
    can_view = models.BooleanField(default=True, verbose_name="Megtekintés jog")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Kassza alkalmazott"
        verbose_name_plural = "Kassza alkalmazottak"
        unique_together = ['cash_register', 'employee']

    def __str__(self):
        return f"{self.cash_register.name} - {self.employee.user.username}"


class CashRegisterTransaction(models.Model):
    """Kassza tranzakció - betét/kivét/mozgatás"""
    cash_register = models.ForeignKey(CashRegister, on_delete=models.CASCADE, related_name='transactions', verbose_name="Kassza")
    employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, related_name='cash_transactions', verbose_name="Alkalmazott")
    amount = models.DecimalField(max_digits=14, decimal_places=2, verbose_name="Összeg")
    reason = models.ForeignKey(CashTransactionReason, on_delete=models.PROTECT, null=True, blank=True, verbose_name="Művelet oka")
    note = models.TextField(blank=True, default='', verbose_name="Megjegyzés")
    balance_before = models.DecimalField(max_digits=14, decimal_places=2, verbose_name="Egyenleg előtte")
    balance_after = models.DecimalField(max_digits=14, decimal_places=2, verbose_name="Egyenleg utána")
    target_cash_register = models.ForeignKey(CashRegister, on_delete=models.SET_NULL, null=True, blank=True, related_name='incoming_transfers', verbose_name="Cél kassza")
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name="Időpont")

    class Meta:
        verbose_name = "Kassza tranzakció"
        verbose_name_plural = "Kassza tranzakciók"
        ordering = ['-timestamp']

    def __str__(self):
        sign = '+' if self.amount >= 0 else ''
        return f"{self.cash_register.name} - {sign}{self.amount} ({self.timestamp.strftime('%Y-%m-%d %H:%M')})"
