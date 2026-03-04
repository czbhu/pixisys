from django.urls import path, include
from rest_framework.routers import DefaultRouter
from invoices.views.views import (
    CustomerViewSet, InvoiceViewSet, InvoiceItemViewSet, NAVConfigurationViewSet, ContactViewSet,
    CompanyViewSet, SystemUserViewSet, RoleViewSet, InvoiceBlockViewSet, CompanyNAVConfigurationViewSet, CustomerBankAccountViewSet, CompanyBankAccountViewSet, VATTypeViewSet, BankStatementViewSet, ProformaViewSet,
    CompanyEmailSettingsViewSet, EmailTemplateViewSet, EmailSignatureViewSet, PaymentBatchViewSet, ApiAccessViewSet, APIClientViewSet, IncomingDocumentViewSet,
    CashRegisterViewSet, CashRegisterTransactionViewSet, CronJobConfigurationViewSet,
    BackupConfigurationViewSet, BackupFileViewSet, CurrencyViewSet, IncomingProformaViewSet
)
from invoices.views.nav_api_views import token_exchange, test_nav_connection, lookup_taxpayer, get_exchange_rate
from invoices.views.import_views import import_customers, import_customers_streaming, import_contacts, import_contacts_streaming, export_customer_sample_csv, export_contact_sample_csv, export_missing_customers_csv, import_suppliers_from_invoices, import_suppliers_from_invoices_streaming
from invoices.auth_views import login_view, password_reset_request_view, password_reset_confirm_view, sso_login_view
from invoices.backup_views import export_database_view, import_database_view
from invoices.views_emergency import emergency_login_view
from invoices.views.erp_webhook import ERPWebhookTestView
from invoices.views.audit_export_views import nav_audit_export

router = DefaultRouter(trailing_slash=True)
router.register(r'customers', CustomerViewSet)
router.register(r'currencies', CurrencyViewSet)
router.register(r'invoices', InvoiceViewSet)
router.register(r'invoice-items', InvoiceItemViewSet)
router.register(r'nav-configurations', NAVConfigurationViewSet)
router.register(r'contacts', ContactViewSet)
router.register(r'companies', CompanyViewSet)
router.register(r'system-users', SystemUserViewSet)
router.register(r'roles', RoleViewSet)
router.register(r'invoice-blocks', InvoiceBlockViewSet)
router.register(r'company-nav-configurations', CompanyNAVConfigurationViewSet)
router.register(r'company-email-settings', CompanyEmailSettingsViewSet)
router.register(r'email-templates', EmailTemplateViewSet)
router.register(r'email-signatures', EmailSignatureViewSet)
router.register(r'customer-bank-accounts', CustomerBankAccountViewSet)
router.register(r'company-bank-accounts', CompanyBankAccountViewSet)
router.register(r'vat-types', VATTypeViewSet)
router.register(r'bank-statements', BankStatementViewSet)
router.register(r'cash-registers', CashRegisterViewSet)
router.register(r'cash-register-transactions', CashRegisterTransactionViewSet)
router.register(r'cron-jobs', CronJobConfigurationViewSet)
router.register(r'proformas', ProformaViewSet)
router.register(r'payment-batches', PaymentBatchViewSet)
router.register(r'api-clients', APIClientViewSet, basename='api-client')
router.register(r'incoming-documents', IncomingDocumentViewSet)
router.register(r'incoming-proformas', IncomingProformaViewSet, basename='incoming-proforma')
router.register(r'backup-configs', BackupConfigurationViewSet, basename='backup-config')
router.register(r'backup-files', BackupFileViewSet, basename='backup-file')

urlpatterns = [
    path('api/auth/login/', login_view, name='login'),
    path('api/auth/emergency-login/', emergency_login_view, name='emergency_login'),
    path('api/auth/sso-login/', sso_login_view, name='sso_login'),
    path('api/auth/password-reset/', password_reset_request_view, name='password_reset'),
    path('api/auth/password-reset/confirm/', password_reset_confirm_view, name='password_reset_confirm'),
    path('api/backup/export/', export_database_view, name='export_database'),
    path('api/backup/import/', import_database_view, name='import_database'),
    path('api/customers/token_exchange/', token_exchange, name='token_exchange'),
    path('api/customers/test_nav_connection/', test_nav_connection, name='test_nav_connection'),
    path('api/customers/lookup_taxpayer/', lookup_taxpayer, name='lookup_taxpayer'),
    path('api/utils/exchange_rate/', get_exchange_rate, name='get_exchange_rate'),
    path('api/nav-audit-export/', nav_audit_export, name='nav_audit_export'),
    path('api/import/customers/', import_customers, name='import_customers'),
    path('api/import/customers/streaming/', import_customers_streaming, name='import_customers_streaming'),
    path('api/import/contacts/', import_contacts, name='import_contacts'),
    path('api/import/contacts/streaming/', import_contacts_streaming, name='import_contacts_streaming'),
    path('api/import/sample/customers/', export_customer_sample_csv, name='export_customer_sample_csv'),
    path('api/import/sample/contacts/', export_contact_sample_csv, name='export_contact_sample_csv'),
    path('api/import/missing-customers/export/', export_missing_customers_csv, name='export_missing_customers_csv'),
    path('api/import/suppliers-from-invoices/', import_suppliers_from_invoices, name='import_suppliers_from_invoices'),
    path('api/import/suppliers-from-invoices/streaming/', import_suppliers_from_invoices_streaming, name='import_suppliers_from_invoices_streaming'),
    path('api/erp/webhook-test/', ERPWebhookTestView.as_view(), name='erp_webhook_test'),
    path('api/', include(router.urls)),
    path('api/api-access/', ApiAccessViewSet.as_view({'get': 'get', 'put': 'save'})),
]
