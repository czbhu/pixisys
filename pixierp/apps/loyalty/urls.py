from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('config', views.LoyaltyConfigViewSet, basename='loyalty-config')
router.register('points', views.LoyaltyPointEntryViewSet, basename='loyalty-points')
router.register('fuel-cards', views.FuelCardViewSet, basename='loyalty-fuel-card')
router.register('fuel-card-transactions', views.FuelCardTransactionViewSet, basename='loyalty-fuel-card-tx')
router.register('discounts', views.CustomerProductDiscountViewSet, basename='loyalty-discount')

urlpatterns = router.urls + [
    path('portal/summary/', views.PortalLoyaltySummaryView.as_view(), name='portal-loyalty-summary'),
    path('portal/qrcode/', views.PortalLoyaltyQrView.as_view(), name='portal-loyalty-qr'),
    path('portal/purchases/', views.PortalLoyaltyPurchasesView.as_view(), name='portal-loyalty-purchases'),
    path('portal/purchases/<int:transaction_id>/receipt/', views.PortalLoyaltyReceiptView.as_view(), name='portal-loyalty-receipt'),
]
