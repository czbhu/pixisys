"""Ár-láthatóság az RFQ/rendelés felületeken.

Aki nem superuser és nincs sales.rfqs view/manage jogosultsága (a gyártói
felhasználók), az a butított RFQ adatlapot kapja: a serializer kihagyja az
ármezőket, és tételt csak a belső leírásig módosíthatja.
"""
from apps.core.permissions import check_permission


def user_can_view_prices(user):
    """Láthatja-e a felhasználó az árakat (superuser vagy sales.rfqs view/manage)."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser:
        return True
    return check_permission(user, 'sales', 'sales.rfqs', 'view')
