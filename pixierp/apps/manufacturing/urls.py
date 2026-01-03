from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductClassViewSet, ProjectViewSet, ManufacturingProductViewSet, 
    CurrencyViewSet, ServiceViewSet, CalculatorTemplateViewSet, CalculationViewSet
)

router = DefaultRouter()
router.register(r'product-classes', ProductClassViewSet)
router.register(r'projects', ProjectViewSet)
router.register(r'products', ManufacturingProductViewSet)
router.register(r'currencies', CurrencyViewSet)
router.register(r'services', ServiceViewSet)
router.register(r'calculator-templates', CalculatorTemplateViewSet)
router.register(r'calculations', CalculationViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
