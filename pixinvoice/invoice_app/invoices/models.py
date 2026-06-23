from django.db import models
from django.contrib.auth.models import User
from django.core.validators import RegexValidator
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
import uuid


class Customer(models.Model):
    """Customer model for storing customer information"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, verbose_name="Customer Name")
    short_name = models.CharField(max_length=100, blank=True, null=True, verbose_name="Short Name")
    tax_number = models.CharField(
        max_length=20, 
        blank=True, 
        null=True,
        verbose_name="Tax Number"
    )
    full_tax_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="Full Tax Number")
    address = models.TextField(blank=True, null=True, verbose_name="Address")
    street_name = models.CharField(max_length=200, blank=True, null=True, verbose_name="Street Name")
    public_place_category = models.CharField(max_length=50, blank=True, null=True, verbose_name="Public Place Category")
    street_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="Street Number")
    building = models.CharField(max_length=20, blank=True, null=True, verbose_name="Building")
    staircase = models.CharField(max_length=20, blank=True, null=True, verbose_name="Staircase")
    floor = models.CharField(max_length=20, blank=True, null=True, verbose_name="Floor")
    door = models.CharField(max_length=20, blank=True, null=True, verbose_name="Door")
    city = models.CharField(max_length=100, verbose_name="City")
    postal_code = models.CharField(max_length=10, verbose_name="Postal Code")
    country = models.CharField(max_length=100, default="Hungary", verbose_name="Country")
    email = models.EmailField(blank=True, null=True, verbose_name="Email")
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="Phone")
    vat_code = models.CharField(max_length=10, blank=True, null=True, verbose_name="VAT Code")
    county_code = models.CharField(max_length=10, blank=True, null=True, verbose_name="County Code")
    vat_group_id = models.CharField(max_length=50, blank=True, null=True, verbose_name="VAT Group ID")
    vat_group_member_tax_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="VAT Group Member Tax Number")
    group_tax_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="Csoport adószám", help_text="Csoport teljes adószáma, pl. 12345678-5-42")
    VAT_STATUS_CHOICES = [
        ('DOMESTIC', 'Magyar adószámos'),
        ('PRIVATE_PERSON', 'Magánszemély'),
        ('OTHER', 'Egyéb')
    ]
    vat_status = models.CharField(max_length=20, choices=VAT_STATUS_CHOICES, default='DOMESTIC', verbose_name="Vevő adóalanyisága")
    is_hungarian_taxpayer = models.BooleanField(default=True, verbose_name="Hungarian Taxpayer")
    eu_tax_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="EU Tax Number")
    payment_due_days = models.PositiveIntegerField(default=8, verbose_name="Payment Due Days")
    is_supplier = models.BooleanField(default=False, verbose_name="Beszállító")
    is_customer = models.BooleanField(default=True, verbose_name="Vevő")

    PAYMENT_METHOD_CHOICES = [
        ('CASH', 'Készpénz'),
        ('TRANSFER', 'Átutalás')
    ]
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='CASH', verbose_name="Fizetési mód")
    default_currency = models.CharField(max_length=3, default='HUF', verbose_name="Alapértelmezett deviza")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Customer"
        verbose_name_plural = "Customers"
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.tax_number})"


class CustomerBankAccount(models.Model):
    """Bank account details for a customer"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='bank_accounts', verbose_name="Customer")
    bank_name = models.CharField(max_length=150, blank=True, null=True, verbose_name="Bank Name")
    account_number = models.CharField(max_length=64, blank=True, null=True, verbose_name="Bank Account Number")
    iban = models.CharField(max_length=34, blank=True, null=True, verbose_name="IBAN")
    swift_bic = models.CharField(max_length=11, blank=True, null=True, verbose_name="SWIFT/BIC")
    currency = models.CharField(max_length=3, default='HUF', verbose_name="Currency")
    is_primary = models.BooleanField(default=False, verbose_name="Primary")
    is_approved = models.BooleanField(default=True, verbose_name="Jóváhagyva")
    round_transfer_to_whole = models.BooleanField(default=False, verbose_name="Csak egész számos utalás")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Customer Bank Account"
        verbose_name_plural = "Customer Bank Accounts"
        ordering = ['-is_primary', 'bank_name']

    def __str__(self):
        return f"{self.customer.name} - {self.iban or self.account_number or 'N/A'}"


