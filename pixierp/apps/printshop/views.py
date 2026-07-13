from decimal import Decimal, ROUND_HALF_UP
import os
import re
import secrets
import subprocess
import tempfile
from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from .models import (
    PrintSizePreset, PrintPricingConfig, PrintOrder, PrintOrderItem, PrintMaterial,
    PrintOrderItemComment, SharedPrintPreview, SharedPrintPreviewComment,
    SharedPrintPreviewFolder, SharedPrintPreviewVersion,
    PrintTemplateCategory, PrintTemplate, Machine,
)
from .serializers import (
    PrintSizePresetSerializer, PrintPricingConfigSerializer,
    PrintOrderSerializer, PrintOrderListSerializer, PrintOrderItemSerializer,
    PrintMaterialSerializer, PrintOrderItemCommentSerializer,
    SharedPrintPreviewSerializer, SharedPrintPreviewCommentSerializer,
    SharedPrintPreviewFolderSerializer, SharedPrintPreviewVersionSerializer,
    PrintTemplateCategorySerializer, PrintTemplateSerializer, MachineSerializer,
)


def _get_raw_pdf_box(doc, page_xref, box_name):
    value = doc.xref_get_key(page_xref, box_name)
    if not value:
        return None

    # PyMuPDF may return either the raw string value or a tuple like
    # ('array', '[0 0 595 842]'). Accept both shapes.
    if isinstance(value, tuple):
        if len(value) < 2:
            return None
        value = value[1]

    if value in (None, 'null', 'none'):
        return None

    numbers = re.findall(r'[-+]?\d*\.?\d+', str(value))
    if len(numbers) != 4:
        return None
    return tuple(map(float, numbers))


def _get_frontend_base_url(request=None):
    frontend_url = getattr(settings, 'FRONTEND_BASE_URL', None)
    if frontend_url:
        return frontend_url.rstrip('/')
    if request:
        return f"{request.scheme}://{request.get_host()}"
    return ''


def _build_preview_share_url(item, request=None):
    if not item.preview_share_token:
        return None
    frontend_url = _get_frontend_base_url(request)
    if not frontend_url:
        return None
    return f"{frontend_url}/public/print-preview/{item.preview_share_token}"


def _parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


def _user_can_access_print_item(user, item):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    return item.order.created_by_id == user.id


def _get_shared_preview_item(token):
    return get_object_or_404(
        PrintOrderItem.objects.select_related('order', 'order__company', 'order__contact'),
        preview_share_token=token,
    )


def _get_standalone_shared_preview(token):
    return SharedPrintPreview.objects.filter(token=token).first()


def _get_public_preview_target(token):
    shared_preview = _get_standalone_shared_preview(token)
    if shared_preview:
        return ('shared', shared_preview)
    return ('item', _get_shared_preview_item(token))


def _is_preview_owner(request, target_type, target) -> bool:
    """Authenticated owner / staff bypass the public-share gating."""
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    if target_type == 'shared':
        return target.created_by_id == user.id
    return False


def _get_public_preview_author_name(target_type, target):
    if target_type == 'shared':
        if target.created_by:
            return target.created_by.get_full_name() or target.created_by.username
        return 'Ügyfél'
    return target.order.contact.name if target.order.contact else (target.order.company.name if target.order.company else 'Ügyfél')


