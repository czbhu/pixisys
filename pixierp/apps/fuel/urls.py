from rest_framework.routers import DefaultRouter

from .views import (
    FuelGradeViewSet,
    FuelPumpViewSet,
    FuelPumpTotalsLogViewSet,
    FuelShiftViewSet,
    FuelStationConfigViewSet,
    FuelTransactionViewSet,
)

router = DefaultRouter()
router.register('config', FuelStationConfigViewSet, basename='fuel-config')
router.register('fuel-grades', FuelGradeViewSet, basename='fuel-grade')
router.register('pumps', FuelPumpViewSet, basename='fuel-pump')
router.register('transactions', FuelTransactionViewSet, basename='fuel-transaction')
router.register('totals-logs', FuelPumpTotalsLogViewSet, basename='fuel-totals-log')
router.register('shifts', FuelShiftViewSet, basename='fuel-shift')

urlpatterns = router.urls
