from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Company, Contact, Customer
from .webhooks import dispatch_model_event


def _send(instance, action):
    try:
        dispatch_model_event(instance, action)
    except Exception:
        # Avoid breaking the main request path if webhook send fails
        pass


@receiver(post_save, sender=Customer)
def customer_saved(sender, instance: Customer, created: bool, **kwargs):
    _send(instance, 'created' if created else 'updated')


@receiver(post_delete, sender=Customer)
def customer_deleted(sender, instance: Customer, **kwargs):
    _send(instance, 'deleted')


@receiver(post_save, sender=Company)
def company_saved(sender, instance: Company, created: bool, **kwargs):
    _send(instance, 'created' if created else 'updated')


@receiver(post_delete, sender=Company)
def company_deleted(sender, instance: Company, **kwargs):
    _send(instance, 'deleted')


@receiver(post_save, sender=Contact)
def contact_saved(sender, instance: Contact, created: bool, **kwargs):
    _send(instance, 'created' if created else 'updated')


@receiver(post_delete, sender=Contact)
def contact_deleted(sender, instance: Contact, **kwargs):
    _send(instance, 'deleted')