def _calculate_price(width_mm, height_mm, quantity, sides, side1_mode, side2_mode,
                     binding, folding_count, config, selected_service_ids=None):
    """Árkalkuláció — visszaad egy részletes breakdown dict-et."""
    from apps.manufacturing.models import Service
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

    # Szolgáltatás költség
    service_cost = Decimal('0')
    service_breakdown = []
    if selected_service_ids:
        from apps.manufacturing.models import ServiceCostItem
        services = Service.objects.filter(id__in=selected_service_ids).prefetch_related(
            'cost_items'
        )
        for svc in services:
            ptype = svc.pricing_type or 'per_sheet'
            cap = Decimal(str(svc.capacity or 1)) if svc.capacity else Decimal('1')
            svc_total = Decimal('0')
            standalone_items = [ci for ci in svc.cost_items.all()
                                 if not ci.supplier_id and not ci.is_internal and ci.is_active]
            if standalone_items:
                # New cost-item based calculation
                for ci in standalone_items:
                    price = Decimal(str(ci.selling_price or 0))
                    if ci.calculation_type == 'fixed':
                        svc_total += price
                    else:  # 'unit' or anything else → per-unit
                        if ptype == 'per_job':
                            svc_total += price
                        elif ptype == 'per_cut':
                            cuts = (qty / cap).to_integral_value(rounding='ROUND_CEILING') if cap > 0 else qty
                            svc_total += price * cuts
                        else:  # per_sheet
                            svc_total += price * qty
            else:
                # Fallback: legacy flat fields
                setup = Decimal(str(svc.setup_cost_selling or 0))
                unit_c = Decimal(str(svc.unit_cost_selling or 0))
                if ptype == 'per_job':
                    svc_total = setup + unit_c
                elif ptype == 'per_cut':
                    cuts = (qty / cap).to_integral_value(rounding='ROUND_CEILING') if cap > 0 else qty
                    svc_total = setup + unit_c * cuts
                else:  # per_sheet
                    svc_total = setup + unit_c * qty
            service_cost += svc_total
            service_breakdown.append({
                'id': svc.id,
                'name': svc.name,
                'pricing_type': ptype,
                'total': float(svc_total.quantize(Decimal('0.01'))),
            })

    subtotal = paper_cost + print_cost + finishing_cost + service_cost
    margin_mult = Decimal('1') + config.margin_pct / 100
    total = (subtotal * margin_mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    unit_price = (total / qty).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

    return {
        'paper_cost': float(paper_cost.quantize(Decimal('0.01'))),
        'print_cost_side1': float(print_cost_s1.quantize(Decimal('0.01'))),
        'print_cost_side2': float(print_cost_s2.quantize(Decimal('0.01'))),
        'finishing_cost': float(finishing_cost.quantize(Decimal('0.01'))),
        'service_cost': float(service_cost.quantize(Decimal('0.01'))),
        'service_breakdown': service_breakdown,
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
                selected_service_ids=list(dict.fromkeys([
                    *(d.get('selected_service_ids') or []),
                    *(d.get('finishing_service_ids') or []),
                ])),
            )
            return Response(breakdown)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'], url_path='calculate-price-click')
    def calculate_price_click(self, request):
        """Klikkdíjas íves nyomtatás árkalkuláció – részletes breakdown."""
        import math as _math
        from decimal import Decimal, ROUND_HALF_UP
        from apps.manufacturing.models import Service

        d = request.data
        try:
            width_mm       = float(d.get('width_mm', 85))
            height_mm      = float(d.get('height_mm', 54))
            quantity       = max(1, int(d.get('quantity', 100)))
            sheet_count    = max(1, int(d.get('sheet_count', 1)))  # lapok száma (multi-page product)
            print_sides    = max(0, min(2, int(d.get('print_sides', 1))))
            print_service_id_1 = d.get('print_service_id_1') or d.get('print_service_id')
            print_service_id_2 = d.get('print_service_id_2') if print_sides == 2 else None
            sheet_w_mm     = float(d.get('sheet_w_mm', 330))
            sheet_h_mm     = float(d.get('sheet_h_mm', 487))
            bleed_mm       = float(d.get('bleed_mm', 3))
            margin_pct     = Decimal(str(d.get('margin_pct', 0)))
            extra_svc_ids  = d.get('selected_service_ids') or []
            material_id    = d.get('material_id')
            force_rotate   = d.get('force_rotate')   # None=auto, True=force rotated, False=force normal
            fix_cost_first_side_only = bool(d.get('fix_cost_first_side_only', False))
            cutting_mode   = d.get('cutting_mode', 'auto')  # auto | material | print
            forced_size_id = d.get('forced_size_id')   # MaterialSize.id to use for material cost, or None=auto

            # ── Material dimensions (for cutting) ────────────────────────────
            mat_w_mm = None
            mat_h_mm = None
            if material_id:
                try:
                    from apps.warehouse.models import Material as WarehouseMaterial
                    _mat = WarehouseMaterial.objects.get(id=material_id)
                    _dim_unit = _mat.dimension_unit or 'mm'
                    _mult = {'mm': 1, 'cm': 10, 'm': 1000}.get(_dim_unit, 1)
                    if _mat.width:
                        mat_w_mm = float(_mat.width) * _mult
                    if _mat.length:
                        mat_h_mm = float(_mat.length) * _mult
                except Exception:
                    pass

            # ── Service max dimensions ────────────────────────────────────────
            svc_max_w = None
            svc_max_h = None
            if print_service_id_1:
                try:
                    _svc = Service.objects.get(id=print_service_id_1)
                    if _svc.max_width_mm:
                        svc_max_w = float(_svc.max_width_mm)
                    if _svc.max_height_mm:
                        svc_max_h = float(_svc.max_height_mm)
                except Service.DoesNotExist:
                    pass

            # ── Cutting optimization ──────────────────────────────────────────
            # When material is larger than the printer max, determines:
            #   - print sheet size (always ≤ printer max)
            #   - how many print sheets fit per raw material
            #   - how many raw material sheets needed
            needs_cutting = False
            effective_cutting_mode = cutting_mode  # actual mode used (for auto)

            if mat_w_mm and mat_h_mm and svc_max_w and svc_max_h:
                material_exceeds = mat_w_mm > svc_max_w or mat_h_mm > svc_max_h

                if material_exceeds:
                    needs_cutting = True
                    # Print sheet is always capped at printer maximum
                    sheet_w_mm = min(mat_w_mm, svc_max_w)
                    sheet_h_mm = min(mat_h_mm, svc_max_h)

                    if cutting_mode == 'material':
                        effective_cutting_mode = 'material'
                    elif cutting_mode == 'print':
                        effective_cutting_mode = 'print'
                    else:
                        # AUTO: heuristic — 'print' mode wastes less when cuts divide evenly
                        effective_cutting_mode = 'print'

            # How many print sheets fit from one raw material sheet
            mat_sheets_per_raw = 1
            if needs_cutting and mat_w_mm and mat_h_mm:
                # Normal orientation
                sx_n = max(1, int(mat_w_mm / sheet_w_mm))
                sy_n = max(1, int(mat_h_mm / sheet_h_mm))
                # Rotated cut
                sx_r = max(1, int(mat_w_mm / sheet_h_mm))
                sy_r = max(1, int(mat_h_mm / sheet_w_mm))
                mat_sheets_per_raw = max(sx_n * sy_n, sx_r * sy_r)

            # ── Impozíció ────────────────────────────────────────────────────
            prod_w = width_mm + 2 * bleed_mm
            prod_h = height_mm + 2 * bleed_mm
            fit_w_normal  = max(1, int(sheet_w_mm / prod_w))
            fit_h_normal  = max(1, int(sheet_h_mm / prod_h))
            fit_w_rotated = max(1, int(sheet_w_mm / prod_h))
            fit_h_rotated = max(1, int(sheet_h_mm / prod_w))
            auto_rotated = fit_w_rotated * fit_h_rotated > fit_w_normal * fit_h_normal
            if force_rotate is None:
                rotated = auto_rotated
            else:
                rotated = bool(force_rotate)
            if rotated:
                fit_w, fit_h = fit_w_rotated, fit_h_rotated
            else:
                fit_w, fit_h = fit_w_normal, fit_h_normal
            items_per_sheet = fit_w * fit_h
            # Ha több lapból áll a termék, az összes lapot ki kell nyomtatni:
            # pl. 100 db × 2 lap = 200 nyomtatandó elem
            total_pieces    = quantity * sheet_count
            sheets_needed   = _math.ceil(total_pieces / items_per_sheet)
            if print_sides == 2 and sheets_needed % 2 != 0:
                sheets_needed += 1
            clicks_total = sheets_needed * print_sides

            # ── Production layout: full sheets vs partial sheet ───────────────
            total_slots = sheets_needed * items_per_sheet
            remaining_on_last = total_pieces % items_per_sheet  # 0 means full
            if remaining_on_last == 0:
                full_sheets = sheets_needed
                partial_sheet_items = 0
            else:
                full_sheets = sheets_needed - 1
                partial_sheet_items = remaining_on_last
            partial_coverage_pct = round(partial_sheet_items / items_per_sheet * 100, 1) if partial_sheet_items > 0 else 0
            waste_items = total_slots - total_pieces  # unused slots

            # ── Cutting info ──────────────────────────────────────────────────
            if needs_cutting and mat_w_mm and mat_h_mm:
                raw_sheets_needed = _math.ceil(sheets_needed / mat_sheets_per_raw)
                cutting_info = {
                    'needs_cutting': True,
                    'cutting_mode': effective_cutting_mode,
                    'material_size_mm': [round(mat_w_mm, 1), round(mat_h_mm, 1)],
                    'cut_sheet_size_mm': [round(sheet_w_mm, 1), round(sheet_h_mm, 1)],
                    'cut_sheets_per_material': mat_sheets_per_raw,
                    'raw_material_sheets_needed': raw_sheets_needed,
                    'total_cut_sheets': sheets_needed,
                }
            else:
                cutting_info = {
                    'needs_cutting': False,
                    'cutting_mode': cutting_mode,
                    'material_size_mm': [round(mat_w_mm, 1), round(mat_h_mm, 1)] if mat_w_mm and mat_h_mm else None,
                    'cut_sheet_size_mm': [round(sheet_w_mm, 1), round(sheet_h_mm, 1)],
                    'cut_sheets_per_material': 1,
                    'raw_material_sheets_needed': sheets_needed,
                    'total_cut_sheets': sheets_needed,
                }

            # ── Helper: build detailed cost breakdown for one Service ─────────
            def _build_service_cost(svc, unit_count, sheet_count):
                """
                Returns (total: Decimal, items: list[dict]).
                Uses ServiceCostItem records linked to a supplier or internal production.
                If svc.calculation_unit is 'click' or 'sheet' → 'unit' items are per-sheet (Ív alapú).
                """
                is_sheet_based = svc.calculation_unit in ('click', 'sheet')
                cap = Decimal(str(svc.capacity or 1)) if svc.capacity else Decimal('1')
                ptype = svc.pricing_type or 'per_sheet'

                # Use supplier-linked or internal cost items (not standalone)
                cost_items = [
                    ci for ci in svc.cost_items.all()
                    if ci.is_active
                    and ci.calculation_type not in ('length', 'perimeter', 'area', 'weight', 'time')
                    and (ci.supplier_id or ci.is_internal)
                ]

                total = Decimal('0')
                items = []

                if cost_items:
                    for ci in cost_items:
                        price = Decimal(str(ci.selling_price or 0))
                        cost_unit = Decimal(str(ci.unit_price or 0))
                        ctype = ci.calculation_type
                        sup = {
                            'supplier_id': ci.supplier_id,
                            'supplier_name': ci.supplier.name if ci.supplier_id else None,
                            'is_internal': ci.is_internal,
                            'cost_price_per': float(cost_unit),
                            'markup_percentage': float(ci.markup_percentage or 0),
                            'department_id': svc.internal_production_department_id if ci.is_internal else None,
                        }
                        if ctype == 'fixed':
                            amt = price
                            items.append({
                                'name': ci.name,
                                'type': 'fixed',
                                'price_per': float(price),
                                'units': 1,
                                'total': float(amt.quantize(Decimal('0.01'))),
                                **sup,
                            })
                        elif ctype == 'click':
                            # always per sheet
                            amt = price * Decimal(str(sheet_count))
                            items.append({
                                'name': ci.name,
                                'type': 'click',
                                'price_per': float(price),
                                'units': sheet_count,
                                'total': float(amt.quantize(Decimal('0.01'))),
                                **sup,
                            })
                        elif ctype == 'unit':
                            if is_sheet_based:
                                # Ív alapú: darab alapú elemek ívszám alapján számolnak
                                units = sheet_count
                                item_type = 'click'
                            elif ptype == 'per_job':
                                units = 1
                                item_type = 'unit'
                            elif ptype == 'per_cut':
                                units = int(_math.ceil(unit_count / float(cap))) if float(cap) > 0 else unit_count
                                item_type = 'unit'
                            else:
                                units = unit_count
                                item_type = 'unit'
                            amt = price * Decimal(str(units))
                            items.append({
                                'name': ci.name,
                                'type': item_type,
                                'price_per': float(price),
                                'units': units,
                                'total': float(amt.quantize(Decimal('0.01'))),
                                **sup,
                            })
                        total += amt
                else:
                    # Fallback to service-level setup/unit fields
                    s_setup = Decimal(str(svc.setup_cost_selling or 0))
                    unit_c  = Decimal(str(svc.unit_cost_selling or 0))
                    if s_setup:
                        items.append({'name': 'Beállítási díj', 'type': 'fixed', 'price_per': float(s_setup), 'units': 1, 'total': float(s_setup.quantize(Decimal('0.01')))})
                        total += s_setup
                    if unit_c:
                        if is_sheet_based:
                            units = sheet_count
                            fallback_type = 'click'
                        elif ptype == 'per_job':
                            units = 1
                            fallback_type = 'unit'
                        elif ptype == 'per_cut':
                            units = int(_math.ceil(unit_count / float(cap))) if float(cap) > 0 else unit_count
                            fallback_type = 'unit'
                        else:
                            units = unit_count
                            fallback_type = 'unit'
                        amt = unit_c * Decimal(str(units))
                        items.append({'name': 'Egységköltség', 'type': fallback_type, 'price_per': float(unit_c), 'units': units, 'total': float(amt.quantize(Decimal('0.01')))})
                        total += amt
                return total, items

            # ── Nyomtatási szolgáltatás (print_sides > 0) ────────────────────
            print_service_name_1 = None
            print_service_name_2 = None
            print_service_items_1 = []
            print_service_items_2 = []
            print_cost_side1 = Decimal('0')
            print_cost_side2 = Decimal('0')

            if print_sides > 0:
                if print_service_id_1:
                    try:
                        svc1 = Service.objects.prefetch_related('cost_items').get(id=print_service_id_1)
                        print_service_name_1 = svc1.name
                        c, items = _build_service_cost(svc1, quantity, sheets_needed)
                        print_cost_side1 = c
                        print_service_items_1 = items
                    except Service.DoesNotExist:
                        pass

                if print_sides == 2:
                    if print_service_id_2 and str(print_service_id_2) != str(print_service_id_1):
                        try:
                            svc2 = Service.objects.prefetch_related('cost_items').get(id=print_service_id_2)
                            print_service_name_2 = svc2.name
                            c, items = _build_service_cost(svc2, quantity, sheets_needed)
                            # Fix-költség eltávolítása a 2. oldalról csak akkor, ha:
                            # - "fix csak 1. oldalra" be van kapcsolva ÉS
                            # - az 1. oldal nem Nyomatlan (volt beállási díj az 1. oldalon)
                            if fix_cost_first_side_only and print_service_id_1:
                                items = [i for i in items if i['type'] != 'fixed']
                                c = sum(Decimal(str(i['total'])) for i in items)
                            print_cost_side2 = c
                            print_service_items_2 = items
                        except Service.DoesNotExist:
                            pass
                    elif print_service_id_2 and str(print_service_id_2) == str(print_service_id_1):
                        # Same service explicitly selected for both sides
                        print_service_name_2 = print_service_name_1
                        for ci_item in print_service_items_1:
                            if ci_item['type'] == 'click':
                                amt = Decimal(str(ci_item['price_per'])) * Decimal(str(sheets_needed))
                                print_cost_side2 += amt
                                print_service_items_2.append({**ci_item, 'total': float(amt.quantize(Decimal('0.01')))})
                            elif ci_item['type'] == 'fixed' and not fix_cost_first_side_only:
                                amt = Decimal(str(ci_item['total']))
                                print_cost_side2 += amt
                                print_service_items_2.append({**ci_item})

            print_cost = print_cost_side1 + print_cost_side2

            # ── Alapanyag költség ─────────────────────────────────────────────
            material_cost = Decimal('0')
            material_name = None
            material_items = []
            size_comparison = []
            if material_id:
                try:
                    from apps.warehouse.models import Material as WarehouseMaterial
                    mat = WarehouseMaterial.objects.get(id=material_id)
                    material_name = mat.name
                    # Use material's own selling price per unit (ív)
                    price_per_sheet = Decimal(str(mat.unit_selling_price or 0))
                    if price_per_sheet <= 0:
                        # Fallback: estimate from area_weight or global config
                        from .models import PrintPricingConfig
                        config = PrintPricingConfig.get_config()
                        sheet_area_m2 = (sheet_w_mm / 1000) * (sheet_h_mm / 1000)
                        price_per_sheet = Decimal(str(config.paper_cost_per_m2)) * Decimal(str(sheet_area_m2))
                    material_cost = (price_per_sheet * Decimal(str(sheets_needed))).quantize(Decimal('0.01'))
                    mat_sup_id = mat.default_supplier_id if hasattr(mat, 'default_supplier_id') else None
                    mat_sup_name = mat.default_supplier.name if mat_sup_id and mat.default_supplier else None
                    mat_cost_per = Decimal(str(mat.unit_cost_price or 0))
                    mat_markup = float(mat.markup_percentage or 0)
                    material_items = [{
                        'name': mat.name,
                        'type': 'click',
                        'price_per': float(price_per_sheet.quantize(Decimal('0.01'))),
                        'units': sheets_needed,
                        'total': float(material_cost),
                        'supplier_id': mat_sup_id,
                        'supplier_name': mat_sup_name,
                        'cost_price_per': float(mat_cost_per.quantize(Decimal('0.01'))),
                        'markup_percentage': mat_markup,
                        'is_internal': False,
                        'material_id': mat.id,
                        'unit': mat.unit or 'ív',
                    }]

                    # ── Size comparison ────────────────────────────────────
                    def _calc_size_cost(sz_w_mm, sz_h_mm, sz_price, sz_label):
                        """Calculate material cost for a given size variant.
                        The print sheet = sheet_w_mm × sheet_h_mm (user-entered, already constrained by machine).
                        If raw material > print sheet → cut to produce print sheets.
                        If raw material < print sheet → use material dimensions directly.
                        """
                        # Effective print sheet = user-entered sheet (already reflects machine constraints)
                        _sw = sheet_w_mm
                        _sh = sheet_h_mm
                        _needs_cut = False
                        _mat_per_raw = 1

                        if sz_w_mm > _sw or sz_h_mm > _sh:
                            # Raw material larger than print sheet → needs cutting
                            _needs_cut = True
                            sx_n = max(1, int(sz_w_mm / _sw))
                            sy_n = max(1, int(sz_h_mm / _sh))
                            sx_r = max(1, int(sz_w_mm / _sh))
                            sy_r = max(1, int(sz_h_mm / _sw))
                            _mat_per_raw = max(sx_n * sy_n, sx_r * sy_r)
                        elif sz_w_mm < _sw or sz_h_mm < _sh:
                            # Raw material smaller than print sheet → use material size as sheet
                            _sw = sz_w_mm
                            _sh = sz_h_mm

                        # Imposition on this sheet
                        _fw_n = max(1, int(_sw / prod_w))
                        _fh_n = max(1, int(_sh / prod_h))
                        _fw_r = max(1, int(_sw / prod_h))
                        _fh_r = max(1, int(_sh / prod_w))
                        _ips = max(_fw_n * _fh_n, _fw_r * _fh_r)
                        if _ips == 0:
                            return None
                        _sheets = _math.ceil(quantity / _ips)
                        if print_sides == 2 and _sheets % 2 != 0:
                            _sheets += 1
                        _raw_needed = _math.ceil(_sheets / _mat_per_raw) if _needs_cut else _sheets

                        _price = Decimal(str(sz_price or 0))
                        _mat_cost = (_price * Decimal(str(_raw_needed))).quantize(Decimal('0.01'))
                        return {
                            'label': sz_label,
                            'size_mm': [round(sz_w_mm, 1), round(sz_h_mm, 1)],
                            'cut_sheet_mm': [round(_sw, 1), round(_sh, 1)] if _needs_cut else None,
                            'cuts_per_raw': _mat_per_raw if _needs_cut else 1,
                            'price_per_sheet': float(_price),
                            'sheets_needed': _raw_needed,
                            'items_per_sheet': _ips,
                            'material_cost': float(_mat_cost),
                            'needs_cutting': _needs_cut,
                        }

                    # Default size entry
                    if mat_w_mm and mat_h_mm:
                        default_entry = _calc_size_cost(mat_w_mm, mat_h_mm, price_per_sheet, 'Alapméret')
                        if default_entry:
                            default_entry['is_default'] = True
                            size_comparison.append(default_entry)

                    # Orderable sizes
                    from apps.warehouse.models import MaterialSize
                    _dim_mult = {'mm': 1, 'cm': 10, 'm': 1000}
                    for ms in MaterialSize.objects.filter(material=mat, is_active=True).order_by('sort_order'):
                        _m = _dim_mult.get(ms.dimension_unit, 1)
                        _w = float(ms.width) * _m
                        _l = float(ms.length) * _m
                        # Apply grip reductions to get effective printable area
                        _grip_w = float(ms.grip_width_mm or 0)
                        _grip_h = float(ms.grip_height_mm or 0)
                        _effective_w = max(0, _w - _grip_w)
                        _effective_l = max(0, _l - _grip_h)
                        _p = float(ms.effective_price or 0)
                        _lbl = ms.name or f'{round(_w)}×{round(_l)} mm'
                        if _grip_w or _grip_h:
                            _lbl += f' (nyomtatható: {round(_effective_w)}×{round(_effective_l)})'
                        entry = _calc_size_cost(_effective_w, _effective_l, _p, _lbl)
                        if entry:
                            entry['is_default'] = False
                            entry['size_id'] = ms.id
                            entry['grip_w'] = _grip_w
                            entry['grip_h'] = _grip_h
                            size_comparison.append(entry)

                    # Sort by material cost, mark the best
                    if size_comparison:
                        size_comparison.sort(key=lambda x: x['material_cost'])
                        size_comparison[0]['is_best'] = True

                    # Apply forced or auto-best size to main material cost
                    chosen = None
                    if forced_size_id is not None:
                        chosen = next((sc for sc in size_comparison if sc.get('size_id') == int(forced_size_id)), None)
                    if chosen is None and size_comparison:
                        # Auto: use best (cheapest) if orderable sizes exist, otherwise keep default
                        best = size_comparison[0]
                        # Only auto-apply if a non-default size is best
                        if not best.get('is_default', False) or forced_size_id is not None:
                            chosen = best
                        elif forced_size_id is None and any(not sc.get('is_default', False) for sc in size_comparison):
                            # There are orderable sizes - use cheapest overall (already sorted)
                            chosen = size_comparison[0]
                    if chosen:
                        _p = Decimal(str(chosen['price_per_sheet']))
                        _sn = chosen['sheets_needed']
                        material_cost = (_p * Decimal(str(_sn))).quantize(Decimal('0.01'))
                        material_items = [{
                            'name': f"{mat.name} ({chosen['label']})",
                            'type': 'click',
                            'price_per': float(_p),
                            'units': _sn,
                            'total': float(material_cost),
                            'supplier_id': mat_sup_id,
                            'supplier_name': mat_sup_name,
                            'cost_price_per': float(mat_cost_per.quantize(Decimal('0.01'))),
                            'markup_percentage': mat_markup,
                            'is_internal': False,
                            'material_id': mat.id,
                            'unit': mat.unit or 'ív',
                        }]
                        # Mark chosen in comparison
                        for sc in size_comparison:
                            sc['is_selected'] = (sc is chosen)

                except Exception:
                    pass

            # ── Szolgáltatások (részletes, kategorizálva) ────────────────────
            from collections import Counter
            service_cost      = Decimal('0')
            service_breakdown = []
            all_counted_ids   = set()

            # 1) Kötelező szolgáltatások
            required_svc_ids = d.get('required_service_ids') or []
            if required_svc_ids:
                unique_required = list(dict.fromkeys(int(sid) for sid in required_svc_ids))
                req_svcs = Service.objects.filter(id__in=unique_required).prefetch_related('cost_items')
                req_map = {s.id: s for s in req_svcs}
                for sid in unique_required:
                    rsvc = req_map.get(sid)
                    if not rsvc:
                        continue
                    svc_total, svc_items = _build_service_cost(rsvc, quantity, sheets_needed)
                    service_cost += svc_total
                    all_counted_ids.add(rsvc.id)
                    service_breakdown.append({
                        'id':       rsvc.id,
                        'name':     rsvc.name,
                        'sides':    1,
                        'total':    float(svc_total.quantize(Decimal('0.01'))),
                        'items':    svc_items,
                        'category': 'required',
                    })

            # 2) Oldalankénti szolgáltatások
            if extra_svc_ids:
                svc_side_counts = Counter(extra_svc_ids)
                unique_svc_ids = list(svc_side_counts.keys())
                svcs = Service.objects.filter(id__in=unique_svc_ids).prefetch_related('cost_items')
                svc_map = {s.id: s for s in svcs}
                for sid in unique_svc_ids:
                    esvc = svc_map.get(sid)
                    if not esvc:
                        continue
                    sides_count = svc_side_counts[sid]
                    svc_total, svc_items = _build_service_cost(esvc, quantity, sheets_needed)
                    svc_total_all = svc_total * sides_count
                    if sides_count > 1:
                        for item in svc_items:
                            item['units'] = item['units'] * sides_count
                            item['total'] = round(item['total'] * sides_count, 2)
                    service_cost += svc_total_all
                    all_counted_ids.add(esvc.id)
                    service_breakdown.append({
                        'id':       esvc.id,
                        'name':     esvc.name,
                        'sides':    sides_count,
                        'total':    float(svc_total_all.quantize(Decimal('0.01'))),
                        'items':    svc_items,
                        'category': 'side',
                    })

            # 3) Kész termékre vonatkozó szolgáltatások
            finishing_svc_ids = d.get('finishing_service_ids') or []
            if finishing_svc_ids:
                unique_finishing = [int(sid) for sid in finishing_svc_ids if int(sid) not in all_counted_ids]
                if unique_finishing:
                    fin_svcs = Service.objects.filter(id__in=unique_finishing).prefetch_related('cost_items')
                    fin_map = {s.id: s for s in fin_svcs}
                    for sid in unique_finishing:
                        fsvc = fin_map.get(sid)
                        if not fsvc:
                            continue
                        svc_total, svc_items = _build_service_cost(fsvc, quantity, sheets_needed)
                        service_cost += svc_total
                        service_breakdown.append({
                            'id':       fsvc.id,
                            'name':     fsvc.name,
                            'sides':    1,
                            'total':    float(svc_total.quantize(Decimal('0.01'))),
                            'items':    svc_items,
                            'category': 'finishing',
                        })

            # ── Összesítés ───────────────────────────────────────────────────
            subtotal    = print_cost + material_cost + service_cost
            margin_mult = Decimal('1') + margin_pct / 100
            total       = (subtotal * margin_mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            unit_price  = (total / Decimal(str(quantity))).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

            return Response({
                # impozíció
                'items_per_sheet':    items_per_sheet,
                'fit_w':              fit_w,
                'fit_h':              fit_h,
                'rotated':            rotated,
                'sheets_needed':      sheets_needed,
                'clicks_total':       clicks_total,
                'print_sides':        print_sides,
                # production layout
                'full_sheets':            full_sheets,
                'partial_sheet_items':    partial_sheet_items,
                'partial_coverage_pct':   partial_coverage_pct,
                'waste_items':            waste_items,
                'sheet_w_mm':             round(sheet_w_mm, 1),
                'sheet_h_mm':             round(sheet_h_mm, 1),
                # cutting
                'cutting_info':           cutting_info,
                # nyomtatási kt.
                'print_service_name_1':   print_service_name_1,
                'print_service_name_2':   print_service_name_2,
                'print_service_items_1':  print_service_items_1,
                'print_service_items_2':  print_service_items_2,
                'print_cost_side1':   float(print_cost_side1.quantize(Decimal('0.01'))),
                'print_cost_side2':   float(print_cost_side2.quantize(Decimal('0.01'))),
                'print_cost':         float(print_cost.quantize(Decimal('0.01'))),
                # alapanyag
                'material_cost':      float(material_cost),
                'material_name':      material_name,
                'material_items':     material_items,
                'size_comparison':    size_comparison,
                # extra szolg.
                'service_cost':       float(service_cost.quantize(Decimal('0.01'))),
                'service_breakdown':  service_breakdown,
                # végösszeg
                'subtotal':           float(subtotal.quantize(Decimal('0.01'))),
                'margin_pct':         float(margin_pct),
                'total':              float(total),
                'unit_price':         float(unit_price),
                'quantity':           quantity,
                'sheet_count':        sheet_count,
                'total_pieces':       total_pieces,
            })
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

    @action(detail=True, methods=['post'], url_path='preview-share',
            parser_classes=[JSONParser])
    def preview_share(self, request, pk=None):
        """Publikus preview megosztási beállítások frissítése."""
        if not request.user.is_staff:
            return Response({'error': 'Nincs jogosultság'}, status=403)

        order = self.get_object()
        item_id = request.data.get('item_id')
        try:
            item = order.items.get(pk=item_id)
        except PrintOrderItem.DoesNotExist:
            return Response({'error': 'Tétel nem található'}, status=404)

        enabled = _parse_bool(request.data.get('enabled', item.preview_share_enabled), item.preview_share_enabled)
        item.preview_share_enabled = enabled
        item.preview_share_editable = _parse_bool(request.data.get('editable', item.preview_share_editable), item.preview_share_editable)
        item.preview_share_commentable = _parse_bool(request.data.get('commentable', item.preview_share_commentable), item.preview_share_commentable)
        item.preview_share_exportable = _parse_bool(request.data.get('exportable', item.preview_share_exportable), item.preview_share_exportable)

        if not item.preview_share_token:
            item.preview_share_token = secrets.token_urlsafe(24)

        item.save(update_fields=[
            'preview_share_enabled', 'preview_share_token',
            'preview_share_editable', 'preview_share_commentable', 'preview_share_exportable',
        ])

        return Response({
            'enabled': item.preview_share_enabled,
            'editable': item.preview_share_editable,
            'commentable': item.preview_share_commentable,
            'exportable': item.preview_share_exportable,
            'url': _build_preview_share_url(item, request),
            'token': item.preview_share_token,
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


class PrintOrderItemCommentsView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def get_item(self, request, item_id):
        item = get_object_or_404(PrintOrderItem.objects.select_related('order'), pk=item_id)
        if not _user_can_access_print_item(request.user, item):
            return None
        return item

    def get(self, request, item_id):
        item = self.get_item(request, item_id)
        if item is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        comments = item.comments.all()
        return Response(PrintOrderItemCommentSerializer(comments, many=True).data)

    def post(self, request, item_id):
        item = self.get_item(request, item_id)
        if item is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        serializer = PrintOrderItemCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        author_name = serializer.validated_data.get('author_name') or (request.user.get_full_name() or request.user.username)
        comment = PrintOrderItemComment.objects.create(
            item=item,
            user=request.user,
            author_name=author_name,
            **{k: v for k, v in serializer.validated_data.items() if k != 'author_name'}
        )
        return Response(PrintOrderItemCommentSerializer(comment).data, status=201)


class PrintOrderItemCommentDetailView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def get_comment(self, request, item_id, comment_id):
        comment = get_object_or_404(PrintOrderItemComment.objects.select_related('item__order'), pk=comment_id, item_id=item_id)
        if not _user_can_access_print_item(request.user, comment.item):
            return None
        return comment

    def patch(self, request, item_id, comment_id):
        comment = self.get_comment(request, item_id, comment_id)
        if comment is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        serializer = PrintOrderItemCommentSerializer(comment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(comment, field, value)
        comment.save()
        return Response(PrintOrderItemCommentSerializer(comment).data)

    def delete(self, request, item_id, comment_id):
        comment = self.get_comment(request, item_id, comment_id)
        if comment is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        comment.delete()
        return Response(status=204)


class SharedPrintPreviewCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        """List the current user's saved previews (admin sees all). Optional ?folder=<id> or 'root'."""
        qs = SharedPrintPreview.objects.all()
        if not request.user.is_staff:
            qs = qs.filter(created_by=request.user)
        folder = request.query_params.get('folder')
        if folder == 'root' or folder == '':
            qs = qs.filter(folder__isnull=True)
        elif folder:
            try:
                qs = qs.filter(folder_id=int(folder))
            except (TypeError, ValueError):
                pass
        return Response(SharedPrintPreviewSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request):
        from django.utils import timezone
        from datetime import timedelta
        pdf = request.FILES.get('pdf')
        if not pdf:
            return Response({'error': 'PDF feltöltése kötelező'}, status=400)

        folder = None
        folder_id = request.data.get('folder')
        if folder_id:
            try:
                folder = SharedPrintPreviewFolder.objects.get(pk=int(folder_id))
                if not request.user.is_staff and folder.created_by_id != request.user.id:
                    return Response({'error': 'Nincs jogosultság ehhez a mappához'}, status=403)
            except (SharedPrintPreviewFolder.DoesNotExist, TypeError, ValueError):
                return Response({'error': 'Ismeretlen mappa'}, status=400)

        enabled = _parse_bool(request.data.get('enabled'), False)
        preview = SharedPrintPreview.objects.create(
            created_by=request.user,
            folder=folder,
            title=request.data.get('title') or getattr(pdf, 'name', 'Preview PDF'),
            pdf=pdf,
            token=secrets.token_urlsafe(24),
            editable=_parse_bool(request.data.get('editable'), False),
            commentable=_parse_bool(request.data.get('commentable'), True),
            exportable=_parse_bool(request.data.get('exportable'), False),
            is_active=enabled,
            expires_at=(timezone.now() + timedelta(days=14)) if enabled else None,
        )

        raw_annotations = request.data.get('annotations')
        import json
        annotations_list = []
        if raw_annotations:
            try:
                annotations_list = json.loads(raw_annotations) or []
            except Exception:
                annotations_list = []
            for annotation in annotations_list:
                serializer = SharedPrintPreviewCommentSerializer(data=annotation)
                if serializer.is_valid():
                    SharedPrintPreviewComment.objects.create(
                        preview=preview,
                        user=request.user,
                        author_name=serializer.validated_data.get('author_name') or (request.user.get_full_name() or request.user.username),
                        **{k: v for k, v in serializer.validated_data.items() if k != 'author_name'}
                    )

        # Initial version (v1) snapshot
        try:
            pdf.seek(0)
        except Exception:
            pass
        SharedPrintPreviewVersion.objects.create(
            preview=preview,
            version_number=1,
            pdf=pdf,
            annotations=annotations_list,
            note=request.data.get('version_note') or 'Kezdeti mentés',
            created_by=request.user,
        )

        return Response(SharedPrintPreviewSerializer(preview, context={'request': request}).data, status=201)


class SharedPrintPreviewDetailView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def get_object(self, request, token):
        preview = get_object_or_404(SharedPrintPreview, token=token)
        if not request.user.is_staff and preview.created_by_id != request.user.id:
            return None
        return preview

    def get(self, request, token):
        preview = self.get_object(request, token)
        if preview is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        return Response(SharedPrintPreviewSerializer(preview, context={'request': request}).data)

    def patch(self, request, token):
        preview = self.get_object(request, token)
        if preview is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)

        from django.utils import timezone
        from datetime import timedelta
        update_fields = ['updated_at']
        if 'enabled' in request.data:
            new_enabled = _parse_bool(request.data.get('enabled'), preview.is_active)
            if new_enabled and not preview.is_active and (not preview.expires_at or preview.expires_at <= timezone.now()):
                preview.expires_at = timezone.now() + timedelta(days=14)
                update_fields.append('expires_at')
            preview.is_active = new_enabled
            update_fields.append('is_active')
        if 'editable' in request.data:
            preview.editable = _parse_bool(request.data.get('editable'), preview.editable)
            update_fields.append('editable')
        if 'commentable' in request.data:
            preview.commentable = _parse_bool(request.data.get('commentable'), preview.commentable)
            update_fields.append('commentable')
        if 'exportable' in request.data:
            preview.exportable = _parse_bool(request.data.get('exportable'), preview.exportable)
            update_fields.append('exportable')
        if 'title' in request.data:
            preview.title = (request.data.get('title') or '').strip() or preview.title
            update_fields.append('title')
        if 'folder' in request.data:
            raw = request.data.get('folder')
            if raw in (None, '', 'null'):
                preview.folder = None
            else:
                try:
                    folder = SharedPrintPreviewFolder.objects.get(pk=int(raw))
                    if not request.user.is_staff and folder.created_by_id != request.user.id:
                        return Response({'error': 'Nincs jogosultság ehhez a mappához'}, status=403)
                    preview.folder = folder
                except (SharedPrintPreviewFolder.DoesNotExist, TypeError, ValueError):
                    return Response({'error': 'Ismeretlen mappa'}, status=400)
            update_fields.append('folder')
        preview.save(update_fields=update_fields)
        return Response(SharedPrintPreviewSerializer(preview, context={'request': request}).data)

    def delete(self, request, token):
        preview = self.get_object(request, token)
        if preview is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        try:
            if preview.pdf:
                preview.pdf.delete(save=False)
        except Exception:
            pass
        preview.delete()
        return Response(status=204)


class SharedPrintPreviewExtendView(APIView):
    """Extends the expiry of a shared preview by a given number of days (default 14)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request, token):
        from django.utils import timezone
        from datetime import timedelta
        preview = get_object_or_404(SharedPrintPreview, token=token)
        if not request.user.is_staff and preview.created_by_id != request.user.id:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        try:
            days = int(request.data.get('days') or 14)
        except (TypeError, ValueError):
            days = 14
        days = max(1, min(days, 365))
        base = preview.expires_at if (preview.expires_at and preview.expires_at > timezone.now()) else timezone.now()
        preview.expires_at = base + timedelta(days=days)
        preview.save(update_fields=['expires_at', 'updated_at'])
        return Response(SharedPrintPreviewSerializer(preview, context={'request': request}).data)


class SharedPrintPreviewVersionListView(APIView):
    """Verziók listázása és új verzió létrehozása egy preview-hoz."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_preview(self, request, token):
        preview = get_object_or_404(SharedPrintPreview, token=token)
        if not request.user.is_staff and preview.created_by_id != request.user.id:
            return None
        return preview

    def get(self, request, token):
        preview = self._get_preview(request, token)
        if preview is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        versions = preview.versions.all()
        return Response(SharedPrintPreviewVersionSerializer(versions, many=True, context={'request': request}).data)

    def post(self, request, token):
        preview = self._get_preview(request, token)
        if preview is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)

        pdf = request.FILES.get('pdf')
        raw_annotations = request.data.get('annotations')
        note = (request.data.get('note') or '').strip()

        import json
        try:
            annotations = json.loads(raw_annotations) if raw_annotations else []
        except Exception:
            annotations = []

        latest = preview.versions.order_by('-version_number').first()
        next_no = (latest.version_number + 1) if latest else 1

        # If no new PDF, reuse the current preview PDF as snapshot base.
        version_pdf = pdf
        if not version_pdf:
            if not preview.pdf:
                return Response({'error': 'Nincs PDF a verzióhoz'}, status=400)
            # Copy the current preview file as the new version snapshot
            from django.core.files.base import ContentFile
            preview.pdf.open('rb')
            try:
                data = preview.pdf.read()
            finally:
                preview.pdf.close()
            import os as _os
            filename = _os.path.basename(preview.pdf.name) or 'preview.pdf'
            version_pdf = ContentFile(data, name=filename)

        version = SharedPrintPreviewVersion.objects.create(
            preview=preview,
            version_number=next_no,
            pdf=version_pdf,
            annotations=annotations,
            note=note,
            created_by=request.user,
        )

        # Update the main preview PDF to match the new version (so the share link points at latest)
        if pdf:
            preview.pdf = pdf
            preview.save(update_fields=['pdf', 'updated_at'])

        # Replace the preview's live comments with the new snapshot
        preview.comments.all().delete()
        for annotation in annotations:
            ser = SharedPrintPreviewCommentSerializer(data=annotation)
            if ser.is_valid():
                SharedPrintPreviewComment.objects.create(
                    preview=preview,
                    user=request.user,
                    author_name=ser.validated_data.get('author_name') or (request.user.get_full_name() or request.user.username),
                    **{k: v for k, v in ser.validated_data.items() if k != 'author_name'}
                )

        return Response(SharedPrintPreviewVersionSerializer(version, context={'request': request}).data, status=201)


class SharedPrintPreviewVersionPdfView(APIView):
    """Egy adott verzió PDF-jének letöltése."""
    permission_classes = [IsAuthenticated]

    def get(self, request, token, pk):
        preview = get_object_or_404(SharedPrintPreview, token=token)
        if not request.user.is_staff and preview.created_by_id != request.user.id:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        version = get_object_or_404(SharedPrintPreviewVersion, pk=pk, preview=preview)
        if not version.pdf:
            return Response({'error': 'Nincs PDF'}, status=404)
        filename = os.path.basename(version.pdf.name) or f'preview_v{version.version_number}.pdf'
        response = FileResponse(version.pdf.open('rb'), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class SharedPrintPreviewVersionRestoreView(APIView):
    """Egy korábbi verzió visszaállítása: új verziót készít a kiválasztott tartalommal."""
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request, token, pk):
        preview = get_object_or_404(SharedPrintPreview, token=token)
        if not request.user.is_staff and preview.created_by_id != request.user.id:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        source = get_object_or_404(SharedPrintPreviewVersion, pk=pk, preview=preview)

        latest = preview.versions.order_by('-version_number').first()
        next_no = (latest.version_number + 1) if latest else 1

        from django.core.files.base import ContentFile
        source.pdf.open('rb')
        try:
            data = source.pdf.read()
        finally:
            source.pdf.close()
        filename = os.path.basename(source.pdf.name) or 'preview.pdf'
        new_pdf = ContentFile(data, name=filename)

        version = SharedPrintPreviewVersion.objects.create(
            preview=preview,
            version_number=next_no,
            pdf=new_pdf,
            annotations=source.annotations or [],
            note=f'Visszaállítva v{source.version_number} alapján',
            created_by=request.user,
        )

        # Point main preview at restored content
        preview.pdf = ContentFile(data, name=filename)
        preview.save(update_fields=['pdf', 'updated_at'])

        preview.comments.all().delete()
        for annotation in (source.annotations or []):
            ser = SharedPrintPreviewCommentSerializer(data=annotation)
            if ser.is_valid():
                SharedPrintPreviewComment.objects.create(
                    preview=preview,
                    user=request.user,
                    author_name=ser.validated_data.get('author_name') or (request.user.get_full_name() or request.user.username),
                    **{k: v for k, v in ser.validated_data.items() if k != 'author_name'}
                )

        return Response(SharedPrintPreviewVersionSerializer(version, context={'request': request}).data, status=201)


class SharedPrintPreviewFolderListView(APIView):
    """Tárhely mappák listázása és létrehozása."""
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def _user_folders(self, request):
        qs = SharedPrintPreviewFolder.objects.all()
        if not request.user.is_staff:
            qs = qs.filter(created_by=request.user)
        return qs

    def get(self, request):
        qs = self._user_folders(request)
        parent = request.query_params.get('parent')
        if parent == 'root' or parent == '':
            qs = qs.filter(parent__isnull=True)
        elif parent:
            try:
                qs = qs.filter(parent_id=int(parent))
            except (TypeError, ValueError):
                pass
        return Response(SharedPrintPreviewFolderSerializer(qs, many=True).data)

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'A mappa neve kötelező'}, status=400)
        parent = None
        parent_id = request.data.get('parent')
        if parent_id:
            try:
                parent = SharedPrintPreviewFolder.objects.get(pk=int(parent_id))
                if not request.user.is_staff and parent.created_by_id != request.user.id:
                    return Response({'error': 'Nincs jogosultság'}, status=403)
            except (SharedPrintPreviewFolder.DoesNotExist, TypeError, ValueError):
                return Response({'error': 'Ismeretlen szülő mappa'}, status=400)
        folder = SharedPrintPreviewFolder.objects.create(
            created_by=request.user, parent=parent, name=name,
        )
        return Response(SharedPrintPreviewFolderSerializer(folder).data, status=201)


class SharedPrintPreviewFolderDetailView(APIView):
    """Mappa átnevezése / törlése."""
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def _get(self, request, pk):
        folder = get_object_or_404(SharedPrintPreviewFolder, pk=pk)
        if not request.user.is_staff and folder.created_by_id != request.user.id:
            return None
        return folder

    def patch(self, request, pk):
        folder = self._get(request, pk)
        if folder is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        if 'name' in request.data:
            name = (request.data.get('name') or '').strip()
            if not name:
                return Response({'error': 'A mappa neve nem lehet üres'}, status=400)
            folder.name = name
        if 'parent' in request.data:
            raw = request.data.get('parent')
            if raw in (None, '', 'null'):
                folder.parent = None
            else:
                try:
                    new_parent = SharedPrintPreviewFolder.objects.get(pk=int(raw))
                    if new_parent.pk == folder.pk:
                        return Response({'error': 'Önmaga nem lehet szülő'}, status=400)
                    if not request.user.is_staff and new_parent.created_by_id != request.user.id:
                        return Response({'error': 'Nincs jogosultság'}, status=403)
                    folder.parent = new_parent
                except (SharedPrintPreviewFolder.DoesNotExist, TypeError, ValueError):
                    return Response({'error': 'Ismeretlen mappa'}, status=400)
        folder.save()
        return Response(SharedPrintPreviewFolderSerializer(folder).data)

    def delete(self, request, pk):
        folder = self._get(request, pk)
        if folder is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        # Move child previews and folders to parent (or root) instead of cascading delete of files.
        SharedPrintPreview.objects.filter(folder=folder).update(folder=folder.parent)
        SharedPrintPreviewFolder.objects.filter(parent=folder).update(parent=folder.parent)
        folder.delete()
        return Response(status=204)


class SharedPrintPreviewPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, token):
        preview = get_object_or_404(SharedPrintPreview, token=token)
        if not request.user.is_staff and preview.created_by_id != request.user.id:
            return None
        return preview

    def get(self, request, token):
        preview = self.get_object(request, token)
        if preview is None:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        if not preview.pdf:
            return Response({'error': 'Nincs megosztható PDF a previewhoz'}, status=404)

        filename = os.path.basename(preview.pdf.name) or 'preview.pdf'
        response = FileResponse(preview.pdf.open('rb'), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class PublicPrintPreviewView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        target_type, target = _get_public_preview_target(token)
        is_owner = _is_preview_owner(request, target_type, target)
        is_enabled = target.is_active if target_type == 'shared' else target.preview_share_enabled
        if not is_enabled and not is_owner:
            return Response({'error': 'Ez a megosztási link jelenleg nincs engedélyezve'}, status=403)
        if target_type == 'shared' and getattr(target, 'is_expired', False) and not is_owner:
            return Response({'error': 'A megosztási link lejárt'}, status=403)
        if target_type == 'shared' and not target.pdf:
            return Response({'error': 'Nincs megosztható PDF a previewhoz'}, status=404)
        if target_type == 'item' and not target.generated_pdf:
            return Response({'error': 'Nincs megosztható PDF a tételhez'}, status=404)
        return Response({
            'item_id': target.id,
            'product_name': target.title if target_type == 'shared' else target.product_name,
            'pdf_url': request.build_absolute_uri(f'/api/v1/printshop/public-preview/{token}/pdf/'),
            'editable': target.editable if target_type == 'shared' else target.preview_share_editable,
            'commentable': target.commentable if target_type == 'shared' else target.preview_share_commentable,
            'exportable': target.exportable if target_type == 'shared' else target.preview_share_exportable,
            'default_author_name': _get_public_preview_author_name(target_type, target),
            'is_standalone': target_type == 'shared',
        })


class PublicPrintPreviewPdfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        target_type, target = _get_public_preview_target(token)
        is_owner = _is_preview_owner(request, target_type, target)
        is_enabled = target.is_active if target_type == 'shared' else target.preview_share_enabled
        if not is_enabled and not is_owner:
            return Response({'error': 'Ez a megosztási link jelenleg nincs engedélyezve'}, status=403)
        if target_type == 'shared' and getattr(target, 'is_expired', False) and not is_owner:
            return Response({'error': 'A megosztási link lejárt'}, status=403)
        file_field = target.pdf if target_type == 'shared' else target.generated_pdf
        if not file_field:
            return Response({'error': 'Nincs megosztható PDF'}, status=404)
        filename = os.path.basename(file_field.name) or 'preview.pdf'
        response = FileResponse(file_field.open('rb'), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class PublicPrintPreviewCommentsView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def get(self, request, token):
        target_type, target = _get_public_preview_target(token)
        is_owner = _is_preview_owner(request, target_type, target)
        is_enabled = target.is_active if target_type == 'shared' else target.preview_share_enabled
        if not is_enabled and not is_owner:
            return Response({'error': 'Ez a megosztási link jelenleg nincs engedélyezve'}, status=403)
        if target_type == 'shared' and getattr(target, 'is_expired', False) and not is_owner:
            return Response({'error': 'A megosztási link lejárt'}, status=403)
        comments = target.comments.all()
        serializer_cls = SharedPrintPreviewCommentSerializer if target_type == 'shared' else PrintOrderItemCommentSerializer
        return Response(serializer_cls(comments, many=True).data)

    def post(self, request, token):
        target_type, target = _get_public_preview_target(token)
        is_owner = _is_preview_owner(request, target_type, target)
        is_enabled = target.is_active if target_type == 'shared' else target.preview_share_enabled
        if not is_enabled and not is_owner:
            return Response({'error': 'Ez a megosztási link jelenleg nincs engedélyezve'}, status=403)
        if target_type == 'shared' and getattr(target, 'is_expired', False) and not is_owner:
            return Response({'error': 'A megosztási link lejárt'}, status=403)
        commentable = target.commentable if target_type == 'shared' else target.preview_share_commentable
        editable = target.editable if target_type == 'shared' else target.preview_share_editable
        if not commentable and not editable and not is_owner:
            return Response({'error': 'A kommentelés nincs engedélyezve'}, status=403)
        serializer_cls = SharedPrintPreviewCommentSerializer if target_type == 'shared' else PrintOrderItemCommentSerializer
        serializer = serializer_cls(data=request.data)
        serializer.is_valid(raise_exception=True)
        author_name = serializer.validated_data.get('author_name') or _get_public_preview_author_name(target_type, target)
        comment_model = SharedPrintPreviewComment if target_type == 'shared' else PrintOrderItemComment
        relation_field = 'preview' if target_type == 'shared' else 'item'
        comment = comment_model.objects.create(
            **{relation_field: target},
            author_name=author_name,
            **{k: v for k, v in serializer.validated_data.items() if k != 'author_name'}
        )
        return Response(serializer_cls(comment).data, status=201)


class PublicPrintPreviewCommentDetailView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def patch(self, request, token, comment_id):
        target_type, target = _get_public_preview_target(token)
        is_owner = _is_preview_owner(request, target_type, target)
        is_enabled = target.is_active if target_type == 'shared' else target.preview_share_enabled
        if not is_enabled and not is_owner:
            return Response({'error': 'Ez a megosztási link jelenleg nincs engedélyezve'}, status=403)
        if target_type == 'shared' and getattr(target, 'is_expired', False) and not is_owner:
            return Response({'error': 'A megosztási link lejárt'}, status=403)
        editable = target.editable if target_type == 'shared' else target.preview_share_editable
        if not editable and not is_owner:
            return Response({'error': 'A szerkesztés nincs engedélyezve'}, status=403)
        comment_model = SharedPrintPreviewComment if target_type == 'shared' else PrintOrderItemComment
        filter_key = 'preview' if target_type == 'shared' else 'item'
        serializer_cls = SharedPrintPreviewCommentSerializer if target_type == 'shared' else PrintOrderItemCommentSerializer
        comment = get_object_or_404(comment_model, pk=comment_id, **{filter_key: target})
        serializer = serializer_cls(comment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(comment, field, value)
        comment.save()
        return Response(serializer_cls(comment).data)

    def delete(self, request, token, comment_id):
        target_type, target = _get_public_preview_target(token)
        is_owner = _is_preview_owner(request, target_type, target)
        is_enabled = target.is_active if target_type == 'shared' else target.preview_share_enabled
        if not is_enabled and not is_owner:
            return Response({'error': 'Ez a megosztási link jelenleg nincs engedélyezve'}, status=403)
        if target_type == 'shared' and getattr(target, 'is_expired', False) and not is_owner:
            return Response({'error': 'A megosztási link lejárt'}, status=403)
        editable = target.editable if target_type == 'shared' else target.preview_share_editable
        if not editable and not is_owner:
            return Response({'error': 'A szerkesztés nincs engedélyezve'}, status=403)
        comment_model = SharedPrintPreviewComment if target_type == 'shared' else PrintOrderItemComment
        filter_key = 'preview' if target_type == 'shared' else 'item'
        comment = get_object_or_404(comment_model, pk=comment_id, **{filter_key: target})
        comment.delete()
        return Response(status=204)


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


class PdfDecomposeView(APIView):
    """
    Decompose a PDF page into separate elements:
    - Vector drawings → SVG groups (spatially clustered)
    - Raster images → separate base64 PNGs
    - Text → text items with position/font/size/color
    POST multipart: pdf (file), page (int, default 1)
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    PT_TO_MM = 25.4 / 72

    def _cluster_drawings(self, drawings, gap=5):
        """Group drawings whose bounding boxes overlap or are within `gap` pt."""
        import fitz
        if not drawings:
            return []
        rects = []
        for d in drawings:
            r = d.get('rect')
            if r:
                rects.append((fitz.Rect(r), d))

        clusters = []
        used = set()
        for i, (ri, di) in enumerate(rects):
            if i in used:
                continue
            cluster = [di]
            union = fitz.Rect(ri)
            used.add(i)
            changed = True
            while changed:
                changed = False
                for j, (rj, dj) in enumerate(rects):
                    if j in used:
                        continue
                    expanded = fitz.Rect(union.x0 - gap, union.y0 - gap,
                                         union.x1 + gap, union.y1 + gap)
                    if expanded.intersects(rj):
                        cluster.append(dj)
                        union = union | rj
                        used.add(j)
                        changed = True
            clusters.append((union, cluster))
        return clusters

    def _drawing_to_svg_path(self, drawing, offset_x=0, offset_y=0):
        """Convert a PyMuPDF drawing dict to an SVG <path> element string."""
        parts = []
        current_x, current_y = None, None

        for item in drawing.get('items', []):
            kind = item[0]
            if kind == 'l':  # line
                p1, p2 = item[1], item[2]
                sx, sy = p1.x - offset_x, p1.y - offset_y
                ex, ey = p2.x - offset_x, p2.y - offset_y
                if current_x is None or abs(current_x - sx) > 0.01 or abs(current_y - sy) > 0.01:
                    parts.append(f'M {sx:.2f} {sy:.2f}')
                parts.append(f'L {ex:.2f} {ey:.2f}')
                current_x, current_y = ex, ey
            elif kind == 're':  # rect
                r = item[1]
                x0, y0 = r.x0 - offset_x, r.y0 - offset_y
                x1, y1 = r.x1 - offset_x, r.y1 - offset_y
                parts.append(f'M {x0:.2f} {y0:.2f} '
                             f'L {x1:.2f} {y0:.2f} '
                             f'L {x1:.2f} {y1:.2f} '
                             f'L {x0:.2f} {y1:.2f} Z')
                current_x, current_y = None, None
            elif kind == 'c':  # bezier curve
                p1, p2, p3, p4 = item[1], item[2], item[3], item[4]
                sx, sy = p1.x - offset_x, p1.y - offset_y
                if current_x is None or abs(current_x - sx) > 0.01 or abs(current_y - sy) > 0.01:
                    parts.append(f'M {sx:.2f} {sy:.2f}')
                parts.append(f'C {p2.x - offset_x:.2f} {p2.y - offset_y:.2f} '
                             f'{p3.x - offset_x:.2f} {p3.y - offset_y:.2f} '
                             f'{p4.x - offset_x:.2f} {p4.y - offset_y:.2f}')
                current_x, current_y = p4.x - offset_x, p4.y - offset_y
            elif kind == 'qu':  # quad
                q = item[1]
                parts.append(f'M {q.ul.x - offset_x:.2f} {q.ul.y - offset_y:.2f} '
                             f'L {q.ur.x - offset_x:.2f} {q.ur.y - offset_y:.2f} '
                             f'L {q.lr.x - offset_x:.2f} {q.lr.y - offset_y:.2f} '
                             f'L {q.ll.x - offset_x:.2f} {q.ll.y - offset_y:.2f} Z')
                current_x, current_y = None, None

        if drawing.get('closePath') and parts:
            parts.append('Z')
            current_x, current_y = None, None

        if not parts:
            return ''

        d_attr = ' '.join(parts)

        fill = drawing.get('fill')
        stroke = drawing.get('color')
        width = drawing.get('width', 0)
        even_odd = drawing.get('even_odd', False)

        style_parts = []
        if fill:
            r, g, b = [int(c * 255) for c in fill[:3]]
            style_parts.append(f'fill:rgb({r},{g},{b})')
            if drawing.get('fill_opacity') is not None and drawing['fill_opacity'] < 1:
                style_parts.append(f'fill-opacity:{drawing["fill_opacity"]:.2f}')
        else:
            style_parts.append('fill:none')

        if stroke and width:
            r, g, b = [int(c * 255) for c in stroke[:3]]
            style_parts.append(f'stroke:rgb({r},{g},{b})')
            style_parts.append(f'stroke-width:{width:.2f}')
            if drawing.get('stroke_opacity') is not None and drawing['stroke_opacity'] < 1:
                style_parts.append(f'stroke-opacity:{drawing["stroke_opacity"]:.2f}')
        else:
            style_parts.append('stroke:none')

        if even_odd:
            style_parts.append('fill-rule:evenodd')

        style = ';'.join(style_parts)
        return f'<path d="{d_attr}" style="{style}"/>'

    def post(self, request):
        import fitz
        import base64
        import io
        from PIL import Image as PILImage

        pdf_file = request.FILES.get('pdf')
        if not pdf_file:
            return Response({'error': 'PDF fájl szükséges'}, status=400)

        page_num = int(request.data.get('page', 1))

        if pdf_file.size > 50 * 1024 * 1024:
            return Response({'error': 'A fájl túl nagy (max 50 MB)'}, status=400)

        pdf_bytes = pdf_file.read()
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        page_num = max(1, min(page_num, doc.page_count))
        page = doc[page_num - 1]
        mb = page.mediabox
        page_w_pt = mb.width
        page_h_pt = mb.height

        elements = []

        # ── 1. Extract raster images ──────────────────────────────────────────
        images_on_page = page.get_images(full=True)
        for img_info in images_on_page:
            xref = img_info[0]
            try:
                base_image = doc.extract_image(xref)
                if not base_image:
                    continue
                img_bytes = base_image['image']
                ext = base_image.get('ext', 'png')
                mime = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'

                # Find position of this image on the page
                img_rects = page.get_image_rects(xref)
                if not img_rects:
                    continue
                rect = img_rects[0]

                # Convert to proper format if needed
                try:
                    pil_img = PILImage.open(io.BytesIO(img_bytes))
                    if pil_img.mode == 'CMYK':
                        pil_img = pil_img.convert('RGB')
                    buf = io.BytesIO()
                    pil_img.save(buf, format='PNG')
                    img_bytes = buf.getvalue()
                    mime = 'image/png'
                except Exception:
                    pass

                b64 = base64.b64encode(img_bytes).decode('ascii')
                elements.append({
                    'type': 'image',
                    'data_url': f'data:{mime};base64,{b64}',
                    'x_pt': rect.x0,
                    'y_pt': rect.y0,
                    'width_pt': rect.width,
                    'height_pt': rect.height,
                })
            except Exception:
                continue

        # ── 2. Extract vector drawings ────────────────────────────────────────
        drawings = page.get_drawings()

        # Filter out drawings that are exactly on image rects (background rects etc.)
        image_rects = []
        for img_info in images_on_page:
            rects = page.get_image_rects(img_info[0])
            if rects:
                image_rects.append(rects[0])

        vector_drawings = []
        for d in drawings:
            r = fitz.Rect(d.get('rect', (0, 0, 0, 0)))
            if r.is_empty or r.is_infinite:
                continue
            # Skip if this drawing is just a clipping rectangle for an image
            is_image_frame = False
            for ir in image_rects:
                if abs(r.x0 - ir.x0) < 1 and abs(r.y0 - ir.y0) < 1 and abs(r.x1 - ir.x1) < 1 and abs(r.y1 - ir.y1) < 1:
                    is_image_frame = True
                    break
            if is_image_frame:
                continue
            vector_drawings.append(d)

        # Cluster vector drawings into spatial groups
        clusters = self._cluster_drawings(vector_drawings, gap=3)
        for union_rect, cluster_drawings in clusters:
            # Build SVG for this cluster
            svg_paths = []
            for d in cluster_drawings:
                path_str = self._drawing_to_svg_path(d, offset_x=union_rect.x0, offset_y=union_rect.y0)
                if path_str:
                    svg_paths.append(path_str)

            if not svg_paths:
                continue

            w = union_rect.width
            h = union_rect.height
            svg = (
                f'<svg xmlns="http://www.w3.org/2000/svg" '
                f'width="{w:.2f}" height="{h:.2f}" '
                f'viewBox="0 0 {w:.2f} {h:.2f}">'
                + ''.join(svg_paths) +
                '</svg>'
            )

            elements.append({
                'type': 'vector',
                'svg': svg,
                'x_pt': union_rect.x0,
                'y_pt': union_rect.y0,
                'width_pt': w,
                'height_pt': h,
            })

        # ── 3. Extract text ───────────────────────────────────────────────────
        text_dict = page.get_text('dict', flags=fitz.TEXT_PRESERVE_WHITESPACE)
        for block in text_dict.get('blocks', []):
            if block.get('type') != 0:  # type 0 = text
                continue
            for line in block.get('lines', []):
                for span in line.get('spans', []):
                    text = span.get('text', '').strip()
                    if not text:
                        continue

                    font_size = span.get('size', 12)
                    color_int = span.get('color', 0)
                    r = (color_int >> 16) & 0xFF
                    g = (color_int >> 8) & 0xFF
                    b = color_int & 0xFF
                    color_hex = f'#{r:02x}{g:02x}{b:02x}'

                    font_name = span.get('font', 'Helvetica')
                    flags = span.get('flags', 0)
                    is_bold = bool(flags & (1 << 4))
                    is_italic = bool(flags & (1 << 1))

                    origin = span.get('origin', (span['bbox'][0], span['bbox'][1]))

                    elements.append({
                        'type': 'text',
                        'text': text,
                        'x_pt': origin[0],
                        'y_pt': origin[1],
                        'font_size_pt': font_size,
                        'font_name': font_name,
                        'is_bold': is_bold,
                        'is_italic': is_italic,
                        'color': color_hex,
                        'bbox': list(span['bbox']),
                    })

        # ── 4. Extract TrimBox ────────────────────────────────────────────
        trimbox_pt = None
        try:
            raw_media = _get_raw_pdf_box(doc, page.xref, 'MediaBox')
            raw_crop = _get_raw_pdf_box(doc, page.xref, 'CropBox') or raw_media
            raw_trim = _get_raw_pdf_box(doc, page.xref, 'TrimBox')
            if raw_trim and raw_crop:
                crop_x0, crop_y0, crop_x1, crop_y1 = raw_crop
                trim_x0, trim_y0, trim_x1, trim_y1 = raw_trim
                trim_w = trim_x1 - trim_x0
                trim_h = trim_y1 - trim_y0
                if trim_w > 0 and trim_h > 0:
                    trimbox_pt = {
                        'x': round(trim_x0 - crop_x0, 2),
                        'y': round((crop_y1 - trim_y1), 2),
                        'w': round(trim_w, 2),
                        'h': round(trim_h, 2),
                    }
        except Exception:
            pass

        doc.close()

        return Response({
            'page_width_pt': page_w_pt,
            'page_height_pt': page_h_pt,
            'page_width_mm': round(page_w_pt * self.PT_TO_MM, 1),
            'page_height_mm': round(page_h_pt * self.PT_TO_MM, 1),
            'trimbox_pt': trimbox_pt,
            'elements': elements,
        })


class PdfAnalyzeView(APIView):
    """
    PDF elemzés PyMuPDF-fel: TrimBox + színrendszerek oldalanként.
    POST multipart: pdf (file)
    Visszaad: { pages: [ { page, mediabox_mm, trimbox_mm, color_spaces } ] }
    """
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    PT_TO_MM = 25.4 / 72

    def post(self, request):
        pdf_file = request.FILES.get('pdf')
        if not pdf_file:
            return Response({'error': 'PDF fájl szükséges'}, status=400)

        if pdf_file.size > 50 * 1024 * 1024:
            return Response({'error': 'A fájl túl nagy (max 50 MB)'}, status=400)

        try:
            import fitz  # PyMuPDF
        except ImportError:
            return Response({'error': 'PyMuPDF (fitz) nincs telepítve a szerveren'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            try:
                doc = fitz.open(pdf_path)
            except Exception as e:
                return Response({'error': f'PDF megnyitási hiba: {str(e)}'}, status=400)

            pages_info = []
            doc_colors = set()
            for page_num in range(doc.page_count):
                page = doc[page_num]
                mb = page.mediabox  # Rect(x0, y0, x1, y1)
                raw_media = _get_raw_pdf_box(doc, page.xref, 'MediaBox')
                raw_crop = _get_raw_pdf_box(doc, page.xref, 'CropBox') or raw_media

                mediabox_mm = {
                    'width': round(mb.width * self.PT_TO_MM, 1),
                    'height': round(mb.height * self.PT_TO_MM, 1),
                }

                # TrimBox extraction
                trimbox_mm = None
                trimbox_pt = None
                try:
                    raw_trim = _get_raw_pdf_box(doc, page.xref, 'TrimBox')
                    if raw_trim and raw_crop:
                        crop_x0, crop_y0, crop_x1, crop_y1 = raw_crop
                        trim_x0, trim_y0, trim_x1, trim_y1 = raw_trim
                        trim_w = trim_x1 - trim_x0
                        trim_h = trim_y1 - trim_y0
                        if trim_w > 0 and trim_h > 0:
                            trimbox_mm = {
                                'x': round((trim_x0 - crop_x0) * self.PT_TO_MM, 1),
                                'y': round((crop_y1 - trim_y1) * self.PT_TO_MM, 1),
                                'width': round(trim_w * self.PT_TO_MM, 1),
                                'height': round(trim_h * self.PT_TO_MM, 1),
                            }
                            trimbox_pt = {
                                'x': round(trim_x0 - crop_x0, 2),
                                'y': round(crop_y1 - trim_y1, 2),
                                'w': round(trim_w, 2),
                                'h': round(trim_h, 2),
                            }
                except Exception:
                    pass

                # Color space detection from page content
                color_spaces = set()
                try:
                    page_text = page.get_text("rawdict")
                    # Check images for color spaces
                    for img in page.get_images(full=True):
                        xref = img[0]
                        try:
                            pix = fitz.Pixmap(doc, xref)
                            if pix.colorspace:
                                if pix.colorspace.n == 4:
                                    color_spaces.add("CMYK")
                                elif pix.colorspace.n == 3:
                                    color_spaces.add("RGB")
                                elif pix.colorspace.n == 1:
                                    color_spaces.add("Gray")
                            pix = None
                        except Exception:
                            pass
                except Exception:
                    pass

                # Page-level color detection is done via the detailed content stream
                # tokenizer below (not crude pattern matching)

                # Check page resources for color space definitions
                # Build a map of CS resource names → resolved colorspace type
                cs_resolved = {}  # e.g. {"CS0": "RGB", "CS1": "CMYK", "CS5": "Spot"}
                try:
                    res_xref = page.xref
                    res_text = doc.xref_object(res_xref)
                    if res_text:
                        if "/DeviceCMYK" in res_text:
                            color_spaces.add("CMYK")
                        if "/DeviceRGB" in res_text:
                            color_spaces.add("RGB")
                        if "/DeviceGray" in res_text:
                            color_spaces.add("Gray")
                        if "/Separation" in res_text:
                            color_spaces.add("Spot")
                        if re.search(r'(?i)pantone', res_text):
                            color_spaces.add("PANTONE")
                except Exception:
                    pass

                # Scan page-level xrefs for Separation/Pantone (NOT global)
                # This is done per-page through the resource dict scanning below

                # ── Extract page elements (images, text blocks, drawings) ──
                elements = []
                mb_w = mb.width
                mb_h = mb.height

                # Collect page-level spot color info by scanning xref objects
                spot_cs_names = set()
                spot_color_names = {}  # cs_resource_name -> actual spot color name
                _dbg_file = open("/home/ceze/pixisys/pixierp/logs/xobj_debug.log", "a")
                _dbg_file.write(f"\n=== NEW PDF SCAN page {page.number} ===\n")
                _dbg_file.flush()

                def _pdf_name_decode(name):
                    """Decode PDF hex-encoded name: #20 -> space, etc."""
                    return re.sub(r'#([0-9A-Fa-f]{2})', lambda m: chr(int(m.group(1), 16)), name)

                def _resolve_icc(obj_text):
                    """Resolve ICCBased colorspace to RGB/CMYK/Gray by checking /N."""
                    icc_match = re.search(r'/ICCBased\s+(\d+)\s+0\s+R', obj_text)
                    if icc_match:
                        try:
                            icc_obj = doc.xref_object(int(icc_match.group(1)))
                            if icc_obj:
                                n_match = re.search(r'/N\s+(\d+)', icc_obj)
                                if n_match:
                                    n = int(n_match.group(1))
                                    if n == 4: return "CMYK"
                                    elif n == 3: return "RGB"
                                    elif n == 1: return "Gray"
                        except Exception:
                            pass
                    return None

                # Special PDF Separation names that are NOT actual spot colors
                _SPECIAL_SEPARATION_NAMES = {'All', 'None'}

                def _scan_cs_entry(cs_res_name, cs_xref):
                    """Check if a colorspace xref is Separation/DeviceN/Pantone/ICCBased."""
                    try:
                        cs_obj = doc.xref_object(cs_xref)
                        _dbg_file.write(f"_scan_cs_entry({cs_res_name}, xref={cs_xref}): obj={cs_obj[:300] if cs_obj else 'None'}\n")
                        _dbg_file.flush()
                        if not cs_obj:
                            return
                        if "/Separation" in cs_obj or "/DeviceN" in cs_obj:
                            m = re.search(r'/Separation\s*/([^/\s\[\]]+)', cs_obj)
                            sep_name = _pdf_name_decode(m.group(1)) if m else None
                            # Skip special PDF separation names (All = all inks, None = invisible)
                            if sep_name and sep_name in _SPECIAL_SEPARATION_NAMES:
                                # Resolve alternate space instead
                                icc_cs = _resolve_icc(cs_obj)
                                if icc_cs:
                                    cs_resolved[cs_res_name] = icc_cs
                                elif '/DeviceCMYK' in cs_obj:
                                    cs_resolved[cs_res_name] = 'CMYK'
                                elif '/DeviceRGB' in cs_obj:
                                    cs_resolved[cs_res_name] = 'RGB'
                                elif '/DeviceGray' in cs_obj:
                                    cs_resolved[cs_res_name] = 'Gray'
                                return
                            spot_cs_names.add(cs_res_name)
                            cs_resolved[cs_res_name] = "Spot"
                            if sep_name:
                                spot_color_names[cs_res_name] = sep_name
                        if re.search(r'(?i)pantone', cs_obj):
                            spot_cs_names.add(cs_res_name)
                            cs_resolved[cs_res_name] = "Spot"
                            m = re.search(r'(PANTONE[^/\]\)]+)', cs_obj, re.IGNORECASE)
                            if m:
                                spot_color_names[cs_res_name] = _pdf_name_decode(m.group(1).strip())
                        # Resolve ICCBased profiles
                        if cs_res_name not in cs_resolved:
                            icc_cs = _resolve_icc(cs_obj)
                            if icc_cs:
                                cs_resolved[cs_res_name] = icc_cs
                            elif "/DeviceCMYK" in cs_obj:
                                cs_resolved[cs_res_name] = "CMYK"
                            elif "/DeviceRGB" in cs_obj:
                                cs_resolved[cs_res_name] = "RGB"
                            elif "/DeviceGray" in cs_obj:
                                cs_resolved[cs_res_name] = "Gray"
                            elif "/CalRGB" in cs_obj:
                                cs_resolved[cs_res_name] = "RGB"
                            elif "/CalGray" in cs_obj:
                                cs_resolved[cs_res_name] = "Gray"
                    except Exception:
                        pass

                def _scan_cs_dict(cs_dict_text):
                    """Parse a ColorSpace dict text for spot entries."""
                    for cs_entry in re.finditer(r'/(\S+)\s+(\d+)\s+0\s+R', cs_dict_text):
                        _scan_cs_entry(cs_entry.group(1), int(cs_entry.group(2)))
                    # Also handle inline arrays: /CS0 [ /Separation ... ]
                    for cs_entry in re.finditer(r'/(\S+)\s*\[\s*/Separation', cs_dict_text):
                        cs_res_name = cs_entry.group(1)
                        spot_cs_names.add(cs_res_name)
                        m = re.search(r'/Separation\s*/([^/\s\[\]]+)', cs_dict_text[cs_entry.start():])
                        if m:
                            spot_color_names[cs_res_name] = _pdf_name_decode(m.group(1))

                try:
                    page_obj = doc.xref_object(page.xref)

                    # Strategy 1: /Resources N 0 R (external reference)
                    res_match = re.search(r'/Resources\s+(\d+)\s+0\s+R', page_obj)
                    res_text = None
                    if res_match:
                        res_xref = int(res_match.group(1))
                        res_text = doc.xref_object(res_xref)
                    else:
                        # Inline resources in page object
                        res_text = page_obj

                    if res_text:
                        # Case A: /ColorSpace << /CS0 5 0 R ... >>
                        cs_block = re.search(r'/ColorSpace\s*<<([^>]*)>>', res_text)
                        if cs_block:
                            _scan_cs_dict(cs_block.group(1))
                        else:
                            # Case B: /ColorSpace N 0 R (indirect reference)
                            cs_ref = re.search(r'/ColorSpace\s+(\d+)\s+0\s+R', res_text)
                            if cs_ref:
                                cs_dict_xref = int(cs_ref.group(1))
                                cs_dict_text = doc.xref_object(cs_dict_xref)
                                if cs_dict_text:
                                    # It could be a dict: << /CS0 7 0 R >>
                                    inner = re.search(r'<<(.*)>>', cs_dict_text, re.DOTALL)
                                    if inner:
                                        _scan_cs_dict(inner.group(1))
                                    else:
                                        _scan_cs_dict(cs_dict_text)

                    # Fallback: scan all document xrefs for Separation
                    if not spot_cs_names and "Spot" in color_spaces:
                        for x in range(1, doc.xref_length()):
                            try:
                                obj_str = doc.xref_object(x)
                                if obj_str and ("/Separation" in obj_str or re.search(r'(?i)pantone', obj_str)):
                                    m = re.search(r'/Separation\s*/([^/\s\[\]]+)', obj_str)
                                    sep_n = _pdf_name_decode(m.group(1)) if m else None
                                    if sep_n and sep_n in _SPECIAL_SEPARATION_NAMES:
                                        continue
                                    spot_cs_names.add("_global")
                                    if sep_n:
                                        spot_color_names["_global"] = sep_n
                                    m2 = re.search(r'(PANTONE[^/\]\)]+)', obj_str, re.IGNORECASE)
                                    if m2:
                                        spot_color_names["_global"] = _pdf_name_decode(m2.group(1).strip())
                            except Exception:
                                pass
                except Exception:
                    pass
                _dbg_file.write(f"AFTER CS SCAN: spot_cs_names={spot_cs_names}, spot_color_names={spot_color_names}, cs_resolved={cs_resolved}\n")
                _dbg_file.flush()
                try:
                    for img in page.get_images(full=True):
                        xref = img[0]
                        # Check if image xref uses Separation/DeviceN/Pantone colorspace
                        is_spot = False
                        spot_name = None
                        img_cs_from_obj = None
                        try:
                            img_obj = doc.xref_object(xref)
                            if img_obj:
                                if "/Separation" in img_obj or "/DeviceN" in img_obj:
                                    m = re.search(r'/Separation\s*/([^/\s\[\]]+)', img_obj)
                                    sep_name = _pdf_name_decode(m.group(1)) if m else None
                                    if sep_name and sep_name in _SPECIAL_SEPARATION_NAMES:
                                        # Not a real spot color
                                        pass
                                    else:
                                        is_spot = True
                                        spot_name = sep_name
                                elif re.search(r'(?i)pantone', img_obj):
                                    is_spot = True
                                    m = re.search(r'(PANTONE[^/\]\)]+)', img_obj, re.IGNORECASE)
                                    if m:
                                        spot_name = _pdf_name_decode(m.group(1).strip())
                                # Check for ICCBased in the image's ColorSpace
                                icc_cs = _resolve_icc(img_obj)
                                if icc_cs:
                                    img_cs_from_obj = icc_cs
                                # Check for named CS reference: /ColorSpace /CS0
                                cs_name_match = re.search(r'/ColorSpace\s*/(\S+)', img_obj)
                                if cs_name_match:
                                    cs_n = cs_name_match.group(1)
                                    if cs_n in cs_resolved:
                                        img_cs_from_obj = cs_resolved[cs_n]
                                        if cs_resolved[cs_n] == "Spot":
                                            is_spot = True
                                            spot_name = spot_color_names.get(cs_n, spot_name)
                                    elif cs_n == "DeviceCMYK":
                                        img_cs_from_obj = "CMYK"
                                    elif cs_n == "DeviceRGB":
                                        img_cs_from_obj = "RGB"
                                    elif cs_n == "DeviceGray":
                                        img_cs_from_obj = "Gray"
                        except Exception:
                            pass
                        try:
                            # Use Pixmap for colorspace detection
                            pix = fitz.Pixmap(doc, xref)
                            if img_cs_from_obj:
                                # Prefer xref-resolved CS (Pixmap converts Separation → alternate)
                                el_cs = img_cs_from_obj
                            elif pix.colorspace:
                                if pix.colorspace.n == 4:
                                    el_cs = "CMYK"
                                elif pix.colorspace.n == 3:
                                    el_cs = "RGB"
                                elif pix.colorspace.n == 1:
                                    el_cs = "Gray"
                                else:
                                    el_cs = pix.colorspace.name
                            else:
                                el_cs = "Ismeretlen"
                            w_px = pix.width
                            h_px = pix.height
                            pix = None  # free memory
                        except Exception:
                            el_cs = "Ismeretlen"
                            w_px = 0
                            h_px = 0
                        # Find image bbox on page
                        rects = page.get_image_rects(xref)
                        for r in rects:
                            el_data = {
                                'type': 'image',
                                'x': round(r.x0 / mb_w, 4),
                                'y': round(r.y0 / mb_h, 4),
                                'w': round(r.width / mb_w, 4),
                                'h': round(r.height / mb_h, 4),
                                'colorspace': el_cs,
                                'width_px': w_px,
                                'height_px': h_px,
                            }
                            if is_spot:
                                el_data['spot'] = True
                                if spot_name:
                                    el_data['spot_name'] = spot_name
                            elements.append(el_data)
                except Exception:
                    pass

                # Text blocks
                try:
                    text_dict = page.get_text("dict", flags=0)
                    for block in text_dict.get("blocks", []):
                        if block.get("type") == 0:  # text block
                            # Emit per-line elements so different-color lines are separate
                            for line in block.get("lines", []):
                                lbbox = line.get("bbox", [0, 0, 0, 0])
                                font_color = None
                                font_name = ""
                                font_size = 0
                                text_content = ""
                                for span in line.get("spans", []):
                                    if not font_name:
                                        font_name = span.get("font", "")
                                        font_size = round(span.get("size", 0), 1)
                                        raw_color = span.get("color", 0)
                                        if isinstance(raw_color, int):
                                            r = (raw_color >> 16) & 0xFF
                                            g = (raw_color >> 8) & 0xFF
                                            b = raw_color & 0xFF
                                            font_color = f"#{r:02x}{g:02x}{b:02x}"
                                    text_content += span.get("text", "")
                                bw = lbbox[2] - lbbox[0]
                                bh = lbbox[3] - lbbox[1]
                                if bw > 0 and bh > 0 and text_content.strip():
                                    elements.append({
                                        'type': 'text',
                                        'x': round(lbbox[0] / mb_w, 4),
                                        'y': round(lbbox[1] / mb_h, 4),
                                        'w': round(bw / mb_w, 4),
                                        'h': round(bh / mb_h, 4),
                                        'font': font_name,
                                        'font_size': font_size,
                                        'color': font_color,
                                        'text': text_content[:100],
                                    })
                except Exception:
                    pass

                # Vector drawings
                try:
                    drawings = page.get_drawings()
                except Exception:
                    drawings = []

                # Parse content stream to build per-rect/text colorspace maps
                # (get_drawings() converts ALL colors to RGB, losing original CS)
                rect_cs_map = {}  # "x0,y0,x1,y1" -> (cs, is_spot, spot_name)
                text_cs_regions = []  # list of (y_top_down, cs, is_spot, spot_name) for ALL text renders
                spot_path_geoms = []  # list of {ops: [...], spot_name, paint: 'f'|'s'|'fs'} - actual spot path geometry
                all_path_geoms = []  # list of {ops, paint, cs, spot, spot_name, bbox} - all painted paths
                page_height = mb_h
                used_cs_in_stream = set()  # collect all CS used in this page's stream

                def _ctm_concat(m, c):
                    """Multiply affine matrices m × c. Each is (a,b,c,d,e,f)."""
                    a1,b1,c1,d1,e1,f1 = m
                    a2,b2,c2,d2,e2,f2 = c
                    return (
                        a1*a2+b1*c2, a1*b2+b1*d2,
                        c1*a2+d1*c2, c1*b2+d1*d2,
                        e1*a2+f1*c2+e2, e1*b2+f1*d2+f2,
                    )

                def _ctm_apply(x, y, ct):
                    """Transform point (x,y) by CTM ct=(a,b,c,d,e,f)."""
                    a,b,c,d,e,f = ct
                    return (a*x+c*y+e, b*x+d*y+f)

                # Collect Form XObjects from page resources for recursive parsing
                form_xobjects = {}  # name -> (stream_bytes, matrix_tuple)
                import logging as _lg
                _dbg = _lg.getLogger("printshop.xobj_debug")
                def _dbgw(msg):
                    _dbg_file.write(msg + "\n")
                    _dbg_file.flush()
                try:
                    _page_obj = doc.xref_object(page.xref)
                    _dbgw(f"PAGE XREF OBJ (first 500): %s".replace("%s","{0}").replace("%d","{1}") if False else f"PAGE XREF OBJ (first 500): %s" % (_page_obj[:500],) if "%" in "PAGE XREF OBJ (first 500): %s" else f"PAGE XREF OBJ (first 500): %s {_page_obj[:500]}")
                    _res_match = re.search(r'/Resources\s+(\d+)\s+0\s+R', _page_obj)
                    if _res_match:
                        _res_text = doc.xref_object(int(_res_match.group(1)))
                        _dbgw(f"RESOURCES (indirect %s, first 500): %s".replace("%s","{0}").replace("%d","{1}") if False else f"RESOURCES (indirect %s, first 500): %s" % (_res_match.group(1), _res_text[:500] if _res_text else "None",) if "%" in "RESOURCES (indirect %s, first 500): %s" else f"RESOURCES (indirect %s, first 500): %s {_res_match.group(1), _res_text[:500] if _res_text else 'None'}")
                    else:
                        _res_text = _page_obj
                        _dbgw("RESOURCES (inline from page obj)")
                    if _res_text:
                        _xobj_block = re.search(r'/XObject\s*<<([^>]*)>>', _res_text)
                        _xobj_text = None
                        if _xobj_block:
                            _xobj_text = _xobj_block.group(1)
                            _dbgw(f"XOBJECT BLOCK (inline <<>>): %s".replace("%s","{0}").replace("%d","{1}") if False else f"XOBJECT BLOCK (inline <<>>): %s" % (_xobj_text[:300],) if "%" in "XOBJECT BLOCK (inline <<>>): %s" else f"XOBJECT BLOCK (inline <<>>): %s {_xobj_text[:300]}")
                        else:
                            _xobj_ref = re.search(r'/XObject\s+(\d+)\s+0\s+R', _res_text)
                            if _xobj_ref:
                                _xd = doc.xref_object(int(_xobj_ref.group(1)))
                                _dbgw(f"XOBJECT DICT (indirect %s): %s".replace("%s","{0}").replace("%d","{1}") if False else f"XOBJECT DICT (indirect %s): %s" % (_xobj_ref.group(1), _xd[:300] if _xd else "None",) if "%" in "XOBJECT DICT (indirect %s): %s" else f"XOBJECT DICT (indirect %s): %s {_xobj_ref.group(1), _xd[:300] if _xd else 'None'}")
                                if _xd:
                                    _inner = re.search(r'<<(.*)>>', _xd, re.DOTALL)
                                    _xobj_text = _inner.group(1) if _inner else _xd
                            else:
                                _dbgw("NO /XObject found in resources text")
                        if _xobj_text:
                            _dbgw(f"XOBJ_TEXT to scan: %s".replace("%s","{0}").replace("%d","{1}") if False else f"XOBJ_TEXT to scan: %s" % (_xobj_text[:300],) if "%" in "XOBJ_TEXT to scan: %s" else f"XOBJ_TEXT to scan: %s {_xobj_text[:300]}")
                            for _xm in re.finditer(r'/(\S+)\s+(\d+)\s+0\s+R', _xobj_text):
                                _xo_name = _xm.group(1)
                                _xo_xref = int(_xm.group(2))
                                _dbgw(f"Found XObject ref: /%s -> xref %d".replace("%s","{0}").replace("%d","{1}") if False else f"Found XObject ref: /%s -> xref %d" % (_xo_name, _xo_xref,) if "%" in "Found XObject ref: /%s -> xref %d" else f"Found XObject ref: /%s -> xref %d {_xo_name, _xo_xref}")
                                try:
                                    _xo_obj = doc.xref_object(_xo_xref)
                                    _dbgw(f"XObj %s obj (first 200): %s".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s obj (first 200): %s" % (_xo_name, _xo_obj[:200] if _xo_obj else "None",) if "%" in "XObj %s obj (first 200): %s" else f"XObj %s obj (first 200): %s {_xo_name, _xo_obj[:200] if _xo_obj else 'None'}")
                                    if _xo_obj and '/Subtype /Form' in _xo_obj:
                                        _xo_stream = doc.xref_stream(_xo_xref)
                                        _dbgw(f"XObj %s is Form, stream len=%d".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s is Form, stream len=%d" % (_xo_name, len(_xo_stream) if _xo_stream else 0,) if "%" in "XObj %s is Form, stream len=%d" else f"XObj %s is Form, stream len=%d {_xo_name, len(_xo_stream) if _xo_stream else 0}")
                                        if _xo_stream:
                                            _xo_matrix = (1, 0, 0, 1, 0, 0)
                                            _mm = re.search(r'/Matrix\s*\[\s*([\d.\-\s]+)\]', _xo_obj)
                                            if _mm:
                                                _vals = _mm.group(1).split()
                                                if len(_vals) == 6:
                                                    _xo_matrix = tuple(float(v) for v in _vals)
                                            form_xobjects[_xo_name] = (_xo_stream, _xo_matrix)
                                            # Scan XObject resources for additional spot CS
                                            _xo_res_block = re.search(r'/Resources\s*<<', _xo_obj)
                                            if _xo_res_block:
                                                _xo_cs_block = re.search(r'/ColorSpace\s*<<([^>]*)>>', _xo_obj[_xo_res_block.start():])
                                                if _xo_cs_block:
                                                    _dbgw(f"XObj %s has CS block: %s".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s has CS block: %s" % (_xo_name, _xo_cs_block.group(1)[:200],) if "%" in "XObj %s has CS block: %s" else f"XObj %s has CS block: %s {_xo_name, _xo_cs_block.group(1)[:200]}")
                                                    for _cs_e in re.finditer(r'/(\S+)\s+(\d+)\s+0\s+R', _xo_cs_block.group(1)):
                                                        _scan_cs_entry(_cs_e.group(1), int(_cs_e.group(2)))
                                    else:
                                        _dbgw(f"XObj %s NOT Form (no /Subtype /Form)".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s NOT Form (no /Subtype /Form)" % (_xo_name,) if "%" in "XObj %s NOT Form (no /Subtype /Form)" else f"XObj %s NOT Form (no /Subtype /Form) {_xo_name}")
                                except Exception as _xe:
                                    _dbgw(f"XObj %s exception: %s".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s exception: %s" % (_xo_name, _xe,) if "%" in "XObj %s exception: %s" else f"XObj %s exception: %s {_xo_name, _xe}")
                        else:
                            _dbgw("xobj_text is None/empty")
                    else:
                        _dbgw("res_text is None")
                except Exception as _ex:
                    _dbgw(f"Form XObject collection EXCEPTION: %s".replace("%s","{0}").replace("%d","{1}") if False else f"Form XObject collection EXCEPTION: %s" % (_ex,) if "%" in "Form XObject collection EXCEPTION: %s" else f"Form XObject collection EXCEPTION: %s {_ex}")
                _dbgw(f"FORM_XOBJECTS collected: %s".replace("%s","{0}").replace("%d","{1}") if False else f"FORM_XOBJECTS collected: %s" % (list(form_xobjects.keys()),) if "%" in "FORM_XOBJECTS collected: %s" else f"FORM_XOBJECTS collected: %s {list(form_xobjects.keys())}")

                do_calls = []  # (xo_name, ctm_at_call)

                def _parse_stream(stream_text, initial_ctm):
                    """Parse a PDF content stream, updating rect_cs_map, text_cs_regions, used_cs_in_stream."""
                    tokens = stream_text.split()
                    cur_fill_cs = None
                    cur_stroke_cs = None
                    cur_fill_spot = False
                    cur_stroke_spot = False
                    cur_fill_spot_name = None
                    cur_stroke_spot_name = None
                    path_rects = []
                    path_points = []
                    path_ops = []  # list of ('M'|'L'|'C'|'RE'|'Z', *coords) in TOP-DOWN page coords
                    gs_stack = []
                    ctm = initial_ctm
                    text_tm = None
                    i = 0
                    while i < len(tokens):
                        tok = tokens[i]
                        if tok == 'q':
                            gs_stack.append((cur_fill_cs, cur_stroke_cs, cur_fill_spot, cur_stroke_spot, cur_fill_spot_name, cur_stroke_spot_name, ctm))
                        elif tok == 'Q':
                            if gs_stack:
                                cur_fill_cs, cur_stroke_cs, cur_fill_spot, cur_stroke_spot, cur_fill_spot_name, cur_stroke_spot_name, ctm = gs_stack.pop()
                            path_rects = []
                            path_points = []
                            path_ops = []
                        elif tok == 'cm' and i >= 6:
                            try:
                                cm_a = float(tokens[i-6])
                                cm_b = float(tokens[i-5])
                                cm_c = float(tokens[i-4])
                                cm_d = float(tokens[i-3])
                                cm_e = float(tokens[i-2])
                                cm_f = float(tokens[i-1])
                                ctm = _ctm_concat((cm_a, cm_b, cm_c, cm_d, cm_e, cm_f), ctm)
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'k' and i >= 4:
                            cur_fill_cs = "CMYK"
                            cur_fill_spot = False
                            cur_fill_spot_name = None
                            used_cs_in_stream.add("CMYK")
                        elif tok == 'rg' and i >= 3:
                            cur_fill_cs = "RGB"
                            cur_fill_spot = False
                            cur_fill_spot_name = None
                            used_cs_in_stream.add("RGB")
                        elif tok == 'g' and i >= 1:
                            cur_fill_cs = "Gray"
                            cur_fill_spot = False
                            cur_fill_spot_name = None
                            used_cs_in_stream.add("Gray")
                        elif tok == 'K' and i >= 4:
                            cur_stroke_cs = "CMYK"
                            cur_stroke_spot = False
                            used_cs_in_stream.add("CMYK")
                        elif tok == 'RG' and i >= 3:
                            cur_stroke_cs = "RGB"
                            cur_stroke_spot = False
                            used_cs_in_stream.add("RGB")
                        elif tok == 'G' and i >= 1:
                            cur_stroke_cs = "Gray"
                            cur_stroke_spot = False
                            used_cs_in_stream.add("Gray")
                        elif tok == 'cs' and i >= 1 and tokens[i-1].startswith('/'):
                            cs_name = tokens[i-1][1:]
                            _dbg_file.write(f"CS operator: /{cs_name} cs -> in spot_cs_names={cs_name in spot_cs_names}, in cs_resolved={cs_resolved.get(cs_name, 'NOT_FOUND')}\n")
                            _dbg_file.flush()
                            if cs_name in spot_cs_names:
                                cur_fill_cs = "Spot"
                                cur_fill_spot = True
                                cur_fill_spot_name = spot_color_names.get(cs_name)
                                used_cs_in_stream.add("Spot")
                            elif cs_name in ('DeviceCMYK',):
                                cur_fill_cs = "CMYK"
                                cur_fill_spot = False
                                cur_fill_spot_name = None
                                used_cs_in_stream.add("CMYK")
                            elif cs_name in ('DeviceRGB',):
                                cur_fill_cs = "RGB"
                                cur_fill_spot = False
                                cur_fill_spot_name = None
                                used_cs_in_stream.add("RGB")
                            elif cs_name in ('DeviceGray',):
                                cur_fill_cs = "Gray"
                                cur_fill_spot = False
                                cur_fill_spot_name = None
                                used_cs_in_stream.add("Gray")
                            elif cs_name in cs_resolved:
                                resolved = cs_resolved[cs_name]
                                cur_fill_cs = resolved
                                cur_fill_spot = resolved == "Spot"
                                cur_fill_spot_name = spot_color_names.get(cs_name) if cur_fill_spot else None
                                used_cs_in_stream.add(resolved)
                            else:
                                cur_fill_spot = False
                                cur_fill_spot_name = None
                        elif tok == 'CS' and i >= 1 and tokens[i-1].startswith('/'):
                            cs_name = tokens[i-1][1:]
                            if cs_name in spot_cs_names:
                                cur_stroke_cs = "Spot"
                                cur_stroke_spot = True
                                cur_stroke_spot_name = spot_color_names.get(cs_name)
                                used_cs_in_stream.add("Spot")
                            elif cs_name in ('DeviceCMYK',):
                                cur_stroke_cs = "CMYK"
                                cur_stroke_spot = False
                                cur_stroke_spot_name = None
                                used_cs_in_stream.add("CMYK")
                            elif cs_name in ('DeviceRGB',):
                                cur_stroke_cs = "RGB"
                                cur_stroke_spot = False
                                cur_stroke_spot_name = None
                                used_cs_in_stream.add("RGB")
                            elif cs_name in ('DeviceGray',):
                                cur_stroke_cs = "Gray"
                                cur_stroke_spot = False
                                cur_stroke_spot_name = None
                                used_cs_in_stream.add("Gray")
                            elif cs_name in cs_resolved:
                                resolved = cs_resolved[cs_name]
                                cur_stroke_cs = resolved
                                cur_stroke_spot = resolved == "Spot"
                                cur_stroke_spot_name = spot_color_names.get(cs_name) if cur_stroke_spot else None
                                used_cs_in_stream.add(resolved)
                            else:
                                cur_stroke_spot = False
                                cur_stroke_spot_name = None
                        elif tok == 'scn':
                            pass
                        elif tok == 'SCN':
                            pass
                        elif tok == 'BT':
                            text_tm = (1, 0, 0, 1, 0, 0)
                        elif tok == 'ET':
                            text_tm = None
                        elif tok == 'Tm' and i >= 6:
                            try:
                                text_tm = (float(tokens[i-6]), float(tokens[i-5]),
                                           float(tokens[i-4]), float(tokens[i-3]),
                                           float(tokens[i-2]), float(tokens[i-1]))
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'Td' and i >= 2:
                            try:
                                tx = float(tokens[i-2])
                                ty = float(tokens[i-1])
                                if text_tm:
                                    a, b, c, d = text_tm[0], text_tm[1], text_tm[2], text_tm[3]
                                    text_tm = (a, b, c, d,
                                               tx * a + ty * c + text_tm[4],
                                               tx * b + ty * d + text_tm[5])
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'TD' and i >= 2:
                            try:
                                tx = float(tokens[i-2])
                                ty = float(tokens[i-1])
                                if text_tm:
                                    a, b, c, d = text_tm[0], text_tm[1], text_tm[2], text_tm[3]
                                    text_tm = (a, b, c, d,
                                               tx * a + ty * c + text_tm[4],
                                               tx * b + ty * d + text_tm[5])
                            except (ValueError, IndexError):
                                pass
                        elif tok in ('Tj', 'TJ', "'", '"') or tok.endswith(']TJ') or tok.endswith(']Tj') or tok.endswith(')Tj') or tok.endswith(')TJ'):
                            if text_tm and cur_fill_cs:
                                tx, ty = _ctm_apply(text_tm[4], text_tm[5], ctm)
                                td_y = page_height - ty
                                text_cs_regions.append((td_y, cur_fill_cs, cur_fill_spot, cur_fill_spot_name))
                        # Do operator — record XObject call for recursive parsing
                        elif tok == 'Do' and i >= 1 and tokens[i-1].startswith('/'):
                            xo_name = tokens[i-1][1:]
                            if xo_name in form_xobjects:
                                do_calls.append((xo_name, ctm))
                        elif tok == 'm' and i >= 2:
                            try:
                                px = float(tokens[i-2])
                                py = float(tokens[i-1])
                                pt = _ctm_apply(px, py, ctm)
                                path_points = [pt]
                                path_ops.append(('M', pt[0], page_height - pt[1]))
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'l' and i >= 2:
                            try:
                                px = float(tokens[i-2])
                                py = float(tokens[i-1])
                                pt = _ctm_apply(px, py, ctm)
                                path_points.append(pt)
                                path_ops.append(('L', pt[0], page_height - pt[1]))
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'c' and i >= 6:
                            try:
                                cps = []
                                for ci in range(3):
                                    px = float(tokens[i-6+ci*2])
                                    py = float(tokens[i-5+ci*2])
                                    pt = _ctm_apply(px, py, ctm)
                                    path_points.append(pt)
                                    cps.append(pt)
                                path_ops.append(('C',
                                                 cps[0][0], page_height - cps[0][1],
                                                 cps[1][0], page_height - cps[1][1],
                                                 cps[2][0], page_height - cps[2][1]))
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'h':
                            path_ops.append(('Z',))
                        elif tok == 're' and i >= 4:
                            try:
                                rx = float(tokens[i-4])
                                ry = float(tokens[i-3])
                                rw = float(tokens[i-2])
                                rh = float(tokens[i-1])
                                corners = [
                                    _ctm_apply(rx, ry, ctm),
                                    _ctm_apply(rx+rw, ry, ctm),
                                    _ctm_apply(rx+rw, ry+rh, ctm),
                                    _ctm_apply(rx, ry+rh, ctm),
                                ]
                                cxs = [c[0] for c in corners]
                                cys = [c[1] for c in corners]
                                bx0 = min(cxs)
                                by0 = min(cys)
                                bx1 = max(cxs)
                                by1 = max(cys)
                                td_x0 = bx0
                                td_y0 = page_height - by1
                                td_x1 = bx1
                                td_y1 = page_height - by0
                                path_rects.append((td_x0, td_y0, td_x1, td_y1))
                                # Also record as a 4-segment path
                                path_ops.append(('M', td_x0, td_y0))
                                path_ops.append(('L', td_x1, td_y0))
                                path_ops.append(('L', td_x1, td_y1))
                                path_ops.append(('L', td_x0, td_y1))
                                path_ops.append(('Z',))
                            except (ValueError, IndexError):
                                pass
                        elif tok in ('f', 'F', 'f*', 'B', 'B*', 'b', 'b*'):
                            if path_points and not path_rects:
                                xs = [p[0] for p in path_points]
                                ys = [p[1] for p in path_points]
                                bx0 = min(xs)
                                by0 = min(ys)
                                bx1 = max(xs)
                                by1 = max(ys)
                                td_x0 = bx0
                                td_y0 = page_height - by1
                                td_x1 = bx1
                                td_y1 = page_height - by0
                                path_rects.append((td_x0, td_y0, td_x1, td_y1))
                            for pr in path_rects:
                                key = f"{pr[0]:.1f},{pr[1]:.1f},{pr[2]:.1f},{pr[3]:.1f}"
                                rect_cs_map[key] = (cur_fill_cs or "Ismeretlen", cur_fill_spot, cur_fill_spot_name)
                            # Record actual spot path geometry
                            if path_ops and (cur_fill_spot or (tok in ('B', 'B*', 'b', 'b*') and cur_stroke_spot)):
                                paint = 'fs' if tok in ('B', 'B*', 'b', 'b*') else 'f'
                                spot_path_geoms.append({
                                    'ops': list(path_ops),
                                    'paint': paint,
                                    'spot_name': cur_fill_spot_name or cur_stroke_spot_name,
                                })
                            # Record geometry for all paints (used for vector selection)
                            if path_ops and path_rects:
                                _bbox = (
                                    min(pr[0] for pr in path_rects),
                                    min(pr[1] for pr in path_rects),
                                    max(pr[2] for pr in path_rects),
                                    max(pr[3] for pr in path_rects),
                                )
                                _paint = 'fs' if tok in ('B', 'B*', 'b', 'b*') else 'f'
                                all_path_geoms.append({
                                    'ops': list(path_ops),
                                    'paint': _paint,
                                    'cs': cur_fill_cs or 'Ismeretlen',
                                    'spot': cur_fill_spot,
                                    'spot_name': cur_fill_spot_name or cur_stroke_spot_name,
                                    'bbox': _bbox,
                                })
                            path_rects = []
                            path_points = []
                            path_ops = []
                        elif tok in ('S', 's'):
                            if path_points and not path_rects:
                                xs = [p[0] for p in path_points]
                                ys = [p[1] for p in path_points]
                                bx0 = min(xs)
                                by0 = min(ys)
                                bx1 = max(xs)
                                by1 = max(ys)
                                td_x0 = bx0
                                td_y0 = page_height - by1
                                td_x1 = bx1
                                td_y1 = page_height - by0
                                path_rects.append((td_x0, td_y0, td_x1, td_y1))
                            for pr in path_rects:
                                key = f"{pr[0]:.1f},{pr[1]:.1f},{pr[2]:.1f},{pr[3]:.1f}"
                                rect_cs_map[key] = (cur_stroke_cs or "Ismeretlen", cur_stroke_spot, cur_stroke_spot_name)
                            # Record actual spot path geometry (stroke)
                            if path_ops and cur_stroke_spot:
                                spot_path_geoms.append({
                                    'ops': list(path_ops),
                                    'paint': 's',
                                    'spot_name': cur_stroke_spot_name,
                                })
                            # Record geometry for all stroked paths
                            if path_ops and path_rects:
                                _bbox = (
                                    min(pr[0] for pr in path_rects),
                                    min(pr[1] for pr in path_rects),
                                    max(pr[2] for pr in path_rects),
                                    max(pr[3] for pr in path_rects),
                                )
                                all_path_geoms.append({
                                    'ops': list(path_ops),
                                    'paint': 's',
                                    'cs': cur_stroke_cs or 'Ismeretlen',
                                    'spot': cur_stroke_spot,
                                    'spot_name': cur_stroke_spot_name,
                                    'bbox': _bbox,
                                })
                            path_rects = []
                            path_points = []
                            path_ops = []
                        elif tok == 'n':
                            path_rects = []
                            path_points = []
                            path_ops = []
                        i += 1

                # Parse page content streams
                try:
                    for c_xref in page.get_contents():
                        stream = doc.xref_stream(c_xref)
                        if not stream:
                            continue
                        _stream_text = stream.decode("latin-1", errors="replace")
                        _dbgw(f"PAGE STREAM xref=%d len=%d first200: %s".replace("%s","{0}").replace("%d","{1}") if False else f"PAGE STREAM xref=%d len=%d first200: %s" % (c_xref, len(_stream_text), _stream_text[:200],) if "%" in "PAGE STREAM xref=%d len=%d first200: %s" else f"PAGE STREAM xref=%d len=%d first200: %s {c_xref, len(_stream_text), _stream_text[:200]}")
                        _parse_stream(_stream_text, (1, 0, 0, 1, 0, 0))
                except Exception as _pex:
                    _dbgw(f"PAGE STREAM EXCEPTION: %s".replace("%s","{0}").replace("%d","{1}") if False else f"PAGE STREAM EXCEPTION: %s" % (_pex,) if "%" in "PAGE STREAM EXCEPTION: %s" else f"PAGE STREAM EXCEPTION: %s {_pex}")

                _dbgw(f"AFTER PAGE STREAMS: do_calls=%d, rect_cs_map=%d entries, text_cs_regions=%d".replace("%s","{0}").replace("%d","{1}") if False else f"AFTER PAGE STREAMS: do_calls=%d, rect_cs_map=%d entries, text_cs_regions=%d" % (len(do_calls), len(rect_cs_map), len(text_cs_regions),) if "%" in "AFTER PAGE STREAMS: do_calls=%d, rect_cs_map=%d entries, text_cs_regions=%d" else f"AFTER PAGE STREAMS: do_calls=%d, rect_cs_map=%d entries, text_cs_regions=%d {len(do_calls), len(rect_cs_map), len(text_cs_regions)}")
                for _dc_name, _dc_ctm in do_calls:
                    _dbgw(f"  DO CALL: %s ctm=%s".replace("%s","{0}").replace("%d","{1}") if False else f"  DO CALL: %s ctm=%s" % (_dc_name, _dc_ctm,) if "%" in "  DO CALL: %s ctm=%s" else f"  DO CALL: %s ctm=%s {_dc_name, _dc_ctm}")

                # Parse Form XObject streams (Illustrator renders spot content via XObjects)
                for _xo_name, _call_ctm in do_calls:
                    if _xo_name in form_xobjects:
                        try:
                            _xo_bytes, _xo_matrix = form_xobjects[_xo_name]
                            _composed_ctm = _ctm_concat(_xo_matrix, _call_ctm)
                            _xo_text = _xo_bytes.decode("latin-1", errors="replace")
                            _dbgw(f"PARSING XOBJ %s: stream_len=%d first200: %s".replace("%s","{0}").replace("%d","{1}") if False else f"PARSING XOBJ %s: stream_len=%d first200: %s" % (_xo_name, len(_xo_text), _xo_text[:200],) if "%" in "PARSING XOBJ %s: stream_len=%d first200: %s" else f"PARSING XOBJ %s: stream_len=%d first200: %s {_xo_name, len(_xo_text), _xo_text[:200]}")
                            _parse_stream(_xo_text, _composed_ctm)
                        except Exception as _xex:
                            _dbgw(f"XOBJ %s parse EXCEPTION: %s".replace("%s","{0}").replace("%d","{1}") if False else f"XOBJ %s parse EXCEPTION: %s" % (_xo_name, _xex,) if "%" in "XOBJ %s parse EXCEPTION: %s" else f"XOBJ %s parse EXCEPTION: %s {_xo_name, _xex}")

                _dbgw(f"FINAL: rect_cs_map=%d entries, text_cs_regions=%d".replace("%s","{0}").replace("%d","{1}") if False else f"FINAL: rect_cs_map=%d entries, text_cs_regions=%d" % (len(rect_cs_map), len(text_cs_regions),) if "%" in "FINAL: rect_cs_map=%d entries, text_cs_regions=%d" else f"FINAL: rect_cs_map=%d entries, text_cs_regions=%d {len(rect_cs_map), len(text_cs_regions)}")
                for _rk, _rv in list(rect_cs_map.items())[:20]:
                    _dbgw(f"  rect_cs_map[%s] = %s".replace("%s","{0}").replace("%d","{1}") if False else f"  rect_cs_map[%s] = %s" % (_rk, _rv,) if "%" in "  rect_cs_map[%s] = %s" else f"  rect_cs_map[%s] = %s {_rk, _rv}")
                for _tsr in text_cs_regions[:10]:
                    _dbgw(f"  text_spot_region: %s".replace("%s","{0}").replace("%d","{1}") if False else f"  text_spot_region: %s" % (_tsr,) if "%" in "  text_spot_region: %s" else f"  text_spot_region: %s {_tsr}")

                # Enrich page-level color_spaces from content stream detections
                color_spaces.update(used_cs_in_stream)
                # Also check for PANTONE names in spot colors used
                for sn in spot_color_names.values():
                    if 'pantone' in sn.lower():
                        color_spaces.add("PANTONE")

                # Enrich text elements with colorspace info from content stream
                if text_cs_regions:
                    _dbg_file.write(f"TEXT CS ENRICHMENT: {len(text_cs_regions)} regions, {len([e for e in elements if e.get('type')=='text'])} text elements\n")
                    for tcr in text_cs_regions:
                        _dbg_file.write(f"  text_cs_region: y={tcr[0]:.1f} cs={tcr[1]} spot={tcr[2]} name={tcr[3]}\n")
                    for el in elements:
                        if el.get('type') == 'text' and not el.get('colorspace'):
                            el_y0 = el['y'] * mb_h
                            el_y1 = el_y0 + el['h'] * mb_h
                            _dbg_file.write(f"  TEXT EL '{el.get('text','')}' y0={el_y0:.1f} y1={el_y1:.1f}\n")
                            matched = False
                            for (tsr_y, tsr_cs, tsr_spot, tsr_spot_name) in text_cs_regions:
                                if el_y0 - 5 <= tsr_y <= el_y1 + 5:
                                    el['colorspace'] = tsr_cs or 'Ismeretlen'
                                    _dbg_file.write(f"    MATCHED: tsr_y={tsr_y:.1f} -> cs={tsr_cs}\n")
                                    if tsr_spot:
                                        el['spot'] = True
                                        if tsr_spot_name:
                                            el['spot_name'] = tsr_spot_name
                                    matched = True
                                    break
                            if not matched:
                                _dbg_file.write(f"    NO MATCH\n")
                    _dbg_file.flush()

                if drawings:
                    all_rects = []
                    for d in drawings:
                        r = d.get("rect")
                        if r and r.width > 0 and r.height > 0:
                            # Look up the actual colorspace from content stream
                            key = f"{r.x0:.1f},{r.y0:.1f},{r.x1:.1f},{r.y1:.1f}"
                            cs_info = rect_cs_map.get(key)
                            if cs_info:
                                vec_cs, vec_spot, vec_spot_name = cs_info
                            else:
                                # Fallback: try rounding to integers
                                key2 = f"{r.x0:.0f},{r.y0:.0f},{r.x1:.0f},{r.y1:.0f}"
                                cs_info2 = rect_cs_map.get(key2)
                                if cs_info2:
                                    vec_cs, vec_spot, vec_spot_name = cs_info2
                                else:
                                    vec_cs = "Ismeretlen"
                                    vec_spot = False
                                    vec_spot_name = None
                            all_rects.append({
                                'rect': r,
                                'cs': vec_cs,
                                'spot': vec_spot,
                                'spot_name': vec_spot_name,
                            })
                    # Merge overlapping vector rects into groups, but keep
                    # CMYK and spot rects separate so a large spot bbox doesn't
                    # absorb CMYK content (and vice versa).
                    merged = []
                    for vr in all_rects:
                        r = vr['rect']
                        vr_spot = bool(vr.get('spot'))
                        found = False
                        for m in merged:
                            if bool(m.get('spot')) != vr_spot:
                                continue
                            if r.intersects(m['rect']):
                                m['rect'] = m['rect'] | r  # union
                                if vr['cs'] != "Ismeretlen":
                                    m['cs'] = vr['cs']
                                if vr.get('spot_name'):
                                    m['spot_name'] = vr['spot_name']
                                found = True
                                break
                        if not found:
                            merged.append({'rect': fitz.Rect(r), 'cs': vr['cs'], 'spot': vr_spot, 'spot_name': vr.get('spot_name')})
                    for m in merged:
                        r = m['rect']
                        vel = {
                            'type': 'vector',
                            'x': round(r.x0 / mb_w, 4),
                            'y': round(r.y0 / mb_h, 4),
                            'w': round(r.width / mb_w, 4),
                            'h': round(r.height / mb_h, 4),
                            'colorspace': m['cs'],
                        }
                        if m.get('spot'):
                            vel['spot'] = True
                            if m.get('spot_name'):
                                vel['spot_name'] = m['spot_name']
                        # Attach combined SVG path data of all paths whose bbox
                        # falls inside this merged element rect (and matches spot/non-spot).
                        try:
                            d_parts = []
                            tol = 2.0
                            el_spot = bool(m.get('spot'))
                            cs_counts = {}
                            for g in all_path_geoms:
                                if bool(g.get('spot')) != el_spot:
                                    continue
                                gb = g['bbox']
                                # Match if path's center is inside element rect (looser than full containment)
                                gcx = (gb[0] + gb[2]) / 2.0
                                gcy = (gb[1] + gb[3]) / 2.0
                                inside = (gcx >= r.x0 - tol and gcx <= r.x1 + tol and
                                          gcy >= r.y0 - tol and gcy <= r.y1 + tol)
                                if not inside:
                                    continue
                                gcs = g.get('cs') or 'Ismeretlen'
                                if gcs and gcs != 'Ismeretlen':
                                    cs_counts[gcs] = cs_counts.get(gcs, 0) + 1
                                for op in g['ops']:
                                    if op[0] == 'M':
                                        d_parts.append(f"M{op[1]:.2f},{op[2]:.2f}")
                                    elif op[0] == 'L':
                                        d_parts.append(f"L{op[1]:.2f},{op[2]:.2f}")
                                    elif op[0] == 'C':
                                        d_parts.append(f"C{op[1]:.2f},{op[2]:.2f} {op[3]:.2f},{op[4]:.2f} {op[5]:.2f},{op[6]:.2f}")
                                    elif op[0] == 'Z':
                                        d_parts.append("Z")
                            if d_parts:
                                vel['path_d'] = ' '.join(d_parts)
                            # If element CS is unknown, derive from most common path CS
                            if (vel.get('colorspace') in (None, '', 'Ismeretlen')) and cs_counts:
                                top_cs = max(cs_counts.items(), key=lambda kv: kv[1])[0]
                                vel['colorspace'] = top_cs
                            _dbgw(f"VEC EL spot={el_spot} bbox=({r.x0:.1f},{r.y0:.1f},{r.x1:.1f},{r.y1:.1f}) all_geoms={len(all_path_geoms)} matched={len(d_parts)} cs_counts={cs_counts} final_cs={vel.get('colorspace')}")
                        except Exception as _vex:
                            _dbgw(f"VEC EL path_d EXC: {_vex}")
                            pass
                        elements.append(vel)

                # Build SVG-style spot paths directly from collected geometry
                # (recorded during stream parsing, so CMYK paths are never included).
                spot_paths = []
                for geom in spot_path_geoms:
                    d_parts = []
                    last_is_move = False
                    for op in geom['ops']:
                        if op[0] == 'M':
                            d_parts.append(f"M{op[1]:.2f},{op[2]:.2f}")
                            last_is_move = True
                        elif op[0] == 'L':
                            d_parts.append(f"L{op[1]:.2f},{op[2]:.2f}")
                            last_is_move = False
                        elif op[0] == 'C':
                            d_parts.append(f"C{op[1]:.2f},{op[2]:.2f} {op[3]:.2f},{op[4]:.2f} {op[5]:.2f},{op[6]:.2f}")
                            last_is_move = False
                        elif op[0] == 'Z':
                            d_parts.append("Z")
                            last_is_move = False
                    if not d_parts:
                        continue
                    sp = {
                        'd': ' '.join(d_parts),
                        'type': geom['paint'],
                        'width': 0.5,
                    }
                    if geom.get('spot_name'):
                        sp['spot_name'] = geom['spot_name']
                    spot_paths.append(sp)

                page_info = {
                    'page': page_num + 1,
                    'mediabox_mm': mediabox_mm,
                    'trimbox_mm': trimbox_mm,
                    'trimbox_pt': trimbox_pt,
                    'mediabox_pt': {'w': float(mb_w), 'h': float(mb_h)},
                    'color_spaces': sorted(color_spaces),
                    'elements': elements,
                    'spot_paths': spot_paths,
                }
                pages_info.append(page_info)

            doc.close()

            return Response({'pages': pages_info})


class PdfDeletePageView(APIView):
    """
    PDF oldal törlése.
    POST multipart: pdf (file), page (int, 0-indexed).
    Visszaad: PDF fájl a megadott oldal nélkül.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        pdf_file = request.FILES.get('pdf')
        page_str = request.data.get('page')
        if not pdf_file or page_str is None:
            return Response({'error': 'PDF fájl és oldalszám szükséges'}, status=400)

        try:
            page_idx = int(page_str)
        except (ValueError, TypeError):
            return Response({'error': 'Érvénytelen oldalszám'}, status=400)

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            doc = fitz.open(pdf_path)
            if page_idx < 0 or page_idx >= len(doc):
                doc.close()
                return Response({'error': f'Érvénytelen oldalindex: {page_idx}'}, status=400)

            if len(doc) <= 1:
                doc.close()
                return Response({'error': 'Az utolsó oldal nem törölhető'}, status=400)

            doc.delete_page(page_idx)

            out_path = os.path.join(tmpdir, 'result.pdf')
            doc.save(out_path)
            doc.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="result.pdf"'
                return response


class PdfReorderPagesView(APIView):
    """
    PDF oldalak átrendezése.
    POST multipart: pdf (file), order (JSON) = [2, 0, 1, ...] — az új sorrend 0-indexed.
    Visszaad: átrendezett PDF fájl.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        import json as _json
        pdf_file = request.FILES.get('pdf')
        order_json = request.data.get('order')
        if not pdf_file or not order_json:
            return Response({'error': 'PDF fájl és sorrend szükséges'}, status=400)

        try:
            order = _json.loads(order_json) if isinstance(order_json, str) else order_json
            if not isinstance(order, list):
                raise ValueError
            order = [int(x) for x in order]
        except (ValueError, TypeError):
            return Response({'error': 'Érvénytelen sorrend'}, status=400)

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            src = fitz.open(pdf_path)
            n = len(src)
            if sorted(order) != list(range(n)):
                src.close()
                return Response({'error': f'A sorrend nem tartalmazza az összes oldalt (0..{n-1})'}, status=400)

            src.select(order)

            out_path = os.path.join(tmpdir, 'reordered.pdf')
            src.save(out_path)
            src.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="reordered.pdf"'
                return response


class PdfCropView(APIView):
    """
    PDF croppolás: a megadott CropBox/MediaBox alkalmazása oldalanként.
    POST multipart: pdf (file), crop (JSON) = { x, y, w, h } pontban (pt).
    Visszaad: croppolt PDF fájl.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        import json as _json
        pdf_file = request.FILES.get('pdf')
        crop_json = request.data.get('crop')
        if not pdf_file or not crop_json:
            return Response({'error': 'PDF fájl és crop paraméterek szükségesek'}, status=400)

        try:
            crop = _json.loads(crop_json) if isinstance(crop_json, str) else crop_json
            cx = float(crop['x'])
            cy = float(crop['y'])
            cw = float(crop['w'])
            ch = float(crop['h'])
            crop_page = int(crop.get('page', 0))  # 1-indexed, 0 = all pages
        except (KeyError, ValueError, TypeError):
            return Response({'error': 'Érvénytelen crop paraméterek (x, y, w, h pt-ban)'}, status=400)

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            doc = fitz.open(pdf_path)
            for page in doc:
                # Only crop the specified page (1-indexed), or all if 0
                if crop_page > 0 and page.number != (crop_page - 1):
                    continue
                raw_media = _get_raw_pdf_box(doc, page.xref, 'MediaBox')
                raw_crop = _get_raw_pdf_box(doc, page.xref, 'CropBox') or raw_media
                raw_trim = _get_raw_pdf_box(doc, page.xref, 'TrimBox') or raw_crop
                if not raw_crop or not raw_media:
                    continue

                crop_x0, crop_y0, crop_x1, crop_y1 = raw_crop
                page_w = crop_x1 - crop_x0
                page_h = crop_y1 - crop_y0

                # Clamp crop values relative to the currently visible page area
                # (which matches CropBox / pdf.js page viewport), not MediaBox.
                cx_c = max(0, min(cx, page_w))
                cy_c = max(0, min(cy, page_h))
                cw_c = max(0, min(cw, page_w - cx_c))
                ch_c = max(0, min(ch, page_h - cy_c))
                if cw_c <= 0 or ch_c <= 0:
                    continue

                # Convert top-down coordinates from the visible CropBox space
                # into raw PDF bottom-up coordinates.
                new_x0 = crop_x0 + cx_c
                new_x1 = crop_x0 + cx_c + cw_c
                new_y1 = crop_y1 - cy_c
                new_y0 = crop_y1 - (cy_c + ch_c)

                # Clamp to raw PDF bounds
                media_x0, media_y0, media_x1, media_y1 = raw_media
                new_x0 = max(media_x0, min(media_x1, new_x0))
                new_x1 = max(media_x0, min(media_x1, new_x1))
                new_y0 = max(media_y0, min(media_y1, new_y0))
                new_y1 = max(media_y0, min(media_y1, new_y1))

                if new_x1 <= new_x0 or new_y1 <= new_y0:
                    continue

                xref = page.xref
                cropped_arr = "[%g %g %g %g]" % (new_x0, new_y0, new_x1, new_y1)
                doc.xref_set_key(xref, "MediaBox", cropped_arr)
                doc.xref_set_key(xref, "CropBox", cropped_arr)

                # TrimBox rule:
                # - if crop fully contains the original TrimBox, keep the original TrimBox
                # - otherwise shrink TrimBox to the crop/intersection area
                # This keeps TrimBox stable when cropping larger/equal than the old trim,
                # and moves it to the crop area when the crop is smaller.
                trim_x0, trim_y0, trim_x1, trim_y1 = raw_trim
                crop_contains_trim = (
                    new_x0 <= trim_x0 <= trim_x1 <= new_x1 and
                    new_y0 <= trim_y0 <= trim_y1 <= new_y1
                )
                if crop_contains_trim:
                    final_trim = (trim_x0, trim_y0, trim_x1, trim_y1)
                else:
                    inter_x0 = max(new_x0, trim_x0)
                    inter_y0 = max(new_y0, trim_y0)
                    inter_x1 = min(new_x1, trim_x1)
                    inter_y1 = min(new_y1, trim_y1)
                    if inter_x1 > inter_x0 and inter_y1 > inter_y0:
                        final_trim = (inter_x0, inter_y0, inter_x1, inter_y1)
                    else:
                        final_trim = (new_x0, new_y0, new_x1, new_y1)

                trim_arr = "[%g %g %g %g]" % final_trim
                doc.xref_set_key(xref, "TrimBox", trim_arr)

            out_path = os.path.join(tmpdir, 'cropped.pdf')
            doc.save(out_path)
            doc.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="cropped.pdf"'
                return response


class PdfMergeView(APIView):
    """
    Több PDF összefűzése egyetlen PDF-fé.
    POST multipart: pdfs (file[]) — több fájl.
    Visszaad: összefűzött PDF fájl.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist('pdfs')
        if not files:
            return Response({'error': 'Legalább 1 PDF fájl szükséges'}, status=400)

        if len(files) > 50:
            return Response({'error': 'Maximum 50 PDF fűzhető össze'}, status=400)

        # Single file: return it directly without merging
        if len(files) == 1:
            from django.http import HttpResponse
            response = HttpResponse(files[0].read(), content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="merged.pdf"'
            return response

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            merged = fitz.open()

            for idx, pdf_file in enumerate(files):
                if pdf_file.size > 50 * 1024 * 1024:
                    merged.close()
                    return Response({'error': f'A(z) {idx+1}. fájl túl nagy (max 50 MB)'}, status=400)

                path = os.path.join(tmpdir, f'input_{idx}.pdf')
                with open(path, 'wb') as f:
                    for chunk in pdf_file.chunks():
                        f.write(chunk)
                try:
                    src = fitz.open(path)
                    if src.is_encrypted:
                        # Try opening without password (some PDFs have empty passwords)
                        if not src.authenticate(''):
                            src.close()
                            merged.close()
                            return Response({'error': f'A(z) {idx+1}. fájl titkosított (jelszóval védett)'}, status=400)
                    merged.insert_pdf(src)
                    src.close()
                except Exception as e:
                    err_msg = str(e)
                    merged.close()
                    return Response({'error': f'A(z) {idx+1}. fájl nem megnyitható: {err_msg}'}, status=400)

            out_path = os.path.join(tmpdir, 'merged.pdf')
            merged.save(out_path)
            merged.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="merged.pdf"'
                return response


class PdfExportView(APIView):
    """
    PDF export: croppolás + guideline-ok mentése annotációként.
    A fő cél: az eredeti PDF megmarad, a színterek nem változnak.
    POST multipart: pdf (file), options (JSON).
    options = {
      crop?: { x, y, w, h },  // pt koordináták
      pages?: number[],        // oldalszámok szűrése (1-based)
      guidelines?: [{ orientation, position, page }],
    }
    Visszaad: exportált PDF fájl.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        import json as _json
        pdf_file = request.FILES.get('pdf')
        if not pdf_file:
            return Response({'error': 'PDF fájl szükséges'}, status=400)

        options_raw = request.data.get('options', '{}')
        try:
            options = _json.loads(options_raw) if isinstance(options_raw, str) else options_raw
        except (ValueError, TypeError):
            options = {}

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            doc = fitz.open(pdf_path)

            # Page selection
            selected_pages = options.get('pages')
            if selected_pages:
                # Keep only selected pages (1-based)
                keep = sorted(set(int(p) - 1 for p in selected_pages if 1 <= int(p) <= doc.page_count))
                remove = [i for i in range(doc.page_count) if i not in keep]
                for idx in reversed(remove):
                    doc.delete_page(idx)

            # Crop
            crop = options.get('crop')
            if crop:
                try:
                    cx = float(crop['x'])
                    cy = float(crop['y'])
                    cw = float(crop['w'])
                    ch = float(crop['h'])
                    crop_rect = fitz.Rect(cx, cy, cx + cw, cy + ch)
                    for page in doc:
                        page.set_cropbox(crop_rect)
                except (KeyError, ValueError):
                    pass

            # Draw guidelines as thin lines into the PDF
            guidelines = options.get('guidelines', [])
            for gl in guidelines:
                orientation = gl.get('orientation')  # 'h' or 'v'
                pos = float(gl.get('position', 0))   # pt from top/left of page
                gl_page = int(gl.get('page', 0)) - 1
                if 0 <= gl_page < doc.page_count:
                    page = doc[gl_page]
                    mb = page.mediabox
                    shape = page.new_shape()
                    if orientation == 'h':
                        shape.draw_line(fitz.Point(mb.x0, pos), fitz.Point(mb.x1, pos))
                    else:
                        shape.draw_line(fitz.Point(pos, mb.y0), fitz.Point(pos, mb.y1))
                    shape.finish(color=(0, 0.75, 1), width=0.5, dashes="[2 2]")
                    shape.commit()

            # ── Overlay images ─────────────────────────────────────────────────
            import base64 as _base64

            def _hex_to_rgb(h):
                h = h.lstrip('#')
                if len(h) == 3:
                    h = h[0]*2 + h[1]*2 + h[2]*2
                return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)

            overlay_images = options.get('overlayImages', [])
            for img_data in sorted(overlay_images, key=lambda i: (i.get('page', 1), i.get('zIndex', 0))):
                try:
                    page_num = int(img_data.get('page', 1)) - 1
                    if not (0 <= page_num < doc.page_count):
                        continue
                    page = doc[page_num]
                    mb = page.mediabox
                    pw, ph = mb.width, mb.height

                    x = float(img_data.get('x', 0))
                    y = float(img_data.get('y', 0))
                    w = float(img_data.get('w', 0))
                    h = float(img_data.get('h', 0))
                    rotation = float(img_data.get('rotation', 0))

                    # Decode base64 data URL
                    src = img_data.get('src', '')
                    if not src:
                        continue
                    if ',' in src:
                        src = src.split(',', 1)[1]
                    img_bytes = _base64.b64decode(src)

                    # Build rect in pt
                    x0 = x * pw + mb.x0
                    y0 = y * ph + mb.y0
                    x1 = (x + w) * pw + mb.x0
                    y1 = (y + h) * ph + mb.y0

                    rotation_norm = rotation % 360

                    if rotation_norm == 0:
                        page.insert_image(fitz.Rect(x0, y0, x1, y1), stream=img_bytes)
                    elif rotation_norm % 90 == 0:
                        # PyMuPDF native rotation (multiples of 90)
                        page.insert_image(fitz.Rect(x0, y0, x1, y1), stream=img_bytes, rotate=int(rotation_norm))
                    else:
                        # Arbitrary rotation: pre-rotate image using PIL, adjust bounding rect
                        import math as _math
                        import io as _io
                        from PIL import Image as _PILImage

                        img_pil = _PILImage.open(_io.BytesIO(img_bytes)).convert('RGBA')
                        orig_w_pt = w * pw
                        orig_h_pt = h * ph
                        cx = (x + w / 2) * pw + mb.x0
                        cy = (y + h / 2) * ph + mb.y0

                        # Resize to match the rect aspect ratio before rotating
                        target_w = max(img_pil.width, 600)
                        target_h = round(target_w * orig_h_pt / orig_w_pt) if orig_w_pt > 0 else max(img_pil.height, 600)
                        resized = img_pil.resize((target_w, target_h), _PILImage.LANCZOS)

                        # PIL rotates counterclockwise, CSS clockwise → negate angle
                        rotated = resized.rotate(-rotation_norm, expand=True, resample=_PILImage.BICUBIC)
                        _buf = _io.BytesIO()
                        rotated.save(_buf, format='PNG')
                        rot_bytes = _buf.getvalue()

                        # Compute bounding box of the rotated rect (same formula as CSS)
                        rad = _math.radians(rotation_norm)
                        cos_a = abs(_math.cos(rad))
                        sin_a = abs(_math.sin(rad))
                        new_w_pt = orig_w_pt * cos_a + orig_h_pt * sin_a
                        new_h_pt = orig_w_pt * sin_a + orig_h_pt * cos_a

                        new_rect = fitz.Rect(
                            cx - new_w_pt / 2, cy - new_h_pt / 2,
                            cx + new_w_pt / 2, cy + new_h_pt / 2,
                        )
                        page.insert_image(new_rect, stream=rot_bytes)
                except Exception as _exc:
                    import logging as _log
                    _log.getLogger(__name__).error(f'[pdf-export] overlay image error: {_exc}', exc_info=True)

            # ── Overlay texts ──────────────────────────────────────────────────
            # Font name mapping: family + bold + italic → PyMuPDF built-in font name
            _FONT_MAP = {
                # (base, bold, italic) → fontname
                ('he', False, False): 'helv',
                ('he', True,  False): 'hebo',
                ('he', False, True):  'heit',
                ('he', True,  True):  'hebi',
                ('ti', False, False): 'tiro',
                ('ti', True,  False): 'tibo',
                ('ti', False, True):  'tiit',
                ('ti', True,  True):  'tibi',
                ('co', False, False): 'cour',
                ('co', True,  False): 'cobo',
                ('co', False, True):  'coit',
                ('co', True,  True):  'cobi',
            }
            _ALIGN_MAP = {'left': 0, 'center': 1, 'right': 2}

            # Prefer DejaVu for Unicode support (Hungarian chars)
            _DEJAVU_FONTS = {
                (False, False): '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                (True,  False): '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                (False, True):  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  # no oblique variant
                (True,  True):  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            }

            overlay_texts = options.get('overlayTexts', [])
            for txt_data in sorted(overlay_texts, key=lambda t: (t.get('page', 1), t.get('zIndex', 0))):
                try:
                    page_num = int(txt_data.get('page', 1)) - 1
                    if not (0 <= page_num < doc.page_count):
                        continue
                    page = doc[page_num]
                    mb = page.mediabox
                    pw, ph = mb.width, mb.height

                    x = float(txt_data.get('x', 0))
                    y = float(txt_data.get('y', 0))
                    w = float(txt_data.get('w', 0.4))
                    content = txt_data.get('content', '')
                    font_size_px = float(txt_data.get('fontSize', 22))
                    page_css_px_w = float(txt_data.get('pageCssPxWidth', 0))
                    color_hex = txt_data.get('color', '#000000')
                    family = txt_data.get('fontFamily', 'Arial').lower()
                    bold = bool(txt_data.get('bold', False))
                    italic = bool(txt_data.get('italic', False))
                    align_str = txt_data.get('align', 'left')

                    # Convert fontSize (CSS px at zoom=1) → PDF pt
                    # Formula: fontSize_pt = fontSize_px * pageWidthPt / pageWidthCssPx
                    # Fallback: standard CSS 1px = 0.75pt (96dpi)
                    if page_css_px_w > 0:
                        font_size_pt = font_size_px * pw / page_css_px_w
                    else:
                        font_size_pt = font_size_px * 0.75

                    # Build rect in pt (height = rest of page)
                    x0 = x * pw + mb.x0
                    y0 = y * ph + mb.y0
                    x1 = (x + w) * pw + mb.x0
                    y1 = ph + mb.y0  # extend to bottom of page
                    rect = fitz.Rect(x0, y0, x1, y1)

                    color = _hex_to_rgb(color_hex)
                    align = _ALIGN_MAP.get(align_str, 0)

                    # Try DejaVu TrueType for Unicode support
                    font_path = _DEJAVU_FONTS.get((bold, italic))
                    inserted = False
                    if font_path and os.path.exists(font_path):
                        try:
                            font = fitz.Font(fontfile=font_path)
                            page.insert_textbox(rect, content, fontsize=font_size_pt,
                                                font=font, color=color, align=align)
                            inserted = True
                        except Exception:
                            pass

                    if not inserted:
                        # Fallback: built-in PDF font
                        if 'times' in family or 'georgia' in family:
                            base = 'ti'
                        elif 'cour' in family or 'mono' in family:
                            base = 'co'
                        else:
                            base = 'he'
                        fontname = _FONT_MAP.get((base, bold, italic), 'helv')
                        page.insert_textbox(rect, content, fontsize=font_size_pt,
                                            fontname=fontname, color=color, align=align)
                except Exception:
                    pass  # skip broken text overlays

            out_path = os.path.join(tmpdir, 'export.pdf')
            doc.save(out_path)
            doc.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="export.pdf"'
                return response


class PrintTemplateCategoryViewSet(viewsets.ModelViewSet):
    queryset = PrintTemplateCategory.objects.all()
    serializer_class = PrintTemplateCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only') == 'true':
            qs = qs.filter(templates__is_active=True).distinct()
        return qs


class PrintTemplateViewSet(viewsets.ModelViewSet):
    queryset = PrintTemplate.objects.select_related('category', 'created_by').all()
    serializer_class = PrintTemplateSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        active = self.request.query_params.get('is_active')
        if active is not None:
            qs = qs.filter(is_active=active.lower() == 'true')
        return qs

    def _generate_thumbnail(self, instance):
        """Auto-generate a thumbnail from the uploaded file (PDF or SVG)."""
        import io
        from PIL import Image as PILImage
        from django.core.files.base import ContentFile

        try:
            if instance.file_type == 'pdf':
                import fitz
                doc = fitz.open(stream=instance.file.read(), filetype='pdf')
                instance.file.seek(0)
                page = doc[0]
                # Render at 2x for quality, max 400px wide
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                img = PILImage.frombytes('RGB', [pix.width, pix.height], pix.samples)
                doc.close()
            elif instance.file_type == 'svg':
                import cairosvg
                png_data = cairosvg.svg2png(
                    file_obj=instance.file,
                    output_width=400,
                )
                instance.file.seek(0)
                img = PILImage.open(io.BytesIO(png_data))
            else:
                return

            # Resize to max 400px on the longest side
            max_dim = 400
            ratio = min(max_dim / img.width, max_dim / img.height, 1)
            if ratio < 1:
                img = img.resize((int(img.width * ratio), int(img.height * ratio)), PILImage.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format='PNG', optimize=True)
            buf.seek(0)

            thumb_name = f"thumb_{instance.pk}.png"
            instance.thumbnail.save(thumb_name, ContentFile(buf.read()), save=True)
        except Exception:
            pass  # Thumbnail generation is best-effort

    def perform_create(self, serializer):
        file = self.request.FILES.get('file')
        file_type = 'pdf'
        if file:
            ext = os.path.splitext(file.name)[1].lower()
            file_type = 'svg' if ext == '.svg' else 'pdf'
        instance = serializer.save(
            created_by=self.request.user,
            file_type=file_type,
        )
        if not instance.thumbnail and instance.file:
            self._generate_thumbnail(instance)

    def perform_update(self, serializer):
        file = self.request.FILES.get('file')
        extra = {}
        if file:
            ext = os.path.splitext(file.name)[1].lower()
            extra['file_type'] = 'svg' if ext == '.svg' else 'pdf'
        instance = serializer.save(**extra)
        # Regenerate thumbnail if file changed and no manual thumbnail provided
        if file and not self.request.FILES.get('thumbnail'):
            self._generate_thumbnail(instance)


class MachineViewSet(viewsets.ModelViewSet):
    """Gép (nyomtató/feldolgozó berendezés) kezelés."""
    permission_classes = [IsAuthenticated]
    serializer_class = MachineSerializer

    def get_queryset(self):
        qs = Machine.objects.all()
        tech = self.request.query_params.get('tech_type')
        if tech:
            qs = qs.filter(tech_type=tech)
        active = self.request.query_params.get('active')
        if active == '1':
            qs = qs.filter(is_active=True)
        return qs

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsAuthenticated()]  # staff check a serializer szinten elegendő


class UVCalculatorViewSet(viewsets.ViewSet):
    """UV flatbed / UV tekercses nyomtatás árkalkulátor."""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'], url_path='calculate')
    def calculate(self, request):
        """
        UV nyomtatás árkalkuláció.

        Bemenet (JSON):
          machine_id        int      kötelező
          material_id       int      opcionális
          width_mm          float    termék szélessége mm
          height_mm         float    termék magassága mm
          quantity          int      darabszám
          bleed_mm          float    vérzés (default 0)
          margin_pct        float    fedezet % (default 0)
          finishing_service_ids  [int]  utómunka szolgáltatás ID-k

        Kimenet: részletes breakdown + elrendezés + maradék előnézet
        """
        from decimal import Decimal, ROUND_HALF_UP
        from apps.printshop.cutting_optimizer import (
            optimize_sheet_cut, optimize_roll_cut,
            sheets_needed_for_quantity, roll_length_needed_mm,
        )
        from apps.warehouse.models import Material as WarehouseMaterial

        d = request.data
        try:
            machine_id = d.get('machine_id')
            material_id = d.get('material_id')
            prod_w_mm = float(d.get('width_mm', 0))
            prod_h_mm = float(d.get('height_mm', 0))
            quantity = max(1, int(d.get('quantity', 1)))
            bleed_mm = float(d.get('bleed_mm', 0))
            margin_pct = Decimal(str(d.get('margin_pct', 0)))
            finishing_service_ids = d.get('finishing_service_ids') or []

            if not machine_id:
                return Response({'error': 'machine_id kötelező'}, status=400)
            if prod_w_mm <= 0 or prod_h_mm <= 0:
                return Response({'error': 'Érvényes width_mm és height_mm szükséges'}, status=400)

            machine = Machine.objects.get(id=machine_id)

            # ── Alapanyag adatok ─────────────────────────────────────────────
            mat_cost_per_m2 = Decimal('0')
            mat_w_mm = mat_h_mm = roll_width_mm = None
            mat_name = ''
            mat_format = 'sheet'

            if material_id:
                mat = WarehouseMaterial.objects.get(id=material_id)
                mat_name = mat.name
                mat_format = mat.material_format or 'sheet'
                _mult = {'mm': 1, 'cm': 10, 'm': 1000}.get(mat.dimension_unit or 'mm', 1)
                if mat.width:
                    mat_w_mm = float(mat.width) * _mult
                if mat.length:
                    mat_h_mm = float(mat.length) * _mult
                if mat.roll_width:
                    roll_width_mm = float(mat.roll_width) * _mult

                cost_price = float(mat.unit_cost_price or 0)
                unit = mat.unit
                eff_roll_w = roll_width_mm or mat_w_mm
                if unit == 'm2':
                    mat_cost_per_m2 = Decimal(str(cost_price))
                elif unit == 'm' and eff_roll_w:
                    mat_cost_per_m2 = Decimal(str(cost_price / (eff_roll_w / 1000)))
                elif unit == 'db' and mat_w_mm and mat_h_mm:
                    area = (mat_w_mm / 1000) * (mat_h_mm / 1000)
                    mat_cost_per_m2 = Decimal(str(cost_price / area)) if area else Decimal('0')

            # ── Elrendezés optimalizálás ─────────────────────────────────────
            is_roll = (mat_format in ('roll',)) or (machine.tech_type == 'uv_roll')
            sheets_needed = 0
            roll_length_mm_total = 0.0
            remnant_preview = []
            layout_info = {}

            if is_roll:
                rw = roll_width_mm or mat_w_mm or (
                    float(machine.max_width_mm) if machine.max_width_mm else None)
                if rw:
                    roll_info = optimize_roll_cut(rw, prod_w_mm, prod_h_mm, bleed_mm)
                    roll_length_mm_total = roll_length_needed_mm(
                        roll_info['cols'], roll_info['length_per_row_mm'], quantity)
                    layout_info = roll_info
                    if roll_info['side_remnant_mm'] >= 10:
                        remnant_preview = [{
                            'width_mm': roll_info['side_remnant_mm'],
                            'height_mm': None,
                            'type': 'roll_side_strip',
                            'note': 'Oldalsáv maradék (tekercs)',
                        }]
            else:
                # Táblás
                if mat_w_mm and mat_h_mm:
                    sheet_info = optimize_sheet_cut(
                        mat_w_mm, mat_h_mm, prod_w_mm, prod_h_mm, bleed_mm)
                    fit = sheet_info['fit_count']
                    sheets_needed = sheets_needed_for_quantity(fit, quantity) if fit > 0 else quantity
                    layout_info = sheet_info
                    remnant_preview = [
                        {**r, 'type': 'sheet_remnant', 'note': 'Guillotine maradék'}
                        for r in sheet_info['remnants']
                    ]
                else:
                    sheets_needed = quantity

            # ── Költségszámítás ──────────────────────────────────────────────
            prod_area_m2 = Decimal(str((prod_w_mm / 1000) * (prod_h_mm / 1000)))

            # 1) Anyagköltség
            if is_roll and roll_length_mm_total:
                eff_rw = Decimal(str(roll_width_mm or mat_w_mm or prod_w_mm))
                roll_area_m2 = (eff_rw / 1000) * Decimal(str(roll_length_mm_total / 1000))
                material_cost = roll_area_m2 * mat_cost_per_m2
            elif sheets_needed and mat_w_mm and mat_h_mm:
                sheet_area_m2 = Decimal(str((mat_w_mm / 1000) * (mat_h_mm / 1000)))
                material_cost = sheet_area_m2 * mat_cost_per_m2 * Decimal(str(sheets_needed))
            else:
                material_cost = prod_area_m2 * mat_cost_per_m2 * Decimal(str(quantity))

            # 2) Nyomtatási költség (gép print_cost_per_m2 × nyomtatott terület)
            total_print_area_m2 = prod_area_m2 * Decimal(str(quantity))
            print_cost = total_print_area_m2 * Decimal(str(machine.print_cost_per_m2 or 0))

            # 3) Beállítási (setup) rezsi
            setup_cost = (
                Decimal(str(machine.hourly_cost or 0))
                * Decimal(str(machine.setup_time_min or 0))
                / Decimal('60')
            )

            # 4) Utómunka szolgáltatások
            service_cost = Decimal('0')
            service_breakdown = []
            if finishing_service_ids:
                from apps.manufacturing.models import Service
                services = Service.objects.filter(id__in=finishing_service_ids)
                for svc in services:
                    ptype = svc.pricing_type or 'per_sheet'
                    cap = Decimal(str(svc.capacity or 1)) if svc.capacity else Decimal('1')
                    svc_total = Decimal('0')
                    if ptype == 'per_job':
                        svc_total = (Decimal(str(svc.setup_cost_selling or 0))
                                     + Decimal(str(svc.unit_cost_selling or 0)))
                    elif ptype == 'per_cut':
                        cuts = (Decimal(str(quantity)) / cap).to_integral_value(rounding='ROUND_CEILING')
                        svc_total = (Decimal(str(svc.setup_cost_selling or 0))
                                     + Decimal(str(svc.unit_cost_selling or 0)) * cuts)
                    else:  # per_sheet / per_piece
                        svc_total = (Decimal(str(svc.setup_cost_selling or 0))
                                     + Decimal(str(svc.unit_cost_selling or 0)) * Decimal(str(quantity)))
                    service_cost += svc_total
                    service_breakdown.append({
                        'id': svc.id, 'name': svc.name,
                        'pricing_type': ptype, 'total': float(svc_total.quantize(Decimal('0.01'))),
                    })

            subtotal = material_cost + print_cost + setup_cost + service_cost
            margin_mult = Decimal('1') + margin_pct / Decimal('100')
            total = (subtotal * margin_mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            unit_price = (total / Decimal(str(quantity))).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

            return Response({
                'machine': {
                    'id': machine.id,
                    'name': str(machine),
                    'tech_type': machine.tech_type,
                },
                'material': {
                    'name': mat_name,
                    'format': mat_format,
                    'cost_per_m2': float(mat_cost_per_m2),
                },
                'layout': layout_info,
                'sheets_needed': sheets_needed if not is_roll else None,
                'roll_length_mm': roll_length_mm_total if is_roll else None,
                'remnant_preview': remnant_preview,
                'cost_breakdown': {
                    'material_cost': float(material_cost.quantize(Decimal('0.01'))),
                    'print_cost': float(print_cost.quantize(Decimal('0.01'))),
                    'setup_cost': float(setup_cost.quantize(Decimal('0.01'))),
                    'service_cost': float(service_cost.quantize(Decimal('0.01'))),
                    'subtotal': float(subtotal.quantize(Decimal('0.01'))),
                    'margin_pct': float(margin_pct),
                    'total': float(total),
                    'unit_price': float(unit_price),
                    'quantity': quantity,
                },
                'service_breakdown': service_breakdown,
            })

        except Machine.DoesNotExist:
            return Response({'error': 'Gép nem található'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=400)
