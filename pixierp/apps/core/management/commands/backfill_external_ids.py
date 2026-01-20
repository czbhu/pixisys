from django.core.management.base import BaseCommand
from django.db import transaction

from apps.finance.models import Invoice
from apps.core.models import BankAccount
from apps.warehouse.models import MaterialSupplier
from apps.manufacturing.models import ManufacturingProduct
from apps.crm.models import Company, Contact


class Command(BaseCommand):
    help = "Backfill external ID helper fields for transitioning away from local CRM FKs."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Do not persist changes, only log counts.')

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        stats = {
            'invoice_partner_external_id': 0,
            'bankaccount_company_external_id': 0,
            'materialsupplier_supplier_external_id': 0,
            'manufacturing_contact_external_id': 0,
        }

        with transaction.atomic():
            stats['invoice_partner_external_id'] = self._backfill_invoices(dry_run)
            stats['bankaccount_company_external_id'] = self._backfill_bankaccounts(dry_run)
            stats['materialsupplier_supplier_external_id'] = self._backfill_material_suppliers(dry_run)
            stats['manufacturing_contact_external_id'] = self._backfill_manufacturing(dry_run)
            if dry_run:
                transaction.set_rollback(True)

        for key, value in stats.items():
            self.stdout.write(self.style.SUCCESS(f"{key}: {value} updated"))

    def _company_key(self, company: Company) -> str:
        if not company:
            return ''
        # Prefer explicit identifiers
        for field in ['full_tax_number', 'tax_number', 'eu_tax_number', 'vat_group_member_tax_number']:
            val = getattr(company, field, '') or ''
            if val:
                return str(val)
        return str(company.id)

    def _backfill_invoices(self, dry_run: bool) -> int:
        updated = 0
        qs = Invoice.objects.filter(partner_external_id='').select_related('partner')
        for inv in qs.iterator():
            key = self._company_key(inv.partner)
            if not key:
                continue
            inv.partner_external_id = key
            if not dry_run:
                inv.save(update_fields=['partner_external_id'])
            updated += 1
        return updated

    def _backfill_bankaccounts(self, dry_run: bool) -> int:
        updated = 0
        qs = BankAccount.objects.filter(company_external_id='').select_related('company')
        for ba in qs.iterator():
            key = self._company_key(ba.company)
            if not key:
                continue
            ba.company_external_id = key
            if not dry_run:
                ba.save(update_fields=['company_external_id'])
            updated += 1
        return updated

    def _backfill_material_suppliers(self, dry_run: bool) -> int:
        updated = 0
        qs = MaterialSupplier.objects.filter(supplier_external_id='').select_related('supplier')
        for ms in qs.iterator():
            key = self._company_key(ms.supplier)
            if not key:
                continue
            ms.supplier_external_id = key
            if not dry_run:
                ms.save(update_fields=['supplier_external_id'])
            updated += 1
        return updated

    def _backfill_manufacturing(self, dry_run: bool) -> int:
        updated = 0
        qs = ManufacturingProduct.objects.filter(contact_external_id='').select_related('contact')
        for mp in qs.iterator():
            contact: Contact = mp.contact
            if not contact:
                continue
            key = contact.external_id or self._company_key(contact.company)
            if not key:
                continue
            mp.contact_external_id = key
            if not dry_run:
                mp.save(update_fields=['contact_external_id'])
            updated += 1
        return updated
