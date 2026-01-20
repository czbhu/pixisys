
import sys

class DebugMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        try:
            print(f"[Debug] Scope Type: {scope['type']} Path: {scope.get('path')}", flush=True)
            if scope['type'] == 'websocket':
                print(f"[Debug] Headers: {scope.get('headers')}", flush=True)
        except Exception as e:
            print(f"[Debug] Error: {e}", flush=True)
            
        return await self.app(scope, receive, send)
