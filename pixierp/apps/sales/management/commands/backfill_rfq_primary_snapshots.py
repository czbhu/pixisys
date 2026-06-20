from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = (
        "Backfill QuoteRequest primary snapshot fields from the first root item and active order. "
        "Default is dry-run; pass --execute to persist changes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Apply updates (default: dry-run)",
        )

    def handle(self, *args, **options):
        execute = options.get("execute", False)

        from apps.sales.models import QuoteRequest, DeliveryNote

        updated = 0
        anomalies = []

        with transaction.atomic():
            qs = QuoteRequest.objects.filter(is_deleted=False).prefetch_related(
                "items",
                "customer_orders__items",
            )

            for qr in qs:
                root_items = list(qr.items.filter(parent__isnull=True).order_by("sort_order", "id"))
                if len(root_items) != 1:
                    anomalies.append(
                        f"RFQ {qr.number or qr.request_number or qr.id}: root_items={len(root_items)}"
                    )
                item = root_items[0] if root_items else None

                active_orders = list(qr.customer_orders.exclude(status="cancelled").order_by("-id"))
                if len(active_orders) > 1:
                    anomalies.append(
                        f"RFQ {qr.number or qr.request_number or qr.id}: active_orders={len(active_orders)}"
                    )
                order = active_orders[0] if active_orders else None

                delivery_number = ""
                if order:
                    dn = (
                        DeliveryNote.objects.filter(
                            items__customer_order_item__customer_order=order
                        )
                        .order_by("-created_at")
                        .first()
                    )
                    if dn and dn.delivery_note_number:
                        delivery_number = dn.delivery_note_number

                next_values = {
                    "primary_item_name": (item.item_name if item and item.item_name else "") if item else "",
                    "primary_item_description": (item.description or "") if item else "",
                    "primary_quantity": (item.quantity if item else 1),
                    "primary_unit": (item.unit if item and item.unit else "db") if item else "db",
                    "primary_net_unit_price": (item.net_unit_price if item else 0),
                    "primary_vat_rate": (item.vat_rate if item else 27),
                    "primary_discount_percent": (item.discount_percent if item else 0),
                    "primary_quote_item_id": (item.id if item else None),
                    "primary_order_number": (order.order_number if order and order.order_number else "") if order else "",
                    "primary_delivery_note_number": delivery_number,
                    "primary_invoice_number": (order.invoice_number if order and order.invoice_number else "") if order else "",
                }

                changed_fields = []
                for field, value in next_values.items():
                    if getattr(qr, field) != value:
                        setattr(qr, field, value)
                        changed_fields.append(field)

                if changed_fields:
                    updated += 1
                    self.stdout.write(
                        f"RFQ {qr.number or qr.request_number or qr.id}: "
                        f"{', '.join(changed_fields)}"
                    )
                    if execute:
                        qr.save(update_fields=changed_fields)

            self.stdout.write("")
            self.stdout.write(f"RFQ-k feldolgozva: {qs.count()}")
            self.stdout.write(f"Frissitendo rekordok: {updated}")
            self.stdout.write(f"Anomaliak: {len(anomalies)}")

            if anomalies:
                self.stdout.write("\nAnomalia lista:")
                for row in anomalies:
                    self.stdout.write(f"- {row}")

            if not execute:
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING("\nDRY-RUN: rollback megtortent. Hasznald a --execute kapcsolot menteshez."))
            else:
                self.stdout.write(self.style.SUCCESS("\nBackfill kesz."))
