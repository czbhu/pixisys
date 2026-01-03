from django.core.management.base import BaseCommand
from apps.crm.models import Company

class Command(BaseCommand):
    help = 'Update existing companies with default company_type'

    def handle(self, *args, **options):
        # Update all companies that don't have a company_type set
        updated_count = Company.objects.filter(company_type__isnull=True).update(company_type='customer')
        
        # Also update companies with empty string
        updated_count += Company.objects.filter(company_type='').update(company_type='customer')
        
        self.stdout.write(
            self.style.SUCCESS(f'Successfully updated {updated_count} companies with default type "customer"')
        )