class Company(models.Model):
    """Company model for multi-company invoicing"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, verbose_name="Company Name")
    short_name = models.CharField(max_length=100, blank=True, null=True, verbose_name="Short Name")
    tax_number = models.CharField(
        max_length=20, 
        validators=[RegexValidator(r'^\d{8}$', 'Tax number must be 8 digits')],
        verbose_name="Tax Number"
    )
    full_tax_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="Full Tax Number")
    vat_code = models.CharField(max_length=10, blank=True, null=True, verbose_name="VAT Code")
    county_code = models.CharField(max_length=10, blank=True, null=True, verbose_name="County Code")
    eu_tax_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="EU Tax Number")
    vat_group_id = models.CharField(max_length=50, blank=True, null=True, verbose_name="VAT Group ID")
    vat_group_member_tax_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="VAT Group Member Tax Number")
    address = models.TextField(blank=True, null=True, verbose_name="Address")
    street_name = models.CharField(max_length=200, blank=True, null=True, verbose_name="Street Name")
    public_place_category = models.CharField(max_length=50, blank=True, null=True, verbose_name="Public Place Category")
    street_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="Street Number")
    building = models.CharField(max_length=20, blank=True, null=True, verbose_name="Building")
    staircase = models.CharField(max_length=20, blank=True, null=True, verbose_name="Staircase")
    floor = models.CharField(max_length=20, blank=True, null=True, verbose_name="Floor")
    door = models.CharField(max_length=20, blank=True, null=True, verbose_name="Door")
    city = models.CharField(max_length=100, verbose_name="City")
    postal_code = models.CharField(max_length=10, verbose_name="Postal Code")
    country = models.CharField(max_length=100, default="Hungary", verbose_name="Country")
    email = models.EmailField(blank=True, null=True, verbose_name="Email")
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="Phone")
    xml_logging_enabled = models.BooleanField(default=True, verbose_name="XML log mentés engedélyezve")
    round_transfer_to_whole = models.BooleanField(default=False, verbose_name="Csak egész számos utalás")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    order_index = models.IntegerField(default=0, verbose_name="Order Index")
    api_key = models.CharField(max_length=64, blank=True, null=True, unique=True, verbose_name="API-kulcs")

    def save(self, *args, **kwargs):
        import secrets
        if not self.api_key:
            self.api_key = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Company"
        verbose_name_plural = "Companies"
        ordering = ['order_index', 'name']

    def __str__(self):
        return f"{self.name} ({self.tax_number})"


class IncomingSyncState(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='incoming_sync_state')
    last_refreshed_at = models.DateTimeField(blank=True, null=True)
    external_last_refreshed_at = models.DateTimeField(blank=True, null=True)
    external_full_sync_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Incoming Sync State"
        verbose_name_plural = "Incoming Sync States"

    def __str__(self):
        return f"IncomingSyncState({self.company.name}) @ {self.last_refreshed_at}"


class IncomingInvoiceDigest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='incoming_digests')
    invoice_number = models.CharField(max_length=100)
    invoice_operation = models.CharField(max_length=20, blank=True, null=True)
    invoice_category = models.CharField(max_length=20, blank=True, null=True)
    invoice_issue_date = models.DateField(blank=True, null=True)
    invoice_delivery_date = models.DateField(blank=True, null=True)
    due_date = models.DateField(blank=True, null=True)
    supplier_tax_number = models.CharField(max_length=20, blank=True, null=True)
    supplier_name = models.CharField(max_length=300, blank=True, null=True)
    customer_tax_number = models.CharField(max_length=20, blank=True, null=True)
    customer_name = models.CharField(max_length=300, blank=True, null=True)
    payment_method = models.CharField(max_length=30, blank=True, null=True)
    payment_date = models.DateField(blank=True, null=True)
    invoice_appearance = models.CharField(max_length=30, blank=True, null=True)
    currency = models.CharField(max_length=10, blank=True, null=True)
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True, verbose_name="Exchange Rate")
    invoice_net_amount = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True)
    invoice_vat_amount = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True)
    invoice_net_amount_huf = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True, verbose_name="Net Amount HUF")
    invoice_vat_amount_huf = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True, verbose_name="VAT Amount HUF")
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0, verbose_name="Amount Paid")
    payment_status = models.CharField(max_length=20, default='unpaid', verbose_name="Payment Status")
    payment_date = models.DateField(blank=True, null=True, verbose_name="Payment Date")
    payment_reference = models.CharField(max_length=100, blank=True, null=True, verbose_name="Payment Reference")
    is_approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey('SystemUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_incoming_invoices')
    approved_at = models.DateTimeField(blank=True, null=True)
    transaction_id = models.CharField(max_length=50, blank=True, null=True)
    index = models.IntegerField(blank=True, null=True)
    original_invoice_number = models.CharField(max_length=100, blank=True, null=True)
    modification_index = models.IntegerField(blank=True, null=True)
    ins_date = models.DateTimeField(blank=True, null=True)
    completeness_indicator = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Incoming Invoice Digest"
        verbose_name_plural = "Incoming Invoice Digests"
        indexes = [
            models.Index(fields=['company', 'invoice_issue_date']),
            models.Index(fields=['company', 'ins_date']),
            models.Index(fields=['company', 'is_approved']),
        ]
        unique_together = (('company', 'invoice_number', 'transaction_id'),)

    def __str__(self):
        return f"{self.company.short_name or self.company.name} - {self.invoice_number}"


class IncomingInvoiceData(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='incoming_datas')
    invoice_number = models.CharField(max_length=100)
    supplier_tax_number = models.CharField(max_length=20, blank=True, null=True)
    transaction_id = models.CharField(max_length=50, blank=True, null=True)
    xml_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Incoming Invoice Data"
        verbose_name_plural = "Incoming Invoice Datas"
        indexes = [
            models.Index(fields=['company', 'invoice_number']),
            models.Index(fields=['company', 'supplier_tax_number']),
        ]
        unique_together = (('company', 'invoice_number', 'supplier_tax_number'),)

    def __str__(self):
        return f"{self.company.short_name or self.company.name} - {self.invoice_number} (full)"


def incoming_upload_path(instance, filename: str) -> str:
    import os
    base = 'incoming'
    comp = str(getattr(instance.company, 'id', 'unknown'))
    inv = (instance.invoice_number or 'misc').replace('/', '_')
    safe_name = os.path.basename(filename or '')
    return f"{base}/{comp}/{inv}/{safe_name}"


class IncomingDocument(models.Model):
    TYPE_CHOICES = [
        ('IMAGE', 'Számlakép'),
        ('OTHER', 'Egyéb'),
        ('CONTRACT', 'Szerződés'),
        ('SUPPLIER', 'Szállító'),
        ('PERFORMANCE_CERT', 'Teljesítés igazolás'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='incoming_documents')
    invoice_number = models.CharField(max_length=100)
    supplier_tax_number = models.CharField(max_length=20, blank=True, null=True)
    type = models.CharField(max_length=16, choices=TYPE_CHOICES, default='IMAGE')
    file = models.FileField(upload_to=incoming_upload_path)
    original_name = models.CharField(max_length=255, blank=True, null=True)
    content_type = models.CharField(max_length=100, blank=True, null=True)
    size = models.PositiveIntegerField(default=0)
    comment = models.CharField(max_length=500, blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['company', 'invoice_number']),
            models.Index(fields=['company', 'supplier_tax_number']),
        ]
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"Doc {self.invoice_number} - {self.original_name or self.file.name}"


def incoming_proforma_upload_path(instance, filename: str) -> str:
    import os
    safe_name = os.path.basename(filename or '')
    _, ext = os.path.splitext(safe_name)
    ext = (ext or '').lower()[:10]
    # Keep storage path short to stay under FileField max_length (default 100).
    short_name = f"d_{uuid.uuid4().hex[:12]}{ext}"
    company_part = str(instance.proforma.company_id).replace('-', '')[:8]
    proforma_part = str(instance.proforma.id).replace('-', '')[:8]
    return f"ip/{company_part}/{proforma_part}/{short_name}"


class IncomingProforma(models.Model):
    """Manually registered incoming proforma invoices (díjbekérők)."""
    STATUS_CHOICES = [
        ('unpaid', 'Kifizetetlen'),
        ('partial', 'Részben fizetve'),
        ('paid', 'Kifizetett'),
        ('invoiced', 'Kiszámlázott'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='incoming_proformas')
    proforma_number = models.CharField(max_length=100)
    supplier_tax_number = models.CharField(max_length=30, blank=True, null=True)
    supplier_name = models.CharField(max_length=300, blank=True, null=True)
    issue_date = models.DateField(blank=True, null=True)
    due_date = models.DateField(blank=True, null=True)
    delivery_date = models.DateField(blank=True, null=True)
    payment_method = models.CharField(max_length=30, blank=True, null=True, default='TRANSFER')
    currency = models.CharField(max_length=10, blank=True, null=True, default='HUF')
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True, default=1)
    net_amount = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True, default=0)
    vat_amount = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True, default=0)
    gross_amount = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unpaid')
    payment_date = models.DateField(blank=True, null=True)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Incoming Proforma"
        verbose_name_plural = "Incoming Proformas"
        ordering = ['-issue_date', '-created_at']
        indexes = [
            models.Index(fields=['company', 'status']),
            models.Index(fields=['company', 'supplier_tax_number']),
        ]

    def __str__(self):
        return f"{self.company.short_name or self.company.name} - {self.proforma_number}"


class IncomingProformaDocument(models.Model):
    TYPE_CHOICES = IncomingDocument.TYPE_CHOICES
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    proforma = models.ForeignKey(IncomingProforma, on_delete=models.CASCADE, related_name='documents')
    type = models.CharField(max_length=16, choices=TYPE_CHOICES, default='IMAGE')
    file = models.FileField(upload_to=incoming_proforma_upload_path)
    original_name = models.CharField(max_length=255, blank=True, null=True)
    content_type = models.CharField(max_length=100, blank=True, null=True)
    size = models.PositiveIntegerField(default=0)
    comment = models.CharField(max_length=500, blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"ProformaDoc {self.proforma.proforma_number} - {self.original_name or self.file.name}"


class IncomingProformaInvoiceLink(models.Model):
    """Links a proforma to one or more incoming invoices with an allocated amount."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    proforma = models.ForeignKey(IncomingProforma, on_delete=models.CASCADE, related_name='invoice_links')
    invoice_number = models.CharField(max_length=100)
    supplier_tax_number = models.CharField(max_length=30, blank=True, null=True)
    supplier_name = models.CharField(max_length=300, blank=True, null=True)
    allocated_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, blank=True, null=True, default='HUF')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (('proforma', 'invoice_number', 'supplier_tax_number'),)
        ordering = ['created_at']

    def __str__(self):
        return f"Link {self.proforma.proforma_number} → {self.invoice_number}"


class CompanyEmailSettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name='email_settings')
    # SMTP
    smtp_host = models.CharField(max_length=200, blank=True, null=True)
    smtp_port = models.PositiveIntegerField(default=587)
    smtp_user = models.CharField(max_length=200, blank=True, null=True)
    smtp_password = models.CharField(max_length=500, blank=True, null=True)
    smtp_use_tls = models.BooleanField(default=True)
    smtp_from = models.EmailField(blank=True, null=True)
    # IMAP Sent copy
    imap_host = models.CharField(max_length=200, blank=True, null=True)
    imap_user = models.CharField(max_length=200, blank=True, null=True)
    imap_password = models.CharField(max_length=500, blank=True, null=True)
    imap_port = models.PositiveIntegerField(default=993)
    imap_sent_folder = models.CharField(max_length=200, blank=True, null=True, default='Sent')
    # Templates
    default_subject_template = models.CharField(max_length=200, blank=True, null=True, default='Számla {invoice_number}')
    default_body_template = models.TextField(blank=True, null=True, default='Tisztelt {customer_name}!\n\nKüldjük a(z) {invoice_number} számú számlát PDF csatolmányként.\n\nÜdvözlettel,\n{company_name}')
    subject_template_en = models.CharField(max_length=200, blank=True, null=True, default='Invoice {invoice_number}')
    body_template_en = models.TextField(blank=True, null=True, default='Dear {customer_name},\n\nPlease find attached invoice {invoice_number}.\n\nBest regards,\n{company_name}')
    arrears_subject_template = models.CharField(max_length=250, blank=True, null=True, default='Kintlévőség értesítő - lejárt számlák')
    arrears_body_template = models.TextField(
        blank=True,
        null=True,
        default='''<p>Tisztelt Ügyfél!</p>
<p>Nyilvántartásunk szerint {as_of_date} napjáig még nem egyenlítették ki az alábbi számlákat, amelynek hátraléka összesen {total_outstanding}.</p>
{invoices_table}
<p>Amennyiben az összeg az Önök nyilvántartásában szereplőtől eltér, kérem egyeztessenek velünk az elérhetőségeink egyikén.</p>
<p>Ha a számlák kiegyenlítése időközben már megtörtént, kérjük jelen levelünket tekintse tárgytalannak!</p>
<p>{today_city_date}</p>'''
    )
    default_sender_name = models.CharField(max_length=200, blank=True, null=True)
    default_sender_phone = models.CharField(max_length=50, blank=True, null=True)
    # Desktop email client (Thunderbird) integration
    use_thunderbird = models.BooleanField(default=False)
    thunderbird_path = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Company Email Settings'
        verbose_name_plural = 'Company Email Settings'

    def __str__(self):
        return f"Email settings for {self.company.name}"


class EmailTemplate(models.Model):
    TEMPLATE_INVOICE_SEND = 'invoice_send'
    TEMPLATE_PROFORMA_SEND = 'proforma_send'
    TEMPLATE_ARREARS = 'arrears'
    TEMPLATE_REMINDER_1 = 'reminder_1'
    TEMPLATE_REMINDER_2 = 'reminder_2'
    TEMPLATE_LEGAL = 'legal'
    TEMPLATE_PAYMENT_ORDER = 'payment_order'
    TEMPLATE_LITIGATION = 'litigation'

    TEMPLATE_TYPE_CHOICES = [
        (TEMPLATE_INVOICE_SEND, 'Számlaküldés'),
        (TEMPLATE_PROFORMA_SEND, 'Díjbekérő küldése'),
        (TEMPLATE_ARREARS, 'Kintlévőségi'),
        (TEMPLATE_REMINDER_1, '1. felszólítás'),
        (TEMPLATE_REMINDER_2, '2. felszólítás'),
        (TEMPLATE_LEGAL, 'Ügyvédi'),
        (TEMPLATE_PAYMENT_ORDER, 'Fizetési meghagyás'),
        (TEMPLATE_LITIGATION, 'Peresítés'),
    ]

    LANGUAGE_CHOICES = [
        ('hu', 'Magyar'),
        ('en', 'Angol'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='email_templates')
    template_type = models.CharField(max_length=32, choices=TEMPLATE_TYPE_CHOICES)
    language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default='hu')
    name = models.CharField(max_length=120)
    subject_template = models.CharField(max_length=250, blank=True, null=True)
    body_template = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Email Template'
        verbose_name_plural = 'Email Templates'
        constraints = [
            models.UniqueConstraint(fields=['company', 'template_type', 'language'], name='unique_company_template_type_language')
        ]
        ordering = ['name']

    def __str__(self):
        return f"{self.company.name} - {self.name}"


class EmailSignature(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='email_signatures')
    name = models.CharField(max_length=120)
    content_html = models.TextField(blank=True, null=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Email Signature'
        verbose_name_plural = 'Email Signatures'
        ordering = ['-is_default', 'name']

    def __str__(self):
        return f"{self.company.name} - {self.name}"


class CompanyBankAccount(models.Model):
    """Bank account details for a company (supplier)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='bank_accounts', verbose_name="Company")
    bank_name = models.CharField(max_length=150, blank=True, null=True, verbose_name="Bank Name")
    account_number = models.CharField(max_length=64, blank=True, null=True, verbose_name="Bank Account Number")
    iban = models.CharField(max_length=34, blank=True, null=True, verbose_name="IBAN")
    swift_bic = models.CharField(max_length=11, blank=True, null=True, verbose_name="SWIFT/BIC")
    currency = models.CharField(max_length=3, default='HUF', verbose_name="Currency")
    is_primary = models.BooleanField(default=False, verbose_name="Primary")
    round_transfer_to_whole = models.BooleanField(default=False, verbose_name="Csak egész számos utalás")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Company Bank Account"
        verbose_name_plural = "Company Bank Accounts"
        ordering = ['-is_primary', 'bank_name']

    def __str__(self):
        return f"{self.company.name} - {self.iban or self.account_number or 'N/A'}"


class InvoiceItem(models.Model):
    """Invoice item model for storing line items"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    description = models.CharField(max_length=500, verbose_name="Description")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Quantity")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Unit Price")
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=27.0, verbose_name="VAT Rate (%)")
    # Detailed VAT handling
    # Optional reference to VAT type master data (e.g., AAM, TAM, EAM, 27%, 5%, etc.)
    vat_type = models.ForeignKey('VATType', on_delete=models.SET_NULL, null=True, blank=True, related_name='items', verbose_name="VAT Type")
    vat_reason = models.CharField(max_length=255, blank=True, null=True, verbose_name="VAT Reason/Note")
    unit_of_measure = models.CharField(max_length=20, default='PIECE', verbose_name="Unit of Measure")
    NATURE_CHOICES = [
        ('PRODUCT', 'Termék'),
        ('SERVICE', 'Szolgáltatás'),
        ('OTHER', 'Egyéb'),
    ]
    nature_indicator = models.CharField(max_length=20, choices=NATURE_CHOICES, default='PRODUCT', verbose_name="Line Nature")
    PRODUCT_CODE_CAT_CHOICES = [
        ('VTSZ', 'VTSZ'),
        ('SZJ', 'SZJ'),
        ('KN', 'KN'),
        ('OTHER', 'Other'),
    ]
    product_code_category = models.CharField(max_length=20, choices=PRODUCT_CODE_CAT_CHOICES, blank=True, null=True, verbose_name="Product Code Category")
    product_code_value = models.CharField(max_length=50, blank=True, null=True, verbose_name="Product Code Value")
    deletion_code = models.CharField(max_length=50, blank=True, null=True, verbose_name="Deletion Code")
    note = models.CharField(max_length=500, blank=True, null=True, verbose_name="Item Note")
    # Chain references for corrections/storno
    original_line_number = models.PositiveIntegerField(blank=True, null=True, verbose_name="Original Line Number")
    LINE_OPERATION_CHOICES = [
        ('CREATE', 'CREATE'),
        ('MODIFY', 'MODIFY'),
        ('DELETE', 'DELETE'),
    ]
    line_operation = models.CharField(max_length=10, choices=LINE_OPERATION_CHOICES, blank=True, null=True, verbose_name="Line Operation")
    
    @property
    def net_amount(self):
        return self.quantity * self.unit_price
    
    @property
    def vat_amount(self):
        return self.net_amount * (self.vat_rate / 100)
    
    @property
    def gross_amount(self):
        return self.net_amount + self.vat_amount

    class Meta:
        verbose_name = "Invoice Item"
        verbose_name_plural = "Invoice Items"

    def __str__(self):
        return f"{self.description} - {self.quantity} x {self.unit_price}"


