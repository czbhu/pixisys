"""
Auto-confirm DeliveryNotes that have been unconfirmed for more than 48 hours.

Usage:
  python manage.py auto_confirm_delivery_notes            # live run
  python manage.py auto_confirm_delivery_notes --dry-run  # preview only

Recommended crontab entry (every 30 minutes):
  */30 * * * * cd /home/ceze/pixisys/pixierp && venv/bin/python manage.py auto_confirm_delivery_notes >> /home/ceze/pixisys/logs/auto_confirm.log 2>&1
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import models
from django.utils import timezone


class Command(BaseCommand):
    help = "Auto-confirm delivery notes that have not been confirmed within 48 hours."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be confirmed without making any changes.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        now = timezone.now()
        threshold = now - timedelta(hours=48)

        from apps.sales.models import DeliveryNote, DeliveryNoteItem

        # Find unconfirmed notes created more than 48 hours ago
        # that have a public_token (meaning they were sent to the customer)
        # and have no rejection_reason set (not explicitly rejected)
        qs = DeliveryNote.objects.filter(
            is_confirmed=False,
            created_at__lte=threshold,
            public_token__isnull=False,
            rejection_reason="",
        ).prefetch_related("items__customer_order_item")

        count = qs.count()
        if count == 0:
            self.stdout.write("No delivery notes to auto-confirm.")
            return

        self.stdout.write(
            f"Found {count} delivery note(s) eligible for auto-confirmation."
        )

        confirmed = 0
        for dn in qs:
            age_hours = (now - dn.created_at).total_seconds() / 3600
            self.stdout.write(
                f"  DN #{dn.delivery_note_number} – created {age_hours:.1f}h ago"
                + (" [DRY RUN]" if dry_run else "")
            )
            if dry_run:
                continue

            dn.is_confirmed = True
            dn.confirmed_at = now
            dn.confirmed_by_info = "Automatikusan elfogadva (48 óra eltelt)"
            dn.save(update_fields=["is_confirmed", "confirmed_at", "confirmed_by_info"])

            # Update CustomerOrderItem statuses (same logic as manual confirm)
            # Status rank: higher = more advanced. Never downgrade.
            _RANK = {
                "new": 0, "confirmed": 1, "in_production": 2, "ready": 3,
                "in_delivery": 4, "delivered": 5, "invoiced": 6,
            }
            for dn_item in dn.items.all():
                coi = dn_item.customer_order_item
                if coi.status in ("cancelled", "invoiced"):
                    continue
                ordered = coi.quantity
                delivered_total = (
                    DeliveryNoteItem.objects.filter(
                        customer_order_item=coi,
                        delivery_note__is_confirmed=True,
                    ).aggregate(total=models.Sum("quantity"))["total"]
                    or 0
                )
                if delivered_total >= ordered:
                    new_status = "delivered"
                else:
                    new_status = "in_delivery"
                # Only upgrade, never downgrade
                if _RANK.get(new_status, 0) > _RANK.get(coi.status, 0):
                    coi.status = new_status
                    coi.save()

            # Safety net: explicitly resync parent order statuses
            from apps.sales.models import CustomerOrder
            order_ids = set(dn.items.values_list('customer_order_item__customer_order_id', flat=True))
            for oid in order_ids:
                CustomerOrder.sync_status_from_items(oid)

            confirmed += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(f"Dry-run: would have confirmed {count} note(s)."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Auto-confirmed {confirmed} delivery note(s)."))
