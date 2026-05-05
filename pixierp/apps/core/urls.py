from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views_emergency import emergency_login_view

router = DefaultRouter()
router.register(r'users', views.UserViewSet, basename='user')
router.register(r'companies', views.CompanyViewSet, basename='company')
router.register(r'bank-accounts', views.BankAccountViewSet, basename='bank-account')
router.register(r'pixinvoice-configs', views.PixinvoiceConfigViewSet, basename='pixinvoice-config')
router.register(r'backup-configs', views.BackupConfigurationViewSet, basename='backup-config')
router.register(r'backup-files', views.BackupFileViewSet, basename='backup-file')
router.register(r'user-preferences', views.UserPreferenceViewSet, basename='user-preference')
router.register(r'roles', views.RoleViewSet, basename='role')
router.register(r'permissions', views.PermissionViewSet, basename='permission')
router.register(r'user-roles', views.UserRoleViewSet, basename='user-role')
router.register(r'notifications', views.NotificationViewSet, basename='notification')
router.register(r'hestia-configs', views.HestiaConfigViewSet, basename='hestia-config')
router.register(r'email-templates', views.EmailTemplateViewSet, basename='email-template')
router.register(r'signature-templates', views.SignatureTemplateViewSet, basename='signature-template')
router.register(r'zones', views.ZoneViewSet, basename='zone')
router.register(r'iot-devices', views.IoTDeviceViewSet, basename='iot-device')
router.register(r'nfc-tags', views.NfcTagViewSet, basename='nfc-tag')
router.register(r'activity-logs', views.ActivityLogViewSet, basename='activity-log')
router.register(r'ticket-topics', views.TicketTopicViewSet, basename='ticket-topic')
router.register(r'ticket-types', views.TicketTypeViewSet, basename='ticket-type')
router.register(r'client-portal-users', views.ClientPortalUserViewSet, basename='client-portal-user')
router.register(r'site-features', views.SiteFeatureViewSet, basename='site-feature')
router.register(r'sales-sites', views.SalesSiteViewSet, basename='sales-site')
router.register(r'tickets', views.TicketViewSet, basename='ticket')
router.register(r'storage/folders', views.StorageFolderViewSet, basename='storage-folder')
router.register(r'storage/files', views.StorageFileViewSet, basename='storage-file')
router.register(r'storage/shares', views.StorageShareViewSet, basename='storage-share')

urlpatterns = [
    path('health/', views.HealthCheckView.as_view(), name='health_check'),
    path('auth/login/', views.login_view, name='login'),
    path('auth/emergency-login/', emergency_login_view, name='emergency_login'),
    path('auth/register/', views.register_view, name='register'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/profile/', views.profile_view, name='profile'),
    path('auth/profile/update/', views.update_profile_view, name='update_profile'),
    path('auth/dev-switch-user/', views.dev_switch_user_view, name='dev_switch_user'),
    path('auth/token/refresh/', views.refresh_token_view, name='refresh_token'),
    path('auth/password-reset/', views.password_reset_request_view, name='password_reset_request'),
    path('auth/password-reset/confirm/', views.password_reset_confirm_view, name='password_reset_confirm'),
    path('auth/sso-token/', views.generate_sso_token_view, name='generate_sso_token'),
    path('auth/ui-preferences/', views.ui_preferences_view, name='ui_preferences'),
    path('auth/qr-login/create/', views.qr_login_create, name='qr_login_create'),
    path('auth/qr-login/poll/', views.qr_login_poll, name='qr_login_poll'),
    path('auth/qr-login/approve/', views.qr_login_approve, name='qr_login_approve'),
    path('currencies/update-rates/', views.update_exchange_rates_view, name='update_exchange_rates'),
    path('backup/export/', views.export_database_view, name='export_database'),
    path('backup/import/', views.import_database_view, name='import_database'),
    path('tickets/public/<uuid:token>/', views.PublicTicketView.as_view(), name='public-ticket-detail'),
    path('tickets/public/<uuid:token>/reply/', views.PublicTicketReplyView.as_view(), name='public-ticket-reply'),
    path('public-site/config/', views.PublicSiteConfigView.as_view(), name='public-site-config'),
    path('public-sites/resolve/', views.PublicSiteResolveView.as_view(), name='public-site-resolve'),
    path('public-site/portal/login/', views.ClientPortalLoginView.as_view(), name='client-portal-login'),
    path('public-site/portal/me/', views.ClientPortalMeView.as_view(), name='client-portal-me'),
    path('public-site/portal/logout/', views.ClientPortalLogoutView.as_view(), name='client-portal-logout'),
    path('public-site/portal/dashboard/', views.ClientPortalDashboardView.as_view(), name='client-portal-dashboard'),
    path('public-site/portal/tickets/', views.ClientPortalTicketCreateView.as_view(), name='client-portal-ticket-create'),
    path('', include(router.urls)),
    path('pixinvoice/test-connection/', views.PixinvoiceConfigViewSet.as_view({'post': 'test_connection'}), name='pixinvoice-test-connection'),
]