from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MaterialTypeViewSet, MaterialViewSet, WarehouseViewSet, 
    ShelfViewSet, MaterialSupplierViewSet, InventoryViewSet, 
    MaterialReceiptViewSet
)

router = DefaultRouter()
router.register(r'material-types', MaterialTypeViewSet)
router.register(r'materials', MaterialViewSet)
router.register(r'warehouses', WarehouseViewSet)
router.register(r'shelves', ShelfViewSet)
router.register(r'material-suppliers', MaterialSupplierViewSet)
router.register(r'inventory', InventoryViewSet)
router.register(r'receipts', MaterialReceiptViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
