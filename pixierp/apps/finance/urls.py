from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SyncPixinvoiceView, PixinvoiceLookupTaxpayerView, PixinvoiceCompaniesImportView, 
    PixinvoiceWebhookView, CashRegisterViewSet, CashRegisterEmployeeViewSet,
    CashRegisterTransactionViewSet, CashTransactionReasonViewSet
)

router = DefaultRouter()
router.register(r'cash-registers', CashRegisterViewSet, basename='cash-register')
router.register(r'cash-register-employees', CashRegisterEmployeeViewSet, basename='cash-register-employee')
router.register(r'cash-transactions', CashRegisterTransactionViewSet, basename='cash-transaction')
router.register(r'cash-transaction-reasons', CashTransactionReasonViewSet, basename='cash-transaction-reason')

urlpatterns = [
    path('sync/pixinvoice/', SyncPixinvoiceView.as_view(), name='finance-sync-pixinvoice'),
    path('pixinvoice/companies/', PixinvoiceCompaniesImportView.as_view(), name='finance-pixinvoice-companies'),
    path('pixinvoice/companies/import/', PixinvoiceCompaniesImportView.as_view(), name='finance-pixinvoice-import-companies'),
    path('pixinvoice/webhook/', PixinvoiceWebhookView.as_view(), name='finance-pixinvoice-webhook'),
    path('pixinvoice/lookup-taxpayer/', PixinvoiceLookupTaxpayerView.as_view(), name='finance-pixinvoice-lookup-taxpayer'),
    path('', include(router.urls)),
]

