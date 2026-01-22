from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from urllib.parse import parse_qs

User = get_user_model()

@database_sync_to_async
def get_user(token):
    try:
        user_id = token["user_id"]
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()

class JwtAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        # Parse query string
        query_string = scope.get("query_string", b"").decode("utf-8")
        query_params = parse_qs(query_string)
        token = query_params.get("token", [None])[0]

        if token:
            try:
                # Verify and decode token using SimpleJWT's AccessToken logic
                access_token = AccessToken(token)
                scope["user"] = await get_user(access_token)
            except (InvalidToken, TokenError) as e:
                print(f"WS Token Error: {e}")
                # Don't overwrite if AuthMiddlewareStack already found a user? 
                # Actually, JWT usually takes precedence if present.
                scope["user"] = AnonymousUser()
        
        return await self.app(scope, receive, send)
