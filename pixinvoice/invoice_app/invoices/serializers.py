from rest_framework import serializers
from django.db import models
from .models import (
    Customer, Invoice, InvoiceItem, NAVConfiguration, Contact, Company, SystemUser,
    InvoiceBlock, CompanyNAVConfiguration, CustomerBankAccount, CompanyBankAccount, VATType,
    BankStatement, BankStatementItem, ProformaInvoice, CompanyEmailSettings, PaymentBatch, PaymentBatchItem, IncomingDocument,
    BackupConfiguration, BackupFile
)


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
            'vat_group_id', 'vat_group_member_tax_number', 'vat_status', 'is_hungarian_taxpayer', 'eu_tax_number', 'created_at', 'updated_at',
            'payment_due_days', 'bank_accounts'
        ]

    def validate(self, attrs):
        vat_status = attrs.get('vat_status', getattr(self.instance, 'vat_status', 'DOMESTIC'))
        attrs['is_hungarian_taxpayer'] = (vat_status == 'DOMESTIC')
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

    class Meta:
        model = BankStatementItem
        fields = ['id', 'bank_statement', 'customer', 'invoice', 'invoice_number', 'customer_name', 'amount', 'note', 'created_at']
        read_only_fields = ['id', 'created_at', 'invoice_number', 'customer_name', 'bank_statement']

    def get_invoice_number(self, obj):
        return obj.invoice.invoice_number if obj.invoice else None

    def get_customer_name(self, obj):
        return obj.customer.name if obj.customer else None


class BankStatementSerializer(serializers.ModelSerializer):
    items = BankStatementItemSerializer(many=True, required=False)
    total_amount = serializers.ReadOnlyField()
    company_name = serializers.SerializerMethodField(read_only=True)
    bank_account_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = BankStatement
        fields = [
            'id', 'company', 'company_name', 'bank_account', 'bank_account_name', 'statement_date', 'sequence_number', 'currency', 'note',
            'created_by', 'created_at', 'updated_at', 'items', 'total_amount'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'total_amount']

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
                    if invoice.amount_paid >= invoice.total_gross_amount:
                        invoice.status = 'paid'
                        invoice.payment_date = statement.statement_date
                    elif invoice.amount_paid > 0:
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
                    if inv.amount_paid >= inv.total_gross_amount:
                        inv.status = 'paid'
                        inv.payment_date = instance.statement_date
                    elif inv.amount_paid > 0:
                        inv.status = 'partially_paid'
                    else:
                        # If previously marked paid/partial but now zero or less, set to 'sent'
                        if inv.status in ('paid', 'partially_paid'):
                            inv.status = 'sent'
                        inv.payment_date = None
                    inv.save(update_fields=['amount_paid', 'status', 'payment_date', 'updated_at'])

                for item in items_data:
                    # Existing item update by id
                    item_id = str(item.get('id') or '')
                    if item_id and item_id in existing:
                        obj = existing[item_id]
                        old_amount = obj.amount
                        new_amount = item.get('amount', old_amount)
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
                    amount = item.get('amount')
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
            'total_net_amount', 'total_vat_amount', 'total_gross_amount'
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

            # Generate number if missing: YYYYMMDD + daily 3-digit
            pfnum = (validated_data.get('proforma_number') or '').strip()
            if not pfnum:
                from datetime import datetime
                today = datetime.now().strftime('%Y%m%d')
                last = ProformaInvoice.objects.filter(proforma_number__startswith=today).order_by('-proforma_number').first()
                seq = 1
                if last and last.proforma_number.startswith(today):
                    tail = last.proforma_number[len(today):]
                    try:
                        seq = int(tail) + 1
                    except Exception:
                        seq = 1
                pfnum = f"{today}{seq:03d}"
            request = self.context.get('request')
            proforma = ProformaInvoice.objects.create(
                proforma_number=pfnum,
                company=company,
                customer=customer,
                **validated_data
            )
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

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'company', 'customer', 'customer_id', 'items',
            'issue_date', 'due_date', 'delivery_date', 'currency',
            'exchange_rate', 'payment_method', 'invoice_category', 'invoice_appearance', 'payment_date', 'completeness_indicator', 'order_reference',
            'status', 'nav_transaction_id',
            'nav_submission_date', 'nav_response', 'notes', 'created_by',
            'created_at', 'updated_at', 'total_net_amount', 'total_vat_amount',
            'total_gross_amount', 'amount_paid', 'print_snapshot', 'advances_used', 'erp_order_ids'
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
                if invoice.payment_method not in ('transfer', 'cod'):
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
            'notes', 'is_primary', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ContactCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = [
            'customer', 'first_name', 'last_name', 'position', 'department',
            'contact_type', 'email', 'phone', 'mobile', 'fax', 'notes',
            'is_primary', 'is_active'
        ]