class Invoice(models.Model):
    """Main invoice model"""
    INVOICE_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('partially_paid', 'Partially Paid'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
        ('submitted_to_nav', 'Submitted to NAV'),
        ('nav_processed', 'NAV Processed'),
        ('nav_rejected', 'NAV Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=50, unique=True, verbose_name="Invoice Number")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='invoices', verbose_name="Company")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, verbose_name="Customer")
    items = models.ManyToManyField(InvoiceItem, verbose_name="Invoice Items")
    invoice_block = models.ForeignKey('InvoiceBlock', on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices', verbose_name="Invoice Block")
    
    # Invoice dates
    issue_date = models.DateField(verbose_name="Issue Date")
    due_date = models.DateField(verbose_name="Due Date")
    delivery_date = models.DateField(blank=True, null=True, verbose_name="Delivery Date")
    
    # Financial information
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Currency")
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=1.0, verbose_name="Exchange Rate")
    PAYMENT_METHOD_CHOICES = [
        ('transfer', 'Átutalás'),
        ('cash', 'Készpénz'),
        ('card', 'Bankkártya'),
        ('voucher', 'Utalvány'),
        ('cod', 'Utánvét'),
        ('other', 'Egyéb'),
    ]
    ARREARS_STATUS_OVERDUE = 'overdue'
    ARREARS_STATUS_NOTICE = 'arrears_notice'
    ARREARS_STATUS_REMINDER_1 = 'reminder_1'
    ARREARS_STATUS_REMINDER_2 = 'reminder_2'
    ARREARS_STATUS_LEGAL = 'legal_letter'
    ARREARS_STATUS_PAYMENT_ORDER = 'payment_order'
    ARREARS_STATUS_LITIGATION = 'litigation'
    ARREARS_STATUS_WON = 'won'
    ARREARS_STATUS_LOST = 'lost'
    ARREARS_STATUS_CHOICES = [
        (ARREARS_STATUS_OVERDUE, 'Lejárt'),
        (ARREARS_STATUS_NOTICE, 'Kintlévőségi értesítő kiküldése'),
        (ARREARS_STATUS_REMINDER_1, '1. Felszólítás'),
        (ARREARS_STATUS_REMINDER_2, '2. Felszólítás'),
        (ARREARS_STATUS_LEGAL, 'Ügyvédi levél'),
        (ARREARS_STATUS_PAYMENT_ORDER, 'Fizetési meghagyás'),
        (ARREARS_STATUS_LITIGATION, 'Peresítés'),
        (ARREARS_STATUS_WON, 'Pert nyert'),
        (ARREARS_STATUS_LOST, 'Pert vesztett'),
    ]
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='transfer', verbose_name="Fizetési mód")
    
    # Status and NAV integration
    status = models.CharField(max_length=20, choices=INVOICE_STATUS_CHOICES, default='draft', verbose_name="Status")
    nav_transaction_id = models.CharField(max_length=100, blank=True, null=True, verbose_name="NAV Transaction ID")
    nav_submission_date = models.DateTimeField(blank=True, null=True, verbose_name="NAV Submission Date")
    nav_response = models.TextField(blank=True, null=True, verbose_name="NAV Response")
    
    # Additional information
    notes = models.TextField(blank=True, null=True, verbose_name="Notes")
    # NAV-specific details
    INVOICE_CATEGORY_CHOICES = [
        ('NORMAL', 'Normál'),
        ('SIMPLIFIED', 'Egyszerűsített'),
        ('AGGREGATE', 'Gyűjtőszámla'),
        ('ADVANCE', 'Előlegszámla'),
        ('FINAL', 'Végszámla'),
        ('CORRECTION', 'Helyesbítő'),
    ]
    invoice_category = models.CharField(max_length=20, choices=INVOICE_CATEGORY_CHOICES, default='NORMAL', verbose_name="Invoice Category")
    APPEARANCE_CHOICES = [
        ('PAPER', 'Papír'),
        ('ELECTRONIC', 'Elektronikus'),
        ('EDI', 'EDI'),
    ]
    invoice_appearance = models.CharField(max_length=20, choices=APPEARANCE_CHOICES, default='ELECTRONIC', verbose_name="Invoice Appearance")
    payment_date = models.DateField(blank=True, null=True, verbose_name="Payment Date")
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name="Amount Paid")
    arrears_status = models.CharField(max_length=32, choices=ARREARS_STATUS_CHOICES, blank=True, null=True, verbose_name='Kintlévőség státusz')
    arrears_status_changed_at = models.DateTimeField(blank=True, null=True, verbose_name='Kintlévőség státuszváltás ideje')
    arrears_log = models.JSONField(blank=True, null=True, verbose_name='Behajtási napló')
    completeness_indicator = models.BooleanField(default=False, verbose_name="Completeness Indicator")
    order_reference = models.CharField(max_length=200, blank=True, null=True, verbose_name="Order Reference")
    # ERP integration
    erp_order_ids = models.JSONField(blank=True, null=True, verbose_name="ERP Order IDs", help_text="List of ERP order IDs associated with this invoice")
    # Chain references for corrections/storno
    original_invoice = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='modifications', verbose_name="Original Invoice")
    original_invoice_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="Original Invoice Number")
    modification_index = models.PositiveIntegerField(blank=True, null=True, verbose_name="Modification Index")
    modify_without_master = models.BooleanField(default=False, verbose_name="Modify Without Master")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name="Created By")
    print_snapshot = models.JSONField(blank=True, null=True, verbose_name="Print Snapshot")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Invoice"
        verbose_name_plural = "Invoices"
        ordering = ['-created_at']

    def __str__(self):
        return f"Invoice {self.invoice_number} - {self.customer.name}"

    @property
    def total_net_amount(self):
        return sum(item.net_amount for item in self.items.all())

    @property
    def total_vat_amount(self):
        return sum(item.vat_amount for item in self.items.all())

    @property
    def total_gross_amount(self):
        return sum(item.gross_amount for item in self.items.all())

    @property
    def outstanding_gross_amount(self):
        try:
            return max(self.total_gross_amount - self.amount_paid, 0)
        except Exception:
            return 0


