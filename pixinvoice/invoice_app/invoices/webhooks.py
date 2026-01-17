import logging
from typing import Any, Dict, Optional, Type

import requests
from django.conf import settings
from django.utils import timezone

from .models import Company, Customer, Contact
from .serializers import CompanySerializer, ContactSerializer, CustomerSerializer

logger = logging.getLogger(__name__)


def _get_webhook_config():
    url = getattr(settings, 'ERP_WEBHOOK_URL', '') or ''
    token = getattr(settings, 'ERP_WEBHOOK_TOKEN', '') or ''
    timeout = getattr(settings, 'ERP_WEBHOOK_TIMEOUT', 5)
    return url.strip(), token.strip(), timeout


def send_erp_webhook(event: str, payload: Dict[str, Any]) -> bool:
    """Send a webhook payload to the ERP if configuration is present."""
    url, token, timeout = _get_webhook_config()
    if not url:
        logger.debug("ERP webhook skipped: ERP_WEBHOOK_URL not configured")
        return False

    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f"Bearer {token}"

    body = {
        'event': event,
        'timestamp': timezone.now().isoformat(),
        'payload': payload,
    }

    try:
        resp = requests.post(url, json=body, headers=headers, timeout=timeout)
        resp.raise_for_status()
        return True
    except Exception as exc:  # pragma: no cover - log for observability
        logger.warning("ERP webhook send failed: %s", exc)
        return False


_SERIALIZER_MAP: Dict[Type[Any], Type[Any]] = {
    Customer: CustomerSerializer,
    Company: CompanySerializer,
    Contact: ContactSerializer,
}


def dispatch_model_event(instance: Any, action: str) -> bool:
    """Serialize the instance and emit a typed ERP webhook event."""
    serializer_cls = _SERIALIZER_MAP.get(instance.__class__)
    if not serializer_cls:
        logger.debug("ERP webhook skipped: unsupported model %s", instance.__class__.__name__)
        return False

    url, _, _ = _get_webhook_config()
    if not url:
        return False

    serializer = serializer_cls(instance)
    payload: Dict[str, Any] = {
        'model': instance.__class__.__name__.lower(),
        'action': action,
        'data': serializer.data,
    }
    company_id: Optional[str] = getattr(instance, 'company_id', None)
    if company_id:
        payload['company_id'] = str(company_id)

    event = f"{payload['model']}.{action}"
    return send_erp_webhook(event, payload)
