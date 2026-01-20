import os
import django
from channels.layers import get_channel_layer

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

layer = get_channel_layer()
print(f"Layer: {layer}")
print(f"Backend: {layer.configs['default']['BACKEND']}")
