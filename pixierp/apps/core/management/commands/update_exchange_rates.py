import requests
import xml.etree.ElementTree as ET
from decimal import Decimal
from django.core.management.base import BaseCommand
from apps.core.models import Currency


class Command(BaseCommand):
    help = 'Updates exchange rates from MNB API'

    def handle(self, *args, **options):
        try:
            # MNB API endpoint
            url = "https://api.mnb.hu/arfolyamok.asmx/getCurrentExchangeRates"
            
            # API hívás
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            # XML parsing
            root = ET.fromstring(response.content)
            
            # Árfolyamok kinyerése
            exchange_rates = {}
            for day in root.findall('.//Day'):
                for rate in day.findall('Rate'):
                    currency_code = rate.get('curr')
                    rate_value = rate.text
                    if currency_code and rate_value:
                        exchange_rates[currency_code] = Decimal(rate_value)
            
            self.stdout.write(f"Lekért árfolyamok: {list(exchange_rates.keys())}")
            
            # Valuták frissítése
            updated_count = 0
            for currency in Currency.objects.filter(is_active=True):
                if currency.code == 'HUF':
                    # HUF mindig 1.0
                    currency.exchange_rate = Decimal('1.0000')
                    currency.save()
                    updated_count += 1
                    self.stdout.write(f"HUF árfolyam beállítva: 1.0000")
                elif currency.code in exchange_rates:
                    # Árfolyam frissítése (MNB API HUF-ban adja meg)
                    new_rate = exchange_rates[currency.code]
                    currency.exchange_rate = new_rate
                    currency.save()
                    updated_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"{currency.code} árfolyam frissítve: {new_rate} HUF"
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f"{currency.code} árfolyam nem található az MNB API-ban"
                        )
                    )
            
            self.stdout.write(
                self.style.SUCCESS(
                    f"Összesen {updated_count} valuta árfolyama frissítve"
                )
            )
            
        except requests.RequestException as e:
            self.stdout.write(
                self.style.WARNING(f"Hálózati hiba az MNB API hívásakor: {e}")
            )
            # Mock árfolyamok használata hálózati hiba esetén
            self._update_with_mock_rates()
        except ET.ParseError as e:
            self.stdout.write(
                self.style.ERROR(f"Hiba az XML feldolgozásakor: {e}")
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"Váratlan hiba: {e}")
            )
    
    def _update_with_mock_rates(self):
        """Mock árfolyamok használata hálózati hiba esetén"""
        mock_rates = {
            'EUR': Decimal('400.0000'),  # 1 EUR = 400 HUF
            'USD': Decimal('380.0000'),  # 1 USD = 380 HUF
            'GBP': Decimal('480.0000'),  # 1 GBP = 480 HUF
        }
        
        self.stdout.write("Mock árfolyamok használata...")
        
        updated_count = 0
        for currency in Currency.objects.filter(is_active=True):
            if currency.code == 'HUF':
                currency.exchange_rate = Decimal('1.0000')
                currency.save()
                updated_count += 1
                self.stdout.write(f"HUF árfolyam beállítva: 1.0000")
            elif currency.code in mock_rates:
                new_rate = mock_rates[currency.code]
                currency.exchange_rate = new_rate
                currency.save()
                updated_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{currency.code} árfolyam frissítve (mock): {new_rate} HUF"
                    )
                )
        
        self.stdout.write(
            self.style.SUCCESS(
                f"Összesen {updated_count} valuta árfolyama frissítve (mock adatokkal)"
            )
        )
