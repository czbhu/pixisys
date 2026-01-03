"""
WSGI config for erp_system project.
"""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')

_django_app = get_wsgi_application()

# Wrapper to handle device webhooks BEFORE Django routing
def application(environ, start_response):
    path = environ.get('PATH_INFO', '')
    
    if path == '/device/check_login':
        start_response('200 OK', [('Content-Type', 'application/json')])
        return [b'{"status": "ok"}']
    
    elif path == '/device/upload_log':
        try:
            import json
            import device_identifications
            from io import BytesIO
            
            # Read request body
            content_length = int(environ.get('CONTENT_LENGTH', 0) or 0)
            body = environ['wsgi.input'].read(content_length)
            data = json.loads(body)
            
            # Parse query string for event type
            query_string = environ.get('QUERY_STRING', '')
            event_type = ''
            for param in query_string.split('&'):
                if param.startswith('type='):
                    event_type = param.split('=', 1)[1]
            
            if 'TimeLog' in event_type and 'UserID' in data:
                user_id = int(data['UserID'])
                device_sn = data.get('SN', 'C202504083')
                time_str = data.get('Time', '')
                device_identifications.add_identification(device_sn, user_id, time_str)
            
            start_response('200 OK', [('Content-Type', 'application/json')])
            return [b'{"status": "ok"}']
        except Exception as e:
            start_response('500 Internal Server Error', [('Content-Type', 'application/json')])
            return [json.dumps({'status': 'error', 'message': str(e)}).encode()]
    
    # Not a device webhook, pass to Django
    return _django_app(environ, start_response)
