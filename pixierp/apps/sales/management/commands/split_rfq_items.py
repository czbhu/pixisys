"""
Splits multi-root-item QuoteRequests so each root item has its own QuoteRequest.
Also renames CustomerOrder.order_number = quote_request.number throughout.

Usage:
  python manage.py split_rfq_items            # dry-run (shows plan, NO changes)
  python manage.py split_rfq_items --execute  # applies all changes atomically
"""
import secrets

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone


class Command(BaseCommand):
    help = (
        "Split multi-item QuoteRequests: each root item gets its own "
        "QuoteRequest, and order_number is aligned to quote number."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Apply changes (default is dry-run, no DB writes).",
        )

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        execute = options["execute"]
        if not execute:
            self.stdout.write(
                self.style.WARNING(
                    "DRY-RUN MODE – nothing will be saved. Pass --execute to apply."
                )
            )

        from apps.sales.models import (
            CustomerOrder,
            CustomerOrderItem,
            QuoteRequest,
            QuoteRequestItem,
        )

        with transaction.atomic():
            self._run(execute, QuoteRequest, QuoteRequestItem, CustomerOrder, CustomerOrderItem)
            if not execute:
                # Roll back everything so the dry-run is truly non-destructive
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING("\nDRY-RUN complete – rolled back."))
            else:
                self.stdout.write(self.style.SUCCESS("\nMigration applied successfully."))

    # ------------------------------------------------------------------
    def _run(self, execute, QuoteRequest, QuoteRequestItem, CustomerOrder, CustomerOrderItem):
        today = timezone.now().date()

        # ----------------------------------------------------------------
        # PHASE 1: Split multi-root-item QuoteRequests
        # ----------------------------------------------------------------
        self.stdout.write("\n=== PHASE 1: Split multi-root-item QuoteRequests ===")

        multi_rfqs = []
        for qr in QuoteRequest.objects.filter(is_deleted=False).prefetch_related(
            "items", "contacts", "assignees"
        ):
            root_items = list(
                qr.items.filter(parent__isnull=True).order_by("sort_order", "id")
            )
            if len(root_items) > 1:
                multi_rfqs.append((qr, root_items))

        self.stdout.write(f"Found {len(multi_rfqs)} QuoteRequest(s) to split.")

        for qr, root_items in multi_rfqs:
            self.stdout.write(
                f"\n  QR id={qr.id} number={qr.number or qr.request_number!r} "
                f"→ {len(root_items)} root items"
            )
            first_item = root_items[0]
            self.stdout.write(f"    KEEP item id={first_item.id} in original QR")

            for item in root_items[1:]:
                subtree_ids = self._subtree_ids(item)
                new_number = self._fresh_number(today, QuoteRequest)
                self.stdout.write(
                    f"    MOVE item id={item.id} (+{len(subtree_ids)-1} children) "
                    f"→ new QR number={new_number}"
                )

                if execute:
                    new_qr = QuoteRequest.objects.create(
                        number=new_number,
                        request_number=new_number,
                        issue_date=qr.issue_date or today,
                        created_by=qr.created_by,
                        company=qr.company,
                        title=f"Ajánlat {new_number}",
                        description="",
                        internal_description="",
                        status=qr.status,
                        deadline=qr.deadline,
                        currency=qr.currency,
                        partial_order_allowed=qr.partial_order_allowed,
                        public_token=secrets.token_hex(20),
                    )
                    new_qr.contacts.set(qr.contacts.all())
                    new_qr.assignees.set(qr.assignees.all())

                    # Move items
                    QuoteRequestItem.objects.filter(id__in=subtree_ids).update(
                        quote_request=new_qr
                    )

                    # Handle CustomerOrders that contain items from this subtree
                    self._split_orders(
                        qr, new_qr, subtree_ids, today,
                        CustomerOrder, CustomerOrderItem,
                    )
                else:
                    # Dry-run: describe what would happen to orders
                    affected = CustomerOrder.objects.filter(
                        quote_request=qr,
                        items__quote_item_id__in=subtree_ids,
                    ).distinct()
                    for order in affected:
                        moving = order.items.filter(quote_item_id__in=subtree_ids).count()
                        staying = order.items.exclude(quote_item_id__in=subtree_ids).count()
                        if staying:
                            self.stdout.write(
                                f"      ORDER {order.order_number}: "
                                f"SPLIT ({moving} items → new QR, {staying} stay)"
                            )
                        else:
                            self.stdout.write(
                                f"      ORDER {order.order_number}: "
                                f"MOVE entirely → new QR {new_number}"
                            )

        # ----------------------------------------------------------------
        # PHASE 2: Align order_number = quote_request.number
        # ----------------------------------------------------------------
        self.stdout.write("\n=== PHASE 2: Align order_number = quote.number ===")

        # Reload all orders after potential splits above
        all_orders = CustomerOrder.objects.all().select_related("quote_request")
        for order in all_orders:
            qr_num = order.quote_request.number or order.quote_request.request_number
            if order.order_number == qr_num:
                self.stdout.write(f"  ORDER {order.order_number}: already aligned ✓")
                continue
            # Check uniqueness (another order might already have this number)
            conflict = (
                CustomerOrder.objects
                .exclude(pk=order.pk)
                .filter(order_number=qr_num)
                .exists()
            )
            if conflict:
                self.stdout.write(
                    self.style.ERROR(
                        f"  ORDER {order.order_number}: CONFLICT – "
                        f"cannot rename to {qr_num} (already used)"
                    )
                )
                continue
            self.stdout.write(
                f"  ORDER {order.order_number} → {qr_num}"
            )
            if execute:
                order.order_number = qr_num
                order.save(update_fields=["order_number"])

    # ------------------------------------------------------------------
    def _subtree_ids(self, item):
        """Returns the IDs of item and all its descendants."""
        from apps.sales.models import QuoteRequestItem
        ids = [item.id]
        queue = [item.id]
        while queue:
            parent_id = queue.pop(0)
            children = list(
                QuoteRequestItem.objects
                .filter(parent_id=parent_id)
                .values_list("id", flat=True)
            )
            ids.extend(children)
            queue.extend(children)
        return ids

    # ------------------------------------------------------------------
    def _fresh_number(self, today, QuoteRequest):
        """Generate the next available YYYYMMDD## number for today."""
        today_str = today.strftime("%Y%m%d")
        # Count ALL QRs that start with today_str (regardless of created date)
        existing = (
            QuoteRequest.objects
            .filter(number__startswith=today_str)
            .count()
        )
        counter = existing + 1
        while True:
            candidate = f"{today_str}{counter:02d}"
            if not QuoteRequest.objects.filter(number=candidate).exists():
                return candidate
            counter += 1

    # ------------------------------------------------------------------
    def _split_orders(self, old_qr, new_qr, moving_item_ids, today, CustomerOrder, CustomerOrderItem):
        """
        For CustomerOrders belonging to old_qr that contain items from
        moving_item_ids: move the entire order (if all items move) or split it
        (if some items stay and some move).
        """
        affected = CustomerOrder.objects.filter(
            quote_request=old_qr,
            items__quote_item_id__in=moving_item_ids,
        ).distinct()

        for order in affected:
            moving_ois = list(order.items.filter(quote_item_id__in=moving_item_ids))
            staying_ois = list(order.items.exclude(quote_item_id__in=moving_item_ids))

            if not staying_ois:
                # Entire order moves – just re-link quote_request
                order.quote_request = new_qr
                order.save(update_fields=["quote_request"])
                self.stdout.write(
                    f"      ORDER {order.order_number}: moved entirely → QR {new_qr.number}"
                )
            else:
                # Split: create a new order for the moving items
                # order_number = qr.number (Phase 2 will keep it aligned)
                new_order_number = new_qr.number
                new_order = CustomerOrder.objects.create(
                    quote_request=new_qr,
                    order_number=new_order_number,
                    status=order.status,
                    deadline=order.deadline,
                    created_by=order.created_by,
                )
                # Move CustomerOrderItems
                for oi in moving_ois:
                    oi.customer_order = new_order
                    oi.save(update_fields=["customer_order"])
                self.stdout.write(
                    f"      ORDER {order.order_number}: split → "
                    f"{len(staying_ois)} items stay, {len(moving_ois)} items → "
                    f"new ORDER {new_order_number} (QR {new_qr.number})"
                )
