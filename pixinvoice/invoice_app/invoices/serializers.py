import json
import re
import decimal

from rest_framework import serializers
from django.db import models
from django.db import transaction
from django.db import IntegrityError
from django.utils import timezone
from .models import (
    Customer, Invoice, InvoiceItem, NAVConfiguration, Contact, Company, SystemUser, Role,
    InvoiceBlock, CompanyNAVConfiguration, CustomerBankAccount, CompanyBankAccount, VATType,
    BankStatement, BankStatementItem, ProformaInvoice, CompanyEmailSettings, PaymentBatch, PaymentBatchItem, IncomingDocument,
    BackupConfiguration, BackupFile, Currency, EmailTemplate, EmailSignature, CashRegister, CashRegisterTransaction, IncomingInvoiceDigest,
    CronJobConfiguration, IncomingProforma, IncomingProformaDocument, IncomingProformaInvoiceLink,
)


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = '__all__'
        read_only_fields = ['id', 'last_updated']


def _validate_cron_expression(value):
    raw = str(value or '').strip()
    parts = raw.split()
    if len(parts) != 5:
        raise serializers.ValidationError('A cron kifejezésnek 5 mezőből kell állnia (perc óra nap hónap hétköznap).')

    allowed_chars = set('0123456789*,-/')
    ranges = [
        (0, 59),
        (0, 23),
        (1, 31),
        (1, 12),
        (0, 6),
    ]

    def _validate_item(token, minimum, maximum):
        if token == '*':
            return
        if set(token) - allowed_chars:
            raise serializers.ValidationError(f'Hibás karakter a cron mezőben: {token}')

        for part in token.split(','):
            part = part.strip()
            if not part:
                raise serializers.ValidationError('Üres cron rész nem megengedett.')

            if '/' in part:
                left, step = part.split('/', 1)
                if not step.isdigit() or int(step) <= 0:
                    raise serializers.ValidationError(f'Hibás lépésérték: {part}')
                if left in ('*', ''):
                    continue
                part = left

            if part == '*':
                continue
            if '-' in part:
                start_str, end_str = part.split('-', 1)
                if not start_str.isdigit() or not end_str.isdigit():
                    raise serializers.ValidationError(f'Hibás tartomány: {part}')
                start = int(start_str)
                end = int(end_str)
                if start > end or start < minimum or end > maximum:
                    raise serializers.ValidationError(f'Tartomány kívül esik a megengedett határon: {part}')
                continue
            if not part.isdigit():
                raise serializers.ValidationError(f'Hibás érték: {part}')
            num = int(part)
            if num < minimum or num > maximum:
                raise serializers.ValidationError(f'Érték kívül esik a megengedett határon: {part}')

    for idx, token in enumerate(parts):
        min_v, max_v = ranges[idx]
        _validate_item(token, min_v, max_v)

    return raw


class CronJobConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CronJobConfiguration
        fields = [
            'id', 'job_key', 'name', 'description', 'command_name',
            'cron_expression', 'is_active', 'last_run_at', 'last_status', 'last_message',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'job_key', 'name', 'description', 'command_name',
            'last_run_at', 'last_status', 'last_message', 'created_at', 'updated_at',
        ]

    def validate_cron_expression(self, value):
        return _validate_cron_expression(value)


NAV_PROGRESS_STATUSES = {'submitted_to_nav', 'nav_processed', 'nav_rejected'}


def _is_effectively_paid(invoice, paid_amount):
    try:
        gross = decimal.Decimal(str(invoice.total_gross_amount or 0))
        paid = decimal.Decimal(str(paid_amount or 0))
    except Exception:
        return False
    currency = str(getattr(invoice, 'currency', '')).upper()
    payment_method = str(getattr(invoice, 'payment_method', '')).lower()
    payable = gross
    if currency == 'HUF' and payment_method in ('cash', 'cod'):
        payable = (gross / decimal.Decimal('5')).quantize(decimal.Decimal('1'), rounding=decimal.ROUND_HALF_UP) * decimal.Decimal('5')
    tolerance = decimal.Decimal('5.0') if currency == 'HUF' else decimal.Decimal('0.01')
    return (payable - paid) < tolerance


class InvoiceItemSerializer(serializers.ModelSerializer):
    net_amount = serializers.ReadOnlyField()
    vat_amount = serializers.ReadOnlyField()
    gross_amount = serializers.ReadOnlyField()
    vat_type_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    vat_type = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'description', 'quantity', 'unit_price', 'vat_rate',
            'vat_type_id', 'vat_type', 'vat_reason',
            'unit_of_measure', 'nature_indicator', 'product_code_category', 'product_code_value',
            'deletion_code', 'note', 'original_line_number', 'line_operation',
            'net_amount', 'vat_amount', 'gross_amount'
        ]

    def get_vat_type(self, obj):
        if obj.vat_type:
            return {
                'id': str(obj.vat_type.id),
                'code': obj.vat_type.code,
                'name': obj.vat_type.name,
                'category': obj.vat_type.category,
                'percentage': float(obj.vat_type.percentage) if obj.vat_type.percentage is not None else None,
            }
        return None

    def validate(self, attrs):
        # Map vat_type_id to relation and align vat_rate for percentage types
        vat_type_id = attrs.pop('vat_type_id', None)
        if vat_type_id:
            try:
                vt = VATType.objects.get(id=vat_type_id)
            except VATType.DoesNotExist:
                raise serializers.ValidationError({'vat_type_id': 'ÁFA típus nem található'})
            attrs['vat_type'] = vt
            if vt.category == 'PERCENT' and vt.percentage is not None:
                attrs['vat_rate'] = vt.percentage
            elif vt.category in ('EXEMPT', 'REVERSE', 'MARGIN'):
                attrs['vat_rate'] = 0
        return attrs


class CustomerSerializer(serializers.ModelSerializer):
    bank_accounts = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = Customer
        fields = [
            'id', 'name', 'short_name', 'tax_number', 'full_tax_number', 'address',
            'street_name', 'public_place_category', 'street_number', 'building', 'staircase', 'floor', 'door',
            'city', 'postal_code', 'country', 'email', 'phone', 'vat_code', 'county_code', 
            'vat_group_id', 'vat_group_member_tax_number', 'group_tax_number', 'vat_status', 'is_hungarian_taxpayer', 'eu_tax_number', 'created_at', 'updated_at',
            'payment_due_days', 'is_supplier', 'is_customer', 'bank_accounts', 'payment_method', 'default_currency'
        ]

    def validate(self, attrs):
        vat_status = attrs.get('vat_status', getattr(self.instance, 'vat_status', 'DOMESTIC'))
        attrs['is_hungarian_taxpayer'] = (vat_status == 'DOMESTIC')

        if attrs['is_hungarian_taxpayer']:
            # Adószám egyediség ellenőrzése (8 számjegy, szóköz és kötőjel nélkül)
            val = attrs.get('tax_number', getattr(self.instance, 'tax_number', ''))
            # Handle potential None from client or database
            if val is None:
                val = ''
            tax_number = val.replace('-', '').replace(' ', '')
            
            if tax_number:
                tax_number = tax_number[:8]
                if len(tax_number) != 8:
                    raise serializers.ValidationError({'tax_number': 'Az adószámnak 8 számjegyből kell állnia'})

                existing = Customer.objects.filter(tax_number=tax_number)
                if self.instance:
                    existing = existing.exclude(id=self.instance.id)
                if existing.exists():
                    raise serializers.ValidationError({'tax_number': 'Már létezik ügyfél ezzel az adószámmal'})

                # Normalizált értékkel dolgozzunk tovább
                attrs['tax_number'] = tax_number
        return attrs

    def get_bank_accounts(self, obj):
        accounts = obj.bank_accounts.all()
        return [
            {
                'id': str(a.id),
                'bank_name': a.bank_name,
                'account_number': a.account_number,
                'iban': a.iban,
                'swift_bic': a.swift_bic,
                'currency': a.currency,
                'is_primary': a.is_primary,
            }
            for a in accounts
        ]

class CustomerBankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerBankAccount
        fields = ['id', 'customer', 'bank_name', 'account_number', 'iban', 'swift_bic', 'currency', 'is_primary', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class CompanyMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['id', 'name', 'tax_number']


class BankStatementItemSerializer(serializers.ModelSerializer):
    invoice_number = serializers.SerializerMethodField(read_only=True)
    customer_name = serializers.SerializerMethodField(read_only=True)
    invoice_type = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = BankStatementItem
        fields = ['id', 'bank_statement', 'customer', 'invoice', 'incoming_invoice', 'invoice_type', 'invoice_number', 'customer_name', 'amount', 'note', 'created_at']
        read_only_fields = ['id', 'created_at', 'invoice_number', 'customer_name', 'bank_statement']

    def get_invoice_number(self, obj):
        if obj.invoice:
            return obj.invoice.invoice_number
        if getattr(obj, 'incoming_invoice', None):
            return obj.incoming_invoice.invoice_number
        note = str(getattr(obj, 'note', '') or '').strip()
        if note:
            patterns = [
                r'[A-Z]{1,6}\s?\d{4}[/\-]\d{1,8}',
                r'[A-Z]{2,8}\d{5,20}',
                r'\d{4}[/\-]\d{3,12}',
            ]
            upper_note = note.upper()
            for pattern in patterns:
                match = re.search(pattern, upper_note)
                if match:
                    return match.group(0).strip()
        return None

    def get_customer_name(self, obj):
        return obj.customer.name if obj.customer else None

    def get_invoice_type(self, obj):
        if obj.invoice_id:
            return 'outgoing'
        if getattr(obj, 'incoming_invoice_id', None):
            return 'incoming'
        return None


class BankStatementSerializer(serializers.ModelSerializer):
    items = BankStatementItemSerializer(many=True, required=False)
    total_amount = serializers.SerializerMethodField(read_only=True)
    company_name = serializers.SerializerMethodField(read_only=True)
    bank_account_name = serializers.SerializerMethodField(read_only=True)
    source_file_name = serializers.SerializerMethodField(read_only=True)
    source_file_download_url = serializers.SerializerMethodField(read_only=True)
    saved_items_count = serializers.SerializerMethodField(read_only=True)
    total_items_count = serializers.SerializerMethodField(read_only=True)
    import_preview_items = serializers.SerializerMethodField(read_only=True)
    display_note = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = BankStatement
        fields = [
            'id', 'company', 'company_name', 'bank_account', 'bank_account_name', 'statement_date', 'sequence_number', 'currency', 'note',
            'display_note', 'source_file_name', 'source_file_download_url', 'saved_items_count', 'total_items_count', 'import_preview_items',
            'created_by', 'created_at', 'updated_at', 'items', 'total_amount'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'total_amount']

    def _extract_import_meta(self, obj):
        note = str(getattr(obj, 'note', '') or '')
        match = re.search(r'\[\[IMPORT_META:(.*?)\]\]', note, flags=re.S)
        if not match:
            return {}, note
        try:
            meta = json.loads(match.group(1))
            if not isinstance(meta, dict):
                meta = {}
        except Exception:
            meta = {}
        clean_note = (note[:match.start()] + note[match.end():]).strip()
        return meta, clean_note

    def get_company_name(self, obj):
        try:
            return obj.company.name
        except Exception:
            return None

    def get_bank_account_name(self, obj):
        try:
            acc = obj.bank_account
            if not acc:
                return None
            label = (acc.bank_name + ' - ') if acc.bank_name else ''
            return f"{label}{acc.iban or acc.account_number or ''}"
        except Exception:
            return None

    def get_source_file_name(self, obj):
        meta, _ = self._extract_import_meta(obj)
        value = meta.get('xml')
        return str(value).strip() if value else None

    def get_source_file_download_url(self, obj):
        meta, _ = self._extract_import_meta(obj)
        token = str(meta.get('xml_file_token') or '').strip()
        if not token:
            return None
        return f"/api/bank-statements/{obj.id}/download-source-xml/"

    def get_saved_items_count(self, obj):
        meta, _ = self._extract_import_meta(obj)
        value = meta.get('saved_items')
        if value is not None:
            try:
                return int(value)
            except Exception:
                pass
        return obj.items.count()

    def get_total_items_count(self, obj):
        meta, _ = self._extract_import_meta(obj)
        value = meta.get('total_items')
        if value is not None:
            try:
                return int(value)
            except Exception:
                pass
        return obj.items.count()

    def get_import_preview_items(self, obj):
        meta, _ = self._extract_import_meta(obj)
        value = meta.get('preview_items')
        return value if isinstance(value, list) else None

    def get_display_note(self, obj):
        _, clean_note = self._extract_import_meta(obj)
        return clean_note

    def get_total_amount(self, obj):
        total = decimal.Decimal('0')
        for item in obj.items.all():
            try:
                total += decimal.Decimal(str(item.amount or 0))
            except Exception:
                continue
        return float(total)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        try:
            _, clean_note = self._extract_import_meta(instance)
            data['note'] = clean_note
            if 'display_note' in data:
                data['display_note'] = clean_note
        except Exception:
            pass
        return data

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        bank_acc = validated_data.get('bank_account')
        company = validated_data.get('company')
        if bank_acc and not company:
            try:
                validated_data['company'] = bank_acc.company
            except Exception:
                pass
        if bank_acc and company and getattr(bank_acc, 'company_id', None) and bank_acc.company_id != company.id:
            raise serializers.ValidationError({'bank_account': 'A kiválasztott bankszámla nem ehhez a céghez tartozik'})

        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user

        with transaction.atomic():
            statement = BankStatement.objects.create(**validated_data)
            touched_outgoing_ids = set()
            touched_incoming_ids = set()
            for item in (items_data or []):
                invoice = item.get('invoice')
                if invoice and not isinstance(invoice, Invoice):
                    invoice = Invoice.objects.filter(id=invoice).first()

                incoming_invoice = item.get('incoming_invoice')
                if incoming_invoice and not isinstance(incoming_invoice, IncomingInvoiceDigest):
                    incoming_invoice = IncomingInvoiceDigest.objects.filter(id=incoming_invoice).first()

                customer = item.get('customer')
                if customer and not isinstance(customer, Customer):
                    customer = Customer.objects.filter(id=customer).first()
                if invoice and not customer:
                    customer = invoice.customer

                amount_raw = item.get('amount') if isinstance(item, dict) else None
                try:
                    amount = decimal.Decimal(str(amount_raw if amount_raw not in (None, '') else 0))
                except Exception:
                    amount = decimal.Decimal('0')

                bsi = BankStatementItem.objects.create(
                    bank_statement=statement,
                    customer=customer,
                    invoice=invoice,
                    incoming_invoice=incoming_invoice,
                    amount=amount,
                    note=item.get('note') or '',
                )
                if bsi.invoice_id:
                    touched_outgoing_ids.add(str(bsi.invoice_id))
                if bsi.incoming_invoice_id:
                    touched_incoming_ids.add(str(bsi.incoming_invoice_id))

            company = validated_data.get('company') or getattr(statement, 'company', None)
            if company and touched_outgoing_ids:
                for inv in Invoice.objects.filter(company=company, id__in=list(touched_outgoing_ids)):
                    agg = BankStatementItem.objects.filter(bank_statement__company=company, invoice=inv).aggregate(
                        total=models.Sum('amount'),
                        last_date=models.Max('bank_statement__statement_date')
                    )
                    paid_amount = decimal.Decimal(str(agg.get('total') or 0))
                    if paid_amount < 0:
                        paid_amount = decimal.Decimal('0')
                    is_nav_status = inv.status in NAV_PROGRESS_STATUSES
                    if _is_effectively_paid(inv, paid_amount):
                        new_status = inv.status if is_nav_status else 'paid'
                    elif paid_amount > 0:
                        new_status = inv.status if is_nav_status else 'partially_paid'
                    elif inv.status in ('paid', 'partially_paid'):
                        new_status = 'sent'
                    else:
                        new_status = inv.status
                    new_payment_date = agg.get('last_date') if paid_amount > 0 else None
                    update_fields = []
                    if inv.amount_paid != paid_amount:
                        inv.amount_paid = paid_amount
                        update_fields.append('amount_paid')
                    if inv.status != new_status:
                        inv.status = new_status
                        update_fields.append('status')
                    if inv.payment_date != new_payment_date:
                        inv.payment_date = new_payment_date
                        update_fields.append('payment_date')
                    if update_fields:
                        inv.save(update_fields=list(dict.fromkeys(update_fields + ['updated_at'])))

            if company and touched_incoming_ids:
                for inc in IncomingInvoiceDigest.objects.filter(company=company, id__in=list(touched_incoming_ids)):
                    qs = BankStatementItem.objects.filter(bank_statement__company=company, incoming_invoice=inc).select_related('bank_statement')
                    agg = qs.aggregate(last_date=models.Max('bank_statement__statement_date'))
                    paid_amount = decimal.Decimal('0')
                    for row in qs:
                        try:
                            paid_amount += abs(decimal.Decimal(str(row.amount or 0)))
                        except Exception:
                            continue
                    gross = decimal.Decimal(str((inc.invoice_net_amount or 0) + (inc.invoice_vat_amount or 0)))
                    new_payment_date = agg.get('last_date') if paid_amount > 0 else None
                    update_fields = []
                    if _is_effectively_paid(inc, paid_amount):
                        new_payment_status = 'paid'
                    elif paid_amount > 0:
                        new_payment_status = 'partially_paid'
                    elif inc.payment_status in ('paid', 'partially_paid'):
                        new_payment_status = 'unpaid'
                    else:
                        new_payment_status = inc.payment_status
                    if decimal.Decimal(str(inc.amount_paid or 0)) != paid_amount:
                        inc.amount_paid = paid_amount
                        update_fields.append('amount_paid')
                    if inc.payment_status != new_payment_status:
                        inc.payment_status = new_payment_status
                        update_fields.append('payment_status')
                    if inc.payment_date != new_payment_date:
                        inc.payment_date = new_payment_date
                        update_fields.append('payment_date')
                    if update_fields:
                        inc.save(update_fields=update_fields)

        return statement

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)

        touched_outgoing_ids = set()
        touched_incoming_ids = set()
        if items_data is not None:
            for old in instance.items.only('invoice_id', 'incoming_invoice_id'):
                if old.invoice_id:
                    touched_outgoing_ids.add(str(old.invoice_id))
                if old.incoming_invoice_id:
                    touched_incoming_ids.add(str(old.incoming_invoice_id))

        if 'note' in validated_data:
            existing_note = str(getattr(instance, 'note', '') or '')
            match = re.search(r'\[\[IMPORT_META:.*?\]\]', existing_note, flags=re.S)
            if match:
                meta_prefix = f"{match.group(0)}\n"
                clean_note = str(validated_data.get('note') or '').strip()
                validated_data['note'] = f"{meta_prefix}{clean_note}".strip()

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        with transaction.atomic():
            instance.save()

            if items_data is not None:
                existing = {str(it.id): it for it in instance.items.all()}
                seen_ids = set()

                def to_decimal_amount(value, fallback=decimal.Decimal('0')):
                    if value is None or value == '':
                        return fallback
                    try:
                        return decimal.Decimal(str(value))
                    except Exception:
                        return fallback

                for item in items_data:
                    item_id = str(item.get('id') or '')
                    if item_id and item_id in existing:
                        obj = existing[item_id]
                        if obj.invoice_id:
                            touched_outgoing_ids.add(str(obj.invoice_id))
                        if obj.incoming_invoice_id:
                            touched_incoming_ids.add(str(obj.incoming_invoice_id))
                        old_amount = to_decimal_amount(obj.amount)
                        new_amount = to_decimal_amount(item.get('amount', old_amount), old_amount)
                        note = item.get('note', obj.note)
                        if new_amount != old_amount or note != obj.note:
                            obj.amount = new_amount
                            obj.note = note
                            obj.save(update_fields=['amount', 'note'])
                        seen_ids.add(item_id)
                        continue

                    invoice = item.get('invoice')
                    if invoice and not isinstance(invoice, Invoice):
                        invoice = Invoice.objects.filter(id=invoice).first()

                    incoming_invoice = item.get('incoming_invoice')
                    if incoming_invoice and not isinstance(incoming_invoice, IncomingInvoiceDigest):
                        incoming_invoice = IncomingInvoiceDigest.objects.filter(id=incoming_invoice).first()

                    customer = item.get('customer')
                    if customer and not isinstance(customer, Customer):
                        customer = Customer.objects.filter(id=customer).first()
                    if invoice and not customer:
                        customer = invoice.customer

                    amount = to_decimal_amount(item.get('amount'), decimal.Decimal('0'))
                    note = item.get('note') or ''
                    new_obj = BankStatementItem.objects.create(
                        bank_statement=instance,
                        customer=customer,
                        invoice=invoice,
                        incoming_invoice=incoming_invoice,
                        amount=amount,
                        note=note,
                    )
                    if new_obj.invoice_id:
                        touched_outgoing_ids.add(str(new_obj.invoice_id))
                    if new_obj.incoming_invoice_id:
                        touched_incoming_ids.add(str(new_obj.incoming_invoice_id))
                    seen_ids.add(str(new_obj.id))

                for ex_id, ex in existing.items():
                    if ex_id not in seen_ids:
                        if ex.invoice_id:
                            touched_outgoing_ids.add(str(ex.invoice_id))
                        if ex.incoming_invoice_id:
                            touched_incoming_ids.add(str(ex.incoming_invoice_id))
                        ex.delete()

                company = getattr(instance, 'company', None)
                if company and touched_outgoing_ids:
                    for inv in Invoice.objects.filter(company=company, id__in=list(touched_outgoing_ids)):
                        agg = BankStatementItem.objects.filter(bank_statement__company=company, invoice=inv).aggregate(
                            total=models.Sum('amount'),
                            last_date=models.Max('bank_statement__statement_date')
                        )
                        paid_amount = decimal.Decimal(str(agg.get('total') or 0))
                        if paid_amount < 0:
                            paid_amount = decimal.Decimal('0')

                        is_nav_status = inv.status in NAV_PROGRESS_STATUSES
                        if _is_effectively_paid(inv, paid_amount):
                            new_status = inv.status if is_nav_status else 'paid'
                        elif paid_amount > 0:
                            new_status = inv.status if is_nav_status else 'partially_paid'
                        elif inv.status in ('paid', 'partially_paid'):
                            new_status = 'sent'
                        else:
                            new_status = inv.status

                        new_payment_date = agg.get('last_date') if paid_amount > 0 else None
                        update_fields = []
                        if inv.amount_paid != paid_amount:
                            inv.amount_paid = paid_amount
                            update_fields.append('amount_paid')
                        if inv.status != new_status:
                            inv.status = new_status
                            update_fields.append('status')
                        if inv.payment_date != new_payment_date:
                            inv.payment_date = new_payment_date
                            update_fields.append('payment_date')
                        if update_fields:
                            inv.save(update_fields=list(dict.fromkeys(update_fields + ['updated_at'])))

                if company and touched_incoming_ids:
                    for inc in IncomingInvoiceDigest.objects.filter(company=company, id__in=list(touched_incoming_ids)):
                        qs = BankStatementItem.objects.filter(bank_statement__company=company, incoming_invoice=inc).select_related('bank_statement')
                        agg = qs.aggregate(last_date=models.Max('bank_statement__statement_date'))
                        paid_amount = decimal.Decimal('0')
                        for row in qs:
                            try:
                                paid_amount += abs(decimal.Decimal(str(row.amount or 0)))
                            except Exception:
                                continue
                        gross = decimal.Decimal(str((inc.invoice_net_amount or 0) + (inc.invoice_vat_amount or 0)))

                        if paid_amount >= (gross - decimal.Decimal('1.0')) and gross > 0:
                            payment_status = 'paid'
                        elif paid_amount > 0:
                            payment_status = 'partially_paid'
                        else:
                            payment_status = 'unpaid'

                        seqs = []
                        seen_seq = set()
                        for row in qs:
                            seq = str(getattr(row.bank_statement, 'sequence_number', '') or '').strip()
                            if seq and seq not in seen_seq:
                                seen_seq.add(seq)
                                seqs.append(seq)
                        payment_reference = ', '.join(seqs)[:100] if seqs else None
                        payment_date = agg.get('last_date') if paid_amount > 0 else None

                        update_fields = []
                        if inc.amount_paid != paid_amount:
                            inc.amount_paid = paid_amount
                            update_fields.append('amount_paid')
                        if inc.payment_status != payment_status:
                            inc.payment_status = payment_status
                            update_fields.append('payment_status')
                        if inc.payment_date != payment_date:
                            inc.payment_date = payment_date
                            update_fields.append('payment_date')
                        if (inc.payment_reference or None) != payment_reference:
                            inc.payment_reference = payment_reference
                            update_fields.append('payment_reference')
                        if update_fields:
                            inc.save(update_fields=update_fields)

        return instance


