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
        ('in_design', 'Tervezés alatt'),
        ('pending_customer_approval', 'Ügyfél jóváhagyásra vár'),
        ('pending_internal_approval', 'Belső jóváhagyásra vár'),
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
    status = models.CharField(max_length=40, choices=STATUS_CHOICES, default='new', verbose_name="Státusz")
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
    # Érvényességi idő (napokban) és lejárati dátum
    validity_days = models.PositiveIntegerField(default=30, verbose_name="Érvényesség (nap)")
    valid_until = models.DateField(null=True, blank=True, verbose_name="Érvényes")
    # RFQ-szintű impozíció presetek (lista)
    imposition_presets = models.JSONField(default=list, blank=True, verbose_name="Impozíció presetek")
    is_manufacturable = models.BooleanField(default=False, verbose_name="Gyártható")
    manufacturable_marked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='manufacturable_marked_quote_requests', verbose_name="Gyárthatóvá tette")
    manufacturable_marked_at = models.DateTimeField(null=True, blank=True, verbose_name="Gyárthatóvá jelölés ideje")

    # RFQ-first transition snapshot fields (1 RFQ = 1 item = 1 order)
    primary_item_name = models.CharField(max_length=200, blank=True, default='', verbose_name="Elsődleges tétel neve")
    primary_item_description = models.TextField(blank=True, default='', verbose_name="Elsődleges tétel leírás")
    primary_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1, verbose_name="Elsődleges mennyiség")
    primary_unit = models.CharField(max_length=20, default='db', verbose_name="Elsődleges egység")
    primary_net_unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Elsődleges nettó egységár")
    primary_vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=27.0, verbose_name="Elsődleges ÁFA %")
    primary_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name="Elsődleges kedvezmény %")
    primary_quote_item_id = models.IntegerField(null=True, blank=True, verbose_name="Elsődleges tétel azonosító")

    primary_order_number = models.CharField(max_length=50, blank=True, default='', verbose_name="Elsődleges megrendelés szám")
    primary_delivery_note_number = models.CharField(max_length=50, blank=True, default='', verbose_name="Elsődleges szállítólevél szám")
    primary_invoice_number = models.CharField(max_length=100, blank=True, default='', verbose_name="Elsődleges számla szám")

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
    delivery_note_number = models.CharField(max_length=50, blank=True, null=True, unique=True, verbose_name="Szállítólevél sorszám")
    delivery_notes = models.TextField(blank=True, default='', verbose_name="Szállítási megjegyzések")
    delivery_confirmed = models.BooleanField(default=False, verbose_name="Szállítólevél visszaigazolva")
    delivery_confirmed_at = models.DateTimeField(null=True, blank=True, verbose_name="Visszaigazolás ideje")
    show_prices = models.BooleanField(default=True, verbose_name="Árak láthatóak a szállítólevélen")
    invoice_number = models.CharField(max_length=100, blank=True, null=True, verbose_name="Számla szám")
    deadline = models.DateField(null=True, blank=True, verbose_name="Szállítási határidő")
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="Megrendelő IP-cím")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ügyfél megrendelés"
        verbose_name_plural = "Ügyfél megrendelések"
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f"{self.order_number} - {self.quote_request.title}"
    
    def save(self, *args, **kwargs):
        is_new = self.pk is None
        old_status = None
        if not is_new:
            try:
                old_instance = CustomerOrder.objects.get(pk=self.pk)
                old_status = old_instance.status
            except CustomerOrder.DoesNotExist:
                pass

        super().save(*args, **kwargs)
        
        if not is_new and old_status and self.status != old_status:
            self.propagate_status_down()

    def propagate_status_down(self):
        STATUS_ORDER = ['new', 'confirmed', 'in_production', 'ready', 'in_delivery', 'delivered']
        if self.status not in STATUS_ORDER: return
        
        try:
            current_rank = STATUS_ORDER.index(self.status)
        except ValueError:
            return

        for item in self.items.exclude(status='cancelled'):
            if item.status not in STATUS_ORDER: continue
            
            try:
                item_rank = STATUS_ORDER.index(item.status)
            except ValueError:
                continue
                
            if item_rank < current_rank:
                item.status = self.status
                item.save()

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

    @classmethod
    def sync_status_from_items(cls, order_id):
        """Biztonsági háló: a szülő-rendelés státuszát közvetlenül a tételek
        minimális státuszából számítja és szükség esetén frissíti.
        Szállítólevél-megerősítés után hívandó, a modell-szintű
        check_parent_status() mellé redundáns védelemként."""
        STATUS_ORDER = ['new', 'confirmed', 'in_production', 'ready', 'in_delivery', 'delivered']
        try:
            order = cls.objects.get(id=order_id)
            if order.status not in STATUS_ORDER:
                return
            items = order.items.exclude(status='cancelled')
            if not items.exists():
                return
            ranks = [STATUS_ORDER.index(it.status) for it in items if it.status in STATUS_ORDER]
            if not ranks:
                return
            min_rank = min(ranks)
            parent_rank = STATUS_ORDER.index(order.status)
            if min_rank > parent_rank:
                from django.utils import timezone as tz
                now = tz.now()
                new_status = STATUS_ORDER[min_rank]
                order.status = new_status
                update_fields = ['status']
                if new_status == 'delivered' and not order.delivered_at:
                    order.delivered_at = now
                    update_fields.append('delivered_at')
                order.save(update_fields=update_fields)
        except Exception:
            pass


