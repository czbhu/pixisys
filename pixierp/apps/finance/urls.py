from django.urls import path
from .views import SyncPixinvoiceView, PixinvoiceLookupTaxpayerView

urlpatterns = [
    path('sync/pixinvoice/', SyncPixinvoiceView.as_view(), name='finance-sync-pixinvoice'),
    path('pixinvoice/lookup-taxpayer/', PixinvoiceLookupTaxpayerView.as_view(), name='finance-pixinvoice-lookup-taxpayer'),
]
