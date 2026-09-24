"""Hűségprogram API: ERP oldali admin (config, kártyák, kedvezmények, pontok)
és a kliens portál végpontjai (összegzés, vásárlások, nyugta PDF, QR token)."""
from decimal import Decimal

from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.views import ClientPortalSessionMixin
from apps.crm.models import Company
from apps.sales.models import POSTransaction

from .models import (
    CustomerProductDiscount, FuelCard, FuelCardTransaction, LoyaltyConfig,
    LoyaltyPointEntry, customer_points_balance, generate_qr_token,
)
from .receipt_pdf import build_receipt_pdf
from .serializers import (
    CustomerProductDiscountSerializer, FuelCardSerializer, FuelCardTransactionSerializer,
    LoyaltyConfigSerializer, LoyaltyPointEntrySerializer,
)


def _pos_customer_of(portal_user):
    """A portál felhasználóhoz tartozó POS ügyfél (CRM Company)."""
    return portal_user.company


class LoyaltyConfigViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = LoyaltyConfig.objects.all()
    serializer_class = LoyaltyConfigSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def list(self, request, *args, **kwargs):
        return Response(LoyaltyConfigSerializer(LoyaltyConfig.get_solo()).data)

    def perform_update(self, serializer):
        serializer.save()


class LoyaltyPointEntryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = LoyaltyPointEntry.objects.select_related('customer', 'created_by')
    serializer_class = LoyaltyPointEntrySerializer
    filterset_fields = ['customer', 'reason']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)


class FuelCardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = FuelCard.objects.select_related('customer')
    serializer_class = FuelCardSerializer
    filterset_fields = ['customer', 'is_active']
    search_fields = ['card_number', 'customer__name']

    @action(detail=True, methods=['post'])
    def topup(self, request, pk=None):
        """Kártya feltöltése pozitív összeggel."""
        card = self.get_object()
        try:
            amount = Decimal(str(request.data.get('amount')))
        except Exception:
            return Response({'error': 'Érvénytelen összeg'}, status=400)
        if amount <= 0:
            return Response({'error': 'Az összeg pozitív kell legyen'}, status=400)
        card.balance += amount
        card.save(update_fields=['balance', 'updated_at'])
        FuelCardTransaction.objects.create(
            card=card, amount=amount, note=request.data.get('note') or 'Feltöltés',
            created_by=request.user if request.user.is_authenticated else None,
        )
        return Response(FuelCardSerializer(card).data)


class FuelCardTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = FuelCardTransaction.objects.select_related('card')
    serializer_class = FuelCardTransactionSerializer
    filterset_fields = ['card', 'card__customer']


class CustomerProductDiscountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = CustomerProductDiscount.objects.select_related('customer', 'material')
    serializer_class = CustomerProductDiscountSerializer
    filterset_fields = ['customer', 'material', 'is_active']

    def perform_create(self, serializer):
        serializer.save()


# ════════════════════════════════════════════════════ kliens portál (publikus)

class PortalLoyaltyBase(APIView, ClientPortalSessionMixin):
    authentication_classes = []
    permission_classes = [AllowAny]

    def _session(self, request):
        session = self.get_portal_session(request)
        return session


class PortalLoyaltySummaryView(PortalLoyaltyBase):
    """Pontegyenleg, üzemanyagkártya adatai és a következő QR token."""

    def get(self, request):
        session = self._session(request)
        if not session:
            return Response({'error': 'Nem bejelentkezett'}, status=401)
        customer = _pos_customer_of(session.user)
        data = {
            'user': {'email': session.user.email, 'full_name': session.user.full_name},
            'customer': {'id': customer.id, 'name': customer.name} if customer else None,
            'points': customer_points_balance(customer) if customer else 0,
            'fuel_card': None,
        }
        card = getattr(customer, 'fuel_card', None) if customer else None
        if card:
            data['fuel_card'] = {
                'card_number': card.card_number,
                'balance': float(card.balance),
                'is_active': card.is_active,
            }
        return Response(data)


class PortalLoyaltyQrView(PortalLoyaltyBase):
    """Friss, időkorlátozott QR token a kasszánál való azonosításhoz."""

    def get(self, request):
        session = self._session(request)
        if not session:
            return Response({'error': 'Nem bejelentkezett'}, status=401)
        customer = _pos_customer_of(session.user)
        if not customer:
            return Response({'error': 'A felhasználóhoz nincs ügyfél rendelve'}, status=400)
        cfg = LoyaltyConfig.get_solo()
        return Response({
            'token': generate_qr_token(customer.id, cfg.qr_token_ttl_seconds),
            'expires_in': cfg.qr_token_ttl_seconds,
        })


class PortalLoyaltyPurchasesView(PortalLoyaltyBase):
    """Ügyfél korábbi POS vásárlásai + jóírt pontok."""

    def get(self, request):
        session = self._session(request)
        if not session:
            return Response({'error': 'Nem bejelentkezett'}, status=401)
        customer = _pos_customer_of(session.user)
        if not customer:
            return Response({'purchases': []})
        qs = (POSTransaction.objects
              .filter(customer=customer)
              .prefetch_related('items', 'loyalty_entries')
              .order_by('-created_at')[:100])
        purchases = []
        for tx in qs:
            points = sum(e.points for e in tx.loyalty_entries.all())
            purchases.append({
                'id': tx.id,
                'transaction_number': tx.transaction_number,
                'transaction_type': tx.transaction_type,
                'payment_method': tx.payment_method,
                'status': tx.status,
                'created_at': tx.created_at,
                'item_count': tx.items.count(),
                'total_gross': float(tx.total_gross or 0),
                'points': points,
            })
        return Response({'purchases': purchases})


class PortalLoyaltyReceiptView(PortalLoyaltyBase):
    """Bizonylat PDF letöltése (csak a saját vásárlásairól)."""

    def get(self, request, transaction_id):
        session = self._session(request)
        if not session:
            return Response({'error': 'Nem bejelentkezett'}, status=401)
        customer = _pos_customer_of(session.user)
        tx = POSTransaction.objects.filter(id=transaction_id).prefetch_related('items').first()
        if not tx or (customer and tx.customer_id != customer.id):
            return Response({'error': 'A bizonylat nem található'}, status=404)
        pdf_bytes = build_receipt_pdf(tx)
        resp = HttpResponse(pdf_bytes, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="{tx.transaction_number}.pdf"'
        return resp
