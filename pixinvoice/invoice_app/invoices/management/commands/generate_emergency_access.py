"""Management command to generate emergency admin access token"""
from django.core.management.base import BaseCommand
from django.conf import settings
from invoices.models_emergency import EmergencyAccessToken
import socket


class Command(BaseCommand):
    help = 'Generál egy időkorlátozott admin hozzáférési tokent (jelszó nélküli belépés)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--minutes',
            type=int,
            default=15,
            help='Token érvényességi ideje percben (alapértelmezett: 15)',
        )

    def handle(self, *args, **options):
        validity_minutes = options['minutes']
        
        # Hostname meghatározása
        try:
            hostname = socket.gethostname()
            # Próbáljuk meg kitalálni a domain-t
            if 'inv.pixisys.eu' in settings.ALLOWED_HOSTS:
                base_url = 'https://inv.pixisys.eu'
            elif 'ti.pixisys.eu' in settings.ALLOWED_HOSTS:
                base_url = 'https://ti.pixisys.eu'
            else:
                # Fallback localhost-ra
                base_url = 'http://localhost:4000'
        except:
            base_url = 'http://localhost:4000'
        
        # Token létrehozása
        token = EmergencyAccessToken.create_token(validity_minutes=validity_minutes)
        
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 70))
        self.stdout.write(self.style.SUCCESS("  🚨 Emergency Admin Access Token Generálva"))
        self.stdout.write(self.style.SUCCESS("=" * 70))
        self.stdout.write("")
        self.stdout.write(f"  ⏰ Érvényesség: {validity_minutes} perc")
        self.stdout.write(f"  🔑 Token: {token.token}")
        self.stdout.write("")
        self.stdout.write(self.style.WARNING("  📋 Használat (böngészőben):"))
        self.stdout.write("")
        self.stdout.write(f"     {base_url}/emergency-login/{token.token}")
        self.stdout.write("")
        self.stdout.write(self.style.WARNING("  ⚠️  A token csak egyszer használható!"))
        self.stdout.write(self.style.WARNING(f"  ⚠️  {validity_minutes} perc után automatikusan lejár!"))
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 70))
        self.stdout.write("")
        
        # Cleanup old tokens
        from django.utils import timezone
        deleted_count, _ = EmergencyAccessToken.objects.filter(
            expires_at__lt=timezone.now()
        ).delete()
        
        if deleted_count > 0:
            self.stdout.write(self.style.SUCCESS(f"  ♻️  {deleted_count} lejárt token törölve"))
