from django.db import models
from django.contrib.auth import get_user_model
from apps.core.models import Company
from apps.crm.models import Company as CrmCompany, Contact
from django.utils import timezone

User = get_user_model()

class Customer(models.Model):
    """Ügyfél adatok"""
    name = models.CharField(max_length=200, verbose_name="Ügyfél neve")
    company = models.CharField(max_length=200, verbose_name="Cég neve")
    email = models.EmailField(verbose_name="E-mail")
    phone = models.CharField(max_length=20, verbose_name="Telefon")
    address = models.TextField(blank=True, verbose_name="Cím")
    tax_number = models.CharField(max_length=20, blank=True, verbose_name="Adószám")
    contact_person = models.CharField(max_length=100, blank=True, verbose_name="Kapcsolattartó")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ügyfél"
        verbose_name_plural = "Ügyfelek"
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f"{self.name} ({self.company})"

class Product(models.Model):
    """Termékek"""
    name = models.CharField(max_length=200, verbose_name="Termék neve")
    description = models.TextField(blank=True, verbose_name="Leírás")
    unit = models.CharField(max_length=20, verbose_name="Mértékegység")
    base_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Alapár")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Termék"
        verbose_name_plural = "Termékek"
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.name

class QuoteRequest(models.Model):
    """Árajánlat (korábban: Ajánlatkérés)"""
    STATUS_CHOICES = [
        ('new', 'Új'),
        ('in_progress', 'Feldolgozás alatt'),
        ('quoted', 'Ajánlat kész'),
        ('accepted', 'Elfogadva'),
        ('rejected', 'Elutasítva'),
        ('expired', 'Lejárt'),
        ('archived', 'Archív'),
        ('ordered', 'Megrendelve'),
    ]
    
    # Új mezők az árajánlathoz
    number = models.CharField(max_length=50, unique=True, verbose_name="Ajánlat száma", null=True, blank=True)
    issue_date = models.DateField(default=timezone.now, verbose_name="Keltezés", null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Rögzítette", related_name='created_quotes')
    company = models.ForeignKey(CrmCompany, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Cég (CRM)")
    contacts = models.ManyToManyField(Contact, blank=True, verbose_name="Kapcsolattartók")

    # Visszafelé kompatibilitás (nem használt az új felületen)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, verbose_name="Ügyfél", null=True, blank=True)
    request_number = models.CharField(max_length=50, unique=True, verbose_name="Kérés szám", blank=True)
    title = models.CharField(max_length=200, verbose_name="Cím")
    description = models.TextField(verbose_name="Leírás")
    internal_description = models.TextField(blank=True, verbose_name="Belső leírás")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new', verbose_name="Státusz")
    # requested_by helyett created_by használatos
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Kérte", related_name='requested_quotes', null=True, blank=True)
    deadline = models.DateField(verbose_name="Határidő", null=True, blank=True)
    project = models.ForeignKey('manufacturing.Project', null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Projekt")
    from apps.core.models import Currency
    currency = models.ForeignKey(Currency, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Pénznem")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Publikus megrendelő link token
    public_token = models.CharField(max_length=64, blank=True, null=True, unique=True)
    public_expires_at = models.DateTimeField(blank=True, null=True)
    # Részlegesen megrendelhető
    partial_order_allowed = models.BooleanField(default=True, verbose_name="Részlegesen megrendelhető")
    # Soft delete flag for demands/quotes
    is_deleted = models.BooleanField(default=False, verbose_name="Törölt")
    # Assignment tracking (who handles this RFQ/demand)
    assignees = models.ManyToManyField(User, blank=True, related_name='assigned_quote_requests', verbose_name="Felelősök")
    # Owner after exclusive takeover (Átveszem)
    owner = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_quote_requests', verbose_name="Tulaj (átvevő)")

    class Meta:
        verbose_name = "Árajánlat"
        verbose_name_plural = "Árajánlatok"
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f"{self.request_number} - {self.title}"
    
    def check_and_update_status(self):
        """Ellenőrzi és frissíti az archív státuszt a határidő alapján"""
        from django.utils import timezone
        if self.deadline and timezone.now().date() > self.deadline and self.status not in ['ordered', 'archived']:
            self.status = 'archived'
            self.save(update_fields=['status'])
            return True
        return False


class CustomerOrder(models.Model):
    """Ügyfél megrendelés"""
    STATUS_CHOICES = [
        ('new', 'Új'),
        ('confirmed', 'Megerősítve'),
        ('in_production', 'Gyártásban'),
        ('ready', 'Kész'),
        ('in_delivery', 'Szállítás alatt'),
        ('delivered', 'Kiszállítva'),
        ('cancelled', 'Törölve'),
    ]
    
    quote_request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name='customer_orders', verbose_name="Árajánlat")
    order_number = models.CharField(max_length=50, unique=True, verbose_name="Megrendelés szám")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new', verbose_name="Státusz")
    order_date = models.DateTimeField(auto_now_add=True, verbose_name="Megrendelés dátuma")
    confirmed_at = models.DateTimeField(null=True, blank=True, verbose_name="Megerősítve")
    production_started_at = models.DateTimeField(null=True, blank=True, verbose_name="Gyártás kezdete")
    ready_at = models.DateTimeField(null=True, blank=True, verbose_name="Kész")
    delivery_started_at = models.DateTimeField(null=True, blank=True, verbose_name="Szállítás kezdete")
    delivered_at = models.DateTimeField(null=True, blank=True, verbose_name="Kiszállítva")
    notes = models.TextField(blank=True, default='', verbose_name="Megjegyzések")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    # Publikus szállítólevél link
    public_delivery_token = models.CharField(max_length=64, blank=True, null=True, unique=True, verbose_name="Publikus szállítás token")
    public_delivery_expires_at = models.DateTimeField(blank=True, null=True, verbose_name="Publikus szállítás link lejár")
    delivery_notes = models.TextField(blank=True, default='', verbose_name="Szállítási megjegyzések")
    delivery_confirmed = models.BooleanField(default=False, verbose_name="Szállítólevél visszaigazolva")
    delivery_confirmed_at = models.DateTimeField(null=True, blank=True, verbose_name="Visszaigazolás ideje")
    show_prices = models.BooleanField(default=True, verbose_name="Árak láthatóak a szállítólevélen")
    invoice_number = models.CharField(max_length=100, blank=True, null=True, verbose_name="Számla szám")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ügyfél megrendelés"
        verbose_name_plural = "Ügyfél megrendelések"
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f"{self.order_number} - {self.quote_request.title}"
    
    def check_auto_delivery(self):
        """48 óra után automatikusan kiszállítva"""
        from django.utils import timezone
        from datetime import timedelta
        if self.status == 'in_delivery' and self.delivery_started_at:
            if timezone.now() > self.delivery_started_at + timedelta(hours=48):
                self.status = 'delivered'
                self.delivered_at = timezone.now()
                self.save(update_fields=['status', 'delivered_at'])
                return True
        return False


class CustomerOrderItem(models.Model):
    """Megrendelés tételek"""
    customer_order = models.ForeignKey(CustomerOrder, on_delete=models.CASCADE, related_name='items', verbose_name="Megrendelés")
    quote_item = models.ForeignKey('QuoteRequestItem', on_delete=models.CASCADE, verbose_name="Ajánlat tétel")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    unit = models.CharField(max_length=20, verbose_name="Egység")
    net_unit_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Nettó egységár")
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=27, verbose_name="ÁFA %")
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name="Kedvezmény %")
    description = models.TextField(blank=True, default='', verbose_name="Leírás")

    class Meta:
        verbose_name = "Megrendelés tétel"
        verbose_name_plural = "Megrendelés tételek"

    def __str__(self):
        return f"{self.customer_order.order_number} - {self.description[:50]}"


class Quote(models.Model):
    """Árajánlat"""
    STATUS_CHOICES = [
        ('draft', 'Vázlat'),
        ('sent', 'Elküldve'),
        ('accepted', 'Elfogadva'),
        ('rejected', 'Elutasítva'),
        ('expired', 'Lejárt'),
    ]

    
    quote_request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, verbose_name="Ajánlat kérés")
    quote_number = models.CharField(max_length=50, unique=True, verbose_name="Ajánlat szám")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', verbose_name="Státusz")
    valid_until = models.DateField(verbose_name="Érvényes eddig")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Összeg")
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Készítette")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ajánlat"
        verbose_name_plural = "Ajánlatok"

    def __str__(self):
        return f"{self.quote_number} - {self.quote_request.title}"


