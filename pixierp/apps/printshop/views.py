from decimal import Decimal, ROUND_HALF_UP
import os
import re
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
                selected_service_ids=d.get('selected_service_ids') or [],
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
            print_sides    = max(0, min(2, int(d.get('print_sides', 1))))
            print_service_id_1 = d.get('print_service_id_1') or d.get('print_service_id')
            print_service_id_2 = d.get('print_service_id_2') if print_sides == 2 else None
            sheet_w_mm     = float(d.get('sheet_w_mm', 330))
            sheet_h_mm     = float(d.get('sheet_h_mm', 487))
            bleed_mm       = float(d.get('bleed_mm', 3))
            margin_pct     = Decimal(str(d.get('margin_pct', 35)))
            extra_svc_ids  = d.get('selected_service_ids') or []
            material_id    = d.get('material_id')
            force_rotate   = d.get('force_rotate')   # None=auto, True=force rotated, False=force normal
            fix_cost_first_side_only = bool(d.get('fix_cost_first_side_only', False))
            cutting_mode   = d.get('cutting_mode', 'auto')  # auto | material | print

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
            sheets_needed   = _math.ceil(quantity / items_per_sheet)
            if print_sides == 2 and sheets_needed % 2 != 0:
                sheets_needed += 1
            clicks_total = sheets_needed * print_sides

            # ── Production layout: full sheets vs partial sheet ───────────────
            total_slots = sheets_needed * items_per_sheet
            remaining_on_last = quantity % items_per_sheet  # 0 means full
            if remaining_on_last == 0:
                full_sheets = sheets_needed
                partial_sheet_items = 0
            else:
                full_sheets = sheets_needed - 1
                partial_sheet_items = remaining_on_last
            partial_coverage_pct = round(partial_sheet_items / items_per_sheet * 100, 1) if partial_sheet_items > 0 else 0
            waste_items = total_slots - quantity  # unused slots

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
                        ctype = ci.calculation_type
                        if ctype == 'fixed':
                            amt = price
                            items.append({
                                'name': ci.name,
                                'type': 'fixed',
                                'price_per': float(price),
                                'units': 1,
                                'total': float(amt.quantize(Decimal('0.01'))),
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
                            if fix_cost_first_side_only:
                                # Remove fixed cost items from side 2
                                items = [i for i in items if i['type'] != 'fixed']
                                c = sum(Decimal(str(i['total'])) for i in items)
                            print_cost_side2 = c
                            print_service_items_2 = items
                        except Service.DoesNotExist:
                            pass
                    elif print_service_id_1:
                        # Same service for both sides
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
                    material_items = [{
                        'name': mat.name,
                        'type': 'click',
                        'price_per': float(price_per_sheet.quantize(Decimal('0.01'))),
                        'units': sheets_needed,
                        'total': float(material_cost),
                    }]

                    # ── Size comparison ────────────────────────────────────
                    def _calc_size_cost(sz_w_mm, sz_h_mm, sz_price, sz_label):
                        """Calculate material cost for a given size variant."""
                        _sw, _sh = sheet_w_mm, sheet_h_mm
                        _needs_cut = False
                        _mat_per_raw = 1

                        if svc_max_w and svc_max_h:
                            if sz_w_mm > svc_max_w or sz_h_mm > svc_max_h:
                                _needs_cut = True
                                _sw = min(sz_w_mm, svc_max_w)
                                _sh = min(sz_h_mm, svc_max_h)
                            else:
                                _sw = min(sz_w_mm, svc_max_w)
                                _sh = min(sz_h_mm, svc_max_h)

                        if _needs_cut:
                            sx_n = max(1, int(sz_w_mm / _sw))
                            sy_n = max(1, int(sz_h_mm / _sh))
                            sx_r = max(1, int(sz_w_mm / _sh))
                            sy_r = max(1, int(sz_h_mm / _sw))
                            _mat_per_raw = max(sx_n * sy_n, sx_r * sy_r)

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
                        _p = float(ms.effective_price or 0)
                        _lbl = ms.name or f'{round(_w)}×{round(_l)} mm'
                        entry = _calc_size_cost(_w, _l, _p, _lbl)
                        if entry:
                            entry['is_default'] = False
                            entry['size_id'] = ms.id
                            size_comparison.append(entry)

                    # Sort by material cost, mark the best
                    if size_comparison:
                        size_comparison.sort(key=lambda x: x['material_cost'])
                        size_comparison[0]['is_best'] = True

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


class PdfAnalyzeView(APIView):
    """
    PDF elemzés PyMuPDF-fel: TrimBox + színrendszerek oldalanként.
    POST multipart: pdf (file)
    Visszaad: { pages: [ { page, mediabox_mm, trimbox_mm, color_spaces } ] }
    """
    permission_classes = [IsAuthenticated]
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

                mediabox_mm = {
                    'width': round(mb.width * self.PT_TO_MM, 1),
                    'height': round(mb.height * self.PT_TO_MM, 1),
                }

                # TrimBox extraction
                trimbox_mm = None
                trimbox_pt = None
                try:
                    tb = page.trimbox
                    if tb and (tb.width > 0 and tb.height > 0):
                        # Only report TrimBox if it differs from MediaBox
                        if (abs(tb.width - mb.width) > 0.5 or abs(tb.height - mb.height) > 0.5
                                or abs(tb.x0 - mb.x0) > 0.5 or abs(tb.y0 - mb.y0) > 0.5):
                            trimbox_mm = {
                                'x': round((tb.x0 - mb.x0) * self.PT_TO_MM, 1),
                                'y': round((mb.y1 - tb.y1) * self.PT_TO_MM, 1),
                                'width': round(tb.width * self.PT_TO_MM, 1),
                                'height': round(tb.height * self.PT_TO_MM, 1),
                            }
                            trimbox_pt = {
                                'x': round(tb.x0 - mb.x0, 2),
                                'y': round(mb.y1 - tb.y1, 2),
                                'w': round(tb.width, 2),
                                'h': round(tb.height, 2),
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

                # Parse raw page content stream for color operators and color spaces
                try:
                    xref = page.xref
                    raw_stream = doc.xref_stream(xref) or b""
                    raw_text_page = raw_stream.decode("latin-1", errors="replace")

                    # PDF color operators
                    if " k " in raw_text_page or " K " in raw_text_page or "\nk " in raw_text_page or "\nK " in raw_text_page:
                        color_spaces.add("CMYK")
                    if " rg " in raw_text_page or " RG " in raw_text_page or "\nrg " in raw_text_page or "\nRG " in raw_text_page:
                        color_spaces.add("RGB")
                    if " g " in raw_text_page or " G " in raw_text_page or "\ng " in raw_text_page or "\nG " in raw_text_page:
                        color_spaces.add("Gray")
                except Exception:
                    pass

                # Check page resources for color space definitions
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
                        if "/ICCBased" in res_text:
                            color_spaces.add("CMYK")
                        if "/Separation" in res_text:
                            color_spaces.add("Spot")
                        # Scan for Pantone
                        if re.search(r'(?i)pantone', res_text):
                            color_spaces.add("PANTONE")
                except Exception:
                    pass

                # Also scan all xrefs in the document for Separation/Pantone color spaces
                # (do once, applies to all pages — but we include in every page for simplicity)
                if page_num == 0:
                    try:
                        for x in range(1, doc.xref_length()):
                            obj_text = doc.xref_object(x)
                            if obj_text and "/Separation" in obj_text:
                                color_spaces.add("Spot")
                                if re.search(r'(?i)pantone', obj_text):
                                    color_spaces.add("PANTONE")
                            if obj_text and "/DeviceCMYK" in obj_text:
                                color_spaces.add("CMYK")
                    except Exception:
                        pass
                    # Store doc-level color info for subsequent pages
                    doc_colors = set(color_spaces)
                else:
                    color_spaces.update(doc_colors)

                # ── Extract page elements (images, text blocks, drawings) ──
                elements = []
                mb_w = mb.width
                mb_h = mb.height

                # Images
                try:
                    for img in page.get_images(full=True):
                        xref = img[0]
                        try:
                            # Use Pixmap for definitive colorspace detection
                            pix = fitz.Pixmap(doc, xref)
                            if pix.colorspace:
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
                            elements.append({
                                'type': 'image',
                                'x': round(r.x0 / mb_w, 4),
                                'y': round(r.y0 / mb_h, 4),
                                'w': round(r.width / mb_w, 4),
                                'h': round(r.height / mb_h, 4),
                                'colorspace': el_cs,
                                'width_px': w_px,
                                'height_px': h_px,
                            })
                except Exception:
                    pass

                # Text blocks
                try:
                    text_dict = page.get_text("dict", flags=0)
                    for block in text_dict.get("blocks", []):
                        if block.get("type") == 0:  # text block
                            bbox = block.get("bbox", [0, 0, 0, 0])
                            # Detect font color from first span
                            font_color = None
                            font_name = ""
                            font_size = 0
                            text_content = ""
                            for line in block.get("lines", []):
                                for span in line.get("spans", []):
                                    if not font_name:
                                        font_name = span.get("font", "")
                                        font_size = round(span.get("size", 0), 1)
                                        raw_color = span.get("color", 0)
                                        # color is an integer in PyMuPDF
                                        if isinstance(raw_color, int):
                                            r = (raw_color >> 16) & 0xFF
                                            g = (raw_color >> 8) & 0xFF
                                            b = raw_color & 0xFF
                                            font_color = f"#{r:02x}{g:02x}{b:02x}"
                                    text_content += span.get("text", "")
                            bw = bbox[2] - bbox[0]
                            bh = bbox[3] - bbox[1]
                            if bw > 0 and bh > 0 and text_content.strip():
                                elements.append({
                                    'type': 'text',
                                    'x': round(bbox[0] / mb_w, 4),
                                    'y': round(bbox[1] / mb_h, 4),
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
                    # Group nearby drawings into clusters
                    if drawings:
                        all_rects = []
                        for d in drawings:
                            r = d.get("rect")
                            if r and r.width > 0 and r.height > 0:
                                fill_cs = None
                                stroke_cs = None
                                fill = d.get("fill")
                                stroke_col = d.get("color")
                                if fill and len(fill) == 4:
                                    fill_cs = "CMYK"
                                elif fill and len(fill) == 3:
                                    fill_cs = "RGB"
                                elif fill and len(fill) == 1:
                                    fill_cs = "Gray"
                                if stroke_col and len(stroke_col) == 4:
                                    stroke_cs = "CMYK"
                                elif stroke_col and len(stroke_col) == 3:
                                    stroke_cs = "RGB"
                                elif stroke_col and len(stroke_col) == 1:
                                    stroke_cs = "Gray"
                                all_rects.append({
                                    'rect': r,
                                    'cs': fill_cs or stroke_cs or "Ismeretlen",
                                })
                        # Merge overlapping vector rects into groups
                        merged = []
                        for vr in all_rects:
                            r = vr['rect']
                            found = False
                            for m in merged:
                                if r.intersects(m['rect']):
                                    m['rect'] = m['rect'] | r  # union
                                    if vr['cs'] != "Ismeretlen":
                                        m['cs'] = vr['cs']
                                    found = True
                                    break
                            if not found:
                                merged.append({'rect': fitz.Rect(r), 'cs': vr['cs']})
                        for m in merged:
                            r = m['rect']
                            elements.append({
                                'type': 'vector',
                                'x': round(r.x0 / mb_w, 4),
                                'y': round(r.y0 / mb_h, 4),
                                'w': round(r.width / mb_w, 4),
                                'h': round(r.height / mb_h, 4),
                                'colorspace': m['cs'],
                            })
                except Exception:
                    pass

                page_info = {
                    'page': page_num + 1,
                    'mediabox_mm': mediabox_mm,
                    'trimbox_mm': trimbox_mm,
                    'trimbox_pt': trimbox_pt,
                    'color_spaces': sorted(color_spaces),
                    'elements': elements,
                }
                pages_info.append(page_info)

            doc.close()

            return Response({'pages': pages_info})
