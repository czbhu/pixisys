from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.conf import settings

User = get_user_model()


class Command(BaseCommand):
    help = 'Fejlesztői admin felhasználó létrehozása (csak DEBUG módban)'

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stdout.write(self.style.WARNING('⚠️  Csak DEBUG módban futtatható!'))
            return
        
        email = 'admin@pixisys.eu'
        username = 'admin'
        password = 'CezeAdmin123'
        
        # Ellenőrizzük, hogy létezik-e már (email vagy username alapján)
        user = User.objects.filter(email=email).first()
        if not user:
            user = User.objects.filter(username=username).first()
        
        if user:
            self.stdout.write(self.style.SUCCESS(f'✓ Dev admin már létezik: {user.email}'))
            # Frissítjük az adatokat
            user.email = email
            user.username = username
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.first_name = 'Admin'
            user.last_name = 'Developer'
            user.save()
            self.stdout.write(self.style.SUCCESS(f'✓ Dev admin frissítve'))
        else:
            # Létrehozzuk
            user = User.objects.create_superuser(
                username=username,
                email=email,
                password=password,
                first_name='Admin',
                last_name='Developer'
            )
            self.stdout.write(self.style.SUCCESS(f'✓ Dev admin létrehozva: {email}'))
        
        self.stdout.write(self.style.SUCCESS(f'\n📧 Email: {email}'))
        self.stdout.write(self.style.SUCCESS(f'🔑 Jelszó: {password}'))
        self.stdout.write(self.style.WARNING(f'\n⚠️  Ez a felhasználó csak DEBUG módban használható!'))
