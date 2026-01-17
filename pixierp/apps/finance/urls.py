from django.urls import path
from .views import SyncPixinvoiceView, PixinvoiceLookupTaxpayerView, PixinvoiceCompaniesImportView, PixinvoiceWebhookView

urlpatterns = [
    path('sync/pixinvoice/', SyncPixinvoiceView.as_view(), name='finance-sync-pixinvoice'),
    path('pixinvoice/companies/', PixinvoiceCompaniesImportView.as_view(), name='finance-pixinvoice-companies'),
    path('pixinvoice/companies/import/', PixinvoiceCompaniesImportView.as_view(), name='finance-pixinvoice-import-companies'),
    path('pixinvoice/webhook/', PixinvoiceWebhookView.as_view(), name='finance-pixinvoice-webhook'),
    path('pixinvoice/lookup-taxpayer/', PixinvoiceLookupTaxpayerView.as_view(), name='finance-pixinvoice-lookup-taxpayer'),
]