class BankStatement(models.Model):
    """Bank statement header for grouping payments."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='bank_statements', verbose_name="Company")
    bank_account = models.ForeignKey(CompanyBankAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='bank_statements', verbose_name="Bank Account")
    statement_date = models.DateField(verbose_name="Statement Date")
    sequence_number = models.CharField(max_length=50, verbose_name="Sequence Number")
    currency = models.CharField(max_length=3, default='HUF', verbose_name="Currency")
    note = models.TextField(blank=True, null=True, verbose_name="Note")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Created By")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Bank Statement"
        verbose_name_plural = "Bank Statements"
        ordering = ['-statement_date', '-created_at']

    def __str__(self):
        return f"Bank statement {self.sequence_number} - {self.statement_date}"

    @property
    def total_amount(self):
        return sum(item.amount for item in self.items.all())


class BankStatementItem(models.Model):
    """Bank statement item that references one invoice payment."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_statement = models.ForeignKey(BankStatement, on_delete=models.CASCADE, related_name='items', verbose_name="Bank Statement")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='bank_statement_items', verbose_name="Customer")
    invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name='bank_statement_items', verbose_name="Invoice")
    incoming_invoice = models.ForeignKey('IncomingInvoiceDigest', on_delete=models.SET_NULL, null=True, blank=True, related_name='bank_statement_items', verbose_name="Incoming Invoice")
    amount = models.DecimalField(max_digits=14, decimal_places=2, verbose_name="Amount")
    note = models.CharField(max_length=500, blank=True, null=True, verbose_name="Note")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Bank Statement Item"
        verbose_name_plural = "Bank Statement Items"

    def __str__(self):
        return f"{self.customer.name} - {self.amount} ({self.invoice and self.invoice.invoice_number or 'no invoice'})"


class CashRegister(models.Model):
    """Cash register master data per company."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='cash_registers', verbose_name="Company")
    name = models.CharField(max_length=120, verbose_name="Cash Register Name")
    code = models.CharField(max_length=40, blank=True, null=True, verbose_name="Code")
    location = models.CharField(max_length=160, blank=True, null=True, verbose_name="Location")
    currency = models.CharField(max_length=3, default='HUF', verbose_name="Currency")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Created By")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Cash Register"
        verbose_name_plural = "Cash Registers"
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['company', 'name'], name='unique_cash_register_name_per_company'),
        ]

    def __str__(self):
        return f"{self.company.name} - {self.name}"


class CashRegisterTransaction(models.Model):
    """Cash in/out transaction linked to invoices."""
    TYPE_IN = 'IN'
    TYPE_OUT = 'OUT'
    TYPE_CHOICES = [
        (TYPE_IN, 'Befizetés'),
        (TYPE_OUT, 'Kifizetés'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='cash_transactions', verbose_name="Company")
    cash_register = models.ForeignKey(CashRegister, on_delete=models.CASCADE, related_name='transactions', verbose_name="Cash Register")
    transaction_type = models.CharField(max_length=8, choices=TYPE_CHOICES, verbose_name="Transaction Type")
    amount = models.DecimalField(max_digits=14, decimal_places=2, verbose_name="Amount")
    currency = models.CharField(max_length=3, default='HUF', verbose_name="Currency")
    invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name='cash_transactions', verbose_name="Outgoing Invoice")
    incoming_invoice = models.ForeignKey('IncomingInvoiceDigest', on_delete=models.SET_NULL, null=True, blank=True, related_name='cash_transactions', verbose_name="Incoming Invoice")
    voucher_number = models.CharField(max_length=64, unique=True, blank=True, null=True, verbose_name="Voucher Number")
    note = models.CharField(max_length=500, blank=True, null=True, verbose_name="Note")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Created By")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Cash Register Transaction"
        verbose_name_plural = "Cash Register Transactions"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['company', 'cash_register', 'created_at']),
            models.Index(fields=['company', 'transaction_type', 'created_at']),
        ]

    def save(self, *args, **kwargs):
        if not self.voucher_number:
            ts = timezone.now().strftime('%Y%m%d%H%M%S')
            self.voucher_number = f"KP-{ts}-{str(self.id)[:8]}"
        if not self.currency:
            self.currency = (self.cash_register.currency if self.cash_register_id else 'HUF') or 'HUF'
        super().save(*args, **kwargs)

    def __str__(self):
        label = 'IN' if self.transaction_type == self.TYPE_IN else 'OUT'
        return f"{self.voucher_number or self.id} - {label} - {self.amount}"


class ProformaInvoice(models.Model):
    """Pro forma invoice (Díjbekérő) model."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    proforma_number = models.CharField(max_length=32, unique=True, verbose_name="Díjbekérő száma")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='proformas', verbose_name="Company")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='proformas', verbose_name="Customer")
    items = models.ManyToManyField(InvoiceItem, related_name='proformas', verbose_name="Items")
    issue_date = models.DateField(verbose_name="Issue Date")
    due_date = models.DateField(verbose_name="Due Date")
    delivery_date = models.DateField(blank=True, null=True, verbose_name="Delivery Date")
    currency = models.CharField(max_length=3, default="HUF", verbose_name="Currency")
    payment_method = models.CharField(max_length=20, choices=Invoice.PAYMENT_METHOD_CHOICES, default='transfer', verbose_name="Fizetési mód")
    notes = models.TextField(blank=True, null=True, verbose_name="Notes")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name="Created By")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Payment tracking
    STATUS_UNPAID = 'unpaid'
    STATUS_PARTIAL = 'partial'
    STATUS_PAID = 'paid'
    STATUS_INVOICED = 'invoiced'
    STATUS_CHOICES = [
        ('unpaid', 'Kifizetetlen'),
        ('partial', 'Részben fizetve'),
        ('paid', 'Kifizetett'),
        ('invoiced', 'Kiszámlázott'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unpaid')
    payment_date = models.DateField(blank=True, null=True)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    class Meta:
        verbose_name = "Proforma Invoice"
        verbose_name_plural = "Proforma Invoices"
        ordering = ['-created_at']

    def __str__(self):
        return f"Proforma {self.proforma_number} - {self.customer.name}"

    @property
    def total_net_amount(self):
        return sum(item.net_amount for item in self.items.all())

    @property
    def total_vat_amount(self):
        return sum(item.vat_amount for item in self.items.all())

    @property
    def total_gross_amount(self):
        return sum(item.gross_amount for item in self.items.all())


class ScheduledInvoice(models.Model):
    MODE_INTERVAL = 'interval'
    MODE_WEEKDAY = 'weekday'
    MODE_MONTHDAY = 'monthday'
    MODE_CHOICES = [
        (MODE_INTERVAL, 'Időalapú'),
        (MODE_WEEKDAY, 'Heti naphoz kötött'),
        (MODE_MONTHDAY, 'Havi naphoz kötött'),
    ]

    INTERVAL_DAY = 'day'
    INTERVAL_WEEK = 'week'
    INTERVAL_MONTH = 'month'
    INTERVAL_YEAR = 'year'
    INTERVAL_UNIT_CHOICES = [
        (INTERVAL_DAY, 'Naponta'),
        (INTERVAL_WEEK, 'Hetente'),
        (INTERVAL_MONTH, 'Havonta'),
        (INTERVAL_YEAR, 'Évente'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='scheduled_invoices')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='scheduled_invoices')
    invoice_block = models.ForeignKey('InvoiceBlock', on_delete=models.SET_NULL, null=True, blank=True, related_name='scheduled_invoices')

    schedule_mode = models.CharField(max_length=16, choices=MODE_CHOICES, default=MODE_INTERVAL)
    interval_unit = models.CharField(max_length=12, choices=INTERVAL_UNIT_CHOICES, default=INTERVAL_MONTH)
    interval_value = models.PositiveIntegerField(default=1)
    weekday = models.PositiveSmallIntegerField(blank=True, null=True)  # 0=Hétfő ... 6=Vasárnap
    month_day = models.PositiveSmallIntegerField(blank=True, null=True)
    month_last_day = models.BooleanField(default=False)

    next_issue_date = models.DateField()
    last_issue_date = models.DateField(blank=True, null=True)

    due_offset_days = models.IntegerField(default=0)
    delivery_offset_days = models.IntegerField(default=0)

    approval_required = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=False)
    approved_at = models.DateTimeField(blank=True, null=True)
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_scheduled_invoices')

    auto_send_email = models.BooleanField(default=False)
    email_template_type = models.CharField(max_length=32, default=EmailTemplate.TEMPLATE_INVOICE_SEND)
    extra_emails = models.JSONField(default=list, blank=True)

    template_payload = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    last_error = models.TextField(blank=True, null=True)
    last_generated_invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name='scheduled_source_records')

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_scheduled_invoices')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Scheduled Invoice'
        verbose_name_plural = 'Scheduled Invoices'
        ordering = ['next_issue_date', 'created_at']
        indexes = [
            models.Index(fields=['company', 'is_active', 'next_issue_date']),
            models.Index(fields=['company', 'customer']),
        ]

    def __str__(self):
        return f"{self.customer.name} - {self.next_issue_date}"


