from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import analytics_views

router = DefaultRouter()
router.register(r'departments', views.DepartmentViewSet)
router.register(r'positions', views.PositionViewSet)
router.register(r'task-configurations', views.TaskConfigurationViewSet)
router.register(r'employees', views.EmployeeViewSet)
router.register(r'attendances', views.AttendanceViewSet)
router.register(r'attendance-reports', views.AttendanceReportViewSet, basename='attendance-report')
router.register(r'leave-requests', views.LeaveRequestViewSet)
router.register(r'payrolls', views.PayrollViewSet)
router.register(r'access-control-configs', views.AccessControlConfigViewSet)

# Analytics endpoints
router.register(r'analytics', analytics_views.EmployeeAnalyticsViewSet, basename='employee-analytics')
router.register(r'time-logs', analytics_views.TimeLogViewSet)
router.register(r'access-logs', analytics_views.AccessLogViewSet)
router.register(r'project-participations', analytics_views.ProjectParticipationViewSet)
router.register(r'attendance-kiosk-config', views.AttendanceKioskConfigViewSet)
router.register(r'kiosk-devices', views.KioskDeviceViewSet)

urlpatterns = [
    path('', include(router.urls)),
    # Device webhook endpoints for devicebroker
    path('device/check_login', views.check_device_login, name='check_device_login'),
    path('device/check_registration', views.check_device_registration, name='check_device_registration'),
    path('device/keepalive', views.device_keepalive, name='device_keepalive'),
]
