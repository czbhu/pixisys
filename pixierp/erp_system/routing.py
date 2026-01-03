"""
WebSocket URL routing for the ERP system
"""
from django.urls import re_path
from apps.hr.consumers import AccessControlConsumer
from apps.hr.device_consumer import DeviceConsumer

websocket_urlpatterns = [
    # Frontend WebSocket - for monitoring UI
    re_path(r'ws/access-control/$', AccessControlConsumer.as_asgi()),
    
    # Device WebSocket - for physical devices to connect
    re_path(r'ws/device/$', DeviceConsumer.as_asgi()),
]