class QuoteRequestItem(models.Model):
    """Árajánlat tételek: kész termék, egyedi gyártás vagy szolgáltatás"""
    ITEM_TYPE_CHOICES = [
        ('product', 'Termék'),
        ('manufacturing', 'Egyedi gyártás'),
        ('service', 'Szolgáltatás'),
    ]

    quote_request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name='items', verbose_name="Ajánlatkérés")
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES, verbose_name="Tétel típusa")
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Termék")
    material = models.ForeignKey('warehouse.Material', null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Alapanyag/Termék", related_name='quote_items')
    manufacturing_product = models.ForeignKey('manufacturing.ManufacturingProduct', null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Gyártási termék")
    service = models.ForeignKey('sales.Service', null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Szolgáltatás")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1, verbose_name="Mennyiség")
    unit = models.CharField(max_length=20, default='db', verbose_name="Mennyiségi egység")
    net_unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Nettó egységár")
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=27.0, verbose_name="ÁFA %")
    net_total = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Nettó összesen")
    gross_total = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Bruttó összesen")
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name="Kedvezmény %")
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Kedvezmény (fix)")
    discounted_net_total = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Kedvezményes nettó összesen")
    discounted_gross_total = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Kedvezményes bruttó összesen")
    description = models.TextField(blank=True, verbose_name="Leírás")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ajánlatkérés tétel"
        verbose_name_plural = "Ajánlatkérés tételek"

    def __str__(self):
        ref = (
            self.product.name if self.product else (
                self.material.name if self.material else (
                    self.manufacturing_product.name if self.manufacturing_product else (
                        self.service.name if self.service else '-'
                    )
                )
            )
        )
        num = self.quote_request.number or self.quote_request.request_number
        return f"{num} - {self.get_item_type_display()} - {ref} x {self.quantity}"

    def save(self, *args, **kwargs):
        try:
            qty = self.quantity or 0
            unit_price = self.net_unit_price or 0
            self.net_total = qty * unit_price
            # apply percent first, then fixed amount capped at net_total
            discounted = self.net_total
            if (self.discount_percent or 0) > 0:
                discounted = discounted * (1 - float(self.discount_percent) / 100.0)
            if (self.discount_amount or 0) > 0:
                discounted = max(0, discounted - float(self.discount_amount))
            self.discounted_net_total = discounted
            self.gross_total = self.net_total * (1 + (self.vat_rate or 0) / 100)
            self.discounted_gross_total = self.discounted_net_total * (1 + (self.vat_rate or 0) / 100)
        except Exception:
            pass
        super().save(*args, **kwargs)


class Service(models.Model):
    """Szolgáltatás törzs"""
    code = models.CharField(max_length=50, verbose_name="Cikkszám", blank=True)
    name = models.CharField(max_length=200, verbose_name="Szolgáltatás neve")
    description = models.TextField(blank=True, verbose_name="Leírás")
    unit = models.CharField(max_length=20, default='óra', verbose_name="Mértékegység")
    base_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Alap nettó ár")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Szolgáltatás"
        verbose_name_plural = "Szolgáltatások"
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.name


class QuoteLog(models.Model):
    """Árajánlat műveletek naplója"""
    quote = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name='logs')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Árajánlat napló"
        verbose_name_plural = "Árajánlat naplók"

