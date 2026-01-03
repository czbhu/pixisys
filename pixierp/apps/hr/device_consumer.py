"""
WebSocket Consumer for Access Control Devices
Handles incoming connections from physical access control devices
"""
import json
import asyncio
from datetime import datetime
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import AccessControlConfig

# Global dictionary to track connected devices
# Format: {device_id: {'channel_name': str, 'connected_at': datetime, 'ip': str, 'device_info': dict}}
CONNECTED_DEVICES = {}


class DeviceConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for access control devices to connect
    Devices connect here and register themselves
    """
    
    async def connect(self):
        """Accept WebSocket connection from device"""
        # Get device info from query string or headers
        self.device_id = None
        self.device_ip = self.scope['client'][0] if self.scope['client'] else 'unknown'
        
        # Accept the connection
        await self.accept()
        
        # Send welcome message
        await self.send(text_data=json.dumps({
            'type': 'connection_accepted',
            'message': 'ERP rendszer WebSocket kapcsolat létrejött'
        }))
        
        print(f"[DeviceConsumer] Eszköz csatlakozott: {self.device_ip}")
    
    async def disconnect(self, close_code):
        """Handle device disconnect"""
        if self.device_id:
            print(f"[DeviceConsumer] Eszköz {self.device_id} lecsatlakozott")
            # Remove from connected devices
            if self.device_id in CONNECTED_DEVICES:
                del CONNECTED_DEVICES[self.device_id]
            # Update database
            await self.update_device_online_status(self.device_id, False)
    
    async def receive(self, text_data):
        """
        Handle incoming messages from device
        
        Expected registration message:
        {
            "type": "register",
            "device_id": "1001",
            "device_info": {
                "terminal_type": "...",
                "product_name": "...",
                ...
            }
        }
        """
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            print(f"[DeviceConsumer] Üzenet érkezett: {message_type}")
            
            if message_type == 'register':
                # Device registration
                self.device_id = data.get('device_id')
                device_info = data.get('device_info', {})
                
                # Update device in database
                success = await self.register_device(self.device_id, device_info)
                
                if success:
                    # Add to connected devices
                    CONNECTED_DEVICES[self.device_id] = {
                        'channel_name': self.channel_name,
                        'connected_at': datetime.now().isoformat(),
                        'ip': self.device_ip,
                        'device_info': device_info
                    }
                    
                    # Update database
                    await self.update_device_online_status(self.device_id, True)
                    
                    print(f"[DeviceConsumer] Eszköz regisztrálva: {self.device_id} (IP: {self.device_ip})")
                    print(f"[DeviceConsumer] CONNECTED_DEVICES most: {len(CONNECTED_DEVICES)} eszköz")
                    print(f"[DeviceConsumer] Device IDs: {list(CONNECTED_DEVICES.keys())}")
                    
                    await self.send(text_data=json.dumps({
                        'type': 'registration_success',
                        'message': f'Eszköz {self.device_id} sikeresen regisztrálva',
                        'device_id': self.device_id
                    }))
                else:
                    await self.send(text_data=json.dumps({
                        'type': 'registration_error',
                        'message': f'Eszköz {self.device_id} nem található az adatbázisban'
                    }))
            
            elif message_type == 'ping':
                # Heartbeat
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': data.get('timestamp')
                }))
            
            elif message_type == 'event':
                # Access control event (entry/exit, etc.)
                await self.handle_access_event(data)
            
            else:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'Ismeretlen üzenet típus: {message_type}'
                }))
                
        except json.JSONDecodeError as e:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'JSON parse hiba: {str(e)}'
            }))
        except Exception as e:
            print(f"[DeviceConsumer] Hiba: {str(e)}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'Szerver hiba: {str(e)}'
            }))
    
    @database_sync_to_async
    def register_device(self, device_id, device_info):
        """Register/update device in database"""
        try:
            device = AccessControlConfig.objects.get(device_id=device_id)
            # Could update additional fields here if needed
            print(f"[DeviceConsumer] Eszköz megtalálva: {device.name} ({device_id})")
            return True
        except AccessControlConfig.DoesNotExist:
            print(f"[DeviceConsumer] Eszköz nem található: {device_id}")
            return False
    
    @database_sync_to_async
    def update_device_online_status(self, device_id, is_online):
        """Update device online status in database"""
        from django.utils import timezone
        try:
            device = AccessControlConfig.objects.get(device_id=device_id)
            device.is_online = is_online
            if is_online:
                device.last_seen = timezone.now()
            device.save()
            print(f"[DeviceConsumer] Eszköz {device_id} státusz frissítve: {'online' if is_online else 'offline'}")
        except AccessControlConfig.DoesNotExist:
            pass
    
    async def handle_access_event(self, data):
        """Handle access control events (entry, exit, etc.)"""
        event_type = data.get('event_type')
        user_id = data.get('user_id')
        timestamp = data.get('timestamp')
        
        print(f"[DeviceConsumer] Belépési esemény: {event_type}, user: {user_id}")
        
        # Here you would:
        # 1. Validate the user
        # 2. Log the event
        # 3. Update attendance records
        # 4. Send response to device
        
        await self.send(text_data=json.dumps({
            'type': 'event_acknowledged',
            'event_type': event_type,
            'user_id': user_id,
            'access_granted': True,  # This should be based on validation
            'message': 'Belépés engedélyezve'
        }))