class ScheduledInvoiceRun(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scheduled_invoice = models.ForeignKey(ScheduledInvoice, on_delete=models.CASCADE, related_name='runs')
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='scheduled_runs')
    issued_for_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Scheduled Invoice Run'
        verbose_name_plural = 'Scheduled Invoice Runs'
        ordering = ['-created_at']
        unique_together = (('scheduled_invoice', 'invoice'),)


class CronJobConfiguration(models.Model):
    STATUS_IDLE = 'idle'
    STATUS_OK = 'ok'
    STATUS_ERROR = 'error'
    STATUS_CHOICES = [
        (STATUS_IDLE, 'Még nem futott'),
        (STATUS_OK, 'Sikeres'),
        (STATUS_ERROR, 'Hibás'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job_key = models.CharField(max_length=80, unique=True)
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True, null=True)
    command_name = models.CharField(max_length=140)
    cron_expression = models.CharField(max_length=100, default='*/5 * * * *')
    is_active = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(blank=True, null=True)
    last_status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_IDLE)
    last_message = models.TextField(blank=True, null=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_cron_jobs')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Cron Job Configuration'
        verbose_name_plural = 'Cron Job Configurations'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.cron_expression})"


class AdvanceAllocation(models.Model):
    """Allocation of an advance invoice amount to a final invoice."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    advance_invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='advance_allocations_as_advance')
    final_invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='advance_allocations_as_final')
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Advance Allocation"
        verbose_name_plural = "Advance Allocations"


class NAVConfiguration(models.Model):
    """NAV API configuration model"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, verbose_name="Configuration Name")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    
    # API Configuration
    api_url = models.URLField(verbose_name="API URL")
    is_test_environment = models.BooleanField(default=True, verbose_name="Test Environment")
    
    # User credentials
    login = models.CharField(max_length=100, verbose_name="Login")
    password = models.CharField(max_length=200, verbose_name="Password")
    tax_number = models.CharField(max_length=20, verbose_name="Tax Number")
    sign_key = models.CharField(max_length=100, verbose_name="Sign Key")
    exchange_key = models.CharField(max_length=100, verbose_name="Exchange Key")
    
    # Software information
    software_id = models.CharField(max_length=50, verbose_name="Software ID")
    software_name = models.CharField(max_length=100, verbose_name="Software Name")
    software_operation = models.CharField(max_length=50, default="ONLINE_SERVICE", verbose_name="Software Operation")
    software_main_version = models.CharField(max_length=20, verbose_name="Software Main Version")
    software_dev_name = models.CharField(max_length=100, verbose_name="Software Developer Name")
    software_dev_contact = models.CharField(max_length=200, verbose_name="Software Developer Contact")
    software_dev_country_code = models.CharField(max_length=2, default="HU", verbose_name="Software Developer Country Code")
    software_dev_tax_number = models.CharField(max_length=20, verbose_name="Software Developer Tax Number")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "NAV Configuration"
        verbose_name_plural = "NAV Configurations"

    def __str__(self):
        return f"{self.name} ({'Test' if self.is_test_environment else 'Production'})"


class Contact(models.Model):
    """Contact person model for customers"""
    CONTACT_TYPES = [
        ('primary', 'Elsődleges'),
        ('billing', 'Számlázási'),
        ('technical', 'Technikai'),
        ('sales', 'Értékesítési'),
        ('support', 'Támogatási'),
        ('other', 'Egyéb'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='contacts', verbose_name="Ügyfél", null=True, blank=True)
    is_receipt = models.BooleanField(default=False, verbose_name="Nyugtás")
    
    # Alapadatok
    first_name = models.CharField(max_length=100, verbose_name="Keresztnév")
    last_name = models.CharField(max_length=100, verbose_name="Vezetéknév")
    position = models.CharField(max_length=100, blank=True, null=True, verbose_name="Pozíció")
    department = models.CharField(max_length=100, blank=True, null=True, verbose_name="Osztály")
    contact_type = models.CharField(max_length=20, choices=CONTACT_TYPES, default='primary', verbose_name="Kapcsolattartó típusa")
    
    # Kapcsolattartási adatok
    email = models.EmailField(blank=True, null=True, verbose_name="E-mail")
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="Telefon")
    mobile = models.CharField(max_length=20, blank=True, null=True, verbose_name="Mobil")
    fax = models.CharField(max_length=20, blank=True, null=True, verbose_name="Fax")
    
    # További információk
    notes = models.TextField(blank=True, null=True, verbose_name="Megjegyzések")
    is_primary = models.BooleanField(default=False, verbose_name="Elsődleges kapcsolattartó")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Kapcsolattartó"
        verbose_name_plural = "Kapcsolattartók"
        ordering = ['-is_primary', 'last_name', 'first_name']

    def __str__(self):
        return f"{self.last_name} {self.first_name} ({self.customer.name})"
    
    @property
    def full_name(self):
        return f"{self.last_name} {self.first_name}"


class SystemUser(models.Model):
    """System user model for multi-company access"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    first_name = models.CharField(max_length=100, verbose_name="First Name")
    last_name = models.CharField(max_length=100, verbose_name="Last Name")
    email = models.EmailField(unique=True, verbose_name="Email")
    password_hash = models.CharField(max_length=255, verbose_name="Password Hash")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    last_login = models.DateTimeField(null=True, blank=True, verbose_name="Last Login")
    companies = models.ManyToManyField(Company, related_name='users', verbose_name="Companies")
    roles = models.ManyToManyField('Role', related_name='users', verbose_name="Roles", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "System User"
        verbose_name_plural = "System Users"
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f"{self.last_name} {self.first_name} ({self.email})"
    
    @property
    def full_name(self):
        return f"{self.last_name} {self.first_name}"

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)
        self.save()

    def check_password(self, raw_password):
        return check_password(raw_password, self.password_hash)


class Role(models.Model):
    """Role with menu-level permissions"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True, verbose_name="Role Name")
    description = models.TextField(blank=True, null=True, verbose_name="Description")
    menu_permissions = models.JSONField(default=list, verbose_name="Menu Permissions")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Role"
        verbose_name_plural = "Roles"
        ordering = ['name']

    def __str__(self):
        return self.name


