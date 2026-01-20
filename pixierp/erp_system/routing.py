"""
WebSocket URL routing for the ERP system
"""
from django.urls import re_path
from apps.hr.consumers import AccessControlConsumer, AttendanceKioskConsumer
from apps.hr.device_consumer import DeviceConsumer
from apps.core.consumers import NotificationConsumer

websocket_urlpatterns = [
    # General User Notifications
    re_path(r'^ws/notifications/?$', NotificationConsumer.as_asgi()),

    # Frontend WebSocket - for monitoring UI
    re_path(r'^ws/access-control/?$', AccessControlConsumer.as_asgi()),
    
    # Kiosk WebSocket containing QR display
    re_path(r'^ws/attendance/?$', AttendanceKioskConsumer.as_asgi()),
    
    # Device WebSocket - for physical devices to connect
    re_path(r'^ws/device/?$', DeviceConsumer.as_asgi()),
]
