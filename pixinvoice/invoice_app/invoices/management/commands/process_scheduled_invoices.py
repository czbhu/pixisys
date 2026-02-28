from types import SimpleNamespace

from django.contrib.auth.models import AnonymousUser
from django.core.management.base import BaseCommand

from invoices.models import Company
from invoices.views.views import InvoiceViewSet


class Command(BaseCommand):
    help = 'Feldolgozza az esedékes időzített számlákat.'

    def add_arguments(self, parser):
        parser.add_argument('--company-id', dest='company_id', default=None, help='Csak egy adott cég UUID-je')

    def handle(self, *args, **options):
        company_id = options.get('company_id')
        qs = Company.objects.filter(id=company_id) if company_id else Company.objects.all()
        if not qs.exists():
            self.stdout.write(self.style.WARNING('Nincs feldolgozható cég.'))
            return

        view = InvoiceViewSet()
        request = SimpleNamespace(user=AnonymousUser())

        total_processed = 0
        total_blocked = 0
        total_failed = 0

        for company in qs:
            result = view._scheduled_process_due(request, company)
            processed = int(result.get('processed') or 0)
            blocked = int(result.get('blocked') or 0)
            failed = int(result.get('failed') or 0)
            total_processed += processed
            total_blocked += blocked
            total_failed += failed
            self.stdout.write(
                f"{company.name}: feldolgozva={processed}, jóváhagyásra vár={blocked}, hiba={failed}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Összesen: feldolgozva={total_processed}, jóváhagyásra vár={total_blocked}, hiba={total_failed}"
            )
        )
