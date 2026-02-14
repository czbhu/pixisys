from django.apps import AppConfig


class SalesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.sales'
    verbose_name = 'Értékesítés'

    def ready(self):
        # Import signals to register them
        import apps.sales.signals
