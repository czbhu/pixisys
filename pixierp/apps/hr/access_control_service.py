"""
Access Control Service - Integration with access control hardware SDK
"""
import sys
import os
from datetime import datetime, date, time, timedelta
from typing import Optional, List, Dict, Any
from django.db import transaction
from django.utils import timezone

# Add SDK to path  
SDK_PATH = '/wb2/pixisys/accesscontrol/WebSocketSDK_Python/WebSocketSDK_Python'
if SDK_PATH not in sys.path:
    sys.path.insert(0, SDK_PATH)

try:
    from packages.devicebroker.client import Client
    from packages.devicebroker.device_cmd.m50 import user_data, log as device_log, device_info
    SDK_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Access control SDK not available: {e}")
    SDK_AVAILABLE = False


class AccessControlService:
    """Service for managing access control device integration"""
    
    def __init__(self, device_ip: str = None, device_port: int = None, device_id: str = None):
        """
        Initialize access control service
        
        Args:
            device_ip: IP address of devicebroker API (optional, reads from DB if not provided)
            device_port: Port of devicebroker API (optional, reads from DB if not provided)
            device_id: Device ID to filter (optional, reads from DB if not provided)
        """
        self.client = None
        
        # Try to load from database config if not provided
        if device_ip is None or device_port is None:
            config = self._get_active_config()
            if config:
                self.device_ip = device_ip or config.device_ip
                self.device_port = device_port or config.device_port
                self.device_id = device_id or config.device_id or 'C202504083'
                self.connection_timeout = getattr(config, 'connection_timeout', 30)
            else:
                # Fallback to defaults
                self.device_ip = device_ip or '127.0.0.1'
                self.device_port = device_port or 5005
                self.device_id = device_id or 'C202504083'
                self.connection_timeout = 30
        else:
            self.device_ip = device_ip
            self.device_port = device_port
            self.device_id = device_id or 'C202504083'
            self.connection_timeout = 30
        
        # Devicebroker address for SDK
        self.devicebroker_address = f"{self.device_ip}:{self.device_port}"
        
        if not SDK_AVAILABLE:
            print("Warning: Access control SDK not available, running in mock mode")
    
    def _get_active_config(self):
        """Get active access control configuration from database"""
        try:
            from ..models import AccessControlConfig
            return AccessControlConfig.get_active_config()
        except Exception as e:
            print(f"Error loading config from database: {e}")
            return None
    
    def connect(self) -> bool:
        """Connect to access control device"""
        if not SDK_AVAILABLE:
            return False
        
        try:
            address = f"{self.device_ip}:{self.device_port}"
            self.client = Client(address)
            return True
        except Exception as e:
            print(f"Failed to connect to access control device: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from access control device"""
        if self.client:
            try:
                self.client.close()
            except:
                pass
            self.client = None
    
    def test_connection(self) -> Dict[str, Any]:
        """Test connection to access control device - returns device info"""
        if not SDK_AVAILABLE:
            return {
                'success': False,
                'error': 'SDK nem elérhető.'
            }
        
        try:
            # Connect to devicebroker
            broker_address = f"{self.device_ip}:{self.device_port}"
            broker_client = Client(broker_address)
            
            devices = broker_client.get_all_online_devices()
            
            # Filter by device_id if specified
            if self.device_id:
                target_device = None
                for dev in devices:
                    if dev.get('device_id') == self.device_id:
                        target_device = dev
                        break
                
                if not target_device:
                    broker_client.close()
                    return {
                        'success': False,
                        'error': f'Eszköz {self.device_id} nem található az online eszközök között'
                    }
                
                devices = [target_device]
            
            if not devices:
                broker_client.close()
                return {
                    'success': False,
                    'error': 'Nincs online eszköz'
                }
            
            device = devices[0]
            
            # Query device info
            info_result = broker_client.device_info_query(device['device_id'])
            
            broker_client.close()
            
            if info_result and 'terminal_type' in info_result:
                return {
                    'success': True,
                    'device_info': {
                        'terminal_type': info_result.get('terminal_type'),
                        'product_name': info_result.get('product_name'),
                        'machine_id': info_result.get('machine_id'),
                        'language': info_result.get('language')
                    }
                }
            else:
                return {
                    'success': False,
                    'error': 'Eszköz információ lekérdezése sikertelen'
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': f'Kapcsolódási hiba: {str(e)}'
            }
