from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MaterialTypeViewSet, MaterialGroupViewSet, MaterialViewSet, WarehouseViewSet, 
    ShelfViewSet, MaterialSupplierViewSet, InventoryViewSet, 
    MaterialCostItemViewSet, MaterialSizeViewSet,
    MaterialStockViewSet, MaterialReceiptViewSet, StockMovementViewSet,
    MaterialReceiptBatchViewSet,
    SupplierInvoiceViewSet, InvoiceItemViewSet,
    ScrapRecordViewSet, ScrapItemViewSet,
    VATTypeProxyViewSet, MaterialRemnantViewSet,
    MaterialGroupApiSyncViewSet, PublicProductCatalogView, PublicProductVariantsView,
    MaterialVariantViewSet, PublicShopIndexView, MaterialBarcodeViewSet,
    StocktakeViewSet,
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
router.register(r'material-receipt-batches', MaterialReceiptBatchViewSet, basename='material-receipt-batch')
router.register(r'stock-movements', StockMovementViewSet)
router.register(r'supplier-invoices', SupplierInvoiceViewSet)
router.register(r'invoice-items', InvoiceItemViewSet)
router.register(r'scrap-records', ScrapRecordViewSet)
router.register(r'scrap-items', ScrapItemViewSet)
router.register(r'vat-types', VATTypeProxyViewSet, basename='vat-type')
router.register(r'material-remnants', MaterialRemnantViewSet, basename='material-remnant')
router.register(r'material-group-api-syncs', MaterialGroupApiSyncViewSet, basename='material-group-api-sync')
router.register(r'material-variants', MaterialVariantViewSet, basename='material-variant')
router.register(r'material-barcodes', MaterialBarcodeViewSet, basename='material-barcode')
router.register(r'stocktakes', StocktakeViewSet, basename='stocktake')

urlpatterns = [
    path('', include(router.urls)),
    path('public-shop/', PublicShopIndexView.as_view(), name='public-shop-index'),
    path('public-catalog/<slug:slug>/', PublicProductCatalogView.as_view(), name='public-catalog'),
    path('public-catalog/<slug:slug>/variants/<int:material_id>/', PublicProductVariantsView.as_view(), name='public-variants'),
]