class QuoteRequestInvitation(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Függőben'),
        ('accepted', 'Elfogadva'),
        ('declined', 'Elutasítva'),
    ]
    quote_request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name='invitations')
    invitee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='rfq_invitations')
    invited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='rfq_sent_invitations')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Igény meghívás'
        verbose_name_plural = 'Igény meghívások'
        unique_together = ('quote_request', 'invitee', 'status')

class QuoteRequestEmailLog(models.Model):
    quote_request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name='email_logs')
    to = models.TextField()
    cc = models.TextField(blank=True, default='')
    subject = models.CharField(max_length=255)
    body_preview = models.TextField(blank=True, default='')
    sent_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    sent_at = models.DateTimeField(auto_now_add=True)
    message_id = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        verbose_name = 'Árajánlat e-mail napló'
        verbose_name_plural = 'Árajánlat e-mail naplók'

class QuoteRequestAttachment(models.Model):
    quote_request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='quote_requests/%Y/%m/%d/')
    remark = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ajánlat csatolmány"
        verbose_name_plural = "Ajánlat csatolmányok"

    def __str__(self):
        return f"Attachment for quote {self.quote_request_id}: {self.file.name}"

class QuoteRequestItemAttachment(models.Model):
    quote_item = models.ForeignKey(QuoteRequestItem, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='quote_items/%Y/%m/%d/')
    remark = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ajánlat tétel csatolmány"
        verbose_name_plural = "Ajánlat tétel csatolmányok"

    def __str__(self):
        return f"Attachment for item {self.quote_item_id}: {self.file.name}"

