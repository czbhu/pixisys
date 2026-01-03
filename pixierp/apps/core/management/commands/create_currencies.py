from django.core.management.base import BaseCommand
from apps.core.models import Currency


class Command(BaseCommand):
    help = 'Create default currencies'

    def handle(self, *args, **options):
        currencies_data = [
            {
                'code': 'HUF',
                'name': 'Magyar Forint',
                'symbol': 'Ft',
                'is_default': True,
                'exchange_rate': 1.0000,
                'is_active': True
            },
            {
                'code': 'EUR',
                'name': 'Euro',
                'symbol': '€',
                'is_default': False,
                'exchange_rate': 0.0026,
                'is_active': True
            },
            {
                'code': 'USD',
                'name': 'US Dollar',
                'symbol': '$',
                'is_default': False,
                'exchange_rate': 0.0028,
                'is_active': True
            },
            {
                'code': 'GBP',
                'name': 'British Pound',
                'symbol': '£',
                'is_default': False,
                'exchange_rate': 0.0022,
                'is_active': True
            }
        ]

        for currency_data in currencies_data:
            currency, created = Currency.objects.get_or_create(
                code=currency_data['code'],
                defaults=currency_data
            )
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'Created currency: {currency.code} - {currency.name}')
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'Currency already exists: {currency.code} - {currency.name}')
                )