class CustomerOrderItem(models.Model):
    """Megrendelés tételek"""
    STATUS_CHOICES = [
        ('new', 'Új'),
        ('confirmed', 'Megerősítve'),
        ('in_production', 'Gyártásban'),
        ('ready', 'Kész'),
        ('in_delivery', 'Szállítás alatt'),
        ('delivered', 'Kiszállítva'),
        ('cancelled', 'Törölve'),
    ]

    customer_order = models.ForeignKey(CustomerOrder, on_delete=models.CASCADE, related_name='items', verbose_name="Megrendelés")
    quote_item = models.ForeignKey('QuoteRequestItem', on_delete=models.CASCADE, verbose_name="Ajánlat tétel")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new', verbose_name="Státusz")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    unit = models.CharField(max_length=20, verbose_name="Egység")
    net_unit_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Nettó egységár")
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=27, verbose_name="ÁFA %")
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name="Kedvezmény %")
    description = models.TextField(blank=True, default='', verbose_name="Leírás")
    remark = models.TextField(blank=True, default='', verbose_name="Belső megjegyzés")

    class Meta:
        verbose_name = "Megrendelés tétel"
        verbose_name_plural = "Megrendelés tételek"

    def __str__(self):
        return f"{self.customer_order.order_number} - {self.description[:50]}"

    def save(self, *args, **kwargs):
        old_status = None
        if self.pk:
            try:
                old_status = type(self).objects.only('status').get(pk=self.pk).status
            except type(self).DoesNotExist:
                pass
        super().save(*args, **kwargs)
        self.check_parent_status()
        if old_status != self.status:
            self._propagate_status_to_cost_items()

    def _propagate_status_to_cost_items(self):
        """Push this item's status down to the cost_items of the underlying
        manufacturing product. Only upgrades — never downgrades. Cancelled
        cost items are left alone."""
        STATUS_ORDER = ['new', 'confirmed', 'in_production', 'ready', 'in_delivery', 'delivered']
        if self.status not in STATUS_ORDER:
            return
        qi = self.quote_item
        mp = getattr(qi, 'manufacturing_product', None) if qi else None
        if not mp:
            return
        target_rank = STATUS_ORDER.index(self.status)
        from apps.manufacturing.models import ManufacturingCostItem
        items = ManufacturingCostItem.objects.filter(product=mp).exclude(status='cancelled')
        for ci in items:
            if ci.status not in STATUS_ORDER:
                continue
            if STATUS_ORDER.index(ci.status) < target_rank:
                ci.status = self.status
                ci.save(update_fields=['status'])

    def check_parent_status(self):
        STATUS_ORDER = ['new', 'confirmed', 'in_production', 'ready', 'in_delivery', 'delivered']
        parent = self.customer_order

        if self.status == 'cancelled':
            # Ha az összes tétel törölve, a megrendelés is legyen törölve
            if parent.status != 'cancelled' and parent.items.exists():
                if not parent.items.exclude(status='cancelled').exists():
                    parent.status = 'cancelled'
                    parent.save(update_fields=['status'])
            return

        if self.status not in STATUS_ORDER: return
        if parent.status not in STATUS_ORDER: return
        
        # Calculate the minimum status rank of all items
        items = parent.items.exclude(status='cancelled')
        if not items.exists(): return
        
        min_rank = 999
        for item in items:
            s = item.status
            if s not in STATUS_ORDER: continue 
            rank = STATUS_ORDER.index(s)
            if rank < min_rank:
                min_rank = rank
        
        # Current parent rank
        parent_rank = STATUS_ORDER.index(parent.status)
        
        # If the minimum rank of all items is higher than parent's current rank, upgrade parent
        if min_rank > parent_rank and min_rank != 999:
            new_status = STATUS_ORDER[min_rank]
            parent.status = new_status
            
            # Update timestamps
            from django.utils import timezone
            now = timezone.now()
            if new_status == 'confirmed' and not parent.confirmed_at: parent.confirmed_at = now
            if new_status == 'in_production' and not parent.production_started_at: parent.production_started_at = now
            if new_status == 'ready' and not parent.ready_at: parent.ready_at = now
            if new_status == 'in_delivery' and not parent.delivery_started_at: parent.delivery_started_at = now
            if new_status == 'delivered' and not parent.delivered_at: parent.delivered_at = now
            
            parent.save()


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


