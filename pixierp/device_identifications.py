"""Global storage for device identifications"""
import threading
from datetime import datetime

latest_identifications = {}
identification_lock = threading.Lock()

def add_identification(device_sn, user_id, time_str):
    with identification_lock:
        if device_sn not in latest_identifications:
            latest_identifications[device_sn] = []
        latest_identifications[device_sn].append({
            'user_id': user_id,
            'time': time_str,
            'timestamp': datetime.now().timestamp()
        })
        latest_identifications[device_sn] = latest_identifications[device_sn][-10:]

def get_latest_identification(device_sn, since_timestamp):
    with identification_lock:
        for log in reversed(latest_identifications.get(device_sn, [])):
            if log['timestamp'] > since_timestamp:
                return log
    return None