class SearchStat(models.Model):
    ITEM_TYPE_CHOICES = [
        ('product', 'Termék'),
        ('service', 'Szolgáltatás'),
        ('manufacturing', 'Egyedi gyártás'),
    ]
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES)
    ref_id = models.IntegerField()
    count = models.IntegerField(default=0)
    last_hit = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('item_type', 'ref_id')
        verbose_name = "Keresési statisztika"
        verbose_name_plural = "Keresési statisztikák"

class QuoteItem(models.Model):
    """Ajánlat tételek"""
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name='items', verbose_name="Ajánlat")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Termék")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Egységár")
    total_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Összár")
    description = models.TextField(blank=True, verbose_name="Leírás")
    is_accepted = models.BooleanField(default=False, verbose_name="Elfogadva")
    accepted_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Elfogadott mennyiség")

    class Meta:
        verbose_name = "Ajánlat tétel"
        verbose_name_plural = "Ajánlat tételek"

    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)

class Order(models.Model):
    """Megrendelés"""
    STATUS_CHOICES = [
        ('draft', 'Vázlat'),
        ('confirmed', 'Megerősítve'),
        ('in_production', 'Gyártásban'),
        ('completed', 'Kész'),
        ('shipped', 'Szállítva'),
        ('delivered', 'Kiszállítva'),
        ('cancelled', 'Törölve'),
    ]
    
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, verbose_name="Ajánlat")
    order_number = models.CharField(max_length=50, unique=True, verbose_name="Megrendelés szám")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', verbose_name="Státusz")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Összeg")
    delivery_date = models.DateField(verbose_name="Szállítási dátum")
    notes = models.TextField(blank=True, verbose_name="Megjegyzések")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Készítette")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Megrendelés"
        verbose_name_plural = "Megrendelések"
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f"{self.order_number} - {self.quote.quote_request.title}"

class OrderItem(models.Model):
    """Megrendelés tételek"""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items', verbose_name="Megrendelés")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Termék")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Egységár")
    total_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Összár")
    description = models.TextField(blank=True, verbose_name="Leírás")

    class Meta:
        verbose_name = "Megrendelés tétel"
        verbose_name_plural = "Megrendelés tételek"

    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)

# Régi modelljeinket is megtartjuk kompatibilitás miatt
class Lead(models.Model):
    name = models.CharField(max_length=200)
    company = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    status = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Opportunity(models.Model):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    probability = models.IntegerField()
    expected_close_date = models.DateField()
    status = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Forecast(models.Model):
    period = models.CharField(max_length=50)
    expected_revenue = models.DecimalField(max_digits=10, decimal_places=2)
    actual_revenue = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
