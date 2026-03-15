from decimal import Decimal, ROUND_HALF_UP
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import PrintSizePreset, PrintPricingConfig, PrintOrder, PrintOrderItem
from .serializers import (
    PrintSizePresetSerializer, PrintPricingConfigSerializer,
    PrintOrderSerializer, PrintOrderListSerializer, PrintOrderItemSerializer,
)


def _calculate_price(width_mm, height_mm, quantity, sides, side1_mode, side2_mode,
                     binding, folding_count, config):
    """Árkalkuláció — visszaad egy részletes breakdown dict-et."""
    w = Decimal(str(width_mm))
    h = Decimal(str(height_mm))
    qty = Decimal(str(max(quantity, 1)))

    # Papírköltség
    area_m2 = (w / 1000) * (h / 1000)
    paper_cost = area_m2 * config.paper_cost_per_m2 * qty

    # Nyomtatási költség
    mode_costs = {
        'color': config.print_color_cost,
        'bw': config.print_bw_cost,
        'color_white': config.print_color_white_cost,
        'none': Decimal('0'),
    }
    print_cost_s1 = mode_costs.get(side1_mode, Decimal('0')) * qty
    print_cost_s2 = (mode_costs.get(side2_mode, Decimal('0')) * qty
                     if sides == '2' else Decimal('0'))
    print_cost = print_cost_s1 + print_cost_s2

    # Kötészeti költség
    if binding == 'fold':
        finishing_cost = (config.cutting_cost
                          + config.folding_cost_per_fold * Decimal(str(max(folding_count, 0))))
    else:
        finishing_cost = config.cutting_cost

    subtotal = paper_cost + print_cost + finishing_cost
    margin_mult = Decimal('1') + config.margin_pct / 100
    total = (subtotal * margin_mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    unit_price = (total / qty).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

    return {
        'paper_cost': float(paper_cost.quantize(Decimal('0.01'))),
        'print_cost_side1': float(print_cost_s1.quantize(Decimal('0.01'))),
        'print_cost_side2': float(print_cost_s2.quantize(Decimal('0.01'))),
        'finishing_cost': float(finishing_cost.quantize(Decimal('0.01'))),
        'subtotal': float(subtotal.quantize(Decimal('0.01'))),
        'margin_pct': float(config.margin_pct),
        'total': float(total),
        'unit_price': float(unit_price),
        'quantity': int(qty),
    }


class PrintSizePresetViewSet(viewsets.ModelViewSet):
    serializer_class = PrintSizePresetSerializer
    pagination_class = None

    def get_queryset(self):
        return PrintSizePreset.objects.filter(is_active=True).order_by('sort_order', 'name')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        from rest_framework.permissions import IsAdminUser
        return [IsAdminUser()]


class PrintPricingConfigViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        config = PrintPricingConfig.get_config()
        return Response(PrintPricingConfigSerializer(config).data)

    def create(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        config = PrintPricingConfig.get_config()
        serializer = PrintPricingConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PrintOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = PrintOrder.objects.select_related(
            'company', 'contact', 'created_by'
        ).prefetch_related('items')
        if user.is_staff:
            return qs.all()
        return qs.filter(created_by=user)

    def get_serializer_class(self):
        if self.action == 'list':
            return PrintOrderListSerializer
        return PrintOrderSerializer

    def perform_create(self, serializer):
        if not self.request.user.is_staff:
            serializer.save(created_by=self.request.user, company=None, contact=None)
        else:
            serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='calculate-price')
    def calculate_price(self, request):
        """Valós idejű árkalkuláció."""
        d = request.data
        try:
            config = PrintPricingConfig.get_config()
            breakdown = _calculate_price(
                width_mm=float(d.get('width_mm', 85)),
                height_mm=float(d.get('height_mm', 54)),
                quantity=int(d.get('quantity', 100)),
                sides=str(d.get('sides', '1')),
                side1_mode=str(d.get('side1_mode', 'color')),
                side2_mode=str(d.get('side2_mode', 'none')),
                binding=str(d.get('binding', 'cut')),
                folding_count=int(d.get('folding_count', 0)),
                config=config,
            )
            return Response(breakdown)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'], url_path='save-design',
            parser_classes=[JSONParser])
    def save_design(self, request, pk=None):
        """Tervezés mentése (canvas JSON -> order item)."""
        order = self.get_object()
        item_id = request.data.get('item_id')
        design_side1 = request.data.get('design_json_side1')
        design_side2 = request.data.get('design_json_side2')

        try:
            item = order.items.get(pk=item_id)
        except PrintOrderItem.DoesNotExist:
            return Response({'error': 'Tétel nem található'}, status=404)

        if design_side1 is not None:
            item.design_json_side1 = design_side1
        if design_side2 is not None:
            item.design_json_side2 = design_side2
        item.save(update_fields=['design_json_side1', 'design_json_side2'])
        return Response({'ok': True})

    @action(detail=True, methods=['post'], url_path='generate-pdf',
            parser_classes=[JSONParser])
    def generate_pdf(self, request, pk=None):
        """Nyomdakész PDF generálás."""
        order = self.get_object()
        item_id = request.data.get('item_id')
        try:
            item = order.items.get(pk=item_id)
        except PrintOrderItem.DoesNotExist:
            return Response({'error': 'Tétel nem található'}, status=404)

        try:
            from .pdf_generator import generate_print_pdf
            pdf_url = generate_print_pdf(item)
            return Response({'pdf_url': pdf_url})
        except Exception as e:
            return Response({'error': f'PDF generálási hiba: {str(e)}'}, status=500)
