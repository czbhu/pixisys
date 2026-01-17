import threading

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Contact

_local = threading.local()


def _should_run():
    return not getattr(_local, 'running', False)


def _run_contact_sync():
    """Trigger contact-only PixInvoice sync when continuous mode is enabled."""
    try:
        from apps.core.models import PixinvoiceConfig
        from apps.finance.views import _sync_pixinvoice

        cfg = PixinvoiceConfig.objects.filter(is_active=True).order_by('-updated_at').first()
        if not cfg:
            return
        settings = cfg.sync_settings or {}
        if settings.get('frequency') != 'continuous':
            return

        strategy = settings.get('strategy') or {'type': settings.get('strategy_type') or 'newer'}
        payload = {
            'entities': ['contacts'],
            'strategy': strategy,
            'strategy_type': strategy.get('type'),
            'company_mappings': settings.get('company_mappings') or [],
        }

        _local.running = True
        try:
            _sync_pixinvoice(payload)
        finally:
            _local.running = False
    except Exception:
        # Swallow to avoid breaking save/delete; errors should surface in logs from _sync_pixinvoice.
        _local.running = False
        return


@receiver(post_save, sender=Contact)
def contact_saved(sender, **kwargs):
    if _should_run():
        _run_contact_sync()


@receiver(post_delete, sender=Contact)
def contact_deleted(sender, **kwargs):
    if _should_run():
        _run_contact_sync()
