from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'pixinvoice-configs', views.PixinvoiceConfigViewSet, basename='pixinvoice-config')

urlpatterns = [
    path('health/', views.HealthCheckView.as_view(), name='health_check'),
    path('auth/login/', views.login_view, name='login'),
    path('auth/register/', views.register_view, name='register'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/profile/', views.profile_view, name='profile'),
    path('auth/profile/update/', views.update_profile_view, name='update_profile'),
    path('auth/token/refresh/', views.refresh_token_view, name='refresh_token'),
    path('auth/password-reset/', views.password_reset_request_view, name='password_reset_request'),
    path('auth/password-reset/confirm/', views.password_reset_confirm_view, name='password_reset_confirm'),
    path('auth/sso-token/', views.generate_sso_token_view, name='generate_sso_token'),
    path('currencies/update-rates/', views.update_exchange_rates_view, name='update_exchange_rates'),
    path('backup/export/', views.export_database_view, name='export_database'),
    path('backup/import/', views.import_database_view, name='import_database'),
    path('', include(router.urls)),
    path('pixinvoice/test-connection/', views.PixinvoiceConfigViewSet.as_view({'post': 'test_connection'}), name='pixinvoice-test-connection'),
]