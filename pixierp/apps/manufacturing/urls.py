from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductClassViewSet, ProjectViewSet, ManufacturingProductViewSet, 
    CurrencyViewSet, ServiceViewSet, ServiceGroupViewSet, CalculatorTemplateViewSet, 
    CalculationViewSet, ServiceSupplierPriceViewSet, ServiceCostItemViewSet,
    ProductTemplateViewSet, ManufacturingCostItemViewSet,
)

router = DefaultRouter()
router.register(r'product-classes', ProductClassViewSet)
router.register(r'projects', ProjectViewSet)
router.register(r'products', ManufacturingProductViewSet)
router.register(r'currencies', CurrencyViewSet)
router.register(r'service-groups', ServiceGroupViewSet)
router.register(r'services', ServiceViewSet)
router.register(r'calculator-templates', CalculatorTemplateViewSet)
router.register(r'calculations', CalculationViewSet)
router.register(r'service-supplier-prices', ServiceSupplierPriceViewSet)
router.register(r'service-cost-items', ServiceCostItemViewSet)
router.register(r'product-templates', ProductTemplateViewSet, basename='product-template')
router.register(r'cost-items', ManufacturingCostItemViewSet, basename='manufacturing-cost-item')

urlpatterns = [
    path('', include(router.urls)),
]