import os
import django
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

layer = get_channel_layer()
print("Sending message...")
async_to_sync(layer.group_send)(
    "attendance_kiosk",
    {
        "type": "kiosk.message",
        "message": {
            "type": "show_qr",
            "qr_data": "TEST-DATA",
        }
    }
)
print("Message sent.")