class CashRegisterSerializer(serializers.ModelSerializer):
    company_name = serializers.SerializerMethodField(read_only=True)
    balance = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CashRegister
        fields = [
            'id', 'company', 'company_name', 'name', 'code', 'location', 'currency', 'is_active',
            'created_by', 'created_at', 'updated_at', 'balance'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'balance']

    def get_company_name(self, obj):
        return getattr(obj.company, 'name', None)

    def get_balance(self, obj):
        agg = obj.transactions.aggregate(
            total_in=models.Sum('amount', filter=models.Q(transaction_type=CashRegisterTransaction.TYPE_IN)),
            total_out=models.Sum('amount', filter=models.Q(transaction_type=CashRegisterTransaction.TYPE_OUT)),
        )
        total_in = decimal.Decimal(str(agg.get('total_in') or 0))
        total_out = decimal.Decimal(str(agg.get('total_out') or 0))
        return float(total_in - total_out)


class CashRegisterTransactionSerializer(serializers.ModelSerializer):
    cash_register_name = serializers.SerializerMethodField(read_only=True)
    invoice_number = serializers.SerializerMethodField(read_only=True)
    incoming_invoice_number = serializers.SerializerMethodField(read_only=True)
    company_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CashRegisterTransaction
        fields = [
            'id', 'company', 'company_name', 'cash_register', 'cash_register_name', 'transaction_type',
            'amount', 'currency', 'invoice', 'invoice_number', 'incoming_invoice', 'incoming_invoice_number',
            'voucher_number', 'note', 'created_by', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'voucher_number', 'currency']

    def get_cash_register_name(self, obj):
        return getattr(obj.cash_register, 'name', None)

    def get_invoice_number(self, obj):
        return getattr(obj.invoice, 'invoice_number', None)

    def get_incoming_invoice_number(self, obj):
        return getattr(obj.incoming_invoice, 'invoice_number', None)

    def get_company_name(self, obj):
        return getattr(obj.company, 'name', None)

    def validate(self, attrs):
        tx_type = attrs.get('transaction_type')
        amount = decimal.Decimal(str(attrs.get('amount') or 0))
        company = attrs.get('company')
        register = attrs.get('cash_register')
        invoice = attrs.get('invoice')
        incoming_invoice = attrs.get('incoming_invoice')

        if amount <= 0:
            raise serializers.ValidationError({'amount': 'Az összegnek pozitívnak kell lennie.'})

        if not company or not register:
            raise serializers.ValidationError('Cég és kassza megadása kötelező.')

        if str(register.company_id) != str(company.id):
            raise serializers.ValidationError({'cash_register': 'A kassza nem ehhez a céghez tartozik.'})

        if tx_type == CashRegisterTransaction.TYPE_IN:
            if not invoice:
                raise serializers.ValidationError({'invoice': 'Befizetéshez kimenő számla kötelező.'})
            if incoming_invoice:
                raise serializers.ValidationError({'incoming_invoice': 'Befizetéshez bejövő számla nem adható meg.'})
            if str(invoice.company_id) != str(company.id):
                raise serializers.ValidationError({'invoice': 'A számla nem ehhez a céghez tartozik.'})

            outstanding = decimal.Decimal(str(invoice.total_gross_amount or 0)) - decimal.Decimal(str(invoice.amount_paid or 0))
            if amount > max(decimal.Decimal('0'), outstanding):
                raise serializers.ValidationError({'amount': 'A befizetés nem lehet nagyobb a számla hátralékánál.'})

        elif tx_type == CashRegisterTransaction.TYPE_OUT:
            if not incoming_invoice:
                raise serializers.ValidationError({'incoming_invoice': 'Kifizetéshez bejövő számla kötelező.'})
            if invoice:
                raise serializers.ValidationError({'invoice': 'Kifizetéshez kimenő számla nem adható meg.'})
            if str(incoming_invoice.company_id) != str(company.id):
                raise serializers.ValidationError({'incoming_invoice': 'A bejövő számla nem ehhez a céghez tartozik.'})

            gross = decimal.Decimal(str((incoming_invoice.invoice_net_amount or 0) + (incoming_invoice.invoice_vat_amount or 0)))
            outstanding = gross - decimal.Decimal(str(incoming_invoice.amount_paid or 0))
            if amount > max(decimal.Decimal('0'), outstanding):
                raise serializers.ValidationError({'amount': 'A kifizetés nem lehet nagyobb a bejövő számla hátralékánál.'})
        else:
            raise serializers.ValidationError({'transaction_type': 'Érvénytelen tranzakció típus.'})

        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            tx = super().create(validated_data)
            tx.currency = (tx.cash_register.currency or tx.currency or 'HUF')
            tx.save(update_fields=['currency'])

            if tx.transaction_type == CashRegisterTransaction.TYPE_IN and tx.invoice:
                inv = tx.invoice
                add = decimal.Decimal(str(tx.amount or 0))
                outstanding = decimal.Decimal(str(inv.total_gross_amount or 0)) - decimal.Decimal(str(inv.amount_paid or 0))
                if add > outstanding:
                    add = max(decimal.Decimal('0'), outstanding)
                new_paid = decimal.Decimal(str(inv.amount_paid or 0)) + add
                inv.amount_paid = new_paid
                if _is_effectively_paid(inv, new_paid):
                    inv.status = 'paid'
                    inv.payment_date = timezone.now().date()
                elif new_paid > 0:
                    inv.status = 'partially_paid'
                inv.save(update_fields=['amount_paid', 'status', 'payment_date', 'updated_at'])

            if tx.transaction_type == CashRegisterTransaction.TYPE_OUT and tx.incoming_invoice:
                inc = tx.incoming_invoice
                add = decimal.Decimal(str(tx.amount or 0))
                new_paid = decimal.Decimal(str(inc.amount_paid or 0)) + add
                gross = decimal.Decimal(str((inc.invoice_net_amount or 0) + (inc.invoice_vat_amount or 0)))
                inc.amount_paid = new_paid
                if new_paid >= (gross - decimal.Decimal('1.0')):
                    inc.payment_status = 'paid'
                    inc.payment_date = timezone.now().date()
                elif new_paid > 0:
                    inc.payment_status = 'partially_paid'
                inc.save(update_fields=['amount_paid', 'payment_status', 'payment_date'])

            return tx

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        # Derive company from bank account if missing; validate consistency
        bank_acc = validated_data.get('bank_account')
        company = validated_data.get('company')
        if bank_acc and not company:
            try:
                validated_data['company'] = bank_acc.company
            except Exception:
                pass
        if bank_acc and company and getattr(bank_acc, 'company_id', None) and bank_acc.company_id != company.id:
            raise serializers.ValidationError({'bank_account': 'A kiválasztott bankszámla nem ehhez a céghez tartozik'})
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        # Auto-increment sequence number per bank account if not provided
        seq = (validated_data.get('sequence_number') or '').strip()
        if not seq and bank_acc:
            try:
                from datetime import datetime
                def next_sequence(prev: str) -> str:
                    if not prev:
                        return f"{datetime.now().year}/001"
                    s = str(prev).strip()
                    import re
                    m = re.search(r"^(.*?)(\d+)$", s)
                    if m:
                        prefix, digits = m.group(1), m.group(2)
                        width = len(digits)
                        nxt = int(digits) + 1
                        return f"{prefix}{nxt:0{width}d}"
                    # no trailing digits -> start suffix sequence
                    sep = '/' if '/' in s else '/'
                    return f"{s}{sep}001"

                last = BankStatement.objects.filter(bank_account=bank_acc).order_by('-created_at').first()
                last_seq = (last.sequence_number or '').strip() if last else ''
                validated_data['sequence_number'] = next_sequence(last_seq)
            except Exception:
                from datetime import datetime
                validated_data['sequence_number'] = f"{datetime.now().year}/001"
        from django.db import transaction
        with transaction.atomic():
            statement = BankStatement.objects.create(**validated_data)
            for item in items_data:
                # Derive customer from invoice if not explicitly provided
                invoice = item.get('invoice')
                # Support both instance and UUID in validated_data (PKRelatedField yields instance)
                if invoice and not isinstance(invoice, Invoice):
                    invoice = Invoice.objects.filter(id=invoice).first()

                customer = item.get('customer')
                if customer and not isinstance(customer, Customer):
                    customer = Customer.objects.filter(id=customer).first()
                if invoice and not customer:
                    customer = invoice.customer
                # Default amount to outstanding when not provided
                default_outstanding = invoice.outstanding_gross_amount if invoice else 0
                amount = item.get('amount') if isinstance(item, dict) else None
                amount = default_outstanding if (amount is None or amount == '') else amount
                BankStatementItem.objects.create(
                    bank_statement=statement,
                    customer=customer,
                    invoice=invoice,
                    amount=amount,
                    note=item.get('note')
                )
                # Reconcile: update invoice payment progress
                if invoice and amount:
                    try:
                        from decimal import Decimal
                        add = Decimal(str(amount))
                    except Exception:
                        add = amount
                    # Cap addition to outstanding amount
                    try:
                        outstanding = invoice.total_gross_amount - (invoice.amount_paid or 0)
                        if add > outstanding:
                            add = outstanding
                    except Exception:
                        pass
                    invoice.amount_paid = (invoice.amount_paid or 0) + add
                    is_nav_status = invoice.status in NAV_PROGRESS_STATUSES
                    if _is_effectively_paid(invoice, invoice.amount_paid):
                        if not is_nav_status:
                            invoice.status = 'paid'
                        invoice.payment_date = statement.statement_date
                    elif invoice.amount_paid > 0:
                        if not is_nav_status:
                            invoice.status = 'partially_paid'
                    invoice.save(update_fields=['amount_paid', 'status', 'payment_date', 'updated_at'])
        return statement

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        # Simple field updates
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        from django.db import transaction
        with transaction.atomic():
            instance.save()

            if items_data is not None:
                # Map existing items
                existing = {str(it.id): it for it in instance.items.all()}
                seen_ids = set()

                def adjust_invoice(inv: Invoice, delta):
                    if not inv or not delta:
                        return
                    try:
                        from decimal import Decimal
                        delta = Decimal(str(delta))
                    except Exception:
                        pass
                    inv.amount_paid = (inv.amount_paid or 0) + delta
                    is_nav_status = inv.status in NAV_PROGRESS_STATUSES
                    if _is_effectively_paid(inv, inv.amount_paid):
                        if not is_nav_status:
                            inv.status = 'paid'
                        inv.payment_date = instance.statement_date
                    elif inv.amount_paid > 0:
                        if not is_nav_status:
                            inv.status = 'partially_paid'
                    else:
                        # If previously marked paid/partial but now zero or less, set to 'sent'
                        if inv.status in ('paid', 'partially_paid'):
                            inv.status = 'sent'
                        inv.payment_date = None
                    inv.save(update_fields=['amount_paid', 'status', 'payment_date', 'updated_at'])

                def to_decimal_amount(value, fallback=decimal.Decimal('0')):
                    if value is None or value == '':
                        return fallback
                    try:
                        return decimal.Decimal(str(value))
                    except Exception:
                        return fallback

                for item in items_data:
                    # Existing item update by id
                    item_id = str(item.get('id') or '')
                    if item_id and item_id in existing:
                        obj = existing[item_id]
                        old_amount = to_decimal_amount(obj.amount)
                        new_amount = to_decimal_amount(item.get('amount', old_amount), old_amount)
                        note = item.get('note', obj.note)
                        if new_amount != old_amount or note != obj.note:
                            obj.amount = new_amount
                            obj.note = note
                            obj.save(update_fields=['amount', 'note'])
                            adjust_invoice(obj.invoice, new_amount - old_amount)
                        seen_ids.add(item_id)
                        continue

                    # New item add
                    invoice = item.get('invoice')
                    if invoice and not isinstance(invoice, Invoice):
                        invoice = Invoice.objects.filter(id=invoice).first()
                    customer = item.get('customer')
                    if customer and not isinstance(customer, Customer):
                        customer = Customer.objects.filter(id=customer).first()
                    if invoice and not customer:
                        customer = invoice.customer
                    amount = to_decimal_amount(item.get('amount'), decimal.Decimal('0'))
                    note = item.get('note')
                    new_obj = BankStatementItem.objects.create(
                        bank_statement=instance,
                        customer=customer,
                        invoice=invoice,
                        amount=amount,
                        note=note,
                    )
                    adjust_invoice(invoice, amount)

                # Remove items not present anymore
                for ex_id, ex in existing.items():
                    if ex_id not in seen_ids and items_data is not None:
                        adjust_invoice(ex.invoice, -ex.amount)
                        ex.delete()

        return instance


class ProformaItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'description', 'quantity', 'unit_price', 'vat_rate',
            'unit_of_measure', 'nature_indicator', 'product_code_category', 'product_code_value',
            'deletion_code', 'note'
        ]


class ProformaSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    customer = CustomerSerializer(read_only=True)
    company = serializers.SerializerMethodField(read_only=True)
    total_net_amount = serializers.ReadOnlyField()
    total_vat_amount = serializers.ReadOnlyField()
    total_gross_amount = serializers.ReadOnlyField()

    class Meta:
        model = ProformaInvoice
        fields = [
            'id', 'proforma_number', 'company', 'customer', 'items',
            'issue_date', 'due_date', 'delivery_date', 'currency', 'payment_method', 'notes',
            'created_by', 'created_at', 'updated_at',
            'total_net_amount', 'total_vat_amount', 'total_gross_amount',
            'status', 'payment_date', 'amount_paid',
        ]

    def get_company(self, obj):
        try:
            # Late evaluation to avoid NameError if CompanySerializer is defined later
            from .serializers import CompanySerializer as CS  # circular-safe in runtime
            return CS(obj.company).data
        except Exception:
            return {
                'id': str(getattr(obj.company, 'id', '')),
                'name': getattr(obj.company, 'name', ''),
                'tax_number': getattr(obj.company, 'tax_number', ''),
            }


