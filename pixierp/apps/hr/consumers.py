"""
WebSocket Consumer for Access Control real-time updates
"""
import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import AccessControlConfig, AttendanceKioskConfig, KioskDevice, Employee
from apps.core.models import Zone
from .services.access_control_service import AccessControlService
from django.core.signing import TimestampSigner


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

class AttendanceKioskConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for In/Out Kiosk
    Handles communication between Backend (initiated by Phone) and Kiosk Display
    """
    async def connect(self):
        self.device_id = self.scope['url_route']['kwargs'].get('device_id')
        self.rotation_task = None
        if self.device_id:
            self.group_name = f"attendance_kiosk_{self.device_id}"
        else:
            self.group_name = "attendance_kiosk"
            # Add to user specific controller group if authenticated
            user = self.scope.get('user')
            if user and user.is_authenticated:
                self.user_group_name = f"qr_controller_{user.id}"
                await self.channel_layer.group_add(
                    self.user_group_name,
                    self.channel_name
                )
        
        # Always add to broadcast group for restart commands
        await self.channel_layer.group_add(
            "attendance_kiosk_broadcast",
            self.channel_name
        )

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        await self.accept()
        self.kiosk_task = asyncio.create_task(self.kiosk_lifecycle())

    async def disconnect(self, close_code):
        if hasattr(self, 'kiosk_task'):
            self.kiosk_task.cancel()
        if self.rotation_task:
            self.rotation_task.cancel()
        
        await self.channel_layer.group_discard(
            "attendance_kiosk_broadcast",
            self.channel_name
        )

        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )
        if hasattr(self, 'user_group_name'):
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name
            )

    @database_sync_to_async
    def generate_identity_token_for_id(self, device_id):
        signer = TimestampSigner()
        payload = f"KIOSK_ID:{device_id}"
        return signer.sign(payload)

    async def rotate_qr_loop(self, user):
        try:
            while True:
                allowed_device_ids = await self.get_allowed_kiosks_for_user(user)
                for dev_id in allowed_device_ids:
                    identity_token = await self.generate_identity_token_for_id(dev_id)
                    await self.channel_layer.group_send(
                        f"attendance_kiosk_{dev_id}",
                        {
                            'type': 'kiosk_message',
                            'message': {
                                'type': 'show_qr',
                                'qr_data': identity_token,
                            }
                        }
                    )
                # Rotate every 5 seconds
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Error in rotation loop: {e}")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            
            if data.get('type') == 'request_qr':
                print(f"[KIOSK_DEBUG] request_qr from {self.scope.get('user')} (DeviceID: {self.device_id})")
                token = await self.generate_kiosk_token()
                user_name = data.get('user_name', 'Felhasználó')
                
                # Existing behavior: Send to sender (Phone Mode)
                await self.send(text_data=json.dumps({
                    'type': 'show_qr',
                    'qr_data': token,
                    'user_name': user_name
                }))

                # Broadcast to relevant Kiosks if request comes from a controller (Phone)
                user = self.scope.get('user')
                if not self.device_id and user and user.is_authenticated:
                    # Cancel existing task if any
                    if self.rotation_task:
                        self.rotation_task.cancel()
                    
                    # Start Rotation Loop
                    self.rotation_task = asyncio.create_task(self.rotate_qr_loop(user))

            elif data.get('type') == 'stop_qr':
                # Stop Rotation Loop
                if self.rotation_task:
                    self.rotation_task.cancel()
                    self.rotation_task = None
                
                # Broadcast stop_qr to all kiosks that received show_qr
                user = self.scope.get('user')
                if not self.device_id and user and user.is_authenticated:
                    allowed_device_ids = await self.get_allowed_kiosks_for_user(user)
                    print(f"[KIOSK_DEBUG] Sending stop_qr to kiosks: {allowed_device_ids}")
                    
                    for dev_id in allowed_device_ids:
                        await self.channel_layer.group_send(
                            f"attendance_kiosk_{dev_id}",
                            {
                                'type': 'kiosk_message',
                                'message': {
                                    'type': 'stop_qr'
                                }
                            }
                        )
                else:
                    # Fallback: send to own group
                    await self.channel_layer.group_send(
                        self.group_name,
                        {
                            'type': 'kiosk_message',
                            'message': {
                                'type': 'stop_qr'
                            }
                        }
                    )
                
        except Exception as e:
            print(f"Error receiving kiosk msg: {e}")

    # Receive message from user controller group
    async def controller_message(self, event):
        if event['message'].get('type') == 'stop_rotation':
             if self.rotation_task:
                 print(f"[KIOSK_DEBUG] Stopping rotation task for {self.scope.get('user')}")
                 self.rotation_task.cancel()
                 self.rotation_task = None

    @database_sync_to_async
    def get_allowed_kiosks_for_user(self, user):
        try:
            print(f"[KIOSK_DEBUG] Checking kiosks for user: {user} (ID: {user.id})")
            if not user or not user.is_authenticated:
                print("[KIOSK_DEBUG] User not authenticated")
                return []
            
            # 1. If user has employee profile, strictly follow Zone logic
            # This ensures even admins/staff see only relevant kiosks for their employee role
            if hasattr(user, 'employee_profile'):
                employee = user.employee_profile
                departments = employee.departments.all()
                print(f"[KIOSK_DEBUG] User {user} is Employee. Depts: {list(departments)}")
                
                if departments:
                    zones = Zone.objects.filter(departments__in=departments)
                    print(f"[KIOSK_DEBUG] Zones: {list(zones)}")
                    kiosks = KioskDevice.objects.filter(zones__in=zones, status='approved').distinct()
                    kiosk_ids = [k.device_id for k in kiosks]
                    print(f"[KIOSK_DEBUG] Found Kiosks: {kiosk_ids}")
                    return kiosk_ids
                else:
                    print("[KIOSK_DEBUG] No departments found for employee")

            # 2. Fallback: Allow staff/superusers to control ALL kiosks ONLY if they are not constrained by employee zones (e.g. pure admin)
            if user.is_staff or user.is_superuser:
                 print("[KIOSK_DEBUG] User is Admin (Fallback)")
                 return [k.device_id for k in KioskDevice.objects.filter(status='approved')]
            
            print("[KIOSK_DEBUG] No matching rules found for user")
            return []
        except Exception as e:
            print(f"Error finding allowed kiosks: {e}")
            import traceback
            traceback.print_exc()
            return []

    # Receive message from room group
    async def kiosk_message(self, event):
        # Send message to WebSocket
        await self.send(text_data=json.dumps(event['message']))

    @database_sync_to_async
    def get_config(self):
        return AttendanceKioskConfig.objects.first()

    @database_sync_to_async
    def generate_kiosk_token(self):
        signer = TimestampSigner()
        # KIOSK_QR prefix to distinguish, include device_id if available
        payload = f"KIOSK_QR:{self.device_id}" if self.device_id else "KIOSK_QR"
        return signer.sign(payload)

    async def kiosk_lifecycle(self):
        try:
            # print("[KioskWS] Starting lifecycle loop")
            while True:
                # Keep connection alive with heartbeat
                await asyncio.sleep(60) 
                
                # PREVIOUS LOGIC: Rotating Identity QR
                # We disable this for "On Demand" mode where Kiosk shows Logo by default.
                # If we need Identity QR, we should implement a specific request for it.
                
                """
                # Get current config
                config = await self.get_config()
                validity = config.qr_validity_seconds if config else 10
                
                if self.device_id:
                    # Generate IDENTITY token (KIOSK_ID:...)
                    token = await self.generate_kiosk_identity_token()
                    
                    await self.send(text_data=json.dumps({
                        'type': 'show_qr',
                        'qr_data': token,
                        # No 'user_name' means it's a System QR
                    }))
                    
                    # Refresh every validity period
                    await asyncio.sleep(validity)
                else:
                    await asyncio.sleep(60)
                """

        except asyncio.CancelledError:
            # print("[KioskWS] Lifecycle cancelled")
            pass

    @database_sync_to_async
    def generate_kiosk_identity_token(self):
        signer = TimestampSigner()
        # KIOSK_ID prefix to distinguish from checking QR
        payload = f"KIOSK_ID:{self.device_id}" 
        return signer.sign(payload)

