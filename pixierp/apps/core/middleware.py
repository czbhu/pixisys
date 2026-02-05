import datetime
from django.core.cache import cache
from django.conf import settings

class ActiveUserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Defensive check for user attribute
        if hasattr(request, 'user') and request.user.is_authenticated:
            try:
                now = datetime.datetime.now()
                # Cache key: seen_user_{user_id}
                key = f'seen_user_{request.user.id}'
                cache.set(key, now, 300) # 5 minutes
                # print(f"[Debug] Set cache for user {request.user.id}: {key}")
            except Exception:
                # Do not crash the application if cache is down or other error
                pass

        response = self.get_response(request)
        return response