class CompanySerializer(serializers.ModelSerializer):
    bank_accounts = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = Company
        fields = [
            'id', 'name', 'short_name', 'tax_number', 'full_tax_number',
            'vat_code', 'county_code', 'eu_tax_number', 'vat_group_id', 'vat_group_member_tax_number',
            'address', 'street_name', 'public_place_category', 'street_number', 'building', 'staircase', 'floor', 'door',
            'city', 'postal_code', 'country', 'email', 'phone', 'xml_logging_enabled',
            'is_active', 'created_at', 'updated_at', 'bank_accounts'
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
            }
            for a in accounts
        ]

class CompanyBankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyBankAccount
        fields = ['id', 'company', 'bank_name', 'account_number', 'iban', 'swift_bic', 'currency', 'is_primary', 'created_at', 'updated_at']
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
            'default_sender_name', 'default_sender_phone',
            'use_thunderbird', 'thunderbird_path',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SystemUserSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    companies = CompanySerializer(many=True, read_only=True)
    company_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False
    )
    
    class Meta:
        model = SystemUser
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'email',
            'is_active', 'companies', 'company_ids', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'password_hash': {'write_only': True},
        }

    def create(self, validated_data):
        company_ids = validated_data.pop('company_ids', [])
        user = SystemUser.objects.create(**validated_data)
        if company_ids:
            user.companies.set(company_ids)
        return user

    def update(self, instance, validated_data):
        company_ids = validated_data.pop('company_ids', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if company_ids is not None:
            instance.companies.set(company_ids)
        return instance


class SystemUserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    company_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False
    )
    
    class Meta:
        model = SystemUser
        fields = [
            'first_name', 'last_name', 'email', 'password', 'is_active', 'company_ids'
        ]

    def create(self, validated_data):
        password = validated_data.pop('password')
        company_ids = validated_data.pop('company_ids', [])
        user = SystemUser.objects.create(**validated_data)
        user.set_password(password)
        if company_ids:
            user.companies.set(company_ids)
        return user


class InvoiceBlockSerializer(serializers.ModelSerializer):
    company_name = serializers.StringRelatedField(source='company.name', read_only=True)
    invoice_count = serializers.ReadOnlyField()
    cancelled_count = serializers.ReadOnlyField()
    total_net_amount = serializers.ReadOnlyField()
    total_vat_amount = serializers.ReadOnlyField()
    nav_configuration_name = serializers.SerializerMethodField(read_only=True)
    # Accept write via nav_configuration_id for frontend consistency
    nav_configuration_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    company_id = serializers.UUIDField(write_only=True, required=False)
    
    class Meta:
        model = InvoiceBlock
        fields = [
            'id', 'company', 'company_name', 'name', 'prefix', 'start_number',
            'current_number', 'is_active', 'invoice_count', 'cancelled_count',
            'total_net_amount', 'total_vat_amount', 'nav_configuration',
            'nav_configuration_name', 'nav_configuration_id', 'company_id', 'invoice_appearance', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_nav_configuration_name(self, obj):
        return obj.nav_configuration.name if obj.nav_configuration else None

    def validate(self, attrs):
        # Company mapping via company_id for frontend compatibility
        company_id = attrs.pop('company_id', None)
        if company_id is not None:
            from .models import Company
            try:
                attrs['company'] = Company.objects.get(id=company_id)
            except Company.DoesNotExist:
                raise serializers.ValidationError({'company_id': 'Cég nem található'})

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

    class Meta:
        model = PaymentBatch
        fields = ['id', 'company', 'company_name', 'name', 'bank_account', 'bank_account_name', 'currency', 'status', 'created_by', 'created_at', 'updated_at', 'items', 'item_count']
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'item_count', 'company_name', 'bank_account_name']

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
