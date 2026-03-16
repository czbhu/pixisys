from decimal import Decimal, ROUND_HALF_UP
import os
import subprocess
import tempfile
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from .models import PrintSizePreset, PrintPricingConfig, PrintOrder, PrintOrderItem, PrintMaterial
from .serializers import (
    PrintSizePresetSerializer, PrintPricingConfigSerializer,
    PrintOrderSerializer, PrintOrderListSerializer, PrintOrderItemSerializer,
    PrintMaterialSerializer,
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
        'white': config.print_color_white_cost,  # fehér festék = color_white-tal azonos
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


class PrintMaterialViewSet(viewsets.ModelViewSet):
    serializer_class = PrintMaterialSerializer
    pagination_class = None

    def get_queryset(self):
        return PrintMaterial.objects.filter(is_active=True).order_by('sort_order', 'name')

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

    @action(detail=True, methods=['post'], url_path='set-lock',
            parser_classes=[JSONParser])
    def set_lock(self, request, pk=None):
        """Admin zárolja / feloldja a szerkesztőt vagy a preview-t."""
        if not request.user.is_staff:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        order = self.get_object()
        item_id = request.data.get('item_id')
        try:
            item = order.items.get(pk=item_id)
        except PrintOrderItem.DoesNotExist:
            return Response({'error': 'Tétel nem található'}, status=404)

        from django.utils import timezone
        if 'editor_locked' in request.data:
            item.editor_locked = bool(request.data['editor_locked'])
        if 'preview_locked' in request.data:
            item.preview_locked = bool(request.data['preview_locked'])

        if item.editor_locked or item.preview_locked:
            item.locked_by = request.user
            item.locked_at = timezone.now()
        else:
            item.locked_by = None
            item.locked_at = None

        item.save(update_fields=['editor_locked', 'preview_locked', 'locked_by', 'locked_at'])
        return Response({
            'editor_locked': item.editor_locked,
            'preview_locked': item.preview_locked,
        })

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


class PdfToSvgView(APIView):
    """
    PDF oldal → SVG konverzió pdftocairo segítségével.
    POST multipart: pdf (file), page (int, default 1)
    Visszaad: { svg: "<svg ...>...</svg>", width_mm, height_mm, page_count }
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        pdf_file = request.FILES.get('pdf')
        if not pdf_file:
            return Response({'error': 'PDF fájl szükséges'}, status=400)

        page = int(request.data.get('page', 1))

        # Ellenőrzés
        if pdf_file.size > 50 * 1024 * 1024:  # 50 MB limit
            return Response({'error': 'A fájl túl nagy (max 50 MB)'}, status=400)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            svg_path = os.path.join(tmpdir, 'output.svg')

            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            # Oldalszám lekérése
            try:
                info = subprocess.run(
                    ['pdfinfo', pdf_path],
                    capture_output=True, text=True, timeout=10
                )
                page_count = 1
                for line in info.stdout.splitlines():
                    if line.startswith('Pages:'):
                        page_count = int(line.split(':')[1].strip())
                        break
            except Exception:
                page_count = 1

            page = max(1, min(page, page_count))

            # PDF → SVG
            try:
                result = subprocess.run(
                    [
                        'pdftocairo', '-svg',
                        '-f', str(page), '-l', str(page),
                        pdf_path, svg_path,
                    ],
                    capture_output=True, timeout=30
                )
                if result.returncode != 0:
                    return Response(
                        {'error': 'Konverziós hiba: ' + result.stderr.decode('utf-8', errors='replace')},
                        status=500
                    )
            except FileNotFoundError:
                return Response({'error': 'pdftocairo nem elérhető a szerveren'}, status=500)
            except subprocess.TimeoutExpired:
                return Response({'error': 'Konverzió időtúllépés'}, status=500)

            # Az SVG kimenete: output-N.svg alakban (N = oldalszám)
            svg_candidate = os.path.join(tmpdir, f'output-{page}.svg')
            if not os.path.exists(svg_candidate):
                # egyoldalas esetén output.svg is lehet
                svg_candidate = svg_path if os.path.exists(svg_path) else None
            if not svg_candidate:
                return Response({'error': 'SVG kimenet nem található'}, status=500)

            with open(svg_candidate, 'r', encoding='utf-8') as f:
                svg_content = f.read()

            # Méret kinyerése az SVG-ből (width/height attribútum)
            import re
            width_pt = height_pt = None
            m = re.search(r'<svg[^>]*\bwidth=["\']([0-9.]+)["\']', svg_content)
            if m:
                width_pt = float(m.group(1))
            m = re.search(r'<svg[^>]*\bheight=["\']([0-9.]+)["\']', svg_content)
            if m:
                height_pt = float(m.group(1))

            # pt → mm (1 pt = 25.4/72 mm)
            width_mm = round(width_pt * 25.4 / 72, 1) if width_pt else None
            height_mm = round(height_pt * 25.4 / 72, 1) if height_pt else None

            return Response({
                'svg': svg_content,
                'width_mm': width_mm,
                'height_mm': height_mm,
                'page_count': page_count,
                'page': page,
            })
