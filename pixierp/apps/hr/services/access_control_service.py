"""
Access Control Service - Integration with access control hardware via WebSocket
"""
import sys
import os
import json
import websocket
from datetime import datetime, date, time, timedelta
from typing import Optional, List, Dict, Any
from django.db import transaction
from django.utils import timezone

SDK_AVAILABLE = True  # We use websocket-client library


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
        """Test connection to access control device - check if devicebroker is accessible"""
        try:
            # Simple WebSocket connection test to devicebroker
            ws_url = f"ws://{self.device_ip}:{self.device_port}"
            ws = websocket.create_connection(ws_url, timeout=5)
            ws.close()
            
            # If we can connect to devicebroker, consider it successful
            return {
                'success': True,
                'device_info': {
                    'terminal_type': 'Access Control Device',
                    'product_name': f'Device {self.device_id}',
                    'machine_id': self.device_id or 'Unknown',
                    'language': 'N/A'
                }
            }
                
        except websocket.WebSocketTimeoutException:
            return {
                'success': False,
                'error': f'Timeout - DeviceBroker nem válaszol ({self.device_ip}:{self.device_port})'
            }
        except websocket.WebSocketConnectionClosedException:
            return {
                'success': False,
                'error': 'WebSocket kapcsolat váratlanul bezárult'
            }
        except ConnectionRefusedError:
            return {
                'success': False,
                'error': f'Kapcsolódás elutasítva - DeviceBroker nem fut ({self.device_ip}:{self.device_port})'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Kapcsolódási hiba: {str(e)}'
            }
