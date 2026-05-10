from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MaterialTypeViewSet, MaterialGroupViewSet, MaterialViewSet, WarehouseViewSet, 
    ShelfViewSet, MaterialSupplierViewSet, InventoryViewSet, 
    MaterialCostItemViewSet, MaterialSizeViewSet,
    MaterialStockViewSet, MaterialReceiptViewSet, StockMovementViewSet,
    SupplierInvoiceViewSet, InvoiceItemViewSet,
    ScrapRecordViewSet, ScrapItemViewSet,
    VATTypeProxyViewSet, MaterialRemnantViewSet
)

router = DefaultRouter()
router.register(r'material-types', MaterialTypeViewSet)
router.register(r'material-groups', MaterialGroupViewSet)
router.register(r'materials', MaterialViewSet)
router.register(r'warehouses', WarehouseViewSet)
router.register(r'shelves', ShelfViewSet)
router.register(r'material-suppliers', MaterialSupplierViewSet)
router.register(r'inventory', InventoryViewSet)
router.register(r'material-cost-items', MaterialCostItemViewSet)
router.register(r'material-sizes', MaterialSizeViewSet)
router.register(r'material-stocks', MaterialStockViewSet)
router.register(r'material-receipts', MaterialReceiptViewSet)
router.register(r'stock-movements', StockMovementViewSet)
router.register(r'supplier-invoices', SupplierInvoiceViewSet)
router.register(r'invoice-items', InvoiceItemViewSet)
router.register(r'scrap-records', ScrapRecordViewSet)
router.register(r'scrap-items', ScrapItemViewSet)
router.register(r'vat-types', VATTypeProxyViewSet, basename='vat-type')
router.register(r'material-remnants', MaterialRemnantViewSet, basename='material-remnant')

urlpatterns = [
    path('', include(router.urls)),
]