def generate_item_quote_number():
    """Tételenként egyedi ajánlatszám generálása: YYYYMMDD + sorszám.
    A sorszám a napi prefixre nézve a QuoteRequestItem.quote_number és a
    QuoteRequest.number értékek közös sorozatából a következő szabad érték."""
    from django.utils import timezone
    prefix = timezone.now().strftime('%Y%m%d')
    seqs = []
    for val in QuoteRequestItem.objects.filter(
        quote_number__startswith=prefix
    ).values_list('quote_number', flat=True):
        try:
            seqs.append(int(val[len(prefix):]))
        except (ValueError, TypeError):
            pass
    for val in QuoteRequest.objects.filter(
        number__startswith=prefix
    ).values_list('number', flat=True):
        try:
            seqs.append(int(val[len(prefix):]))
        except (ValueError, TypeError):
            pass
    seq = (max(seqs) + 1) if seqs else 1
    candidate = f"{prefix}{seq:02d}"
    while (
        QuoteRequestItem.objects.filter(quote_number=candidate).exists()
        or QuoteRequest.objects.filter(number=candidate).exists()
    ):
        seq += 1
        candidate = f"{prefix}{seq:02d}"
    return candidate


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
    service = models.ForeignKey('manufacturing.Service', null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Szolgáltatás")
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
    item_name = models.CharField(max_length=200, blank=True, default='', verbose_name="Tétel név")
    description = models.TextField(blank=True, verbose_name="Leírás")
    internal_description = models.TextField(blank=True, default='', verbose_name="Belső leírás")

    # Per-item impozíció pillanatkép (független minden más tételtől és a globális presetektől)
    imposition_data = models.JSONField(blank=True, null=True, default=dict, verbose_name="Impozíció adatok")

    # Képletek tárolása (pl. 'quantity_formula': '100*1.5')
    formulas = models.JSONField(default=dict, blank=True, null=True, verbose_name="Képletek")

    # Közvetlen gyártási tétel költségtételei (MP nélküli direct flow esetén)
    cost_items_data = models.JSONField(default=list, blank=True, verbose_name="Közvetlen költségtételek")

    # Ordering and Nesting
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Sorrend")
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children', verbose_name="Szülő tétel")
    
    item_status = models.CharField(
        max_length=20,
        choices=[
            ('new', 'Új'),
            ('in_progress', 'Feldolgozás alatt'),
            ('quoted', 'Ajánlat kész'),
            ('accepted', 'Elfogadva'),
            ('rejected', 'Elutasítva'),
            ('ordered', 'Megrendelve'),
            ('archived', 'Archív'),
        ],
        default='new',
        blank=True,
        verbose_name="Tétel státusz"
    )
    # Rögzített árfolyam: ha is_rate_locked=True, a locked_exchange_rate értékét
    # használjuk a sell-currency → RFQ-currency konverziónál az aktuális Currency.exchange_rate helyett.
    is_rate_locked = models.BooleanField(default=False, verbose_name="Árfolyam rögzítve")
    locked_exchange_rate = models.DecimalField(
        max_digits=14, decimal_places=6, null=True, blank=True,
        verbose_name="Rögzített árfolyam"
    )
    quote_number = models.CharField(
        max_length=50, blank=True, null=True, unique=True,
        verbose_name="Ajánlatszám"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ajánlatkérés tétel"
        verbose_name_plural = "Ajánlatkérés tételek"
        ordering = ['sort_order', 'id']

    def __str__(self):
        ref = self.item_name or (
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
        # Ajánlatszám (tételenként egyedi) generálása, ha még nincs
        if not self.quote_number:
            # Ha ez az első (és egyetlen) tétel a QR-ban, örökli a QR számát.
            # Így az ajánlatszám == cikkszám == megrendelésszám ugyanaz marad.
            try:
                parent_qr = self.quote_request
                parent_number = getattr(parent_qr, 'number', None)
                if parent_number:
                    sibling_count = QuoteRequestItem.objects.filter(
                        quote_request=parent_qr
                    ).exclude(pk=self.pk).count()
                    if sibling_count == 0:
                        # Első/egyetlen tétel: QR számát veszi át
                        if not QuoteRequestItem.objects.filter(
                            quote_number=parent_number
                        ).exclude(pk=self.pk).exists():
                            self.quote_number = parent_number
            except Exception:
                pass
            if not self.quote_number:
                self.quote_number = generate_item_quote_number()
        super().save(*args, **kwargs)
        # Szinkronizálja a már létező megrendelés tételeket
        self._sync_customer_order_items()

    def _sync_customer_order_items(self):
        """Az ajánlat tétel változásait tükrözze az összes aktív megrendelés tételbe.
        Csak a lezárt (delivered, cancelled) MEGRENDELÉSEK tételeit hagyjuk ki –
        az egyes tételek státusza (pl. delivered) nem akadályozza az ár-szinkronizációt."""
        SKIP_ORDER_STATUSES = ('delivered', 'cancelled')
        order_items = self.customerorderitem_set.exclude(
            customer_order__status__in=SKIP_ORDER_STATUSES
        ).exclude(status='cancelled')
        if not order_items.exists():
            return
        for oi in order_items:
            changed_fields = []
            for field in ('quantity', 'unit', 'net_unit_price', 'vat_rate', 'discount_percent', 'description'):
                new_val = getattr(self, field, None)
                if getattr(oi, field, None) != new_val:
                    setattr(oi, field, new_val)
                    changed_fields.append(field)
            if changed_fields:
                oi.save(update_fields=changed_fields)


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
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="IP cím")
    meta = models.JSONField(default=dict, blank=True, null=True, verbose_name="Metaadatok")

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
    original_filename = models.CharField(max_length=255, blank=True, verbose_name='Eredeti fájlnév')
    remark = models.CharField(max_length=255, blank=True)
    is_manufacturing_file = models.BooleanField(default=False, verbose_name='Gyártási fájl')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_quote_request_attachments')
    approved_at = models.DateTimeField(null=True, blank=True)
    storage_file_id = models.IntegerField(null=True, blank=True, verbose_name='Storage fájl ID')
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
    original_filename = models.CharField(max_length=255, blank=True, verbose_name='Eredeti fájlnév')
    remark = models.CharField(max_length=255, blank=True)
    is_documentation = models.BooleanField(default=False, verbose_name='Kész dokumentáció')
    storage_file_id = models.IntegerField(null=True, blank=True, verbose_name='Storage fájl ID')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ajánlat tétel csatolmány"
        verbose_name_plural = "Ajánlat tétel csatolmányok"

    def __str__(self):
        return f"Attachment for item {self.quote_item_id}: {self.file.name}"


class QuoteRequestItemCostAttachment(models.Model):
    """Csatolmányok a cost_items_data JSON altételeihez (direct QRI, MP nélkül)."""
    quote_item = models.ForeignKey(QuoteRequestItem, on_delete=models.CASCADE, related_name='cost_attachments')
    cost_item_local_id = models.IntegerField(verbose_name='Altétel helyi ID (cost_items_data)')
    file = models.FileField(upload_to='quote_cost_items/%Y/%m/%d/')
    original_filename = models.CharField(max_length=255, blank=True)
    file_size = models.IntegerField(null=True, blank=True)
    remark = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Direct altétel csatolmány"
        verbose_name_plural = "Direct altétel csatolmányok"
        ordering = ['-created_at']

    @property
    def file_url(self):
        if self.file:
            return self.file.url
        return None

    def __str__(self):
        return f"CostAtt item={self.quote_item_id} local={self.cost_item_local_id}: {self.original_filename}"

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
    user = models.ForeignKey(
        'auth.User', null=True, blank=True, on_delete=models.CASCADE,
        related_name='search_stats', verbose_name="Felhasználó"
    )

    class Meta:
        unique_together = ('item_type', 'ref_id', 'user')
        verbose_name = "Keresési statisztika"
        verbose_name_plural = "Keresési statisztikák"

class QuoteRequestCost(models.Model):
    """Ajánlat költségek"""
    quote_request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name='costs', verbose_name="Ajánlat")
    material = models.ForeignKey('warehouse.Material', null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Alapanyag")
    code = models.CharField(max_length=50, blank=True, verbose_name="Cikkszám")
    name = models.CharField(max_length=200, verbose_name="Megnevezés")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1, verbose_name="Mennyiség")
    unit = models.CharField(max_length=20, default='db', verbose_name="Egység")
    net_unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Nettó egységár")
    net_total = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Nettó összesen")
    supplier = models.ForeignKey(CrmCompany, null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Beszállító", related_name='quote_costs')
    is_stock = models.BooleanField(default=False, verbose_name="Raktári")
    currency_code = models.CharField(max_length=3, default='HUF', verbose_name="Pénznem")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Ajánlat költség"
        verbose_name_plural = "Ajánlat költségek"

    def save(self, *args, **kwargs):
        self.net_total = (self.quantity or 0) * (self.net_unit_price or 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.quantity} {self.unit})"

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

class WorkLog(models.Model):
    """Munka idő nyilvántartás (Stopper)"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='work_logs', verbose_name="Felhasználó")
    customer_order = models.ForeignKey(CustomerOrder, on_delete=models.CASCADE, related_name='work_logs', verbose_name="Megrendelés", null=True, blank=True)
    order_label = models.CharField(max_length=300, blank=True, default='', verbose_name="Megrendelés megnevezése (szabad szöveges)")
    item = models.ForeignKey(CustomerOrderItem, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Tétel")
    sub_item = models.ForeignKey(
        'manufacturing.ManufacturingCostItem',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        verbose_name="Altétel"
    )
    workflow_name = models.CharField(max_length=200, verbose_name="Munkafolyamat")
    started_at = models.DateTimeField(verbose_name="Kezdés")
    ended_at = models.DateTimeField(null=True, blank=True, verbose_name="Befejezés")
    duration_seconds = models.IntegerField(default=0, verbose_name="Időtartam (mp)")
    
    class Meta:
        verbose_name = "Munkanapló"
        verbose_name_plural = "Munkanaplók"
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.user} - {self.customer_order.order_number} - {self.workflow_name}"

class ChatThread(models.Model):
    """Chat beszélgetés Árajánlat vagy Megrendelés kapcsán"""
    quote_request = models.OneToOneField(QuoteRequest, on_delete=models.CASCADE, related_name='chat_thread', null=True, blank=True)
    customer_order = models.OneToOneField(CustomerOrder, on_delete=models.CASCADE, related_name='chat_thread', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Chat foly folyam"
        verbose_name_plural = "Chat folyamok"

class ChatMessage(models.Model):
    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    content = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']

class ChatMessageAttachment(models.Model):
    message = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='chat_attachments/%Y/%m/%d/')
    original_filename = models.CharField(max_length=255)
    
    def __str__(self):
        return self.original_filename

class PickupLocation(models.Model):
    """Átvételi hely"""
    name = models.CharField(max_length=255, verbose_name="Hely neve")
    address = models.CharField(max_length=500, verbose_name="Cím")
    pickup_hours = models.JSONField(default=list, blank=True, verbose_name="Átvételi időpontok")
    # Format: [{"day_from": "H", "day_to": "P", "time_from": "09:00", "time_to": "16:00"}, ...]
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    is_default = models.BooleanField(default=False, verbose_name="Alapértelmezett")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Átvételi hely"
        verbose_name_plural = "Átvételi helyek"
        ordering = ['name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.is_default:
            # Unset any other default
            PickupLocation.objects.exclude(pk=self.pk).filter(is_default=True).update(is_default=False)
        super().save(*args, **kwargs)

    def hours_display(self):
        parts = []
        for row in (self.pickup_hours or []):
            d_from = row.get('day_from', '')
            d_to = row.get('day_to', '')
            t_from = row.get('time_from', '')
            t_to = row.get('time_to', '')
            if d_from and d_to and d_from == d_to:
                parts.append(f"{d_from}: {t_from}-{t_to}")
            elif d_from and d_to:
                parts.append(f"{d_from}-{d_to}: {t_from}-{t_to}")
            elif d_from:
                parts.append(f"{d_from}: {t_from}-{t_to}")
        return ', '.join(parts) if parts else '—'


class DeliveryNote(models.Model):
    """Szállítólevél"""
    delivery_note_number = models.CharField(max_length=50, unique=True, verbose_name="Szállítólevél száma")
    customer = models.ForeignKey(CrmCompany, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Ügyfél (CRM)")
    # Fallback legacy customer info storage if needed, but mainly we use CrmCompany.
    # We can also store contact person.
    contact = models.ForeignKey(Contact, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Kapcsolattartó")
    
    issue_date = models.DateField(default=timezone.now, verbose_name="Kiállítás dátuma")
    delivery_date = models.DateField(null=True, blank=True, verbose_name="Szállítás dátuma")
    
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    
    # Status and Confirmation
    is_confirmed = models.BooleanField(default=False, verbose_name="Visszaigazolva")
    confirmed_at = models.DateTimeField(null=True, blank=True, verbose_name="Visszaigazolás ideje")
    confirmed_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='confirmed_deliveries', verbose_name="Visszaigazolta (Belső)")
    confirmed_by_info = models.CharField(max_length=255, blank=True, verbose_name="Visszaigazolta (Külső/Egyéb)") 
    # e.g. "Ügyfél: Kovács János (IP: 1.2.3.4)" or "Automata"
    
    rejection_reason = models.TextField(blank=True, verbose_name="Elutasítás oka")
    
    notes = models.TextField(blank=True, verbose_name="Megjegyzés")

    # Delivery type
    DELIVERY_TYPE_HOME = 'home'
    DELIVERY_TYPE_PICKUP = 'pickup'
    DELIVERY_TYPE_CHOICES = [
        ('home', 'Házhozszállítás'),
        ('pickup', 'Átvételi pont'),
    ]
    delivery_type = models.CharField(
        max_length=20,
        choices=DELIVERY_TYPE_CHOICES,
        default='home',
        verbose_name="Szállítás típusa"
    )
    pickup_location = models.ForeignKey(
        'PickupLocation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Átvételi hely"
    )

    # Public access
    public_token = models.CharField(max_length=64, blank=True, null=True, unique=True)
    public_expires_at = models.DateTimeField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Szállítólevél"
        verbose_name_plural = "Szállítólevelek"
        ordering = ['-created_at']

    def __str__(self):
        return self.delivery_note_number

class DeliveryNoteItem(models.Model):
    """Szállítólevél tétel"""
    delivery_note = models.ForeignKey(DeliveryNote, on_delete=models.CASCADE, related_name='items', verbose_name="Szállítólevél")
    customer_order_item = models.ForeignKey(CustomerOrderItem, on_delete=models.CASCADE, related_name='delivery_items', verbose_name="Megrendelés tétel")
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Szállított mennyiség")
    
    # Snapshot of item details at time of delivery
    item_name = models.CharField(max_length=255, blank=True, verbose_name="Tétel neve")
    unit = models.CharField(max_length=20, blank=True, verbose_name="Egység")
    net_unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Nettó egységár")
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Szállítólevél tétel"
        verbose_name_plural = "Szállítólevél tételek"

    @property
    def net_total(self):
        return self.quantity * self.net_unit_price


class DeliveryNoteDocumentation(models.Model):
    """Szállítólevélhez rendelt dokumentáció csatolmány"""
    delivery_note = models.ForeignKey(DeliveryNote, on_delete=models.CASCADE, related_name='documentation_items', verbose_name='Szállítólevél')
    quote_item_attachment = models.ForeignKey('QuoteRequestItemAttachment', null=True, blank=True, on_delete=models.CASCADE, verbose_name='Ajánlat tétel csatolmány')
    cost_item_attachment = models.ForeignKey('manufacturing.ManufacturingCostItemAttachment', null=True, blank=True, on_delete=models.CASCADE, verbose_name='Gyártási csatolmány')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Szállítólevél dokumentáció'
        verbose_name_plural = 'Szállítólevél dokumentációk'

    def __str__(self):
        return f'Doc for delivery note {self.delivery_note_id}'


class ApprovalRequest(models.Model):
    """Jóváhagyási kérelem (pl. státuszváltáshoz)"""
    STATUS_CHOICES = [
        ('pending', 'Jóváhagyásra vár'),
        ('approved', 'Jóváhagyva'),
        ('rejected', 'Visszaküldve'),
    ]
    
    customer_order = models.ForeignKey(CustomerOrder, on_delete=models.CASCADE, null=True, blank=True, related_name='approval_requests', verbose_name="Megrendelés")
    
    previous_status = models.CharField(max_length=50, verbose_name="Előző státusz")
    requested_status = models.CharField(max_length=50, verbose_name="Kért státusz")
    
    requester = models.ForeignKey(User, on_delete=models.CASCADE, related_name='initiated_approvals', verbose_name="Kérelmező")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', verbose_name="Kérelem státusza")
    rejection_details = models.TextField(blank=True, verbose_name="Visszaküldés oka")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Jóváhagyási kérelem"
        verbose_name_plural = "Jóváhagyási kérelmek"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.requester} - {self.customer_order} ({self.requested_status})"


# ==================== POS (Point of Sale) Models ====================

class POSCustomerIdentification(models.Model):
    """QR kód alapú vásárló azonosítás"""
    customer = models.ForeignKey(CrmCompany, on_delete=models.CASCADE, related_name='pos_identifications', verbose_name="Ügyfél")
    qr_code = models.CharField(max_length=100, unique=True, verbose_name="QR kód")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True, verbose_name="Utoljára használva")

    class Meta:
        verbose_name = "POS vásárló azonosítás"
        verbose_name_plural = "POS vásárló azonosítások"

    def __str__(self):
        return f"{self.customer.name} - {self.qr_code}"


class POSCoupon(models.Model):
    """Kupon/kedvezmény rendszer"""
    DISCOUNT_TYPE_CHOICES = [
        ('fixed', 'Fix összeg'),
        ('percent', 'Százalék'),
    ]
    
    code = models.CharField(max_length=50, unique=True, verbose_name="Kupon kód")
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE_CHOICES, verbose_name="Kedvezmény típusa")
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Kedvezmény értéke")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    valid_from = models.DateTimeField(null=True, blank=True, verbose_name="Érvényes ettől")
    valid_until = models.DateTimeField(null=True, blank=True, verbose_name="Érvényes eddig")
    usage_limit = models.IntegerField(null=True, blank=True, verbose_name="Használati limit")
    usage_count = models.IntegerField(default=0, verbose_name="Használat száma")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "POS kupon"
        verbose_name_plural = "POS kuponok"

    def __str__(self):
        return f"{self.code} - {self.get_discount_type_display()}: {self.discount_value}"
    
    def is_valid(self):
        """Kupon érvényességének ellenőrzése"""
        from django.utils import timezone
        now = timezone.now()
        
        if not self.is_active:
            return False
        if self.valid_from and now < self.valid_from:
            return False
        if self.valid_until and now > self.valid_until:
            return False
        if self.usage_limit and self.usage_count >= self.usage_limit:
            return False
        return True


class POSTransaction(models.Model):
    """POS tranzakció (nyugta vagy számla)"""
    TRANSACTION_TYPE_CHOICES = [
        ('receipt', 'Nyugta'),
        ('invoice', 'Számla'),
    ]
    
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Készpénz'),
        ('card', 'Hitelkártya'),
        ('customer_card', 'Ügyfélkártya'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Vázlat'),
        ('pending', 'Fizetés folyamatban'),
        ('completed', 'Befejezve'),
        ('failed', 'Sikertelen'),
        ('cancelled', 'Törölve'),
    ]
    
    transaction_number = models.CharField(max_length=50, unique=True, verbose_name="Tranzakció száma")
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES, verbose_name="Tranzakció típusa")
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, verbose_name="Fizetési mód")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', verbose_name="Státusz")
    
    # Ügyfél adatok
    customer = models.ForeignKey(CrmCompany, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Ügyfél")
    customer_name = models.CharField(max_length=200, blank=True, verbose_name="Ügyfél neve")
    customer_address = models.TextField(blank=True, verbose_name="Ügyfél címe")
    customer_tax_number = models.CharField(max_length=20, blank=True, verbose_name="Adószám")
    customer_email = models.EmailField(blank=True, verbose_name="E-mail")
    
    # Vásárló azonosítás (QR kód alapú)
    shopper_identification = models.ForeignKey(POSCustomerIdentification, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Vásárló azonosítás")
    shopper_name = models.CharField(max_length=200, blank=True, verbose_name="Vásárló neve")
    
    # Összegek
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Részösszeg")
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Kedvezmény összege")
    total_net = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Nettó összesen")
    total_vat = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="ÁFA összesen")
    total_gross = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Bruttó összesen")
    
    # Készpénzes fizetés
    amount_received = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, verbose_name="Átvett összeg")
    amount_change = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, verbose_name="Visszajáró")
    
    # Kupon
    coupon = models.ForeignKey(POSCoupon, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Felhasznált kupon")
    
    # NAV integráció
    nav_invoice_number = models.CharField(max_length=100, blank=True, verbose_name="NAV számla szám")
    nav_transaction_id = models.CharField(max_length=100, blank=True, verbose_name="NAV tranzakció ID")
    nav_sent_at = models.DateTimeField(null=True, blank=True, verbose_name="NAV-nak küldve")
    
    # Terminál integráció
    terminal_transaction_id = models.CharField(max_length=100, blank=True, verbose_name="Terminál tranzakció ID")
    terminal_response = models.TextField(blank=True, verbose_name="Terminál válasz")
    
    # Kasszafiók
    drawer_opened_at = models.DateTimeField(null=True, blank=True, verbose_name="Kasszafiók nyitva")
    
    # Rögzítés adatai
    cashier = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Pénztáros")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="Befejezve")
    
    # Nyomtatás
    printed_at = models.DateTimeField(null=True, blank=True, verbose_name="Kinyomtatva")
    
    class Meta:
        verbose_name = "POS tranzakció"
        verbose_name_plural = "POS tranzakciók"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.transaction_number} - {self.get_transaction_type_display()} - {self.total_gross}"
    
    def calculate_totals(self):
        """Összegek újraszámítása a tételek alapján"""
        items = self.items.all()
        self.subtotal = sum(item.gross_total for item in items)
        self.total_net = sum(item.net_total for item in items)
        self.total_vat = sum(item.vat_amount for item in items)
        
        # Kupon kedvezmény alkalmazása
        if self.coupon and self.coupon.is_valid():
            if self.coupon.discount_type == 'fixed':
                self.discount_amount = min(self.coupon.discount_value, self.subtotal)
            else:  # percent
                self.discount_amount = self.subtotal * (self.coupon.discount_value / 100)
        else:
            self.discount_amount = 0
        
        self.total_gross = self.subtotal - self.discount_amount
        
        # HUF kerekítés készpénzes fizetésnél
        if self.payment_method == 'cash' and self.total_gross:
            from apps.core.models import Currency
            try:
                currency = Currency.objects.get(code='HUF')
                # Kerekítés 5 Ft-ra
                remainder = self.total_gross % 5
                if remainder <= 2:
                    self.total_gross -= remainder
                else:
                    self.total_gross += (5 - remainder)
            except Currency.DoesNotExist:
                pass
        
        # Visszajáró számítása
        if self.payment_method == 'cash' and self.amount_received:
            self.amount_change = self.amount_received - self.total_gross
        
        self.save()


class POSTransactionItem(models.Model):
    """POS tranzakció tétel"""
    transaction = models.ForeignKey(POSTransaction, on_delete=models.CASCADE, related_name='items', verbose_name="Tranzakció")
    material = models.ForeignKey('warehouse.Material', on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Termék")
    
    # Termék adatok pillanatkép
    product_code = models.CharField(max_length=50, blank=True, verbose_name="Cikkszám")
    product_name = models.CharField(max_length=200, verbose_name="Termék neve")
    product_description = models.TextField(blank=True, verbose_name="Leírás")
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Mennyiség")
    unit = models.CharField(max_length=20, verbose_name="Mértékegység")
    
    # Árak
    gross_unit_price = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="Bruttó egységár")
    net_unit_price = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="Nettó egységár")
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, verbose_name="ÁFA %")
    
    # Összegek
    net_total = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="Nettó összesen")
    vat_amount = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="ÁFA összeg")
    gross_total = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="Bruttó összesen")
    
    # Kedvezményes ár (ha ügyfél kedvezményes árat kap)
    is_discounted = models.BooleanField(default=False, verbose_name="Kedvezményes")
    original_gross_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, verbose_name="Eredeti bruttó ár")
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "POS tranzakció tétel"
        verbose_name_plural = "POS tranzakció tételek"

    def __str__(self):
        return f"{self.product_name} x {self.quantity}"
    
    def save(self, *args, **kwargs):
        # Összegek kiszámítása
        self.net_total = self.quantity * self.net_unit_price
        self.vat_amount = self.net_total * (self.vat_rate / 100)
        self.gross_total = self.quantity * self.gross_unit_price
        super().save(*args, **kwargs)


class POSPayment(models.Model):
    """POS fizetési kísérlet (több is lehet egy tranzakcióhoz)"""
    STATUS_CHOICES = [
        ('pending', 'Folyamatban'),
        ('success', 'Sikeres'),
        ('failed', 'Sikertelen'),
        ('cancelled', 'Törölve'),
    ]
    
    transaction = models.ForeignKey(POSTransaction, on_delete=models.CASCADE, related_name='payments', verbose_name="Tranzakció")
    amount = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="Összeg")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', verbose_name="Státusz")
    
    # Terminál adatok
    terminal_id = models.CharField(max_length=50, blank=True, verbose_name="Terminál ID")
    terminal_transaction_id = models.CharField(max_length=100, blank=True, verbose_name="Terminál tranzakció ID")
    terminal_response_code = models.CharField(max_length=50, blank=True, verbose_name="Terminál válasz kód")
    terminal_response_message = models.TextField(blank=True, verbose_name="Terminál válasz üzenet")
    
    # Időbélyegek
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="Befejezve")
    
    class Meta:
        verbose_name = "POS fizetés"
        verbose_name_plural = "POS fizetések"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.transaction.transaction_number} - {self.amount} - {self.get_status_display()}"


def order_attachment_upload_path(instance, filename):
    order_num = instance.customer_order.order_number if instance.customer_order_id else 'unknown'
    return f'order_attachments/{order_num}/{filename}'


class CustomerOrderAttachment(models.Model):
    customer_order = models.ForeignKey(
        CustomerOrder, on_delete=models.CASCADE,
        related_name='attachments', verbose_name='Megrendelés'
    )
    file = models.FileField(upload_to=order_attachment_upload_path, verbose_name='Fájl')
    original_filename = models.CharField(max_length=255, verbose_name='Eredeti fájlnév')
    remark = models.CharField(max_length=500, blank=True, verbose_name='Megjegyzés')
    storage_file_id = models.IntegerField(null=True, blank=True, verbose_name='Storage fájl ID')
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Feltöltötte'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Megrendelés csatolmány'
        verbose_name_plural = 'Megrendelés csatolmányok'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.customer_order.order_number} - {self.original_filename}"


class ExtraWork(models.Model):
    """Plusz munka – gyártás során felmerülő, nem megrendelt munka"""
    COST_TYPE_CHOICES = [
        ('customer', 'Ügyfél költsége'),
        ('own', 'Saját költség'),
    ]

    customer_order = models.ForeignKey(
        CustomerOrder, on_delete=models.CASCADE,
        related_name='extra_works', verbose_name='Megrendelés'
    )
    customer_order_item = models.ForeignKey(
        CustomerOrderItem, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='extra_works', verbose_name='Tétel'
    )
    name = models.CharField(max_length=200, verbose_name='Megnevezés')
    description = models.TextField(blank=True, default='', verbose_name='Leírás')
    quantity = models.DecimalField(max_digits=10, decimal_places=4, default=1, verbose_name='Mennyiség')
    unit = models.CharField(max_length=20, default='db', verbose_name='Egység')
    net_unit_price = models.DecimalField(max_digits=15, decimal_places=4, default=0, verbose_name='Eladási egységár')
    cost_price = models.DecimalField(max_digits=15, decimal_places=4, default=0, verbose_name='Bekerülési ár')
    cost_type = models.CharField(max_length=10, choices=COST_TYPE_CHOICES, default='customer', verbose_name='Típus')
    notes = models.TextField(blank=True, default='', verbose_name='Megjegyzések')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name='Létrehozta'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Plusz munka'
        verbose_name_plural = 'Plusz munkák'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.customer_order.order_number} – {self.name}"

    @property
    def net_total(self):
        return float(self.quantity * self.net_unit_price)
