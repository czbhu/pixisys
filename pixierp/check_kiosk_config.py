import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp_system.settings")
django.setup()

from apps.hr.models import AttendanceKioskConfig

config = AttendanceKioskConfig.objects.first()
if config:
    print(f"Current Mode: {config.kiosk_mode}")
else:
    print("No config found")
