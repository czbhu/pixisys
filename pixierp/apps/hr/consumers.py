"""
WebSocket Consumer for Access Control real-time updates
"""
import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import AccessControlConfig
from .services.access_control_service import AccessControlService


class AccessControlConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time access control device status updates
    """
    
    async def connect(self):
        """Accept WebSocket connection"""
        await self.accept()
        
        # Start periodic status check
        self.status_check_task = asyncio.create_task(
            self.periodic_status_check()
        )
    
    async def disconnect(self, close_code):
        """Cancel tasks on disconnect"""
        if hasattr(self, 'status_check_task'):
            self.status_check_task.cancel()
    
    async def receive(self, text_data):
        """
        Handle incoming WebSocket messages
        
        Expected message format:
        {
            "type": "test_connection",
            "device_id": "1001",
            "device_ip": "192.168.1.101",
            "device_port": 4370
        }
        """
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'test_connection':
                # Test single device connection
                result = await self.test_device_connection(
                    data.get('device_id'),
                    data.get('device_ip'),
                    data.get('device_port')
                )
                await self.send(text_data=json.dumps({
                    'type': 'connection_test_result',
                    'device_id': data.get('device_id'),
                    'result': result
                }))
            
            elif message_type == 'get_all_status':
                # Get status of all devices
                await self.send_all_device_status()
            
            elif message_type == 'start_monitoring':
                # Start monitoring (already started in connect)
                await self.send(text_data=json.dumps({
                    'type': 'monitoring_started',
                    'message': 'Real-time monitoring started'
                }))
                
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': str(e)
            }))
    
    @database_sync_to_async
    def get_all_devices(self):
        """Get all active access control devices from database"""
        return list(AccessControlConfig.objects.filter(is_active=True).values(
            'id', 'name', 'device_id', 'device_ip', 'device_port'
        ))
    
    @database_sync_to_async
    def test_device_connection(self, device_id, device_ip, device_port):
        """Test connection to a specific device"""
        service = AccessControlService(
            device_ip=device_ip,
            device_port=device_port,
            device_id=device_id
        )
        return service.test_connection()
    
    async def send_all_device_status(self):
        """Send status of all devices"""
        devices = await self.get_all_devices()
        
        for device in devices:
            # Test each device connection asynchronously
            result = await self.test_device_connection(
                device['device_id'],
                device['device_ip'],
                device['device_port']
            )
            
            await self.send(text_data=json.dumps({
                'type': 'device_status',
                'device_id': device['device_id'],
                'device_db_id': device['id'],
                'name': device['name'],
                'online': result.get('success', False),
                'device_info': result.get('device_info') if result.get('success') else None,
                'error': result.get('error') if not result.get('success') else None
            }))
    
    async def periodic_status_check(self):
        """Periodically check status of all devices (every 30 seconds)"""
        try:
            while True:
                await asyncio.sleep(30)  # Wait 30 seconds
                await self.send_all_device_status()
        except asyncio.CancelledError:
            # Task was cancelled, clean up
            pass
        except Exception as e:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': f'Periodic check error: {str(e)}'
            }))