class InvoiceBlock(models.Model):
    """Invoice block model for invoice number generation"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='invoice_blocks', verbose_name="Company")
    name = models.CharField(max_length=100, verbose_name="Block Name")
    prefix = models.CharField(max_length=20, verbose_name="Prefix")
    start_number = models.PositiveIntegerField(default=1, verbose_name="Start Number")
    current_number = models.PositiveIntegerField(default=1, verbose_name="Current Number")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    APPEARANCE_CHOICES = [
        ('PAPER', 'Papír'),
        ('ELECTRONIC', 'Elektronikus'),
        ('EDI', 'EDI'),
    ]
    invoice_appearance = models.CharField(max_length=20, choices=APPEARANCE_CHOICES, default='ELECTRONIC', verbose_name="Invoice Appearance")
    default_currency = models.CharField(max_length=3, default='HUF', verbose_name="Default Currency")
    default_bank_account = models.ForeignKey(
        'CompanyBankAccount', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='invoice_blocks',
        verbose_name="Default Bank Account"
    )
    default_vat_type = models.ForeignKey(
        'VATType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoice_blocks',
        verbose_name="Default VAT Type"
    )
    
    footer_note = models.TextField(blank=True, null=True, verbose_name="Lábjegyzék")

    LANGUAGE_CHOICES = [
        ('hu', 'Magyar'),
        ('en', 'Angol'),
        ('de', 'Német'),
    ]
    language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default='hu', verbose_name="Language")
    second_language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, null=True, blank=True, verbose_name="Second Language")

    # Optional NAV configuration bound to this block
    nav_configuration = models.ForeignKey(
        'CompanyNAVConfiguration',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoice_blocks',
        verbose_name="NAV Configuration"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Invoice Block"
        verbose_name_plural = "Invoice Blocks"
        ordering = ['company', 'name']

    def __str__(self):
        return f"{self.name} ({self.prefix}) - {self.company.name}"

    def get_next_invoice_number(self):
        """Generate next invoice number in format: [PREFIX][YEAR][NUMBER]"""
        from datetime import datetime
        year = datetime.now().year
        invoice_number = f"{self.prefix}{year}{self.current_number:06d}"
        self.current_number += 1
        self.save()
        return invoice_number

    @property
    def invoice_count(self):
        """Count of invoices in this block"""
        return self.invoices.count()

    @property
    def cancelled_count(self):
        """Count of cancelled invoices in this block"""
        return self.invoices.filter(status='cancelled').count()

    @property
    def total_net_amount(self):
        """Total net amount in this block"""
        total = 0
        for invoice in self.invoices.all():
            total += invoice.total_net_amount
        return total

    @property
    def total_vat_amount(self):
        """Total VAT amount in this block"""
        total = 0
        for invoice in self.invoices.all():
            total += invoice.total_vat_amount
        return total


class CompanyNAVConfiguration(models.Model):
    """Company-specific NAV configuration"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='nav_configurations', verbose_name="Company")
    name = models.CharField(max_length=100, verbose_name="Configuration Name")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    is_default = models.BooleanField(default=False, verbose_name="Default")
    
    # API Configuration
    api_url = models.URLField(verbose_name="API URL")
    is_test_environment = models.BooleanField(default=True, verbose_name="Test Environment")
    
    # User credentials
    login = models.CharField(max_length=100, verbose_name="Login")
    password = models.CharField(max_length=200, verbose_name="Password")
    tax_number = models.CharField(max_length=20, verbose_name="Tax Number")
    sign_key = models.CharField(max_length=100, verbose_name="Sign Key")
    exchange_key = models.CharField(max_length=100, verbose_name="Exchange Key")
    
    # Software information
    software_id = models.CharField(max_length=50, verbose_name="Software ID")
    software_name = models.CharField(max_length=100, verbose_name="Software Name")
    software_operation = models.CharField(max_length=50, default="ONLINE_SERVICE", verbose_name="Software Operation")
    software_main_version = models.CharField(max_length=20, verbose_name="Software Main Version")
    software_dev_name = models.CharField(max_length=100, verbose_name="Software Developer Name")
    software_dev_contact = models.CharField(max_length=200, verbose_name="Software Developer Contact")
    software_dev_country_code = models.CharField(max_length=2, default="HU", verbose_name="Software Developer Country Code")
    software_dev_tax_number = models.CharField(max_length=20, verbose_name="Software Developer Tax Number")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Company NAV Configuration"
        verbose_name_plural = "Company NAV Configurations"
        ordering = ['company', 'name']

    def __str__(self):
        return f"{self.name} - {self.company.name} ({'Test' if self.is_test_environment else 'Production'})"


class APIAccessRule(models.Model):
    """Per-company API access control with optional invoice block overrides."""
    SCOPE_ALL = 'ALL'
    SCOPE_NAV_COMPANY_QUERY = 'nav.companyQuery'
    SCOPE_CUSTOMER_SYNC = 'customer.sync'
    SCOPE_CONTACT_SYNC = 'contact.sync'
    SCOPE_INVOICE_SEND = 'invoice.send'

    SCOPE_CHOICES = [
        (SCOPE_ALL, 'All access'),
        (SCOPE_NAV_COMPANY_QUERY, 'NAV céglekérdezés'),
        (SCOPE_CUSTOMER_SYNC, 'Ügyfél szinkronizálás'),
        (SCOPE_CONTACT_SYNC, 'Kapcsolattartó szinkronizálás'),
        (SCOPE_INVOICE_SEND, 'Számla küldés'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='api_access_rules', verbose_name='Company')
    invoice_block = models.ForeignKey('InvoiceBlock', on_delete=models.CASCADE, null=True, blank=True, related_name='api_access_rules', verbose_name='Invoice Block')
    scope = models.CharField(max_length=64, choices=SCOPE_CHOICES)
    allowed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'API Access Rule'
        verbose_name_plural = 'API Access Rules'
        constraints = [
            # Uniqueness for company-level rules (invoice_block is NULL)
            models.UniqueConstraint(fields=['company', 'scope'], name='unique_api_access_company_scope', condition=models.Q(invoice_block__isnull=True)),
            # Uniqueness for invoice-block level rules
            models.UniqueConstraint(fields=['company', 'invoice_block', 'scope'], name='unique_api_access_block_scope', condition=models.Q(invoice_block__isnull=False)),
        ]

    def __str__(self):
        lvl = 'company' if self.invoice_block_id is None else f'block:{self.invoice_block_id}'
        return f"APIAccessRule({self.company_id}, {lvl}, {self.scope}={self.allowed})"

    @classmethod
    def has_access(cls, company, scope: str, invoice_block=None) -> bool:
        """Return True if access is allowed for given company/scope.
        Precedence:
          - If there are any rules for the given invoice_block, those act as overrides (only listed scopes are allowed for that block).
          - Else, fall back to company-level: allow if ALL is allowed or the scope is allowed.
        """
        try:
            if invoice_block is not None:
                # Use overrides if exist for this block
                exists_for_block = cls.objects.filter(company=company, invoice_block=invoice_block).exists()
                if exists_for_block:
                    return cls.objects.filter(company=company, invoice_block=invoice_block, scope=scope, allowed=True).exists()

            # Company level fallbacks
            if scope != cls.SCOPE_ALL and cls.objects.filter(company=company, invoice_block__isnull=True, scope=cls.SCOPE_ALL, allowed=True).exists():
                return True
            return cls.objects.filter(company=company, invoice_block__isnull=True, scope=scope, allowed=True).exists()
        except Exception:
            return False


class APIClient(models.Model):
    """Named API credential per company for third-party integrations."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='api_clients', verbose_name='Company')
    name = models.CharField(max_length=150, verbose_name='API kapcsolat neve')
    api_key = models.CharField(max_length=64, unique=True, verbose_name='API-kulcs')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'API Client'
        verbose_name_plural = 'API Clients'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        import secrets
        if not self.api_key:
            self.api_key = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} - {self.company.name}"


class APIClientAccessRule(models.Model):
    """Per-API-client access rules, mirroring APIAccessRule but scoped to a credential."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    api_client = models.ForeignKey(APIClient, on_delete=models.CASCADE, related_name='access_rules', verbose_name='API Client')
    invoice_block = models.ForeignKey('InvoiceBlock', on_delete=models.CASCADE, null=True, blank=True, related_name='api_client_access_rules', verbose_name='Invoice Block')
    scope = models.CharField(max_length=64, choices=APIAccessRule.SCOPE_CHOICES)
    allowed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'API Client Access Rule'
        verbose_name_plural = 'API Client Access Rules'
        constraints = [
            models.UniqueConstraint(fields=['api_client', 'scope'], name='unique_api_client_scope', condition=models.Q(invoice_block__isnull=True)),
            models.UniqueConstraint(fields=['api_client', 'invoice_block', 'scope'], name='unique_api_client_block_scope', condition=models.Q(invoice_block__isnull=False)),
        ]

    def __str__(self):
        lvl = 'client' if self.invoice_block_id is None else f'block:{self.invoice_block_id}'
        return f"APIClientAccessRule({self.api_client_id}, {lvl}, {self.scope}={self.allowed})"

    @classmethod
    def has_access(cls, api_client, scope: str, invoice_block=None) -> bool:
        try:
            if invoice_block is not None:
                exists_for_block = cls.objects.filter(api_client=api_client, invoice_block=invoice_block).exists()
                if exists_for_block:
                    return cls.objects.filter(api_client=api_client, invoice_block=invoice_block, scope=scope, allowed=True).exists()
            if scope != APIAccessRule.SCOPE_ALL and cls.objects.filter(api_client=api_client, invoice_block__isnull=True, scope=APIAccessRule.SCOPE_ALL, allowed=True).exists():
                return True
            return cls.objects.filter(api_client=api_client, invoice_block__isnull=True, scope=scope, allowed=True).exists()
        except Exception:
            return False


class VATType(models.Model):
    """Master data for VAT types (NAV codes and percentage types)"""
    CATEGORY_CHOICES = [
        ('PERCENT', 'Százalékos'),
        ('EXEMPT', 'Adómentes'),
        ('REVERSE', 'Fordított adózás'),
        ('MARGIN', 'Különbözeti ÁFA'),
        ('OTHER', 'Egyéb'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=30, unique=True, verbose_name="Kód (NAV)")
    name = models.CharField(max_length=100, verbose_name="Megnevezés")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='PERCENT', verbose_name="Kategória")
    percentage = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, verbose_name="Százalék")
    description = models.TextField(blank=True, null=True, verbose_name="Leírás")
    active = models.BooleanField(default=True, verbose_name="Aktív")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Sorrend")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "ÁFA típus"
        verbose_name_plural = "ÁFA típusok"
        ordering = ['sort_order', 'name']

    def __str__(self):
        return f"{self.code} - {self.name}"


