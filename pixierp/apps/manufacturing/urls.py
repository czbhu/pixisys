from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProductClassViewSet, ProjectViewSet, ManufacturingProductViewSet, CurrencyViewSet

router = DefaultRouter()
router.register(r'product-classes', ProductClassViewSet)
router.register(r'projects', ProjectViewSet)
router.register(r'products', ManufacturingProductViewSet)
router.register(r'currencies', CurrencyViewSet)

urlpatterns = [
    path('', include(router.urls)),
]