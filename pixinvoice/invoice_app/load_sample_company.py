#!/usr/bin/env python3
"""
Load sample company data for testing Invoice application
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invoice_system.settings')
django.setup()

from invoices.models import Company, CompanyBankAccount, NAVConfiguration
from django.db import transaction


def load_sample_company():
    """Create a sample company with bank account and NAV credentials"""
    
    with transaction.atomic():
        # Check if sample company already exists
        existing = Company.objects.filter(name="Minta Kft.").first()
        if existing:
            print(f"✓ Minta cég már létezik: {existing.name} ({existing.tax_number})")
            print(f"  API kulcs: {existing.api_key}")
            return existing
        
        # Create sample company
        company = Company.objects.create(
            name="Minta Kft.",
            short_name="Minta",
            tax_number="12345678",
            full_tax_number="12345678-2-41",
            vat_code="2",
            county_code="41",
            street_name="Fő",
            public_place_category="utca",
            street_number="1",
            city="Budapest",
            postal_code="1011",
            country="Hungary",
            email="info@minta.hu",
            phone="+36 1 234 5678",
            xml_logging_enabled=True,
            is_active=True
        )
        
        print(f"✓ Minta cég létrehozva: {company.name}")
        print(f"  Adószám: {company.tax_number}")
        print(f"  Cím: {company.postal_code} {company.city}, {company.street_name} {company.public_place_category} {company.street_number}")
        print(f"  API kulcs: {company.api_key}")
        
        # Create bank account
        bank_account = CompanyBankAccount.objects.create(
            company=company,
            bank_name="MNB - Magyar Nemzeti Bank",
            account_number="12345678-12345678-12345678",
            iban="HU42123456781234567812345678",
            swift_bic="MNBHUHB",
            currency="HUF",
            is_primary=True
        )
        
        print(f"✓ Bankszámla hozzáadva: {bank_account.bank_name}")
        print(f"  IBAN: {bank_account.iban}")
        print(f"  Számlaszám: {bank_account.account_number}")
        
        # Create NAV configuration placeholder (for testing - not real credentials!)
        nav_config = NAVConfiguration.objects.create(
            name="Minta NAV Konfiguráció",
            is_active=True,
            api_url="https://api-test.onlineszamla.nav.gov.hu/invoiceService/v3",
            is_test_environment=True,
            login="sample_login",
            password="sample_password",
            tax_number=company.tax_number,
            sign_key="sample_sign_key_12345678901234567890123456789012",
            exchange_key="sample_exchange_key_1234567890123456",
            software_id="HU12345678PIXINVOICE",
            software_name="PixInvoice",
            software_operation="ONLINE_SERVICE",
            software_main_version="1.0",
            software_dev_name="PixiSys Kft.",
            software_dev_contact="info@pixisys.eu",
            software_dev_country_code="HU",
            software_dev_tax_number="12345678"
        )
        
        print(f"✓ NAV konfiguráció létrehozva (teszt módban)")
        print(f"  NAV API: {nav_config.api_url}")
        print(f"  Login: {nav_config.login}")
        print(f"  Teszt környezet: {'Igen' if nav_config.is_test_environment else 'Nem'}")
        
        print("\n" + "="*60)
        print("✓ MINTA CÉG SIKERESEN LÉTREHOZVA")
        print("="*60)
        print("\nFontos információk:")
        print(f"  - Cég neve: {company.name}")
        print(f"  - Adószám: {company.tax_number}")
        print(f"  - API kulcs: {company.api_key}")
        print(f"\nA minta cég használható az Invoice alkalmazás teszteléséhez.")
        print("A NAV API hitelesítő adatok NEM VALÓSAK - élesben cseréld ki őket!")
        
        return company


if __name__ == "__main__":
    print("Minta cég betöltése az Invoice rendszerbe...")
    print("="*60)
    load_sample_company()
