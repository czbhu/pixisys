from django.apps import AppConfig


class CrmConfig(AppConfig):
    name = 'apps.crm'
    verbose_name = 'CRM'

    def ready(self):
        # Import signals to wire up PixInvoice continuous sync for contacts
        from . import signals  # noqa: F401