class PaymentBatch(models.Model):
    """Payment batch for grouping transfer payments of incoming invoices."""
    STATUS_CHOICES = [
        ('PENDING', 'Függő'),
        ('EXPORTED', 'Exportálva'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='payment_batches', verbose_name='Company')
    name = models.CharField(max_length=100, verbose_name='Batch Name')
    bank_account = models.ForeignKey(CompanyBankAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='payment_batches', verbose_name='Bank Account')
    currency = models.CharField(max_length=3, default='HUF', verbose_name='Currency')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING', verbose_name='Status')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Created By')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Payment Batch'
        verbose_name_plural = 'Payment Batches'
        ordering = ['-created_at']

    def __str__(self):
        return f"PaymentBatch {self.name} ({self.company.name})"

    @property
    def item_count(self):
        return self.items.count()


class PaymentBatchItem(models.Model):
    """Item in a payment batch referencing an incoming invoice digest."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(PaymentBatch, on_delete=models.CASCADE, related_name='items')
    invoice_number = models.CharField(max_length=100)
    supplier_tax_number = models.CharField(max_length=20, blank=True, null=True)
    supplier_name = models.CharField(max_length=300, blank=True, null=True)
    amount_gross = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=10, default='HUF')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Payment Batch Item'
        verbose_name_plural = 'Payment Batch Items'
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['supplier_tax_number']),
        ]
        unique_together = (('batch', 'invoice_number', 'supplier_tax_number'),)

    def __str__(self):
        return f"{self.invoice_number} - {self.amount_gross} {self.currency}"


class Currency(models.Model):
    """Supported currencies and exchange rates"""
    code = models.CharField(max_length=3, unique=True, verbose_name="Currency Code")
    name = models.CharField(max_length=50, verbose_name="Currency Name")
    symbol = models.CharField(max_length=5, blank=True, null=True, verbose_name="Symbol")
    current_rate = models.DecimalField(max_digits=12, decimal_places=4, default=1.0, verbose_name="Current Rate (to HUF)")
    display_decimals = models.PositiveSmallIntegerField(default=2, verbose_name="Megjelenítési tizedes jegyek")
    last_updated = models.DateTimeField(auto_now=True, verbose_name="Last Updated")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    is_default = models.BooleanField(default=False, verbose_name="Default")

    class Meta:
        verbose_name = "Currency"
        verbose_name_plural = "Currencies"
        ordering = ['code']

    def __str__(self):
        return f"{self.code} ({self.current_rate})"

    def save(self, *args, **kwargs):
        if self.is_default:
            Currency.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class BackupConfiguration(models.Model):
    """Backup configuration settings"""
    INTERVAL_CHOICES = [
        ('daily', 'Napi'),
        ('weekly', 'Heti'),
        ('monthly', 'Havi'),
    ]
    
    name = models.CharField(max_length=100, verbose_name="Konfiguráció neve")
    interval = models.CharField(max_length=10, choices=INTERVAL_CHOICES, verbose_name="Mentési gyakoriság")
    retention_days = models.IntegerField(verbose_name="Megőrzési idő (nap)", help_text="Ennyi nap után felülírhatók a régi backup fájlok")
    is_active = models.BooleanField(default=True, verbose_name="Aktív")
    last_backup = models.DateTimeField(null=True, blank=True, verbose_name="Utolsó mentés")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Módosítva")

    class Meta:
        verbose_name = 'Backup konfiguráció'
        verbose_name_plural = 'Backup konfigurációk'
        ordering = ['interval']
        db_table = 'backup_configurations'

    def __str__(self):
        return f"{self.name} ({self.get_interval_display()})"


class BackupFile(models.Model):
    """Backup file records"""
    configuration = models.ForeignKey(BackupConfiguration, on_delete=models.SET_NULL, null=True, blank=True, related_name='backups', verbose_name="Konfiguráció")
    filename = models.CharField(max_length=255, verbose_name="Fájlnév")
    filepath = models.CharField(max_length=500, verbose_name="Fájl útvonal")
    file_size = models.BigIntegerField(verbose_name="Fájlméret (byte)")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Létrehozva")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Létrehozta")
    is_manual = models.BooleanField(default=False, verbose_name="Manuális mentés")

    class Meta:
        verbose_name = 'Backup fájl'
        verbose_name_plural = 'Backup fájlok'
        ordering = ['-created_at']
        db_table = 'backup_files'

    def __str__(self):
        return self.filename

    @property
    def file_size_mb(self):
        """Return file size in MB"""
        return round(self.file_size / (1024 * 1024), 2)
