"""
Signal handlers for tracking activity on Sales models
"""
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.contenttypes.models import ContentType
from apps.core.models import ActivityLog
from .models import QuoteRequest, CustomerOrder


def get_client_ip(request):
    """Extract client IP from request"""
    if not request:
        return None
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def log_activity(user, action, description, obj=None, changes=None, request=None):
    """Helper function to create activity log entries"""
    content_type = None
    object_id = None
    
    if obj:
        content_type = ContentType.objects.get_for_model(obj)
        object_id = obj.pk
    
    ip_address = get_client_ip(request) if request else None
    user_agent = request.META.get('HTTP_USER_AGENT', '') if request else ''
    
    ActivityLog.objects.create(
        user=user,
        action=action,
        description=description,
        content_type=content_type,
        object_id=object_id,
        changes=changes,
        ip_address=ip_address,
        user_agent=user_agent
    )


@receiver(post_save, sender=QuoteRequest)
def log_quote_request_save(sender, instance, created, **kwargs):
    """Log QuoteRequest creation and updates"""
    ref = instance.number or instance.request_number or str(instance.pk)
    if created:
        description = f"Ajánlatkérés létrehozva: {ref}"
        action = 'create'
    else:
        description = f"Ajánlatkérés módosítva: {ref}"
        action = 'update'
    
    # Try to get user from instance if available (set by view)
    user = getattr(instance, '_log_user', None)
    
    if user:
        log_activity(
            user=user,
            action=action,
            description=description,
            obj=instance,
            request=getattr(instance, '_log_request', None)
        )


@receiver(post_delete, sender=QuoteRequest)
def log_quote_request_delete(sender, instance, **kwargs):
    """Log QuoteRequest deletion"""
    user = getattr(instance, '_log_user', None)
    
    if user:
        ref = instance.number or instance.request_number or str(instance.pk)
        description = f"Ajánlatkérés törölve: {ref}"
        log_activity(
            user=user,
            action='delete',
            description=description,
            obj=None,  # Object is deleted, so we don't link it
            request=getattr(instance, '_log_request', None)
        )


@receiver(post_save, sender=CustomerOrder)
def log_customer_order_save(sender, instance, created, **kwargs):
    """Log CustomerOrder creation and updates"""
    if created:
        description = f"Megrendelés létrehozva: {instance.order_number}"
        action = 'create'
    else:
        description = f"Megrendelés módosítva: {instance.order_number}"
        action = 'update'
    
    user = getattr(instance, '_log_user', None)
    
    if user:
        log_activity(
            user=user,
            action=action,
            description=description,
            obj=instance,
            request=getattr(instance, '_log_request', None)
        )


@receiver(post_delete, sender=CustomerOrder)
def log_customer_order_delete(sender, instance, **kwargs):
    """Log CustomerOrder deletion"""
    user = getattr(instance, '_log_user', None)
    
    if user:
        description = f"Megrendelés törölve: {instance.order_number}"
        log_activity(
            user=user,
            action='delete',
            description=description,
            obj=None,
            request=getattr(instance, '_log_request', None)
        )
