"""
URL configuration for erp_system project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from rest_framework import routers
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from apps.core.views import EmailServerConfigViewSet, EmailTemplateViewSet, SignatureTemplateViewSet, PixinvoiceConfigViewSet, UserPreferenceViewSet, NotificationViewSet
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json

# Import device webhook views from HR app
from apps.hr.views import check_device_login, check_device_registration

# Device upload log view (inline for backwards compatibility)
@csrf_exempt
def device_upload_log_view(request):
    try:
        import device_identifications
        data = json.loads(request.body)
        event_type = request.GET.get('type', '')
        
        if 'TimeLog' in event_type and 'UserID' in data:
            user_id = int(data['UserID'])
            device_sn = data.get('SN', 'C202504083')
            time_str = data.get('Time', '')
            device_identifications.add_identification(device_sn, user_id, time_str)
        
        return JsonResponse({'status': 'ok'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

# API Router
router = routers.DefaultRouter()
router.register(r'core/email-servers', EmailServerConfigViewSet, basename='email-servers')
router.register(r'core/email-templates', EmailTemplateViewSet, basename='email-templates')
router.register(r'core/signature-templates', SignatureTemplateViewSet, basename='signature-templates')
router.register(r'core/pixinvoice-configs', PixinvoiceConfigViewSet, basename='pixinvoice-configs')
router.register(r'core/user-preferences', UserPreferenceViewSet, basename='core-user-preferences')
router.register(r'core/notifications', NotificationViewSet, basename='core-notifications')

urlpatterns = [
    # Device webhooks FIRST (must be before other patterns)
    path('device/check_login', check_device_login, name='device_check_login'),
    path('device/check_registration', check_device_registration, name='device_check_registration'),
    path('device/upload_log', device_upload_log_view),
    # JWT Auth
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # Regular routes
    path('admin/', admin.site.urls),
    path('api/v1/', include(router.urls)),
    path('api/v1/', include('apps.core.urls')),
    path('api/v1/hr/', include('apps.hr.urls')),
    path('api/v1/sales/', include('apps.sales.urls')),
    path('api/v1/manufacturing/', include('apps.manufacturing.urls')),
    path('api/v1/finance/', include('apps.finance.urls')),
    path('api/v1/crm/', include('apps.crm.urls')),
    path('api/v1/orders/', include('apps.orders.urls')),
    path('api/v1/pos/', include('apps.pos.urls')),
    path('api/v1/warehouse/', include('apps.warehouse.urls')),
]

# Serve media files (always for development/testing with Daphne)
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {
        'document_root': settings.MEDIA_ROOT,
    }),
]
if settings.STATIC_ROOT:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
