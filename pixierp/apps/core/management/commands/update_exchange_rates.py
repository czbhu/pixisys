from decimal import Decimal
from django.core.management.base import BaseCommand
from apps.core.models import Currency
from apps.core.mnb_api import mnb_api


class Command(BaseCommand):
    help = 'Updates exchange rates from MNB API'

    def handle(self, *args, **options):
        self.stdout.write('Fetching exchange rates from MNB...')
        
        try:
            rates = mnb_api.get_current_exchange_rates()
            
            if not rates:
                self.stdout.write(self.style.ERROR('Failed to fetch rates from MNB API'))
                return
            
            self.stdout.write(f"Fetched rates for: {list(rates.keys())}")
            
            updated_count = 0
            
            # Update HUF to 1.0000
            huf_currency = Currency.objects.filter(code='HUF').first()
            if huf_currency:
                huf_currency.exchange_rate = Decimal('1.0000')
                huf_currency.save()
                updated_count += 1
                self.stdout.write(self.style.SUCCESS('HUF rate set to: 1.0000'))
            
            # Update other currencies
            for code, rate_data in rates.items():
                try:
                    currency = Currency.objects.filter(code=code).first()
                    if currency:
                        old_rate = currency.exchange_rate
                        currency.exchange_rate = rate_data['rate']
                        currency.save()
                        updated_count += 1
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'Updated {code}: {old_rate} -> {rate_data["rate"]:.4f} '
                                f'(1 {code} = {rate_data["rate_huf"]:.2f} HUF)'
                            )
                        )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'Error updating {code}: {e}')
                    )
            
            self.stdout.write(
                self.style.SUCCESS(f'Successfully updated {updated_count} currencies')
            )
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error fetching exchange rates: {e}')
            )