class ProformaCreateSerializer(serializers.ModelSerializer):
    items = ProformaItemSerializer(many=True)
    customer_id = serializers.UUIDField()
    company_id = serializers.UUIDField()

    class Meta:
        model = ProformaInvoice
        fields = [
            'proforma_number', 'company_id', 'customer_id', 'items',
            'issue_date', 'due_date', 'delivery_date', 'currency', 'payment_method', 'notes'
        ]
        extra_kwargs = {
            'proforma_number': {'required': False},
        }

    def _next_daily_proforma_number(self):
        today = timezone.localdate().strftime('%Y%m%d')
        numbers = ProformaInvoice.objects.filter(
            proforma_number__startswith=today
        ).values_list('proforma_number', flat=True)

        max_seq = 0
        for raw in numbers:
            value = str(raw or '')
            tail = value[len(today):]
            if tail.isdigit():
                try:
                    seq = int(tail)
                except Exception:
                    continue
                if seq > max_seq:
                    max_seq = seq
        return f"{today}{max_seq + 1:03d}"

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        company_id = validated_data.pop('company_id')
        customer_id = validated_data.pop('customer_id')
        from django.db import transaction
        with transaction.atomic():
            if not company_id:
                req = self.context.get('request') if hasattr(self, 'context') else None
                comp = getattr(req, 'company', None) if req else None
                if not comp:
                    raise serializers.ValidationError({'company_id': 'Cég nem található'})
                company = comp
            else:
                try:
                    company = Company.objects.get(id=company_id)
                except Company.DoesNotExist:
                    raise serializers.ValidationError({'company_id': 'Cég nem található'})
            try:
                customer = Customer.objects.get(id=customer_id)
            except Customer.DoesNotExist:
                raise serializers.ValidationError({'customer_id': 'Ügyfél nem található'})

            # Generate number if missing: YYYYMMDD + daily seq, collision-safe.
            user_provided_pfnum = (validated_data.pop('proforma_number', None) or '').strip()
            pfnum = user_provided_pfnum
            if not pfnum:
                pfnum = self._next_daily_proforma_number()

            request = self.context.get('request')
            attempts = 1 if user_provided_pfnum else 5
            proforma = None
            for _ in range(attempts):
                try:
                    proforma = ProformaInvoice.objects.create(
                        proforma_number=pfnum,
                        company=company,
                        customer=customer,
                        **validated_data
                    )
                    break
                except IntegrityError:
                    if user_provided_pfnum:
                        raise serializers.ValidationError({'proforma_number': 'Ez a díjbekérő sorszám már létezik.'})
                    pfnum = self._next_daily_proforma_number()

            if proforma is None:
                raise serializers.ValidationError({'proforma_number': 'Nem sikerült egyedi díjbekérő sorszámot generálni.'})

            for item in items_data:
                it = InvoiceItem.objects.create(**item)
                proforma.items.add(it)

            # set created_by
            if request and getattr(request, 'user', None) and request.user.is_authenticated:
                proforma.created_by = request.user
                proforma.save(update_fields=['created_by'])
            return proforma

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        company_id = validated_data.pop('company_id', None)
        customer_id = validated_data.pop('customer_id', None)
        if company_id:
            try:
                validated_data['company'] = Company.objects.get(id=company_id)
            except Company.DoesNotExist:
                raise serializers.ValidationError({'company_id': 'Cég nem található'})
        if customer_id:
            try:
                validated_data['customer'] = Customer.objects.get(id=customer_id)
            except Customer.DoesNotExist:
                raise serializers.ValidationError({'customer_id': 'Ügyfél nem található'})

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        from django.db import transaction
        with transaction.atomic():
            instance.save()
            if items_data is not None:
                # Replace items
                old = list(instance.items.all())
                instance.items.clear()
                for it in old:
                    try:
                        it.delete()
                    except Exception:
                        pass
                for item in items_data:
                    it = InvoiceItem.objects.create(**item)
                    instance.items.add(it)
        return instance

    def get_company_name(self, obj):
        try:
            return obj.company.name
        except Exception:
            return None

    def get_bank_account_name(self, obj):
        try:
            acc = obj.bank_account
            if not acc:
                return None
            label = (acc.bank_name + ' - ') if acc.bank_name else ''
            return f"{label}{acc.iban or acc.account_number or ''}"
        except Exception:
            return None


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    customer = CustomerSerializer(read_only=True)
    # Return full company details for printing (includes bank accounts and address fields)
    company = serializers.SerializerMethodField(read_only=True)
    customer_id = serializers.UUIDField(write_only=True)
    total_net_amount = serializers.ReadOnlyField()
    total_vat_amount = serializers.ReadOnlyField()
    total_gross_amount = serializers.ReadOnlyField()
    created_by = serializers.StringRelatedField(read_only=True)
    amount_paid = serializers.ReadOnlyField()
    advances_used = serializers.SerializerMethodField(read_only=True)
    settlement_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'company', 'customer', 'customer_id', 'items',
            'issue_date', 'due_date', 'delivery_date', 'currency',
            'exchange_rate', 'payment_method', 'invoice_category', 'invoice_appearance', 'payment_date', 'completeness_indicator', 'order_reference',
            'status', 'nav_transaction_id', 'invoice_block',
            'nav_submission_date', 'nav_response', 'notes', 'created_by',
            'created_at', 'updated_at', 'total_net_amount', 'total_vat_amount',
            'total_gross_amount', 'amount_paid', 'print_snapshot', 'advances_used',
            'settlement_details', 'erp_order_ids', 'arrears_status', 'arrears_log',
        ]

    def create(self, validated_data):
        customer_id = validated_data.pop('customer_id')
        customer = Customer.objects.get(id=customer_id)
        validated_data['customer'] = customer
        return super().create(validated_data)

    def get_company(self, obj):
        # Late evaluation avoids NameError when CompanySerializer is defined later in file
        try:
            return CompanySerializer(obj.company).data
        except Exception:
            # Fallback minimal structure
            return {'id': str(getattr(obj.company, 'id', '')), 'name': getattr(obj.company, 'name', ''), 'tax_number': getattr(obj.company, 'tax_number', '')}

    def get_advances_used(self, obj):
        try:
            if obj.invoice_category != 'FINAL':
                return []
            from django.db import models as dj_models
            from .models import AdvanceAllocation, Invoice as Inv
            rows = (
                AdvanceAllocation.objects
                .filter(final_invoice=obj)
                .values('advance_invoice')
                .annotate(total=dj_models.Sum('amount'))
            )
            out = []
            for r in rows:
                try:
                    adv = Inv.objects.get(id=r['advance_invoice'])
                    out.append({'invoice_number': adv.invoice_number, 'amount': float(r['total'] or 0)})
                except Inv.DoesNotExist:
                    continue
            return out
        except Exception:
            return []

    def get_settlement_details(self, obj):
        rows = []
        try:
            from decimal import Decimal
            paid_total = Decimal(str(obj.amount_paid or 0))
            bank_total = Decimal('0')

            bank_items = (
                obj.bank_statement_items
                .select_related('bank_statement__bank_account')
                .order_by('bank_statement__statement_date', 'created_at')
            )
            for bsi in bank_items:
                amount_val = Decimal(str(bsi.amount or 0)).copy_abs()
                if amount_val <= 0:
                    continue
                bank_total += amount_val
                statement = bsi.bank_statement
                account = getattr(statement, 'bank_account', None)
                account_no = (getattr(account, 'iban', None) or getattr(account, 'account_number', None) or '') if account else ''
                rows.append({
                    'date': str(getattr(statement, 'statement_date', None) or bsi.created_at.date()),
                    'amount': float(amount_val),
                    'currency': obj.currency,
                    'bank_account_number': account_no,
                    'source_label': getattr(statement, 'sequence_number', None) or '',
                    'source_type': 'bank_statement',
                    'source_id': str(getattr(statement, 'id', None) or ''),
                })

            # Cash-style fallback: if invoice has paid amount not covered by bank statement links,
            # expose it as a cash settlement row (e.g. kassza befizetés).
            remaining_paid = paid_total - bank_total
            if remaining_paid > Decimal('0.0001') and obj.payment_method in ('cash', 'cod'):
                rows.append({
                    'date': str(obj.payment_date or obj.updated_at.date()),
                    'amount': float(remaining_paid),
                    'currency': obj.currency,
                    'bank_account_number': '',
                    'source_label': 'Készpénz',
                    'source_type': 'cash',
                })
        except Exception:
            return []
        return rows


class InvoiceCreateSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True)
    customer_id = serializers.UUIDField()
    # Optional: provide an invoice block to auto-generate continuous invoice numbers
    invoice_block_id = serializers.UUIDField(required=False, allow_null=True)
    # Allow explicit company selection when no block is provided
    company_id = serializers.UUIDField(required=False, allow_null=True)
    # Chain references (optional)
    original_invoice_id = serializers.UUIDField(required=False, allow_null=True)
    original_invoice_number = serializers.CharField(required=False, allow_null=True)
    modification_index = serializers.IntegerField(required=False, allow_null=True)
    modify_without_master = serializers.BooleanField(required=False)
    # Optional: advance invoices to tie for FINAL invoice
    advance_invoice_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    # ERP integration
    erp_order_ids = serializers.ListField(child=serializers.IntegerField(), required=False, allow_null=True)

    class Meta:
        model = Invoice
        fields = [
            'invoice_number', 'customer_id', 'items', 'issue_date',
            'due_date', 'delivery_date', 'currency', 'exchange_rate',
            'payment_method', 'invoice_category', 'invoice_appearance', 'payment_date', 'completeness_indicator', 'order_reference',
            'notes', 'invoice_block_id', 'company_id',
            'original_invoice_id', 'original_invoice_number', 'modification_index', 'modify_without_master',
            'advance_invoice_ids', 'erp_order_ids'
        ]
        extra_kwargs = {
            'invoice_number': {'required': False},
            'payment_method': {'required': True},
        }

    def validate(self, attrs):
        # Nyugtás vevő ellenőrzése
        customer_id = attrs.get('customer_id')
        if customer_id:
            try:
                customer = Customer.objects.get(id=customer_id)
                # FIXME: Customer model has no category attribute causing AttributeError
                # if customer.category == 'RECEIPT':
                #    raise serializers.ValidationError({"customer_id": "Nyugtás vevőnek nem lehet számlát kiállítani."})
            except Customer.DoesNotExist:
                pass
        
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        customer_id = validated_data.pop('customer_id')
        invoice_block_id = validated_data.pop('invoice_block_id', None)
        company_id = validated_data.pop('company_id', None)
        original_invoice_id = validated_data.pop('original_invoice_id', None)
        advance_invoice_ids = validated_data.pop('advance_invoice_ids', [])

        # Validate customer exists
        try:
            customer = Customer.objects.get(id=customer_id)
        except Customer.DoesNotExist:
            raise serializers.ValidationError({'customer_id': 'Ügyfél nem található'})

        # Require either: explicit invoice_number OR a block to generate it
        explicit_number = validated_data.get('invoice_number')
        if not explicit_number and not invoice_block_id:
            raise serializers.ValidationError({'invoice_number': 'Számlaszám vagy számlatömb kötelező'})

        # Keltezés mindig az aktuális nap legyen (kézi és automatikus kiállításnál is)
        validated_data['issue_date'] = timezone.localdate()

        # Company resolve and number generation
        from django.db import transaction
        with transaction.atomic():
            if not explicit_number and invoice_block_id:
                from .models import InvoiceBlock
                try:
                    block = InvoiceBlock.objects.select_for_update().get(id=invoice_block_id)
                except InvoiceBlock.DoesNotExist:
                    raise serializers.ValidationError({'invoice_block_id': 'Számlatömb nem található'})
                next_number = block.get_next_invoice_number()
                validated_data['invoice_number'] = next_number
                validated_data['invoice_block'] = block
                validated_data['company'] = block.company
            else:
                # Use provided company if any; otherwise fallback to request.company
                if company_id:
                    from .models import Company
                    try:
                        company = Company.objects.get(id=company_id)
                    except Company.DoesNotExist:
                        raise serializers.ValidationError({'company_id': 'Cég nem található'})
                    validated_data['company'] = company
                else:
                    req = self.context.get('request') if hasattr(self, 'context') else None
                    comp = getattr(req, 'company', None) if req else None
                    if comp:
                        validated_data['company'] = comp

            # Chain references mapping
            if original_invoice_id:
                try:
                    validated_data['original_invoice'] = Invoice.objects.get(id=original_invoice_id)
                except Invoice.DoesNotExist:
                    pass

            # Final safety checks
            if 'company' not in validated_data:
                raise serializers.ValidationError({'company_id': 'Cég megadása kötelező (vagy válassz számlatömböt)'})
            if not validated_data.get('invoice_number'):
                raise serializers.ValidationError({'invoice_number': 'Számlaszám megadása kötelező'})

            invoice = Invoice.objects.create(
                customer=customer,
                **validated_data
            )

            for item_data in items_data:
                item = InvoiceItem.objects.create(**item_data)
                invoice.items.add(item)

            # Create allocations and add negative line(s) for advance usage if FINAL and chosen advances provided
            try:
                if validated_data.get('invoice_category') == 'FINAL' and advance_invoice_ids:
                    from decimal import Decimal, ROUND_HALF_UP
                    from .models import AdvanceAllocation
                    # Compute final gross EXCLUDING any client-provided 'Előleg beszámítás' lines
                    def line_gross(it: InvoiceItem):
                        return (it.quantity * it.unit_price) * (Decimal('1') + (it.vat_rate/100))
                    items_all = list(invoice.items.all())
                    client_adv_lines = [it for it in items_all if (getattr(it, 'description', '') or '').strip().lower().startswith('előleg beszámítás')]
                    non_adv_items = [it for it in items_all if it not in client_adv_lines]
                    final_gross = sum((line_gross(it) for it in non_adv_items), Decimal('0'))
                    remain_final = final_gross
                    # Aggregate deduction per advance and VAT rate to preserve composition and label with advance number
                    gross_deduction_by_adv_rate = {}
                    for aid in advance_invoice_ids:
                        if remain_final <= 0:
                            break
                        try:
                            adv = Invoice.objects.get(id=aid, invoice_category='ADVANCE', customer=invoice.customer, company=invoice.company)
                        except Invoice.DoesNotExist:
                            continue
                        used = AdvanceAllocation.objects.filter(advance_invoice=adv).aggregate(total=models.Sum('amount'))['total'] or Decimal('0')
                        # Build per-line available gross from advance invoice
                        adv_lines = []
                        for it in adv.items.all():
                            rate = (it.vat_rate or 0)
                            gross = (it.quantity * it.unit_price) * (Decimal('1') + (rate/100))
                            adv_lines.append({'rate': rate, 'gross': gross})
                        adv_total = sum((row['gross'] for row in adv_lines), Decimal('0'))
                        remain_adv_total = adv_total - used
                        if remain_adv_total <= 0:
                            continue
                        # Subtract previously used (used) from lines in order to get per-line available
                        used_left = used
                        for row in adv_lines:
                            if used_left <= 0:
                                break
                            can_use = min(row['gross'], used_left)
                            row['gross'] = row['gross'] - can_use
                            used_left -= can_use
                        # Allocate from per-line available up to remain_final
                        allocate_left = remain_final if remain_final <= remain_adv_total else remain_adv_total
                        per_rate_taken = {}
                        for row in adv_lines:
                            if allocate_left <= 0:
                                break
                            avail = row['gross']
                            if avail <= 0:
                                continue
                            take = avail if avail <= allocate_left else allocate_left
                            per_rate_taken[row['rate']] = per_rate_taken.get(row['rate'], Decimal('0')) + take
                            allocate_left -= take
                        alloc_amount = sum(per_rate_taken.values(), Decimal('0'))
                        if alloc_amount > 0:
                            # record allocation gross total
                            AdvanceAllocation.objects.create(advance_invoice=adv, final_invoice=invoice, amount=alloc_amount)
                            remain_final -= alloc_amount
                            # accumulate into global dict by (advance, VAT rate)
                            for rate, g in per_rate_taken.items():
                                key = (str(adv.id), adv.invoice_number or '', rate)
                                gross_deduction_by_adv_rate[key] = gross_deduction_by_adv_rate.get(key, Decimal('0')) + g

                    # Remove any client-provided generic advance deduction lines to avoid duplication and ensure correct VAT composition
                    try:
                        for it in client_adv_lines:
                            invoice.items.remove(it)
                    except Exception:
                        pass

                    # Add negative items per advance and VAT rate reflecting the allocated advance composition
                    try:
                        for (adv_id, adv_no, rate), gross in gross_deduction_by_adv_rate.items():
                            if gross <= 0:
                                continue
                            # net = gross / (1 + rate/100)
                            divisor = (Decimal('1') + (Decimal(str(rate))/Decimal('100')))
                            net = (gross / divisor).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                            neg_item = InvoiceItem.objects.create(
                                description=f"Előleg beszámítás — {adv_no}".strip(),
                                quantity=1,
                                unit_price=-net,
                                vat_rate=rate,
                                unit_of_measure='PIECE',
                                nature_indicator='SERVICE',
                            )
                            invoice.items.add(neg_item)
                    except Exception:
                        # Non-fatal: allocation records exist even if item creation fails
                        pass
            except Exception:
                pass

            # If this is a storno of a FINAL invoice, reverse previous allocations
            try:
                base_notes = (validated_data.get('notes') or '').lower()
                is_storno = ('sztornó' in base_notes) or ('storno' in base_notes)
                if is_storno and validated_data.get('invoice_category') == 'FINAL' and validated_data.get('original_invoice'):
                    from .models import AdvanceAllocation
                    orig = validated_data.get('original_invoice')
                    # Reverse allocations by creating negative allocations bound to this storno invoice
                    allocs = AdvanceAllocation.objects.filter(final_invoice=orig)
                    for a in allocs:
                        AdvanceAllocation.objects.create(advance_invoice=a.advance_invoice, final_invoice=invoice, amount=-a.amount)
            except Exception:
                pass

            # If this is a storno of an ADVANCE invoice, cascade: storno all linked FINAL invoices
            try:
                base_notes = (validated_data.get('notes') or '').lower()
                is_storno = ('sztornó' in base_notes) or ('storno' in base_notes)
                skip_adv_cascade = bool(self.context.get('skip_advance_cascade'))
                if is_storno and not skip_adv_cascade and validated_data.get('invoice_category') == 'ADVANCE' and validated_data.get('original_invoice'):
                    orig_adv = validated_data.get('original_invoice')
                    from .models import AdvanceAllocation
                    finals = (
                        AdvanceAllocation.objects
                        .filter(advance_invoice=orig_adv)
                        .values_list('final_invoice', flat=True)
                        .distinct()
                    )
                    for fin_id in finals:
                        try:
                            finv = Invoice.objects.get(id=fin_id)
                        except Invoice.DoesNotExist:
                            continue
                        # Guard: skip if storno already exists for this final
                        try:
                            exists = Invoice.objects.filter(
                                models.Q(notes__icontains='sztornó') | models.Q(notes__icontains='sztorno')
                            ).filter(
                                models.Q(original_invoice_id=finv.id) | models.Q(order_reference=finv.invoice_number)
                            ).exists()
                            if exists:
                                continue
                        except Exception:
                            pass
                        # Build storno data for final invoice
                        fin_data = {
                            'customer_id': str(finv.customer_id),
                            'items': [
                                {
                                    'description': it.description,
                                    'quantity': str(-it.quantity),
                                    'unit_price': str(it.unit_price),
                                    'vat_rate': str(it.vat_rate),
                                    'unit_of_measure': it.unit_of_measure,
                                    'nature_indicator': it.nature_indicator,
                                    'product_code_category': it.product_code_category,
                                    'product_code_value': it.product_code_value,
                                } for it in finv.items.all()
                            ],
                            'issue_date': str(finv.issue_date),
                            'due_date': str(finv.due_date),
                            'delivery_date': str(finv.delivery_date) if finv.delivery_date else None,
                            'currency': finv.currency,
                            'exchange_rate': str(finv.exchange_rate),
                            'payment_method': finv.payment_method,
                            'invoice_category': finv.invoice_category,
                            'invoice_appearance': finv.invoice_appearance,
                            'completeness_indicator': False,
                            'order_reference': finv.invoice_number,
                            'notes': f"Sztornó számla az alábbi számlára: {finv.invoice_number}",
                            'original_invoice_id': str(finv.id),
                        }
                        if finv.invoice_block_id:
                            fin_data['invoice_block_id'] = str(finv.invoice_block_id)
                        else:
                            fin_data['company_id'] = str(finv.company_id)
                        ser2 = InvoiceCreateSerializer(data=fin_data, context=self.context)
                        ser2.is_valid(raise_exception=True)
                        ser2.save()
            except Exception:
                pass

            # If payment method is not transfer or COD, mark as fully paid by default
            try:
                payment_method = str(getattr(invoice, 'payment_method', '') or '').strip().lower()
                if payment_method not in ('transfer', 'cod'):
                    total_gross = invoice.total_gross_amount
                    invoice.amount_paid = total_gross
                    invoice.status = 'paid'
                    invoice.payment_date = invoice.issue_date
                    invoice.save(update_fields=['amount_paid', 'status', 'payment_date', 'updated_at'])
            except Exception:
                pass

            # Build print snapshot (company, customer, items, totals)
            try:
                company_payload = CompanySerializer(invoice.company).data
            except Exception:
                company_payload = {
                    'id': str(invoice.company.id),
                    'name': invoice.company.name,
                    'tax_number': invoice.company.tax_number,
                }
            customer_payload = CustomerSerializer(invoice.customer).data
            items_payload = [
                {
                    'description': it.description,
                    'quantity': float(it.quantity),
                    'unit_price': float(it.unit_price),
                    'vat_rate': float(it.vat_rate),
                    'net_amount': float(it.net_amount),
                    'vat_amount': float(it.vat_amount),
                    'gross_amount': float(it.gross_amount),
                } for it in invoice.items.all()
            ]
            snapshot = {
                'invoice_number': invoice.invoice_number,
                'issue_date': str(invoice.issue_date),
                'delivery_date': str(invoice.delivery_date) if invoice.delivery_date else None,
                'due_date': str(invoice.due_date),
                'currency': invoice.currency,
                'bilingual': bool(invoice.invoice_block and invoice.invoice_block.second_language),
                'payment_method': invoice.payment_method,
                'company': company_payload,
                'customer': customer_payload,
                'items': items_payload,
                'totals': {
                    'net': float(invoice.total_net_amount),
                    'vat': float(invoice.total_vat_amount),
                    'gross': float(invoice.total_gross_amount),
                }
            }
            # Include summary of used advances (gross) for FINAL invoices
            try:
                if invoice.invoice_category == 'FINAL':
                    from django.db import models as dj_models
                    from .models import AdvanceAllocation
                    rows = (
                        AdvanceAllocation.objects
                        .filter(final_invoice=invoice)
                        .values('advance_invoice')
                        .annotate(total=dj_models.Sum('amount'))
                    )
                    used_list = []
                    for r in rows:
                        try:
                            adv = Invoice.objects.get(id=r['advance_invoice'])
                            used_list.append({
                                'invoice_number': adv.invoice_number,
                                'amount': float(r['total'] or 0)
                            })
                        except Invoice.DoesNotExist:
                            continue
                    if used_list:
                        snapshot['advances_used'] = used_list
            except Exception:
                pass
            invoice.print_snapshot = snapshot
            invoice.save(update_fields=['print_snapshot'])

            return invoice


class NAVConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = NAVConfiguration
        fields = [
            'id', 'name', 'is_active', 'api_url', 'is_test_environment',
            'login', 'tax_number', 'sign_key', 'exchange_key',
            'software_id', 'software_name', 'software_operation',
            'software_main_version', 'software_dev_name',
            'software_dev_contact', 'software_dev_country_code',
            'software_dev_tax_number', 'created_at', 'updated_at'
        ]
        extra_kwargs = {
            'password': {'write_only': True},
            'sign_key': {'write_only': True},
            'exchange_key': {'write_only': True},
        }


class ContactSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    customer_name = serializers.StringRelatedField(source='customer.name', read_only=True)
    
    class Meta:
        model = Contact
        fields = [
            'id', 'customer', 'customer_name', 'first_name', 'last_name', 'full_name',
            'position', 'department', 'contact_type', 'email', 'phone', 'mobile', 'fax',
            'notes', 'is_primary', 'is_active', 'is_receipt', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ContactCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = [
            'customer', 'first_name', 'last_name', 'position', 'department',
            'contact_type', 'email', 'phone', 'mobile', 'fax', 'notes',
            'is_primary', 'is_active', 'is_receipt'
        ]


class CompanySerializer(serializers.ModelSerializer):
    bank_accounts = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = Company
        fields = [
            'id', 'name', 'short_name', 'tax_number', 'full_tax_number',
            'vat_code', 'county_code', 'eu_tax_number', 'vat_group_id', 'vat_group_member_tax_number',
            'address', 'street_name', 'public_place_category', 'street_number', 'building', 'staircase', 'floor', 'door',
            'city', 'postal_code', 'country', 'email', 'phone', 'xml_logging_enabled', 'round_transfer_to_whole',
            'is_active', 'order_index', 'created_at', 'updated_at', 'bank_accounts'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_bank_accounts(self, obj):
        accounts = getattr(obj, 'bank_accounts', []).all()
        return [
            {
                'id': str(a.id),
                'bank_name': a.bank_name,
                'account_number': a.account_number,
                'iban': a.iban,
                'swift_bic': a.swift_bic,
                'currency': a.currency,
                'is_primary': a.is_primary,
                'round_transfer_to_whole': getattr(a, 'round_transfer_to_whole', False),
            }
            for a in accounts
        ]

class CompanyBankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyBankAccount
        fields = ['id', 'company', 'bank_name', 'account_number', 'iban', 'swift_bic', 'currency', 'is_primary', 'round_transfer_to_whole', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class VATTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = VATType
        fields = [
            'id', 'code', 'name', 'category', 'percentage', 'description', 'active', 'sort_order', 'created_at', 'updated_at'
        ]


class CompanyEmailSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyEmailSettings
        fields = [
            'id', 'company',
            'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_use_tls', 'smtp_from',
            'imap_host', 'imap_user', 'imap_password', 'imap_port', 'imap_sent_folder',
            'default_subject_template', 'default_body_template',
            'subject_template_en', 'body_template_en',
            'arrears_subject_template', 'arrears_body_template',
            'default_sender_name', 'default_sender_phone',
            'use_thunderbird', 'thunderbird_path',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class EmailTemplateSerializer(serializers.ModelSerializer):
    template_type_label = serializers.CharField(source='get_template_type_display', read_only=True)
    language_label = serializers.CharField(source='get_language_display', read_only=True)

    class Meta:
        model = EmailTemplate
        fields = [
            'id', 'company', 'template_type', 'template_type_label', 'name',
            'language', 'language_label',
            'subject_template', 'body_template', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class EmailSignatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailSignature
        fields = [
            'id', 'company', 'name', 'content_html', 'is_default', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'menu_permissions', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class SystemUserSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    companies = CompanySerializer(many=True, read_only=True)
    company_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False
    )
    roles = RoleSerializer(many=True, read_only=True)
    allowed_menus = serializers.SerializerMethodField(read_only=True)
    role_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False
    )
    
    class Meta:
        model = SystemUser
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'email',
            'is_active', 'last_login', 'companies', 'company_ids', 'roles', 'role_ids', 'allowed_menus', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'last_login', 'created_at', 'updated_at']
        extra_kwargs = {
            'password_hash': {'write_only': True},
        }

    def create(self, validated_data):
        company_ids = validated_data.pop('company_ids', [])
        role_ids = validated_data.pop('role_ids', [])
        user = SystemUser.objects.create(**validated_data)
        if company_ids:
            user.companies.set(company_ids)
        if role_ids:
            user.roles.set(role_ids)
        return user

    def update(self, instance, validated_data):
        company_ids = validated_data.pop('company_ids', None)
        role_ids = validated_data.pop('role_ids', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if company_ids is not None:
            instance.companies.set(company_ids)
        if role_ids is not None:
            instance.roles.set(role_ids)
        return instance

    def get_allowed_menus(self, obj):
        menus = []
        for role in obj.roles.filter(is_active=True):
            menus.extend(role.menu_permissions or [])
        seen = set()
        deduped = []
        for key in menus:
            if key in seen:
                continue
            seen.add(key)
            deduped.append(key)
        return deduped


class SystemUserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    company_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False
    )
    role_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False
    )
    
    class Meta:
        model = SystemUser
        fields = [
            'first_name', 'last_name', 'email', 'password', 'is_active', 'company_ids', 'role_ids'
        ]

    def create(self, validated_data):
        password = validated_data.pop('password')
        company_ids = validated_data.pop('company_ids', [])
        role_ids = validated_data.pop('role_ids', [])
        user = SystemUser.objects.create(**validated_data)
        user.set_password(password)
        user.save()  # Save the hashed password
        if company_ids:
            user.companies.set(company_ids)
        if role_ids:
            user.roles.set(role_ids)
        return user


class InvoiceBlockSerializer(serializers.ModelSerializer):
    company_name = serializers.StringRelatedField(source='company.name', read_only=True)
    invoice_count = serializers.ReadOnlyField()
    cancelled_count = serializers.ReadOnlyField()
    total_net_amount = serializers.ReadOnlyField()
    total_vat_amount = serializers.ReadOnlyField()
    nav_configuration_name = serializers.SerializerMethodField(read_only=True)
    nav_configuration = NAVConfigurationSerializer(read_only=True)
    # Accept write via nav_configuration_id for frontend consistency
    nav_configuration_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    company_id = serializers.UUIDField(write_only=True, required=False)
    
    class Meta:
        model = InvoiceBlock
        fields = [
            'id', 'company', 'company_name', 'name', 'prefix', 'start_number',
            'current_number', 'is_active', 'invoice_count', 'cancelled_count',
            'total_net_amount', 'total_vat_amount', 'nav_configuration',
            'nav_configuration_name', 'nav_configuration_id', 'company_id', 'invoice_appearance', 
            'default_currency', 'default_bank_account', 'default_vat_type', 'language', 'second_language', 'footer_note',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at']

    def get_nav_configuration_name(self, obj):
        return obj.nav_configuration.name if obj.nav_configuration else None

    def validate(self, attrs):
        if self.instance and self.instance.invoices.exists():
            for field in ['prefix', 'start_number']:
                if field in attrs and attrs[field] != getattr(self.instance, field):
                     raise serializers.ValidationError(
                        f"A számlatömb már tartalmaz számlát, a(z) {field} mező nem módosítható."
                    )

        # Company mapping via company_id for frontend compatibility
        company_id = attrs.pop('company_id', None)
        if company_id is not None:
            from .models import Company
            try:
                attrs['company'] = Company.objects.get(id=company_id)
            except Company.DoesNotExist:
                raise serializers.ValidationError({'company_id': 'Cég nem található'})
        elif not self.instance and 'company' not in attrs:
            # Company is required when creating a new block
            raise serializers.ValidationError({'company': 'Cég megadása kötelező'})

        nav_config_id = attrs.pop('nav_configuration_id', serializers.empty)
        company = attrs.get('company') or getattr(self.instance, 'company', None)
        if nav_config_id is not serializers.empty and nav_config_id is not None:
            from .models import CompanyNAVConfiguration
            try:
                nav_conf = CompanyNAVConfiguration.objects.get(id=nav_config_id)
            except CompanyNAVConfiguration.DoesNotExist:
                raise serializers.ValidationError({'nav_configuration_id': 'NAV konfiguráció nem található'})
            if company and nav_conf.company_id != company.id:
                raise serializers.ValidationError({'nav_configuration_id': 'A NAV konfiguráció nem ehhez a céghez tartozik'})
            attrs['nav_configuration'] = nav_conf
        elif nav_config_id is None:
            # Explicitly set to None to clear association
            attrs['nav_configuration'] = None

        if not self.instance and not attrs.get('default_vat_type'):
            default_vat = VATType.objects.filter(active=True).order_by('sort_order', 'name').first() or VATType.objects.order_by('sort_order', 'name').first()
            if default_vat:
                attrs['default_vat_type'] = default_vat
        return attrs


class PaymentBatchItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentBatchItem
        fields = ['id', 'invoice_number', 'supplier_tax_number', 'supplier_name', 'amount_gross', 'currency', 'created_at']
        read_only_fields = ['id', 'created_at']


class PaymentBatchSerializer(serializers.ModelSerializer):
    items = PaymentBatchItemSerializer(many=True, read_only=True)
    item_count = serializers.ReadOnlyField()
    company_name = serializers.SerializerMethodField(read_only=True)
    bank_account_name = serializers.SerializerMethodField(read_only=True)
    gross_total = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PaymentBatch
        fields = ['id', 'company', 'company_name', 'name', 'bank_account', 'bank_account_name', 'currency', 'status', 'created_by', 'created_at', 'updated_at', 'items', 'item_count', 'gross_total']
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'item_count', 'company_name', 'bank_account_name', 'gross_total']

    def get_company_name(self, obj):
        try:
            return obj.company.name
        except Exception:
            return None

    def get_bank_account_name(self, obj):
        try:
            acc = obj.bank_account
            if not acc:
                return None
            label = (acc.bank_name + ' - ') if acc.bank_name else ''
            return f"{label}{acc.iban or acc.account_number or ''}"
        except Exception:
            return None

    def get_gross_total(self, obj):
        try:
            from django.db.models import Sum
            total = obj.items.aggregate(s=Sum('amount_gross')).get('s')
            return str(total) if total is not None else None
        except Exception:
            return None

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class CompanyNAVConfigurationSerializer(serializers.ModelSerializer):
    company_name = serializers.StringRelatedField(source='company.name', read_only=True)
    
    class Meta:
        model = CompanyNAVConfiguration
        fields = [
            'id', 'company', 'company_name', 'name', 'is_active', 'is_default',
            'is_test_environment', 'api_url', 'login', 'password', 'tax_number',
            'sign_key', 'exchange_key', 'software_id', 'software_name',
            'software_operation', 'software_main_version', 'software_dev_name',
            'software_dev_contact', 'software_dev_country_code',
            'software_dev_tax_number', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'password': {'write_only': True},
            'sign_key': {'write_only': True},
            'exchange_key': {'write_only': True},
        }

    def validate_software_id(self, value: str):
        """Ensure software_id matches NAV required format: exactly 18 chars [0-9A-Z-]."""
        v = (value or '').strip().upper()
        import re
        if not re.fullmatch(r'[0-9A-Z\-]{18}', v):
            raise serializers.ValidationError(
                "Érvénytelen softwareId. Pontosan 18 karakter, csak szám (0-9), nagybetű (A-Z) és kötőjel (-) engedélyezett. Példa: 123456789123456789"
            )
        return v

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is not None:
            for field in ('password', 'sign_key', 'exchange_key'):
                if field not in attrs:
                    continue
                value = attrs.get(field)
                if value is None:
                    attrs.pop(field, None)
                    continue
                if isinstance(value, str) and value.strip() == '':
                    attrs.pop(field, None)
        return attrs


class IncomingDocumentSerializer(serializers.ModelSerializer):
    company_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = IncomingDocument
        fields = [
            'id', 'company', 'company_id', 'invoice_number', 'supplier_tax_number', 'type',
            'file', 'original_name', 'content_type', 'size', 'comment', 'uploaded_at'
        ]
        read_only_fields = ['id', 'uploaded_at', 'company']

    def create(self, validated_data):
        request = self.context.get('request')
        company_id = validated_data.pop('company_id', None)
        if not company_id:
            comp = getattr(request, 'company', None) if request else None
            if not comp:
                raise serializers.ValidationError({'company_id': 'Cég nem található'})
            validated_data['company'] = comp
        else:
            try:
                validated_data['company'] = Company.objects.get(id=company_id)
            except Company.DoesNotExist:
                raise serializers.ValidationError({'company_id': 'Cég nem található'})
        f = validated_data.get('file')
        if f is not None:
            try:
                validated_data['original_name'] = getattr(f, 'name', None) or validated_data.get('original_name')
                validated_data['content_type'] = getattr(f, 'content_type', None) or validated_data.get('content_type')
                validated_data['size'] = getattr(f, 'size', None) or validated_data.get('size') or 0
            except Exception:
                pass
        return super().create(validated_data)



class BackupConfigurationSerializer(serializers.ModelSerializer):
    interval_display = serializers.CharField(source='get_interval_display', read_only=True)
    
    class Meta:
        model = BackupConfiguration
        fields = ['id', 'name', 'interval', 'interval_display', 'retention_days', 'is_active', 'last_backup', 'created_at', 'updated_at']
        read_only_fields = ['id', 'last_backup', 'created_at', 'updated_at']


class BackupFileSerializer(serializers.ModelSerializer):
    file_size_mb = serializers.ReadOnlyField()
    created_by_name = serializers.SerializerMethodField()
    configuration_name = serializers.CharField(source='configuration.name', read_only=True)
    
    class Meta:
        model = BackupFile
        fields = ['id', 'configuration', 'configuration_name', 'filename', 'filepath', 'file_size', 'file_size_mb', 'created_at', 'created_by', 'created_by_name', 'is_manual']
        read_only_fields = ['id', 'file_size', 'created_at', 'created_by']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'


# ── Incoming Proforma serializers ────────────────────────────────────────────

class IncomingProformaDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            try:
                url = obj.file.url
                if request:
                    return request.build_absolute_uri(url)
                return url
            except Exception:
                pass
        return None

    class Meta:
        model = IncomingProformaDocument
        fields = ['id', 'proforma', 'type', 'file_url', 'original_name', 'content_type', 'size', 'comment', 'uploaded_at']


class IncomingProformaInvoiceLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = IncomingProformaInvoiceLink
        fields = ['id', 'proforma', 'invoice_number', 'supplier_tax_number', 'supplier_name', 'allocated_amount', 'currency', 'created_at']


class IncomingProformaSerializer(serializers.ModelSerializer):
    invoice_links = IncomingProformaInvoiceLinkSerializer(many=True, read_only=True)
    documents = IncomingProformaDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = IncomingProforma
        fields = '__all__'
