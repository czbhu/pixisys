"""Simple middleware to handle device webhook requests"""
from django.http import JsonResponse
import json
import device_identifications

class DeviceWebhookMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        if request.path == '/device/check_login':
            return JsonResponse({'status': 'ok'}, status=200)
        
        elif request.path == '/device/upload_log':
            try:
                data = json.loads(request.body)
                event_type = request.GET.get('type', '')
                
                if 'TimeLog' in event_type and 'UserID' in data:
                    user_id = int(data['UserID'])
                    device_sn = data.get('SN', 'C202504083')
                    time_str = data.get('Time', '')
                    device_identifications.add_identification(device_sn, user_id, time_str)
                
                return JsonResponse({'status': 'ok'}, status=200)
            except Exception as e:
                return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
        
        return self.get_response(request)
